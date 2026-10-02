'use strict';

const fs = require('fs');
const path = require('path');
const loader = require('../tasks/loader');
const necrohelp = require('../tasks/helpers/necrohelp');

const root = path.resolve(__dirname, '..');
const activeTasks = path.join(root, 'tasks');

const expectedTasks = {
    atlassian: ['GetProfileInfo', 'GetAccountSettingsScreenshots', 'AddAuthenticatorApp'],
    github: ['PlantAndDump'],
    gsuite: ['ScreenshotApps'],
    office365: ['AddAuthenticatorApp', 'ScreenshotApps', 'SharepointExtrude', 'OneDriveExtrude', 'OutlookWriteEmail', 'OutlookExtrude'],
    okta: ['LoginAndEnumerate'],
    generic: ['Screenshot', 'Click', 'Fill', 'Scroll', 'Press'],
    keepalive: ['KeepAlive']
};

describe('task layout migration', () => {
    test('loads active task names without archive modules', () => {
        const tasks = loader.LoadTasks({ tasksRoot: activeTasks, logger: { log() {} } });
        for (const [type, names] of Object.entries(expectedTasks)) {
            expect(tasks[type]).toEqual(names);
            expect(Object.keys(tasks[`${type}__Tasks`])).toEqual(names);
        }
        expect(tasks.custom).toBeUndefined();
        expect(tasks.legacy).toBeUndefined();
    });


    test('active task modules do not own browser resources or use legacy paths', () => {
        const forbidden = [
            'createIncognitoBrowserContext',
            'createBrowserContext',
            'context.newPage',
            'page.close(',
            'browser.close(',
            'page._client',
            '/home/natalinux',
            'params.cookies',
            '.catch(console.error)'
        ];
        for (const type of Object.keys(expectedTasks)) {
            const source = fs.readFileSync(path.join(activeTasks, type, 'necrotask.js'), 'utf8');
            for (const pattern of forbidden) expect(source).not.toContain(pattern);
        }
    });

    test('supports bounded screenshot delay parameter', () => {
        const source = fs.readFileSync(path.join(activeTasks, 'generic', 'necrotask.js'), 'utf8');
        expect(source).toContain('waitBeforeScreenshotMs');
        expect(source).toContain('MAX_WAIT_MS = 300000');
    });

    test('output paths stay inside configured extrusion directory', () => {
        const extrusionPath = fs.mkdtempSync(path.join(require('os').tmpdir(), 'necrobrowser-migration-'));
        try {
            const config = { paths: { extrusionPath } };
            expect(necrohelp.getOutputPath(config, 'nested', 'result.png')).toBe(
                path.join(extrusionPath, 'nested', 'result.png')
            );
            const safePath = necrohelp.getOutputPath(config, '../outside.txt');
            expect(safePath.startsWith(`${extrusionPath}${path.sep}`)).toBe(true);
            expect(safePath).not.toBe(path.join(extrusionPath, '..', 'outside.txt'));
        } finally {
            fs.rmSync(extrusionPath, { recursive: true, force: true });
        }
    });
});
