# CGuardPro Worker App — Store Deployment

Native iOS + Android apps are generated (Capacitor 6 + Ionic). App id **`com.cguardpro.operaciones`**,
name **CGuardPro**, Firebase project **`cguardpro-worker-app`**.

## What's already wired
- ✅ Android (`android/`) and iOS (`ios/`) native projects.
- ✅ Firebase configs in place: `android/app/google-services.json`, `ios/App/App/GoogleService-Info.plist`.
- ✅ Android FCM gradle plugin (auto-applied via `google-services.json`).
- ✅ Permissions — Android (`AndroidManifest.xml`): camera, fine/coarse location, `POST_NOTIFICATIONS`, media. iOS (`Info.plist`): camera, location, photo library, `remote-notification` background mode.
- ✅ App icon + splash (gold shield on navy) generated for every size.
- ✅ Plugins: camera, geolocation, push-notifications, haptics, keyboard, status-bar, splash-screen.
- ✅ Backend push is live (`firebase-admin` on the server); the app registers its FCM token via `registerPush()` → `POST /guard/me/device-token`.

## Rebuild after web changes
```bash
npm run mobile      # vite build + cap sync (handles the CocoaPods UTF-8 quirk)
# icons/splash: npm run assets
```
> Note: this Mac has Ruby 4.0 + CocoaPods, which needs a UTF-8 locale — the npm scripts set `LANG/LC_ALL` for you. If you run `cap sync` directly, prefix it: `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx cap sync`.

---

## Android → Google Play

1. `npm run cap:android` (opens Android Studio) → let Gradle sync.
   - Requires JDK 17–21. This machine has JDK 25 — set Android Studio to use its **bundled JDK** (Settings → Build Tools → Gradle → Gradle JDK).
2. **Version**: `android/app/build.gradle` → `versionCode` (integer, bump every upload) + `versionName` (e.g. `"1.0.0"`).
3. **Signing key** (once): `keytool -genkey -v -keystore cguardpro.keystore -alias cguardpro -keyalg RSA -keysize 2048 -validity 10000` — keep it safe; you need it for every update.
4. Build → **Generate Signed Bundle / APK → Android App Bundle (.aab)**, sign with the keystore.
5. [Google Play Console](https://play.google.com/console) → create app → upload the `.aab` to Internal testing first, then Production. Fill store listing, content rating, data-safety, screenshots.

## iOS → App Store

1. `npm run cap:ios` (opens Xcode workspace `ios/App/App.xcworkspace`).
2. **Signing**: select the `App` target → Signing & Capabilities → set your **Team** (needs an Apple Developer account, $99/yr). Bundle id `com.cguardpro.operaciones`.
3. **Add the Firebase config to the bundle** (one-time): drag `ios/App/App/GoogleService-Info.plist` into the **App** target in Xcode (check "App" under Target Membership). *(It's on disk; it just needs to be referenced by the target.)*
4. **Push capability**: Signing & Capabilities → **+ Capability → Push Notifications**, and **+ Capability → Background Modes → Remote notifications**. (`App.entitlements` with `aps-environment` is already created.)
5. **Version**: target → General → Version (e.g. `1.0.0`) + Build (bump each upload).
6. Product → **Archive** → Distribute App → App Store Connect → Upload.
7. [App Store Connect](https://appstoreconnect.apple.com) → create the app, attach the build, fill metadata + screenshots, submit for review.

### iOS push needs APNs in Firebase (one-time)
For FCM to deliver on iOS, upload your **APNs Auth Key** to Firebase:
- Apple Developer → Certificates, Identifiers & Profiles → **Keys** → create an **APNs** key (.p8), note the **Key ID** + your **Team ID**.
- Firebase Console → project `cguardpro-worker-app` → Project settings → **Cloud Messaging** → Apple app config → **Upload the APNs auth key** (.p8 + Key ID + Team ID).
Android needs nothing extra (FCM via `google-services.json`).

---

## End-to-end push test
1. Build + run on a real device (or emulator with Google Play services).
2. Sign in as a guard → the app calls `registerPush()` → token saved via `/guard/me/device-token`.
3. Start a patrol (or have the guard complete one) → backend sends FCM → 🔔 on the device.
(In-app notifications already work everywhere, including the dev browser, via the **Avisos** tab.)

## Store assets you'll still need to produce
- Screenshots per device class, feature graphic (Android), privacy policy URL, app description (ES/EN).
- The generated icon/splash are functional brand placeholders — swap `assets/icon.png` (1024²) + `assets/splash.png` (2732²) and run `npm run assets` for a final designed icon.
