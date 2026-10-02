'use strict';

class NavigationPolicyError extends Error {
    constructor(message, code = 'NAVIGATION_POLICY_DENIED') {
        super(message);
        this.name = 'NavigationPolicyError';
        this.code = code;
        this.statusCode = 400;
        this.publicMessage = 'Navigation target rejected by policy';
    }
}

function normalizeHostname(hostname) {
    return String(hostname || '').replace(/^\[|\]$/g, '').toLowerCase().replace(/\.$/, '');
}

function ipv4Parts(hostname) {
    if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname)) return null;
    const parts = hostname.split('.').map(Number);
    return parts.every(part => part >= 0 && part <= 255) ? parts : null;
}

function isPrivateHostname(hostname) {
    const host = normalizeHostname(hostname);
    if (!host || host === 'localhost' || host.endsWith('.localhost') ||
        host === 'metadata.google.internal' || host === 'metadata') return true;

    const ipv4 = ipv4Parts(host);
    if (ipv4) {
        const [a, b] = ipv4;
        return a === 0 || a === 10 || a === 127 ||
            (a === 169 && b === 254) ||
            (a === 172 && b >= 16 && b <= 31) ||
            (a === 192 && b === 168) ||
            (a === 100 && b >= 64 && b <= 127) ||
            (a === 198 && (b === 18 || b === 19)) ||
            a >= 224;
    }

    if (host.includes(':')) {
        if (host === '::1' || host === '::' || host.startsWith('fe8') ||
            host.startsWith('fe9') || host.startsWith('fea') || host.startsWith('feb') ||
            host.startsWith('fc') || host.startsWith('fd')) return true;
        if (host.startsWith('::ffff:')) return isPrivateHostname(host.slice(7));
    }
    return false;
}

function createNavigationPolicy({
    allowPrivateNetworks = true,
    allowHttp = true
} = {}) {
    function parse(value, base) {
        let parsed;
        try { parsed = new URL(value, base); } catch (_) {
            throw new NavigationPolicyError('Malformed navigation URL', 'INVALID_URL');
        }
        if (!['http:', 'https:'].includes(parsed.protocol)) {
            throw new NavigationPolicyError('Only HTTP(S) navigation is allowed', 'INVALID_SCHEME');
        }
        if (parsed.username || parsed.password) {
            throw new NavigationPolicyError('Navigation credentials are not allowed', 'URL_CREDENTIALS');
        }
        const hostname = normalizeHostname(parsed.hostname);
        if (!hostname) throw new NavigationPolicyError('Navigation hostname is required', 'INVALID_HOST');
        if (!allowHttp && parsed.protocol === 'http:' && !allowPrivateNetworks) {
            throw new NavigationPolicyError('HTTP navigation is disabled', 'HTTP_DISABLED');
        }
        if (!allowPrivateNetworks && isPrivateHostname(hostname)) {
            throw new NavigationPolicyError('Private-network navigation is disabled', 'PRIVATE_NETWORK');
        }
        return parsed;
    }

    return Object.freeze({
        isAllowedUrl(value, base) {
            try { parse(value, base); return true; } catch (_) { return false; }
        },
        assertAllowedUrl(value, base) {
            return parse(value, base).toString();
        },
        validateRedirect(from, to) {
            const fromUrl = parse(from);
            return parse(to, fromUrl.toString());
        },
        isAllowedCookieDomain(domain) {
            const host = normalizeHostname(String(domain || '').replace(/^\./, ''));
            return Boolean(host) && !isPrivateHostname(host);
        },
        summarize() {
            return { allowPrivateNetworks, allowHttp };
        }
    });
}

module.exports = {
    NavigationPolicyError,
    createNavigationPolicy,
    isPrivateHostname,
    normalizeHostname
};
