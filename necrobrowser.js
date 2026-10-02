#!/usr/bin/env node

const path = require('path');
const c = require('chalk');
const clusterLib = require('./puppeteer/cluster');
const loader = require('./tasks/loader');
const db = require('./db/db');
const { BrowserPool } = require('./browser/pool');
const { createApp } = require('./lib/app');
const log = require('./lib/logger');
const { createNavigationPolicy } = require('./lib/navigation-policy');
const { createRateLimiter } = require('./lib/rate-limit');
const { createAudit } = require('./lib/audit');

function decodeStoredTask(task) {
    let cookies;
    let params;
    try {
        cookies = JSON.parse(Buffer.from(task.cookies || '', 'base64').toString('utf8'));
        params = JSON.parse(task.params || '{}');
    } catch (_) {
        return null;
    }
    return { cookies, params };
}

async function recoverQueuedTasks({ database, browserPool, tasks }) {
    if (typeof database.GetAllTasks !== 'function') return;
    const queuedTasks = (await database.GetAllTasks()).filter(task => task.status === 'queued');
    for (const task of queuedTasks) {
        const taskModule = tasks[`${task.type}__Tasks`];
        const taskFn = taskModule && typeof taskModule[task.taskName] === 'function'
            ? taskModule[task.taskName]
            : null;
        const stored = decodeStoredTask(task);
        if (!taskFn || !stored || !Array.isArray(stored.cookies) || !stored.params) {
            await database.UpdateTaskStatusWithReason?.(task._key, 'error', 'Queued task could not be recovered after restart');
            continue;
        }
        try {
            const wrappedTask = loader.WrapTaskWithErrorHandler(taskFn, task.type, task.taskName, database);
            await browserPool.queue([task._key, stored.cookies, stored.params], wrappedTask);
        } catch (error) {
            await database.UpdateTaskStatusWithReason?.(task._key, 'error', error.message || 'Queued task recovery failed');
        }
    }
}

function parseConfig(configPath = path.join(__dirname, 'config.toml')) {

    const config = clusterLib.ParseConfig(configPath);
    return config;
}

async function createRuntime({ config, taskRegistry, database = db, pool } = {}) {
    const cfg = config || parseConfig();
    const tasks = taskRegistry || loader.LoadTasks({ tasksRoot: path.join(__dirname, 'tasks') });
    const apiConfig = cfg.api || {};
    const navigationPolicy = createNavigationPolicy({
        allowPrivateNetworks: apiConfig.allowPrivateNetworks !== false,
        allowHttp: apiConfig.allowHttp !== false
    });
    const rateLimiter = createRateLimiter({
        limit: Number(apiConfig.requestsPerMinute || 60),
        windowMs: 60_000
    });
    const audit = createAudit({ sink: event => log.LogInfo(`[audit] ${JSON.stringify(event)}`) });
    const browserPool = pool || new BrowserPool({
        config: cfg,
        launch: async options => {
            const puppeteer = require('puppeteer');
            return puppeteer.launch(options);
        },
        logger: console
    });

    await database.CheckDatabase?.({ path: cfg.database?.path });
    await browserPool.start();
    await database.RecoverInterruptedTasks?.();

    browserPool.on?.('taskerror', async (error, data, willRetry) => {
        if (willRetry || !data?.[0]) return;
        try {
            await database.UpdateTaskStatusWithReason(
                data[0],
                'error',
                error.message || 'Browser task execution failed'
            );
        } catch (statusError) {
            log.LogError('TASK STATUS UPDATE FAILED', { Error: statusError.message });
        }
    });

    await recoverQueuedTasks({ database, browserPool, tasks });

    const app = createApp({
        db: database,
        cluster: browserPool,
        tasks,
        loader,
        requestBodyLimit: apiConfig.requestBodyLimit || '2mb',
        navigationPolicy,
        rateLimiter,
        audit,
        readOnlySmoke: apiConfig.readOnlySmoke === true
    });

    let keepaliveTimer;
    const activeKeepalives = new Set();
    if (cfg.necro?.keepalive?.enabled) {
        const delay = Math.max(1000, Number(cfg.necro.keepalive.delay || 300) * 1000);
        const keepaliveTask = require('./tasks/keepalive/necrotask').KeepAlive;
        keepaliveTimer = setInterval(async () => {
            try {
                const tasksToRun = await database.GetKeepAliveTasks();
                for (const task of tasksToRun) {
                    if (activeKeepalives.has(task._key)) continue;
                    let cookies;
                    let params;
                    try {
                        cookies = JSON.parse(Buffer.from(task.cookies || '', 'base64').toString('utf8'));
                        params = JSON.parse(task.params || '{}');
                    } catch (_) {
                        continue;
                    }
                    if (task.userAgent) params.userAgent = task.userAgent;
                    activeKeepalives.add(task._key);
                    try {
                        await browserPool.queue([task._key, cookies, params], async data => {
                            try { return await keepaliveTask(data); }
                            finally { activeKeepalives.delete(task._key); }
                        });
                    } catch (error) {
                        activeKeepalives.delete(task._key);
                        throw error;
                    }
                }
            } catch (error) {
                log.LogError('KEEPALIVE SCHEDULER ERROR', { Error: error.message });
            }
        }, delay);
        keepaliveTimer.unref?.();
    }

    const clearKeepalives = () => activeKeepalives.clear();

    return {
        config: cfg,
        app,
        pool: browserPool,
        db: database,
        async close() {
            if (keepaliveTimer) clearInterval(keepaliveTimer);
            clearKeepalives();
            await browserPool.close();
            await database.CloseDatabase?.();
        }
    };
}

async function startServer(runtime, { host, port } = {}) {
    const listenHost = host || runtime.config.platform.host;
    const listenPort = port ?? runtime.config.platform.port;
    const server = await new Promise((resolve, reject) => {
        const listener = runtime.app.listen(listenPort, listenHost, () => resolve(listener));
        listener.once('error', reject);
    });

    return {
        server,
        address: server.address(),
        async close() {
            await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
            await runtime.close();
        }
    };
}

async function main() {
    const config = parseConfig();
    console.log(c.red('NecroBrowser starting'));
    console.log(`concurrency: [${config.cluster.concurrency}] poolSize: [${config.cluster.poolSize}] taskTimeout: [${config.cluster.taskTimeout}s]`);
    console.log(`headless: [${config.necro.headless}] windowSize: [${config.cluster.page.windowSize}]`);

    const runtime = await createRuntime({ config });
    const running = await startServer(runtime);
    let shuttingDown = false;

    const shutdown = async signal => {
        if (shuttingDown) return;
        shuttingDown = true;
        console.log(`[shutdown] received ${signal}`);
        try {
            await running.close();
            process.exitCode = 0;
        } catch (error) {
            log.LogError('SHUTDOWN FAILED', { Error: error.message });
            process.exitCode = 1;
        }
    };
    process.once('SIGTERM', () => void shutdown('SIGTERM'));
    process.once('SIGINT', () => void shutdown('SIGINT'));

    const address = running.address;
    console.log(`\\+-+/ ... NecroBrowser ready at http://${address.address}:${address.port} ... \\+-+/`);
    return running;
}

if (require.main === module) {
    main().catch(error => {
        log.LogError('FATAL INITIALIZATION ERROR', { Error: error.message, Stack: error.stack });
        process.exitCode = 1;
    });
}

module.exports = { parseConfig, createRuntime, startServer };
