# Shared helpers for the macOS and Linux development scripts.
# Sourced by register-native-host-dev.sh and unregister-native-host-dev.sh.
# Kept compatible with the bash 3.2 that macOS ships as /bin/bash.

IBB_HOST_NAME="com.invictum.browser_bridge"

ibb_fail() {
  echo "error: $*" >&2
  exit 1
}

# Absolute repository root, with symlinks resolved.
ibb_repo_root() {
  (cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)
}

# Prints the per-user Native Messaging host directory for a Chromium-based browser.
# Arguments: browser (chrome | chrome-beta | chromium | edge | brave)
ibb_native_host_dir() {
  local browser="$1" base dir
  case "$(uname -s)" in
    Darwin)
      base="$HOME/Library/Application Support"
      case "$browser" in
        chrome) dir="$base/Google/Chrome" ;;
        chrome-beta) dir="$base/Google/Chrome Beta" ;;
        chromium) dir="$base/Chromium" ;;
        edge) dir="$base/Microsoft Edge" ;;
        brave) dir="$base/BraveSoftware/Brave-Browser" ;;
        *) ibb_fail "unsupported browser: $browser" ;;
      esac
      ;;
    Linux)
      base="${XDG_CONFIG_HOME:-$HOME/.config}"
      case "$browser" in
        chrome) dir="$base/google-chrome" ;;
        chrome-beta) dir="$base/google-chrome-beta" ;;
        chromium) dir="$base/chromium" ;;
        edge) dir="$base/microsoft-edge" ;;
        brave) dir="$base/BraveSoftware/Brave-Browser" ;;
        *) ibb_fail "unsupported browser: $browser" ;;
      esac
      ;;
    *)
      ibb_fail "this script supports macOS and Linux; on Windows use the matching .ps1 script"
      ;;
  esac
  printf '%s/NativeMessagingHosts\n' "$dir"
}

# Single-quotes a value for /bin/sh.
ibb_shell_quote() {
  printf "'%s'" "$(printf '%s' "$1" | sed "s/'/'\\\\''/g")"
}

# Chrome's ID for an unpacked extension that has no "key": the first 128 bits of
# SHA-256 over the absolute directory path, hex digits 0-f mapped to a-p.
# Arguments: node path, absolute extension directory
ibb_unpacked_extension_id() {
  "$1" -e '
    const hash = require("node:crypto").createHash("sha256").update(process.argv[1]).digest("hex");
    process.stdout.write([...hash.slice(0, 32)].map((digit) => String.fromCharCode(97 + parseInt(digit, 16))).join(""));
  ' "$2"
}
