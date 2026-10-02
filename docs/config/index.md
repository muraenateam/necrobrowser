---
layout: default
title: Configuration
permalink: /config
nav_order: 3
has_children: false
has_toc: true
---

# Configuration

NecroBrowser reads `config.toml` at startup. Relative paths resolve from directory containing config file. Restart process after changing TOML or runtime code.

## Complete reference

### Root options

| Key | Default | Meaning |
| --- | --- | --- |
| `version` | `1.0` | Configuration version marker. |
| `debug` | `true` in sample | Enables debug-dependent behavior such as configured proxy use. |
| `root` | `false` | Adds `--no-sandbox` and `--disable-setuid-sandbox`. Use only when browser process runs as root or controlled test environment. |
| `ignoreHTTPSErrors` | `false` | Disables TLS certificate verification. Keep disabled except controlled local targets. |

### `[platform]`

| Key | Meaning |
| --- | --- |
| `type` | Required: `freebsd`, `linux`, or `darwin`. |
| `puppetPath` | Optional Chromium/Chrome executable for stock Puppeteer. Required and existing on FreeBSD. Cloakbrowser resolves its own managed binary. |
| `extrusionPath` | Directory for screenshots, downloads, and extracted files. Created and resolved at startup. |
| `profilesPath` | Directory for persistent `necro` profiles. Created and resolved at startup. |
| `host` | API bind address. Sample uses `127.0.0.1`. |
| `port` | API listen port. Sample uses `3000`. |

`paths.extrusionPath` and `paths.profilesPath` are also populated from the resolved platform paths for task code.

### `[database]`

| Key | Meaning |
| --- | --- |
| `path` | SQLite path. Relative paths resolve from config directory. `:memory:` is supported for isolated tests. |

`NECRO_DB_PATH` can override database location in test/setup workflows. Keep SQLite files private: they contain session cookies and task metadata.

### `[api]`

| Key | Default in sample | Meaning |
| --- | --- | --- |
| `readOnlySmoke` | `false` | Allows only health/tasks/cookie dry-run routes when true. |
| `allowPrivateNetworks` | `true` | Permits private/loopback targets. Disable for hardened deployments. |
| `allowHttp` | `true` | Permits HTTP targets. Disable to require HTTPS. |
| `requestsPerMinute` | `60` | Rate-limit window (fixed one-minute window per client address). |
| `requestBodyLimit` | `2mb` runtime fallback | Express JSON request size limit when set. |

### `[cluster]`

| Key | Meaning |
| --- | --- |
| `concurrency` | Required: `browser`, `page`, or `necro`. |
| `poolSize` | Positive integer browser worker limit. |
| `taskTimeout` | Positive seconds before task timeout. |
| `retryLimit` | Optional non-negative retry count; runtime fallback is `1`. |
| `retryDelay` | Optional delay between retries in milliseconds; runtime fallback is `500`. |
| `queueLimit` | Optional queue capacity; runtime fallback is `100`, never below pool size. |

`[cluster.page]`:

| Key | Meaning |
| --- | --- |
| `windowSize` | Required `WIDTH,HEIGHT` or `WIDTHxHEIGHT`; headless viewport and Chrome window argument. |
| `scaleFactor` | Used by tasks that call `SetPageScaleFactor`; sample is `1`. |

### `[necro]`

| Key | Meaning |
| --- | --- |
| `headless` | Default `true` in runtime fallback; sample uses `false`. Headless mode applies viewport dimensions. Visible mode uses `defaultViewport = null`. |
| `keepalive.enabled` | Starts periodic keepalive scheduling for eligible tasks. |
| `keepalive.delay` | Seconds between scheduler passes; runtime clamps minimum to one second. |
| `proxy.enabled` | Enables configured proxy only when `debug` is true. |
| `proxy.url` | Upstream proxy URL. |

### `[necro.cloak]`

Cloakbrowser is optional behavior for authorized lab/CTF targets:

```toml
[necro.cloak]
enabled = false
humanize = true
```

- `enabled` must be boolean. `false` keeps stock Puppeteer.
- `humanize` must be boolean. It defaults to true when Cloakbrowser is enabled.
- Optional adapter values: `licenseKey`, `browserVersion`, `releaseChannel`, `locale`, `timezone`, `humanPreset`, `humanConfig`, `stealthArgs`, `geoip`, `extensionPaths`, and `proxy`.
- Install dependencies with `npm install`; package manifest includes `cloakbrowser` and `puppeteer-core`.
- `platform.puppetPath` does not select Cloakbrowser's managed binary.

Task `params.userAgent` remains explicit and is applied before first navigation.

## Validation and startup errors

Startup fails when TOML cannot parse, required platform/concurrency values are unsupported, pool/task timeout values are invalid, `cluster.page.windowSize` is absent, FreeBSD executable is missing, or Cloakbrowser booleans have wrong types. Fix config, then restart.

## Safe deployment defaults

Bind to loopback unless protected network access is intentional. Keep `allowPrivateNetworks = false` and `allowHttp = false` for hardened deployments. Never expose `/instrument`, cookie export, or SQLite files to untrusted users without an authorization layer outside this service.
