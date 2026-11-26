# macOS installation

Invictum Browser Bridge ships as an open-source, source-based developer
installation on macOS as well. The runtime (Desktop Authority, Native Host, CLI,
SDK and MCP server) is plain Node.js; only the installation scripts differ from
Windows. Linux uses the same scripts with the Linux Chrome paths.

## Prerequisites

- macOS 13 or newer (Apple silicon or Intel)
- Google Chrome 120+
- Node.js 22+ (for example `brew install node@24`)
- pnpm 11 (`corepack enable` or `corepack pnpm …`)
- Git

## Clone and build

```bash
git clone https://github.com/invictumhr/ai-invictum-browser-bridge.git
cd ai-invictum-browser-bridge
CI=true pnpm install --frozen-lockfile
pnpm build
```

## Register the Native Host

```bash
scripts/register-native-host-dev.sh
```

Without arguments the script derives the extension ID from
`apps/extension/dist`, exactly as Chrome does for an unpacked extension without
a `"key"` (SHA-256 of the absolute path). Registration can therefore happen
before the extension is loaded, as long as it is later loaded from that same
directory. If Chrome shows a different ID, register again with
`--extension-id PASTE_EXTENSION_ID`.

The script writes a per-user manifest to
`~/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.invictum.browser_bridge.json`
and a small launcher, `.development/invictum-native-host.sh`, that pins the
absolute Node and Native Host paths, because Chrome starts native hosts with a
minimal environment. No administrator rights are required. Use
`--browser chrome-beta|chromium|edge|brave` for another Chromium browser.

## Load the extension

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Choose **Load unpacked** and select `<repository>/apps/extension/dist`.
4. Check that the extension ID matches the one printed by the registration script.
5. Open **Details** and set **Site access** to **On all sites**.
6. Reload **Invictum Browser Controller** once. The toolbar badge shows `ON`
   after the Native Messaging round trip connects.

## Configure agents

```bash
scripts/install-agent-discovery.sh
```

The script installs the IBB/IBG trigger rule into `~/.claude/CLAUDE.md` and
`~/.codex/AGENTS.md` and registers the `invictum-browser` MCP server for Claude
Code (with the `claude` CLI when present, otherwise in `~/.claude.json`), the
Claude desktop app (`claude_desktop_config.json`), Codex (when its CLI is
present) and Cursor. Unrelated MCP servers and settings are preserved, invalid
JSON is never overwritten, and running it again changes nothing. Restart the
Claude desktop app or start a new agent session afterwards.

## Verify

```bash
pnpm browser health
pnpm browser ping
pnpm browser health-details
pnpm browser capabilities
```

The CLI, MCP server, SDK and Chrome-launched Native Host start Desktop Authority
automatically when its loopback control API (`127.0.0.1:47820`) is offline.
Desktop Authority keeps its per-user control token, audit log and operation
journal under `~/.invictum-browser-bridge/InvictumBrowserBridge` with `0700`
directory and `0600` file permissions; do not publish or print their contents.

## Updating

| Changed component                                  | Required action                                                        |
| -------------------------------------------------- | ---------------------------------------------------------------------- |
| Extension source or manifest                       | `pnpm build`, Reload extension, refresh existing target tabs if needed |
| MCP source or registration                         | `pnpm build`, start a new agent session                                |
| Desktop, CLI, SDK, protocol, or Native Host source | `pnpm build`; restart the relevant process or let auto-start repair it |
| Node.js moved to a different path                  | Run `scripts/register-native-host-dev.sh` again                        |

## Remove

```bash
scripts/unregister-native-host-dev.sh
```

Then remove the unpacked extension from `chrome://extensions`. The MCP entries
and trigger rule can be removed from the files listed under "Configure agents".
