'use strict';

const SENSITIVE_KEY = /cookie|token|secret|password|authorization|credential|otp|totp|ssh|private|useragent|user-agent|params|body|value/i;

function redact(value, key = '') {
    if (SENSITIVE_KEY.test(String(key))) return '[REDACTED]';
    if (Array.isArray(value)) return value.map(item => redact(item));
    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value).map(([childKey, childValue]) => [childKey, redact(childValue, childKey)]));
    }
    return value;
}

function createAudit({ sink = event => console.log(JSON.stringify(event)), clock = () => new Date().toISOString() } = {}) {
    return Object.freeze({
        record(event = {}) {
            const safeEvent = redact({
                timestamp: clock(),
                ...event
            });
            sink(safeEvent);
            return safeEvent;
        }
    });
}

module.exports = { createAudit, redact };
