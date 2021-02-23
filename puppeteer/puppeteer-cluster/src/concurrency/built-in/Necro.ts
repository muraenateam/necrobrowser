
import * as puppeteer from 'puppeteer';

import { debugGenerator, timeoutExecute } from '../../util';
import ConcurrencyImplementation, { WorkerInstance } from '../ConcurrencyImplementation';
import { LaunchOptions } from 'puppeteer';
const debug = debugGenerator('BrowserConcurrency');

import * as fs from 'fs';
import * as path from 'path';
import * as util from 'util';

const BROWSER_TIMEOUT = 5000;

export default class Necro extends ConcurrencyImplementation {
    public async init() {}
    public async close() {}

    public async workerInstance(perBrowserOptions: puppeteer.LaunchOptions | undefined):
        Promise<WorkerInstance> {

        const options = perBrowserOptions || this.options;

        // TODO improve this
        var rr = Math.random().toString(36).substring(7);
        var userDataDir = `${path.join(__dirname, '..', '..','..', '..', '..', 'profiles', rr)}`
        debug('Necro concurrency: adding to options --user-data-dir=' + userDataDir);
        options['userDataDir'] = (userDataDir)
        debug(util.inspect(options))

        if (!fs.existsSync(userDataDir)) {
            fs.mkdirSync(userDataDir);
            debug('created new userDataDir directory')
        }

        let chrome = await this.puppeteer.launch(options) as puppeteer.Browser;
        let page: puppeteer.Page;
        let context: any; // puppeteer typings are old...

        return {
            jobInstance: async () => {
                await timeoutExecute(BROWSER_TIMEOUT, (async () => {
                    context = await chrome.createIncognitoBrowserContext();
                    page = await context.newPage();
                })());

                return {
                    resources: {
                        page,
                    },

                    close: async () => {
                        await timeoutExecute(BROWSER_TIMEOUT, context.close());
                    },
                };
            },

            close: async () => {
                await chrome.close();
            },

            repair: async () => {
                debug('Starting repair');
                try {
                    // will probably fail, but just in case the repair was not necessary
                    await chrome.close();
                } catch (e) {}

                // just relaunch as there is only one page per browser
                chrome = await this.puppeteer.launch(this.options);
            },
        };
    }

}
