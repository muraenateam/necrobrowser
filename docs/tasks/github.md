---
layout: default
title: GitHub tasks
permalink: /tasks/github
parent: Tasks
nav_order: 3
---

# GitHub: `PlantAndDump`

Implementation: `tasks/github/necrotask.js`. This task is privileged: it can create an SSH key, submit it to GitHub settings, capture settings screenshots, enumerate repositories, and download archives. Use only an owned test account/organization.

## Parameters

| Key | Required | Meaning |
| --- | --- | --- |
| `urls` | yes | Non-empty screenshot URL array. |
| `fixSession` | no | Initial session URL; defaults to `https://github.com`. |
| `sshKey` | no | Public key material to submit; task generates one when absent. |
| `userAgent` | no | Optional explicit fingerprint input. |

```json
{"urls":["https://github.com/settings/profile"],"fixSession":"https://github.com","sshKey":"ssh-rsa PLACEHOLDER"}
```

Private/public key files are written under configured output with restrictive permissions. Never use production accounts or commit generated keys.
