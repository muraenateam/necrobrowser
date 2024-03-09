---
layout: default
title: Installing NecroBrowser
permalink: /setup
nav_order: 2
has_children: true
has_toc: true
---

# Installation

## Requirements
- [NodeJS + [npm](https://www.npmjs.com/get-npm)
- [Redis](https://redis.io/)
- [Chromium](https://www.chromium.org/getting-involved/download-chromium) 

## Steps


Clone the repository and install the dependencies:
```bash
git clone https://github.com/muraenateam/necrobrowser.git
cd necrobrowser
npm install
```

NecroBrowser relies on Redis for data persistence. Redis is expected at tcp://127.0.0.1:6379 (no SSL, no auth).
Configure Redis and start it:
```bash
redis-server --daemonize yes
redis-cli ping
```

Setup the environment: create two directories: `profiles` and `extrusion` in the root of the project. 
These will be used to store segregated browser profiles and looted data.
```bash
mkdir profiles
mkdir extrusion
```

Once the installation is done, you can start (possibly in a screen/tmux) the tool with:
```bash
node necrobrowser.js
```


## Quick check

You can check if everything is working by running the following command:
```bash
curl -X POST "http://127.0.0.1:3000/instrument" \
     -H "Content-Type: application/json" \
     -d '{
          "name": "HelloWorld",
          "task": {
              "type": "generic",
              "name": [ "ScreenshotPages" ],
              "params": { "urls": ["https://example.com/"] }
            }
        }'
```

This will instruct NecroBrowser to take a screenshot of `https://example.com/` and store it in the `extrusion` directory.