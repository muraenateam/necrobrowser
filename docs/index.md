---
layout: home
title: Necrobrowser
permalink: /
nav_order: 1
---

<img src="images/logo.png" alt="drawing" style="width:300px; display:block; margin-left:auto; margin-right:auto"/>
<p align="center">
<a href="https://github.com/muraenateam/necrobrowser/blob/master/LICENSE.md"><img alt="Software License" src="https://img.shields.io/badge/license-BSD3-brightgreen.svg?style=flat-square"></a>
</p>

# Necrobrowser
{: .fs-9 }

Necromantic session control

{: .fs-6 .fw-300 }



[Get started now](/setup){: .btn .btn-primary .fs-5 .mb-4 .mb-md-0 .mr-2 }
[View it on GitHub](https://github.com/muraenateam/necrobrowser){: .btn .fs-5 .mb-4 .mb-md-0 }

---

## About Necrobrowser

Necrobrowser is a browser instrumentation microservice written in NodeJS. 
It uses the Puppeteer library to control instances of Chrome or Firefox in headless and GUI mode.

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

In other words, NecroBrowser allows you to define your Puppeteer tasks in advance,
which you can then call on a cluster of headless browsers, with persistence support via Redis.
