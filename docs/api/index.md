---
layout: default
title: REST API
permalink: /api
nav_order: 4
has_toc: true
---

# REST API

Necrobrowser binds to `platform.host` and `platform.port` from `config.toml` (sample: `127.0.0.1:3000`). API has no built-in authentication layer. Keep it on a trusted interface or protect it with an authenticated reverse proxy.

All JSON requests need `Content-Type: application/json`. Responses may include task status, paths, and redacted metadata; cookie values are not returned by status endpoints.

## `GET /healthz`

Liveness check. Rate limiting skips this route.

```json
{"status":"ok"}
```

## `GET /`

Returns cluster metrics such as `startedAt`, `workers`, `queued`, `active`, `progress`, `errors`, and `tasks`.

## `GET /tasks`

Returns task types and exported method names discovered from `tasks/*/necrotask.js`.

```json
{
  "generic": ["Click", "Fill", "Press", "Screenshot", "Scroll"],
  "atlassian": ["GetProfileInfo", "GetAccountSettingsScreenshots", "AddAuthenticatorApp"],
  "github": ["PlantAndDump"],
  "gsuite": ["ScreenshotApps"],
  "office365": ["AddAuthenticatorApp", "ScreenshotApps", "SharepointExtrude", "OneDriveExtrude", "OutlookWriteEmail", "OutlookExtrude"],
  "okta": ["LoginAndEnumerate"],
  "keepalive": ["KeepAlive"]
}
```

Names are case-sensitive. See [task catalog](/tasks) for parameters.

## `POST /cookie-jar/dry-run`

Validates and summarizes a cookie jar without storing it, starting a browser, or queueing a task.

```bash
curl -sS -X POST http://127.0.0.1:3000/cookie-jar/dry-run \
  -H 'content-type: application/json' \
  --data '{"cookies":[]}'
```

Use this for shape/policy checks only. It does not authenticate a session.

## `POST /instrument`

Queues one or more methods from one task type. Entire batch validates before any task record is created.

```json
{
  "name": "local-screenshot",
  "task": {
    "type": "generic",
    "name": ["Screenshot"],
    "params": {
      "urls": ["http://127.0.0.1:4000/"],
      "waitBeforeScreenshotMs": 1000,
      "outputPath": "fixture"
    }
  },
  "cookies": [],
  "userAgent": ""
}
```

Accepted cookie fields: `cookies` or legacy singular `cookie`, but do not send conflicting values. `credentials` and `tracker` support task-specific credential lookup. Never put real secrets in source-controlled examples.

Success:

```json
{"status":"queued","necroIds":["task:generic:abc123"]}
```

A task can finish as `queued`, `running`, `completed`, `partial`, or `error`. Queue failure returns `503` with `queuedIds` and `failedId` where applicable. Validation failures return `400`.

## `GET /instrument/:id`

Poll task state and results.

```json
{"status":"completed","data":[{"url":"https://example.test/","encoded":"/absolute/path/to/screenshot.png"}]}
```

While queued, `data` is `null`. For errors, `data` contains a safe reason. Result `encoded` is historical naming: entries may contain base64 data or a contained filesystem path depending on task.

```bash
curl -sS http://127.0.0.1:3000/instrument/task:generic:abc123
```

## `POST /instrument/:id/retrigger`

Creates a new task using stored task type, method, cookies, params, and User-Agent.

```bash
curl -sS -X POST http://127.0.0.1:3000/instrument/task:generic:abc123/retrigger
```

Response:

```json
{"status":"queued","necroId":"task:generic:def456","retriggeredFrom":"task:generic:abc123"}
```

## `GET /sessions`

Returns a redacted session summary: task ID, type, method, status, cookie count, cookie domains, `fixSession`, truncated User-Agent, keepalive state, timestamp, and total count. Cookie values are not returned.

## Keepalive routes

- `POST /instrument/:id/keepalive/enable`
- `POST /instrument/:id/keepalive/disable`

```bash
curl -sS -X POST http://127.0.0.1:3000/instrument/task:generic:abc123/keepalive/enable
```

Response:

```json
{"status":"ok","taskId":"task:generic:abc123","keepalive":"enabled"}
```

Keepalive requires task params containing an authorized `fixSession` URL. Scheduler behavior is configured under `[necro.keepalive]`.

## `GET /instrument/:id/cookies`

Exports stored cookies in Cookie Editor-compatible shape. This is a credential export endpoint. Keep API private, protect response files, and use only for authorized sessions.

```bash
curl -sS http://127.0.0.1:3000/instrument/task:generic:abc123/cookies > cookies.json
```

## Navigation and policy

Every submitted navigation URL is checked by configured policy. `allowHttp` and `allowPrivateNetworks` are enabled in the sample for local development; disable them for hardened deployments. URL credentials and unsupported schemes are rejected. See [configuration](/config).
