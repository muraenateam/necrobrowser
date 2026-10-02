'use strict';

const {
    createLauncherForConfig,
    getCloakLaunchOptions
} = require('../puppeteer/launcher');

describe('browser launcher selection', () => {
    test('uses stock Puppeteer when Cloakbrowser is disabled', async () => {
        const stockLaunch = jest.fn();
        const cloakLoader = jest.fn();
        const launcher = await createLauncherForConfig(
            { necro: { cloak: { enabled: false } } },
            { stockLaunch, cloakLaunch: cloakLoader }
        );

        expect(launcher).toBe(stockLaunch);
        expect(cloakLoader).not.toHaveBeenCalled();
    });

    test('wraps pool options for Cloakbrowser', async () => {
        const cloakLaunch = jest.fn(async () => ({ close: jest.fn() }));
        const launcher = await createLauncherForConfig(
            { necro: { cloak: { enabled: true, humanize: true, humanPreset: 'careful' } } },
            { cloakLaunch: async () => cloakLaunch }
        );

        await launcher({
            headless: false,
            defaultViewport: null,
            args: ['--no-sandbox'],
            ignoreHTTPSErrors: true,
            userDataDir: '/tmp/profile'
        });

        expect(cloakLaunch).toHaveBeenCalledWith({
            headless: false,
            args: ['--no-sandbox'],
            humanize: true,
            humanPreset: 'careful',
            launchOptions: {
                defaultViewport: null,
                ignoreHTTPSErrors: true,
                userDataDir: '/tmp/profile'
            }
        });
    });

    test('defaults Cloakbrowser humanization on', () => {
        expect(getCloakLaunchOptions({ headless: true, args: [] }, {})).toMatchObject({
            headless: true,
            args: [],
            humanize: true
        });
    });

    test('rejects a missing Cloakbrowser launch export', async () => {
        await expect(createLauncherForConfig(
            { necro: { cloak: { enabled: true } } },
            { cloakLaunch: async () => undefined }
        )).rejects.toThrow('did not export launch()');
    });

    test('reports missing Cloakbrowser package', async () => {
        await expect(createLauncherForConfig(
            { necro: { cloak: { enabled: true } } },
            { cloakLaunch: async () => {
                const error = new Error('missing module');
                error.code = 'ERR_MODULE_NOT_FOUND';
                throw error;
            } }
        )).rejects.toThrow('npm install cloakbrowser puppeteer-core');
    });
});
