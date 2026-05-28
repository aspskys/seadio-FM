# Week 6 Release + Cloud Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce signed release artifacts (Android APK, macOS .dmg) and migrate the backend off LAN by exposing the local Docker server through Cloudflare Tunnel while serving the PWA from Cloudflare Pages.

**Architecture:** Backend stays in Docker on the developer machine. `cloudflared` tunnels `http://localhost:8080` to `https://api.<user-domain>` so phones / browsers can reach it from anywhere. PWA assets get pushed to Cloudflare Pages (`https://seadio.pages.dev`) and reach the API by HTTPS with CORS already in place. Android release APK is signed with a keystore whose passwords live in macOS Keychain. macOS desktop is ad-hoc-signed (no Apple Developer account) and shipped as a `.dmg`.

**Tech Stack:** Tauri 2 (Rust), Capacitor 7 (Android), `cloudflared` CLI, `wrangler` CLI, macOS Keychain (`security` cmd), Android Gradle Plugin 8.7.2 + apksigner.

---

## Files Touched

- Create: `android/app/keystore.properties.template` — committed template, real secrets live in Keychain
- Create: `android/release-sign.sh` — pulls Keychain secrets, exports env vars for Gradle
- Modify: `android/app/build.gradle:19-25` — add release signing config that reads env vars
- Modify: `src-tauri/tauri.conf.json:32-46` — bundle.targets += "dmg"; add macOS ad-hoc signingIdentity
- Modify: `tts.js:7-8` — wire cache eviction call after every successful write
- Create: `cache-evict.js` — LRU-by-mtime eviction module (single responsibility)
- Modify: `server.js` near line 754 — add `GET /api/health` route
- Create: `cloudflared/config.yml.template` — ingress mapping template
- Create: `cloudflared/README.md` — Cloudflare Tunnel setup playbook
- Create: `pwa/wrangler.toml` — Cloudflare Pages project config
- Create: `docs/week6-release-playbook.md` — end-to-end release + deploy doc
- Modify: `.gitignore` — allow new docs files, ignore real keystore + populated configs

---

## Task 1: Android Release Keystore + Keychain-Backed Signing

**Files:**
- Create: `android/app/seadio-release.jks` (gitignored — real keystore)
- Create: `android/app/keystore.properties.template`
- Create: `android/release-sign.sh`
- Modify: `android/app/build.gradle:19-25` (add `signingConfigs` block + wire into `buildTypes.release`)
- Modify: `.gitignore` (add `android/app/*.jks`, `android/app/keystore.properties`)

- [ ] **Step 1: Generate the release keystore (one-time)**

```bash
KS_PASS=$(openssl rand -base64 24)
KEY_PASS=$(openssl rand -base64 24)
keytool -genkeypair -v \
  -keystore /Users/aspskys/multica_workspaces/seadio-FM/android/app/seadio-release.jks \
  -alias seadio \
  -keyalg RSA -keysize 4096 -validity 10000 \
  -storepass "$KS_PASS" -keypass "$KEY_PASS" \
  -dname "CN=Seadio FM, OU=seadio, O=seadio, L=Shanghai, ST=Shanghai, C=CN"

# Stash both passwords in macOS Keychain (NOT in shell history or files)
security add-generic-password -a "seadio-release" -s "seadio-android-keystore" -w "$KS_PASS" -U
security add-generic-password -a "seadio-release" -s "seadio-android-key"      -w "$KEY_PASS" -U

# Wipe the shell vars so they don't sit in process state
unset KS_PASS KEY_PASS
```

Expected: `seadio-release.jks` exists (~3 KB), two Keychain entries created.

- [ ] **Step 2: Write the Keychain → env shim script**

Create `android/release-sign.sh`:

```bash
#!/usr/bin/env bash
# Sources Keychain-stored keystore passwords into env so gradle can read them.
# Usage:  source android/release-sign.sh && (cd android && ./gradlew assembleRelease)
set -e

export KEYSTORE_PATH="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/app/seadio-release.jks"
export KEY_ALIAS="seadio"
export KEYSTORE_PASS="$(security find-generic-password -a seadio-release -s seadio-android-keystore -w)"
export KEY_PASS="$(security find-generic-password -a seadio-release -s seadio-android-key -w)"

if [ -z "$KEYSTORE_PASS" ] || [ -z "$KEY_PASS" ]; then
  echo "ERROR: Keychain entries missing. Re-run keystore generation from plan Step 1." >&2
  return 1 2>/dev/null || exit 1
fi
```

Then `chmod +x android/release-sign.sh`.

- [ ] **Step 3: Add the committed template (for future devs)**

Create `android/app/keystore.properties.template`:

```properties
# Copy to keystore.properties and fill, OR (preferred) `source ../release-sign.sh`
# to populate via macOS Keychain instead of a file on disk.
storeFile=app/seadio-release.jks
keyAlias=seadio
storePassword=
keyPassword=
```

- [ ] **Step 4: Wire signingConfig into Gradle**

Modify `android/app/build.gradle:19-25`. Replace the existing `buildTypes` block with:

```groovy
    signingConfigs {
        release {
            def ksPath = System.getenv("KEYSTORE_PATH")
            def ksPass = System.getenv("KEYSTORE_PASS")
            def keyAlias = System.getenv("KEY_ALIAS")
            def keyPass = System.getenv("KEY_PASS")
            if (ksPath && ksPass && keyAlias && keyPass) {
                storeFile file(ksPath)
                storePassword ksPass
                keyAlias keyAlias
                keyPassword keyPass
            }
        }
    }
    buildTypes {
        release {
            minifyEnabled false
            proguardFiles getDefaultProguardFile('proguard-android.txt'), 'proguard-rules.pro'
            signingConfig signingConfigs.release
        }
    }
```

- [ ] **Step 5: Update .gitignore**

Append to `.gitignore`:

```
# Android release signing — real artefacts stay local
android/app/*.jks
android/app/keystore.properties
```

- [ ] **Step 6: Build release APK**

```bash
cd /Users/aspskys/multica_workspaces/seadio-FM
source android/release-sign.sh
cd android
JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home" \
PATH="/Applications/Android Studio.app/Contents/jbr/Contents/Home/bin:$PATH" \
HTTPS_PROXY=http://127.0.0.1:10808 HTTP_PROXY=http://127.0.0.1:10808 \
  ./gradlew -I gradle-mirror.init.gradle assembleRelease 2>&1 | tail -20
cd ..
unset KEYSTORE_PATH KEYSTORE_PASS KEY_ALIAS KEY_PASS
```

Expected: `BUILD SUCCESSFUL` and `android/app/build/outputs/apk/release/app-release.apk` exists.

- [ ] **Step 7: Verify signature**

```bash
~/Library/Android/sdk/build-tools/36.1.0/apksigner verify --verbose \
  /Users/aspskys/multica_workspaces/seadio-FM/android/app/build/outputs/apk/release/app-release.apk
```

Expected output contains: `Verified using v1 scheme (JAR signing): true`, `Verified using v2 scheme (APK Signature Scheme v2): true`, and a `Number of signers: 1` line.

- [ ] **Step 8: Commit**

```bash
cd /Users/aspskys/multica_workspaces/seadio-FM
git add android/release-sign.sh android/app/keystore.properties.template android/app/build.gradle .gitignore
git commit -m "feat(android): release signing via macOS Keychain"
```

---

## Task 2: macOS Ad-hoc Sign + .dmg Bundle

**Files:**
- Modify: `src-tauri/tauri.conf.json:32-46` (bundle targets + macOS signingIdentity)

- [ ] **Step 1: Inspect current bundle config**

```bash
grep -n '"targets"\|"macOS"\|"identifier"' /Users/aspskys/multica_workspaces/seadio-FM/src-tauri/tauri.conf.json
```

Confirms current `"targets": ["app"]` (only `.app`, no `.dmg`).

- [ ] **Step 2: Add `.dmg` target + ad-hoc macOS signing**

Edit `src-tauri/tauri.conf.json`. Replace the `"bundle"` block with:

```json
  "bundle": {
    "active": true,
    "targets": ["app", "dmg"],
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns"
    ],
    "externalBin": [
      "../bin/seadio-server",
      "../bin/netease-api"
    ],
    "macOS": {
      "signingIdentity": "-",
      "minimumSystemVersion": "11.0"
    }
  }
```

`"signingIdentity": "-"` is the magic Apple value for ad-hoc signing — works without a Developer ID certificate.

- [ ] **Step 3: Build the signed .dmg**

```bash
cd /Users/aspskys/multica_workspaces/seadio-FM
HTTPS_PROXY=http://127.0.0.1:10808 HTTP_PROXY=http://127.0.0.1:10808 \
  yarn tauri build --bundles dmg 2>&1 | tail -15
```

Expected: `Finished` line and a `.dmg` at `src-tauri/target/release/bundle/dmg/Seadio_0.1.0_aarch64.dmg`.

- [ ] **Step 4: Verify ad-hoc signature**

```bash
codesign -dv --verbose=4 \
  /Users/aspskys/multica_workspaces/seadio-FM/src-tauri/target/release/bundle/macos/Seadio.app 2>&1 \
  | grep -E "Identifier|Signature|Authority|TeamIdentifier"
```

Expected: `Signature=adhoc`, `Identifier=com.seadio.fm`, no `Authority=` lines (ad-hoc has no signing authority chain).

- [ ] **Step 5: Smoke-test the .dmg**

```bash
hdiutil attach /Users/aspskys/multica_workspaces/seadio-FM/src-tauri/target/release/bundle/dmg/Seadio_*.dmg
ls /Volumes/Seadio*/
hdiutil detach /Volumes/Seadio*/
```

Expected: shows `Seadio.app` inside the mount.

- [ ] **Step 6: Commit**

```bash
cd /Users/aspskys/multica_workspaces/seadio-FM
git add src-tauri/tauri.conf.json
git commit -m "feat(desktop): ad-hoc signed macOS .dmg bundle"
```

---

## Task 3: Backend Production Hardening — Cache Eviction + Health Route

**Files:**
- Create: `cache-evict.js`
- Modify: `tts.js:43-46` (call evictor after each cache write)
- Modify: `server.js` (add `/api/health`)
- Create: `tests/cache-evict.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/cache-evict.test.js`:

```javascript
const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('assert');
const { evictIfOver } = require('../cache-evict');

(function runSync() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'seadio-evict-'));

  // Write five 1 KB files with deterministic mtimes (oldest = a)
  ['a', 'b', 'c', 'd', 'e'].forEach((name, i) => {
    const p = path.join(dir, `${name}.mp3`);
    fs.writeFileSync(p, Buffer.alloc(1024, 0));
    const t = (Date.now() - (5 - i) * 1000) / 1000;
    fs.utimesSync(p, t, t);
  });

  // Cap = 3 KB → must keep newest 3 (c, d, e), drop a + b
  evictIfOver(dir, 3 * 1024);

  const remaining = fs.readdirSync(dir).sort();
  assert.deepStrictEqual(remaining, ['c.mp3', 'd.mp3', 'e.mp3'], `unexpected remaining: ${remaining}`);

  fs.rmSync(dir, { recursive: true, force: true });
  console.log('cache-evict test passed');
})();
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/aspskys/multica_workspaces/seadio-FM
node tests/cache-evict.test.js
```

Expected: `Cannot find module '../cache-evict'`.

- [ ] **Step 3: Implement the evictor**

Create `cache-evict.js`:

```javascript
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

  files.sort((a, b) => a.mtimeMs - b.mtimeMs); // oldest first
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
```

- [ ] **Step 4: Verify the test passes**

```bash
cd /Users/aspskys/multica_workspaces/seadio-FM
node tests/cache-evict.test.js
```

Expected: `cache-evict test passed`.

- [ ] **Step 5: Wire evictor into the TTS write path**

Edit `tts.js`. After line 4 add:

```javascript
const { evictIfOver } = require('./cache-evict');
```

After line 8 (`fs.mkdirSync(CACHE_DIR, { recursive: true });`), add:

```javascript
const TTS_CACHE_MAX_BYTES = Number(process.env.TTS_CACHE_MAX_BYTES || 200 * 1024 * 1024);
```

Then change the `.then(p => { ... })` block at lines 43-46 to:

```javascript
  return promise.then(p => {
    console.log(`[TTS] 完成 (${((Date.now() - startAt) / 1000).toFixed(1)}s) → ${path.basename(p)}`);
    try {
      evictIfOver(CACHE_DIR, TTS_CACHE_MAX_BYTES);
    } catch (e) {
      console.warn('[TTS] cache eviction skipped:', e.message);
    }
    return p;
  });
```

- [ ] **Step 6: Add the /api/health route**

Edit `server.js`. Just above the existing `app.get('/api/now', ...)` line (around line 754) add:

```javascript
app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    uptime: Math.round(process.uptime()),
    pid: process.pid,
    rss: process.memoryUsage().rss,
  });
});
```

- [ ] **Step 7: Smoke test the health route**

```bash
cd /Users/aspskys/multica_workspaces/seadio-FM
node server.js &
SERVER_PID=$!
sleep 2
curl -s http://127.0.0.1:8080/api/health
kill $SERVER_PID
```

Expected: JSON response containing `"ok":true`.

- [ ] **Step 8: Commit**

```bash
git add cache-evict.js tests/cache-evict.test.js tts.js server.js
git commit -m "feat(server): TTS cache LRU eviction + /api/health"
```

---

## Task 4: Cloudflare Tunnel Config Template + Playbook

**Files:**
- Create: `cloudflared/config.yml.template`
- Create: `cloudflared/README.md`
- Modify: `.gitignore` (ignore real populated `cloudflared/config.yml` + credentials)

- [ ] **Step 1: Write the ingress template**

Create `cloudflared/config.yml.template`:

```yaml
# Cloudflare Tunnel ingress for Seadio backend.
# Copy to cloudflared/config.yml and fill the placeholders.
#
# Placeholders:
#   <TUNNEL_UUID>      — printed by `cloudflared tunnel create seadio`
#   <YOUR_DOMAIN>      — e.g. example.com (must be a CF-managed zone)
#
# Real config.yml + the *.json credentials file are gitignored.

tunnel: <TUNNEL_UUID>
credentials-file: /Users/aspskys/.cloudflared/<TUNNEL_UUID>.json

ingress:
  - hostname: api.seadio.<YOUR_DOMAIN>
    service: http://localhost:8080
    originRequest:
      noTLSVerify: true
      connectTimeout: 10s
      # WebSocket support is on by default — no extra config needed.
  - service: http_status:404
```

- [ ] **Step 2: Write the operator playbook**

Create `cloudflared/README.md`:

```markdown
# Cloudflare Tunnel for Seadio Backend

Exposes the Docker backend running on `localhost:8080` to the public internet at
`https://api.seadio.<your-domain>` without opening any inbound firewall port and
without renting a VPS.

## One-Time Setup

Install `cloudflared`:

\`\`\`bash
brew install cloudflared
\`\`\`

Authenticate (opens a browser, requires a Cloudflare account that already
manages your DNS zone):

\`\`\`bash
cloudflared tunnel login
\`\`\`

Create the tunnel and capture its UUID:

\`\`\`bash
cloudflared tunnel create seadio
\`\`\`

Copy the template and fill in `<TUNNEL_UUID>` and `<YOUR_DOMAIN>`:

\`\`\`bash
cp cloudflared/config.yml.template cloudflared/config.yml
$EDITOR cloudflared/config.yml
\`\`\`

Route DNS so `api.seadio.<your-domain>` resolves to the tunnel:

\`\`\`bash
cloudflared tunnel route dns seadio api.seadio.<your-domain>
\`\`\`

## Running the Tunnel

Foreground (for testing):

\`\`\`bash
cloudflared tunnel --config cloudflared/config.yml run seadio
\`\`\`

As a macOS LaunchAgent (survives reboots):

\`\`\`bash
sudo cloudflared --config "$PWD/cloudflared/config.yml" service install
sudo launchctl start com.cloudflare.cloudflared
\`\`\`

## Verifying

\`\`\`bash
curl https://api.seadio.<your-domain>/api/health
\`\`\`

Expected: `{"ok":true,...}` matching the local `curl http://localhost:8080/api/health`.

## Tear-down

\`\`\`bash
sudo launchctl stop com.cloudflare.cloudflared
sudo cloudflared service uninstall
cloudflared tunnel delete seadio
\`\`\`
```

- [ ] **Step 3: Update .gitignore**

Append to `.gitignore`:

```
# Cloudflare Tunnel — real config + credentials stay local
cloudflared/config.yml
cloudflared/*.json
```

- [ ] **Step 4: Allow-list the new docs file (since docs/* is ignored)**

`cloudflared/` is not under `docs/`, so no allow-list needed. Just verify:

```bash
cd /Users/aspskys/multica_workspaces/seadio-FM
git check-ignore -v cloudflared/config.yml.template cloudflared/README.md || echo "OK — template + README are tracked"
```

Expected: `OK — template + README are tracked` (the `||` runs because `git check-ignore` exits non-zero when files are NOT ignored).

- [ ] **Step 5: Commit**

```bash
git add cloudflared/config.yml.template cloudflared/README.md .gitignore
git commit -m "feat(cloud): Cloudflare Tunnel config template + setup playbook"
```

---

## Task 5: PWA → Cloudflare Pages Deploy Config

**Files:**
- Create: `pwa/wrangler.toml`
- Modify: `pwa/index.html` settings dialog (already has server URL input; update placeholder text)

- [ ] **Step 1: Write the wrangler config**

Create `pwa/wrangler.toml`:

```toml
name = "seadio"
compatibility_date = "2026-05-28"
pages_build_output_dir = "."

# Static-only — no Functions / Workers needed; PWA talks to the API via the
# Cloudflare Tunnel hostname configured by the user in the in-app settings.
```

- [ ] **Step 2: Update the placeholder hint in pwa/index.html:1938-1942**

Replace the current help-text + placeholder. Use this exact Edit:

Old (matches `pwa/index.html` around line 1938-1942):

```html
    <p style="margin:0 0 8px;color:#666">
      Leave blank to use the same host that served this page.
    </p>
    <input id="seadio-settings-url" type="url" placeholder="https://radio.example.com"
           style="width:100%;padding:8px 10px;border:1px solid #ccc;border-radius:8px;font:13px system-ui" />
```

New:

```html
    <p style="margin:0 0 8px;color:#666">
      Cloudflare Tunnel URL (e.g. https://api.seadio.your-domain) or a LAN
      address like http://192.168.x.y:8080. Leave blank to use the same host
      that served this page.
    </p>
    <input id="seadio-settings-url" type="url" placeholder="https://api.seadio.your-domain"
           style="width:100%;padding:8px 10px;border:1px solid #ccc;border-radius:8px;font:13px system-ui" />
```

- [ ] **Step 3: Sync the Android assets so the new help text reaches the APK**

```bash
cd /Users/aspskys/multica_workspaces/seadio-FM
npx cap sync android 2>&1 | tail -3
```

Expected: `Sync finished` line.

- [ ] **Step 4: Verify wrangler dry-run**

```bash
cd /Users/aspskys/multica_workspaces/seadio-FM
HTTPS_PROXY=http://127.0.0.1:10808 HTTP_PROXY=http://127.0.0.1:10808 \
  npx wrangler@latest pages deploy pwa --dry-run --project-name seadio 2>&1 | tail -10
```

Expected: wrangler prints what it would upload (file count + total size) and exits 0. If it asks for login, that's fine — Step 8 of the playbook handles the real deploy.

- [ ] **Step 5: Commit**

```bash
git add pwa/wrangler.toml pwa/index.html
git commit -m "feat(pwa): Cloudflare Pages deploy config + Tunnel-aware placeholder"
```

---

## Task 6: End-to-End Release Smoke Test + Tag

**Files:**
- (no source changes — verification only)

- [ ] **Step 1: Rebuild signed Android APK**

```bash
cd /Users/aspskys/multica_workspaces/seadio-FM
source android/release-sign.sh
cd android
JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home" \
PATH="/Applications/Android Studio.app/Contents/jbr/Contents/Home/bin:$PATH" \
HTTPS_PROXY=http://127.0.0.1:10808 HTTP_PROXY=http://127.0.0.1:10808 \
  ./gradlew -I gradle-mirror.init.gradle assembleRelease 2>&1 | tail -3
cd ..
unset KEYSTORE_PATH KEYSTORE_PASS KEY_ALIAS KEY_PASS
ls -la android/app/build/outputs/apk/release/app-release.apk
```

Expected: `BUILD SUCCESSFUL` + APK exists.

- [ ] **Step 2: Rebuild signed .dmg**

```bash
cd /Users/aspskys/multica_workspaces/seadio-FM
HTTPS_PROXY=http://127.0.0.1:10808 HTTP_PROXY=http://127.0.0.1:10808 \
  yarn tauri build --bundles dmg 2>&1 | tail -3
ls -la src-tauri/target/release/bundle/dmg/Seadio_*.dmg
```

Expected: `Finished` + `.dmg` exists.

- [ ] **Step 3: Record artifact hashes**

```bash
cd /Users/aspskys/multica_workspaces/seadio-FM
shasum -a 256 android/app/build/outputs/apk/release/app-release.apk \
              src-tauri/target/release/bundle/dmg/Seadio_*.dmg \
  > /tmp/seadio-week6-hashes.txt
cat /tmp/seadio-week6-hashes.txt
```

Expected: two lines, each starting with a 64-char hex SHA256 then a filename. Keep this output — Task 7 references it.

- [ ] **Step 4: Run the cache-evict test once more**

```bash
cd /Users/aspskys/multica_workspaces/seadio-FM
node tests/cache-evict.test.js
```

Expected: `cache-evict test passed`.

- [ ] **Step 5: Smoke-test the new /api/health route under Docker**

```bash
cd /Users/aspskys/multica_workspaces/seadio-FM
docker compose up -d 2>&1 | tail -3
sleep 5
curl -s http://127.0.0.1:8080/api/health
docker compose down 2>&1 | tail -1
```

Expected: `{"ok":true,...}`. If Docker is not running, fall back to `node server.js &` as in Task 3 Step 7.

- [ ] **Step 6: Tag and push**

```bash
cd /Users/aspskys/multica_workspaces/seadio-FM
git tag mvp-signed
HTTPS_PROXY=http://127.0.0.1:10808 HTTP_PROXY=http://127.0.0.1:10808 \
  git push origin feat/desktop-mvp mvp-signed 2>&1 | tail -5
```

Expected: tag pushed; remote shows `mvp-signed`.

---

## Task 7: Week 6 Release Playbook Document

**Files:**
- Create: `docs/week6-release-playbook.md`
- Modify: `.gitignore` (allow this new file)

- [ ] **Step 1: Add the doc allow-list entry**

Append to `.gitignore`:

```
!docs/week6-release-playbook.md
```

- [ ] **Step 2: Write the playbook**

Create `docs/week6-release-playbook.md`:

````markdown
# Week 6 Release Playbook

End-to-end procedure for producing signed Seadio FM release artifacts and
exposing the backend to the public internet without renting a server.

## Artifacts

| Artifact | Build command | Output path | Signing |
|---|---|---|---|
| Android APK | see [Build Android](#build-android-release-apk) | `android/app/build/outputs/apk/release/app-release.apk` | RSA-4096 self-signed, password in macOS Keychain |
| macOS .dmg | see [Build macOS](#build-macos-dmg) | `src-tauri/target/release/bundle/dmg/Seadio_*.dmg` | Ad-hoc (`codesign --sign -`) |

## Build Android release APK

Prereqs (one-time):
- Keystore generated at `android/app/seadio-release.jks` (see Task 1 of the Week 6 plan)
- Two `security add-generic-password` entries: `seadio-android-keystore` and `seadio-android-key`

```bash
cd /Users/aspskys/multica_workspaces/seadio-FM
source android/release-sign.sh
cd android
JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home" \
PATH="/Applications/Android Studio.app/Contents/jbr/Contents/Home/bin:$PATH" \
HTTPS_PROXY=http://127.0.0.1:10808 HTTP_PROXY=http://127.0.0.1:10808 \
  ./gradlew -I gradle-mirror.init.gradle assembleRelease
cd ..
unset KEYSTORE_PATH KEYSTORE_PASS KEY_ALIAS KEY_PASS
```

Verify:

```bash
~/Library/Android/sdk/build-tools/36.1.0/apksigner verify --verbose \
  android/app/build/outputs/apk/release/app-release.apk
```

## Build macOS .dmg

```bash
cd /Users/aspskys/multica_workspaces/seadio-FM
HTTPS_PROXY=http://127.0.0.1:10808 HTTP_PROXY=http://127.0.0.1:10808 \
  yarn tauri build --bundles dmg
```

Verify ad-hoc signature:

```bash
codesign -dv --verbose=4 src-tauri/target/release/bundle/macos/Seadio.app 2>&1 \
  | grep -E "Identifier|Signature"
```

Expected: `Signature=adhoc` and `Identifier=com.seadio.fm`.

## Bring the backend online

See `cloudflared/README.md` for the full Cloudflare Tunnel setup. Summary:

```bash
brew install cloudflared
cloudflared tunnel login
cloudflared tunnel create seadio
cp cloudflared/config.yml.template cloudflared/config.yml
# Fill TUNNEL_UUID and YOUR_DOMAIN
cloudflared tunnel route dns seadio api.seadio.<your-domain>
docker compose up -d           # start the backend
cloudflared tunnel --config cloudflared/config.yml run seadio
```

Verify:

```bash
curl https://api.seadio.<your-domain>/api/health
```

## Publish the PWA

```bash
cd /Users/aspskys/multica_workspaces/seadio-FM
HTTPS_PROXY=http://127.0.0.1:10808 HTTP_PROXY=http://127.0.0.1:10808 \
  npx wrangler@latest login                  # one-time
npx wrangler@latest pages deploy pwa --project-name seadio
```

Expected: wrangler prints `https://seadio.pages.dev` (or `https://<sha>.seadio.pages.dev` for previews).

## End-user flow

1. User installs the APK or `.dmg`. First launch shows the server URL dialog.
2. They paste `https://api.seadio.<your-domain>` and tap Save.
3. PWA reloads against the Tunnel-fronted backend; all subsequent traffic
   is `wss://` / `https://` and CORS-allowed because `server.js:23-31` already
   reflects the request origin.

## Rotating signing keys

If the Android keystore leaks, Google Play would force a key reset; with self-signed
distribution the practical fix is "ship a new app under a new applicationId."

For ad-hoc macOS signing, the identity is `-`, so there's nothing to rotate —
re-running `tauri build` produces a fresh ad-hoc signature.
````

- [ ] **Step 3: Verify the file is trackable**

```bash
cd /Users/aspskys/multica_workspaces/seadio-FM
git check-ignore -v docs/week6-release-playbook.md && echo "FAIL — still ignored" || echo "OK — trackable"
```

Expected: `OK — trackable`.

- [ ] **Step 4: Commit**

```bash
git add docs/week6-release-playbook.md .gitignore
git commit -m "docs: Week 6 release + cloud playbook"
```

- [ ] **Step 5: Push**

```bash
HTTPS_PROXY=http://127.0.0.1:10808 HTTP_PROXY=http://127.0.0.1:10808 \
  git push origin feat/desktop-mvp 2>&1 | tail -3
```

Expected: branch update pushed.

---

## Acceptance Checklist

When all tasks are done:

- [ ] `app-release.apk` exists at the documented path and `apksigner verify` reports v1+v2 schemes verified
- [ ] `Seadio_*.dmg` exists and `codesign -dv` reports `Signature=adhoc`
- [ ] `node tests/cache-evict.test.js` prints `cache-evict test passed`
- [ ] `curl http://127.0.0.1:8080/api/health` returns `{"ok":true,...}` when the backend is running
- [ ] `cloudflared/README.md` + `cloudflared/config.yml.template` are in git; real `cloudflared/config.yml` is gitignored
- [ ] `pwa/wrangler.toml` exists; `npx wrangler pages deploy pwa --dry-run` succeeds
- [ ] `docs/week6-release-playbook.md` is in git
- [ ] Tag `mvp-signed` exists on remote `aspskys/seadio-FM`
