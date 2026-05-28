const path = require('path');
const os = require('os');
const fs = require('fs');
const assert = require('assert');

process.env.HOME = path.join(os.tmpdir(), 'seadio-paths-test-home');
try { fs.rmSync(process.env.HOME, { recursive: true, force: true }); } catch {}

delete require.cache[require.resolve('../paths.js')];
const paths = require('../paths.js');

assert.ok(paths.userDataDir.includes('Seadio'),
  `userDataDir should contain "Seadio", got: ${paths.userDataDir}`);
assert.ok(paths.sqlitePath.endsWith('seadio.sqlite'),
  `sqlitePath should end with seadio.sqlite, got: ${paths.sqlitePath}`);
assert.ok(paths.ttsCacheDir.endsWith(path.join('cache', 'tts')),
  `ttsCacheDir should end with cache/tts, got: ${paths.ttsCacheDir}`);
assert.ok(paths.neteaseDataDir.endsWith(path.join('netease')),
  `neteaseDataDir should end with netease, got: ${paths.neteaseDataDir}`);

assert.ok(fs.existsSync(paths.userDataDir), 'userDataDir should be created');
assert.ok(fs.existsSync(paths.ttsCacheDir), 'ttsCacheDir should be created');
assert.ok(fs.existsSync(paths.neteaseDataDir), 'neteaseDataDir should be created');

assert.ok(typeof paths.resourceDir === 'function', 'resourceDir should be a function');
assert.ok(fs.existsSync(paths.resourceDir()), 'resourceDir() should exist');

console.log('paths.test.js OK');
