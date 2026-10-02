module.exports = {
  testEnvironment: 'node',
  testTimeout: 30000,
  verbose: true,
  collectCoverage: false,
  testMatch: ['**/test/**/*.test.js'],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/test/api.test.js$',
    '/test/tasks.test.js$'
  ],
  modulePathIgnorePatterns: ['<rootDir>/.claude/'],
  maxWorkers: 1
};
