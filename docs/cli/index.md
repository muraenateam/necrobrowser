---
layout: default
title: CLI
permalink: /cli
nav_order: 9
has_toc: true
---

# `necrocli`

`necrocli.js` talks to the Necrobrowser HTTP API. It does not access SQLite directly. Default API is `http://localhost:3000`; set `NECRO_API` or pass `--host`.

```bash
npm install
node necrocli.js --help
```

## Global options

| Option | Meaning |
| --- | --- |
| `--host <url>` | API URL. Default `http://localhost:3000`. |
| `-V, --version` | Print CLI version. |
| `-h, --help` | Print help. |

## Commands

```bash
node necrocli.js stats
node necrocli.js sessions
node necrocli.js tasks
node necrocli.js status task:generic:abc123
node necrocli.js retrigger task:generic:abc123
node necrocli.js cookies task:generic:abc123 --output cookies.json
node necrocli.js keepalive enable task:generic:abc123
node necrocli.js keepalive disable task:generic:abc123
```

- `stats`: cluster queue/workers/error metrics.
- `sessions`: redacted session summaries, cookie counts/domains, status, keepalive.
- `tasks`: registered task types and methods.
- `status`: task status and result entries.
- `retrigger`: creates a new queued task from stored metadata.
- `cookies`: exports Cookie Editor-compatible session cookies. Treat output as a credential file; use restrictive permissions and delete after authorized use.
- `keepalive enable|disable`: toggles scheduler state for a stored task.

## Safe workflow

```bash
export NECRO_API=http://127.0.0.1:3000
node necrocli.js stats
node necrocli.js tasks
node necrocli.js status task:generic:abc123
```

Do not pass API URLs over untrusted networks. Do not export or retrigger sessions without authorization. Full endpoint behavior is in [API](/api).
