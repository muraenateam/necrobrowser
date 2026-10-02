const path = require('path');
const fs = require('fs');
const necrohelp = require('../../tasks/helpers/necrohelp');
const db = require('../../db/db');
const clusterLib = require('../../puppeteer/cluster');

function safeSegment(value, fallback = 'page') {
    const segment = String(value || '').replace(/[^a-z0-9._-]/gi, '_');
    return segment || fallback;
}

function outputDirectory(config, requestedPath) {
    const root = path.resolve(config.paths?.extrusionPath || config.platform.extrusionPath);
    const candidate = path.resolve(root, requestedPath || root);
    if (candidate !== root && !candidate.startsWith(`${root}${path.sep}`)) {
        throw new Error('outputPath must remain inside the configured extrusion directory');
    }
    fs.mkdirSync(candidate, { recursive: true });
    return candidate;
}

exports.ScreenshotPages = async ({ page, data: [taskId, cookies, params] }) => {
    await db.UpdateTaskStatus(taskId, 'running');
    const urls = params?.urls;
    if (!Array.isArray(urls) || urls.length === 0) {
        const error = new Error('params.urls must contain at least one URL');
        await db.UpdateTaskStatusWithReason(taskId, 'error', error.message);
        throw error;
    }

    const config = clusterLib.GetConfig();
    const destination = outputDirectory(config, params.outputPath);
    const shortId = safeSegment(taskId.split(':').pop(), 'task');
    const failures = [];

    await necrohelp.ConfigureUserAgent(page, params.userAgent, taskId);
    await necrohelp.SetCookieJar(page, cookies);

    for (const [index, url] of urls.entries()) {
        try {
            const parsedUrl = new URL(url);
            if (!['http:', 'https:'].includes(parsedUrl.protocol)) throw new Error('URL must use http or https');
            await necrohelp.timedGoto(page, url);
            const waitBeforeScreenshotMs = Number(params.waitBeforeScreenshotMs || 0);
            if (!Number.isFinite(waitBeforeScreenshotMs) || waitBeforeScreenshotMs < 0 || waitBeforeScreenshotMs > 300000) {
                throw new Error('waitBeforeScreenshotMs must be between 0 and 300000');
            }
            if (waitBeforeScreenshotMs > 0) await necrohelp.Sleep(waitBeforeScreenshotMs);
            const name = safeSegment(parsedUrl.pathname.split('/').filter(Boolean).pop(), 'index');
            const screenshotPath = path.join(destination, `screenshot_${shortId}_${index}_${name}.png`);
            await page.screenshot({ path: screenshotPath });
            await db.AddExtrudedData(taskId, url, screenshotPath);
        } catch (error) {
            failures.push({ url, error: error.message });
        }
    }

    if (failures.length === urls.length) {
        const reason = `All URLs failed: ${failures.map(failure => failure.error).join('; ')}`;
        await db.UpdateTaskStatusWithReason(taskId, 'error', reason);
        throw new Error(reason);
    }
    if (failures.length > 0) {
        await db.UpdateTaskStatusWithReason(taskId, 'partial', JSON.stringify(failures));
        return { status: 'partial', failures };
    }

    await db.UpdateTaskStatus(taskId, 'completed');
    return { status: 'completed' };
};
