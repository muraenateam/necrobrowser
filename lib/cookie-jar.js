'use strict';

const DEFAULTS = Object.freeze({
    maxCookies: 500,
    maxCookieBytes: 8192,
    maxTotalBytes: 1024 * 1024,
    rejectExpired: false
});

function issue(path, message, code = 'INVALID_COOKIE_JAR') {
    return { path, message, code };
}

function parseCookieJarJson(input) {
    if (typeof input !== 'string') return { value: input, errors: [] };
    try { return { value: JSON.parse(input), errors: [] }; }
    catch (_) { return { value: null, errors: [issue('$', 'Cookie jar must contain valid JSON', 'INVALID_JSON')] }; }
}

function validateCookieJar(input, { policy, ...options } = {}) {
    const limits = { ...DEFAULTS, ...options };
    const parsed = parseCookieJarJson(input);
    const errors = [...parsed.errors];
    const warnings = [];
    const value = parsed.value;
    if (!Array.isArray(value)) {
        errors.push(issue('$', 'Cookie jar must be an array'));
        return { valid: false, errors, warnings, summary: { count: 0, domains: [], names: [], bytes: 0 } };
    }

    const domains = new Set();
    const names = new Set();
    const seen = new Map();
    let totalBytes = 0;
    if (value.length > limits.maxCookies) errors.push(issue('$', `Cookie count exceeds ${limits.maxCookies}`, 'COOKIE_COUNT_LIMIT'));

    value.forEach((cookie, index) => {
        const prefix = `cookies[${index}]`;
        if (!cookie || typeof cookie !== 'object' || Array.isArray(cookie)) {
            errors.push(issue(prefix, 'Cookie must be an object'));
            return;
        }
        const name = cookie.name;
        const rawValue = cookie.value;
        if (typeof name !== 'string' || !name || name.length > 1024) errors.push(issue(`${prefix}.name`, 'Cookie name must be a non-empty string under 1024 bytes'));
        if (typeof rawValue !== 'string' || Buffer.byteLength(rawValue) > limits.maxCookieBytes) errors.push(issue(`${prefix}.value`, `Cookie value must be a string under ${limits.maxCookieBytes} bytes`));
        const domain = typeof cookie.domain === 'string' ? cookie.domain.toLowerCase().replace(/^\./, '').replace(/\.$/, '') : '';
        const url = cookie.url;
        if (!domain && typeof url !== 'string') errors.push(issue(`${prefix}.domain`, 'Cookie needs domain or URL'));
        let cookieUrl;
        if (url !== undefined) {
            try { cookieUrl = new URL(url); } catch (_) { errors.push(issue(`${prefix}.url`, 'Cookie URL is invalid')); }
            if (cookieUrl && !['http:', 'https:'].includes(cookieUrl.protocol)) errors.push(issue(`${prefix}.url`, 'Cookie URL must use HTTP(S)'));
            if (cookieUrl && policy && !policy.isAllowedUrl(cookieUrl.toString())) errors.push(issue(`${prefix}.url`, 'Cookie URL is outside policy', 'COOKIE_URL_NOT_ALLOWED'));
        }
        if (domain && !/^[a-z0-9.-]+$/i.test(domain)) errors.push(issue(`${prefix}.domain`, 'Cookie domain is invalid'));
        if (domain && policy && !policy.isAllowedCookieDomain(domain)) errors.push(issue(`${prefix}.domain`, 'Cookie domain is outside policy', 'COOKIE_DOMAIN_NOT_ALLOWED'));
        const cookiePath = cookie.path === undefined ? '/' : cookie.path;
        if (typeof cookiePath !== 'string' || !cookiePath.startsWith('/')) errors.push(issue(`${prefix}.path`, 'Cookie path must start with /'));
        if (cookie.sameSite !== undefined && !['strict', 'lax', 'none', 'unspecified'].includes(String(cookie.sameSite).toLowerCase())) errors.push(issue(`${prefix}.sameSite`, 'Cookie SameSite value is invalid'));
        const sameSite = String(cookie.sameSite || '').toLowerCase();
        if (sameSite === 'none' && cookie.secure !== true) errors.push(issue(`${prefix}.secure`, 'SameSite=None cookies must be Secure'));
        const expiration = cookie.expires ?? cookie.expirationDate;
        if (expiration !== undefined && (!Number.isFinite(Number(expiration)) || Number(expiration) < 0)) errors.push(issue(`${prefix}.expirationDate`, 'Cookie expiry must be a positive epoch value'));
        if (limits.rejectExpired && expiration !== undefined && Number(expiration) * 1000 <= Date.now()) warnings.push(issue(`${prefix}.expirationDate`, 'Cookie is expired', 'EXPIRED_COOKIE'));

        const key = `${name}|${domain}|${cookiePath}`;
        if (seen.has(key) && seen.get(key) !== rawValue) errors.push(issue(prefix, 'Conflicting duplicate cookie', 'DUPLICATE_COOKIE'));
        seen.set(key, rawValue);
        if (domain) domains.add(domain);
        if (typeof name === 'string' && name) names.add(name);
        totalBytes += Buffer.byteLength(JSON.stringify(cookie));
    });
    if (totalBytes > limits.maxTotalBytes) errors.push(issue('$', `Cookie jar exceeds ${limits.maxTotalBytes} bytes`, 'COOKIE_SIZE_LIMIT'));
    return {
        valid: errors.length === 0,
        errors,
        warnings,
        summary: { count: value.length, domains: [...domains].sort(), names: [...names].sort(), bytes: totalBytes }
    };
}

function summarizeCookieJar(input, options = {}) {
    const result = validateCookieJar(input, options);
    return { valid: result.valid, errors: result.errors, warnings: result.warnings, summary: result.summary };
}

module.exports = { parseCookieJarJson, validateCookieJar, summarizeCookieJar };
