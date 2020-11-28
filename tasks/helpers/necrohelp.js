const db = require('../../db/db')
const clusterLib = require('../../puppeteer/cluster')

exports.ScreenshotFullPage = async function(page, taskId, url) {
    console.log(`[${taskId}] taking screenshot of ${url}`)
    await page.goto(url);
    let screenshotPath = `${clusterLib.GetConfig().platform.extrusionPath}/screenshot_${taskId}_${Date.now()}.png`
    await page.screenshot({ fullPage: true, path: screenshotPath });
    let extrudedHashKey = `screenshot_${url}`
    await db.AddExtrudedData(taskId, extrudedHashKey, screenshotPath)
}

exports.ScreenshotCurrentPage = async function(page, taskId) {
    console.log(`[${taskId}] taking screenshot of ${await page.url()}`)
    let screenshotPath = `${clusterLib.GetConfig().platform.extrusionPath}/screenshot_${taskId}_${Date.now()}.png`
    await page.screenshot({ fullPage: true, path: screenshotPath });
    let extrudedHashKey = `screenshot_${await page.url()}`
    await db.AddExtrudedData(taskId, extrudedHashKey, screenshotPath)
}

exports.SetPageScaleFactor = async function(page, scaleFactor) {
    console.log(`setting page scaleFactor to ${scaleFactor}`)
    await page._client.send('Emulation.setPageScaleFactor', {pageScaleFactor: scaleFactor}).catch(console.error)
}

exports.IsAlphanumeric = async function(str) {
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
