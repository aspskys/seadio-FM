const path = require('path');
const os = require('os');
const fs = require('fs');

function platformUserDataDir() {
  const appName = 'Seadio';
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', appName);
  }
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), appName);
  }
  return path.join(process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share'), appName);
}

const userDataDir = platformUserDataDir();
const sqlitePath = path.join(userDataDir, 'claudio.sqlite');
const ttsCacheDir = path.join(userDataDir, 'cache', 'tts');
const neteaseDataDir = path.join(userDataDir, 'netease');
const envPath = path.join(userDataDir, '.env');

for (const dir of [userDataDir, ttsCacheDir, neteaseDataDir]) {
  fs.mkdirSync(dir, { recursive: true });
}

function resourceDir() {
  if (process.pkg) return path.dirname(process.execPath);
  return path.resolve(__dirname);
}

module.exports = {
  userDataDir,
  sqlitePath,
  ttsCacheDir,
  neteaseDataDir,
  envPath,
  resourceDir,
};
