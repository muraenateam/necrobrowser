module.exports = async function() {
  console.log('Global teardown: Cleaning up test environment...');

  // Stop Necrobrowser server using the saved PID
  if (global.__NECROBROWSER_PID__) {
    try {
      process.kill(global.__NECROBROWSER_PID__, 'SIGTERM');

      // Wait a bit for graceful shutdown
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Force kill if still running
      try {
        process.kill(global.__NECROBROWSER_PID__, 0); // Check if still running
        process.kill(global.__NECROBROWSER_PID__, 'SIGKILL');
      } catch (e) {
        // Process already terminated
      }
    } catch (error) {
      // Process may have already terminated
      console.log('Process cleanup completed');
    }
  }

  console.log('Global teardown complete');
};
