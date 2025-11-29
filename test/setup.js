// Export utilities for tests
const baseURL = 'http://localhost:3000';

global.testHelpers = {
  baseURL,

  // Helper to wait for task completion
  async waitForTaskCompletion(taskId, maxWaitMs = 30000) {
    const startTime = Date.now();
    while (Date.now() - startTime < maxWaitMs) {
      const response = await fetch(`${baseURL}/instrument/${taskId}`);
      const data = await response.json();

      if (data.status === 'completed' || data.status === 'error') {
        return data;
      }

      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    throw new Error(`Task ${taskId} did not complete within ${maxWaitMs}ms`);
  }
};
