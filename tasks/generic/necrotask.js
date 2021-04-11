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

    // parallelize page screenshot in multiple tabs of the same incognito context
    do{
        for(let i = 0; i < parallelTabs; i++){
            let url = urls.pop();
            if(typeof(url) === "undefined")
                break;

            promises.push(context.newPage().then(async page => {
                await necrohelp.ScreenshotFullPage(page, taskId, url);
            }))
        }
        await Promise.all(promises).catch(e => console.log(e));

    }while(index < urls.length)

    await db.UpdateTaskStatus(taskId, "completed")
}

