// Shared test helpers. Tests select their own ephemeral listener and fixture.
global.testHelpers = {
  async waitForTaskCompletion(fetchTask, maxWaitMs = 30000, intervalMs = 100) {
    const deadline = Date.now() + maxWaitMs;
    let lastStatus;
    while (Date.now() < deadline) {
      const response = await fetchTask();
      const data = await response.json();
      lastStatus = data.status;
      if (['completed', 'partial', 'error', 'cancelled'].includes(data.status)) return data;
      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }
    throw new Error(`Task did not complete within ${maxWaitMs}ms; last status: ${lastStatus || 'unknown'}`);
  }
};
