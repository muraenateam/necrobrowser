'use strict';

const path = require('path');
const fs = require('fs');
const necrohelp = require('../../tasks/helpers/necrohelp');
const db = require('../../db/db');
const clusterLib = require('../../puppeteer/cluster');

const MAX_WAIT_MS = 300000;
const ALLOWED_KEYS = new Set(['Enter', 'Tab', 'Escape', 'Backspace', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Delete']);

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

function boundedInteger(value, name, min, max) {
    const number = Number(value);
    if (!Number.isInteger(number) || number < min || number > max) {
        throw new Error(`${name} must be an integer between ${min} and ${max}`);
    }
    return number;
}

function boundedWait(value, name) {
    const wait = Number(value || 0);
    if (!Number.isFinite(wait) || wait < 0 || wait > MAX_WAIT_MS) {
        throw new Error(`${name} must be between 0 and ${MAX_WAIT_MS}`);
    }
    return wait;
}

function requiredString(value, name) {
    if (typeof value !== 'string' || value.trim() === '') throw new Error(`${name} is required`);
    return value;
}

function selectorType(selector) {
    return selector.startsWith('xpath:') ? 'xpath' : 'css';
}

function selectorValue(selector) {
    return selectorType(selector) === 'xpath' ? selector.slice('xpath:'.length).trim() : selector;
}

async function waitForTarget(page, selector) {
    const value = selectorValue(requiredString(selector, 'params.selector'));
    if (!value) throw new Error('params.selector is required');
    if (selectorType(selector) === 'xpath') {
        if (typeof page.waitForXPath !== 'function' || typeof page.$x !== 'function') {
            throw new Error('XPath selectors are not supported by this browser adapter');
        }
        await page.waitForXPath(value, { visible: true, timeout: 30000 });
        const handles = await page.$x(value);
        if (!handles?.length) throw new Error('params.selector did not match an element');
        return { type: 'xpath', value, handle: handles[0] };
    }
    await page.waitForSelector(value, { visible: true, timeout: 30000 });
    return { type: 'css', value };
}

async function clickTarget(page, target) {
    if (target.type === 'xpath') return target.handle.click();
    return page.click(target.value);
}

async function targetType(page, target) {
    if (target.type === 'xpath') {
        return target.handle.evaluate(element => ({
            tagName: element.tagName.toLowerCase(),
            contentEditable: element.isContentEditable
        }));
    }
    return page.$eval(target.value, element => ({
        tagName: element.tagName.toLowerCase(),
        contentEditable: element.isContentEditable
    }));
}

async function typeTarget(page, target, text) {
    if (target.type === 'xpath') return target.handle.type(text);
    return page.type(target.value, text);
}

async function setup(page, taskId, cookies, params) {
    await necrohelp.ConfigureUserAgent(page, params?.userAgent, taskId);
    await necrohelp.SetCookieJar(page, cookies);
}

async function navigate(page, params) {
    const url = necrohelp.requireHttpUrl(requiredString(params?.url, 'params.url')).toString();
    await necrohelp.timedGoto(page, url);
    return url;
}

async function saveScreenshot(page, taskId, params, label) {
    const waitBeforeScreenshotMs = boundedWait(params.waitBeforeScreenshotMs, 'waitBeforeScreenshotMs');
    const waitAfterScreenshotMs = boundedWait(params.waitAfterScreenshotMs, 'waitAfterScreenshotMs');
    if (waitBeforeScreenshotMs > 0) await necrohelp.Sleep(waitBeforeScreenshotMs);
    const destination = outputDirectory(clusterLib.GetConfig(), params.outputPath);
    const screenshotPath = path.join(destination, `screenshot_${safeSegment(taskId.split(':').pop(), 'task')}_${safeSegment(label)}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    if (waitAfterScreenshotMs > 0) await necrohelp.Sleep(waitAfterScreenshotMs);
    return screenshotPath;
}

async function finish(taskId, result) {
    await db.UpdateTaskStatus(taskId, 'completed');
    return result;
}

exports.Screenshot = async ({ page, data: [taskId, cookies, params] }) => {
    await db.UpdateTaskStatus(taskId, 'running');
    const urls = params?.urls;
    if (!Array.isArray(urls) || urls.length === 0) {
        const error = new Error('params.urls must contain at least one URL');
        await db.UpdateTaskStatusWithReason(taskId, 'error', error.message);
        throw error;
    }

    const failures = [];
    await setup(page, taskId, cookies, params);
    const waitBeforeScreenshotMs = boundedWait(params.waitBeforeScreenshotMs, 'waitBeforeScreenshotMs');
    const waitAfterScreenshotMs = boundedWait(params.waitAfterScreenshotMs, 'waitAfterScreenshotMs');
    const destination = outputDirectory(clusterLib.GetConfig(), params.outputPath);
    const shortId = safeSegment(taskId.split(':').pop(), 'task');

    for (const [index, url] of urls.entries()) {
        try {
            const parsedUrl = necrohelp.requireHttpUrl(url);
            await necrohelp.timedGoto(page, parsedUrl.toString());
            if (waitBeforeScreenshotMs > 0) await necrohelp.Sleep(waitBeforeScreenshotMs);
            const name = safeSegment(parsedUrl.pathname.split('/').filter(Boolean).pop(), 'index');
            const screenshotPath = path.join(destination, `screenshot_${shortId}_${index}_${name}.png`);
            await page.screenshot({ path: screenshotPath });
            if (waitAfterScreenshotMs > 0) await necrohelp.Sleep(waitAfterScreenshotMs);
            await db.AddExtrudedData(taskId, parsedUrl.toString(), screenshotPath);
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

    return finish(taskId, { status: 'completed' });
};

exports.Click = async ({ page, data: [taskId, cookies, params] }) => {
    await db.UpdateTaskStatus(taskId, 'running');
    try {
        await setup(page, taskId, cookies, params);
        const url = await navigate(page, params);
        const target = await waitForTarget(page, params?.selector);
        const waitAfterMs = boundedWait(params.waitAfterMs, 'waitAfterMs');
        await clickTarget(page, target);
        if (waitAfterMs > 0) await necrohelp.Sleep(waitAfterMs);
        const result = { status: 'completed', url, selector: params.selector };
        if (params.screenshot === true) {
            result.screenshotPath = await saveScreenshot(page, taskId, params, 'click');
            await db.AddExtrudedData(taskId, 'screenshot', result.screenshotPath);
        }
        return finish(taskId, result);
    } catch (error) {
        await db.UpdateTaskStatusWithReason(taskId, 'error', error.message);
        throw error;
    }
};

exports.Fill = async ({ page, data: [taskId, cookies, params] }) => {
    await db.UpdateTaskStatus(taskId, 'running');
    try {
        await setup(page, taskId, cookies, params);
        const url = await navigate(page, params);
        const target = await waitForTarget(page, params?.selector);
        const text = requiredString(params?.text, 'params.text');
        const waitAfterMs = boundedWait(params.waitAfterMs, 'waitAfterMs');
        const elementType = await targetType(page, target);
        if (!['input', 'textarea'].includes(elementType.tagName) && !elementType.contentEditable) {
            throw new Error('params.selector must target an input, textarea, or contenteditable element');
        }
        if (params.clear !== false) await clickTarget(page, target);
        await typeTarget(page, target, text);
        if (waitAfterMs > 0) await necrohelp.Sleep(waitAfterMs);
        const result = { status: 'completed', url, selector: params.selector };
        if (params.screenshot === true) {
            result.screenshotPath = await saveScreenshot(page, taskId, params, 'fill');
            await db.AddExtrudedData(taskId, 'screenshot', result.screenshotPath);
        }
        return finish(taskId, result);
    } catch (error) {
        await db.UpdateTaskStatusWithReason(taskId, 'error', error.message);
        throw error;
    }
};

async function scrollPosition(page, scrollTarget) {
    if (!scrollTarget) return page.evaluate(() => window.scrollY);
    return page.$eval(scrollTarget, element => element.scrollTop);
}

async function scrollBy(page, scrollTarget, pixels) {
    if (!scrollTarget) {
        await page.evaluate(value => window.scrollBy(0, value), pixels);
        return;
    }
    await page.$eval(scrollTarget, (element, value) => { element.scrollTop += value; }, pixels);
}

exports.Scroll = async ({ page, data: [taskId, cookies, params] }) => {
    await db.UpdateTaskStatus(taskId, 'running');
    try {
        await setup(page, taskId, cookies, params);
        const url = await navigate(page, params);
        const pixels = boundedInteger(params?.scrollPixels, 'params.scrollPixels', 1, 10000);
        const count = boundedInteger(params?.scrollCount, 'params.scrollCount', 1, 100);
        const delay = boundedWait(params?.delayBetweenScrollsMs ?? 1000, 'delayBetweenScrollsMs');
        const beforeFirst = boundedWait(params?.waitBeforeFirstScrollMs, 'waitBeforeFirstScrollMs');
        const behavior = params?.endOfPageBehavior || 'stop';
        if (!['stop', 'retry', 'continue'].includes(behavior)) throw new Error('endOfPageBehavior must be stop, retry, or continue');
        const target = params?.scrollTarget || null;
        if (beforeFirst > 0) await necrohelp.Sleep(beforeFirst);
        let completed = 0;
        let reachedEndOfPage = false;
        let previous = await scrollPosition(page, target);
        const screenshots = [];
        for (let index = 0; index < count; index += 1) {
            await scrollBy(page, target, pixels);
            if (delay > 0) await necrohelp.Sleep(delay);
            const current = await scrollPosition(page, target);
            if (current === previous) {
                reachedEndOfPage = true;
                if (behavior === 'stop' || (behavior === 'retry' && index > 0)) break;
            }
            previous = current;
            completed += 1;
            if (params.captureScreenshots === true) {
                screenshots.push(await saveScreenshot(page, taskId, params, `scroll-${completed}`));
            }
        }
        const result = {
            status: 'completed', url, scrollsCompleted: completed,
            stoppedReason: completed >= count ? 'max-iterations-reached' : 'end-of-page',
            finalScrollPosition: await scrollPosition(page, target), reachedEndOfPage, screenshots
        };
        if (params.screenshot === true) {
            result.screenshotPath = await saveScreenshot(page, taskId, params, 'scroll-final');
            await db.AddExtrudedData(taskId, 'screenshot', result.screenshotPath);
        }
        return finish(taskId, result);
    } catch (error) {
        await db.UpdateTaskStatusWithReason(taskId, 'error', error.message);
        throw error;
    }
};

exports.Press = async ({ page, data: [taskId, cookies, params] }) => {
    await db.UpdateTaskStatus(taskId, 'running');
    try {
        await setup(page, taskId, cookies, params);
        const url = params?.url ? await navigate(page, params) : page.url();
        const key = requiredString(params?.key, 'params.key');
        if (!ALLOWED_KEYS.has(key)) throw new Error(`params.key must be one of: ${Array.from(ALLOWED_KEYS).join(', ')}`);
        if (params.selector) await clickTarget(page, await waitForTarget(page, params.selector));
        await page.keyboard.press(key);
        const waitAfterMs = boundedWait(params.waitAfterMs, 'waitAfterMs');
        if (waitAfterMs > 0) await necrohelp.Sleep(waitAfterMs);
        const result = { status: 'completed', url, key, selector: params.selector || null };
        if (params.screenshot === true) {
            result.screenshotPath = await saveScreenshot(page, taskId, params, 'press');
            await db.AddExtrudedData(taskId, 'screenshot', result.screenshotPath);
        }
        return finish(taskId, result);
    } catch (error) {
        await db.UpdateTaskStatusWithReason(taskId, 'error', error.message);
        throw error;
    }
};
