const express = require('express');
const morgan = require('morgan');
const validation = require('./validation');
const defaultLogger = require('./logger');
const { rateLimitMiddleware } = require('./rate-limit');
const { parseCookieJarJson, summarizeCookieJar } = require('./cookie-jar');

function getTaskFunction(tasks, taskType, taskName) {
    const module = tasks[`${taskType}__Tasks`];
    return module && typeof module[taskName] === 'function' ? module[taskName] : null;
}

function listTasks(tasks) {
    return Object.fromEntries(
        Object.entries(tasks)
            .filter(([key]) => !key.includes('__'))
            .map(([key, value]) => [key, Array.isArray(value) ? value : []])
    );
}

function decodeCookies(encoded) {
    return JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
}

function collectNavigationUrls(value, key = '', output = [], depth = 0) {
    if (depth > 8 || value === null || value === undefined) return output;
    if (typeof value === 'string' && /(?:urls?|uri|href|fixsession)$/i.test(key)) {
        output.push({ key, value });
        return output;
    }
    if (Array.isArray(value)) {
        value.forEach(item => collectNavigationUrls(item, key, output, depth + 1));
        return output;
    }
    if (typeof value === 'object') {
        Object.entries(value).forEach(([childKey, childValue]) => collectNavigationUrls(childValue, childKey, output, depth + 1));
    }
    return output;
}

function validateNavigationParams(params, navigationPolicy) {
    if (!navigationPolicy) return { valid: true, urls: [] };
    const urls = collectNavigationUrls(params);
    for (const entry of urls) {
        try {
            navigationPolicy.assertAllowedUrl(entry.value);
        } catch (error) {
            return { valid: false, urls, error: { code: error.code || 'NAVIGATION_POLICY_DENIED', field: entry.key } };
        }
    }
    return { valid: true, urls };
}

function createApp({
    db,
    cluster,
    tasks,
    loader,
    logger = defaultLogger,
    requestBodyLimit = '2mb',
    navigationPolicy,
    rateLimiter,
    audit,
    readOnlySmoke = false,
    cookieJarOptions = {}
}) {
    if (!db || !cluster || !tasks || !loader) {
        throw new TypeError('db, cluster, tasks, and loader are required');
    }

    const app = express();
    app.use(morgan('dev'));
    app.use(express.json({ limit: requestBodyLimit }));
    app.use(rateLimitMiddleware(rateLimiter, { skip: req => req.path === '/healthz' }));

    const recordAudit = (event) => {
        try { audit?.record(event); } catch (_) { /* audit must never break request handling */ }
    };

    app.get('/healthz', (req, res) => {
        recordAudit({ event: 'health', method: req.method, path: req.path, outcome: 'ok' });
        res.json({ status: 'ok' });
    });

    if (readOnlySmoke) {
        app.use((req, res, next) => {
            if (req.path === '/healthz' || req.path === '/tasks' || req.path === '/cookie-jar/dry-run') return next();
            return res.status(403).json({ error: 'Read-only smoke mode' });
        });
    }

    app.get('/', async (req, res, next) => {
        try {
            const status = typeof cluster.monitor === 'function'
                ? await cluster.monitor()
                : typeof cluster.metrics === 'function' ? await cluster.metrics() : {};
            res.json(status);
        } catch (error) {
            next(error);
        }
    });

    app.get('/tasks', (req, res) => {
        res.json(listTasks(tasks));
    });

    app.post('/cookie-jar/dry-run', (req, res) => {
        const result = summarizeCookieJar(req.body?.cookies ?? req.body, { ...cookieJarOptions, policy: navigationPolicy });
        recordAudit({ event: 'cookie_jar_dry_run', method: req.method, path: req.path, outcome: result.valid ? 'valid' : 'invalid', summary: result.summary });
        res.status(result.valid ? 200 : 400).json(result);
    });

    app.get('/instrument/:id', async (req, res, next) => {
        try {
            const [status, data] = await db.GetTask(req.params.id);
            res.json({ status, data });
        } catch (error) {
            next(error);
        }
    });

    app.post('/instrument', async (req, res, next) => {
        const bodyValidation = validation.ValidateInstrumentRequest(req.body);
        if (!bodyValidation.valid) {
            return res.status(400).json({ error: bodyValidation.error });
        }

        const { name, task, userAgent = '' } = req.body;
        const rawCredentials = req.body.credentials ?? task.params.credentials;
        const suppliedCredentials = rawCredentials === undefined
            ? undefined
            : Array.isArray(rawCredentials)
                ? rawCredentials
                : Object.entries(rawCredentials || {}).map(([key, val]) => ({ key, val }));
        const tracker = req.body.tracker ?? task.params.trackers ?? task.params.tracker;
        const credentialsKey = tracker ? `victim:${tracker}` : '';
        const hasSingularCookies = req.body.cookie !== undefined;
        const hasPluralCookies = req.body.cookies !== undefined;
        if (hasSingularCookies && hasPluralCookies && JSON.stringify(req.body.cookie) !== JSON.stringify(req.body.cookies)) {
            return res.status(400).json({ error: 'cookie and cookies must not conflict' });
        }
        const rawCookie = req.body.cookie ?? req.body.cookies ?? [];
        const parsedCookie = parseCookieJarJson(rawCookie);
        if (parsedCookie.errors.length > 0) {
            return res.status(400).json({ error: 'Invalid cookie jar', code: parsedCookie.errors[0].code, details: { errors: parsedCookie.errors.map(({ path, message, code }) => ({ path, message, code })) } });
        }
        const cookie = parsedCookie.value;
        const taskParams = userAgent ? { ...task.params, userAgent } : { ...task.params };
        const taskFunctions = [];

        // Validate every item before creating any database records.
        for (const taskName of task.name) {
            const valid = loader.ValidateTask(task.type, taskName, taskParams, tasks);
            if (!valid) {
                return res.status(400).json({
                    error: `task type/name need to be alphanumeric and one from GET /tasks: ${task.type}.${taskName}`
                });
            }

            const navigationValidation = validateNavigationParams(taskParams, navigationPolicy);
            if (!navigationValidation.valid) {
                recordAudit({ event: 'navigation_policy', method: req.method, path: req.path, outcome: 'rejected', code: navigationValidation.error.code });
                return res.status(400).json({ error: 'Navigation target rejected by policy', code: navigationValidation.error.code });
            }

            const taskValidation = validation.ValidateTaskExists(tasks, task.type, taskName);
            if (!taskValidation.valid) {
                return res.status(400).json({ error: taskValidation.error });
            }
            taskFunctions.push({ name: taskName, fn: getTaskFunction(tasks, task.type, taskName) });
        }

        const cookieValidation = summarizeCookieJar(cookie, { ...cookieJarOptions, policy: navigationPolicy });
        if (!cookieValidation.valid) {
            return res.status(400).json({ error: 'Invalid cookie jar', details: cookieValidation });
        }
        recordAudit({ event: 'task_submission', method: req.method, path: req.path, outcome: 'validated', taskType: task.type, taskCount: taskFunctions.length, cookieSummary: cookieValidation.summary });
        const cookieData = Buffer.from(JSON.stringify(cookie)).toString('base64');
        const queuedIds = [];

        try {
            for (const { name: taskName, fn } of taskFunctions) {
                const taskId = await db.AddTask(name, task.type, cookieData, taskName, taskParams, userAgent, credentialsKey, suppliedCredentials);
                try {
                    const wrappedTask = loader.WrapTaskWithErrorHandler(fn, task.type, taskName, db);
                    await cluster.queue([taskId, cookie, taskParams], wrappedTask);
                    queuedIds.push(taskId);
                } catch (queueError) {
                    await db.UpdateTaskStatusWithReason(taskId, 'error', queueError.message || 'Task queue failed');
                    return res.status(503).json({
                        error: 'Task queue unavailable',
                        queuedIds,
                        failedId: taskId
                    });
                }
            }
        } catch (error) {
            next(error);
            return;
        }

        res.json({ status: 'queued', necroIds: queuedIds });
    });

    app.post('/instrument/:id/retrigger', async (req, res, next) => {
        try {
            const sourceId = req.params.id;
            const taskData = await db.GetFullTask(sourceId);
            if (!taskData) {
                return res.status(404).json({ error: `Task ${sourceId} not found` });
            }
            if (!taskData.type || !taskData.taskName || !taskData.cookies) {
                return res.status(400).json({ error: 'Task missing retrigger data' });
            }

            let params;
            let cookies;
            try {
                params = JSON.parse(taskData.params || '{}');
                cookies = decodeCookies(taskData.cookies);
            } catch (error) {
                return res.status(400).json({ error: 'Failed to decode stored task data' });
            }

            const taskValidation = validation.ValidateTaskExists(tasks, taskData.type, taskData.taskName);
            if (!taskValidation.valid) {
                return res.status(400).json({ error: taskValidation.error });
            }
            const taskFn = getTaskFunction(tasks, taskData.type, taskData.taskName);
            const newTaskId = await db.AddTask(
                taskData.name || 'retrigger',
                taskData.type,
                Buffer.from(JSON.stringify(cookies)).toString('base64'),
                taskData.taskName,
                params,
                taskData.userAgent || ''
            );

            try {
                const wrappedTask = loader.WrapTaskWithErrorHandler(taskFn, taskData.type, taskData.taskName, db);
                await cluster.queue([newTaskId, cookies, params], wrappedTask);
            } catch (queueError) {
                await db.UpdateTaskStatusWithReason(newTaskId, 'error', queueError.message || 'Task queue failed');
                return res.status(503).json({ error: 'Task queue unavailable', failedId: newTaskId });
            }

            res.json({ status: 'queued', necroId: newTaskId, retriggeredFrom: sourceId });
        } catch (error) {
            next(error);
        }
    });

    app.get('/sessions', async (req, res, next) => {
        try {
            const allTasks = await db.GetAllTasks();
            const sessions = allTasks.map(task => {
                let cookies = [];
                let params = {};
                try { cookies = decodeCookies(task.cookies || ''); } catch (_) { /* malformed legacy data */ }
                try { params = JSON.parse(task.params || '{}'); } catch (_) { /* malformed legacy data */ }
                return {
                    id: task._key,
                    name: task.name || '',
                    type: task.type || '',
                    taskName: task.taskName || '',
                    status: task.status || '',
                    cookieCount: cookies.length,
                    domains: [...new Set(cookies.map(cookie => cookie.domain).filter(Boolean))],
                    fixSession: params.fixSession || '',
                    userAgent: (task.userAgent || '').substring(0, 80),
                    keepalive: task.keepalive || 'disabled',
                    lastKeepalive: task.lastKeepalive || '',
                    createdAt: task.createdAt || ''
                };
            });
            res.json({ sessions, total: sessions.length });
        } catch (error) {
            next(error);
        }
    });

    for (const [action, enabled] of [['enable', true], ['disable', false]]) {
        app.post(`/instrument/:id/keepalive/${action}`, async (req, res, next) => {
            try {
                const taskData = await db.GetFullTask(req.params.id);
                if (!taskData) {
                    return res.status(404).json({ error: `Task ${req.params.id} not found` });
                }
                await db.UpdateTaskKeepalive(req.params.id, enabled);
                res.json({ status: 'ok', taskId: req.params.id, keepalive: enabled ? 'enabled' : 'disabled' });
            } catch (error) {
                next(error);
            }
        });
    }

    app.get('/instrument/:id/cookies', async (req, res, next) => {
        try {
            const taskData = await db.GetFullTask(req.params.id);
            if (!taskData) {
                return res.status(404).json({ error: `Task ${req.params.id} not found` });
            }
            if (!taskData.cookies) {
                return res.status(400).json({ error: 'Task has no cookies stored' });
            }

            let cookies;
            try { cookies = decodeCookies(taskData.cookies); } catch (_) {
                return res.status(400).json({ error: 'Failed to decode stored cookies' });
            }

            const cookieEditorFormat = cookies.map(cookie => {
                const entry = {
                    name: cookie.name || '',
                    value: cookie.value || '',
                    domain: cookie.domain || '',
                    path: cookie.path || '/',
                    secure: !!cookie.secure,
                    httpOnly: !!cookie.httpOnly,
                    sameSite: cookie.sameSite || 'unspecified',
                    hostOnly: !(cookie.domain || '').startsWith('.'),
                    storeId: cookie.storeId || '0'
                };
                const expiration = cookie.expires > 0 ? cookie.expires : cookie.expirationDate;
                if (expiration > 0) {
                    entry.expirationDate = expiration;
                    entry.session = false;
                } else {
                    entry.session = true;
                }
                return entry;
            });
            res.json({ taskId: req.params.id, cookies: cookieEditorFormat, count: cookieEditorFormat.length });
        } catch (error) {
            next(error);
        }
    });

    app.use((error, req, res, next) => {
        logger.LogError('EXPRESS ERROR', {
            Path: `${req.method} ${req.path}`,
            Error: error.message,
            Time: new Date().toISOString()
        });
        if (!res.headersSent) {
            res.status(error.statusCode || 500).json({ error: error.publicMessage || 'Internal server error' });
        }
    });

    return app;
}

module.exports = { createApp, getTaskFunction, listTasks };
