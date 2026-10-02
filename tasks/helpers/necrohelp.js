const db = require('../../db/db')
const clusterLib = require('../../puppeteer/cluster')
const fs = require('fs')
const path = require('path')
const totp = require("totp-generator");

exports.ScreenshotFullPage = async function (page, taskId, url) {
    console.log(`[${taskId}] taking screenshot of ${url}`)
    try {
        let screenshotData;
        let timeout = 5000;  // TODO expose this timeout in the config
        await page.goto(url, { waitUntil: 'networkidle0', timeout: timeout }).then(async () => {
            screenshotData = await page.screenshot({ fullPage: true, encoding: "base64" });
            await db.AddExtrudedData(taskId, url, screenshotData)
            // Page lifecycle belongs to browser pool.
        })
    } catch (e) {
        if (e.name === "TimeoutError") {
            console.log(`[${taskId}] timeout error for ${url}`)
        } else {
            console.log(`[${taskId}] non-timeout error for ${url}:${e.message}`)
        }

        throw e;
    }
}

exports.ScreenshotCurrentPage = async function (page, taskId) {
    let url = await page.url()
    console.log(`[${taskId}] taking screenshot of ${url}`)

    try {
        // Wait for page to be fully rendered and check viewport
        await exports.Sleep(1000)

        // Try to ensure viewport has proper dimensions
        const viewport = await page.viewport()
        if (!viewport || viewport.width === 0 || viewport.height === 0) {
            console.log(`[${taskId}] Invalid viewport detected, setting default viewport`)
            await page.setViewport({ width: 1920, height: 1080 })
            await exports.Sleep(500)
        }

        let screenshotData = await page.screenshot({ fullPage: true, encoding: "base64" });
        await db.AddExtrudedData(taskId, url, screenshotData)
    } catch (error) {
        console.log(`[${taskId}] Screenshot failed for ${url}: ${error.message}`)
        // Try one more time with viewport clip instead of fullPage
        try {
            await exports.Sleep(500)
            let screenshotData = await page.screenshot({ encoding: "base64" });
            await db.AddExtrudedData(taskId, url, screenshotData)
            console.log(`[${taskId}] Screenshot succeeded on retry with clipped view`)
        } catch (retryError) {
            console.log(`[${taskId}] Screenshot retry also failed: ${retryError.message}`)
            throw retryError;
        }
    }
}
exports.ScreenshotCurrentPageToFS = async function (page, taskId, description = 'screenshot') {
    let url = await page.url()
    console.log(`[${taskId}] taking screenshot of ${url} and saving to filesystem`)

    const sanitizedDesc = description.replace(/[^a-z0-9_-]/gi, '_').toLowerCase()
    const fullPath = exports.getOutputPath(
        clusterLib.GetConfig(),
        `screenshot_${taskId}_${sanitizedDesc}_${Date.now()}.png`
    ) || '';

    try {
        // Wait for page to be fully rendered and check viewport
        await exports.Sleep(1000)

        // Try to ensure viewport has proper dimensions
        const viewport = await page.viewport()
        if (!viewport || viewport.width === 0 || viewport.height === 0) {
            console.log(`[${taskId}] Invalid viewport detected, setting default viewport`)
            await page.setViewport({ width: 1920, height: 1080 })
            await exports.Sleep(500)
        }

        // Save to filesystem
        await page.screenshot({ fullPage: true, path: fullPath })
        console.log(`[${taskId}] Screenshot saved to: ${fullPath}`)

        // Also save to SQLite
        let screenshotData = await page.screenshot({ fullPage: true, encoding: "base64" })
        await db.AddExtrudedData(taskId, `fs_${sanitizedDesc}`, screenshotData)

        return fullPath
    } catch (error) {
        console.log(`[${taskId}] Screenshot to FS failed for ${url}: ${error.message}`)
        // Try one more time with viewport clip instead of fullPage
        try {
            await exports.Sleep(500)
            await page.screenshot({ path: fullPath })
            let screenshotData = await page.screenshot({ encoding: "base64" })
            await db.AddExtrudedData(taskId, `fs_${sanitizedDesc}`, screenshotData)
            console.log(`[${taskId}] Screenshot succeeded on retry with clipped view`)
            return fullPath
        } catch (retryError) {
            console.log(`[${taskId}] Screenshot retry also failed: ${retryError.message}`)
            return null
        }
    }
}

exports.ScreenshotFullPageToFS = async function (page, taskId, url, path) {
    console.log(`[${taskId}] taking screenshot of ${url}`)
    try {
        let screenshotData;
        let timeout = 5000;  // TODO expose this timeout in the config
        await page.goto(url, { waitUntil: 'networkidle0', timeout: timeout }).then(async () => {
            let filename = url.split("/").pop() //take the last element in the url path

            await page.screenshot({ fullPage: true, path: `${path}/${filename}-${Date.now()}.jpg` });
        })
    } catch (e) {
        if (e.name === "TimeoutError") {
            console.log(`[${taskId}] timeout error for ${url}`)
        } else {
            console.log(`[${taskId}] non-timeout error for ${url}:${e.message}`)
        }

        throw e;
    }
}

exports.SetPageScaleFactor = async function (page, scaleFactor) {
    console.log(`setting page scaleFactor to ${scaleFactor}`)
    try {
        if (typeof page.target === 'function') {
            const client = await page.target().createCDPSession();
            await client.send('Emulation.setPageScaleFactor', { pageScaleFactor: scaleFactor })
        } else {
            console.log(`CDP session unavailable, skipping scaleFactor setting`)
        }
    } catch (error) {
        console.log(`Failed to set page scaleFactor: ${error.message}`)
    }
}

exports.IsAlphanumeric = function (str) {
    return typeof str === 'string' && /^[A-Za-z0-9]+$/.test(str);
}

// SetCookies sets cookies on a Puppeteer page with Puppeteer/CDP compatibility fixes.
// Handles:
//  - Renaming 'expirationDate' to 'expires' (legacy Muraena field name)
//  - Removing non-CDP fields ('session')
//  - Adding 'url' context for secure cookie setting from about:blank
//  - Optional domain override (overrideDomain) to replace cookie domains with a target hostname,
//    working around Puppeteer silently rejecting cookies whose domain doesn't match the url host.
function normalizeCookie(cookie, options = {}) {
    const normalized = { ...cookie };
    if (normalized.expirationDate !== undefined && normalized.expires === undefined) {
        normalized.expires = normalized.expirationDate;
    }
    delete normalized.expirationDate;
    delete normalized.session;
    delete normalized.hostOnly;
    delete normalized.storeId;
    delete normalized.id;

    if (normalized.sameSite !== undefined) {
        const sameSite = String(normalized.sameSite).toLowerCase();
        if (sameSite === 'strict') normalized.sameSite = 'Strict';
        else if (sameSite === 'lax') normalized.sameSite = 'Lax';
        else if (sameSite === 'none') normalized.sameSite = 'None';
        else delete normalized.sameSite;
    }
    if (options.overrideDomain) normalized.domain = options.overrideDomain;
    if (options.url) normalized.url = options.url;
    return normalized;
}

exports.SetCookies = async function (page, cookies, options = {}) {
    if (!cookies || cookies.length === 0) return;
    await page.setCookie(...cookies.map(cookie => normalizeCookie(cookie, options)));
}

exports.SetCookieJar = async function (page, cookies = []) {
    const groups = new Map();
    for (const cookie of cookies) {
        const explicitUrl = cookie.url ? new URL(cookie.url).origin + '/' : null;
        const domain = String(cookie.domain || '').replace(/^\./, '').toLowerCase();
        const groupKey = explicitUrl || (domain ? `https://${domain}/` : '');
        if (!groupKey) continue;
        if (!groups.has(groupKey)) groups.set(groupKey, []);
        groups.get(groupKey).push(cookie);
    }
    for (const [url, group] of groups) {
        await exports.SetCookies(page, group, { url });
    }
}

exports.Totp = async function (secretKey) {
    return totp(secretKey, { digits: 6 });
}

exports.Sleep = async function (ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

exports.ConfigureUserAgent = async function (page, userAgent, taskId) {
    if (!userAgent || userAgent.trim() === '' || userAgent === '%%%USERAGENT%%%') {
        return;
    }

    const UAParser = require('ua-parser-js');
    const parser = new UAParser(userAgent);
    const os = parser.getOS();
    const device = parser.getDevice();
    const browser = parser.getBrowser();

    console.log(`[${taskId}] Spoofing UA: ${browser.name}/${browser.version} on ${os.name}/${os.version}`);

    // Set UA string
    await page.setUserAgent(userAgent);

    // Determine navigator.platform
    let platform = 'Win32';
    if (os.name) {
        const osLower = os.name.toLowerCase();
        if (osLower.includes('mac')) platform = 'MacIntel';
        else if (osLower.includes('linux') && !osLower.includes('android')) platform = 'Linux x86_64';
        else if (osLower.includes('android')) platform = 'Linux armv8l';
        else if (osLower.includes('ios') || osLower.includes('iphone')) platform = 'iPhone';
    }

    const isMobile = device.type === 'mobile' || device.type === 'tablet';

    // Set mobile viewport if needed
    if (isMobile) {
        await page.setViewport({ width: 412, height: 915, isMobile: true, hasTouch: true });
    }

    // Determine architecture from OS/platform
    let architecture = 'x86';
    if (os.name) {
        const osLower = os.name.toLowerCase();
        if (osLower.includes('android') || osLower.includes('ios') || osLower.includes('iphone')) {
            architecture = '';
        } else if (platform === 'Linux x86_64' || platform === 'MacIntel' || platform === 'Win32') {
            architecture = 'x86';
        }
    }

    // Determine model (empty for desktop, device model for mobile)
    let model = '';
    if (device.model) {
        model = device.model;
    }

    // Determine platform version
    let platformVersion = os.version || '0.0.0';

    // Build fullVersion from browser version
    let fullVersion = browser.version || '';

    // Build brands list from browser info
    let brands = [];
    if (browser.name) {
        const majorVersion = browser.version ? browser.version.split('.')[0] : '0';
        brands.push({ brand: browser.name, version: majorVersion });
        brands.push({ brand: 'Not_A Brand', version: '8' });
        if (browser.name.toLowerCase().includes('chrome') || browser.name.toLowerCase().includes('chromium')) {
            brands.push({ brand: 'Chromium', version: majorVersion });
        }
    }

    // Use CDP for full fingerprint override (platform, mobile flag, architecture, model)
    try {
        const client = await page.target().createCDPSession();
        await client.send('Emulation.setUserAgentOverride', {
            userAgent: userAgent,
            platform: platform,
            userAgentMetadata: {
                brands: brands,
                fullVersionList: brands.map(b => ({ brand: b.brand, version: fullVersion || b.version })),
                platform: platform,
                platformVersion: platformVersion,
                architecture: architecture,
                model: model,
                mobile: isMobile,
                fullVersion: fullVersion
            }
        });
    } catch (e) {
        console.log(`[${taskId}] CDP setUserAgentOverride failed (UA string still set): ${e.message}`);
    }
}

exports.getOutputDirectory = function (config) {
    const outputPath = config?.paths?.extrusionPath || config?.platform?.extrusionPath;
    if (!outputPath) throw new Error('Configured extrusion path is required');
    fs.mkdirSync(outputPath, { recursive: true });
    return path.resolve(outputPath);
}

exports.getOutputPath = function (config, ...segments) {
    const root = exports.getOutputDirectory(config);
    const safeSegments = segments.map(segment => String(segment).replace(/[^a-z0-9._-]/gi, '_'));
    const candidate = path.resolve(root, ...safeSegments);
    if (candidate !== root && !candidate.startsWith(`${root}${path.sep}`)) {
        throw new Error('Output path must remain inside configured extrusion directory');
    }
    return candidate;
}

exports.setDownloadBehavior = async function (page, downloadPath) {
    fs.mkdirSync(downloadPath, { recursive: true });
    const context = typeof page.browserContext === 'function' ? page.browserContext() : null;
    if (context && typeof context.setDownloadBehavior === 'function') {
        await context.setDownloadBehavior({ behavior: 'allow', downloadPath });
        return;
    }
    if (typeof page.target === 'function') {
        const client = await page.target().createCDPSession();
        await client.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath });
        return;
    }
    throw new Error('Page does not support download configuration');
}

exports.runTask = async function (db, taskId, action) {
    await db.UpdateTaskStatus(taskId, 'running');
    try {
        const result = await action();
        if (result?.status === 'partial') {
            await db.UpdateTaskStatusWithReason(taskId, 'partial', JSON.stringify(result.failures || []));
        } else {
            await db.UpdateTaskStatus(taskId, 'completed');
        }
        return result;
    } catch (error) {
        await db.UpdateTaskStatusWithReason(taskId, 'error', error.message || 'Task failed');
        throw error;
    }
}

exports.requireArray = function (value, name, { min = 1 } = {}) {
    if (!Array.isArray(value) || value.length < min) {
        throw new Error(`${name} must contain at least ${min} item${min === 1 ? '' : 's'}`);
    }
    return value;
}

exports.requireHttpUrl = function (value, name = 'URL') {
    let parsed;
    try { parsed = new URL(value); } catch (_) { throw new Error(`${name} must be a valid URL`); }
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
        throw new Error(`${name} must use http or https without credentials`);
    }
    return parsed;
}

exports.timedGoto = async function (page, url, options = {}) {
    exports.requireHttpUrl(url);
    return page.goto(url, { waitUntil: 'networkidle2', timeout: 30000, ...options });
}