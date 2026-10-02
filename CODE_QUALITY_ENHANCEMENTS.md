# NecroBrowser Code-Quality Enhancements

> Historical roadmap. Core reliability/test items are now implemented in `browser/pool.js`, `lib/app.js`, and the default Jest suite. Cloakbrowser integration is now available as an opt-in launcher; see `docs/config/index.md`. This file is not an operational runbook.

Prioritized roadmap from the September 2026 code-quality review.

## Goals

- Protect session cookies, credentials, tokens, screenshots, and private keys.
- Make task execution deterministic and observable.
- Prevent resource leaks, duplicate work, unbounded storage, and partial writes.
- Make tests isolated, repeatable, and useful in CI.
- Reduce coupling between HTTP routes, SQLite, Puppeteer, and task modules.

## Priority 0 — Security and data protection

### 0.1 Authenticate and authorize API requests

**Current issue:** API binds to `0.0.0.0:3000` by default and has no authentication middleware. Privileged endpoints expose task submission, task results, cookie export, retrigger, and keepalive controls.

**Enhancements:**

- Bind to `127.0.0.1` by default.
- Add configurable API authentication, preferably mTLS or a strong bearer token stored outside source control.
- Add authorization per operation: submit, read status, export cookies, retrigger, manage keepalive, list sessions.
- Add request rate limits and audit logging without recording secrets.
- Return generic error messages to clients; keep details in redacted server logs.
- Add negative tests for unauthenticated and unauthorized requests.

**Acceptance criteria:**

- No privileged route is reachable without valid credentials.
- Cookie export requires explicit authorization.
- Default configuration does not expose the service publicly.

### 0.2 Remove secret and session-data logging

Remove or redact:

- Cookies and cookie values.
- Private SSH keys and public-key material where unnecessary.
- TOTP secrets and generated OTPs.
- Passwords, task parameters containing credentials, Telegram tokens, and SQLite URLs.
- Full task payloads in error objects.

Create one structured logger with field-level redaction and consistent log levels. Add tests proving sensitive values never appear in log output.

### 0.3 Restore TLS verification by default

Set `ignoreHTTPSErrors = false` by default. Permit opt-in override only for controlled local test targets. Emit a startup warning whenever certificate verification is disabled.

### 0.4 Restrict navigation and filesystem output

**Current issue:** submitted URLs and `outputPath` can be client-controlled.

**Enhancements:**

- Allow only `http` and `https` URLs.
- Add configurable host/network allowlists where deployment permits.
- Reject loopback, link-local, private, and metadata-service destinations unless explicitly enabled for testing.
- Resolve output paths with `path.resolve` and verify they remain inside configured `extrusionPath`.
- Ignore client-provided output directories by default; use server-selected task paths.
- Enforce limits on URL count, URL length, screenshot size, task batch size, and total request size.

**Acceptance criteria:**

- A request cannot write outside the configured extrusion directory.
- Invalid schemes and disallowed destinations are rejected before a browser launches.
- Limits return HTTP 400/413 with stable error codes.

## Priority 1 — Correctness and reliability

### 1.1 Validate configuration at startup

Refactor `puppeteer/cluster.js` configuration parsing into schema validation.

- Fail immediately when TOML parsing fails.
- Validate required nested fields and types.
- Check both `extrusionPath` and `profilesPath`; reject if either is missing or not a directory.
- Validate supported platform and concurrency values.
- Resolve paths once and use resolved paths everywhere.
- Avoid `process.exit()` inside reusable modules; throw typed startup errors and let the entry point decide how to exit.

### 1.2 Remove dynamic `eval()` task lookup

Replace string-built `eval()` calls in `necrobrowser.js` and `tasks/loader.js` with an object lookup:

```js
const taskModule = necrotask[`${taskType}__Tasks`];
const taskFn = taskModule[taskName];
```

Keep task type/name validation, but treat it as input validation rather than a security boundary around executable code.

### 1.3 Make task lifecycle transactional

Current batch submission can persist and queue earlier tasks before a later item fails. SQLite records can also remain `queued` if cluster queueing fails.

Enhancements:

- Validate the entire batch before writing anything.
- Add a task state transition helper with allowed transitions.
- Mark queue failures as `error` with a safe reason.
- Return per-item results for partial batch outcomes, or reject the whole batch atomically.
- Add idempotency keys for clients that retry requests.
- Record `startedAt`, `completedAt`, retry count, and failure category.

### 1.4 Fix keepalive concurrency

The interval currently selects eligible tasks without a lock, so long-running sessions can be queued repeatedly.

Enhancements:

- Add a SQLite lease/lock per task with expiry.
- Store `nextKeepaliveAt` and select only due tasks.
- Release or expire the lease in `finally` blocks.
- Record keepalive success and failure separately from the original task status.
- Add a bounded concurrency limit for keepalive jobs.

### 1.5 Handle fatal process errors safely

Do not continue normal operation after `uncaughtException` or `unhandledRejection`.

- Stop accepting new requests.
- Prevent new queue submissions.
- Close the HTTP server, cluster, and SQLite client.
- Log a redacted diagnostic record.
- Exit and let a process supervisor restart the service.
- Add graceful shutdown handlers for `SIGTERM` and `SIGINT`.

### 1.6 Standardize task errors

Many tasks catch errors with `.catch(console.error)` and then report success. Define a task result/error contract:

- `completed`: all requested work succeeded.
- `partial`: some work succeeded and some failed.
- `error`: task could not perform its required operation.
- Include per-item error records without secrets.

The wrapper should own fatal status updates. Task modules should throw typed errors instead of silently swallowing failures.

## Priority 2 — Persistence and API quality

### 2.1 Bound task enumeration and retention

`GetAllTasks()` now uses indexed SQLite queries instead of key scans. Remaining work:

- Add pagination to `/sessions`.
- Add task and extrusion retention policies using scheduled cleanup.
- Keep status and keepalive indexes aligned with query patterns.

### 2.2 Define stable result schemas

The `encoded` result field sometimes contains base64 data and sometimes a filesystem path.

Choose one explicit shape, for example:

```json
{
  "kind": "screenshot",
  "url": "https://example.test/",
  "encoding": "base64",
  "value": "..."
}
```

For filesystem results, return a controlled artifact identifier rather than an arbitrary host path. Document response schemas for every endpoint.

### 2.3 Strengthen request validation

Use a single schema validator for:

- `name` and `userAgent` types and lengths.
- Non-empty task arrays and maximum batch size.
- String task names.
- Parameter object shape and serialized size.
- Cookie array shape, allowed fields, and maximum count.
- URL syntax, scheme, count, and length.
- Keepalive parameters and task identifiers.

Return stable machine-readable error codes alongside human-readable messages.

### 2.4 Protect SQLite data

- Make database path explicit rather than relying on implicit defaults.
- Do not expose database paths in errors.
- Keep database directory mode `0700` and database files mode `0600`.
- Add retention and cleanup for task results, cookie data, and screenshots.

### 2.5 Secure sensitive SQLite payloads

- Encrypt cookies, credentials, and other sensitive payloads at rest when deployment requires it.
- Store encryption keys outside source control and document backup/recovery.
- Add tests proving sensitive values do not appear in logs.

### 2.6 Separate application construction from process startup

Refactor `necrobrowser.js` into testable units:

- `createApp({ db, cluster, tasks, logger, config })`.
- `startServer(app, config)`.
- `createKeepaliveScheduler(...)`.
- `createTaskService(...)`.

Keep process signal handling and dependency construction in a small entry point. This allows route tests without launching Chromium or SQLite.

### 2.7 Centralize configuration and paths

Remove hardcoded paths such as `/home/natalinux/...` and relative `extrusion/` references. Inject a path service backed by resolved configuration. Use `path.join()` rather than string concatenation.

### 2.8 Remove dead code and incomplete helpers

Review and either implement or delete:

- `timedGoto()` TODO.
- Unused imports and variables.
- Commented-out production logic.
- Duplicate screenshot helpers.
- Legacy `crypto` package dependency; use Node's built-in module.
- Repeated `Sleep()` calls where selector/network waits are more reliable.

### 2.9 Standardize style and tooling

Add:

- ESLint with a repository configuration.
- Prettier or an agreed formatting rule.
- JSDoc/types for task payloads and database records, or migrate core boundaries to TypeScript.
- `npm run lint`, `npm run format:check`, and `npm run typecheck` scripts.
- Pre-commit checks for secrets and accidental artifacts.

## Priority 4 — Dependencies and supply chain

### 4.1 Correct dependency classification

Runtime code imports packages currently listed under `devDependencies`, including Puppeteer cluster, Puppeteer Extra, stealth plugin, and TOTP generation. Move runtime packages to `dependencies`; remove duplicate entries.

### 4.2 Resolve audit findings deliberately

`npm audit --omit=dev` reported 13 vulnerabilities, including issues through Puppeteer archive extraction and the Telegram bot dependency chain.

Process:

1. Create a dependency-update branch.
2. Upgrade direct dependencies one at a time or in small tested groups.
3. Review breaking changes, especially Puppeteer, Telegram, SQLite, and Express.
4. Run unit, integration, and browser smoke tests.
5. Re-run `npm audit --omit=dev`.
6. Record accepted residual risk if a transitive issue cannot yet be removed.

Do not use `npm audit fix --force` without reviewing resulting major-version changes.

## Priority 5 — Test strategy

### 5.1 Make test startup hermetic

Current global setup hardcodes port 3000 and failed with `EADDRINUSE`.

Enhancements:

- Allocate an ephemeral port.
- Pass test configuration through environment variables.
- Detect child-process exit immediately.
- Do not use detached child processes.
- Always clean up the child process in `finally`.
- Isolate SQLite databases with unique temporary paths.
- Use a local deterministic HTTP fixture instead of public websites.

### 5.2 Add unit tests

Cover:

- Configuration parsing and validation.
- Request schemas and size limits.
- Task lookup without `eval()`.
- Path containment checks.
- URL policy checks.
- State transitions and queue failure handling.
- Keepalive lock acquisition/release.
- Cookie transformation and export.
- Result serialization and redaction.

### 5.3 Add integration tests

Cover:

- Authentication and authorization for every route.
- Batch validation before persistence.
- SQLite close/reopen persistence.
- Task timeout and retry behavior.
- Duplicate keepalive prevention.
- Graceful shutdown.
- Partial task outcomes.

### 5.4 Make browser tests opt-in

Separate fast mocked tests from real-browser tests. Mark external/browser tests explicitly and run them only when dependencies and a local fixture are available.

## Suggested implementation sequence

1. Add authentication, loopback default, body/rate limits, and secret redaction.
2. Add strict schemas, URL policy, and output-path containment.
3. Remove `eval()` and hardcoded paths.
4. Fix configuration validation and graceful shutdown.
5. Add task state machine, queue-failure handling, and keepalive leases.
6. Standardize result schemas and improve SQLite indexing/retention.
7. Refactor app construction for unit testing.
8. Repair test harness and add deterministic fixtures.
9. Move runtime dependencies and resolve audit findings.
10. Add linting, type checks, CI gates, and secret scanning.

## Definition of done

- `npm test` passes from a clean checkout without a pre-existing server.
- Lint, formatting, and type checks pass.
- Production startup fails clearly on invalid configuration.
- No route exposes cookies or task execution without authorization.
- No task can navigate to a disallowed destination or write outside configured storage.
- No logs contain cookie values, tokens, passwords, TOTP values, or private keys.
- SQLite queries are indexed and task data has retention controls.
- Dependency audit has no unreviewed high/critical findings.
- Operational runbook documents secrets, shutdown, backups, retention, and recovery.

### 2.2 Define stable result schemas

The `encoded` result field sometimes contains base64 data and sometimes a filesystem path.

Choose one explicit shape, for example:

```json
{
  "kind": "screenshot",
  "url": "https://example.test/",
  "encoding": "base64",
  "value": "..."
}
```

For filesystem results, return a controlled artifact identifier rather than an arbitrary host path. Document response schemas for every endpoint.

### 2.3 Strengthen request validation

Use a single schema validator for:

- `name` and `userAgent` types and lengths.
- Non-empty task arrays and maximum batch size.
- String task names.
- Parameter object shape and serialized size.
- Cookie array shape, allowed fields, and maximum count.
- URL syntax, scheme, count, and length.
- Keepalive parameters and task identifiers.

Return stable machine-readable error codes alongside human-readable messages.

### 2.4 Protect SQLite data

- Make SQLite path/configuration explicit rather than relying on implicit defaults.
- Do not expose SQLite connection details in errors.
- Add retention and cleanup for task results, cookie data, and screenshots.

## Priority 3 — Maintainability

### 3.1 Separate application construction from process startup

Refactor `necrobrowser.js` into testable units:

- `createApp({ db, cluster, tasks, logger, config })`.
- `startServer(app, config)`.
- `createKeepaliveScheduler(...)`.
- `createTaskService(...)`.

Keep process signal handling and dependency construction in a small entry point. This allows route tests without launching Chromium or SQLite.

### 3.2 Centralize configuration and paths

Remove hardcoded paths such as `/home/natalinux/...` and relative `extrusion/` references. Inject a path service backed by resolved configuration. Use `path.join()` rather than string concatenation.

### 3.3 Remove dead code and incomplete helpers

Review and either implement or delete:

- `timedGoto()` TODO.
- Unused imports and variables.
- Commented-out production logic.
- Duplicate screenshot helpers.
- Legacy `crypto` package dependency; use Node's built-in module.
- Repeated `Sleep()` calls where selector/network waits are more reliable.

### 3.4 Standardize style and tooling

Add:

- ESLint with a repository configuration.
- Prettier or an agreed formatting rule.
- JSDoc/types for task payloads and database records, or migrate core boundaries to TypeScript.
- `npm run lint`, `npm run format:check`, and `npm run typecheck` scripts.
- Pre-commit checks for secrets and accidental artifacts.

## Priority 4 — Dependencies and supply chain

### 4.1 Correct dependency classification

Runtime code imports packages currently listed under `devDependencies`, including Puppeteer cluster, Puppeteer Extra, stealth plugin, and TOTP generation. Move runtime packages to `dependencies`; remove duplicate entries.

### 4.2 Resolve audit findings deliberately

`npm audit --omit=dev` reported 13 vulnerabilities, including issues through Puppeteer archive extraction and the Telegram bot dependency chain.

Process:

1. Create a dependency-update branch.
2. Upgrade direct dependencies one at a time or in small tested groups.
3. Review breaking changes, especially Puppeteer, Telegram, SQLite, and Express.
4. Run unit, integration, and browser smoke tests.
5. Re-run `npm audit --omit=dev`.
6. Record accepted residual risk if a transitive issue cannot yet be removed.

Do not use `npm audit fix --force` without reviewing resulting major-version changes.

## Priority 5 — Test strategy

### 5.1 Make test startup hermetic

Current global setup hardcodes port 3000 and failed with `EADDRINUSE`.

Enhancements:

- Allocate an ephemeral port.
- Pass test configuration through environment variables.
- Detect child-process exit immediately.
- Do not use detached child processes.
- Always clean up the child process in `finally`.
- Isolate SQLite keys with a test namespace.
- Use a local deterministic HTTP fixture instead of public websites.

### 5.2 Add unit tests

Cover:

- Configuration parsing and validation.
- Request schemas and size limits.
- Task lookup without `eval()`.
- Path containment checks.
- URL policy checks.
- State transitions and queue failure handling.
- Keepalive lock acquisition/release.
- Cookie transformation and export.
- Result serialization and redaction.

### 5.3 Add integration tests

Cover:

- Authentication and authorization for every route.
- Batch validation before persistence.
- SQLite reconnect behavior.
- Task timeout and retry behavior.
- Duplicate keepalive prevention.
- Graceful shutdown.
- Partial task outcomes.

### 5.4 Make browser tests opt-in

Separate fast mocked tests from real-browser tests. Mark external/browser tests explicitly and run them only when dependencies and a local fixture are available.

## Suggested implementation sequence

1. Add authentication, loopback default, body/rate limits, and secret redaction.
2. Add strict schemas, URL policy, and output-path containment.
3. Remove `eval()` and hardcoded paths.
4. Fix configuration validation and graceful shutdown.
5. Add task state machine, queue-failure handling, and keepalive leases.
6. Standardize result schemas and improve SQLite indexing/retention.
7. Refactor app construction for unit testing.
8. Repair test harness and add deterministic fixtures.
9. Move runtime dependencies and resolve audit findings.
10. Add linting, type checks, CI gates, and secret scanning.

## Definition of done

- `npm test` passes from a clean checkout without a pre-existing server.
- Lint, formatting, and type checks pass.
- Production startup fails clearly on invalid configuration.
- No route exposes cookies or task execution without authorization.
- No task can navigate to a disallowed destination or write outside configured storage.
- No logs contain cookie values, tokens, passwords, TOTP values, or private keys.
- SQLite scans are bounded and task data has retention controls.
- Dependency audit has no unreviewed high/critical findings.
- Operational runbook documents secrets, shutdown, backups, retention, and recovery.
