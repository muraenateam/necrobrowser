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
    let screenshotData = await page.screenshot({ fullPage: true, encoding: "base64" });
    await db.AddExtrudedData(taskId, url, screenshotData)
}
exports.ScreenshotCurrentPageToFS = async function (page, taskId) {
    let url = await page.url()
    console.log(`[${taskId}] taking screenshot of ${url}`)
    let filename = url.split("/").pop() //take the last element in the url path

    await page.screenshot({ fullPage: true, path: `${path}/${filename}-${Date.now()}.jpg` }).catch(console.error);
  
    let screenshotData = await page.screenshot({ fullPage: true, encoding: "base64" });
    await db.AddExtrudedData(taskId, url, screenshotData)
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
    await page._client.send('Emulation.setPageScaleFactor', { pageScaleFactor: scaleFactor }).catch(console.error)
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

exports.timedGoto = async function (page, url) {
 // TODO
}