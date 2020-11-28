<p align="center">
  <img alt="Necrobrowser Logo" src="./tasks/necro_logo.png" height="160" />
</p>

## About

Necrobrowser is a browser instrumentation microservice written in NodeJS: 
it uses the Puppeteer library to control instances
of Chrome or Firefox in headless and GUI mode.

The idea is to feed NecroBrowser with web sessions harvested during phishing campaigns 
(see Muraena) to quickly perform actions hijacking the victim session.

Post-phishing automation is an often underestimated activity that helps with:
 - performing actions after successful session harvesting on campaigns with hundreds/thousands targets
 - backdooring accounts with new keys or credentials
 - performing automated password resets on third-party portals
 - scraping and extruding information
 - impersonating users to further exploit trust relationships

Each authenticated session is instrumented in its own Chrome browser in Incognito mode,
and can be kept alive to be reused after an initial set of automated tasks are launched.

Since NecroBrowser is just a browser instrumentation tool, you can also write 
automation for other red teaming phases, for example initial Reconnaisance and OSINT.

There are plenty of use cases, for instance:
 - keep N fake personas on LinkedIn/Twitter/YourSocialNetwork active on Chrome to monitor/scrape info from your targets
 - automatically build Social Network connections 
 - automate interaction with target contact forms/chats to get target info
 - 

In other words, NecroBrowser allows you to define your Puppeteer tasks in advance,
which you can then call on a cluster of headless browsers, with persistence support via Redis.

### behind the hood
A customized version of the puppeteer-cluster library is used to run N isolated headless browsers, mocked via the puppeteer-stealth plugin to prevent bot-detection.
The Node libraries overrides are mostly related to better worker management for long-term tasks, when sessions need to be kept alive for hours or days, or custom BOM mockups.

## Installation

### Requirements
 - NodeJS 12.x with NPM
 - Redis
 - Chromium 

### Steps
Supposing that you have a sane NodeJS >= 12.x & NPM installation, you can install all the required dependencies with the following commands:

```
$ git clone git@github.com:antisnatchor/necrobrowser-ng.git
$ cd necrobrowser-ng
$ npm install --save puppeteer puppeteer-extra puppeteer-cluster puppeteer-extra-plugin-stealth express morgan redis shortid toml node-eval chalk
```

NecroBrowser relies on Redis for data persistence. 
Redis is expected at tcp://127.0.0.1:6379 (no SSL, no auth). 

Once the installation is done, you can start (possibly in a screen/tmux) the tool with: 
```
$ node necrobrowser.js
```
Necrobrowser is a microservice that exposes the following RESTful API:

### FreeBSD notes
If you are on FreeBSD (and you should!) prefix the npm command as the following:
 
```
 PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true npm install ...
```

Also uncomment the puppetPath (line 11) in config.toml:

```
[platform]
    type = "freebsd"
    puppetPath = "/usr/bin/chromium-browser"  
```

Puppeteer does not officially support FreeBSD yet, so Chrome is not auto-downloaded.
After installation create a symbolic link like:

```
ln -s /usr/local/share/chromium/chrome /usr/bin/chromium-browser
```

This is needed since we Node mock os.Arch() to be arm64, so we "bypass" the platform checks
and Puppeteer cann magically work in FreeBSD too. Eventually @antisnatchor will create an official
Puppeteer port and add official FreeBSD support.

## RESTful API
#### GET /
Returns the status of the NecroBrowser cluster, showing generic information about 
queue size and processed tasks.
```
{ 
  "startedAt":"2020-11-27 16:38:47",
  "workers":"0",  
  "queued":"0",
  "progress":"0 / 0 (100.00%)",
  "errors":"0 (0.00%)",
  "tasks":[]
}
```
#### GET /tasks
Returns the available Task types and their exposed methods.

```
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

#### POST /instrument

Queue the specified instrumentation task spawning a dedicated Chrome headless instance.

Lets say we want to trigger the office365.OutlookWriteEmail task. We would use a POST
body like the following:

```
 { 
"name": "NecroTest",
"task": {
  "type": "office365",
  "name": "OutlookWriteEmail",
  "params": {
     "fixSession": 'https://outlook.office.com/mail/inbox',
     "writeEmail": {
        "to": "WikiInternal@ogre.onmicrosoft.com",
        "subject": "All your sessions are belong to us",
        "data": "NecroBrowser is impersonating this user.\nBye",
        "attachment": "./testing/attachment.png"
      }
  }
},
"cookies": [
 {}...
],
 "credentials": [
 {}...
]
}

```

The POST returns immediately the queued job id as the following, while the task is queued into the cluster:

```
{
"status":"queued",
"necroId":"task:office365:Q8FAt0bGZ"
}
```

The necroId can be used to poll the task details via GET /instrument/necroId until the task status is completed.
Note that since the instrumentation activity is asynchronous, when long-running tasks save intermediate data to the database,
that data is immediately accessible from the API. So, depending on your needs, you might want to poll less or more frequently
the instrument handler depending on your needs. 

Cookies need to be specified as an array of JSON objects with the following structure:

```
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
To quickly export all page cookies from a logged session, on Chrome the EditThisCookie (https://chrome.google.com/webstore/detail/editthiscookie/fngmhnnpilhplaeedifhccceomclgfbg) extension
can be used. This is useful when developing/testing new necro modules.

However, in real-world scenarios, when NecroBrowser is used together with Muraena, 
the victim credentials and full cookiejar are automatically 
received from the Muraena reverse proxy.


#### GET  /instrument/:id

Returns instrumentation status and output, for example scraped web pages data, images or files.
The JSON output keys vary depending on the necrotask used,
but in general they are stored as maps of strings.


## the Old necrobrowser in golang
The first version of NecroBrowser was written in Go and used the CDP
library to interface with Chrome. It turned out the library was not reliable
in some advanced cases we had in production.

The old Go version is archived for reference here: 
TODO ADD LINK
