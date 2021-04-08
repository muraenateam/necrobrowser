const necrohelp = require('../../tasks/helpers/necrohelp')
const db = require('../../db/db')
const clusterLib = require('../../puppeteer/cluster')

exports.ScreenshotPages = async ({ page, data: [taskId, cookies, params] }) => {
    await db.UpdateTaskStatus(taskId, "running")

    let urls = params.urls
    for(let url of urls){
        await necrohelp.ScreenshotFullPage(page, taskId, url)
    }

    await db.UpdateTaskStatus(taskId, "completed")
}

