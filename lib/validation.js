function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

exports.ValidateInstrumentRequest = (body, { maxTasks = 25, maxCookies = 500, maxCredentials = 100, maxUserAgentLength = 1024 } = {}) => {
    if (!isPlainObject(body)) {
        return { valid: false, error: 'Invalid request body' };
    }
    if (typeof body.name !== 'string' || body.name.trim() === '') {
        return { valid: false, error: 'Missing required field: name' };
    }
    if (!isPlainObject(body.task)) {
        return { valid: false, error: 'Missing or invalid required field: task' };
    }
    if (typeof body.task.type !== 'string' || body.task.type.trim() === '') {
        return { valid: false, error: 'Missing required field: task.type' };
    }
    if (!Array.isArray(body.task.name) || body.task.name.length === 0 || body.task.name.length > maxTasks) {
        return { valid: false, error: `task.name must contain 1-${maxTasks} task names` };
    }
    if (body.task.name.some(name => typeof name !== 'string' || name.length === 0)) {
        return { valid: false, error: 'task.name entries must be non-empty strings' };
    }
    if (!isPlainObject(body.task.params)) {
        return { valid: false, error: 'task.params must be an object' };
    }
    const cookieInput = body.cookie ?? body.cookies;
    if (cookieInput !== undefined) {
        const validCookieInput = Array.isArray(cookieInput) || typeof cookieInput === 'string';
        if (!validCookieInput || (Array.isArray(cookieInput) && cookieInput.length > maxCookies)) {
            return { valid: false, error: `cookie must be an array or JSON string with at most ${maxCookies} entries` };
        }
    }
    const credentials = body.credentials ?? body.task.params.credentials;
    if (credentials !== undefined) {
        const validArray = Array.isArray(credentials) && credentials.length <= maxCredentials && credentials.every(entry => isPlainObject(entry));
        const validObject = isPlainObject(credentials) && Object.keys(credentials).length <= maxCredentials;
        if (!validArray && !validObject) {
            return { valid: false, error: `credentials must be an object or an array of objects with at most ${maxCredentials} entries` };
        }
    }
    if (body.userAgent !== undefined && (typeof body.userAgent !== 'string' || body.userAgent.length > maxUserAgentLength)) {
        return { valid: false, error: `userAgent must be a string of at most ${maxUserAgentLength} characters` };
    }
    return { valid: true, error: null };
};

exports.ValidateTaskExists = (necrotask, taskType, taskName) => {
    const taskModule = necrotask?.[`${taskType}__Tasks`];
    if (!taskModule) {
        return { valid: false, error: `Task module ${taskType} not found` };
    }
    if (typeof taskModule[taskName] !== 'function') {
        return { valid: false, error: `Task function ${taskType}.${taskName} not found` };
    }
    return { valid: true, error: null };
};

exports.isPlainObject = isPlainObject;
