'use strict';

const fs = require('fs');
const path = require('path');
const shortid = require('shortid');
const Database = require('better-sqlite3');

let database = null;
let databasePath = null;

const SCHEMA = `
    CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        task_name TEXT NOT NULL DEFAULT '',
        cookies TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL,
        reason TEXT,
        params TEXT NOT NULL DEFAULT '{}',
        user_agent TEXT NOT NULL DEFAULT '',
        results TEXT,
        created_at TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        keepalive TEXT,
        last_keepalive TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_tasks_status_keepalive
        ON tasks (status, keepalive);

    CREATE TABLE IF NOT EXISTS extruded_data (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id TEXT NOT NULL,
        entry_key TEXT NOT NULL,
        encoded TEXT NOT NULL,
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_extruded_task
        ON extruded_data (task_id, id);

    CREATE TABLE IF NOT EXISTS credentials (
        lookup_key TEXT NOT NULL,
        ordinal INTEGER NOT NULL,
        payload TEXT NOT NULL,
        PRIMARY KEY (lookup_key, ordinal)
    );
`;

function resolveDatabasePath(requestedPath) {
    const configuredPath = process.env.NECRO_DB_PATH || requestedPath || './necro.db';
    if (configuredPath === ':memory:') return configuredPath;
    return path.resolve(configuredPath);
}

function protectDatabaseFile(filePath) {
    if (filePath === ':memory:') return;
    for (const candidate of [filePath, `${filePath}-wal`, `${filePath}-shm`]) {
        try { fs.chmodSync(candidate, 0o600); } catch (_) { /* file may not exist yet */ }
    }
}

function openDatabase(requestedPath) {
    const nextPath = resolveDatabasePath(requestedPath);
    if (database && databasePath === nextPath) return database;
    if (database) {
        database.close();
        database = null;
        databasePath = null;
    }

    if (nextPath !== ':memory:') {
        const parent = path.dirname(nextPath);
        const parentExisted = fs.existsSync(parent);
        fs.mkdirSync(parent, { recursive: true, mode: 0o700 });
        if (!parentExisted) {
            try { fs.chmodSync(parent, 0o700); } catch (_) { /* best effort on non-POSIX filesystems */ }
        }
    }

    const nextDatabase = new Database(nextPath);
    nextDatabase.pragma('journal_mode = WAL');
    nextDatabase.pragma('synchronous = FULL');
    nextDatabase.pragma('foreign_keys = ON');
    nextDatabase.pragma('busy_timeout = 5000');
    nextDatabase.exec(SCHEMA);
    protectDatabaseFile(nextPath);
    database = nextDatabase;
    databasePath = nextPath;
    return database;
}

function getDatabase() {
    return database || openDatabase();
}

function mapTask(row) {
    if (!row) return null;
    const task = {
        _key: row.id,
        name: row.name,
        type: row.type,
        taskName: row.task_name,
        cookies: row.cookies,
        status: row.status,
        params: row.params,
        userAgent: row.user_agent,
        createdAt: row.created_at,
        attempts: String(row.attempts)
    };
    if (row.reason !== null) task.reason = row.reason;
    if (row.results !== null) task.results = row.results;
    if (row.keepalive !== null) task.keepalive = row.keepalive;
    if (row.last_keepalive !== null) task.lastKeepalive = row.last_keepalive;
    return task;
}

function taskRow(key) {
    return getDatabase().prepare('SELECT * FROM tasks WHERE id = ?').get(String(key));
}

async function CheckDatabase({ path: requestedPath } = {}) {
    openDatabase(requestedPath);
    return true;
}

async function RecoverInterruptedTasks() {
    getDatabase().prepare(`
        UPDATE tasks
        SET status = 'error', reason = ?
        WHERE status = 'running'
    `).run('Interrupted by process restart');
}

async function CloseDatabase() {
    if (!database) return;
    const current = database;
    database = null;
    databasePath = null;
    try { current.pragma('wal_checkpoint(TRUNCATE)'); } catch (_) { /* close still releases the database */ }
    current.close();
}

async function AddTask(name, task, cookies, taskName, params, userAgent, credentialsKey, credentials) {
    const id = `task:${task}:${shortid.generate()}`;
    const taskParams = params || {};
    const db = getDatabase();
    const insert = db.transaction(() => {
        db.prepare(`
            INSERT INTO tasks (
                id, name, type, task_name, cookies, status, params, user_agent,
                created_at, attempts, keepalive
            ) VALUES (?, ?, ?, ?, ?, 'queued', ?, ?, ?, 0, ?)
        `).run(
            id,
            String(name || ''),
            String(task || ''),
            String(taskName || ''),
            String(cookies || ''),
            JSON.stringify(taskParams),
            String(userAgent || ''),
            new Date().toISOString(),
            taskParams.fixSession ? 'enabled' : null
        );
        if (credentialsKey && Array.isArray(credentials)) replaceCredentials(credentialsKey, credentials);
    });
    insert();
    return id;
}

async function AddExtrudedData(key, entryKey, entryValue) {
    getDatabase().prepare(`
        INSERT INTO extruded_data (task_id, entry_key, encoded)
        VALUES (?, ?, ?)
    `).run(String(key), String(entryKey), String(entryValue));
}

async function UpdateTaskStatus(key, status) {
    getDatabase().prepare('UPDATE tasks SET status = ? WHERE id = ?').run(String(status), String(key));
}

async function UpdateTaskStatusWithReason(key, status, reason) {
    getDatabase().prepare('UPDATE tasks SET status = ?, reason = ? WHERE id = ?')
        .run(String(status), String(reason || ''), String(key));
}

async function SetTaskResults(key, results) {
    getDatabase().prepare('UPDATE tasks SET results = ? WHERE id = ?')
        .run(JSON.stringify(results), String(key));
}

async function GetTask(key) {
    const row = taskRow(key);
    if (!row) return [null, null];
    if (row.status === 'queued') return ['queued', null];
    if (row.status === 'error') return ['error', row.reason];

    if (row.results !== null) {
        try { return [row.status, JSON.parse(row.results)]; } catch (_) { /* fall through to extruded data */ }
    }

    const entries = getDatabase().prepare(`
        SELECT entry_key AS url, encoded
        FROM extruded_data
        WHERE task_id = ?
        ORDER BY id
    `).all(String(key));
    return [row.status, entries];
}

async function GetCredentials(key) {
    const rows = getDatabase().prepare(`
        SELECT payload
        FROM credentials
        WHERE lookup_key = ?
        ORDER BY ordinal
    `).all(String(key));
    try {
        return rows.map(row => JSON.parse(row.payload));
    } catch (_) {
        return ['error', 'getcredentials'];
    }
}

function replaceCredentials(key, entries) {
    const db = getDatabase();
    db.prepare('DELETE FROM credentials WHERE lookup_key = ?').run(String(key));
    const insert = db.prepare(`
        INSERT INTO credentials (lookup_key, ordinal, payload)
        VALUES (?, ?, ?)
    `);
    entries.forEach((value, ordinal) => insert.run(String(key), ordinal, JSON.stringify(value)));
}

async function SetCredentials(key, entries) {
    const db = getDatabase();
    const replace = db.transaction((lookupKey, values) => replaceCredentials(lookupKey, values));
    replace(String(key), Array.isArray(entries) ? entries : []);
}
async function GetFullTask(key) {
    return mapTask(taskRow(key));
}

async function GetAllTasks() {
    const rows = getDatabase().prepare('SELECT * FROM tasks ORDER BY created_at, id').all();
    return rows.map(mapTask);
}

async function UpdateTaskCookies(key, b64Cookies) {
    getDatabase().prepare('UPDATE tasks SET cookies = ? WHERE id = ?')
        .run(String(b64Cookies || ''), String(key));
}

async function UpdateTaskKeepalive(key, enabled) {
    getDatabase().prepare('UPDATE tasks SET keepalive = ? WHERE id = ?')
        .run(enabled ? 'enabled' : 'disabled', String(key));
}

async function UpdateTaskLastKeepalive(key) {
    getDatabase().prepare('UPDATE tasks SET last_keepalive = ? WHERE id = ?')
        .run(new Date().toISOString(), String(key));
}

async function GetKeepAliveTasks() {
    const allTasks = await GetAllTasks();
    return allTasks.filter(task => {
        if (task.keepalive !== 'enabled' || !['completed', 'running'].includes(task.status)) return false;
        try { return !!JSON.parse(task.params || '{}').fixSession; } catch (_) { return false; }
    });
}

module.exports = {
    CheckDatabase,
    RecoverInterruptedTasks,
    CloseDatabase,
    AddTask,
    AddExtrudedData,
    UpdateTaskStatus,
    UpdateTaskStatusWithReason,
    SetTaskResults,
    GetTask,
    GetCredentials,
    SetCredentials,
    GetFullTask,
    GetAllTasks,
    UpdateTaskCookies,
    UpdateTaskKeepalive,
    UpdateTaskLastKeepalive,
    GetKeepAliveTasks
};
