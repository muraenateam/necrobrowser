const necrohelp = require('../../tasks/helpers/necrohelp')
const db = require('../../db/db')
const clusterLib = require('../../puppeteer/cluster')

exports.ScreenshotPages = async ({ browser, page, data: [taskId, cookies, params] }) => {
    await db.UpdateTaskStatus(taskId, "running")

    let urls = params.urls
    let index = 0;
    let parallelTabs = 5;
    let promises = []
    console.log(`[${taskId}] processing ${urls.length} urls:`)
    console.log(urls)

    const context = await browser.createIncognitoBrowserContext();

    // screenshot urls of interest
    for(let url of params.urls){
        let pName = url.split("/").reverse()[0]
        if (pName === ""){
            pName = "index"
        }

        await page.goto(url);
        console.log(`[${taskId}] taking screenshot of page --> ${pName}`)
        await page.waitForTimeout(1500)
        await page.screenshot({path: `extrusion/screenshot_${pName}_${taskId}.png`});
    }

    await db.UpdateTaskStatus(taskId, "completed")
}

