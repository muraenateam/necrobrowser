const { createNavigationPolicy } = require('../lib/navigation-policy');
const { validateCookieJar } = require('../lib/cookie-jar');
const { createRateLimiter } = require('../lib/rate-limit');
const { redact } = require('../lib/audit');

describe('navigation policy', () => {
    test('allows any public HTTPS origin without an origin allowlist', () => {
        const policy = createNavigationPolicy();
        expect(policy.isAllowedUrl('https://phishing.click/health')).toBe(true);
        expect(policy.isAllowedUrl('https://other.example/')).toBe(true);
    });

    test('rejects unsafe navigation targets when hardened explicitly', () => {
        const policy = createNavigationPolicy({ allowPrivateNetworks: false, allowHttp: false });
        expect(policy.isAllowedUrl('javascript:alert(1)')).toBe(false);
        expect(policy.isAllowedUrl('https://user:pass@example.com/')).toBe(false);
        expect(policy.isAllowedUrl('http://127.0.0.1:3000/')).toBe(false);
        expect(policy.isAllowedUrl('http://public.example/')).toBe(false);
    });

    test('local default policy allows HTTP and private targets', () => {
        const policy = createNavigationPolicy();
        expect(policy.isAllowedUrl('http://127.0.0.1:3000/')).toBe(true);
        expect(policy.isAllowedUrl('http://public.example/')).toBe(true);
        expect(policy.isAllowedUrl('javascript:alert(1)')).toBe(false);
    });

    test('allows HTTP and private hosts only when explicitly enabled', () => {
        const policy = createNavigationPolicy({ allowPrivateNetworks: true, allowHttp: true });
        expect(policy.isAllowedUrl('http://127.0.0.1:3000/')).toBe(true);
        expect(policy.isAllowedUrl('http://public.example/')).toBe(true);
        expect(policy.isAllowedCookieDomain('127.0.0.1')).toBe(false);
    });
});

describe('cookie jar dry-run validation', () => {
    test('summarizes whole jar without returning values', () => {
        const policy = createNavigationPolicy();
        const result = validateCookieJar([
            { name: 'theme', value: 'dark', domain: '.phishing.click', path: '/', secure: true, sameSite: 'lax' }
        ], { policy });
        expect(result.valid).toBe(true);
        expect(result.summary).toEqual({ count: 1, domains: ['phishing.click'], names: ['theme'], bytes: expect.any(Number) });
        expect(JSON.stringify(result)).not.toContain('dark');
    });

    test('reports invalid trailing cookie', () => {
        const result = validateCookieJar([
            { name: 'ok', value: '1', domain: 'phishing.click' },
            { name: '', value: 3, domain: 'phishing.click' }
        ]);
        expect(result.valid).toBe(false);
        expect(result.errors.some(error => error.path === 'cookies[1].name')).toBe(true);
    });
});

describe('rate limiter', () => {
    test('limits and resets with injected clock', () => {
        let now = 0;
        const limiter = createRateLimiter({ limit: 2, windowMs: 1000, clock: () => now });
        expect(limiter.consume('client').allowed).toBe(true);
        expect(limiter.consume('client').allowed).toBe(true);
        expect(limiter.consume('client').allowed).toBe(false);
        now = 1001;
        expect(limiter.consume('client').allowed).toBe(true);
    });
});

test('audit redaction removes sensitive fields', () => {
    const safe = redact({ cookie: [{ name: 'session', value: 'secret' }], outcome: 'ok' });
    expect(safe.cookie).toBe('[REDACTED]');
    expect(safe.outcome).toBe('ok');
    expect(JSON.stringify(safe)).not.toContain('secret');
});
