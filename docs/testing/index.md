---
layout: default
title: Testing
permalink: /testing
nav_order: 8
has_toc: true
---

# Testing

Default tests use dependency injection, local fixtures, ephemeral ports, and isolated SQLite. No real account, harvested cookie, or public website belongs in default CI.

## Command matrix

| Command | Scope | External browser/network |
| --- | --- | --- |
| `npm test` | Default Jest suite: DB, integration, migration, policy, unit, launcher | No real browser/public network |
| `npm run test:unit` | Unit suite | No |
| `npm run test:integration` | Local HTTP fixture and queue flow | Local fixture only |
| `npm run test:coverage` | Default suite with coverage | No |
| `npm run check` | Node syntax checks, including launcher and E2E source | No |
| `npm run test:e2e` | `test/browser.e2e.js`: local HTTP fixture, Chromium, cookies, interaction, screenshots | Chromium; local only |
| `npm run test:e2e:external` | Local E2E plus opt-in `example.com` smoke | Public network; intentional only |
| `npm run test:all` | Default suite, check, local E2E | Chromium; local only |
| `npm run test:all:external` | All above plus external smoke | Public network |

Run commands from repository root. Node requirement: `>=22`.

## Suite map

- `test/unit.test.js`: validation, loader, BrowserPool limits/cleanup, cookie helpers, app factory.
- `test/integration.test.js`: task queue and local fixture through HTTP API.
- `test/db.test.js`: SQLite persistence, status, credentials, keepalive fields, recovery.
- `test/migration.test.js`: active task layout, output containment, resource ownership rules.
- `test/policy.test.js`: URL policy, audit redaction, cookie dry-run, rate limits.
- `test/launcher.test.js`: stock/Cloakbrowser selection, ESM adapter bridge, option forwarding, missing package errors.
- `test/generic.test.js`: Click, Fill, Press, Scroll primitives, selector validation, timing/output behavior.
- `test/browser.e2e.js`: opt-in real Chromium local fixture. `NECRO_RUN_BROWSER_TESTS=1` enables it; `NECRO_EXTERNAL_SMOKE=1` enables only external test.
Default `npm test` discovers `test/**/*.test.js` and currently includes DB, generic, integration, launcher, migration, policy, and unit suites. `test/api.test.js` and `test/tasks.test.js` are additional API/task workflows excluded by `jest.e2e.config.js` path filters; run deliberately after reviewing their network/database assumptions.

## Local docs preview

From repository root, run `make docs` to validate fixtures, render the Markdown site with Node/npm, open `http://127.0.0.1:4000/`, and keep live preview attached to the terminal. Press Ctrl-C to stop. Use `make docs-build` for a build-only check. Ruby/Jekyll parity is optional via `make docs-jekyll`.

## Rules for new tests

- Use `127.0.0.1` and port `0`; never bind fixed ports.
- Use `NECRO_DB_PATH` or `:memory:` for isolated databases.
- Use `http.createServer()` fixtures and temporary directories for browser work.
- Await HTTP, browser, context, and database cleanup in teardown.
- Inject `launch`, `db`, `cluster`, and task registries where possible.
- Keep real browser tests opt-in and deterministic.
- Do not use real accounts, passwords, OTP secrets, session cookies, or destructive actions.
- Do not turn public smoke tests into default CI.

## Local E2E flow

`test/browser.e2e.js` creates a temporary fixture with a cookie-gated section, queues a test-only task, injects a cookie, clicks/types/submits, saves a screenshot, persists results, then removes temporary resources. This is the model for new browser tests.

## Cloakbrowser tests

Cloakbrowser is opt-in through `[necro.cloak] enabled = true`. Launcher unit tests mock the adapter. A live Cloakbrowser smoke test needs an installed compatible Chromium binary; keep it local and authorized. Stock Puppeteer remains default for the normal E2E suite.
