---
layout: default
title: Keepalive task
permalink: /tasks/keepalive
parent: Tasks
nav_order: 7
---

# Keepalive: `KeepAlive`

Implementation: `tasks/keepalive/necrotask.js`. Loads `params.fixSession` with stored cookies, applies optional User-Agent, harvests rotated browser cookies back into SQLite, captures a screenshot, and updates `lastKeepalive`.

## Parameters

| Key | Required | Meaning |
| --- | --- | --- |
| `fixSession` | yes | Authorized HTTP(S) session refresh URL. |
| `userAgent` | no | User-Agent captured with the session. |

Keepalive is normally scheduled for tasks created with `fixSession` and enabled through `[necro.keepalive]` or API endpoint. It returns an error result to scheduler without changing original task status when refresh fails.

```json
{"name":"authorized-keepalive","task":{"type":"keepalive","name":["KeepAlive"],"params":{"fixSession":"https://owned.example.test/session"}},"cookies":[]}
```

This task handles session credentials. Use only for owned/authorized systems, protect database/screenshots, and disable keepalive when session authorization ends.
