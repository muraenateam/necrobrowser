---
layout: default
title: Generic tasks
permalink: /tasks/generic
parent: Tasks
nav_order: 1
---

# Generic tasks

Generic tasks are small browser primitives. They accept ordinary CSS selectors, not JSPath or arbitrary JavaScript. Use them with local fixtures or explicitly authorized targets.

## Available primitives

| Task | Purpose | Required parameters |
| --- | --- | --- |
| `Screenshot` | Visit one or more URLs and save screenshots. | `urls` |
| `Click` | Visit URL, wait for visible selector, click it. | `url`, `selector` |
| `Fill` | Visit URL, target input/textarea/contenteditable, type text. | `url`, `selector`, `text` |
| `Press` | Focus optional target and press one allowed keyboard key. | `key` (optional `url`, `selector`) |
| `Scroll` | Scroll document or CSS scroll container with hard iteration cap. | `url`, `scrollPixels`, `scrollCount` |

All primitives use this request envelope:

```json
{
  "name": "human-readable-task-name",
  "task": {
    "type": "generic",
    "name": ["TaskName"],
    "params": {}
  },
  "cookies": [],
  "userAgent": ""
}
```

`task.name` is an array, even when it contains one task. `params` contains task-specific fields below. `cookies` must be an array; use only authorized session cookies. `userAgent` is optional and applies before navigation. Output paths remain under configured `extrusionPath`.

Quick parameter matrix:

| Task | Navigation | Primary action | Timing |
| --- | --- | --- | --- |
| `Screenshot` | `urls[]` | Capture each URL | Before/after screenshot waits |
| `Click` | `url` | Click CSS/XPath target | After action and screenshot waits |
| `Fill` | `url` | Type into editable target | After action and screenshot waits |
| `Press` | Optional `url` | Press allowlisted key | After key and screenshot waits |
| `Scroll` | `url` | Scroll bounded iterations | Between-scroll and screenshot waits |

The same task page documents every primitive below. Tests live in `test/generic.test.js`; safe fixture payload lives in `testing/generic.screenshot.json`.

## Screenshot

### Parameters

| Parameter | Required | Type/range | Description |
| --- | --- | --- | --- |
| `urls` | yes | non-empty `string[]` | HTTP(S) pages to visit and capture. |
| `waitBeforeScreenshotMs` | no | integer `0..300000` | Wait before each capture. Default `0`. |
| `waitAfterScreenshotMs` | no | integer `0..300000` | Wait after each capture. Default `0`. |
| `outputPath` | no | relative path | Subdirectory under configured extraction root; traversal rejected. |
| `userAgent` | no | string | Optional browser fingerprint override. |

`Screenshot` returns `completed`, `partial`, or `error`. `partial` means some URLs succeeded and some failed.

```json
{
  "name": "local-screenshot",
  "task": {"type": "generic", "name": ["Screenshot"], "params": {
    "urls": ["http://127.0.0.1:4000/fixture"],
    "waitBeforeScreenshotMs": 1000,
    "outputPath": "fixture"
  }},
  "cookies": []
}
```

Mixed URL outcomes return `partial` with per-URL failures. All failures return `error`.

## Click

### Parameters

| Parameter | Required | Type/range | Description |
| --- | --- | --- | --- |
| `url` | yes | HTTP(S) string | Page to open. |
| `selector` | yes | CSS or `xpath:` string | Visible element to click. |
| `waitAfterMs` | no | integer `0..300000` | Wait after click. Default `0`. |
| `screenshot` | no | boolean | Capture post-click screenshot. Default `false`. |
| `waitBeforeScreenshotMs` | no | integer `0..300000` | Wait before screenshot. |
| `waitAfterScreenshotMs` | no | integer `0..300000` | Wait after screenshot. |
| `outputPath` | no | relative path | Contained screenshot directory. |

Missing or invisible selectors fail task after 30 seconds. CSS is default; XPath requires `xpath:` prefix.

```json
{
  "name": "local-click",
  "task": {"type": "generic", "name": ["Click"], "params": {
    "url": "http://127.0.0.1:4000/fixture",
    "selector": "#reveal",
    "waitAfterMs": 500,
    "screenshot": true,
    "outputPath": "fixture"
  }},
  "cookies": []
}
```

Task waits up to 30 seconds for a visible target. Missing selectors fail task; no silent success.

## Fill

### Parameters

| Parameter | Required | Type/range | Description |
| --- | --- | --- | --- |
| `url` | yes | HTTP(S) string | Page to open. |
| `selector` | yes | CSS or `xpath:` string | Must target `input`, `textarea`, or `contenteditable`. |
| `text` | yes | string | Text to type; never logged. |
| `clear` | no | boolean | Click target before typing when true; default `true`. |
| `waitAfterMs` | no | integer `0..300000` | Wait after typing. |
| `screenshot` | no | boolean | Capture post-fill screenshot. |
| `waitBeforeScreenshotMs` | no | integer `0..300000` | Wait before screenshot. |
| `waitAfterScreenshotMs` | no | integer `0..300000` | Wait after screenshot. |
| `outputPath` | no | relative path | Contained screenshot directory. |

```json
{
  "name": "local-fill",
  "task": {"type": "generic", "name": ["Fill"], "params": {
    "url": "http://127.0.0.1:4000/fixture",
    "selector": "textarea[name=message]",
    "text": "controlled fixture input",
    "screenshot": true,
    "outputPath": "fixture"
  }},
  "cookies": []
}
```

Non-editable targets fail before typing. Selector values are passed to Puppeteer APIs only; arbitrary script execution is not supported.

## Press

### Parameters

| Parameter | Required | Type/range | Description |
| --- | --- | --- | --- |
| `url` | no | HTTP(S) string | Page to open; standalone requests should provide it. |
| `selector` | no | CSS or `xpath:` string | Optional visible target to focus first. |
| `key` | yes | allowlisted key | `Enter`, `Tab`, `Escape`, `Backspace`, arrows, `Space`, or `Delete`. |
| `waitAfterMs` | no | integer `0..300000` | Wait after key press. |
| `screenshot` | no | boolean | Capture post-key screenshot. |
| `waitBeforeScreenshotMs` | no | integer `0..300000` | Wait before screenshot. |
| `waitAfterScreenshotMs` | no | integer `0..300000` | Wait after screenshot. |
| `outputPath` | no | relative path | Contained screenshot directory. |

`Press` focuses an optional selector, then emits one allowlisted key.

Selectors can use CSS or explicit XPath:

```json
{
  "name": "google-search-smoke",
  "task": {"type": "generic", "name": ["Press"], "params": {
    "url": "https://www.google.com/",
    "selector": "textarea[name=\"q\"]",
    "key": "Enter",
    "waitAfterMs": 2000,
    "waitBeforeScreenshotMs": 1000,
    "waitAfterScreenshotMs": 1000,
    "screenshot": true,
    "outputPath": "google-smoke"
  }},
  "cookies": []
}
```

Prefer stable CSS such as `textarea[name="q"]` or `textarea[aria-label="Search"]`. XPath fallback must use `xpath:` prefix, for example `xpath:/html/body/div[2]/div[6]/form/div[1]/div/div[1]/div[2]/div[2]/textarea`. Absolute XPath breaks when Google changes layout. “First textarea” is not reliable unless constrained by a semantic attribute.

## Scroll

### Parameters

| Parameter | Required | Type/range | Description |
| --- | --- | --- | --- |
| `url` | yes | HTTP(S) string | Page to open. |
| `scrollPixels` | yes | integer `1..10000` | Pixels per iteration. |
| `scrollCount` | yes | integer `1..100` | Hard maximum iterations. |
| `delayBetweenScrollsMs` | no | integer `0..300000` | Wait between iterations; default `1000`. |
| `waitBeforeFirstScrollMs` | no | integer `0..300000` | Settle delay before scrolling. |
| `endOfPageBehavior` | no | `stop`, `retry`, `continue` | Default `stop`; hard cap always applies. |
| `scrollTarget` | no | CSS selector | Inner scroll container; default document. |
| `captureScreenshots` | no | boolean | Capture after each iteration. |
| `screenshot` | no | boolean | Capture final screenshot. |
| `waitBeforeScreenshotMs` | no | integer `0..300000` | Wait before captures. |
| `waitAfterScreenshotMs` | no | integer `0..300000` | Wait after captures. |
| `outputPath` | no | relative path | Contained screenshot directory. |

Scroll a document or scrollable CSS container a bounded number of times. Useful for feeds and infinite-scroll pages without risking an unbounded loop.

```json
{
  "name": "local-feed-scroll",
  "task": {"type": "generic", "name": ["Scroll"], "params": {
    "url": "http://127.0.0.1:4000/feed",
    "scrollPixels": 600,
    "scrollCount": 20,
    "delayBetweenScrollsMs": 1000,
    "endOfPageBehavior": "stop",
    "screenshot": true,
    "outputPath": "feed"
  }},
  "cookies": []
}
```

`scrollPixels` accepts `1`–`10000`; `scrollCount` accepts `1`–`100`. `endOfPageBehavior` is `stop` (default), `retry`, or `continue`; even `continue` cannot exceed `scrollCount`. Use `scrollTarget` with a CSS selector for an inner scroll container. Optional `captureScreenshots` saves one screenshot per iteration.
