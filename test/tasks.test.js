const { baseURL, waitForTaskCompletion } = global.testHelpers;
const fs = require('fs');
const path = require('path');

describe('Necrobrowser Task Execution', () => {

  describe('Generic ScreenshotPages Task', () => {
    let taskId;
    const testUrls = [
      'https://example.com',
      'https://www.wikipedia.org'
    ];

    test('should successfully submit ScreenshotPages task', async () => {
      const response = await fetch(`${baseURL}/instrument`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'screenshot-test',
          task: {
            type: 'generic',
            name: ['ScreenshotPages'],
            params: {
              urls: testUrls
            }
          },
          cookie: []
        })
      });

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data.status).toBe('queued');
      expect(data.necroIds).toHaveLength(1);

      taskId = data.necroIds[0];
      expect(taskId).toMatch(/^task:generic:.+/);
    });

    test('should transition from queued to running/completed', async () => {
      // Check initial status
      let response = await fetch(`${baseURL}/instrument/${taskId}`);
      let data = await response.json();

      expect(['queued', 'running']).toContain(data.status);

      // Wait for task to start - increased timeout to account for queue
      await new Promise(resolve => setTimeout(resolve, 4000));

      response = await fetch(`${baseURL}/instrument/${taskId}`);
      data = await response.json();

      // Should be running or completed
      expect(['running', 'completed']).toContain(data.status);
    });

    test('should complete successfully within timeout', async () => {
      const result = await waitForTaskCompletion(taskId, 5000);

      expect(result.status).toBe('completed');
      expect(result).toHaveProperty('data');
    });

    test('should have created screenshot files', async () => {
      const extrusionPath = path.join(__dirname, '..', 'extrusion');
      const files = fs.readdirSync(extrusionPath);

      // Should have at least one screenshot file
      const screenshotFiles = files.filter(f => f.includes('screenshot_') && f.includes(taskId.split(':')[2]));
      expect(screenshotFiles.length).toBeGreaterThan(0);

      // Check files are not empty
      screenshotFiles.forEach(file => {
        const stats = fs.statSync(path.join(extrusionPath, file));
        expect(stats.size).toBeGreaterThan(0);
      });
    });

    test('should store screenshot data in Redis', async () => {
      const response = await fetch(`${baseURL}/instrument/${taskId}`);
      const data = await response.json();

      expect(data.status).toBe('completed');
      expect(Array.isArray(data.data)).toBe(true);
      expect(data.data.length).toBeGreaterThan(0);

      // Check data structure
      data.data.forEach(entry => {
        expect(entry).toHaveProperty('url');
        expect(entry).toHaveProperty('encoded');

        // Verify base64 encoding
        expect(typeof entry.encoded).toBe('string');
        expect(entry.encoded.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Multiple Task Submissions', () => {
    test('should handle multiple concurrent task submissions', async () => {
      const taskPromises = [];

      for (let i = 0; i < 3; i++) {
        const promise = fetch(`${baseURL}/instrument`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: `concurrent-test-${i}`,
            task: {
              type: 'generic',
              name: ['ScreenshotPages'],
              params: {
                urls: ['https://example.com']
              }
            },
            cookie: []
          })
        });
        taskPromises.push(promise);
      }

      const responses = await Promise.all(taskPromises);

      // All should succeed
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });

      const dataPromises = responses.map(r => r.json());
      const dataArray = await Promise.all(dataPromises);

      // All should be queued
      dataArray.forEach(data => {
        expect(data.status).toBe('queued');
        expect(data.necroIds).toHaveLength(1);
      });

      // All task IDs should be unique
      const taskIds = dataArray.map(d => d.necroIds[0]);
      const uniqueIds = new Set(taskIds);
      expect(uniqueIds.size).toBe(taskIds.length);
    });
  });

  describe('Task Error Handling', () => {
    test('should handle task with invalid URL gracefully', async () => {
      const response = await fetch(`${baseURL}/instrument`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'invalid-url-test',
          task: {
            type: 'generic',
            name: ['ScreenshotPages'],
            params: {
              urls: ['not-a-valid-url']
            }
          },
          cookie: []
        })
      });

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data.status).toBe('queued');
      const taskId = data.necroIds[0];

      // Wait for task to complete
      const result = await waitForTaskCompletion(taskId, 5000);

      // Task should complete or error (the error is caught internally)
      expect(['completed', 'error', 'running']).toContain(result.status);
    });
  });

  describe('Cluster Status During Task Execution', () => {
    test('should show active workers while tasks are running', async () => {
      // Submit a task
      const submitResponse = await fetch(`${baseURL}/instrument`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'worker-status-test',
          task: {
            type: 'generic',
            name: ['ScreenshotPages'],
            params: {
              urls: ['https://example.com']
            }
          },
          cookie: []
        })
      });

      const submitData = await submitResponse.json();
      const taskId = submitData.necroIds[0];

      // Check status immediately after submission
      await new Promise(resolve => setTimeout(resolve, 1000));

      const statusResponse = await fetch(`${baseURL}/`);
      const statusData = await statusResponse.json();

      // Parse the values (they're strings)
      const queued = parseInt(statusData.queued);
      const workers = parseInt(statusData.workers);

      // Should have either queued tasks or active workers
      expect(queued + workers).toBeGreaterThan(0);

      // Wait for completion
      await waitForTaskCompletion(taskId, 5000);
    });
  });

  describe('Cookie Handling', () => {
    test('should accept task submission with cookies', async () => {
      const cookies = [
        {
          domain: '.example.com',
          name: 'test_cookie',
          value: 'test_value',
          path: '/',
          secure: false,
          httpOnly: false,
          session: false
        }
      ];

      const response = await fetch(`${baseURL}/instrument`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'cookie-test',
          task: {
            type: 'generic',
            name: ['ScreenshotPages'],
            params: {
              urls: ['https://example.com']
            }
          },
          cookie: cookies
        })
      });

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data.status).toBe('queued');
      expect(data.necroIds).toHaveLength(1);

      // Wait for completion
      const taskId = data.necroIds[0];
      const result = await waitForTaskCompletion(taskId, 5000);

      expect(result.status).toBe('completed');
    });
  });

  describe('Antisnatchor.com Screenshot Test', () => {
    test('should screenshot antisnatchor.com and save to /tmp', async () => {
      const response = await fetch(`${baseURL}/instrument`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'antisnatchor-screenshot',
          task: {
            type: 'generic',
            name: ['ScreenshotPages'],
            params: {
              urls: ['https://antisnatchor.com'],
              outputPath: '/tmp'
            }
          },
          cookie: []
        })
      });

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data.status).toBe('queued');
      expect(data.necroIds).toHaveLength(1);

      const taskId = data.necroIds[0];
      const shortId = taskId.split(':')[2];

      // Wait for completion
      const result = await waitForTaskCompletion(taskId, 10000);

      expect(result.status).toBe('completed');

      // Verify screenshot file exists in /tmp
      const screenshotPath = `/tmp/screenshot_antisnatchor.com_${shortId}.png`;
      const fs = require('fs');

      expect(fs.existsSync(screenshotPath)).toBe(true);

      // Verify file is not empty
      const stats = fs.statSync(screenshotPath);
      expect(stats.size).toBeGreaterThan(0);

      console.log(`Screenshot saved to: ${screenshotPath} (${stats.size} bytes)`);

      // Clean up
      fs.unlinkSync(screenshotPath);
    });
  });
});
