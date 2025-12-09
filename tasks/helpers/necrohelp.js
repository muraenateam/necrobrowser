const db = require('../../db/db')
const clusterLib = require('../../puppeteer/cluster')
const totp = require("totp-generator");

exports.ScreenshotFullPage = async function (page, taskId, url) {
    console.log(`[${taskId}] taking screenshot of ${url}`)
    try {
        let screenshotData;
        let timeout = 5000;  // TODO expose this timeout in the config
        await page.goto(url, { waitUntil: 'networkidle0', timeout: timeout }).then(async () => {
            screenshotData = await page.screenshot({ fullPage: true, encoding: "base64" });
            await db.AddExtrudedData(taskId, url, screenshotData)
            await page.close();
        })
    } catch (e) {
        if (e.name === "TimeoutError") {
            console.log(`[${taskId}] timeout error for ${url}`)
        } else {
            console.log(`[${taskId}] non-timeout error for ${url}:${e.message}`)
        }

        await page.close();
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
        }
    }
}
exports.ScreenshotCurrentPageToFS = async function (page, taskId, description = 'screenshot') {
    let url = await page.url()
    console.log(`[${taskId}] taking screenshot of ${url} and saving to filesystem`)

    const extrusionPath = clusterLib.GetConfig().platform.extrusionPath
    const timestamp = Date.now()
    const sanitizedDesc = description.replace(/[^a-z0-9_-]/gi, '_').toLowerCase()
    const filename = `screenshot_${taskId}_${sanitizedDesc}_${timestamp}.png`
    const fullPath = `${extrusionPath}/${filename}`

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

        // Also save to Redis
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

            await page.screenshot({ fullPage: true, path: `${path}/${filename}-${Date.now()}.jpg` }).catch(console.error);
            await page.close();
        })
    } catch (e) {
        if (e.name === "TimeoutError") {
            console.log(`[${taskId}] timeout error for ${url}`)
        } else {
            console.log(`[${taskId}] non-timeout error for ${url}:${e.message}`)
        }

        await page.close();
    }
}

exports.SetPageScaleFactor = async function (page, scaleFactor) {
    console.log(`setting page scaleFactor to ${scaleFactor}`)
    try {
        if (page._client && typeof page._client.send === 'function') {
            await page._client.send('Emulation.setPageScaleFactor', { pageScaleFactor: scaleFactor })
        } else {
            console.log(`page._client not available, skipping scaleFactor setting (this is normal in some browser modes)`)
        }
    } catch (error) {
        console.log(`Failed to set page scaleFactor: ${error.message}`)
    }
}

exports.IsAlphanumeric = async function (str) {
    let code, i, len;
    let isAlphanumeric = true;

    for (i = 0, len = str.length; i < len; i++) {
        code = str.charCodeAt(i);
        if (!(code > 47 && code < 58) && // 0-9
            !(code > 64 && code < 91) && // A-Z
            !(code > 96 && code < 123)) { // a-z
            isAlphanumeric = false
        }
    }

    return isAlphanumeric
}

exports.Totp = async function (secretKey) {
    return totp(secretKey, { digits: 6 });
}

exports.Sleep = async function (ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

exports.timedGoto = async function (page, url) {
 // TODO
}