module.exports = {
  testEnvironment: 'node',
  testTimeout: 60000, // 60 seconds for long-running tasks
  verbose: true,
  collectCoverage: false,
  testMatch: ['**/test/**/*.test.js'],
  globalSetup: '<rootDir>/test/globalSetup.js',
  globalTeardown: '<rootDir>/test/globalTeardown.js',
  setupFilesAfterEnv: ['<rootDir>/test/setup.js'],
  maxWorkers: 1, // Run tests serially to avoid port conflicts
  testSequencer: '<rootDir>/test/testSequencer.js'
};
