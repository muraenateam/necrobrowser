'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const db = require('../db/db');
const cluster = require('../puppeteer/cluster');
const necrohelp = require('../tasks/helpers/necrohelp');
const { Click, Fill, Press, Scroll } = require('../tasks/generic/necrotask');

jest.mock('../db/db', () => ({
    UpdateTaskStatus: jest.fn(async () => undefined),
    UpdateTaskStatusWithReason: jest.fn(async () => undefined),
    AddExtrudedData: jest.fn(async () => undefined)
}));
jest.mock('../puppeteer/cluster', () => ({
    GetConfig: jest.fn()
}));
jest.mock('../tasks/helpers/necrohelp', () => ({
    ConfigureUserAgent: jest.fn(async () => undefined),
    SetCookieJar: jest.fn(async () => undefined),
    requireHttpUrl: jest.fn(value => new URL(value)),
    timedGoto: jest.fn(async () => undefined),
    Sleep: jest.fn(async () => undefined)
}));

describe('generic browser primitives', () => {
    let extrusionPath;

    beforeEach(() => {
        extrusionPath = fs.mkdtempSync(path.join(os.tmpdir(), 'necrobrowser-generic-'));
        cluster.GetConfig.mockReturnValue({ paths: { extrusionPath } });
        jest.clearAllMocks();
    });

    afterEach(() => {
        fs.rmSync(extrusionPath, { recursive: true, force: true });
    });

    test('Click navigates, clicks CSS selector, and can capture screenshot', async () => {
        const page = {
            waitForSelector: jest.fn(async () => undefined),
            click: jest.fn(async () => undefined),
            screenshot: jest.fn(async ({ path: screenshotPath }) => fs.writeFileSync(screenshotPath, 'png'))
        };

        const result = await Click({
            page,
            data: ['task:generic:click', [], {
                url: 'http://127.0.0.1:4000/fixture',
                selector: '#submit',
                screenshot: true,
                outputPath: 'fixture'
            }]
        });

        expect(result).toMatchObject({ status: 'completed', selector: '#submit' });
        expect(necrohelp.timedGoto).toHaveBeenCalledWith(page, 'http://127.0.0.1:4000/fixture');
        expect(page.waitForSelector).toHaveBeenCalledWith('#submit', { visible: true, timeout: 30000 });
        expect(page.click).toHaveBeenCalledWith('#submit');
        expect(fs.existsSync(result.screenshotPath)).toBe(true);
        expect(db.UpdateTaskStatus).toHaveBeenCalledWith('task:generic:click', 'completed');
    });

    test('Fill validates editable target and types text without logging it', async () => {
        const page = {
            waitForSelector: jest.fn(async () => undefined),
            $eval: jest.fn(async () => ({ tagName: 'textarea', contentEditable: false })),
            click: jest.fn(async () => undefined),
            type: jest.fn(async () => undefined)
        };

        const result = await Fill({
            page,
            data: ['task:generic:fill', [], {
                url: 'http://127.0.0.1:4000/fixture',
                selector: 'textarea[name=message]',
                text: 'controlled fixture text'
            }]
        });

        expect(result).toMatchObject({ status: 'completed', selector: 'textarea[name=message]' });
        expect(page.click).toHaveBeenCalledWith('textarea[name=message]');
        expect(page.type).toHaveBeenCalledWith('textarea[name=message]', 'controlled fixture text');
        expect(db.UpdateTaskStatus).toHaveBeenCalledWith('task:generic:fill', 'completed');
    });

    test('Press focuses CSS selector and presses allowed key', async () => {
        const page = {
            url: jest.fn(() => 'http://127.0.0.1:4000/fixture'),
            waitForSelector: jest.fn(async () => undefined),
            click: jest.fn(async () => undefined),
            keyboard: { press: jest.fn(async () => undefined) }
        };

        const result = await Press({
            page,
            data: ['task:generic:press', [], {
                selector: 'textarea[name=message]',
                key: 'Enter'
            }]
        });

        expect(result).toMatchObject({ status: 'completed', key: 'Enter' });
        expect(page.keyboard.press).toHaveBeenCalledWith('Enter');
    });

    test('Press rejects unsupported keys', async () => {
        const page = { url: jest.fn(() => 'http://127.0.0.1:4000/fixture'), keyboard: { press: jest.fn() } };
        await expect(Press({ page, data: ['task:generic:bad-key', [], { key: 'Control+Alt+Delete' }] }))
            .rejects.toThrow('params.key must be one of');
    });

    test('Scroll stops when position does not move', async () => {
        const page = {
            evaluate: jest.fn()
                .mockResolvedValueOnce(0)
                .mockResolvedValueOnce(undefined)
                .mockResolvedValueOnce(0)
                .mockResolvedValueOnce(0)
        };
        const result = await Scroll({
            page,
            data: ['task:generic:scroll', [], { url: 'http://127.0.0.1:4000/feed', scrollPixels: 500, scrollCount: 10, delayBetweenScrollsMs: 0 }]
        });
        expect(result).toMatchObject({ status: 'completed', scrollsCompleted: 0, reachedEndOfPage: true, stoppedReason: 'end-of-page' });
        expect(page.evaluate).toHaveBeenCalledWith(expect.any(Function), 500);
    });

    test('Scroll rejects unbounded iteration parameters', async () => {
        const page = { evaluate: jest.fn() };
        await expect(Scroll({
            page,
            data: ['task:generic:bad-scroll', [], { url: 'http://127.0.0.1:4000/feed', scrollPixels: 1, scrollCount: 101 }]
        })).rejects.toThrow('scrollCount must be an integer between 1 and 100');
    });

    test('Fill rejects non-editable selectors', async () => {
        const page = {
            waitForSelector: jest.fn(async () => undefined),
            $eval: jest.fn(async () => ({ tagName: 'button', contentEditable: false }))
        };

        await expect(Fill({
            page,
            data: ['task:generic:bad-fill', [], {
                url: 'http://127.0.0.1:4000/fixture',
                selector: '#submit',
                text: 'not allowed'
            }]
        })).rejects.toThrow('input, textarea, or contenteditable');
        expect(db.UpdateTaskStatusWithReason).toHaveBeenCalledWith(
            'task:generic:bad-fill',
            'error',
            expect.stringContaining('input, textarea')
        );
        expect(page.type).toBeUndefined();
    });
});
