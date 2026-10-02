# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Reliability rules

- Browser ownership belongs to `browser/pool.js`; tasks must not close pool-owned pages, contexts, or browsers.
- Default tests use dependency injection, local fixtures, and ephemeral ports. Do not restore fixed-port or public-network test setup.
- Treat task failures as errors; do not swallow failures when an operation is required.
- Use `NECRO_DB_PATH` for isolated local database environments.
- Cloakbrowser is opt-in under `necro.cloak.enabled`; stock Puppeteer remains default.

## About Necrobrowser

Necrobrowser is a browser instrumentation microservice written by antisnatchor in NodeJS that uses Puppeteer to control Chrome/Firefox instances in headless and GUI mode. It's designed for post-phishing automation, session hijacking, and browser-based red teaming tasks. The microservice exposes a REST API for queuing browser automation tasks that run in a managed cluster of browser instances with local SQLite persistence.

## Core Architecture

### Main Components

- **necrobrowser.js**: Process entry point, runtime construction, HTTP startup, and graceful shutdown
- **puppeteer/cluster.js**: Parses and validates TOML configuration for the browser pool
- **browser/pool.js**: Owns bounded browser concurrency, isolation, timeouts, retries, metrics, and cleanup
- **lib/app.js**: Dependency-injected Express application and API routes
- **db/db.js**: SQLite interface for task persistence, status tracking, and data extrusion
- **tasks/loader.js**: Loads task modules into a static registry and validates task type/name parameters
- **tasks/helpers/necrohelp.js**: Shared utilities for screenshots, TOTP generation, and page manipulation

### Task System

Active tasks are organized in `tasks/<type>/necrotask.js` files (e.g., `office365`, `github`, `gsuite`, `generic`, `atlassian`). Each task exports async functions that receive `{ page, data: [taskId, cookies, params] }`; the pool owns page, context, and browser lifecycle. Optional local pre-migration copies live under ignored `custom.local/` and are never loaded. The loader builds a static registry and dispatches functions directly; no dynamic evaluation.

Tasks interact with the browser session through Puppeteer's `page` object and update their status via `db.UpdateTaskStatus(taskId, "running"|"completed"|"error")`.

### Data Flow

1. Client POSTs to `/instrument` with task type/name, cookies, and params
2. Task queued in local SQLite with generated ID (`task:<type>:<shortid>`)
3. Cluster worker picks up task, sets cookies, executes automation
4. Task saves extruded data to SQLite via `db.AddExtrudedData()`
5. Client polls `/instrument/:id` to retrieve status and results

### Concurrency Models

Configured in `config.toml` under `cluster.concurrency`:
- **necro**: Full user-data-dir segregation, each task in its own browser with isolated profile
- **browser**: Each task in its own browser instance
- **page**: Each task in its own isolated context/page (single browser)

### Browser sizing and visibility

- `necro.headless = true` launches headless Chrome and applies `cluster.page.windowSize` as Puppeteer viewport dimensions.
- `necro.headless = false` launches visible Chrome with `defaultViewport: null`; `cluster.page.windowSize` is passed as `--window-size=<width,height>`.
- This sets configured window/viewport size; it does not guarantee operating-system maximize or monitor fullscreen.
- Restart Necrobrowser after changing `config.toml` or runtime code. Existing processes do not reload configuration or modules.

### Task status and output

Tasks set `running` before browser work and must end as `completed`, `partial`, or `error`. Multi-URL tasks may return `partial` with per-URL failures. Screenshots and downloaded files must stay under configured `platform.extrusionPath`; use shared output helpers instead of hardcoded paths.

Cookie-Editor exports are normalized before injection. Cookies without `domain` or `url` context are skipped because Puppeteer cannot apply them safely. Required navigation uses `necrohelp.timedGoto()` for HTTP(S) validation and bounded timeouts.

## Configuration

All configuration is in `config.toml`:
- Platform settings: `platform.type` (freebsd/linux/darwin), `platform.puppetPath` (Chrome executable)
- Cluster settings: `cluster.poolSize` (parallel browsers), `cluster.taskTimeout` (seconds), `cluster.concurrency`
- Browser options: `necro.headless` (true/false), `cluster.page.windowSize`, `cluster.page.scaleFactor`
- Optional Cloakbrowser: `necro.cloak.enabled`, `necro.cloak.humanize`, and documented adapter options
- Paths: `platform.extrusionPath` (where files/screenshots are saved), `platform.profilesPath` (browser profiles)

## Development Commands

### Starting Necrobrowser
```bash
npm start
```

Service binds to `127.0.0.1:3000` by default. Set `NECRO_DB_PATH` for isolated environments. Stop with `SIGTERM` or `SIGINT` for graceful browser/database cleanup. If port 3000 is already occupied, stop the old process before restarting; starting a second instance on same port fails with `EADDRINUSE`.

For controlled external smoke tests, use no real accounts or cookies. Queue `generic.ScreenshotPages` with public URLs and an output path under configured extrusion directory, then poll `GET /instrument/:id` until terminal status and verify returned files exist. Keep this workflow opt-in; default tests use local fixtures.

### Testing
```bash
npm test
npm run test:unit
npm run test:integration
npm run check
```

Default tests use dependency injection, local fixtures, and ephemeral ports. Legacy public-network/browser tests are not part of the default suite.

### API Endpoints
- `GET /` - Cluster status and queue information
- `GET /tasks` - List all available task types and methods
- `POST /instrument` - Queue a new task (returns necroId immediately)
- `GET /instrument/:id` - Poll task status and retrieve results

## Writing New Tasks

1. Create `tasks/<tasktype>/necrotask.js` with exported async functions.
2. Use signature `async ({ page, data: [taskId, cookies, params] }) => { ... }`.
3. Update task status to `running` at start and a terminal status (`completed`, `partial`, or `error`) before return/throw.
4. Set cookies through `necrohelp.SetCookieJar(page, cookies)`; do not pass malformed context-free cookies to Puppeteer.
5. Navigate required URLs through `necrohelp.timedGoto(page, url)`.
6. Save data with `db.AddExtrudedData()` or under configured extrusion path using `necrohelp.getOutputPath()` or equivalent containment checks.
7. Never create or close browser resources from task code. Pool owns page, context, browser, retries, timeout, and cleanup.

Task type and name must be alphanumeric (validated by `necrohelp.IsAlphanumeric()`).

## Key Implementation Details

### FreeBSD Support
The platform uses a hack to make Puppeteer work on FreeBSD by mocking `os.arch()` to return 'arm64' and symlinking Chrome to `/usr/bin/chromium-browser` (see cluster.js:30-48).

### Cloakbrowser launcher
Cloakbrowser is an optional ESM Puppeteer adapter selected by `necro.cloak.enabled`. `puppeteer/launcher.js` bridges it into the CommonJS runtime. Stock Puppeteer remains default; use Cloakbrowser only for authorized lab/CTF targets.

### Cookie Handling
For Office365 tasks, both `.office365.com` AND `.login.microsoftonline.com` cookies are required (37 total) for full session control across app switches (see office365/necrotask.js:99-101 comment).

### iFrame DOM Access
Office365 apps use iFrames heavily. The `--disable-features=site-per-process` Chrome flag is critical (cluster.js:127, 134). Access iFrame content via `page.$('#WebApplicationFrame')` then `contentFrame()` (office365/necrotask.js:193-194).

### UserAgent Spoofing
The `ConfigureUserAgent()` helper in `tasks/helpers/necrohelp.js` configures browser fingerprint matching using the supplied User-Agent. It parses the UA with `ua-parser-js` to set `navigator.platform`, mobile viewport, and uses CDP `Emulation.setUserAgentOverride` for JavaScript-level consistency. Call it before first navigation when task parameters provide a user agent. The `userAgent` field is passed from Muraena via the `%%%USERAGENT%%%` template placeholder in the instrument profile.

### Error Handling
Required operations must propagate failures. Update status with `db.UpdateTaskStatusWithReason(taskId, "error", reason)` on fatal errors. Use `partial` only when multi-item work produced some successful results and return per-item failures. Avoid `.catch(console.error)` for required navigation, screenshots, downloads, or persistence.

## Dependencies

Install with `npm install`. Key dependencies:
- `puppeteer` - Default browser automation
- `cloakbrowser` + `puppeteer-core` - Optional Cloakbrowser launcher dependencies
- `better-sqlite3` - Local task/session persistence
- `express` - REST API
- `toml` - Config parsing
- `totp-generator` - For 2FA tasks

## SQLite Storage

- Database path: `./necro.db` by default; override with `[database].path` or `NECRO_DB_PATH`.
- `tasks` stores task metadata, status, cookies, parameters, results, and keepalive state.
- `extruded_data` stores ordered task output.
- `credentials` stores imported external credential lookups for tasks that need them.
- Database contains session cookies. Keep its directory private and protect backups.

## Testing Examples

See `testing/` directory for complete task examples:
- `office365.addAuthApp.json` - Add authenticator app with Telegram notification
- `office365.dumpEmails.json` - Search and extrude emails by keywords
- `office365.writeEmail.json` - Send email from hijacked session
- `generic.screenshotPages.json` - Screenshot multiple URLs
- `github.plantAndDump.json` - GitHub automation example
