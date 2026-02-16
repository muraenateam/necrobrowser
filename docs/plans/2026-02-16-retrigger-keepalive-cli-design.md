# Design: Retrigger API, Keepalive, and CLI

## Problem

1. Tasks cannot be re-executed without manually re-submitting the full payload (cookies, params, UA). Redis stores cookies but not task type, function name, params, or user agent.
2. The `necro.keepalive` config exists in `config.toml` but has zero implementation. Sessions die after task completion.
3. No CLI tool exists to inspect necrobrowser state, list sessions, or retrigger tasks.

## Design Decisions

- **Retrigger creates a new task ID** copying cookies/params from the original. Both original and retrigger remain visible in Redis.
- **Keepalive runs in-process** as a `setInterval` loop inside necrobrowser.js, using the existing Puppeteer cluster to load pages.
- **Keepalive refreshes cookies** - after each page load, harvests browser cookies via `page.cookies()` and writes them back to Redis. This handles IdP token rotation.
- **CLI uses HTTP API only** (no direct Redis access). New API endpoints expose session/cookie data.
- **CLI uses `commander`** for structured subcommands.

## Redis Schema Extension

Current `task:<type>:<id>` hash fields: `name`, `cookies`, `status`, `reason`.

New fields added to the same hash:

| Field | Type | Description |
|-------|------|-------------|
| `type` | string | Task type (e.g. "office365", "generic") |
| `taskName` | string | Task function name (e.g. "ScreenshotPages") |
| `params` | JSON string | Full params object |
| `userAgent` | string | Raw UA string |
| `keepalive` | string | "enabled" or "disabled" (default: "enabled" if fixSession exists) |
| `lastKeepalive` | ISO string | Timestamp of last keepalive execution |

## API Changes

### Modified: `POST /instrument`

Store all new fields when creating a task. Modify `db.AddTask()` to accept and persist `type`, `taskName`, `params`, `userAgent`.

### New: `POST /instrument/:id/retrigger`

1. Fetch original task hash from Redis
2. Validate required fields exist (`type`, `taskName`, `cookies`, `params`)
3. Decode cookies (base64 -> JSON)
4. Create new task ID via `db.AddTask()` with all fields
5. Queue to cluster with the appropriate task function
6. Return `{ status: 'queued', necroId: 'task:type:newId', retriggeredFrom: originalId }`

Error 400 if task not found or missing retrigger data.

### New: `GET /sessions`

Scan Redis for all `task:*` keys. For each, return:
- Task ID, type, task name, status
- Cookie count and domains (decoded from base64 cookies)
- Keepalive state and last keepalive timestamp
- UserAgent (truncated)

### New: `POST /instrument/:id/keepalive/enable`

Set the `keepalive` field to "enabled" for the task.

### New: `POST /instrument/:id/keepalive/disable`

Set the `keepalive` field to "disabled" for the task.

## Keepalive Implementation

### Lifecycle

```
Redis cookies -> keepalive loads fixSession URL -> browser receives Set-Cookie
-> page.cookies() harvests fresh values -> base64 encode -> write back to Redis
-> next interval reads fresh cookies from Redis
```

### Mechanism

- After cluster init, if `cfg.necro.keepalive.enabled`:
  - Start `setInterval` at `cfg.necro.keepalive.delay * 1000` ms
  - Each tick: call `db.GetKeepAliveTasks()` to find tasks where `keepalive == "enabled"` and `status` is "completed" or "running" and `params` has `fixSession`
  - For each eligible task: queue a keepalive job through the cluster
  - The keepalive job: set cookies, configure UA, goto fixSession URL, harvest cookies via `page.cookies()`, merge and write back to Redis, take screenshot, update `lastKeepalive` timestamp

### Cookie Merge Logic

After `page.cookies()` returns the browser's cookie jar:
- Match cookies by `name` + `domain` + `path`
- Replace existing cookies with updated values/expiry
- Add any new cookies not in the original set
- Base64-encode the merged array and call `db.UpdateTaskCookies(taskId, b64Cookies)`

This ensures retriggered tasks also get fresh cookies.

## Database Layer Changes (`db/db.js`)

### Modified: `AddTask(name, type, cookies, taskName, params, userAgent)`

Extended signature. Stores all fields in the hash.

### New: `GetFullTask(key)`

Returns all hash fields for a task (for retrigger and sessions endpoint).

### New: `GetAllTasks()`

Scans Redis for `task:*` keys and returns summary data for each.

### New: `UpdateTaskCookies(key, b64Cookies)`

Updates the `cookies` field in the task hash.

### New: `UpdateTaskKeepalive(key, enabled)`

Sets `keepalive` field to "enabled" or "disabled".

### New: `UpdateTaskLastKeepalive(key)`

Sets `lastKeepalive` to current ISO timestamp.

### New: `GetKeepAliveTasks()`

Returns all tasks where `keepalive == "enabled"` and status is "completed" or "running" and params contain `fixSession`.

## CLI Tool (`necrocli.js`)

Standalone script in repo root. Uses `commander` for subcommands and `chalk` for output formatting.

Default API: `http://localhost:3000`, overridable via `--host` flag or `NECRO_API` env var.

### Commands

| Command | API Call | Output |
|---------|----------|--------|
| `necrocli stats` | `GET /` | Cluster status, queue size, workers, error rate |
| `necrocli sessions` | `GET /sessions` | Table: task ID, type, status, cookie count, domains, keepalive state |
| `necrocli tasks` | `GET /tasks` | Available task types and methods |
| `necrocli retrigger <id>` | `POST /instrument/:id/retrigger` | New task ID and status |
| `necrocli status <id>` | `GET /instrument/:id` | Task status and result data |
| `necrocli keepalive enable <id>` | `POST /instrument/:id/keepalive/enable` | Confirmation |
| `necrocli keepalive disable <id>` | `POST /instrument/:id/keepalive/disable` | Confirmation |

## Files to Create/Modify

### Modify
- `db/db.js` - Extended `AddTask`, new methods for full task retrieval, cookie update, keepalive queries
- `necrobrowser.js` - New endpoints (retrigger, sessions, keepalive toggle), keepalive interval loop, extended task storage at POST /instrument
- `package.json` - Add `commander` dependency

### Create
- `necrocli.js` - CLI tool
- `tasks/keepalive/necrotask.js` - Lightweight keepalive task function (load URL, harvest cookies, screenshot)
