---
layout: default
title: Installing Necrobrowser
permalink: /setup
nav_order: 2
has_children: true
has_toc: true
---

# Installation

## Requirements
- NodeJS 12.x with NPM
- Redis
- Chromium

## Steps
Supposing that you have a sane NodeJS >= 12.x & NPM installation, you can install all the required dependencies with the following commands:

```bash
git clone https://github.com/muraenateam/necrobrowser.git
cd necrobwoser
npm install
```

NecroBrowser relies on Redis for data persistence.
Redis is expected at tcp://127.0.0.1:6379 (no SSL, no auth).

Create two directories: profiles and extrusion. These will be used to store segregated browser profiles
and looted data.
```bash
mkdir profiles
mkdir extrusion
```

Once the installation is done, you can start (possibly in a screen/tmux) the tool with:
```bash
node necrobrowser.js
```