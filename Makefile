.PHONY: docs docs-build docs-check docs-install docs-jekyll

# Local npm preview; no Ruby or gem required. Ctrl-C stops server.
docs: docs-check
	@npm run docs:preview

docs-build:
	@npm run docs:build

docs-check:
	@npm run docs:check

# Optional production-parity Jekyll validation. Local preview does not need this.
docs-jekyll:
	@cd docs && bundle exec jekyll build

docs-install:
	@printf '%s\n' 'No Ruby setup needed for make docs.'
	@printf '%s\n' 'Optional GitHub Pages parity: install locked Bundler, then run make docs-jekyll.'
