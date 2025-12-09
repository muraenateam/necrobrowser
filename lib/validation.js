const c = require('chalk');

/**
 * Validates the instrument request body structure
 * @param {Object} body - The request body
 * @returns {Object} { valid: boolean, error: string|null }
 */
exports.ValidateInstrumentRequest = (body) => {
    if (!body || typeof body !== 'object') {
        return { valid: false, error: 'Invalid request body' };
    }

    if (!body.name) {
        return { valid: false, error: 'Missing required field: name' };
    }

    if (!body.task || typeof body.task !== 'object') {
        return { valid: false, error: 'Missing or invalid required field: task' };
    }

    if (!body.task.type) {
        return { valid: false, error: 'Missing required field: task.type' };
    }

    if (!body.task.name || !Array.isArray(body.task.name)) {
        return { valid: false, error: 'Missing or invalid required field: task.name (must be array)' };
    }

    if (typeof body.task.params === 'undefined') {
        return { valid: false, error: 'Missing required field: task.params' };
    }

    return { valid: true, error: null };
};

/**
 * Validates that a task function exists
 * @param {Object} necrotask - The loaded necrotask modules
 * @param {string} taskType - The task type
 * @param {string} taskName - The task name
 * @returns {Object} { valid: boolean, error: string|null }
 */
exports.ValidateTaskExists = (necrotask, taskType, taskName) => {
    const taskModule = necrotask[`${taskType}__Tasks`];

    if (!taskModule) {
        return { valid: false, error: `Task module ${taskType} not found` };
    }

    if (typeof taskModule[taskName] !== 'function') {
        return { valid: false, error: `Task function ${taskType}.${taskName} not found` };
    }

    return { valid: true, error: null };
};
