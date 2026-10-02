---
layout: default
title: Office 365 tasks
permalink: /tasks/office365
parent: Tasks
nav_order: 5
---

# Office 365 tasks

Implementation: `tasks/office365/necrotask.js`. Every method requires `params.fixSession`, applies cookies/User-Agent, and requires an authorized Office 365 session. Use both relevant Office 365 and Microsoft login cookie domains when building an authorized test fixture.

## Methods and parameters

- `AddAuthenticatorApp`: optional `telegramToken` and `telegramChatId` for notifications; enrolls a new authenticator and stores account/TOTP output.
- `ScreenshotApps`: no extra fields; captures Office home and linked app pages.
- `SharepointExtrude`: required non-empty `keywords`; optional `sharepointHost`.
- `OneDriveExtrude`: no extra fields; captures/downloads OneDrive content.
- `OutlookWriteEmail`: required `writeEmail.to`, `writeEmail.subject`, `writeEmail.data`; optional attachment behavior is represented in checked-in fixture but must be verified against current source before use.
- `OutlookExtrude`: required non-empty `keywords`; stores matching email HTML/results.

Base request shape:

```json
{
  "name":"authorized-office365-check",
  "task":{"type":"office365","name":["ScreenshotApps"],"params":{"fixSession":"https://outlook.office.com/mail/inbox"}},
  "cookies":[]
}
```

No authenticated Office 365 payloads are checked in. Use parameter examples on this page with local fixtures or an explicitly authorized tenant.

These actions can change account state, send email, enroll MFA, download data, or expose session data. Never run against accounts or tenants without written authorization.
