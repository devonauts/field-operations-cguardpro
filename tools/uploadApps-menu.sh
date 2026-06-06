#!/usr/bin/env bash
# Interactive launcher for CGuardPro store builds. Invoked by the `uploadApps` shell function,
# which has already sourced ~/.config/cguardpro/env and cd'd into the worker-app folder.
set -uo pipefail

APP="${1:-cguardpro}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

G=$'\033[32m'; Y=$'\033[33m'; R=$'\033[31m'; B=$'\033[34m'; DIM=$'\033[2m'; X=$'\033[0m'
hr() { printf '%s\n' "────────────────────────────────────────────────────────"; }

doctor() {
  echo "${B}Readiness for ${APP}${X}"
  hr
  # env vars
  for v in CGUARDPRO_TEAM_ID ASC_KEY_ID ASC_ISSUER_ID CGUARDPRO_KEYSTORE_PASS; do
    if [ -n "${!v:-}" ]; then printf "  ${G}✓${X} %s\n" "$v"; else printf "  ${R}✗${X} %s (not set)\n" "$v"; fi
  done
  # p8
  if [ -f ~/.appstoreconnect/private_keys/AuthKey.p8 ]; then
    printf "  ${G}✓${X} App Store Connect key (~/.appstoreconnect/private_keys/AuthKey.p8)\n"
  else printf "  ${R}✗${X} App Store Connect .p8 missing\n"; fi
  # custom app icon
  if [ -f "$ROOT/app-icons/icon.png" ]; then
    local dim; dim=$(sips -g pixelWidth -g pixelHeight "$ROOT/app-icons/icon.png" 2>/dev/null | awk '/pixel/{printf $2" "}')
    printf "  ${G}✓${X} app icon (app-icons/icon.png — ${dim}px)\n"
  else printf "  ${Y}•${X} no app-icons/icon.png (using default icon)\n"; fi
  # android device
  local dev; dev=$(adb devices 2>/dev/null | sed -n '2p' | grep -c "device$" || true)
  if [ "${dev:-0}" -ge 1 ]; then printf "  ${G}✓${X} Android device connected\n"
  else printf "  ${Y}•${X} no Android device (only needed for Install)\n"; fi
  # firebase match
  python3 - "$ROOT" <<'PY'
import json,plistlib,sys
root=sys.argv[1]; bid="com.cguardpro.operaciones"
try:
    d=json.load(open(f"{root}/android/app/google-services.json"))
    pk=[c['client_info']['android_client_info']['package_name'] for c in d['client']]
    print(("  \033[32m✓\033[0m" if bid in pk else "  \033[31m✗\033[0m")+f" Firebase Android config ({pk})")
except Exception as e: print("  \033[33m•\033[0m android google-services.json:",e)
try:
    b=plistlib.load(open(f"{root}/ios/App/App/GoogleService-Info.plist","rb")).get("BUNDLE_ID")
    print(("  \033[32m✓\033[0m" if b==bid else "  \033[31m✗\033[0m")+f" Firebase iOS config ({b})")
except Exception as e: print("  \033[33m•\033[0m ios GoogleService-Info.plist:",e)
PY
  hr
}

menu() {
  clear 2>/dev/null || true
  cat <<EOF
${B}╔══════════════════════════════════════════════════════╗
║            CGuardPro — App Deploy Console            ║
╚══════════════════════════════════════════════════════╝${X}
  app: ${G}${APP}${X}   dir: ${DIM}${ROOT}${X}

  ${G}1${X})  Install on Android device      ${DIM}(debug APK → adb install)${X}
  ${G}2${X})  Build Android .aab             ${DIM}(signed → Google Play)${X}
  ${G}3${X})  Build + upload iOS             ${DIM}(App Store Connect + metadata)${X}
  ${G}4${X})  Doctor — check readiness
  ${G}5${X})  Open a shell here              ${DIM}(pyBuild / Install on PATH)${X}
  ${G}q${X})  Quit
EOF
}

run() { echo; "$@"; echo; printf "${DIM}— press Enter to return to the menu —${X}"; read -r _; }

while true; do
  menu
  printf "\n  choose: "
  read -r choice
  case "$choice" in
    1) run ./Install "$APP" ;;
    2) run ./pyBuild android "$APP" ;;
    3) run ./pyBuild ios "$APP" ;;
    4) clear 2>/dev/null||true; doctor; printf "${DIM}— press Enter —${X}"; read -r _ ;;
    5) echo "${DIM}Dropping into a shell in $ROOT. Type 'exit' to come back.${X}"
       "${SHELL:-/bin/zsh}" ;;
    q|Q|"") echo "bye 👋"; break ;;
    *) ;;
  esac
done
