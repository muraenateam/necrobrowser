# NecroBrowser tests

Default tests are deterministic and do not require an external database service, Chromium, a fixed port, or public network access.

## Commands

```bash
npm test
npm run test:unit
npm run test:integration
npm run test:coverage
npm run check
```

## Layout

- `unit.test.js` — validation, task loader, browser-pool behavior, and dependency-injected app tests.
- `integration.test.js` — app-to-task flow against a local HTTP fixture and ephemeral ports.
- `api.test.js` / `tasks.test.js` — legacy full-process/browser suites; excluded from the default suite until migrated to local fixtures.
- `setup.js` — shared polling helper; no global server or database service startup.

## Test rules

- Never bind a fixed port.
- Never delete shared database files. Global setup creates an isolated temporary SQLite database for spawned-server tests.
- Never call public websites from default tests.
- Use local fixture servers and temporary directories for browser tests.
- Return and await server, browser, and database cleanup handles.
- Keep real-browser tests opt-in; mock browser pages for unit tests.

## Real browser E2E tests

Run local Puppeteer workflow tests explicitly:

```bash
npm run test:e2e
```

These tests launch Chromium and use an ephemeral local fixture. They verify cookie injection, cookie-gated content, button clicks, input typing, form submission, screenshot creation, and SQLite result storage. They create temporary profiles/database/output directories and remove them during teardown.

External smoke test against `example.com` remains opt-in:

```bash
npm run test:e2e:external
```

Do not use external smoke tests as default CI checks. They require Chromium and network availability.

Real browser smoke tests must use local fixtures for deterministic routes, navigation, cookies, screenshots, and downloads. External account workflows do not belong in CI.
