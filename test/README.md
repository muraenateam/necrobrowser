# Necrobrowser Test Suite

This directory contains comprehensive tests for the Necrobrowser RESTful API and core functionality.

## Test Structure

- **jest.config.js** - Jest configuration with global setup/teardown
- **test/globalSetup.js** - Starts Necrobrowser server before all tests
- **test/globalTeardown.js** - Stops Necrobrowser server after all tests
- **test/setup.js** - Test helpers and utilities
- **test/api.test.js** - RESTful API endpoint tests
- **test/tasks.test.js** - Task submission and execution tests

## Running Tests

```bash
# Run all tests
npm test

# Run only API tests
npm run test:api

# Run only task tests
npm run test:tasks

# Watch mode
npm run test:watch

# Coverage report
npm run test:coverage
```

## Test Coverage

### API Endpoint Tests (test/api.test.js)
✅ All 11 tests passing

Tests cover:
- `GET /` - Cluster status endpoint
- `GET /tasks` - Available tasks listing
- `POST /instrument` - Task submission with validation
- `GET /instrument/:id` - Task status retrieval

### Task Execution Tests (test/tasks.test.js)
Partial coverage - Browser execution requires additional setup

Tests cover:
- Task submission workflow
- Task status transitions
- Multiple concurrent task submissions
- Cookie handling
- Error handling

## Prerequisites

- Redis must be running on localhost:6379
- Puppeteer's bundled Chromium (automatically installed with npm install)
- config.toml must be configured with `headless = true` for tests

## Configuration

Tests use the main `config.toml` file with these requirements:
- `headless = true` (required for CI/headless environments)
- `puppetPath = ""` (use Puppeteer's bundled Chrome)
- `concurrency = "browser"` (avoids userDataDir locking issues)

## Known Limitations

- Task execution tests may timeout in resource-constrained environments
- Browser-based tests require sufficient memory (Puppeteer/Chromium)
- Tests run serially (maxWorkers: 1) to avoid port conflicts

## Extending Tests

To add new tests:

1. Add test file in `test/` directory matching pattern `*.test.js`
2. Use `global.testHelpers.baseURL` for API endpoint
3. Use `global.testHelpers.waitForTaskCompletion(taskId)` for async tasks
4. Tests have 60-second timeout (configurable in jest.config.js)

Example:
```javascript
const { baseURL, waitForTaskCompletion } = global.testHelpers;

test('my new test', async () => {
  const response = await fetch(`${baseURL}/tasks`);
  expect(response.status).toBe(200);
});
```

## Troubleshooting

**Tests timing out:**
- Increase `testTimeout` in jest.config.js
- Check Redis is running: `redis-cli ping`
- Ensure sufficient system resources for Chromium

**Port already in use:**
- Kill existing Necrobrowser: `pkill -f "node necrobrowser.js"`
- Tests use port 3000 (configured in config.toml)

**Browser launch failures:**
- Ensure `headless = true` in config.toml
- Check Puppeteer installation: `npm list puppeteer`
- For Linux, may need: `apt-get install -y chromium chromium-browser`
