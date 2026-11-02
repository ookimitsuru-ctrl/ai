#!/usr/bin/env bash
# Build the Android APK: web single-file build → Gradle release build → dist-apk/AetherLance.apk
# Needs Node.js, JDK 17+, Gradle 8.7+ and the Android SDK (ANDROID_HOME, platform 34).
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
cd "$here/.."
[ -d node_modules ] || npm ci
npm run build:single
cd "$here"
if [ -z "${ANDROID_HOME:-}" ] && [ ! -f local.properties ]; then
  for d in /opt/android-sdk "$HOME/Android/Sdk" "$HOME/Library/Android/sdk"; do [ -d "$d" ] && export ANDROID_HOME="$d" && break; done
fi
gradle assembleRelease --no-daemon -q
mkdir -p "$here/../dist-apk"
cp app/build/outputs/apk/release/app-release.apk "$here/../dist-apk/AetherLance.apk"
echo "wrote dist-apk/AetherLance.apk ($(du -h "$here/../dist-apk/AetherLance.apk" | cut -f1))"
