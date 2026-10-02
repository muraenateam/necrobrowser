---
layout: default
title: Architecture
permalink: /architecture
nav_order: 5
has_children: true
has_toc: true
---

# Architecture

NecroBrowser is a Node.js HTTP service. `necrobrowser.js` builds the runtime, `lib/app.js` exposes routes, SQLite persists task state, and `browser/pool.js` owns browser resources.

## Request flow

```text
POST /instrument
  -> validate task, cookies, URLs, and policy
  -> persist task in SQLite
  -> queue task in BrowserPool
  -> create browser/context/page
  -> task sets cookies and optional User-Agent
  -> task navigates and extracts data
  -> persist status and extruded results
  -> GET /instrument/:id polls status/results
```

## Components

- `necrobrowser.js`: config parsing, runtime startup, task recovery, keepalive scheduler, shutdown.
- `puppeteer/cluster.js`: TOML parsing, path preparation, validation.
- `puppeteer/launcher.js`: selects stock Puppeteer or opt-in Cloakbrowser.
- `browser/pool.js`: bounded queue, concurrency, retries, timeout, page/context/browser cleanup.
- `lib/app.js`: dependency-injected Express routes and request validation.
- `lib/audit.js`: structured audit events; sensitive fields are redacted before logging.
- `lib/cookie-jar.js`: cookie-jar validation and summaries under fixed size limits.
- `lib/navigation-policy.js`: URL scheme and host policy (`allowHttp`, `allowPrivateNetworks`).
- `lib/rate-limit.js`: per-client fixed-window rate-limit middleware.
- `db/db.js`: SQLite schema and persistence.
- `tasks/loader.js`: static task registry and error wrapper.
- `tasks/helpers/necrohelp.js`: cookies, navigation, screenshots, output containment, User-Agent configuration.

## Browser isolation modes

| Mode | Resource model | Use |
| --- | --- | --- |
| `browser` | New browser per task | Strong task isolation without persistent profile. |
| `page` | Shared browser, isolated context/page per task | Lower browser startup cost. |
| `necro` | New browser and persistent `userDataDir` per task | Session persistence and keepalive. |

Pool owns resources. Task modules receive `page` and must not close page, context, or browser.

## Task states

Normal lifecycle: `queued` → `running` → `completed`. Multi-item work may finish `partial`; failures finish `error`; interrupted work may be recovered or marked failed during startup. Results are stored in `extruded_data` and returned through status polling.

## Cookies and User-Agent

Cookie-Editor exports are normalized before injection. Cookies need domain or URL context. `params.userAgent` is applied before first navigation through `ConfigureUserAgent()`, including CDP metadata and mobile viewport handling where applicable.

SQLite stores encoded cookie data and task parameters. Protect database, backups, profiles, screenshots, and exported cookie files.

## Retrigger and keepalive

`POST /instrument/:id/retrigger` reads stored task metadata, creates a new task ID, and queues same task type/name with stored params and cookies. Keepalive scheduler loads `fixSession`, harvests rotated cookies, records `lastKeepalive`, and saves a screenshot. Enable task keepalive through API only after confirming target authorization.

## Output containment

Task output must stay under configured `platform.extrusionPath`. Use `necrohelp.getOutputPath()` or task-specific helpers. Client-provided `outputPath` is resolved and rejected when it escapes configured root.

## Design history

Retrigger, keepalive, and CLI originated from an approved design and implementation plan; the historical notes live under this page and describe the Redis-era storage they targeted.
