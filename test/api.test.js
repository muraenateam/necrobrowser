const { baseURL } = global.testHelpers;

describe('Necrobrowser API Endpoints', () => {

  describe('GET /', () => {
    test('should return cluster status', async () => {
      const response = await fetch(`${baseURL}/`);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data).toHaveProperty('startedAt');
      expect(data).toHaveProperty('workers');
      expect(data).toHaveProperty('queued');
      expect(data).toHaveProperty('progress');
      expect(data).toHaveProperty('errors');
      expect(data).toHaveProperty('tasks');
    });

    test('should have correct data types', async () => {
      const response = await fetch(`${baseURL}/`);
      const data = await response.json();

      expect(typeof data.startedAt).toBe('string');
      expect(typeof data.workers).toBe('string');
      expect(typeof data.queued).toBe('string');
      expect(typeof data.progress).toBe('string');
      expect(typeof data.errors).toBe('string');
      expect(Array.isArray(data.tasks)).toBe(true);
    });
  });

  describe('GET /tasks', () => {
    test('should return available task types and methods', async () => {
      const response = await fetch(`${baseURL}/tasks`);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(typeof data).toBe('object');
      expect(Object.keys(data).length).toBeGreaterThan(0);
    });

    test('should include known task types', async () => {
      const response = await fetch(`${baseURL}/tasks`);
      const data = await response.json();

      // Check for expected task types
      expect(data).toHaveProperty('generic');
      expect(data).toHaveProperty('office365');
      expect(data).toHaveProperty('github');

      // Check that generic has ScreenshotPages
      expect(Array.isArray(data.generic)).toBe(true);
      expect(data.generic).toContain('ScreenshotPages');
    });

    test('should not include internal task names', async () => {
      const response = await fetch(`${baseURL}/tasks`);
      const data = await response.json();

      // Should not include __Tasks or other internal properties
      const keys = Object.keys(data);
      keys.forEach(key => {
        expect(key).not.toContain('__');
      });
    });
  });

  describe('POST /instrument', () => {
    test('should reject request with missing parameters', async () => {
      const response = await fetch(`${baseURL}/instrument`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });

      const data = await response.json();
      expect(data).toHaveProperty('error');
    });

    test('should reject request with invalid task type', async () => {
      const response = await fetch(`${baseURL}/instrument`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'test',
          task: {
            type: 'invalidtype',
            name: ['SomeTask'],
            params: {}
          },
          cookie: []
        })
      });

      const data = await response.json();
      expect(data).toHaveProperty('error');
    });

    test('should reject request with invalid task name', async () => {
      const response = await fetch(`${baseURL}/instrument`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'test',
          task: {
            type: 'generic',
            name: ['InvalidTask!@#'],  // Non-alphanumeric should be rejected
            params: {}
          },
          cookie: []
        })
      });

      const data = await response.json();
      expect(data).toHaveProperty('error');
    });

    test('should accept valid task submission', async () => {
      const response = await fetch(`${baseURL}/instrument`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'test-task',
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

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data).toHaveProperty('status', 'queued');
      expect(data).toHaveProperty('necroIds');
      expect(Array.isArray(data.necroIds)).toBe(true);
      expect(data.necroIds.length).toBe(1);
      expect(data.necroIds[0]).toMatch(/^task:generic:.+/);
    });
  });

  describe('GET /instrument/:id', () => {
    let taskId;

    beforeAll(async () => {
      // Submit a task first
      const response = await fetch(`${baseURL}/instrument`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'test-query',
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

      const data = await response.json();
      taskId = data.necroIds[0];
    });

    test('should return task status for queued task', async () => {
      const response = await fetch(`${baseURL}/instrument/${taskId}`);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data).toHaveProperty('status');
      expect(['queued', 'running', 'completed', 'error']).toContain(data.status);
    });

    test('should return 200 for non-existent task', async () => {
      const response = await fetch(`${baseURL}/instrument/task:generic:nonexistent`);
      expect(response.status).toBe(200);

      const data = await response.json();
      // Redis will return null status for non-existent key
      expect(data.status).toBeNull();
    });
  });
});
