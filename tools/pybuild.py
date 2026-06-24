#!/usr/bin/env python3
"""
CGuardPro build/deploy CLI.

Commands (via the `pyBuild` / `Install` wrappers, or `python3 tools/pybuild.py <cmd>`):

    Install <app>            Build a debug APK and install it on the connected Android device (adb).
    pyBuild android <app>    Build a signed Android App Bundle (.aab) for Google Play upload.
    pyBuild ios <app>        Archive, export, upload the iOS build to App Store Connect, and
                             push the localized metadata (AI-written) for review.
    pyBuild version          Show the current version / build (e.g. 2.0.0 · build 3).
    pyBuild version set 2.1.0  Set the marketing version (resets the build counter to 0).
    pyBuild version bump     Manually bump the build number.

Versioning: `version.json` (worker-app root) holds `marketing` (MAJOR.MINOR.PATCH) and a
monotonic `build` integer. Every `android`/`ios` build auto-increments the build and stamps it
into the native projects, giving release tags that climb 2.0.0.1 → 2.0.0.2 → … (pass
`--no-bump` to re-build the same number).

`<app>` is a key in pybuild.config.json (e.g. `cguardpro`). It is optional when only one app
is configured.

Everything is driven by ./pybuild.config.json next to the worker-app root. Secrets (keystore
passwords, App Store Connect key) are read from that config or from environment variables
referenced as "ENV:VAR_NAME".
"""
from __future__ import annotations

import argparse
import glob
import json
import os
import plistlib
import re
import shutil
import subprocess
import sys
import time

# ----------------------------------------------------------------------------- paths / colors
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # worker-app/
CONFIG_PATH = os.path.join(ROOT, "pybuild.config.json")


class C:
    G = "\033[32m"; Y = "\033[33m"; R = "\033[31m"; B = "\033[34m"; DIM = "\033[2m"; X = "\033[0m"


def info(m): print(f"{C.B}▸{C.X} {m}")
def ok(m):   print(f"{C.G}✓{C.X} {m}")
def warn(m): print(f"{C.Y}!{C.X} {m}")
def die(m):
    print(f"{C.R}✗ {m}{C.X}")
    sys.exit(1)


# ----------------------------------------------------------------------------- config
def load_dotenv():
    """Load worker-app/.env into the environment so `ENV:` secrets resolve without
    the user having to `export` them by hand. Real environment variables win, so
    a value already set in the shell overrides the .env file."""
    path = os.path.join(ROOT, ".env")
    if not os.path.exists(path):
        return
    loaded = []
    with open(path) as f:
        for raw in f:
            line = raw.strip()
            if not line or line.startswith("#"):
                continue
            if line.startswith("export "):
                line = line[len("export "):].lstrip()
            if "=" not in line:
                continue
            key, val = line.split("=", 1)
            key = key.strip()
            val = val.strip().strip('"').strip("'")
            if key and key not in os.environ:
                os.environ[key] = val
                loaded.append(key)
    if loaded:
        info(f"loaded {len(loaded)} var(s) from .env")


def load_config() -> dict:
    if not os.path.exists(CONFIG_PATH):
        die(f"missing {CONFIG_PATH} — create it (see tools/README.md).")
    with open(CONFIG_PATH) as f:
        return json.load(f)


def resolve_secret(value: str | None) -> str | None:
    """Allow "ENV:VAR" indirection so secrets never have to live in the JSON."""
    if value is None:
        return None
    if isinstance(value, str) and value.startswith("ENV:"):
        return os.environ.get(value[4:], "")
    return value


def pick_app(cfg: dict, name: str | None) -> tuple[str, dict]:
    apps = cfg.get("apps", {})
    if not apps:
        die("no apps defined in pybuild.config.json")
    if name is None:
        if len(apps) == 1:
            name = next(iter(apps))
        else:
            die(f"multiple apps configured — specify one of: {', '.join(apps)}")
    if name not in apps:
        die(f"unknown app '{name}'. configured: {', '.join(apps)}")
    return name, apps[name]


def app_dir(app: dict) -> str:
    return os.path.abspath(os.path.join(ROOT, app.get("dir", ".")))


# ----------------------------------------------------------------------------- versioning
# Single source of truth: version.json at the worker-app root.
#   marketing : MAJOR.MINOR.PATCH — the user-facing release (e.g. "2.0.0").
#   build     : a monotonic integer that bumps on every store build.
# The release tag we report is "<marketing>.<build>" (e.g. 2.0.0.1), and it
# climbs 2.0.0.1 → 2.0.0.2 → … as you ship. The native build identifiers are
# kept valid for each store: Android versionCode = build (integer), iOS
# CFBundleVersion = build (App Store requires ≤3 period-separated integers, so
# the 4-part tag can't go there verbatim — App Store Connect shows "2.0.0 (1)").
VERSION_PATH = os.path.join(ROOT, "version.json")
DEFAULT_VERSION = {"marketing": "2.0.0", "build": 0}


def _normalize_marketing(s: str) -> str:
    """Coerce to MAJOR.MINOR.PATCH (both stores require ≤3 integers)."""
    parts = [p for p in re.split(r"[.\s]+", str(s).strip()) if p != ""]
    nums = [str(int(p)) if p.isdigit() else "0" for p in parts[:3]]
    while len(nums) < 3:
        nums.append("0")
    return ".".join(nums)


def read_version() -> dict:
    if os.path.exists(VERSION_PATH):
        try:
            v = json.load(open(VERSION_PATH))
            return {"marketing": _normalize_marketing(v.get("marketing", "2.0.0")),
                    "build": int(v.get("build", 0))}
        except Exception:
            warn("version.json unreadable — using defaults.")
    return dict(DEFAULT_VERSION)


def write_version(v: dict):
    with open(VERSION_PATH, "w") as f:
        json.dump({"marketing": v["marketing"], "build": int(v["build"])}, f, indent=2)
        f.write("\n")


def apply_version(d: str, platform: str, bump: bool = True) -> str:
    """Bump the shared build number and stamp marketing + build into the native
       project for `platform`. Returns the release tag "<marketing>.<build>"."""
    v = read_version()
    v["marketing"] = _normalize_marketing(v["marketing"])
    if bump:
        v["build"] = int(v["build"]) + 1
        write_version(v)
    marketing, build = v["marketing"], int(v["build"])
    tag = f"{marketing}.{build}"

    if platform == "android":
        gradle = os.path.join(d, "android", "app", "build.gradle")
        txt = open(gradle).read()
        txt = re.sub(r"versionCode\s+\d+", f"versionCode {build}", txt, count=1)
        txt = re.sub(r'versionName\s+"[^"]*"', f'versionName "{marketing}"', txt, count=1)
        open(gradle, "w").write(txt)
    elif platform == "ios":
        pbx = os.path.join(d, "ios", "App", "App.xcodeproj", "project.pbxproj")
        txt = open(pbx).read()
        txt = re.sub(r"CURRENT_PROJECT_VERSION = [^;]+;",
                     f"CURRENT_PROJECT_VERSION = {build};", txt)
        txt = re.sub(r"MARKETING_VERSION = [^;]+;",
                     f"MARKETING_VERSION = {marketing};", txt)
        open(pbx, "w").write(txt)

    ok(f"version {marketing} · build {build}   →   {tag}")
    return tag


def cmd_version(action: str | None, value: str | None):
    v = read_version()
    if action == "set" and value:
        v["marketing"] = _normalize_marketing(value)
        v["build"] = 0
        write_version(v)
        ok(f"marketing version set to {v['marketing']} (build reset to 0). "
           f"Next build → {v['marketing']}.1")
    elif action == "bump":
        v["build"] = int(v["build"]) + 1
        write_version(v)
        ok(f"build bumped → {v['marketing']}.{v['build']}")
    else:
        print(f"{C.G}{v['marketing']} · build {v['build']}   →   "
              f"{v['marketing']}.{v['build']}{C.X}")
        print(f"{C.DIM}next store build will be {v['marketing']}.{v['build'] + 1}{C.X}")


# ----------------------------------------------------------------------------- shell
def run(cmd, cwd=None, env=None, check=True, capture=False):
    """Run a command, streaming output. Returns stdout when capture=True."""
    printable = cmd if isinstance(cmd, str) else " ".join(cmd)
    print(f"{C.DIM}$ {printable}{C.X}")
    e = {**os.environ, **(env or {})}
    if capture:
        r = subprocess.run(cmd, cwd=cwd, env=e, shell=isinstance(cmd, str),
                           text=True, capture_output=True)
        if check and r.returncode != 0:
            sys.stdout.write(r.stdout); sys.stderr.write(r.stderr)
            die(f"command failed ({r.returncode}): {printable}")
        return r.stdout
    r = subprocess.run(cmd, cwd=cwd, env=e, shell=isinstance(cmd, str))
    if check and r.returncode != 0:
        die(f"command failed ({r.returncode}): {printable}")
    return r.returncode


def tool_exists(name: str) -> bool:
    return shutil.which(name) is not None


# ----------------------------------------------------------------------------- web build + cap sync
def jdk_env(cfg: dict) -> dict:
    """Force JAVA_HOME to a JDK 17 for the gradle/cap sync steps (AGP can't use JDK 25)."""
    jh = cfg.get("javaHome17")
    if not jh or not os.path.isdir(jh):
        # try the common temurin-17 location, else fall back to /usr/libexec/java_home
        guess = "/Library/Java/JavaVirtualMachines/temurin-17.jdk/Contents/Home"
        if os.path.isdir(guess):
            jh = guess
        else:
            try:
                jh = subprocess.check_output(["/usr/libexec/java_home", "-v", "17"],
                                             text=True).strip()
            except Exception:
                jh = None
    if not jh:
        warn("no JDK 17 found — gradle may fail under newer JDKs. Set javaHome17 in config.")
        return {}
    return {"JAVA_HOME": jh, "PATH": f"{jh}/bin:" + os.environ.get("PATH", "")}


def utf8_env() -> dict:
    # CocoaPods under Ruby 3.4+/4.0 needs a UTF-8 locale or `cap sync` chokes.
    return {"LANG": "en_US.UTF-8", "LC_ALL": "en_US.UTF-8"}


def build_web(d: str):
    info("Building web bundle (vite)…")
    npm = "npm.cmd" if os.name == "nt" else "npm"
    run([npm, "run", "build"], cwd=d)
    ok("web bundle built → dist/")


def cap_sync(d: str, platform: str, cfg: dict):
    info(f"Syncing Capacitor → {platform}…")
    env = {**utf8_env()}
    if platform == "android":
        env.update(jdk_env(cfg))
    npx = "npx.cmd" if os.name == "nt" else "npx"
    run([npx, "cap", "sync", platform], cwd=d, env=env)
    ok(f"cap sync {platform} done")


def regenerate_icons(d: str):
    """If the user dropped a custom icon in app-icons/, regenerate every native icon + splash
    (and the store/launcher icon embedded in the build). No-op if app-icons/icon.png is absent."""
    src = os.path.join(d, "app-icons")
    icon = os.path.join(src, "icon.png")
    if not os.path.exists(icon):
        info("No app-icons/icon.png — keeping the current icons. "
             "(Drop a 1024×1024 icon.png in app-icons/ to use your own.)")
        return
    info("Custom icon found in app-icons/ — regenerating all native icons + splash…")
    assets = os.path.join(d, "assets")
    os.makedirs(assets, exist_ok=True)
    provided = []
    for fn in ("icon.png", "icon-foreground.png", "icon-background.png",
               "splash.png", "splash-dark.png"):
        s = os.path.join(src, fn)
        if os.path.exists(s):
            shutil.copy2(s, os.path.join(assets, fn))
            provided.append(fn)
    # If no separate Android adaptive foreground was supplied, use the icon for it too.
    if "icon-foreground.png" not in provided:
        shutil.copy2(icon, os.path.join(assets, "icon-foreground.png"))
    cab = os.path.join(d, "node_modules", ".bin", "capacitor-assets")
    if not os.path.exists(cab):
        warn("@capacitor/assets not installed — run `npm i`. Skipping icon regeneration.")
        return
    run([cab, "generate",
         "--iconBackgroundColor", "#0A0E16", "--iconBackgroundColorDark", "#0A0E16",
         "--splashBackgroundColor", "#0A0E16", "--splashBackgroundColorDark", "#0A0E16"],
        cwd=d)
    # Emit a 512px Play Store *listing* icon (this one is uploaded by hand in Play Console,
    # it is not part of the .aab) plus a 1024 master.
    if tool_exists("sips"):
        out = os.path.join(d, "build-output")
        os.makedirs(out, exist_ok=True)
        for size, name in ((512, "play-store-icon-512.png"), (1024, "store-icon-1024.png")):
            run(["sips", "-z", str(size), str(size), icon,
                 "--out", os.path.join(out, name)], check=False, capture=True)
        ok("listing icon → build-output/play-store-icon-512.png (upload in Play Console)")
    ok("native icons + splash regenerated from app-icons/")


def warn_firebase_mismatch(d: str, bundle_id: str, platform: str):
    """Push only works when the Firebase config's package matches the bundle id."""
    if platform == "android":
        p = os.path.join(d, "android/app/google-services.json")
        if not os.path.exists(p):
            return
        try:
            data = json.load(open(p))
            pkgs = [c["client_info"]["android_client_info"]["package_name"]
                    for c in data.get("client", [])]
            if bundle_id not in pkgs:
                warn(f"google-services.json is for {pkgs} but bundle id is {bundle_id}. "
                     f"Push (FCM) will NOT work until you add {bundle_id} in Firebase and "
                     f"replace android/app/google-services.json.")
        except Exception:
            pass
    else:
        p = os.path.join(d, "ios/App/App/GoogleService-Info.plist")
        if not os.path.exists(p):
            return
        try:
            with open(p, "rb") as f:
                pl = plistlib.load(f)
            bid = pl.get("BUNDLE_ID")
            if bid != bundle_id:
                warn(f"GoogleService-Info.plist is for {bid} but bundle id is {bundle_id}. "
                     f"Push (FCM) will NOT work until you add {bundle_id} in Firebase and "
                     f"replace ios/App/App/GoogleService-Info.plist.")
        except Exception:
            pass


# ============================================================================= Install (android debug)
def cmd_install(cfg: dict, app_name: str | None):
    name, app = pick_app(cfg, app_name)
    d = app_dir(app)
    bundle_id = app.get("bundleId", "")
    adb = resolve_secret(cfg.get("adb")) or "adb"
    if not (tool_exists(adb) or os.path.exists(adb)):
        die("adb not found. Install Android platform-tools (brew install android-platform-tools).")

    info(f"Install '{name}' ({bundle_id}) on a connected device")
    devices = run([adb, "devices"], capture=True)
    lines = [l for l in devices.splitlines()[1:] if l.strip() and "\tdevice" in l]
    if not lines:
        die("no Android device detected. Plug in a device with USB debugging enabled "
            "(Settings → Developer options → USB debugging) and accept the prompt.")
    ok(f"device: {lines[0].split(chr(9))[0]}")

    build_web(d)
    regenerate_icons(d)
    cap_sync(d, "android", cfg)
    warn_firebase_mismatch(d, bundle_id, "android")

    android = os.path.join(d, "android")
    info("Building debug APK (gradle assembleDebug)…")
    run(["./gradlew", "assembleDebug", "--console=plain"], cwd=android, env=jdk_env(cfg))
    apks = glob.glob(os.path.join(android, "app/build/outputs/apk/debug/*.apk"))
    if not apks:
        die("no APK produced.")
    apk = max(apks, key=os.path.getmtime)
    ok(f"APK → {os.path.relpath(apk, d)}")

    info("Installing on device (adb install -r)…")
    run([adb, "install", "-r", apk])
    # launch it
    run([adb, "shell", "monkey", "-p", bundle_id, "-c",
         "android.intent.category.LAUNCHER", "1"], check=False)
    ok(f"Installed and launched {bundle_id} 🎉")


# ============================================================================= pyBuild android (.aab)
SIGNING_MARKER = "// pybuild:signing"
SIGNING_BLOCK = '''
%s
    signingConfigs {
        release {
            def kf = System.getenv("PYBUILD_KEYSTORE") ?: project.findProperty("PYBUILD_KEYSTORE")
            if (kf) {
                storeFile file(kf)
                storePassword System.getenv("PYBUILD_KEYSTORE_PASS") ?: project.findProperty("PYBUILD_KEYSTORE_PASS")
                keyAlias System.getenv("PYBUILD_KEY_ALIAS") ?: project.findProperty("PYBUILD_KEY_ALIAS")
                keyPassword System.getenv("PYBUILD_KEY_PASS") ?: project.findProperty("PYBUILD_KEY_PASS")
            }
        }
    }
''' % SIGNING_MARKER


def ensure_signing_block(build_gradle: str):
    """Idempotently inject a release signingConfig + wire it into buildTypes.release."""
    with open(build_gradle) as f:
        txt = f.read()
    changed = False
    if SIGNING_MARKER not in txt:
        # insert the signingConfigs block right after `android {`
        idx = txt.index("android {") + len("android {")
        txt = txt[:idx] + "\n" + SIGNING_BLOCK + txt[idx:]
        changed = True
    if "signingConfig signingConfigs.release" not in txt:
        # wire it into buildTypes.release { ... }
        anchor = "buildTypes {"
        i = txt.index(anchor) + len(anchor)
        # find the release { after buildTypes {
        rel = txt.index("release {", i) + len("release {")
        txt = txt[:rel] + "\n            signingConfig signingConfigs.release" + txt[rel:]
        changed = True
    if changed:
        with open(build_gradle, "w") as f:
            f.write(txt)
        ok("patched android/app/build.gradle with a release signingConfig")


def ensure_keystore(d: str, app: dict) -> dict:
    """Create a release keystore if missing. Returns env vars for gradle signing."""
    ks_cfg = app.get("android", {})
    ks_path = os.path.join(d, ks_cfg.get("keystore", "android/cguardpro-release.keystore"))
    store_pass = resolve_secret(ks_cfg.get("keystorePassword")) or ""
    key_alias = ks_cfg.get("keyAlias", "cguardpro")
    key_pass = resolve_secret(ks_cfg.get("keyPassword")) or store_pass

    if not os.path.exists(ks_path):
        if not store_pass:
            die("no keystore and no keystorePassword in config. Set android.keystorePassword "
                "(or ENV:VAR) so I can create the signing keystore, or point android.keystore "
                "at your existing .keystore/.jks.")
        warn(f"no keystore at {os.path.relpath(ks_path, d)} — generating a new one.")
        warn("⚠️  BACK THIS FILE UP. Lose it and you can never update the app on Play.")
        dn = ks_cfg.get("dname", "CN=CGuardPro, O=CGuardPro, C=EC")
        run(["keytool", "-genkeypair", "-v",
             "-keystore", ks_path, "-alias", key_alias,
             "-keyalg", "RSA", "-keysize", "2048", "-validity", "10000",
             "-storepass", store_pass, "-keypass", key_pass, "-dname", dn])
        ok(f"keystore created → {os.path.relpath(ks_path, d)}")
    return {
        "PYBUILD_KEYSTORE": os.path.abspath(ks_path),
        "PYBUILD_KEYSTORE_PASS": store_pass,
        "PYBUILD_KEY_ALIAS": key_alias,
        "PYBUILD_KEY_PASS": key_pass,
    }


def cmd_android(cfg: dict, app_name: str | None, bump: bool = True):
    name, app = pick_app(cfg, app_name)
    d = app_dir(app)
    bundle_id = app.get("bundleId", "")
    info(f"Build signed AAB for '{name}' ({bundle_id})")

    apply_version(d, "android", bump=bump)
    build_web(d)
    regenerate_icons(d)
    cap_sync(d, "android", cfg)
    warn_firebase_mismatch(d, bundle_id, "android")

    android = os.path.join(d, "android")
    ensure_signing_block(os.path.join(android, "app/build.gradle"))
    sign_env = {**jdk_env(cfg), **ensure_keystore(d, app)}

    info("Building release bundle (gradle bundleRelease)…")
    run(["./gradlew", "bundleRelease", "--console=plain"], cwd=android, env=sign_env)
    aabs = glob.glob(os.path.join(android, "app/build/outputs/bundle/release/*.aab"))
    if not aabs:
        die("no .aab produced.")
    aab = max(aabs, key=os.path.getmtime)

    out_dir = os.path.join(d, "build-output")
    os.makedirs(out_dir, exist_ok=True)
    dest = os.path.join(out_dir, f"{name}-release.aab")
    shutil.copy2(aab, dest)
    ok(f"AAB ready → {os.path.relpath(dest, ROOT)}")
    print(f"\n{C.G}Upload this file to Play Console → your app → Production → Create new release.{C.X}")


# ============================================================================= pyBuild ios
def ensure_altool_key(key_path: str, key_id: str) -> str:
    """`xcrun altool --apiKey <ID>` doesn't take a path — it searches its private-keys
    dirs for a file named `AuthKey_<ID>.p8`. The configured key may be a generic
    `AuthKey.p8`, so copy it to the expected name and return the dir to point altool at
    via API_PRIVATE_KEYS_DIR. Without this, the upload fails with 'API key not found'."""
    priv_dir = os.path.expanduser("~/.appstoreconnect/private_keys")
    os.makedirs(priv_dir, exist_ok=True)
    expected = os.path.join(priv_dir, f"AuthKey_{key_id}.p8")
    if not os.path.exists(expected):
        shutil.copy2(key_path, expected)
        ok(f"prepared App Store Connect key for altool → {os.path.basename(expected)}")
    return priv_dir


def export_options_plist(d: str, team_id: str) -> str:
    path = os.path.join(d, "ios", "ExportOptions.plist")
    data = {
        "method": "app-store-connect",
        "teamID": team_id,
        "uploadSymbols": True,
        "signingStyle": "automatic",
        "destination": "export",
    }
    with open(path, "wb") as f:
        plistlib.dump(data, f)
    return path


def cmd_ios(cfg: dict, app_name: str | None, bump: bool = True):
    name, app = pick_app(cfg, app_name)
    d = app_dir(app)
    bundle_id = app.get("bundleId", "")
    ios_cfg = app.get("ios", {})
    team_id = resolve_secret(ios_cfg.get("teamId"))
    key_id = resolve_secret(ios_cfg.get("ascApiKeyId"))
    issuer_id = resolve_secret(ios_cfg.get("ascApiIssuerId"))
    key_path = os.path.expanduser(resolve_secret(ios_cfg.get("ascApiKeyPath")) or "")

    if sys.platform != "darwin":
        die("iOS builds require macOS + Xcode.")
    if not tool_exists("xcodebuild"):
        die("xcodebuild not found. Install Xcode and run: sudo xcode-select -s /Applications/Xcode.app")
    for label, val in [("ios.teamId", team_id), ("ios.ascApiKeyId", key_id),
                       ("ios.ascApiIssuerId", issuer_id), ("ios.ascApiKeyPath", key_path)]:
        if not val:
            die(f"missing {label} in pybuild.config.json (needed to sign + upload to App Store Connect).")
    if not os.path.exists(key_path):
        die(f"App Store Connect key not found at {key_path}")

    info(f"Build + upload iOS '{name}' ({bundle_id}) to App Store Connect")
    apply_version(d, "ios", bump=bump)
    build_web(d)
    regenerate_icons(d)
    cap_sync(d, "ios", cfg)
    warn_firebase_mismatch(d, bundle_id, "ios")

    ios = os.path.join(d, "ios")
    ws = os.path.join(ios, "App", "App.xcworkspace")
    out = os.path.join(d, "build-output")
    os.makedirs(out, exist_ok=True)
    archive = os.path.join(out, f"{name}.xcarchive")
    env = utf8_env()

    # Hand the App Store Connect API key to xcodebuild so `-allowProvisioningUpdates`
    # can create/download the iOS Distribution cert + provisioning profile via Apple's
    # cloud (no Xcode account or local cert needed). Without this xcodebuild fails with
    # "No Accounts" / "No signing certificate iOS Distribution found".
    auth = ["-authenticationKeyPath", key_path,
            "-authenticationKeyID", key_id,
            "-authenticationKeyIssuerID", issuer_id]

    info("Archiving (xcodebuild archive, automatic signing)…")
    run(["xcodebuild", "-workspace", ws, "-scheme", "App",
         "-configuration", "Release", "-archivePath", archive,
         "-allowProvisioningUpdates", *auth,
         f"DEVELOPMENT_TEAM={team_id}", "archive"], cwd=ios, env=env)
    ok("archive created")

    info("Exporting .ipa (app-store-connect)…")
    opts = export_options_plist(d, team_id)
    run(["xcodebuild", "-exportArchive", "-archivePath", archive,
         "-exportPath", out, "-exportOptionsPlist", opts,
         "-allowProvisioningUpdates", *auth], cwd=ios, env=env)
    ipas = glob.glob(os.path.join(out, "*.ipa"))
    if not ipas:
        die("no .ipa exported.")
    ipa = max(ipas, key=os.path.getmtime)
    ok(f"ipa → {os.path.relpath(ipa, d)}")

    info("Uploading binary to App Store Connect (altool)…")
    priv_dir = ensure_altool_key(key_path, key_id)
    run(["xcrun", "altool", "--upload-app", "-f", ipa, "--type", "ios",
         "--apiKey", key_id, "--apiIssuer", issuer_id],
        env={**env, "API_PRIVATE_KEYS_DIR": priv_dir})
    ok("binary uploaded — it will appear in App Store Connect after processing (~5–30 min).")

    # ---- metadata via App Store Connect API ----
    try:
        push_app_info(d, bundle_id, key_id, issuer_id, key_path)
        push_metadata(d, bundle_id, key_id, issuer_id, key_path)
    except Exception as e:
        warn(f"metadata push skipped: {e}")
        warn("You can set the description/keywords manually in App Store Connect, "
             "or re-run after the build finishes processing.")
    print(f"\n{C.G}Done. Open App Store Connect → {name} → submit for review once the build "
          f"finishes processing.{C.X}")


# ----------------------------------------------------------------------------- App Store Connect metadata API
ASC_BASE = "https://api.appstoreconnect.apple.com/v1"


def asc_token(key_id: str, issuer_id: str, key_path: str) -> str:
    import jwt  # pyjwt
    with open(key_path) as f:
        private_key = f.read()
    now = int(time.time())
    payload = {"iss": issuer_id, "iat": now, "exp": now + 1200, "aud": "appstoreconnect-v1"}
    return jwt.encode(payload, private_key, algorithm="ES256",
                      headers={"kid": key_id, "typ": "JWT"})


def _editable_appinfo_state(s: str) -> bool:
    return s in ("PREPARE_FOR_SUBMISSION", "DEVELOPER_REJECTED", "REJECTED",
                 "METADATA_REJECTED")


def push_app_info(d: str, bundle_id: str, key_id: str, issuer_id: str, key_path: str):
    """Push APP-LEVEL listing fields that live on appInfo (not on the version):
       app name, subtitle, privacy policy URL, and primary/secondary category.
       These are what actually become the App Store title and the privacy link."""
    import requests
    meta_path = os.path.join(d, "store-metadata", "metadata.json")
    if not os.path.exists(meta_path):
        return
    meta = json.load(open(meta_path))
    token = asc_token(key_id, issuer_id, key_path)
    H = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    r = requests.get(f"{ASC_BASE}/apps", headers=H,
                     params={"filter[bundleId]": bundle_id, "limit": 1})
    r.raise_for_status()
    apps = r.json().get("data", [])
    if not apps:
        return
    app_id = apps[0]["id"]

    # Pick the editable appInfo (the one being prepared for submission).
    r = requests.get(f"{ASC_BASE}/apps/{app_id}/appInfos", headers=H, params={"limit": 10})
    r.raise_for_status()
    infos = r.json().get("data", [])
    editable = [v for v in infos
                if _editable_appinfo_state(v["attributes"].get("appStoreState", ""))]
    if not editable:
        warn("no editable appInfo (need a version in PREPARE_FOR_SUBMISSION) — "
             "app title/privacy not pushed yet.")
        return
    info_id = editable[0]["id"]

    info("Pushing app title / subtitle / privacy policy…")

    # Categories (appInfo relationships → appCategories, IDs are like 'BUSINESS').
    cats = {}
    if meta.get("categoryPrimary"):
        cats["primaryCategory"] = {"data": {"type": "appCategories",
                                            "id": meta["categoryPrimary"]}}
    if meta.get("categorySecondary"):
        cats["secondaryCategory"] = {"data": {"type": "appCategories",
                                              "id": meta["categorySecondary"]}}
    if cats:
        body = {"data": {"type": "appInfos", "id": info_id, "relationships": cats}}
        rr = requests.patch(f"{ASC_BASE}/appInfos/{info_id}",
                            headers=H, data=json.dumps(body))
        if rr.status_code == 200:
            ok("categories")
        else:
            warn(f"categories failed ({rr.status_code}): {rr.text[:160]}")

    # Per-locale name / subtitle / privacy policy URL.
    r = requests.get(f"{ASC_BASE}/appInfos/{info_id}/appInfoLocalizations",
                     headers=H, params={"limit": 50})
    r.raise_for_status()
    existing = {loc["attributes"]["locale"]: loc["id"] for loc in r.json().get("data", [])}

    for locale, fields in meta.get("locales", {}).items():
        attrs = {
            "name": fields.get("name"),
            "subtitle": fields.get("subtitle"),
            "privacyPolicyUrl": meta.get("privacyPolicyUrl"),
        }
        attrs = {k: v for k, v in attrs.items() if v}
        if not attrs:
            continue
        if locale in existing:
            body = {"data": {"type": "appInfoLocalizations",
                             "id": existing[locale], "attributes": attrs}}
            rr = requests.patch(f"{ASC_BASE}/appInfoLocalizations/{existing[locale]}",
                                headers=H, data=json.dumps(body))
        else:
            body = {"data": {"type": "appInfoLocalizations",
                             "attributes": {"locale": locale, **attrs},
                             "relationships": {"appInfo": {
                                 "data": {"type": "appInfos", "id": info_id}}}}}
            rr = requests.post(f"{ASC_BASE}/appInfoLocalizations",
                               headers=H, data=json.dumps(body))
        if rr.status_code in (200, 201):
            ok(f"app info: {locale}")
        else:
            warn(f"app info {locale} failed ({rr.status_code}): {rr.text[:200]}")


def push_metadata(d: str, bundle_id: str, key_id: str, issuer_id: str, key_path: str):
    import requests
    meta_path = os.path.join(d, "store-metadata", "metadata.json")
    if not os.path.exists(meta_path):
        warn("no store-metadata/metadata.json — skipping metadata push.")
        return
    meta = json.load(open(meta_path))
    token = asc_token(key_id, issuer_id, key_path)
    H = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    info("Pushing localized metadata to App Store Connect…")
    r = requests.get(f"{ASC_BASE}/apps", headers=H,
                     params={"filter[bundleId]": bundle_id, "limit": 1})
    r.raise_for_status()
    apps = r.json().get("data", [])
    if not apps:
        warn(f"no App Store Connect app found for {bundle_id}. Create the app record first "
             f"(App Store Connect → Apps → +), then re-run. Metadata not pushed.")
        return
    app_id = apps[0]["id"]

    # find the editable (PREPARE_FOR_SUBMISSION) version, else the newest
    r = requests.get(f"{ASC_BASE}/apps/{app_id}/appStoreVersions", headers=H,
                     params={"limit": 5})
    r.raise_for_status()
    versions = r.json().get("data", [])
    editable = [v for v in versions
                if v["attributes"].get("appStoreState") in
                ("PREPARE_FOR_SUBMISSION", "DEVELOPER_REJECTED", "REJECTED",
                 "METADATA_REJECTED")]
    if not editable:
        warn("no editable App Store version (need state PREPARE_FOR_SUBMISSION). "
             "If a version is WAITING_FOR_REVIEW its metadata is locked — remove it "
             "from review or create a new version, then re-run for metadata.")
        return
    version_id = editable[0]["id"]

    # localizations
    r = requests.get(f"{ASC_BASE}/appStoreVersions/{version_id}/appStoreVersionLocalizations",
                     headers=H, params={"limit": 50})
    r.raise_for_status()
    existing = {loc["attributes"]["locale"]: loc["id"] for loc in r.json().get("data", [])}

    for locale, fields in meta.get("locales", {}).items():
        # `whatsNew` (release notes) is locked until the build for this version has
        # finished processing and is attached — pushing it too early returns a 409
        # STATE_ERROR that would otherwise sink the whole localization. So push the
        # always-editable fields first, then try whatsNew on its own.
        attrs = {
            "description": fields.get("description"),
            "keywords": fields.get("keywords"),
            "promotionalText": fields.get("promotionalText"),
            "supportUrl": meta.get("supportUrl"),
            "marketingUrl": meta.get("marketingUrl"),
        }
        attrs = {k: v for k, v in attrs.items() if v}
        if locale in existing:
            loc_id = existing[locale]
            body = {"data": {"type": "appStoreVersionLocalizations",
                             "id": loc_id, "attributes": attrs}}
            rr = requests.patch(f"{ASC_BASE}/appStoreVersionLocalizations/{loc_id}",
                                headers=H, data=json.dumps(body))
        else:
            body = {"data": {"type": "appStoreVersionLocalizations",
                             "attributes": {"locale": locale, **attrs},
                             "relationships": {"appStoreVersion": {
                                 "data": {"type": "appStoreVersions", "id": version_id}}}}}
            rr = requests.post(f"{ASC_BASE}/appStoreVersionLocalizations",
                               headers=H, data=json.dumps(body))
            if rr.status_code in (200, 201):
                loc_id = rr.json()["data"]["id"]
        if rr.status_code in (200, 201):
            ok(f"metadata: {locale}")
        else:
            warn(f"metadata {locale} failed ({rr.status_code}): {rr.text[:200]}")
            continue

        whats_new = fields.get("releaseNotes")
        if not whats_new:
            continue
        wn = {"data": {"type": "appStoreVersionLocalizations",
                       "id": loc_id, "attributes": {"whatsNew": whats_new}}}
        wr = requests.patch(f"{ASC_BASE}/appStoreVersionLocalizations/{loc_id}",
                            headers=H, data=json.dumps(wn))
        if wr.status_code == 200:
            ok(f"release notes: {locale}")
        elif wr.status_code == 409 and "STATE_ERROR" in wr.text:
            warn(f"release notes {locale} deferred — the build is still processing. "
                 f"Re-run once it's attached, or set 'What's New' manually.")
        else:
            warn(f"release notes {locale} failed ({wr.status_code}): {wr.text[:200]}")


# ============================================================================= entry
def main():
    p = argparse.ArgumentParser(prog="pybuild", description="CGuardPro build/deploy CLI")
    sub = p.add_subparsers(dest="cmd", required=True)

    pi = sub.add_parser("install", help="build debug APK + install on connected Android device")
    pi.add_argument("app", nargs="?")

    pa = sub.add_parser("android", help="build signed .aab for Google Play")
    pa.add_argument("app", nargs="?")
    pa.add_argument("--no-bump", action="store_true",
                    help="reuse the current build number (don't increment)")

    po = sub.add_parser("ios", help="archive + upload to App Store Connect + metadata")
    po.add_argument("app", nargs="?")
    po.add_argument("--no-bump", action="store_true",
                    help="reuse the current build number (don't increment)")

    pv = sub.add_parser("version",
                        help="show / set the version (e.g. `version set 2.1.0`, `version bump`)")
    pv.add_argument("action", nargs="?", choices=["set", "bump"],
                    help="'set <x.y.z>' to set the marketing version, 'bump' to bump the build")
    pv.add_argument("value", nargs="?", help="the marketing version for 'set' (e.g. 2.1.0)")

    args = p.parse_args()
    load_dotenv()
    if args.cmd == "version":
        cmd_version(args.action, args.value)
        return
    cfg = load_config()
    if args.cmd == "install":
        cmd_install(cfg, args.app)
    elif args.cmd == "android":
        cmd_android(cfg, args.app, bump=not args.no_bump)
    elif args.cmd == "ios":
        cmd_ios(cfg, args.app, bump=not args.no_bump)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        die("interrupted")
