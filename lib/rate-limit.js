'use strict';

function createRateLimiter({ limit = 60, windowMs = 60_000, clock = () => Date.now(), maxEntries = 10_000 } = {}) {
    if (!Number.isInteger(limit) || limit < 1) throw new TypeError('rate limit must be a positive integer');
    if (!Number.isFinite(windowMs) || windowMs <= 0) throw new TypeError('rate window must be positive');
    const entries = new Map();

    function consume(key = 'anonymous', cost = 1) {
        const now = clock();
        const normalizedKey = String(key);
        const current = entries.get(normalizedKey);
        if (!current || now >= current.resetAt) {
            if (entries.size >= maxEntries && !entries.has(normalizedKey)) {
                const oldest = entries.keys().next().value;
                if (oldest !== undefined) entries.delete(oldest);
            }
            entries.set(normalizedKey, { count: 0, resetAt: now + windowMs });
        }
        const bucket = entries.get(normalizedKey);
        const requested = Math.max(1, Number(cost) || 1);
        if (bucket.count + requested > limit) {
            return {
                allowed: false,
                remaining: Math.max(0, limit - bucket.count),
                retryAfter: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
                resetAt: bucket.resetAt
            };
        }
        bucket.count += requested;
        return {
            allowed: true,
            remaining: Math.max(0, limit - bucket.count),
            retryAfter: 0,
            resetAt: bucket.resetAt
        };
    }

    function reset(key) {
        if (key === undefined) entries.clear();
        else entries.delete(String(key));
    }

    return Object.freeze({ consume, reset, size: () => entries.size });
}

function rateLimitMiddleware(limiter, { key = request => request.ip || request.socket?.remoteAddress || 'anonymous', skip = () => false } = {}) {
    if (!limiter) return (req, res, next) => next();
    return (req, res, next) => {
        if (skip(req)) return next();
        const result = limiter.consume(key(req));
        res.setHeader('X-RateLimit-Remaining', String(result.remaining));
        if (!result.allowed) {
            res.setHeader('Retry-After', String(result.retryAfter));
            return res.status(429).json({ error: 'Rate limit exceeded', retryAfter: result.retryAfter });
        }
        next();
    };
}

module.exports = { createRateLimiter, rateLimitMiddleware };
