---
layout: default
title: Atlassian tasks
permalink: /tasks/atlassian
parent: Tasks
nav_order: 2
---

# Atlassian tasks

Implementation: `tasks/atlassian/necrotask.js`. All methods need `params.urls`; setup applies cookies and optional User-Agent before navigation.

## `GetProfileInfo`

Uses first `urls` entry, waits for the page, captures initial/profile screenshots, and clicks the profile control. Authorized Atlassian session required.

## `GetAccountSettingsScreenshots`

Visits each URL in `params.urls`, captures screenshots, and returns `partial` when only some URLs fail.

## `AddAuthenticatorApp`

Uses first URL, retrieves password credential from `victim:<params.trackers>`, completes authenticator enrollment, and stores account name/TOTP secret as extruded data. Requires authorized credentials and session. Treat output as highly sensitive.

Common fields:

```json
{"urls":["https://your-company.atlassian.net/"],"trackers":"example"}
```

No Atlassian payload is checked in. Use local/owned test tenants only.
