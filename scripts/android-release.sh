#!/usr/bin/env bash
# Builds the Android release app. GitHub Actions and F-Droid both run it, so their builds are the same.
#
#   scripts/android-release.sh install   installs the packages without their install scripts, so Electron is not downloaded
#   scripts/android-release.sh build     builds the pages and the unsigned release app
#   scripts/android-release.sh sign      signs it into release/FraiTube-<version>.apk
#
# sign takes the key from FRAITUBE_KEYSTORE_FILE, FRAITUBE_KEYSTORE_PASSWORD, FRAITUBE_KEY_ALIAS and
# FRAITUBE_KEY_PASSWORD, and signs with apksigner from the Android build-tools version in package.json.
set -euo pipefail

root="$(dirname "$(dirname "$(realpath "$0")")")"
unsigned="$root/android/app/build/outputs/apk/release/app-release-unsigned.apk"

package_value() {
  node -p "require(process.argv[1])$1" "$root/package.json"
}

case "${1:-}" in
  install)
    pnpm --dir "$root" install --frozen-lockfile --ignore-scripts
    ;;
  build)
    pnpm --dir "$root" --filter @fraitube/android-web build
    "$root/android/gradlew" -p "$root/android" assembleRelease
    ;;
  sign)
    version="$(package_value .version)"
    apksigner="${ANDROID_HOME:?ANDROID_HOME is not set}/build-tools/$(package_value .androidBuild.buildTools)/apksigner"    mkdir -p "$root/release"
    signed="$root/release/FraiTube-$version.apk"
    "$apksigner" sign \
      --ks "${FRAITUBE_KEYSTORE_FILE:?FRAITUBE_KEYSTORE_FILE is not set}" \
      --ks-pass env:FRAITUBE_KEYSTORE_PASSWORD \
      --ks-key-alias "${FRAITUBE_KEY_ALIAS:?FRAITUBE_KEY_ALIAS is not set}" \
      --key-pass env:FRAITUBE_KEY_PASSWORD \
      --out "$signed" "$unsigned"
    "$apksigner" verify "$signed"
    echo "$signed"
    ;;
  *)
    echo "Usage: scripts/android-release.sh install|build|sign" >&2
    exit 1
    ;;
esac
