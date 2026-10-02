# Local documentation

Documentation source for [necrobrowser.phishing.click](https://necrobrowser.phishing.click/).

## Preview locally with npm

No Ruby, Bundler, or `gem` required. Node.js/npm is already required by Necrobrowser.

```bash
npm install
make docs
```

`make docs` runs safety checks, renders Markdown with Node, starts local server at [http://127.0.0.1:4000/](http://127.0.0.1:4000/), opens browser, and watches docs for rebuilds. Press Ctrl-C to stop.

Equivalent commands:

```bash
npm run docs:check
npm run docs:build
npm run docs:preview
```

Disable automatic browser opening in CI/headless shells:

```bash
DOCS_NO_OPEN=1 npm run docs:preview
```

## Optional GitHub Pages parity

Production site uses GitHub Pages/Jekyll. Ruby/Bundler is optional for local work. If installed with the locked version in `docs/Gemfile.lock`, run:

```bash
make docs-jekyll
```

This validates Jekyll-specific behavior; it is not needed for `make docs`.
