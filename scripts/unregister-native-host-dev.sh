#!/usr/bin/env bash
# Removes the development Native Messaging host registration on macOS and Linux.
# Windows uses scripts/unregister-native-host-dev.ps1.
set -euo pipefail

# shellcheck source=lib/posix-common.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib/posix-common.sh"

browser="chrome"
while [ $# -gt 0 ]; do
  case "$1" in
    --browser) browser="${2:-}"; shift 2 ;;
    -h | --help)
      echo "Usage: scripts/unregister-native-host-dev.sh [--browser chrome|chrome-beta|chromium|edge|brave]"
      exit 0
      ;;
    *) ibb_fail "unknown argument: $1" ;;
  esac
done

repo_root="$(ibb_repo_root)"
manifest_path="$(ibb_native_host_dir "$browser")/$IBB_HOST_NAME.json"

if [ -f "$manifest_path" ]; then
  rm -f "$manifest_path"
  echo "Removed $manifest_path"
else
  echo "No registration found at $manifest_path"
fi
development_dir="${IBB_DEVELOPMENT_DIR:-$repo_root/.development}"
rm -f "$development_dir/invictum-native-host.sh" "$development_dir/$IBB_HOST_NAME.json"
