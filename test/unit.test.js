const { createApp } = require('../lib/app');
const validation = require('../lib/validation');
const loader = require('../tasks/loader');
const { BrowserPool, safeId } = require('../browser/pool');

function fakeDependencies() {
    const records = new Map();
    let nextId = 0;
    const db = {
        AddTask: jest.fn(async (name, type, cookies, taskName, params, userAgent) => {
            const id = `task:${type}:${++nextId}`;
            records.set(id, { _key: id, name, type, taskName, cookies, params: JSON.stringify(params), userAgent, status: 'queued' });
            return id;
        }),
        GetTask: jest.fn(async id => records.has(id) ? [records.get(id).status, null] : [null, null]),
        GetFullTask: jest.fn(async id => records.get(id) || null),
        UpdateTaskStatusWithReason: jest.fn(async (id, status, reason) => { records.get(id).status = status; records.get(id).reason = reason; }),
        GetAllTasks: jest.fn(async () => [...records.values()]),
        RecoverInterruptedTasks: jest.fn(),
        UpdateTaskKeepalive: jest.fn(),
        CloseDatabase: jest.fn()
    };
    const cluster = {
        queue: jest.fn(async ([id]) => { records.get(id).status = 'queued'; }),
        monitor: jest.fn(() => ({ startedAt: new Date().toISOString(), workers: '1', queued: '0', progress: '0 / 0 (100.00%)', errors: '0', tasks: [] }))
    };
    const tasks = {
        generic: ['Noop'],
        generic__Tasks: { Noop: jest.fn(async () => undefined) }
    };
    return { db, cluster, tasks, records };
}

describe('request validation', () => {
    test('rejects empty task list and malformed params', () => {
        expect(validation.ValidateInstrumentRequest({ name: 'x', task: { type: 'generic', name: [], params: {} } }).valid).toBe(false);
        expect(validation.ValidateInstrumentRequest({ name: 'x', task: { type: 'generic', name: ['Noop'], params: [] } }).valid).toBe(false);
    });

    test('accepts bounded valid request', () => {
        expect(validation.ValidateInstrumentRequest({
            name: 'x', task: { type: 'generic', name: ['Noop'], params: {} }, cookie: []
        })).toEqual({ valid: true, error: null });
    });
});

describe('task loader', () => {
    test('validates synchronously without evaluating input', () => {
        const tasks = { generic: ['Noop'] };
        expect(loader.ValidateTask('generic', 'Noop', {}, tasks)).toBe(true);
        expect(loader.ValidateTask('generic', 'Noop()', {}, tasks)).toBe(false);
    });

    test('wrapper records failure and rethrows', async () => {
        const db = { UpdateTaskStatusWithReason: jest.fn() };
        const wrapped = loader.WrapTaskWithErrorHandler(async () => { throw new Error('boom'); }, 'generic', 'Noop', db);
        const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
        try {
            await expect(wrapped({ data: ['task:generic:1'] })).rejects.toThrow('boom');
        } finally {
            consoleError.mockRestore();
        }
        expect(db.UpdateTaskStatusWithReason).toHaveBeenCalledWith('task:generic:1', 'error', 'boom');
    });
});

describe('browser pool', () => {
    test('limits concurrency and closes resources', async () => {
        let active = 0;
        let maximum = 0;
        const browser = {
            newPage: jest.fn(async () => ({ close: jest.fn(async () => undefined) })),
            close: jest.fn(async () => undefined),
            on: jest.fn()
        };
        const pool = new BrowserPool({
            config: { cluster: { concurrency: 'browser', poolSize: 2, taskTimeout: 1, queueLimit: 10 }, necro: { headless: true } },
            launch: jest.fn(async () => browser)
        });
        for (let i = 0; i < 4; i++) {
            await pool.queue([`task:${i}`], async () => {
                active++;
                maximum = Math.max(maximum, active);
                await new Promise(resolve => setTimeout(resolve, 5));
                active--;
            });
        }
        await new Promise(resolve => setTimeout(resolve, 40));
        expect(maximum).toBeLessThanOrEqual(2);
        expect(pool.monitor().errors).toBe('0');
        await pool.close();
        expect(browser.close).toHaveBeenCalled();
    });

    test('sanitizes profile identifiers', () => {
        expect(safeId('task:generic:one/two')).toBe('task_generic_one_two');
    });

    test('maps configured window size to headless viewport', () => {
        const pool = new BrowserPool({
            config: { cluster: { concurrency: 'browser', page: { windowSize: '1600,1200' } }, necro: { headless: true } },
            launch: jest.fn()
        });
        expect(pool.getViewport()).toEqual({ width: 1600, height: 1200 });
        expect(pool.getLaunchOptions().defaultViewport).toEqual({ width: 1600, height: 1200 });
    });

    test('disables Puppeteer viewport override in visible mode', () => {
        const pool = new BrowserPool({
            config: { cluster: { concurrency: 'browser', page: { windowSize: '1600,1200' } }, necro: { headless: false } },
            launch: jest.fn()
        });
        expect(pool.getLaunchOptions().defaultViewport).toBeNull();
    });
});

describe('cookie injection helper', () => {
    test('normalizes Cookie-Editor fields and groups domains', async () => {
        const { SetCookieJar } = require('../tasks/helpers/necrohelp');
        const calls = [];
        const page = { setCookie: jest.fn(async (...cookies) => calls.push(cookies)) };
        await SetCookieJar(page, [
            { name: 'one', value: '1', domain: '.example.com', sameSite: 'lax', expirationDate: 123, session: false, storeId: '0' },
            { name: 'two', value: '2', domain: '.other.example', sameSite: 'unspecified', hostOnly: false }
        ]);
        expect(calls).toHaveLength(2);
        expect(calls[0][0]).toMatchObject({ name: 'one', expires: 123, sameSite: 'Lax', url: 'https://example.com/' });
        expect(calls[0][0]).not.toHaveProperty('session');
        expect(calls[0][0]).not.toHaveProperty('storeId');
        expect(calls[1][0]).toMatchObject({ name: 'two', url: 'https://other.example/' });
        expect(calls[1][0]).not.toHaveProperty('sameSite');
    });

    test('skips cookies without domain or URL context', async () => {
        const { SetCookieJar } = require('../tasks/helpers/necrohelp');
        const page = { setCookie: jest.fn(async () => undefined) };
        await SetCookieJar(page, [{ name: 'orphan', value: '1' }]);
        expect(page.setCookie).not.toHaveBeenCalled();
    });
});

describe('app factory', () => {
    test('accepts cookie jar JSON string and queues parsed cookies', async () => {
        const deps = fakeDependencies();
        const app = createApp({ ...deps, loader });
        const server = app.listen(0);
        await new Promise(resolve => server.once('listening', resolve));
        const port = server.address().port;
        const cookie = [{ name: 'session', value: 'secret', domain: 'example.test', path: '/' }];
        const response = await fetch(`http://127.0.0.1:${port}/instrument`, {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ name: 'cookie-json', task: { type: 'generic', name: ['Noop'], params: {} }, cookies: JSON.stringify(cookie) })
        });
        expect(response.status).toBe(200);
        expect(deps.db.AddTask).toHaveBeenCalledWith('cookie-json', 'generic', expect.any(String), 'Noop', {}, '', '', undefined);
        expect(JSON.parse(Buffer.from(deps.db.AddTask.mock.calls[0][2], 'base64').toString('utf8'))).toEqual(cookie);
        await new Promise(resolve => server.close(resolve));
    });

    test('rejects malformed cookie JSON before persistence', async () => {
        const deps = fakeDependencies();
        const app = createApp({ ...deps, loader });
        const server = app.listen(0);
        await new Promise(resolve => server.once('listening', resolve));
        const port = server.address().port;
        const response = await fetch(`http://127.0.0.1:${port}/instrument`, {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ name: 'bad-cookie-json', task: { type: 'generic', name: ['Noop'], params: {} }, cookies: '{bad' })
        });
        expect(response.status).toBe(400);
        expect(deps.db.AddTask).not.toHaveBeenCalled();
        await new Promise(resolve => server.close(resolve));
    });

    test('queues valid work and exposes metrics', async () => {
        const deps = fakeDependencies();
        const app = createApp({ ...deps, loader });
        const server = app.listen(0);
        await new Promise(resolve => server.once('listening', resolve));
        const port = server.address().port;
        const response = await fetch(`http://127.0.0.1:${port}/instrument`, {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ name: 'test', task: { type: 'generic', name: ['Noop'], params: {} }, cookie: [] })
        });
        expect(response.status).toBe(200);
        expect((await response.json()).necroIds).toHaveLength(1);
        expect((await fetch(`http://127.0.0.1:${port}/`)).status).toBe(200);
        await new Promise(resolve => server.close(resolve));
    });

    test('validates full batch before persistence', async () => {
        const deps = fakeDependencies();
        const app = createApp({ ...deps, loader });
        const server = app.listen(0);
        await new Promise(resolve => server.once('listening', resolve));
        const port = server.address().port;
        const response = await fetch(`http://127.0.0.1:${port}/instrument`, {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ name: 'test', task: { type: 'generic', name: ['Noop', 'Missing'], params: {} } })
        });
        expect(response.status).toBe(400);
        expect(deps.db.AddTask).not.toHaveBeenCalled();
        await new Promise(resolve => server.close(resolve));
    });

    test('health is sanitized and cookie dry-run has no queue side effects', async () => {
        const deps = fakeDependencies();
        const app = createApp({ ...deps, loader });
        const server = app.listen(0);
        await new Promise(resolve => server.once('listening', resolve));
        const port = server.address().port;
        const health = await fetch(`http://127.0.0.1:${port}/healthz`);
        expect(await health.json()).toEqual({ status: 'ok' });
        const dryRun = await fetch(`http://127.0.0.1:${port}/cookie-jar/dry-run`, {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify([{ name: 'theme', value: 'dark', domain: 'example.test', path: '/' }])
        });
        expect(dryRun.status).toBe(200);
        const result = await dryRun.json();
        expect(result.summary.names).toEqual(['theme']);
        expect(JSON.stringify(result)).not.toContain('dark');
        expect(deps.db.AddTask).not.toHaveBeenCalled();
        expect(deps.cluster.queue).not.toHaveBeenCalled();
        await new Promise(resolve => server.close(resolve));
    });

    test('allows public-origin targets while validating unsafe targets before persistence', async () => {
        const deps = fakeDependencies();
        const { createNavigationPolicy } = require('../lib/navigation-policy');
        const app = createApp({
            ...deps,
            loader,
            navigationPolicy: createNavigationPolicy({ allowPrivateNetworks: false, allowHttp: false })
        });
        const server = app.listen(0);
        await new Promise(resolve => server.once('listening', resolve));
        const port = server.address().port;

        const allowed = await fetch(`http://127.0.0.1:${port}/instrument`, {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ name: 'public', task: { type: 'generic', name: ['Noop'], params: { urls: ['https://other.example/'] } } })
        });
        expect(allowed.status).toBe(200);

        const rejected = await fetch(`http://127.0.0.1:${port}/instrument`, {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ name: 'private', task: { type: 'generic', name: ['Noop'], params: { urls: ['http://127.0.0.1:3000/'] } } })
        });
        expect(rejected.status).toBe(400);
        expect(deps.db.AddTask).toHaveBeenCalledTimes(1);
        expect(deps.cluster.queue).toHaveBeenCalledTimes(1);
        await new Promise(resolve => server.close(resolve));
    });

    test('accepts public cookie domains without an origin allowlist', () => {
        const { createNavigationPolicy } = require('../lib/navigation-policy');
        const policy = createNavigationPolicy();
        expect(policy.isAllowedCookieDomain('other.example')).toBe(true);
        expect(policy.isAllowedCookieDomain('127.0.0.1')).toBe(false);
    });

    test('rejects malformed URL before persistence', async () => {
        const deps = fakeDependencies();
        const { createNavigationPolicy } = require('../lib/navigation-policy');
        const app = createApp({ ...deps, loader, navigationPolicy: createNavigationPolicy() });
        const server = app.listen(0);
        await new Promise(resolve => server.once('listening', resolve));
        const port = server.address().port;
        const response = await fetch(`http://127.0.0.1:${port}/instrument`, {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ name: 'bad-url', task: { type: 'generic', name: ['Noop'], params: { urls: ['javascript:alert(1)'] } } })
        });
        expect(response.status).toBe(400);
        expect(deps.db.AddTask).not.toHaveBeenCalled();
        expect(deps.cluster.queue).not.toHaveBeenCalled();
        await new Promise(resolve => server.close(resolve));
    });
});

