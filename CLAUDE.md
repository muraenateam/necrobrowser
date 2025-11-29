# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## About Necrobrowser

Necrobrowser is a browser instrumentation microservice written by antisnatchor in NodeJS that uses Puppeteer to control Chrome/Firefox instances in headless and GUI mode. It's designed for post-phishing automation, session hijacking, and browser-based red teaming tasks. The microservice exposes a REST API for queuing browser automation tasks that run in a managed cluster of browser instances with Redis-based persistence.

## Core Architecture

### Main Components

- **necrobrowser.js**: Entry point that initializes the Express server, Redis connection, Puppeteer cluster, and REST API endpoints
- **puppeteer/cluster.js**: Manages the Puppeteer cluster lifecycle, configuration parsing (TOML), and concurrency models
- **db/db.js**: Redis interface for task persistence, status tracking, and data extrusion
- **tasks/loader.js**: Dynamically loads task modules from `tasks/*/necrotask.js` files and validates task type/name parameters
- **tasks/helpers/necrohelp.js**: Shared utilities for screenshots, TOTP generation, and page manipulation

### Task System

Tasks are organized in `tasks/<type>/necrotask.js` files (e.g., `office365`, `github`, `gsuite`, `generic`, `atlassian`). Each task exports async functions that receive `{ page, data: [taskId, cookies, params] }` or `{ browser, page, data: [...] }`. The loader validates task types/names are alphanumeric before eval() execution (line necrobrowser.js:111).

Tasks interact with the browser session through Puppeteer's `page` object and update their status via `db.UpdateTaskStatus(taskId, "running"|"completed"|"error")`.

### Data Flow

1. Client POSTs to `/instrument` with task type/name, cookies, and params
2. Task queued in Redis with generated ID (`task:<type>:<shortid>`)
3. Cluster worker picks up task, sets cookies, executes automation
4. Task saves extruded data to Redis via `db.AddExtrudedData()`
5. Client polls `/instrument/:id` to retrieve status and results

### Concurrency Models

Configured in `config.toml` under `cluster.concurrency`:
- **necro**: Full user-data-dir segregation, each task in its own browser with isolated profile
- **browser**: Each task in its own browser instance
- **page**: Each task in its own incognito page (single browser)

## Configuration

All configuration is in `config.toml`:
- Platform settings: `platform.type` (freebsd/linux/darwin), `platform.puppetPath` (Chrome executable)
- Cluster settings: `cluster.poolSize` (parallel browsers), `cluster.taskTimeout` (seconds), `cluster.concurrency`
- Browser options: `necro.headless` (true/false), `cluster.page.windowSize`, `cluster.page.scaleFactor`
- Paths: `platform.extrusionPath` (where files/screenshots are saved), `platform.profilesPath` (browser profiles)

## Development Commands

### Starting Necrobrowser
```bash
node necrobrowser.js

# With verbose cluster logging:
DEBUG='puppeteer-cluster:*' node necrobrowser.js
```

### Testing Tasks
Example JSON payloads are in `testing/` directory. Use curl or similar to POST to `http://localhost:3000/instrument`:
```bash
curl -X POST http://localhost:3000/instrument \
  -H "Content-Type: application/json" \
  -d @testing/office365.addAuthApp.json
```

### API Endpoints
- `GET /` - Cluster status and queue information
- `GET /tasks` - List all available task types and methods
- `POST /instrument` - Queue a new task (returns necroId immediately)
- `GET /instrument/:id` - Poll task status and retrieve results

## Writing New Tasks

1. Create `tasks/<tasktype>/necrotask.js` with exported async functions
2. Each function signature: `async ({ page, data: [taskId, cookies, params] }) => { ... }`
3. Update task status: `await db.UpdateTaskStatus(taskId, "running")` at start
4. Set cookies: `await page.setCookie(...cookies)`
5. Navigate and automate: Use Puppeteer API
6. Save data: `await db.AddExtrudedData(taskId, key, base64data)` or save to `extrusionPath`
7. Complete: `await db.UpdateTaskStatus(taskId, "completed")` or `"error"` with reason

Task type and name must be alphanumeric (validated by `necrohelp.IsAlphanumeric()`).

## Key Implementation Details

### FreeBSD Support
The platform uses a hack to make Puppeteer work on FreeBSD by mocking `os.arch()` to return 'arm64' and symlinking Chrome to `/usr/bin/chromium-browser` (see cluster.js:30-48).

### Stealth Plugin
Puppeteer-extra with stealth plugin is used to avoid bot detection (necrobrowser.js:40).

### Cookie Handling
For Office365 tasks, both `.office365.com` AND `.login.microsoftonline.com` cookies are required (37 total) for full session control across app switches (see office365/necrotask.js:99-101 comment).

### iFrame DOM Access
Office365 apps use iFrames heavily. The `--disable-features=site-per-process` Chrome flag is critical (cluster.js:127, 134). Access iFrame content via `page.$('#WebApplicationFrame')` then `contentFrame()` (office365/necrotask.js:193-194).

### Error Handling
Tasks should use `.catch(console.error)` for non-critical operations and update status with `db.UpdateTaskStatusWithReason(taskId, "error", reason)` on fatal errors.

## Dependencies

Install with `npm install`. Key dependencies:
- `puppeteer` (v19.2.2) - Browser automation
- `@muraenateam/puppeteer-cluster` - Custom cluster manager (devDep, used in production)
- `puppeteer-extra` + `puppeteer-extra-plugin-stealth` - Stealth mode
- `redis` (v3.0.2) - Task persistence
- `express` - REST API
- `toml` - Config parsing
- `totp-generator` - For 2FA tasks

## Redis Schema

- Task: `task:<type>:<id>` → HMSET with `name`, `cookies` (base64 JSON), `status`, optional `reason`
- Extruded data list: `task:<type>:<id>:extruded` → RPUSH of data keys
- Data entry: `task:<type>:<id>:extruded:<id>` → HMSET with `url`, `encoded` (base64)

## Testing Examples

See `testing/` directory for complete task examples:
- `office365.addAuthApp.json` - Add authenticator app with Telegram notification
- `office365.dumpEmails.json` - Search and extrude emails by keywords
- `office365.writeEmail.json` - Send email from hijacked session
- `generic.screenshotPages.json` - Screenshot multiple URLs
- `github.plantAndDump.json` - GitHub automation example
