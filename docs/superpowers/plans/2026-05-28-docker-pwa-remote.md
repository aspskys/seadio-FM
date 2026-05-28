# Week 3: Docker Backend + Remote-Capable PWA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Package the Seadio backend as a single Docker image (so it can be deployed to any VPS later) and refactor the PWA so it can be loaded from any origin and configured at runtime to point at any backend host. This unblocks Week 4-5 (Capacitor APK talking to a remote backend).

**Architecture:** Single monolithic container — Node 22 base image runs `server.js`, ships the PWA static files, exposes port 8080 only. SQLite + TTS cache + Netease cookies persist via a single `/data` volume (controlled by `SEADIO_DATA_DIR` env var). PWA reads `SERVER_BASE` from `localStorage` at boot; fetch / WebSocket / TTS audio URLs are all rewritten through a single helper. When `SERVER_BASE` is empty, fall back to `location.origin` (current behaviour — Tauri shell + Docker browser access stays seamless).

**Tech Stack:** Docker (multi-stage, node:22-alpine), docker-compose v2, vanilla JS (no PWA framework), existing Express + ws stack untouched.

**Out of scope (later weeks):** yt-dlp installation in the image (MVP defaults to `MUSIC_PROVIDER=netease`), HTTPS / reverse proxy, multi-arch builds, image registry push.

---

## File Structure

**New files:**
- `Dockerfile` — multi-stage Node 22 alpine build, installs only prod deps + python/make/g++ for `better-sqlite3` compile, then drops to runtime stage.
- `.dockerignore` — exclude `node_modules`, `bin/`, `src-tauri/`, `vendor/netease-api/node_modules`, `.git`, `docs/`.
- `docker-compose.yml` — single `seadio` service, port 8080→8080, volume `./data:/data`, env `SEADIO_DATA_DIR=/data`, `MUSIC_PROVIDER=netease`.
- `tests/server-base.test.js` — node:test for the PWA `serverBase()` resolver.
- `pwa/config.js` — single source of truth for SERVER_BASE + URL rewriters. Inlined module exposed on `window.SeadioConfig`.

**Modified files:**
- `paths.js` — honour `SEADIO_DATA_DIR` env (escape hatch from per-platform Application Support dirs).
- `server.js` — add CORS middleware (only allow GET/POST + the Express endpoints we expose) and bind to `0.0.0.0` (not loopback) so Docker port mapping works.
- `pwa/index.html` — load `config.js` first; replace every literal `'/api/...'` `fetch()` and the `ws://${location.host}/stream` with helpers from `window.SeadioConfig`. Add a tiny settings dialog (hidden by default, opened via a footer link) to set/clear SERVER_BASE.
- `package.json` — add `test`, `docker:build`, `docker:up`, `docker:down` scripts.

**Not changed:** `state.js`, `tts.js`, `netease-session.js` — they already consume `paths.js`, so the env override propagates automatically.

---

## Task 1: `SEADIO_DATA_DIR` env override in paths.js

**Files:**
- Modify: `paths.js`
- Test: `tests/paths.test.js` (existing — add cases)

- [ ] **Step 1: Add a failing test**

Append to `tests/paths.test.js`:

```js
test('SEADIO_DATA_DIR env overrides the per-platform dir', () => {
  const tmp = require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 'seadio-test-'));
  process.env.SEADIO_DATA_DIR = tmp;
  delete require.cache[require.resolve('../paths')];
  const p = require('../paths');
  assert.strictEqual(p.userDataDir, tmp);
  assert.ok(p.sqlitePath.startsWith(tmp));
  delete process.env.SEADIO_DATA_DIR;
  delete require.cache[require.resolve('../paths')];
});
```

- [ ] **Step 2: Run the test, confirm it fails**

```bash
node --test tests/paths.test.js 2>&1 | tail -20
```

Expected: the new test fails because `paths.userDataDir` still returns the macOS Application Support path.

- [ ] **Step 3: Implement the override**

In `paths.js`, replace the `const userDataDir = platformUserDataDir();` line with:

```js
const userDataDir = process.env.SEADIO_DATA_DIR || platformUserDataDir();
```

- [ ] **Step 4: Re-run the test**

```bash
node --test tests/paths.test.js 2>&1 | tail -20
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add paths.js tests/paths.test.js
git commit -m "feat(paths): honour SEADIO_DATA_DIR env override (for Docker)"
```

---

## Task 2: CORS + bind 0.0.0.0 in server.js

**Files:**
- Modify: `server.js`

- [ ] **Step 1: Inspect current listen call**

```bash
grep -n "server.listen\|app.use" server.js | head
```

Confirm: there is currently no CORS middleware, and `server.listen(PORT, ...)` does not pass a host (so Node binds `::` by default — but we'll make it explicit for clarity).

- [ ] **Step 2: Add manual CORS middleware**

In `server.js`, immediately after the `app.use(express.json());` line, insert:

```js
// Permissive CORS — backend is always reached from a PWA we ship; the only
// caller is the user's own browser/Tauri/Capacitor shell. Reflect the origin
// so credentialed requests still work if we ever need them.
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
});
```

- [ ] **Step 3: Make listen host explicit**

Find:

```js
server.listen(PORT, () => {
```

Replace with:

```js
const HOST = process.env.HOST || '0.0.0.0';
server.listen(PORT, HOST, () => {
```

And in the existing `console.log` lines just below, change `http://localhost:${PORT}` to `http://${HOST}:${PORT}`.

- [ ] **Step 4: Smoke test locally**

```bash
yarn pkg:server >/dev/null 2>&1
PORT=8080 ./bin/seadio-server-aarch64-apple-darwin > /tmp/seadio.log 2>&1 &
sleep 2
curl -s -o /dev/null -w "GET / : %{http_code}\n" http://127.0.0.1:8080/
curl -s -o /dev/null -w "OPTIONS preflight: %{http_code}\n" -X OPTIONS -H "Origin: http://example.com" -H "Access-Control-Request-Method: POST" http://127.0.0.1:8080/api/chat
curl -s -D - -o /dev/null -H "Origin: http://example.com" http://127.0.0.1:8080/api/now | grep -i "access-control-allow-origin"
pkill -9 -f seadio-server-aarch64
```

Expected:
- `GET / : 200`
- `OPTIONS preflight: 204`
- header line shows `Access-Control-Allow-Origin: http://example.com`

- [ ] **Step 5: Commit**

```bash
git add server.js
git commit -m "feat(server): CORS reflect-origin + explicit 0.0.0.0 bind for Docker"
```

---

## Task 3: PWA `SeadioConfig` helper (TDD)

**Files:**
- Create: `pwa/config.js`
- Create: `tests/server-base.test.js`

- [ ] **Step 1: Write the test first**

Create `tests/server-base.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
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

test('serverBase falls back to location.origin when no override', () => {
  const cfg = loadConfig({}, 'http://127.0.0.1:8080');
  assert.equal(cfg.serverBase(), 'http://127.0.0.1:8080');
});

test('serverBase uses localStorage override and strips trailing slash', () => {
  const cfg = loadConfig({ 'seadio:server-base': 'https://radio.example.com/' });
  assert.equal(cfg.serverBase(), 'https://radio.example.com');
});

test('api() prepends serverBase', () => {
  const cfg = loadConfig({ 'seadio:server-base': 'https://radio.example.com' });
  assert.equal(cfg.api('/api/now'), 'https://radio.example.com/api/now');
});

test('api() leaves absolute URLs alone', () => {
  const cfg = loadConfig({ 'seadio:server-base': 'https://radio.example.com' });
  assert.equal(cfg.api('https://cdn.example.com/x.mp3'), 'https://cdn.example.com/x.mp3');
});

test('wsUrl turns http -> ws and https -> wss', () => {
  const httpCfg = loadConfig({ 'seadio:server-base': 'http://radio.example.com' });
  assert.equal(httpCfg.wsUrl('/stream'), 'ws://radio.example.com/stream');
  const httpsCfg = loadConfig({ 'seadio:server-base': 'https://radio.example.com' });
  assert.equal(httpsCfg.wsUrl('/stream'), 'wss://radio.example.com/stream');
});

test('setServerBase persists the trimmed origin to localStorage', () => {
  const cfg = loadConfig({});
  cfg.setServerBase('  https://radio.example.com/  ');
  assert.equal(cfg.serverBase(), 'https://radio.example.com');
});

test('clearServerBase removes the override', () => {
  const cfg = loadConfig({ 'seadio:server-base': 'https://radio.example.com' });
  cfg.clearServerBase();
  assert.equal(cfg.serverBase(), 'http://127.0.0.1:8080');
});
```

- [ ] **Step 2: Run the test, confirm it fails**

```bash
node --test tests/server-base.test.js 2>&1 | tail -15
```

Expected: ENOENT or "config.js not found".

- [ ] **Step 3: Implement `pwa/config.js`**

Create `pwa/config.js`:

```js
(function () {
  const KEY = 'seadio:server-base';

  function serverBase() {
    const raw = (localStorage.getItem(KEY) || '').trim();
    if (!raw) return location.origin;
    return raw.replace(/\/+$/, '');
  }

  function setServerBase(value) {
    const trimmed = String(value || '').trim().replace(/\/+$/, '');
    if (!trimmed) {
      localStorage.removeItem(KEY);
      return;
    }
    localStorage.setItem(KEY, trimmed);
  }

  function clearServerBase() {
    localStorage.removeItem(KEY);
  }

  function api(pathOrUrl) {
    if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
    const base = serverBase();
    if (pathOrUrl.startsWith('/')) return base + pathOrUrl;
    return base + '/' + pathOrUrl;
  }

  function wsUrl(pathStr) {
    const base = serverBase();
    const ws = base.replace(/^http/i, 'ws');
    return ws + (pathStr.startsWith('/') ? pathStr : '/' + pathStr);
  }

  window.SeadioConfig = { serverBase, setServerBase, clearServerBase, api, wsUrl };
})();
```

- [ ] **Step 4: Re-run the test**

```bash
node --test tests/server-base.test.js 2>&1 | tail -15
```

Expected: 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add pwa/config.js tests/server-base.test.js
git commit -m "feat(pwa): SeadioConfig helper for runtime server-base override"
```

---

## Task 4: Wire `SeadioConfig` into pwa/index.html

**Files:**
- Modify: `pwa/index.html`

- [ ] **Step 1: Load config.js first thing in body**

In `pwa/index.html`, immediately after the opening `<body>` tag (find it with `grep -n '<body' pwa/index.html`), insert:

```html
<script src="config.js"></script>
```

- [ ] **Step 2: Rewrite the 3 fetch calls**

Find these three lines:

```js
const res = await fetch('/api/tts/caller', {
```

```js
fetch('/api/radio/refill', {
```

```js
await fetch('/api/chat', {
```

Replace each `'/api/...'` literal with `window.SeadioConfig.api('/api/...')`. Example:

```js
const res = await fetch(window.SeadioConfig.api('/api/tts/caller'), {
fetch(window.SeadioConfig.api('/api/radio/refill'), {
await fetch(window.SeadioConfig.api('/api/chat'), {
```

- [ ] **Step 3: Rewrite the WebSocket call**

Find:

```js
ws = new WebSocket(`ws://${location.host}/stream`);
```

Replace with:

```js
ws = new WebSocket(window.SeadioConfig.wsUrl('/stream'));
```

- [ ] **Step 4: Rewrite TTS / prefetch audio URLs**

These are relative paths like `/api/tts/<file>` set as `audio.src`. Find the four assignments:

```js
prefetchEl.src = nextUrl;
ttsAudio.src = ttsUrl;
ttsAudio.src = replayUrl;
ttsAudio.src = segment.ttsUrl;
```

Wrap each right-hand side with `window.SeadioConfig.api(...)`:

```js
prefetchEl.src = window.SeadioConfig.api(nextUrl);
ttsAudio.src = window.SeadioConfig.api(ttsUrl);
ttsAudio.src = window.SeadioConfig.api(replayUrl);
ttsAudio.src = window.SeadioConfig.api(segment.ttsUrl);
```

(`musicAudio.src = track.streamUrl;` stays untouched — `streamUrl` is an absolute CDN URL, and `api()` already passes absolute URLs through.)

- [ ] **Step 5: Verify in the existing local server**

```bash
yarn pkg:server >/dev/null 2>&1
PORT=8080 ./bin/seadio-server-aarch64-apple-darwin > /tmp/seadio.log 2>&1 &
sleep 2
curl -s http://127.0.0.1:8080/ | grep -c 'SeadioConfig'
curl -s -o /dev/null -w "config.js: %{http_code}\n" http://127.0.0.1:8080/config.js
pkill -9 -f seadio-server-aarch64
```

Expected: the index page contains at least 5 references to `SeadioConfig` (script tag + fetch/ws/audio rewrites), and `config.js` responds 200.

- [ ] **Step 6: Commit**

```bash
git add pwa/index.html
git commit -m "feat(pwa): route every fetch/ws/tts URL through SeadioConfig"
```

---

## Task 5: Settings dialog to set/clear server URL

**Files:**
- Modify: `pwa/index.html`

- [ ] **Step 1: Insert the dialog markup**

In `pwa/index.html`, just before `</body>` (the line currently containing `</script>` followed by `</body>`), insert this block:

```html
<dialog id="seadio-settings" style="border:none;border-radius:14px;padding:24px;min-width:320px;font:13px/1.4 system-ui;color:#111">
  <form method="dialog" id="seadio-settings-form">
    <h3 style="margin:0 0 12px;font-size:15px">Seadio server</h3>
    <p style="margin:0 0 8px;color:#666">
      Leave blank to use the same host that served this page.
    </p>
    <input id="seadio-settings-url" type="url" placeholder="https://radio.example.com"
           style="width:100%;padding:8px 10px;border:1px solid #ccc;border-radius:8px;font:13px system-ui" />
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px">
      <button value="cancel" type="submit" style="padding:6px 12px">Cancel</button>
      <button value="save" type="submit" style="padding:6px 12px;background:#111;color:#fff;border:0;border-radius:6px">Save & reload</button>
    </div>
  </form>
</dialog>
<button id="seadio-settings-open" title="Server settings"
        style="position:fixed;left:14px;bottom:14px;z-index:9998;background:transparent;border:0;color:#888;font:11px/1 system-ui;cursor:pointer;opacity:.6">
  ⚙ server
</button>
<script>
  (function () {
    const dlg = document.getElementById('seadio-settings');
    const input = document.getElementById('seadio-settings-url');
    const form = document.getElementById('seadio-settings-form');
    const openBtn = document.getElementById('seadio-settings-open');

    openBtn.addEventListener('click', () => {
      input.value = (localStorage.getItem('seadio:server-base') || '');
      if (typeof dlg.showModal === 'function') dlg.showModal();
      else dlg.setAttribute('open', '');
    });

    form.addEventListener('submit', (e) => {
      const btn = e.submitter;
      if (!btn || btn.value !== 'save') return;
      const v = (input.value || '').trim();
      if (!v) window.SeadioConfig.clearServerBase();
      else window.SeadioConfig.setServerBase(v);
      location.reload();
    });
  })();
</script>
```

- [ ] **Step 2: Verify the dialog ships**

```bash
yarn pkg:server >/dev/null 2>&1
PORT=8080 ./bin/seadio-server-aarch64-apple-darwin > /tmp/seadio.log 2>&1 &
sleep 2
curl -s http://127.0.0.1:8080/ | grep -c 'seadio-settings'
pkill -9 -f seadio-server-aarch64
```

Expected: count ≥ 5 (dialog + form + url + open + open-btn references).

- [ ] **Step 3: Commit**

```bash
git add pwa/index.html
git commit -m "feat(pwa): settings dialog to override server base URL"
```

---

## Task 6: `Dockerfile` + `.dockerignore`

**Files:**
- Create: `Dockerfile`
- Create: `.dockerignore`

- [ ] **Step 1: Write `.dockerignore`**

Create `.dockerignore`:

```
node_modules
bin
src-tauri
vendor/netease-api/node_modules
.git
docs
.DS_Store
*.log
data
.env
```

- [ ] **Step 2: Write `Dockerfile`**

Create `Dockerfile`:

```dockerfile
# syntax=docker/dockerfile:1.7
FROM node:22-alpine AS builder
WORKDIR /app

# Toolchain only for better-sqlite3's gyp build
RUN apk add --no-cache python3 make g++

COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile --production=false

COPY . .
# Trim devDependencies after the native build is cached
RUN yarn install --frozen-lockfile --production=true && yarn cache clean

# --- Runtime stage ---
FROM node:22-alpine AS runtime
WORKDIR /app

# yt-dlp is optional (MUSIC_PROVIDER=netease is default); leave it out of MVP.
RUN apk add --no-cache tini

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/pwa ./pwa
COPY --from=builder /app/prompts ./prompts
COPY --from=builder /app/server.js ./server.js
COPY --from=builder /app/router.js ./router.js
COPY --from=builder /app/scheduler.js ./scheduler.js
COPY --from=builder /app/context.js ./context.js
COPY --from=builder /app/claude.js ./claude.js
COPY --from=builder /app/llm.js ./llm.js
COPY --from=builder /app/tts.js ./tts.js
COPY --from=builder /app/music.js ./music.js
COPY --from=builder /app/music-netease.js ./music-netease.js
COPY --from=builder /app/music-yt-dlp.js ./music-yt-dlp.js
COPY --from=builder /app/state.js ./state.js
COPY --from=builder /app/netease-session.js ./netease-session.js
COPY --from=builder /app/paths.js ./paths.js

ENV NODE_ENV=production \
    PORT=8080 \
    HOST=0.0.0.0 \
    SEADIO_DATA_DIR=/data \
    MUSIC_PROVIDER=netease

VOLUME ["/data"]
EXPOSE 8080

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]
```

- [ ] **Step 3: Build the image**

```bash
HTTPS_PROXY=http://127.0.0.1:10808 HTTP_PROXY=http://127.0.0.1:10808 ALL_PROXY=socks5://127.0.0.1:10808 docker build -t seadio:dev . 2>&1 | tail -30
```

Expected: ends with `naming to docker.io/library/seadio:dev done`.

- [ ] **Step 4: Run a quick container smoke test**

```bash
docker run --rm -d --name seadio-smoke -p 18080:8080 -v "$(pwd)/data:/data" seadio:dev
sleep 4
curl -s -o /dev/null -w "GET / : %{http_code}\n"      http://127.0.0.1:18080/
curl -s http://127.0.0.1:18080/api/now
echo
curl -s -o /dev/null -w "config.js : %{http_code}\n" http://127.0.0.1:18080/config.js
docker logs seadio-smoke --tail 20
docker stop seadio-smoke
ls -la data/
```

Expected: `200`, `{"playing":false}`, `200`, logs show `[电台] Seadio FM 启动 → http://0.0.0.0:8080`, and `data/` contains `seadio.sqlite` plus a `netease/` dir.

- [ ] **Step 5: Commit**

```bash
git add Dockerfile .dockerignore
git commit -m "feat(docker): single-stage runtime image (node:22-alpine + tini)"
```

---

## Task 7: `docker-compose.yml`

**Files:**
- Create: `docker-compose.yml`
- Modify: `package.json`

- [ ] **Step 1: Write the compose file**

Create `docker-compose.yml`:

```yaml
services:
  seadio:
    image: seadio:dev
    build: .
    container_name: seadio
    ports:
      - "8080:8080"
    volumes:
      - ./data:/data
    environment:
      MUSIC_PROVIDER: netease
      # DEEPSEEK_API_KEY / VOLCENGINE_TTS_API_KEY are read from data/.env at runtime
    restart: unless-stopped
```

- [ ] **Step 2: Add convenience scripts**

In `package.json`, add to `"scripts"`:

```json
"test": "node --test tests/",
"docker:build": "docker compose build",
"docker:up": "docker compose up -d && docker compose logs -f",
"docker:down": "docker compose down"
```

(Keep the existing scripts; just add these.)

- [ ] **Step 3: Bring it up**

```bash
docker compose up -d --build 2>&1 | tail -10
sleep 4
curl -s -o /dev/null -w "GET / : %{http_code}\n" http://127.0.0.1:8080/
curl -s http://127.0.0.1:8080/api/now
echo
docker compose logs --tail 20 seadio
docker compose down
```

Expected: `200`, `{"playing":false}`, logs show server boot.

- [ ] **Step 4: Commit**

```bash
git add docker-compose.yml package.json
git commit -m "feat(docker): docker-compose + yarn scripts"
```

---

## Task 8: End-to-end remote-PWA dry run

**Files:** (none — verification only)

This task proves the abstraction works: load the PWA from one origin, point it at the dockerised backend on another origin.

- [ ] **Step 1: Bring up the Docker backend**

```bash
docker compose up -d --build
sleep 4
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8080/
```

Expected: `200`.

- [ ] **Step 2: Serve the PWA standalone on a different port**

```bash
cd pwa
python3 -m http.server 9000 > /tmp/pwa.log 2>&1 &
sleep 1
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:9000/
cd ..
```

Expected: `200`. Now there are two origins: PWA on 9000, backend on 8080.

- [ ] **Step 3: Verify CORS preflight**

```bash
curl -s -D - -o /dev/null \
  -H "Origin: http://127.0.0.1:9000" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: Content-Type" \
  -X OPTIONS \
  http://127.0.0.1:8080/api/chat | grep -iE "access-control-allow"
```

Expected output contains:
```
Access-Control-Allow-Origin: http://127.0.0.1:9000
Access-Control-Allow-Methods: GET,POST,OPTIONS
Access-Control-Allow-Headers: Content-Type
```

- [ ] **Step 4: Hand off to manual check**

Open `http://127.0.0.1:9000/` in a regular browser. The page should load but show no live data (because it defaults to `location.origin` = 9000, which has no backend). Click the **⚙ server** button in the bottom-left, enter `http://127.0.0.1:8080`, click "Save & reload". After reload, the PWA should connect (WS open, `/api/now` returns `{playing:false}`). Verify in DevTools → Network that requests now go to `127.0.0.1:8080` and the WS URL is `ws://127.0.0.1:8080/stream`.

If that works, the abstraction is sound. (The user is allowed to skip this visual check per current session policy — in that case at minimum confirm Step 3 CORS headers and move on.)

- [ ] **Step 5: Tear down**

```bash
pkill -9 -f 'python3 -m http.server 9000' 2>/dev/null
docker compose down
```

- [ ] **Step 6: Commit (empty marker)**

```bash
git commit --allow-empty -m "chore: Week 3 Docker + remote-PWA dry run passed"
git tag mvp-docker-backend
```

---

## Self-Review

**Spec coverage check:**
- Single Docker image: Task 6 ✓
- Volume-mounted /data: Task 6 (Dockerfile VOLUME + ENV) + Task 7 (compose mount) ✓
- PWA runtime-configurable server URL: Tasks 3, 4, 5 ✓
- Same-origin fallback preserves current Tauri behaviour: Task 3 (`serverBase()` returns `location.origin` when empty) — Tauri continues loading from `http://127.0.0.1:8080/` so `location.origin = http://127.0.0.1:8080` and nothing changes for it ✓
- CORS for cross-origin PWA → backend: Task 2 + verified in Task 8 ✓
- Setup verifiable end-to-end: Task 8 ✓

**No-placeholder check:** All steps include actual code or exact commands.

**Type consistency check:** `SeadioConfig.api(path)` / `SeadioConfig.wsUrl(path)` / `SeadioConfig.serverBase()` / `SeadioConfig.setServerBase(v)` / `SeadioConfig.clearServerBase()` — same names used across Tasks 3, 4, 5. `SEADIO_DATA_DIR` env var consistent across paths.js, Dockerfile, docker-compose.

**One known compromise:** `better-sqlite3` is rebuilt inside the alpine image (~30 s on a cold cache). Acceptable for MVP; if it ever bites, switch to `node:22-bookworm-slim` which ships glibc + a prebuilt is more likely available.
