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

        await necrohelp.ConfigureUserAgent(page, params.userAgent, taskId);

        // Set cookies once before navigating, grouped by domain.
        // Cookies from Muraena come with their original domains (e.g. .office365.com,
        // .login.microsoftonline.com) and must be set per-domain, not overridden to a single host.
        if (cookies && cookies.length > 0) {
            // Group cookies by domain to set them with proper URL context
            const cookiesByDomain = {};
            for (const c of cookies) {
                const domain = c.domain || '';
                if (!cookiesByDomain[domain]) cookiesByDomain[domain] = [];
                cookiesByDomain[domain].push(c);
            }

            for (const [domain, domainCookies] of Object.entries(cookiesByDomain)) {
                // Build a URL context from the cookie domain for proper secure cookie setting
                const cleanDomain = domain.startsWith('.') ? domain.substring(1) : domain;
                const urlContext = cleanDomain ? `https://${cleanDomain}/` : null;
                await necrohelp.SetCookies(page, domainCookies, {
                    url: urlContext
                });
                console.log(`[${taskId}] set ${domainCookies.length} cookies for domain: ${domain}`);
            }
        }

        // screenshot urls of interest
        for(let url of params.urls){
            try {
                let pName = url.split("/").reverse()[0]
                if (pName === ""){
                    pName = "index"
                }

                await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
                console.log(`[${taskId}] taking screenshot of page --> ${pName}`)
                await necrohelp.Sleep(5000);

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

