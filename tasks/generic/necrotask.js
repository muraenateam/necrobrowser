const necrohelp = require('../../tasks/helpers/necrohelp')
const db = require('../../db/db')
const clusterLib = require('../../puppeteer/cluster')

exports.ScreenshotPages = async ({ page, data: [taskId, cookies, params] }) => {
    try {
        await db.UpdateTaskStatus(taskId, "running")

        let urls = params.urls
        console.log(`[${taskId}] processing ${urls.length} urls:`)
        console.log(urls)

        const config = clusterLib.GetConfig();

        // Use custom outputPath if provided, otherwise use default extrusionPath
        const extrusionPath = params.outputPath || config.paths.extrusionPath;
        console.log(`[${taskId}] saving screenshots to: ${extrusionPath}`)

        // Extract short ID from taskId (task:generic:xyz -> xyz)
        const shortId = taskId.split(':')[2];

        // Set cookies if provided
        if (cookies && cookies.length > 0) {
            await page.setCookie(...cookies);
        }

        // screenshot urls of interest
        for(let url of params.urls){
            try {
                let pName = url.split("/").reverse()[0]
                if (pName === ""){
                    pName = "index"
                }

                await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 2000 });
                console.log(`[${taskId}] taking screenshot of page --> ${pName}`)
                await new Promise(resolve => setTimeout(resolve, 300));

                // Use absolute path and clean filename
                const screenshotPath = `${extrusionPath}/screenshot_${pName}_${shortId}.png`;
                await page.screenshot({path: screenshotPath});

                // Store screenshot data in Redis
                await db.AddExtrudedData(taskId, url, screenshotPath);
            } catch (urlErr) {
                console.error(`[${taskId}] Error processing URL ${url}:`, urlErr.message);
                // Continue with next URL even if this one fails
            }
        }

        await db.UpdateTaskStatus(taskId, "completed")
    } catch (err) {
        console.error(`[${taskId}] Error in ScreenshotPages:`, err);
        await db.UpdateTaskStatusWithReason(taskId, "error", err.message);
    }
}

