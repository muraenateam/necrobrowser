# Testing fixtures

This directory contains safe, local request templates only.

## Files

- `generic.screenshot.json` — screenshots from local fixture URLs, delayed one second, output under `extrusion/examples`.

Template contains no cookies, credentials, tokens, keys, or account identifiers. Replace URLs only with local fixtures or systems covered by explicit authorization.

## Run

```bash
npm start
curl -sS -X POST http://127.0.0.1:3000/instrument \
  -H 'content-type: application/json' \
  --data @testing/generic.screenshot.json
```

Poll returned task ID:

```bash
curl -sS http://127.0.0.1:3000/instrument/task:generic:REPLACE_ID
```

Run `node scripts/check-docs.js` before committing docs or fixtures. Do not add exported cookies, passwords, OTPs, private keys, screenshots, or downloaded account data here.
