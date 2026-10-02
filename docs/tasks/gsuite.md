---
layout: default
title: GSuite tasks
permalink: /tasks/gsuite
parent: Tasks
nav_order: 4
---

# GSuite: `ScreenshotApps`

Implementation: `tasks/gsuite/necrotask.js`. Applies supplied cookies and optional User-Agent, then captures Gmail inbox and Google Drive screenshots. It uses fixed Google URLs and requires an authorized session.

```json
{
  "name":"authorized-gsuite-check",
  "task":{"type":"gsuite","name":["ScreenshotApps"],"params":{}},
  "cookies":[]
}
```

No GSuite payload is checked in. Use placeholder cookies only in local fixture work; never submit empty cookies to a real account and never commit exported sessions.
