const redis = require('redis');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

module.exports = async function() {
  console.log('Global setup: Starting test environment...');

  // Ensure required directories exist and clean them
  const extrusionPath = path.join(__dirname, '..', 'extrusion');
  const profilesPath = path.join(__dirname, '..', 'profiles');

  // Clean profiles directory to avoid browser lock issues
  if (fs.existsSync(profilesPath)) {
    fs.rmSync(profilesPath, { recursive: true, force: true });
  }
  fs.mkdirSync(profilesPath, { recursive: true });

  if (!fs.existsSync(extrusionPath)) {
    fs.mkdirSync(extrusionPath, { recursive: true });
  }

  // Check Redis is available
  const redisClient = redis.createClient();
  await redisClient.connect();
  await redisClient.ping();
  console.log('Redis connection verified');

  // Clear any existing test data
  const keys = await redisClient.keys('task:*');
  if (keys.length > 0) {
    await redisClient.del(keys);
  }
  await redisClient.quit();

  // Start Necrobrowser server with test environment flag
  console.log('Starting Necrobrowser server...');
  const necrobrowserProcess = spawn('node', ['necrobrowser.js'], {
    cwd: path.join(__dirname, '..'),
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
    env: { ...process.env, NODE_ENV: 'test' }
  });

  // Save PID for cleanup
  global.__NECROBROWSER_PID__ = necrobrowserProcess.pid;

  // Wait for server to be ready
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Necrobrowser server failed to start in time'));
    }, 30000);

    necrobrowserProcess.stdout.on('data', (data) => {
      const output = data.toString();
      if (output.includes('NecroBrowser ready at')) {
        clearTimeout(timeout);
        console.log('Necrobrowser server is ready');
        resolve();
      }
    });

    necrobrowserProcess.stderr.on('data', (data) => {
      const output = data.toString();
      // Only log critical errors
      if (output.includes('Error:') && !output.includes('Browser was not found')) {
        console.error('Necrobrowser stderr:', output);
      }
    });

    necrobrowserProcess.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });

  // Give it a moment to fully initialize
  await new Promise(resolve => setTimeout(resolve, 2000));

  console.log('Global setup complete');
};
