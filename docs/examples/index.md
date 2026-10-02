---
layout: default
title: Examples
permalink: /examples
nav_order: 7
has_toc: true
---

# Examples

`testing/` contains safe local request templates only. No authentication cookies, credentials, tokens, private keys, or account identifiers are checked in. Use only local fixtures or authorized targets.

## Checked-in payloads

| Fixture | Task |
| --- | --- |
| [`generic.screenshot.json`](https://github.com/muraenateam/necrobrowser/blob/necro_spoof/testing/generic.screenshot.json) | Local generic screenshots; no cookies or credentials. |

No privileged-account payloads are checked in. Task-specific request shapes are documented under [Tasks](/tasks), with all Generic primitives detailed in [Generic tasks](/tasks/generic). On the Generic page, use the “On this page” menu to jump directly to each primitive.

## Safe generic request

Use local fixture or an owned test URL:

```bash
curl -sS -X POST http://127.0.0.1:3000/instrument \
  -H 'content-type: application/json' \
  --data '{
    "name":"local-screenshot",
    "task":{"type":"generic","name":["Screenshot"],"params":{
      "urls":["http://127.0.0.1:4000/"],
      "waitBeforeScreenshotMs":1000,
      "outputPath":"fixture"
    }},
    "cookies":[]
  }'
```

Response returns `necroIds`. Poll returned ID:

```bash
curl -sS http://127.0.0.1:3000/instrument/task:generic:abc123
```

`outputPath` must remain inside configured `extrusionPath`. `waitBeforeScreenshotMs` is bounded to five minutes.

## Fixture file submission

From repository root:

```bash
curl -sS -X POST http://127.0.0.1:3000/instrument \
  -H 'content-type: application/json' \
  --data @testing/generic.screenshot.json
```

Inspect JSON first. Replace URLs with local/authorized targets. Never commit real cookies, credentials, User-Agent captures, tokens, private keys, or screenshots containing sensitive data.

## Example lifecycle

1. Start service with `npm start`.
2. Confirm `GET /healthz`.
3. Submit payload.
4. Poll `GET /instrument/:id` until `completed`, `partial`, or `error`.
5. Read output only from configured `extrusionPath`.
6. Remove temporary profiles, screenshots, and databases after testing.

## Authorized Google smoke example

Use only when public-network testing is explicitly authorized. Google may show consent/interstitial pages and selectors can change. Do not use account cookies or credentials.

Recommended two-step shape:

1. `Fill` Google search box with CSS `textarea[name="q"]` and text `it works!1`.
2. `Press` `Enter` on same page/flow, wait 2000 ms, optionally screenshot.

Separate queued tasks create separate browser resources and do not share page state. For a reliable multi-step run, use a dedicated sequence task or local fixture. XPath is supported only with `xpath:` prefix and should be fallback, not default.

See [API](/api), [task catalog](/tasks), and [testing](/testing).
