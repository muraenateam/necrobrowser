const fs = require('fs');
const os = require('os');
const path = require('path');
const db = require('../db/db');

describe('SQLite task store', () => {
    let databasePath;

    beforeEach(async () => {
        databasePath = path.join(os.tmpdir(), `necrobrowser-db-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.db`);
        await db.CheckDatabase({ path: databasePath });
    });

    afterEach(async () => {
        await db.CloseDatabase();
        for (const suffix of ['', '-wal', '-shm']) {
            try { fs.rmSync(`${databasePath}${suffix}`, { force: true }); } catch (_) { /* already absent */ }
        }
    });

    test('persists task metadata and status transitions', async () => {
        const cookies = Buffer.from(JSON.stringify([{ name: 'sid', value: 'secret' }])).toString('base64');
        const taskId = await db.AddTask('demo', 'generic', cookies, 'Noop', { fixSession: 'https://example.test/refresh' }, 'UA');

        expect(taskId).toMatch(/^task:generic:/);
        expect(await db.GetTask(taskId)).toEqual(['queued', null]);
        expect(await db.GetFullTask(taskId)).toMatchObject({
            _key: taskId,
            name: 'demo',
            type: 'generic',
            taskName: 'Noop',
            cookies,
            status: 'queued',
            params: JSON.stringify({ fixSession: 'https://example.test/refresh' }),
            userAgent: 'UA',
            keepalive: 'enabled'
        });

        await db.UpdateTaskStatusWithReason(taskId, 'error', 'failed');
        expect(await db.GetTask(taskId)).toEqual(['error', 'failed']);
        await db.UpdateTaskStatus(taskId, 'completed');
        expect((await db.GetTask(taskId))[0]).toBe('completed');
    });

    test('returns ordered extruded data and direct results', async () => {
        const taskId = await db.AddTask('demo', 'generic', '', 'Noop', {});
        await db.AddExtrudedData(taskId, 'first', 'one');
        await db.AddExtrudedData(taskId, 'second', 'two');
        await db.UpdateTaskStatus(taskId, 'completed');
        expect(await db.GetTask(taskId)).toEqual(['completed', [
            { url: 'first', encoded: 'one' },
            { url: 'second', encoded: 'two' }
        ]]);

        await db.SetTaskResults(taskId, [{ ok: true }]);
        expect(await db.GetTask(taskId)).toEqual(['completed', [{ ok: true }]]);
    });

    test('filters keepalive tasks and updates cookies', async () => {
        const taskId = await db.AddTask('session', 'generic', 'old', 'Noop', { fixSession: 'https://example.test' });
        await db.UpdateTaskStatus(taskId, 'completed');
        const replacement = Buffer.from('new').toString('base64');
        await db.UpdateTaskCookies(taskId, replacement);
        await db.UpdateTaskLastKeepalive(taskId);

        const tasks = await db.GetKeepAliveTasks();
        expect(tasks).toHaveLength(1);
        expect(tasks[0]).toMatchObject({ _key: taskId, cookies: replacement, keepalive: 'enabled' });
        expect(tasks[0].lastKeepalive).toEqual(expect.any(String));
    });

    test('supports credential lookup and close/reopen persistence', async () => {
        const taskId = await db.AddTask('demo', 'generic', '', 'Noop', {});
        await db.SetCredentials('victim:tracker', [{ key: 'Password', val: 'secret' }]);
        expect(await db.GetCredentials('victim:tracker')).toEqual([{ key: 'Password', val: 'secret' }]);

        await db.UpdateTaskStatus(taskId, 'completed');
        await db.CloseDatabase();
        await db.CheckDatabase({ path: databasePath });
        expect((await db.GetFullTask(taskId)).status).toBe('completed');
    });

    test('marks interrupted running tasks on database check', async () => {
        const taskId = await db.AddTask('demo', 'generic', '', 'Noop', {});
        await db.UpdateTaskStatus(taskId, 'running');
        await db.RecoverInterruptedTasks();
        expect(await db.GetTask(taskId)).toEqual(['error', 'Interrupted by process restart']);
    });
});
