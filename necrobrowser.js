/*
  NecroBrowser - necromantic session control for all your needs

  Note: To start NecroBrowser with verbose cluster internals logging:
  DEBUG='puppeteer-cluster:*' node necrobrowser.js
 */

const express = require('express');
const app = express();
const puppeteer = require('puppeteer-extra')
const StealthPlugin = require('puppeteer-extra-plugin-stealth')
const logger = require('morgan');
const c = require('chalk');
const log = require('./lib/logger');
const validation = require('./lib/validation');

// ============================================================================
// Global Panic Handlers - Prevent crashes from uncaught errors
// ============================================================================

process.on('uncaughtException', (error) => {
    log.LogError('UNCAUGHT EXCEPTION - PANIC HANDLER ENGAGED', {
        'Error': error.message,
        'Stack': error.stack,
        'Time': new Date().toISOString()
    });
    console.error(c.red('NecroBrowser will attempt to continue operation...\n'));
});

process.on('unhandledRejection', (reason, promise) => {
    log.LogError('UNHANDLED REJECTION - PANIC HANDLER ENGAGED', {
        'Reason': reason,
        'Promise': promise,
        'Time': new Date().toISOString()
    });
    console.error(c.red('NecroBrowser will attempt to continue operation...\n'));
});

(async () => {
    const clusterLib = require('./puppeteer/cluster')
    const helper = require('./tasks/helpers/necrohelp')
    const loader = require('./tasks/loader')
    const db = require('./db/db')

    // parse toml config file
    let cfg = clusterLib.ParseConfig()

    let banner = c.red('\n' +
        ' _   _                    ______                                 \n' +
        '| \\ | |                   | ___ \\                                \n' +
        '|  \\| | ___  ___ _ __ ___ | |_/ /_ __ _____      _____  ___ _ __ \n' +
        '| . ` |/ _ \\/ __| \'__/ _ \\| ___ \\ \'__/ _ \\ \\ /\\ / / __|/ _ \\ \'__|\n' +
        '| |\\  |  __/ (__| | | (_) | |_/ / | | (_) \\ V  V /\\__ \\  __/ |   \n' +
        '\\_| \\_/\\___|\\___|_|  \\___/\\____/|_|  \\___/ \\_/\\_/ |___/\\___|_|  awakens... \n' +
        '                                                                 ')
    console.log(banner);
    console.log(`concurrency: [${cfg.cluster.concurrency}]   poolSize:   [${cfg.cluster.poolSize}]          taskTimeout: [${cfg.cluster.taskTimeout} sec]`);
    console.log(`headless:    [${cfg.necro.headless}]     windowSize: [${cfg.cluster.page.windowSize}]  scaleFactor: [${cfg.cluster.page.scaleFactor} sec]`);

    // dynamically load all the available tasks
    let necrotask = loader.LoadTasks()

    // use the Stealth plugin
    puppeteer.use(StealthPlugin())

    // check if Redis is reachable
    await db.CheckRedis()

    // overrides the puppeteer-cluster Cluster object to expose more functionality then init the cluster
    clusterLib.OverrideCluster()
    const cluster = await clusterLib.InitCluster(puppeteer)

    // ============================================================================
    // Puppeteer Cluster Error Handlers - Prevent cluster crashes
    // ============================================================================
    cluster.on('taskerror', async (err, data, willRetry) => {
        log.LogError('CLUSTER TASK ERROR DETECTED', {
            'Task ID': data && data[0] ? data[0] : 'unknown',
            'Error': err.message,
            'Will Retry': willRetry,
            'Time': new Date().toISOString()
        });

        // Update task status in Redis to reflect error
        if (data && data[0]) {
            try {
                await db.UpdateTaskStatusWithReason(data[0], 'error', err.message || 'Task execution failed');
            } catch (dbErr) {
                console.error(c.red(`Failed to update task status in Redis: ${dbErr.message}`));
            }
        }
    });

    app.use(logger('dev'));
    app.use(express.json());

    // return status for now
    app.get('/', async function (req, res, next) {
        try {
            let status = cluster.monitor()
            res.json(status)
        } catch (err) {
            next(err)
        }
    });

    // return the available task types and methods
    app.get('/tasks', async function (req, res, next) {
        try {
            let output = {}
            Object.keys(necrotask).map((k,v) => {
                if(!k.includes("__")){
                    output[k] = necrotask[k]
                }
            })
            res.json(output)
        } catch (err) {
            next(err)
        }
    });

    // return the data related to the task id
    app.get('/instrument/:id', async function (req, res, next) {
        try {
            let id = req.params.id;
            let taskStatus = await db.GetTask(id);
            res.json({'status': taskStatus[0], 'data': taskStatus[1]})
        } catch (err) {
            next(err)
        }
    });

    // queues a new task and returns immediately the taskID to be used to poll the task via GET
    app.post('/instrument', async function (req, res, next) {
        try {
            // Validate request body structure
            const bodyValidation = validation.ValidateInstrumentRequest(req.body);
            if (!bodyValidation.valid) {
                return res.status(400).json({'error': bodyValidation.error});
            }

            let name = req.body.name;
            let tasks = req.body.task.name;
            let necroIds = []

            for(let task of tasks){
                let taskType = req.body.task.type;
                let taskName = task;
                let taskParams = req.body.task.params;

                // Validate task type/name are alphanumeric
                let isTaskOk = loader.ValidateTask(taskType, taskName, taskParams, necrotask)
                if(!isTaskOk){
                    return res.status(400).json({'error': 'task type/name need to be alphanumeric and one from GET /tasks'})
                }

                // Verify task function exists
                const taskValidation = validation.ValidateTaskExists(necrotask, taskType, taskName);
                if (!taskValidation.valid) {
                    return res.status(400).json({'error': taskValidation.error});
                }

                // Get cookies
                let cookies = req.body.cookie || [];
                let cookie_string = JSON.stringify(cookies, null, 4);
                let b64Cookies = await Buffer.from(cookie_string).toString('base64');

                // Store in Redis
                const taskId = await db.AddTask(name, taskType, b64Cookies);
                console.log(`[${taskId}] initiating necro -> name: [${name}] type: [${taskType}.${taskName}] cookies: [${cookies}]`);

                // Queue the task
                const taskFn = eval(`necrotask['${taskType}__Tasks'].${taskName}`);
                const wrappedTaskFn = loader.WrapTaskWithErrorHandler(taskFn, taskType, taskName, db);
                await cluster.queue([taskId, cookies, taskParams], wrappedTaskFn);

                necroIds.push(taskId)
            }

            res.json({'status': 'queued', 'necroIds': necroIds});
        } catch (err) {
            console.error(c.red(`[POST /instrument] Error: ${err.message}`));
            if (!res.headersSent) {
                res.status(500).json({'error': err.message || 'Internal server error'});
            }
        }
    });

    // ============================================================================
    // Express Error Middleware - Catch all errors in routes
    // ============================================================================
    app.use((err, req, res, next) => {
        log.LogError('EXPRESS ERROR MIDDLEWARE TRIGGERED', {
            'Path': `${req.method} ${req.path}`,
            'Error': err.message,
            'Stack': err.stack,
            'Time': new Date().toISOString()
        });

        // Send error response if not already sent
        if (!res.headersSent) {
            res.status(500).json({
                error: err.message || 'Internal server error',
                path: req.path,
                timestamp: new Date().toISOString()
            });
        }
    });

    let host = cfg.platform.host;
    let port = cfg.platform.port;

    // Handle server listen errors
    const server = app.listen(port, host, function () {
        console.log(`\\+-+/ ... NecroBrowser ready at http://${host}:${port} ... \\+-+/`);
    });

    server.on('error', (err) => {
        log.LogError('SERVER LISTEN ERROR DETECTED', {
            'Error': err.message,
            'Code': err.code
        });
        if (err.code === 'EADDRINUSE') {
            console.error(c.red(`Port ${port} is already in use. Please choose a different port.`));
        }
        process.exit(1);
    });
})().catch((err) => {
    log.LogError('FATAL INITIALIZATION ERROR', {
        'Error': err.message,
        'Stack': err.stack
    });
    console.error(c.red('NecroBrowser failed to start. Exiting...\n'));
    process.exit(1);
});
