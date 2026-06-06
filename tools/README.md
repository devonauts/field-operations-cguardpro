# CGuardPro build/deploy CLI

## Quick start — `uploadApps`
From **any** terminal, just type:

```bash
uploadApps
```

This loads the deploy credentials, drops you into the `worker-app/` folder, and opens a menu:

```
  1) Install on Android device      (debug APK → adb install)
  2) Build Android .aab             (signed → Google Play)
  3) Build + upload iOS             (App Store Connect + metadata)
  4) Doctor — check readiness
  5) Open a shell here              (pyBuild / Install on PATH)
  q) Quit
```

It's a zsh function in `~/.zshrc` that sources `~/.config/cguardpro/env` (the single place
secrets live, chmod 600) and runs `tools/uploadApps-menu.sh`. Once run, the `pyBuild` / `Install`
commands below are on your `PATH` too, so you can use them directly from anywhere.

> First time only: `source ~/.zshrc` (or open a new terminal) so the function loads.

---

## The underlying commands

One Python tool drives device installs and store builds.

```bash
Install cguardpro            # build debug APK + install on the connected Android phone
pyBuild android cguardpro    # build a signed .aab for Google Play
pyBuild ios cguardpro        # archive + upload to App Store Connect + push metadata
```

`cguardpro` is the app key in [`pybuild.config.json`](../pybuild.config.json). With one app
configured you can omit it (`./pyBuild android`).

Each command runs `npm run build` → `npx cap sync` first, so you never have to remember to
sync. Android steps force **JDK 17** (`javaHome17` in the config) because AGP can't build under
JDK 25.

---

## What each command does

| Command | Steps | Output |
|---|---|---|
| `Install` | web build → cap sync → `gradlew assembleDebug` → `adb install -r` → launch | app running on device |
| `pyBuild android` | web build → cap sync → ensure keystore + signingConfig → `gradlew bundleRelease` | `build-output/cguardpro-release.aab` |
| `pyBuild ios` | web build → cap sync → `xcodebuild archive` → export `.ipa` → `altool --upload-app` → push localized metadata via App Store Connect API | build in App Store Connect, metadata filled |

Metadata text (ES + EN — title, subtitle, description, keywords, promo, release notes) lives in
[`store-metadata/metadata.json`](../store-metadata/metadata.json). It was AI-written for this app;
edit it and re-run `pyBuild ios` to update the listing.

**App icon & splash:** drop a `1024×1024` `icon.png` (and optional splash) into
[`app-icons/`](../app-icons/) — every build automatically regenerates all Android/iOS icons, the
splash, and the embedded store icon, and emits `build-output/play-store-icon-512.png` for the
Play Console listing. See [`app-icons/README.md`](../app-icons/README.md).

---

## What you need to provide (one-time)

### 1. Firebase config matching the bundle id  ⚠️ required for push
The committed `google-services.json` / `GoogleService-Info.plist` were generated for a **different**
bundle id, so FCM push won't work until you fix this:

1. Firebase console → project **cguardpro-worker-app** → Add app → **Android**, package
   `com.cguardpro.operaciones` → download `google-services.json` → put in `android/app/`.
2. Add app → **iOS**, bundle `com.cguardpro.operaciones` → download `GoogleService-Info.plist` →
   replace `ios/App/App/GoogleService-Info.plist` (and drag it into the App target in Xcode once).

The tool prints a warning if the config still doesn't match.

### 2. Android signing (for `pyBuild android`)
Set a keystore password and the tool creates + reuses a keystore automatically:
```bash
export CGUARDPRO_KEYSTORE_PASS='Somosunequipoloco2026*'
export CGUARDPRO_KEY_PASS="$CGUARDPRO_KEYSTORE_PASS"
```
> The keystore is written to `android/cguardpro-release.keystore`. **Back it up.** Lose it and
> Google Play will never accept another update of this app. (To use an existing keystore instead,
> point `android.keystore` in the config at it.)

### 3. iOS / App Store Connect (for `pyBuild ios`)
- An **Apple Developer Program** membership and the app's bundle id `com.cguardpro.operaciones`
  registered (Certificates, Identifiers & Profiles → Identifiers).
- The **app record** created in App Store Connect (Apps → +) with a version in
  "Prepare for Submission" — the tool fills that version's metadata but won't create the app itself.
- An **App Store Connect API key** (Users and Access → Integrations → App Store Connect API →
  generate key, role *App Manager*). Download the `.p8` once.
- For **iOS push**: upload an **APNs Auth Key** (.p8 from Keys → +) to Firebase → Project settings →
  Cloud Messaging.

Then export:
```bash
export CGUARDPRO_TEAM_ID='CT355863NH'        # Apple Developer Team ID
export ASC_KEY_ID='5WQB4DD96X'                 # the API key id
export ASC_ISSUER_ID='b6044ab5-f0d4-4d62-af06-6e8262550df5'       # Issuer ID shown above the keys list
mkdir -p ~/.appstoreconnect/private_keys
cp ~/Downloads/AuthKey_XXXXXXXXXX.p8 ~/.appstoreconnect/private_keys/AuthKey.p8
```
(Signing certs/profiles are created automatically — the tool passes `-allowProvisioningUpdates`.)

---

## Prerequisites already on this machine
- ✅ JDK 17 (`temurin-17`) — `javaHome17` in the config points at it
- ✅ `adb` at `/usr/local/bin/adb`
- ✅ Python 3.12 with `requests` + `pyjwt`
- iOS also needs Xcode + command-line tools (`xcode-select -s /Applications/Xcode.app`)

## Tips
- A device must have **USB debugging** on and be authorized (`adb devices` shows it as `device`).
- Bump the version before each store build: `versionCode`/`versionName` in
  `android/app/build.gradle`, and `MARKETING_VERSION`/`CURRENT_PROJECT_VERSION` in Xcode (iOS).
- Secrets live only in env vars (`ENV:` indirection in the config) — nothing sensitive is committed.
