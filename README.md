<p align="center">
  <img alt="Necrobrowser Logo" src="./tasks/necro_logo.png" height="160" />
</p>

# Necrobrowser

Browser task orchestration for authorized security testing, local fixtures, and controlled automation. Define Puppeteer tasks in advance and run them on a bounded pool of isolated browsers: sessions, cookies, and extracted results persist in local SQLite, and sessions can be kept alive, retriggered, and exported.

> **Authorization required.** Use NecroBrowser only against systems, sessions, and accounts you own or are explicitly authorized to test.

## Quick start

```bash
git clone https://github.com/muraenateam/necrobrowser.git
cd necrobrowser
npm install

node necrobrowser.js
```

The service binds to `127.0.0.1:3000` by default and stores state in `./necro.db` (see `config.toml` for a working sample). Queue work with `POST /instrument` — see [Examples](https://necrobrowser.phishing.click/examples) — or manage sessions with the [`necrocli`](https://necrobrowser.phishing.click/cli) command-line tool.

## Documentation

Full navigable documentation: [necrobrowser.phishing.click](https://necrobrowser.phishing.click/)

- [Setup](https://necrobrowser.phishing.click/setup) — installation, paths, local certificates
- [Configuration](https://necrobrowser.phishing.click/config) — complete TOML reference and safe defaults
- [REST API](https://necrobrowser.phishing.click/api) — routes, request/response shapes, polling, sessions
- [Architecture](https://necrobrowser.phishing.click/architecture) — runtime components, browser isolation, task lifecycle
- [Tasks](https://necrobrowser.phishing.click/tasks) — task contract and per-task references
- [CLI](https://necrobrowser.phishing.click/cli) — `necrocli` command reference
- [Examples](https://necrobrowser.phishing.click/examples) — safe local request templates
- [Testing](https://necrobrowser.phishing.click/testing) — test matrix and fixture rules
- Engineering guidance for coding agents: [CLAUDE.md](https://github.com/muraenateam/necrobrowser/blob/main/CLAUDE.md)

## Contributing

1. Fork it!
2. Create your feature branch: `git checkout -b my-new-feature`
3. Commit your changes: `git commit -am 'Add some feature'`
4. Push to the branch: `git push origin my-new-feature`
5. Submit a pull request 🤩

See the list of [contributors](https://github.com/muraenateam/necrobrowser/contributors) who participated in this project.

## License

**Necrobrowser** is made with ❤️ by [the dev team](https://github.com/orgs/muraenateam/people) and it's released under the <a href="https://github.com/muraenateam/necrobrowser/blob/main/LICENSE"><img alt="Software License" src="https://img.shields.io/badge/license-BSD3-brightgreen.svg?style=flat-square"></a>.
