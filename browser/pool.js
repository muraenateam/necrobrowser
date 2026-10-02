const { EventEmitter } = require('events');
const fs = require('fs/promises');
const path = require('path');

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function safeId(taskId) {
    return String(taskId).replace(/[^a-zA-Z0-9._-]/g, '_');
}

class BrowserPool extends EventEmitter {
    constructor({ puppeteer, config, logger = console, launch } = {}) {
        super();
        if (!puppeteer && !launch) {
            throw new TypeError('puppeteer or launch function is required');
        }
        this.puppeteer = puppeteer;
        this.config = config || {};
        this.logger = logger;
        this.launch = launch || ((options) => puppeteer.launch(options));
        this.mode = this.config.cluster?.concurrency || 'browser';
        this.maxConcurrency = Math.max(1, Number(this.config.cluster?.poolSize || 1));
        this.taskTimeout = Math.max(1, Number(this.config.cluster?.taskTimeout || 360)) * 1000;
        this.retryLimit = Math.max(0, Number(this.config.cluster?.retryLimit ?? 1));
        this.retryDelay = Math.max(0, Number(this.config.cluster?.retryDelay ?? 500));
        this.queueLimit = Math.max(this.maxConcurrency, Number(this.config.cluster?.queueLimit || 100));
        this.pending = [];
        this.active = 0;
        this.closed = false;
        this.startedAt = new Date();
        this.total = 0;
        this.completed = 0;
        this.errors = 0;
        this.sharedBrowser = null;
        this.sharedBrowserPromise = null;
        this.activeRuns = new Set();
    }

    async start() {
        if (this.closed) throw new Error('Browser pool is closed');
        if (this.mode === 'page') {
            await this.getSharedBrowser();
        }
        return this;
    }

    getViewport() {
        const windowSize = this.config.cluster?.page?.windowSize;
        const match = String(windowSize || '').match(/^(\d+)\s*[,x]\s*(\d+)$/i);
        if (!match) return null;
        const width = Number(match[1]);
        const height = Number(match[2]);
        if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) return null;
        return { width, height };
    }

    getLaunchOptions({ profilePath } = {}) {
        const platform = this.config.platform || {};
        const necro = this.config.necro || {};
        const headless = necro.headless !== false;
        const options = {
            headless,
            // Puppeteer otherwise forces a 800x600 viewport even when Chrome has
            // a larger --window-size. Visible mode follows the native window.
            defaultViewport: headless ? this.getViewport() : null,
            args: Array.isArray(this.config.browser?.args)
                ? [...this.config.browser.args]
                : this.getDefaultArgs(),
            ignoreHTTPSErrors: this.config.ignoreHTTPSErrors === true
        };
        if (platform.puppetPath) options.executablePath = platform.puppetPath;
        if (profilePath) options.userDataDir = profilePath;
        return options;
    }

    async configurePage(page) {
        const viewport = this.getViewport();
        if (viewport && typeof page.setViewport === 'function' && this.config.necro?.headless !== false) {
            await page.setViewport(viewport);
        }
        return page;
    }

    getDefaultArgs() {
        const page = this.config.cluster?.page || {};
        const args = [];
        if (page.windowSize) args.push(`--window-size=${page.windowSize}`);
        // Required by existing iframe-heavy tasks; remove after those tasks migrate.
        args.push('--disable-features=site-per-process');
        if (this.config.debug && this.config.necro?.proxy?.enabled) {
            args.push(`--proxy-server=${this.config.necro.proxy.url}`);
        }
        if (this.config.root) args.push('--no-sandbox', '--disable-setuid-sandbox');
        if (this.config.ignoreHTTPSErrors === true) args.push('--ignore-certificate-errors');
        return [...new Set(args)];
    }

    async getSharedBrowser() {
        if (this.sharedBrowser) return this.sharedBrowser;
        if (!this.sharedBrowserPromise) {
            this.sharedBrowserPromise = this.launch(this.getLaunchOptions())
                .then(browser => {
                    this.sharedBrowser = browser;
                    browser.on?.('disconnected', () => {
                        if (this.sharedBrowser === browser) this.sharedBrowser = null;
                        this.emit('browserdisconnected');
                    });
                    return browser;
                })
                .finally(() => {
                    this.sharedBrowserPromise = null;
                });
        }
        return this.sharedBrowserPromise;
    }

    async queue(data, taskFn) {
        if (this.closed) throw new Error('Browser pool is shutting down');
        if (typeof taskFn !== 'function') throw new TypeError('task function is required');
        if (this.pending.length + this.active >= this.queueLimit) {
            const error = new Error('Browser task queue is full');
            error.code = 'QUEUE_FULL';
            throw error;
        }

        this.total += 1;
        this.pending.push({ data, taskFn });
        this.schedule();
    }

    schedule() {
        while (!this.closed && this.active < this.maxConcurrency && this.pending.length > 0) {
            const job = this.pending.shift();
            this.active += 1;
            const run = this.execute(job)
                .catch(error => this.logger.error?.(`[browser] task execution failed: ${error.message}`))
                .finally(() => {
                    this.activeRuns.delete(run);
                    this.active -= 1;
                    this.schedule();
                });
            this.activeRuns.add(run);
        }
    }

    async execute({ data, taskFn }) {
        const taskId = data?.[0] || 'unknown';
        let attempt = 0;
        while (attempt <= this.retryLimit) {
            let resources;
            try {
                resources = await this.createResources(taskId);
                await this.withTimeout(
                    taskFn({ ...resources, data }),
                    this.taskTimeout,
                    `Task ${taskId} timed out after ${this.taskTimeout}ms`
                );
                this.completed += 1;
                return;
            } catch (error) {
                const willRetry = attempt < this.retryLimit && !this.closed;
                this.emit('taskerror', error, data, willRetry);
                if (!willRetry) {
                    this.errors += 1;
                    return;
                }
                await sleep(this.retryDelay * (attempt + 1));
                attempt += 1;
            } finally {
                await this.closeResources(resources);
            }
        }
    }

    async createResources(taskId) {
        if (this.mode === 'page') {
            const browser = await this.getSharedBrowser();
            const context = await this.createContext(browser);
            const page = await context.newPage();
            await this.configurePage(page);
            return { browser, context, page, ownsBrowser: false };
        }

        let profilePath;
        if (this.mode === 'necro') {
            const profilesPath = this.config.paths?.profilesPath || this.config.platform?.profilesPath;
            if (!profilesPath) throw new Error('profilesPath is required for necro mode');
            profilePath = path.join(path.resolve(profilesPath), safeId(taskId));
            await fs.mkdir(profilePath, { recursive: true });
        }

        const browser = await this.launch(this.getLaunchOptions({ profilePath }));
        const page = await browser.newPage();
        await this.configurePage(page);
        browser.on?.('disconnected', () => this.emit('browserdisconnected', taskId));
        return { browser, page, ownsBrowser: true };
    }

    async createContext(browser) {
        if (typeof browser.createBrowserContext === 'function') {
            return browser.createBrowserContext();
        }
        if (typeof browser.createIncognitoBrowserContext === 'function') {
            return browser.createIncognitoBrowserContext();
        }
        throw new Error('Browser does not support isolated contexts');
    }

    async closeResources(resources) {
        if (!resources) return;
        try { await resources.page?.close(); } catch (_) { /* already closed */ }
        if (resources.context) {
            try { await resources.context.close(); } catch (_) { /* already closed */ }
        }
        if (resources.ownsBrowser && resources.browser) {
            try { await resources.browser.close(); } catch (_) { /* already closed */ }
        }
    }

    async withTimeout(promise, timeout, message) {
        let timer;
        try {
            return await Promise.race([
                promise,
                new Promise((_, reject) => {
                    timer = setTimeout(() => {
                        const error = new Error(message);
                        error.code = 'TASK_TIMEOUT';
                        reject(error);
                    }, timeout);
                })
            ]);
        } finally {
            clearTimeout(timer);
        }
    }

    monitor() {
        const queued = this.pending.length;
        const done = this.completed + this.errors;
        const total = Math.max(this.total, done + queued + this.active);
        const percentage = total === 0 ? 100 : ((done / total) * 100);
        return {
            startedAt: this.startedAt.toISOString(),
            workers: String(this.maxConcurrency),
            queued: String(queued),
            active: String(this.active),
            progress: `${done} / ${total} (${percentage.toFixed(2)}%)`,
            errors: String(this.errors),
            tasks: []
        };
    }

    metrics() {
        return this.monitor();
    }

    async waitForIdle() {
        while (this.active > 0 || this.pending.length > 0) {
            await sleep(10);
        }
    }

    async close({ force = false } = {}) {
        if (this.closed) return;
        this.closed = true;
        this.pending.length = 0;
        if (!force) await Promise.allSettled([...this.activeRuns]);
        if (this.sharedBrowser) {
            try { await this.sharedBrowser.close(); } catch (_) { /* already closed */ }
            this.sharedBrowser = null;
        }
    }
}

module.exports = { BrowserPool, safeId };
