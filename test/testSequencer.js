const Sequencer = require('@jest/test-sequencer').default;

class CustomSequencer extends Sequencer {
  sort(tests) {
    // Run API tests before task tests
    const apiTests = tests.filter(test => test.path.includes('api.test'));
    const taskTests = tests.filter(test => test.path.includes('tasks.test'));
    return [...apiTests, ...taskTests];
  }
}

module.exports = CustomSequencer;
