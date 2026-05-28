const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadConfig(localStorageState = {}, locationOrigin = 'http://127.0.0.1:8080') {
  const src = fs.readFileSync(path.join(__dirname, '..', 'pwa', 'config.js'), 'utf8');
  const sandbox = {
    window: {},
    localStorage: {
      _store: { ...localStorageState },
      getItem(k) { return Object.prototype.hasOwnProperty.call(this._store, k) ? this._store[k] : null; },
      setItem(k, v) { this._store[k] = String(v); },
      removeItem(k) { delete this._store[k]; },
    },
    location: { origin: locationOrigin },
  };
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox);
  return sandbox.window.SeadioConfig;
}

// 1. serverBase falls back to location.origin when no override
{
  const cfg = loadConfig({}, 'http://127.0.0.1:8080');
  assert.strictEqual(cfg.serverBase(), 'http://127.0.0.1:8080');
}

// 2. serverBase uses localStorage override and strips trailing slash
{
  const cfg = loadConfig({ 'seadio:server-base': 'https://radio.example.com/' });
  assert.strictEqual(cfg.serverBase(), 'https://radio.example.com');
}

// 3. api() prepends serverBase
{
  const cfg = loadConfig({ 'seadio:server-base': 'https://radio.example.com' });
  assert.strictEqual(cfg.api('/api/now'), 'https://radio.example.com/api/now');
}

// 4. api() leaves absolute URLs alone
{
  const cfg = loadConfig({ 'seadio:server-base': 'https://radio.example.com' });
  assert.strictEqual(cfg.api('https://cdn.example.com/x.mp3'), 'https://cdn.example.com/x.mp3');
}

// 5. wsUrl turns http -> ws and https -> wss
{
  const httpCfg = loadConfig({ 'seadio:server-base': 'http://radio.example.com' });
  assert.strictEqual(httpCfg.wsUrl('/stream'), 'ws://radio.example.com/stream');
  const httpsCfg = loadConfig({ 'seadio:server-base': 'https://radio.example.com' });
  assert.strictEqual(httpsCfg.wsUrl('/stream'), 'wss://radio.example.com/stream');
}

// 6. setServerBase persists the trimmed origin to localStorage
{
  const cfg = loadConfig({});
  cfg.setServerBase('  https://radio.example.com/  ');
  assert.strictEqual(cfg.serverBase(), 'https://radio.example.com');
}

// 7. clearServerBase removes the override
{
  const cfg = loadConfig({ 'seadio:server-base': 'https://radio.example.com' });
  cfg.clearServerBase();
  assert.strictEqual(cfg.serverBase(), 'http://127.0.0.1:8080');
}

console.log('server-base.test.js OK (7 assertions)');
