---
layout: default
title: Tasks
permalink: /tasks
nav_order: 6
has_children: true
has_toc: true
---

# Task catalog

Task modules live under `tasks/<type>/necrotask.js`. `tasks/loader.js` discovers task categories and exports their task names through `GET /tasks`.

## Categories

| Category | Purpose |
| --- | --- |
| [Generic primitives](generic.md) | Screenshot, click, fill, key press, bounded scroll; page includes primitive jump menu. |
| [Atlassian](atlassian.md) | Profile, settings screenshots, and authenticator workflows. |
| [GitHub](github.md) | Authorized repository and settings workflows. |
| [GSuite](gsuite.md) | Gmail and Drive screenshots. |
| [Office 365](office365.md) | Office session, SharePoint, OneDrive, and Outlook workflows. |
| [Okta](okta.md) | Authorized tenant login and app enumeration. |
| [Keepalive](keepalive.md) | Refresh an authorized session and capture evidence. |

Task names are case-sensitive. Confirm current names with:

```bash
curl -sS http://127.0.0.1:3000/tasks
```

## Common task contract

```js
async function TaskName({ page, data: [taskId, cookies, params] }) {
  // configure session, navigate, act, persist results
}
```

All tasks receive a pool-owned page. Tasks must not close browser resources. Required operations throw on failure; multi-item tasks may return `partial` with per-item failures. Cookie values, credentials, OTPs, tokens, and private keys must never be logged.

Use [Generic primitives](generic.md) for the detailed task-by-task reference. See [API](../api/index.md), [examples](../examples/index.md), and [testing](../testing/index.md) for request and verification workflows.
