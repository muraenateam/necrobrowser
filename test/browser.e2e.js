'use strict';

const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
let puppeteer;
const { BrowserPool } = require('../browser/pool');
const { createApp } = require('../lib/app');
const { createNavigationPolicy } = require('../lib/navigation-policy');
const loader = require('../tasks/loader');
const db = require('../db/db');
const necrohelp = require('../tasks/helpers/necrohelp');

const runBrowserTests = process.env.NECRO_RUN_BROWSER_TESTS === '1';
const runExternalSmoke = process.env.NECRO_EXTERNAL_SMOKE === '1';
const describeBrowser = runBrowserTests ? describe : describe.skip;

function listen(server) {
    return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => resolve(server.address()));
    });
}

function close(server) {
    if (!server) return Promise.resolve();
    return new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}

function fixtureHtml() {
    return `<!doctype html>
<html>
<head><meta charset="utf-8"><title>NecroBrowser Fixture</title></head>
<body>
  <h1 id="title">Browser fixture</h1>
  <p id="locked">Locked: gate cookie missing</p>
  <section id="protected" hidden>
    <p id="unlocked">Unlocked: gate cookie accepted</p>
    <button id="reveal" type="button">Reveal input</button>
    <form id="message-form" hidden>
      <label>Message <input id="message" name="message"></label>
      <button id="submit" type="submit">Submit</button>
    </form>
    <p id="result" aria-live="polite"></p>
  </section>
  <script>
    const cookies = Object.fromEntries(document.cookie.split('; ').filter(Boolean).map(value => value.split('=')));
    const unlocked = cookies.gate === 'unlocked';
    document.querySelector('#locked').hidden = unlocked;
    document.querySelector('#protected').hidden = !unlocked;
    document.querySelector('#reveal').addEventListener('click', () => {
      document.querySelector('#message-form').hidden = false;
    });
    document.querySelector('#message-form').addEventListener('submit', event => {
      event.preventDefault();
      document.querySelector('#result').textContent = 'submitted:' + document.querySelector('#message').value;
    });
  </script>
</body>
</html>`;
}

describeBrowser('real browser workflow', () => {
    let fixture;
    let fixtureAddress;
    let apiServer;
    let apiAddress;
    let pool;
    let databasePath;
    let tempDirectory;
    let previousDatabasePath;

    const records = {
        screenshotPath: null,
        interaction: null
    };

    const tasks = {
        browsertest: ['InteractWithFixture'],
        browsertest__Tasks: {
            InteractWithFixture: async ({ page, data: [taskId, cookies, params] }) => {
                await db.UpdateTaskStatus(taskId, 'running');
                const target = params.urls[0];
                await necrohelp.ConfigureUserAgent(page, params.userAgent, taskId);
                await necrohelp.SetCookieJar(page, cookies);
                await page.goto(target, { waitUntil: 'networkidle0', timeout: 15000 });

                const unlocked = await page.$eval('#protected', element => !element.hidden);
                if (!unlocked) throw new Error('gate cookie did not unlock feature');
                const gateCookie = (await page.cookies(target)).find(cookie => cookie.name === 'gate');
                if (gateCookie?.value !== 'unlocked') throw new Error('gate cookie was not injected');

                await page.click('#reveal');
                await page.waitForSelector('#message', { visible: true });
                await page.type('#message', 'hello from puppeteer');
                await page.click('#submit');
                await page.waitForFunction(() => document.querySelector('#result')?.textContent === 'submitted:hello from puppeteer');

                const screenshotPath = path.join(tempDirectory, `interaction-${taskId.replace(/[^a-z0-9_-]/gi, '_')}.png`);
                await page.screenshot({ path: screenshotPath, fullPage: true });
                const interaction = await page.$eval('#result', element => ({
                    unlocked: !document.querySelector('#protected').hidden,
                    result: element.textContent
                }));
                records.screenshotPath = screenshotPath;
                records.interaction = interaction;
                await db.AddExtrudedData(taskId, 'interaction', Buffer.from(JSON.stringify({ ...interaction, gateCookie: gateCookie.value })).toString('base64'));
                await db.AddExtrudedData(taskId, 'screenshot', screenshotPath);
                await db.UpdateTaskStatus(taskId, 'completed');
            }
        }
    };

    beforeAll(async () => {
        const importedPuppeteer = await import('puppeteer');
        puppeteer = importedPuppeteer.default || importedPuppeteer;
        tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'necrobrowser-e2e-'));
        const profilesPath = path.join(tempDirectory, 'profiles');
        const extrusionPath = path.join(tempDirectory, 'extrusion');
        databasePath = path.join(tempDirectory, 'necro.db');
        fs.mkdirSync(profilesPath, { recursive: true, mode: 0o700 });
        fs.mkdirSync(extrusionPath, { recursive: true, mode: 0o700 });

        fixture = http.createServer((request, response) => {
            if (request.url === '/') {
                response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
                response.end(fixtureHtml());
                return;
            }
            response.writeHead(404);
            response.end();
        });
        fixtureAddress = await listen(fixture);

        previousDatabasePath = process.env.NECRO_DB_PATH;
        process.env.NECRO_DB_PATH = databasePath;
        await db.CheckDatabase({ path: databasePath });

        const config = {
            root: true,
            paths: { profilesPath, extrusionPath },
            platform: { profilesPath, extrusionPath },
            cluster: { concurrency: 'browser', poolSize: 1, taskTimeout: 30, queueLimit: 10, retryLimit: 0 },
            necro: { headless: true },
            ignoreHTTPSErrors: false
        };
        pool = new BrowserPool({ puppeteer, config, logger: console });
        await pool.start();

        const app = createApp({
            db,
            cluster: pool,
            tasks,
            loader,
            navigationPolicy: createNavigationPolicy({ allowPrivateNetworks: true, allowHttp: true })
        });
        apiServer = app.listen(0, '127.0.0.1');
        await new Promise(resolve => apiServer.once('listening', resolve));
        apiAddress = apiServer.address();
    }, 60000);

    afterAll(async () => {
        try { await pool?.waitForIdle(); } finally {
            await close(apiServer);
            await pool?.close({ force: true });
            await db.CloseDatabase();
            if (previousDatabasePath === undefined) delete process.env.NECRO_DB_PATH;
            else process.env.NECRO_DB_PATH = previousDatabasePath;
            await close(fixture);
            fs.rmSync(tempDirectory, { recursive: true, force: true });
        }
    }, 60000);

    async function submit(params, cookie = []) {
        const response = await fetch(`http://127.0.0.1:${apiAddress.port}/instrument`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                name: 'browser-e2e',
                task: { type: 'browsertest', name: ['InteractWithFixture'], params },
                cookies: JSON.stringify(cookie)
            })
        });
        const body = await response.json();
        if (response.status !== 200) throw new Error(`Task submission failed: ${JSON.stringify(body)}`);
        expect(body.necroIds).toHaveLength(1);
        return body.necroIds[0];
    }

    async function waitForTask(taskId, timeoutMs = 30000) {
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
            const response = await fetch(`http://127.0.0.1:${apiAddress.port}/instrument/${taskId}`);
            const body = await response.json();
            if (['completed', 'partial', 'error', 'cancelled'].includes(body.status)) return body;
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        throw new Error(`Task ${taskId} did not finish within ${timeoutMs}ms`);
    }

    test('visits local app, injects cookie, clicks, types, submits, and saves screenshot', async () => {
        const fixtureUrl = `http://127.0.0.1:${fixtureAddress.port}/`;
        const taskId = await submit(
            { urls: [fixtureUrl] },
            [{ name: 'gate', value: 'unlocked', url: fixtureUrl, path: '/', secure: false, httpOnly: false, sameSite: 'unspecified', storeId: '0' }]
        );
        const result = await waitForTask(taskId);

        expect(result.status).toBe('completed');
        expect(records.interaction).toEqual({ unlocked: true, result: 'submitted:hello from puppeteer' });
        expect(fs.statSync(records.screenshotPath).size).toBeGreaterThan(0);
        expect(result.data).toEqual(expect.arrayContaining([
            { url: 'interaction', encoded: expect.any(String) },
            { url: 'screenshot', encoded: records.screenshotPath }
        ]));
        const interaction = result.data.find(entry => entry.url === 'interaction');
        expect(JSON.parse(Buffer.from(interaction.encoded, 'base64').toString('utf8'))).toMatchObject({
            unlocked: true,
            result: 'submitted:hello from puppeteer',
            gateCookie: 'unlocked'
        });
    }, 60000);

    test('records blocked state when gate cookie is absent', async () => {
        const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
        try {
            const fixtureUrl = `http://127.0.0.1:${fixtureAddress.port}/`;
            const taskId = await submit({ urls: [fixtureUrl] });
            const result = await waitForTask(taskId);
            expect(result.status).toBe('error');
            expect(result.data).toContain('gate cookie did not unlock feature');
        } finally {
            consoleError.mockRestore();
        }
    }, 60000);

    const externalTest = runExternalSmoke ? test : test.skip;
    externalTest('visits public example.com when external smoke is enabled', async () => {
        if (!runExternalSmoke) return;
        const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
        try {
            const page = await browser.newPage();
            await page.goto('https://example.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
            expect(await page.title()).toBe('Example Domain');
            expect(await page.$eval('h1', element => element.textContent)).toBe('Example Domain');
            await page.screenshot({ path: path.join(tempDirectory, 'example-domain.png'), fullPage: true });
        } finally {
            await browser.close();
        }
    }, 60000);
});
