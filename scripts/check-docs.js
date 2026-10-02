'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const docsRoot = path.join(root, 'docs');
const testingRoot = path.join(root, 'testing');
const errors = [];

function walk(directory, predicate) {
    if (!fs.existsSync(directory)) return [];
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
        const file = path.join(directory, entry.name);
        if (entry.isDirectory()) return walk(file, predicate);
        return predicate(file) ? [file] : [];
    });
}

function checkMarkdown(file) {
    const text = fs.readFileSync(file, 'utf8');
    if (file.startsWith(docsRoot) && !file.endsWith(`${path.sep}README.md`) && !text.startsWith('---\n')) {
        errors.push(`${path.relative(root, file)}: missing Jekyll front matter`);
    }
    const relativeTargets = [...text.matchAll(/\]\((?!https?:\/\/|\/|mailto:)([^)#]+)(?:#[^)]+)?\)/g)].map(match => match[1]);
    for (const target of relativeTargets) {
        if (!fs.existsSync(path.resolve(path.dirname(file), target))) {
            errors.push(`${path.relative(root, file)}: missing link target ${target}`);
        }
    }
}

function checkPayload(file) {
    let payload;
    try {
        payload = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (error) {
        errors.push(`${path.relative(root, file)}: invalid JSON (${error.message})`);
        return;
    }
    const text = JSON.stringify(payload);
    const forbidden = [
        /BEGIN (RSA|OPENSSH|ED25519) PRIVATE KEY/i,
        /(?:ESTSAUTH|ESTSAUTHPERSISTENT|OpenIdConnect\.token|X-OWA-CANARY|_gh_sess)/i,
        /(?:penitenziagite|ogre\.onmicrosoft|poordev009|frederik@)/i,
        /(?:password|passwd|secret|token|authorization)\s*[:=]\s*['"](?!REPLACE|PLACEHOLDER)/i
    ];
    for (const pattern of forbidden) {
        if (pattern.test(text)) errors.push(`${path.relative(root, file)}: sensitive payload pattern ${pattern}`);
    }
    if (Array.isArray(payload.cookies) && payload.cookies.length > 0) {
        errors.push(`${path.relative(root, file)}: cookies must be empty in checked-in templates`);
    }
}

const docsPages = walk(docsRoot, file => file.endsWith('.md') && !file.endsWith(`${path.sep}README.md`));
const metadata = [];
for (const file of docsPages) {
    checkMarkdown(file);
    const text = fs.readFileSync(file, 'utf8');
    const frontMatter = text.match(/^---\n([\s\S]*?)\n---/);
    const attributes = {};
    for (const line of frontMatter?.[1]?.split('\n') || []) {
        const match = line.match(/^([\w-]+):\s*["']?([^"']+?)["']?\s*$/);
        if (match) attributes[match[1]] = match[2];
    }
    metadata.push({ file, attributes });
}
const byTitle = new Map(metadata.map(item => [item.attributes.title, item]));
const roots = metadata.filter(item => !item.attributes.parent);
const rootOrders = new Set();
for (const item of roots) {
    const order = Number(item.attributes.nav_order);
    if (!Number.isInteger(order) || rootOrders.has(order)) errors.push(`${path.relative(root, item.file)}: root nav_order must be unique integer`);
    rootOrders.add(order);
}
for (const item of metadata.filter(item => item.attributes.parent)) {
    const parent = byTitle.get(item.attributes.parent);
    if (!parent) errors.push(`${path.relative(root, item.file)}: missing parent ${item.attributes.parent}`);
}
for (const parent of metadata.filter(item => metadata.some(child => child.attributes.parent === item.attributes.title))) {
    if (parent.attributes.has_children !== 'true') errors.push(`${path.relative(root, parent.file)}: has_children must be true`);
    const orders = new Set();
    for (const child of metadata.filter(item => item.attributes.parent === parent.attributes.title)) {
        const order = Number(child.attributes.nav_order);
        if (!Number.isInteger(order) || orders.has(order)) errors.push(`${path.relative(root, child.file)}: child nav_order must be unique integer`);
        orders.add(order);
    }
}
for (const file of walk(testingRoot, file => file.endsWith('.json'))) checkPayload(file);

if (errors.length) {
    console.error(errors.join('\n'));
    process.exitCode = 1;
} else {
    console.log('Documentation and testing fixtures pass safety checks.');
}
