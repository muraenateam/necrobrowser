const necrohelp = require('../../tasks/helpers/necrohelp')
const db = require('../../db/db')
const clusterLib = require('../../puppeteer/cluster')

exports.ScreenshotPages = async ({ page, data: [taskId, cookies, params] }) => {

    await db.UpdateTaskStatus(taskId, "running")

    let urls = params.urls

    for(let url of urls){
        //console.log(`[${taskId}] taking screenshot of ${url}`)
        await page.goto(url);
        await necrohelp.ScreenshotCurrentPage(page, taskId)
    }

    await db.UpdateTaskStatus(taskId, "completed")
}

