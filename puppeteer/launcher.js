'use strict';

function getStockLaunch() {
    return options => require('puppeteer').launch(options);
}

async function getCloakLaunch() {
    try {
        const cloakbrowser = await import('cloakbrowser/puppeteer');
        return cloakbrowser.launch;
    } catch (error) {
        if (error?.code === 'ERR_MODULE_NOT_FOUND' || error?.code === 'MODULE_NOT_FOUND') {
            throw new Error(
                'Cloakbrowser is enabled but unavailable. Install it with: npm install cloakbrowser puppeteer-core'
            );
        }
        throw error;
    }
}

function addIfDefined(target, key, value) {
    if (value !== undefined) target[key] = value;
}

function getCloakLaunchOptions(options, cloakConfig = {}) {
    const launchOptions = {};
    addIfDefined(launchOptions, 'defaultViewport', options.defaultViewport);
    addIfDefined(launchOptions, 'ignoreHTTPSErrors', options.ignoreHTTPSErrors);
    if (options.userDataDir) launchOptions.userDataDir = options.userDataDir;

    const cloakOptions = {
        headless: options.headless,
        args: options.args,
        humanize: cloakConfig.humanize !== false,
        launchOptions
    };
    for (const key of [
        'extensionPaths',
        'geoip',
        'humanConfig',
        'humanPreset',
        'licenseKey',
        'locale',
        'proxy',
        'releaseChannel',
        'stealthArgs',
        'timezone',
        'browserVersion'
    ]) {
        addIfDefined(cloakOptions, key, cloakConfig[key]);
    }
    return cloakOptions;
}

async function createLauncherForConfig(config = {}, loaders = {}) {
    if (config.necro?.cloak?.enabled !== true) {
        return loaders.stockLaunch || getStockLaunch();
    }

    const loadCloakLaunch = loaders.cloakLaunch || getCloakLaunch;
    let cloakLaunch;
    try {
        cloakLaunch = await loadCloakLaunch();
    } catch (error) {
        if (error?.code === 'ERR_MODULE_NOT_FOUND' || error?.code === 'MODULE_NOT_FOUND') {
            throw new Error(
                'Cloakbrowser is enabled but unavailable. Install it with: npm install cloakbrowser puppeteer-core'
            );
        }
        throw error;
    }
    if (typeof cloakLaunch !== 'function') {
        throw new TypeError('Cloakbrowser Puppeteer adapter did not export launch()');
    }
    const cloakConfig = config.necro.cloak;
    return options => cloakLaunch(getCloakLaunchOptions(options, cloakConfig));
}

module.exports = {
    createLauncherForConfig,
    getCloakLaunchOptions,
    getCloakLaunch,
    getStockLaunch
};
