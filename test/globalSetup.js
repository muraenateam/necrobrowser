const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

module.exports = async function() {
  console.log('Global setup: Starting test environment...');

  const root = path.join(__dirname, '..');
  const extrusionPath = path.join(root, 'extrusion');
  const profilesPath = path.join(root, 'profiles');
  const databasePath = path.join(os.tmpdir(), `necrobrowser-test-${process.pid}.db`);

  if (fs.existsSync(profilesPath)) {
    fs.rmSync(profilesPath, { recursive: true, force: true });
  }
  fs.mkdirSync(profilesPath, { recursive: true });

  if (!fs.existsSync(extrusionPath)) {
    fs.mkdirSync(extrusionPath, { recursive: true });
  }

  for (const suffix of ['', '-wal', '-shm']) {
    try { fs.rmSync(`${databasePath}${suffix}`, { force: true }); } catch (_) { /* already absent */ }
  }

  console.log('Starting Necrobrowser server...');
  const necrobrowserProcess = spawn('node', ['necrobrowser.js'], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
    env: { ...process.env, NODE_ENV: 'test', NECRO_DB_PATH: databasePath }
  });

  global.__NECROBROWSER_PID__ = necrobrowserProcess.pid;
  global.__NECROBROWSER_DB__ = databasePath;

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Necrobrowser server failed to start in time'));
    }, 30000);

    necrobrowserProcess.stdout.on('data', data => {
      const output = data.toString();
      if (output.includes('NecroBrowser ready at')) {
        clearTimeout(timeout);
        console.log('Necrobrowser server is ready');
        resolve();
      }
    });

    necrobrowserProcess.stderr.on('data', data => {
      const output = data.toString();
      if (output.includes('Error:') && !output.includes('Browser was not found')) {
        console.error('Necrobrowser stderr:', output);
      }
    });

    necrobrowserProcess.on('error', error => {
      clearTimeout(timeout);
      reject(error);
    });
  });

  await new Promise(resolve => setTimeout(resolve, 2000));
  console.log('Global setup complete');
};
