---
layout: default
title: Installing NecroBrowser
permalink: /setup
nav_order: 2
has_children: true
has_toc: true
---

# Installation

## Requirements
- [NodeJS + npm](https://www.npmjs.com/get-npm)
- [Chromium](https://www.chromium.org/getting-involved/download-chromium)

## Steps

Clone the repository and install the dependencies:
```bash
git clone https://github.com/muraenateam/necrobrowser.git
cd necrobrowser
npm install
```

NecroBrowser stores task state, session cookies, and extracted results in local SQLite at `./necro.db` by default. Configure another path under `[database]` in `config.toml` or set `NECRO_DB_PATH`. The database contains sensitive session data: keep its directory private, preserve file mode `0600`, and protect backups.

Create browser profile and extraction directories:
```bash
mkdir profiles
mkdir extrusion
```

Start the service:
```bash
node necrobrowser.js
```

SQLite is local to one NecroBrowser process. Local installations enable HTTP/private-network navigation by default; set `allowHttp = false` and/or `allowPrivateNetworks = false` for hardened deployments. Multiple independent service replicas should use separate databases and coordination outside this application.

## Quick check

```bash
curl -X POST "http://127.0.0.1:3000/instrument" \
     -H "Content-Type: application/json" \
     -d '{
          "name": "HelloWorld",
          "task": {
              "type": "generic",
              "name": [ "ScreenshotPages" ],
              "params": { "urls": ["https://example.com/"] }
            }
        }'
```

This instructs NecroBrowser to take a screenshot of `https://example.com/` and store it in `extrusion`. To replay a Cookie-Editor jar, include it as the request's `cookies` array; NecroBrowser validates it, stores it in protected SQLite, and injects it before task navigation. Never expose this API publicly: cookies are session credentials.
