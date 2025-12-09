const c = require('chalk');

/**
 * Formats and logs an error with consistent styling
 * @param {string} title - Error title
 * @param {Object} details - Object containing error details
 */
exports.LogError = (title, details) => {
    const lines = [
        c.red('╔═══════════════════════════════════════════════════════════╗'),
        c.red(`║  ${title.padEnd(55)}║`),
        c.red('╚═══════════════════════════════════════════════════════════╝')
    ];

    Object.entries(details).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
            lines.push(`${c.yellow(key + ':')} ${value}`);
        }
    });

    console.error(lines.join('\n'));
};

/**
 * Logs info message
 * @param {string} message - Message to log
 */
exports.LogInfo = (message) => {
    console.log(c.cyan(message));
};

/**
 * Logs success message
 * @param {string} message - Message to log
 */
exports.LogSuccess = (message) => {
    console.log(c.green(message));
};

/**
 * Logs warning message
 * @param {string} message - Message to log
 */
exports.LogWarning = (message) => {
    console.log(c.yellow(message));
};
