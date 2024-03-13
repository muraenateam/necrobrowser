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

In other words, NecroBrowser allows you to define your Puppeteer tasks in advance,
which you can then call on a cluster of headless browsers, with persistence support via Redis.


## Documentation

That the project is documented at https://necrobrowser.phishing.click

## Contributing

1. Fork it!
2. Create your feature branch: `git checkout -b my-new-feature`
3. Commit your changes: `git commit -am 'Add some feature'`
4. Push to the branch: `git push origin my-new-feature`
5. Submit a pull request 🤩

See the list of [contributors](https://github.com/muraenateam/necrobrowser/contributors) who participated in this project.

## License

**Necrobrowser** is made with ❤️ by [the dev team](https://github.com/orgs/muraenateam/people) and it's released under the <a href="https://github.com/muraenateam/necrobrowser/blob/master/LICENSE.md"><img alt="Software License" src="https://img.shields.io/badge/license-BSD3-brightgreen.svg?style=flat-square"></a>.
library to interface with Chrome. It turned out the library was not reliable
in some advanced cases we had in production.
