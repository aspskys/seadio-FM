const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('assert');
const { evictIfOver } = require('../cache-evict');

(function runSync() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'seadio-evict-'));

  ['a', 'b', 'c', 'd', 'e'].forEach((name, i) => {
    const p = path.join(dir, `${name}.mp3`);
    fs.writeFileSync(p, Buffer.alloc(1024, 0));
    const t = (Date.now() - (5 - i) * 1000) / 1000;
    fs.utimesSync(p, t, t);
  });

  evictIfOver(dir, 3 * 1024);

  const remaining = fs.readdirSync(dir).sort();
  assert.deepStrictEqual(remaining, ['c.mp3', 'd.mp3', 'e.mp3'], `unexpected remaining: ${remaining}`);

  fs.rmSync(dir, { recursive: true, force: true });
  console.log('cache-evict test passed');
})();
