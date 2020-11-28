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

(async () => {
    const clusterLib = require('./puppeteer/cluster')
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
    db.CheckRedis()

    // overrides the puppeteer-cluster Cluster object to expose more functionality then init the cluster
    clusterLib.OverrideCluster()
    const cluster = await clusterLib.InitCluster(puppeteer)

    app.use(logger('dev'));
    app.use(express.json());

    // return status for now
    app.get('/', async function (req, res) {
        let status = cluster.monitor()
        res.json(status)
    });

    // return the available task types and methods
    app.get('/tasks', async function (req, res) {
        let output = {}
        Object.keys(necrotask).map((k,v) => {
            if(!k.includes("__")){
                output[k] = necrotask[k]
            }
        })
        res.json(output)
    });

    // return the data related to the task id
    app.get('/instrument/:id', async function (req, res) {
        let id = req.params.id;
        let taskStatus = await db.GetTask(id);
        res.json({'status': taskStatus[0], 'data': taskStatus[1]})
    });

    // queues a new task and returns immediately the taskID to be used to poll the task via GET
    app.post('/instrument', async function (req, res) {

        try {
            let name = req.body.name;
            let tasks = req.body.task.name; // array of functions to call

            let necroIds = []
            for(let task of tasks){

                let taskType = req.body.task.type;
                let taskName = task;
                let taskParams = req.body.task.params;

                // validate task
                let isTaskOk = loader.ValidateTask(taskType, taskName, taskParams, necrotask)
                if(!isTaskOk){
                    res.json({'error': 'task type/name need to be alphanumeric and one from GET /tasks'})
                    return
                }

                // store in redis
                let cookies = JSON.stringify(req.body.cookies, null, 4);
                let b64Cookies = await Buffer.from(cookies).toString('base64');
                const taskId = await db.AddTask(name, taskType, b64Cookies);
                console.log(`[${taskId}] initiating necro -> name: [${name}] type: [${taskType}.${taskName}] cookies: [${req.body.cookies.length}]`);

                // queue the task in the cluster calling the right function
                // NOTE: taskType and taskName are validated to be alphanumeric, so eval is safe here
                await cluster.queue([taskId, req.body.cookies, taskParams], eval(`necrotask['${taskType}__Tasks'].${taskName}`));

                necroIds.push(taskId)
            }

            res.json({'status': 'queued', 'necroIds': necroIds});
        } catch (err) {
            // catch error
            res.json({'error': err});
        }
    });

    let host = cfg.platform.host;
    let port = cfg.platform.port;

    // TODO handle listen errors!
    app.listen(port, host, function () {
        console.log(`\\+-+/ ... NecroBrowser ready at http://${host}:${port} ... \\+-+/`);
    });
})();
