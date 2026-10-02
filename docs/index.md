---
layout: home
title: Necrobrowser
permalink: /
nav_order: 1
---

<img src="images/logo.png" alt="Necrobrowser logo" style="width:300px; display:block; margin-left:auto; margin-right:auto"/>

# Necrobrowser

Browser task orchestration for authorized security testing, local fixtures, and controlled automation.

Current version: `{{ site.version }}`

[Get started](/setup)

[API reference](/api)

---

## Documentation map

1. **[Setup](/setup)** — install runtime, configure paths, and create local certificates.
2. **[Configuration](/config)** — complete TOML reference and safe defaults.
3. **[REST API](/api)** — routes, request/response shapes, polling, sessions.
4. **[Architecture](/architecture)** — runtime components, browser isolation, task lifecycle.
5. **[Tasks](/tasks)** — task contract and task-specific references:
   - [Generic primitives](/tasks/generic)
   - [Atlassian](/tasks/atlassian)
   - [GitHub](/tasks/github)
   - [GSuite](/tasks/gsuite)
   - [Office 365](/tasks/office365)
   - [Okta](/tasks/okta)
   - [Keepalive](/tasks/keepalive)
6. **[Examples](/examples)** — safe local request template.
7. **[Testing](/testing)** — test matrix, fixture rules, and local docs preview.
8. **[CLI](/cli)** — `necrocli` command reference.

## Choose a path

- **New installation:** [Setup](/setup) → [Configuration](/config) → [Examples](/examples).
- **API client:** [REST API](/api) → [Tasks](/tasks) → [Testing](/testing).
- **Task author:** [Tasks](/tasks) → source-level task contract.
- **Operations:** [Architecture](/architecture) → [Configuration](/config) → [CLI](/cli).

## What it does

Necrobrowser is a Node.js service that queues browser tasks through a bounded Puppeteer pool. It persists task metadata and results in local SQLite, supports isolated browser/context/page concurrency, and exposes HTTP endpoints for queueing work and polling results.

Browser sessions, cookies, credentials, screenshots, profiles, and extracted files are sensitive. Use only systems and sessions you own or are explicitly authorized to test. Keep service binding, database files, and exported cookies private.

## Source of truth

- Operational and user-facing documentation lives in this site under `docs/`.
- Repository-local engineering instructions live in [`CLAUDE.md`](https://github.com/muraenateam/necrobrowser/blob/v2/CLAUDE.md).
- Safe local payload template lives in [`testing/`](https://github.com/muraenateam/necrobrowser/tree/v2/testing); it contains no credentials.
- Local preview instructions live in [`docs/README.md`](README.md).
