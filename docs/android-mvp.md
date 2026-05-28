# Seadio FM — Android MVP (Capacitor)

Week 4-5 deliverable: a Capacitor-shelled APK that wraps the existing PWA and
keeps audio playing in the background via a media-playback foreground service.

## What's shipped

- `android/` platform scaffold (Capacitor 7, AGP 8.7.2, Gradle 8.11.1).
- `SeadioMediaService` — foreground service with an ongoing notification on
  channel `seadio_playback`. Starts on `START_STICKY`; tap brings the app
  forward via the launcher intent.
- `SeadioMediaPlugin` — Capacitor plugin (`@CapacitorPlugin(name="SeadioMedia")`)
  exposing `start()` / `stop()` to JS.
- PWA bridge — `pwa/index.html` listens to `play`/`pause`/`ended`/`emptied`
  events on the `<audio>` elements and calls `SeadioMedia.start`/`stop` so the
  notification only lives while audio is actually playing.
- First-run server dialog — when running inside Capacitor with no
  `seadio:server-base` in `localStorage`, the settings dialog auto-opens so the
  user can point the app at a LAN backend (e.g. `http://192.168.x.y:8080`).
- Cleartext is allow-listed for `localhost`, `127.0.0.1`, and the three
  RFC1918 ranges via `network_security_config.xml`. Public hosts still require
  HTTPS.

## Build

Prerequisites:

- Android Studio (for its bundled JBR 21). Set
  `JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"`.
  Gradle 8.11.1 does not run on JDK 25.
- Android SDK at `~/Library/Android/sdk` with `platforms;android-36`,
  `build-tools;36.1.0`, `platform-tools`, and `emulator`.
- The user's VPN proxy at `127.0.0.1:10808` (for any package downloads).

The repo ships a Gradle init script that rewrites all repositories to Aliyun
mirrors. Use it whenever the upstream Maven / Google / Plugin Portal endpoints
are unreachable through the local proxy:

```bash
cd android
HTTPS_PROXY=http://127.0.0.1:10808 HTTP_PROXY=http://127.0.0.1:10808 \
  ./gradlew -I gradle-mirror.init.gradle assembleDebug
```

Without restrictive networks, the regular `./gradlew assembleDebug` suffices —
`android/build.gradle` already lists the Aliyun mirrors before `google()` /
`mavenCentral()`, and the wrapper distribution comes from
`mirrors.cloud.tencent.com/gradle`.

After a successful build:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

## Install on a device or emulator

```bash
# Boot the bundled AVD (skip if a device is already attached)
~/Library/Android/sdk/emulator/emulator -avd seadio_test \
  -no-snapshot -no-audio -no-boot-anim &

# Install + launch
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
adb shell am start -n com.seadio.fm/.MainActivity
```

The first launch shows the server URL dialog — enter
`http://<laptop-LAN-ip>:8080` (the Week 3 Docker / pkg backend address). The
PWA reloads and starts talking to that backend.

## Sync PWA changes into the Android shell

```bash
yarn cap:sync         # copies pwa/ into android/app/src/main/assets/public
yarn cap:build:debug  # rebuilds the APK
yarn cap:install:debug
```

## Known gaps (Week 6 work)

- **Release signing.** The current APK is debug-signed only. Week 6 needs a
  keystore in macOS Keychain, a release Gradle signing config, and a CI lane
  that produces `app-release.apk` (or `.aab`).
- **App icon / branding.** Still the Capacitor default launcher icon.
- **Background bridge regression test.** No automated test currently asserts
  that the foreground notification appears when `<audio>.play()` fires.
  Manual smoke: configure the LAN backend, start a station, lock the phone —
  audio should keep playing and the notification should stay sticky.
- **Cloud backend.** PWA still expects a LAN host. Week 6 swaps that for a
  publicly reachable HTTPS endpoint.

## Useful commands

```bash
# Logcat filtered to the app + Capacitor + Chromium
adb logcat -d -t 500 | grep -E "seadio.fm|Capacitor|chromium"

# Verify the service is registered + permissions granted
adb shell dumpsys package com.seadio.fm | grep -iE "FOREGROUND|cleartext"

# Inspect the foreground-service state
adb shell dumpsys activity services com.seadio.fm
```
