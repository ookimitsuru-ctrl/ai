#!/usr/bin/env bash
# Build both Android APKs: web single-file builds → Gradle release builds →
#   dist-apk/AetherLance.apk (classic) and dist-apk/AetherLanceHD.apk (HD edition)
# Needs Node.js, JDK 17+, Gradle 8.7+ and the Android SDK (ANDROID_HOME, platform 34).
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
cd "$here/.."
[ -d node_modules ] || npm ci
npm run build:single
npm run build:single:hd
cd "$here"
if [ -z "${ANDROID_HOME:-}" ] && [ ! -f local.properties ]; then
  for d in /opt/android-sdk "$HOME/Android/Sdk" "$HOME/Library/Android/sdk"; do [ -d "$d" ] && export ANDROID_HOME="$d" && break; done
fi
gradle assembleClassicRelease assembleHdRelease --no-daemon -q
mkdir -p "$here/../dist-apk"
cp app/build/outputs/apk/classic/release/app-classic-release.apk "$here/../dist-apk/AetherLance.apk"
cp app/build/outputs/apk/hd/release/app-hd-release.apk "$here/../dist-apk/AetherLanceHD.apk"
for f in AetherLance AetherLanceHD; do echo "wrote dist-apk/$f.apk ($(du -h "$here/../dist-apk/$f.apk" | cut -f1))"; done
