const http = require('http');
const { createApp } = require('../lib/app');
const loader = require('../tasks/loader');

function listen(server) {
    return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => resolve(server.address()));
    });
}

function close(server) {
    return new Promise(resolve => server.close(() => resolve()));
}

describe('HTTP integration', () => {
    let fixture;
    let fixtureAddress;
    let api;
    let apiAddress;
    let records;
    let nextId;
    let queue;

    beforeAll(async () => {
        fixture = http.createServer((request, response) => {
            if (request.url === '/slow') {
                setTimeout(() => {
                    response.writeHead(200, { 'content-type': 'text/plain' });
                    response.end('fixture-ready');
                }, 5);
                return;
            }
            response.writeHead(404);
            response.end();
        });
        fixtureAddress = await listen(fixture);

        records = new Map();
        nextId = 0;
        queue = jest.fn(async ([taskId, cookies, params], task) => {
            records.get(taskId).status = 'running';
            await task({
                page: { url: async () => `http://${fixtureAddress.address}:${fixtureAddress.port}/slow` },
                data: [taskId, cookies, params]
            });
        });

        const db = {
            AddTask: jest.fn(async (name, type, cookies, taskName, params, userAgent) => {
                const id = `task:${type}:integration-${++nextId}`;
                records.set(id, { _key: id, name, type, taskName, cookies, params: JSON.stringify(params), userAgent, status: 'queued' });
                return id;
            }),
            GetTask: jest.fn(async id => {
                const record = records.get(id);
                return record ? [record.status, record.result || null] : [null, null];
            }),
            GetFullTask: jest.fn(async id => records.get(id) || null),
            UpdateTaskStatus: jest.fn(async (id, status) => { records.get(id).status = status; }),
            UpdateTaskStatusWithReason: jest.fn(async (id, status, reason) => {
                records.get(id).status = status;
                records.get(id).reason = reason;
            }),
            GetAllTasks: jest.fn(async () => [...records.values()]),
            RecoverInterruptedTasks: jest.fn(),
            UpdateTaskKeepalive: jest.fn(),
            CloseDatabase: jest.fn()
        };
        const tasks = {
            fixture: ['FetchFixture'],
            fixture__Tasks: {
                FetchFixture: async ({ page, data: [taskId] }) => {
                    const response = await fetch(await page.url());
                    const text = await response.text();
                    if (text !== 'fixture-ready') throw new Error('fixture response mismatch');
                    records.get(taskId).result = [{ url: await page.url(), value: text }];
                    records.get(taskId).status = 'completed';
                }
            }
        };
        api = createApp({ db, cluster: { queue, monitor: () => ({ workers: '1', queued: '0', tasks: [] }) }, tasks, loader });
        const apiServer = api.listen(0, '127.0.0.1');
        await new Promise(resolve => apiServer.once('listening', resolve));
        apiAddress = apiServer.address();
        api.server = apiServer;
    });

    afterAll(async () => {
        await close(api.server);
        await close(fixture);
    });

    test('queues task, executes against local fixture, and returns result', async () => {
        const response = await fetch(`http://${apiAddress.address}:${apiAddress.port}/instrument`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                name: 'fixture-test',
                task: { type: 'fixture', name: ['FetchFixture'], params: {} },
                cookie: []
            })
        });
        expect(response.status).toBe(200);
        const { necroIds } = await response.json();
        expect(necroIds).toHaveLength(1);

        const result = await fetch(`http://${apiAddress.address}:${apiAddress.port}/instrument/${necroIds[0]}`);
        expect(result.status).toBe(200);
        await expect(result.json()).resolves.toEqual({
            status: 'completed',
            data: [{ url: expect.stringContaining('/slow'), value: 'fixture-ready' }]
        });
        expect(queue).toHaveBeenCalledTimes(1);
    });

    test('rejects malformed batches before queueing', async () => {
        const response = await fetch(`http://${apiAddress.address}:${apiAddress.port}/instrument`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ name: 'bad', task: { type: 'fixture', name: ['Missing'], params: {} } })
        });
        expect(response.status).toBe(400);
        expect(queue).toHaveBeenCalledTimes(1);
    });
});
