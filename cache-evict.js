const fs = require('fs');
const path = require('path');

function evictIfOver(dir, maxBytes) {
  if (!fs.existsSync(dir)) return;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (e) {
    return;
  }
  const files = entries
    .filter((e) => e.isFile())
    .map((e) => {
      const full = path.join(dir, e.name);
      const st = fs.statSync(full);
      return { full, size: st.size, mtimeMs: st.mtimeMs };
    });

  let total = files.reduce((acc, f) => acc + f.size, 0);
  if (total <= maxBytes) return;

  files.sort((a, b) => a.mtimeMs - b.mtimeMs);
  for (const f of files) {
    if (total <= maxBytes) break;
    try {
      fs.unlinkSync(f.full);
      total -= f.size;
    } catch (e) {
      // Best effort — skip files we can't unlink (in use, race)
    }
  }
}

module.exports = { evictIfOver };
