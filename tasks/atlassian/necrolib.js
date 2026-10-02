'use strict';

const DOMAINS = [
    'id.atlassian.com',
    'admin.atlassian.com',
    'support.atlassian.com',
    'my.atlassian.com',
    'community.atlassian.com',
    'confluence.atlassian.com'
];

function PropagateCookies(cookies = []) {
    const source = cookies.find(cookie => cookie.name === 'cloud.session.token');
    if (!source) return false;

    for (const domain of DOMAINS) {
        if (!cookies.some(cookie => cookie.name === source.name && cookie.domain === domain)) {
            cookies.push({ ...source, domain });
        }
    }
    return true;
}

module.exports = { PropagateCookies };
