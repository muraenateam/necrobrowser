module.exports = {
    testEnvironment: 'node',
    testTimeout: 60000,
    verbose: true,
    testMatch: ['**/test/browser.e2e.js'],
    modulePathIgnorePatterns: ['<rootDir>/.claude/'],
    maxWorkers: 1,
    transform: {},
    testEnvironmentOptions: {}

};
