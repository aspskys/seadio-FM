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
- Keychain entry `seadio-android-keystore` populated (PKCS12 → store password = key password)

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

Expected: `Verified using v1 scheme (JAR signing): true` and `Verified using v2 scheme (APK Signature Scheme v2): true`.

## Build macOS .dmg

```bash
cd /Users/aspskys/multica_workspaces/seadio-FM
export PATH="/Users/aspskys/.rustup/toolchains/stable-aarch64-apple-darwin/bin:/Users/aspskys/.cargo/bin:$PATH"
HTTPS_PROXY=http://127.0.0.1:10808 HTTP_PROXY=http://127.0.0.1:10808 \
  cargo tauri build --bundles dmg
```

Verify ad-hoc signature (inspect inside the .dmg, since tauri cleans the .app afterward):

```bash
hdiutil attach src-tauri/target/release/bundle/dmg/Seadio_*.dmg
codesign -dv --verbose=4 /Volumes/Seadio*/Seadio.app 2>&1 | grep -E "Identifier|Signature"
hdiutil detach /Volumes/Seadio*/
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

Expected: `{"ok":true,...}`.

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
   is `wss://` / `https://` and CORS-allowed because `server.js` reflects the request origin.

## Rotating signing keys

If the Android keystore leaks, Google Play would force a key reset; with self-signed
distribution the practical fix is "ship a new app under a new applicationId."

For ad-hoc macOS signing, the identity is `-`, so there's nothing to rotate —
re-running `cargo tauri build` produces a fresh ad-hoc signature.

## Reference SHA256s (mvp-signed tag)

Recorded at /tmp/seadio-week6-hashes.txt at tag time. To re-verify a downloaded
artifact, run `shasum -a 256 <file>` and compare against the build output
captured in the corresponding release notes.
