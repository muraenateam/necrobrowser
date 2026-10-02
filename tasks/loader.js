const fs = require('fs');
const path = require('path');
const c = require('chalk');
const log = require('../lib/logger');

function findTaskFiles(directory) {
    return fs.readdirSync(directory, { withFileTypes: true })
        .filter(entry => entry.isDirectory() && isAlphanumeric(entry.name))
        .map(entry => path.join(directory, entry.name, 'necrotask.js'))
        .filter(file => fs.existsSync(file))
        .sort();
}

function isAlphanumeric(value) {
    return typeof value === 'string' && /^[A-Za-z0-9]+$/.test(value);
}

exports.LoadTasks = ({ tasksRoot = path.resolve(__dirname), logger = console } = {}) => {
    const registry = {};
    const taskFiles = findTaskFiles(path.resolve(tasksRoot));

    for (const file of taskFiles) {
        const taskType = path.basename(path.dirname(file));
        if (!isAlphanumeric(taskType)) {
            throw new Error(`Task type must be alphanumeric: ${taskType}`);
        }

        const module = require(file);
        const names = Object.keys(module).filter(name => typeof module[name] === 'function');
        registry[taskType] = names;
        registry[`${taskType}__Tasks`] = module;
        logger.log?.(`${c.green('[loader]')} parsed ${names.length} necrotasks for [${taskType}]:\n ${names.join('\n ')}`);
    }

    return registry;
};

exports.ValidateTask = (taskType, taskName, taskParams, tasks) => {
    if (typeof taskParams === 'undefined' || !isAlphanumeric(taskType) || !isAlphanumeric(taskName)) {
        return false;
    }
    return Array.isArray(tasks?.[taskType]) && tasks[taskType].includes(taskName);
};

exports.WrapTaskWithErrorHandler = (taskFn, taskType, taskName, db) => {
    if (typeof taskFn !== 'function') throw new TypeError('taskFn must be a function');

    return async (taskData) => {
        const taskId = taskData?.data?.[0] || 'unknown';
        try {
            log.LogInfo(`[${taskId}] Starting task execution: ${taskType}.${taskName}`);
            const result = await taskFn(taskData);
            log.LogSuccess(`[${taskId}] Task completed successfully: ${taskType}.${taskName}`);
            return result;
        } catch (error) {
            log.LogError('TASK EXECUTION ERROR CAUGHT', {
                'Task ID': taskId,
                'Task Type': `${taskType}.${taskName}`,
                'Error': error.message,
                'Time': new Date().toISOString()
            });
            if (taskId !== 'unknown') {
                try {
                    await db.UpdateTaskStatusWithReason(taskId, 'error', error.message || 'Task execution failed');
                } catch (dbError) {
                    log.LogError('TASK STATUS UPDATE FAILED', { Error: dbError.message });
                }
            }
            throw error;
        }
    };
};
