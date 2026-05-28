#!/usr/bin/env bash
# Sources Keychain-stored keystore password into env so gradle can read it.
# PKCS12 (modern default) uses one password for both store and key, so we keep
# a single Keychain entry and re-export it for both.
#
# Usage:  source android/release-sign.sh && (cd android && ./gradlew assembleRelease)
#
# Works under both bash and zsh; resolves the project root via git.

set -e

_seadio_root="$(git -C "$(pwd)" rev-parse --show-toplevel 2>/dev/null || pwd)"
export KEYSTORE_PATH="${_seadio_root}/android/app/seadio-release.jks"
export KEY_ALIAS="seadio"
export KEYSTORE_PASS="$(security find-generic-password -a seadio-release -s seadio-android-keystore -w)"
export KEY_PASS="$KEYSTORE_PASS"
unset _seadio_root

if [ -z "$KEYSTORE_PASS" ]; then
  echo "ERROR: Keychain entry 'seadio-android-keystore' missing. Re-run Task 1 keystore generation." >&2
  return 1 2>/dev/null || exit 1
fi
if [ ! -f "$KEYSTORE_PATH" ]; then
  echo "ERROR: Keystore not found at $KEYSTORE_PATH" >&2
  return 1 2>/dev/null || exit 1
fi
