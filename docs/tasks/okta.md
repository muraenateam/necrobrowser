---
layout: default
title: Okta tasks
permalink: /tasks/okta
parent: Tasks
nav_order: 6
---

# Okta: `LoginAndEnumerate`

Implementation: `tasks/okta/necrotask.js`. It visits an Okta portal, detects existing cookie session, or performs a credential login, handles MFA branches, enumerates apps, and captures screenshots. Use only an owned test tenant with explicit authorization.

## Parameters

| Key | Required | Meaning |
| --- | --- | --- |
| `oktaPortal` | yes | Hostname only, without scheme, spaces, or path. |
| `email` | conditional | Required when cookies do not produce an authenticated session. |
| `password` | conditional | Required with `email` for credential flow. Never commit. |
| `userAgent` | no | Optional explicit fingerprint input. |

Cookie flow:

```json
{"oktaPortal":"tenant.example.okta.com"}
```

Credential flow shape (use placeholders only):

```json
{"oktaPortal":"tenant.example.okta.com","email":"USER@example.test","password":"REPLACE_ME"}
```

No Okta JSON payload is checked in. Use this page and current source for parameter shape; test with local fixtures or an explicitly authorized tenant.
