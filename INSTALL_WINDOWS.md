# Windows installation

Invictum Browser Bridge currently ships as an open-source, source-based
developer installation. There is no signed installer or Chrome Web Store
package yet.

## Prerequisites

- Windows 11 x64
- Google Chrome 120+
- Node.js 22+
- pnpm 11
- Git

## Clone and build

```powershell
git clone https://github.com/invictumhr/ai-invictum-browser-bridge.git
Set-Location .\ai-invictum-browser-bridge
$env:CI = 'true'
pnpm install --frozen-lockfile
pnpm build
```

## Load the extension

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Choose **Load unpacked**.
4. Select `<repository>\apps\extension\dist`.
5. Copy the extension ID shown by Chrome.
6. Open **Details** and set **Site access** to **On all sites**.

Site access applies only to HTTP(S) pages and remains subject to Chrome user and
administrator policy. Browser-internal, extension, DevTools, Web Store, local
file, and other restricted pages remain unavailable.

## Register the Native Host

Run from the repository root in a normal PowerShell window:

```powershell
.\scripts\register-native-host-dev.ps1 -ExtensionId "PASTE_EXTENSION_ID"
pnpm browser ping
pnpm browser capabilities
```

Registration is per user under `HKCU`; administrator rights are not required.
The CLI, MCP server, and SDK start Desktop Authority automatically when its
loopback control API is offline.

Reload **Invictum Browser Controller** once on `chrome://extensions` after the
first registration. The toolbar badge should show `ON` after a successful Native
Messaging round trip.

## Configure agents

After the build, install the MCP registrations and IBB/IBG trigger rules:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install-agent-discovery.ps1
```

The installer preserves unrelated MCP servers and configures supported Codex,
Cursor, and Claude Code locations. Start a new agent session after changing an
MCP registration. See [MCP_CONFIGURATION.md](MCP_CONFIGURATION.md).

## Verify

Without changing browser state:

```powershell
pnpm browser health
pnpm browser ping
pnpm browser capabilities
```

After an extension rebuild and manual Reload, run the complete prepared gate:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\verify-after-reload.ps1
```

The gate checks the 54-action extension contract, the 61-tool MCP surface, the
current feature flags, the deterministic fixture, and real-Chrome integration
workflows. Runtime capabilities remain authoritative if the numbers change in a
future release.

## Updating

| Changed component                                  | Required action                                                        |
| -------------------------------------------------- | ---------------------------------------------------------------------- |
| Extension source or manifest                       | `pnpm build`, Reload extension, refresh existing target tabs if needed |
| MCP source or registration                         | `pnpm build`, start a new agent session                                |
| Desktop, CLI, SDK, protocol, or Native Host source | `pnpm build`; restart the relevant process or let auto-start repair it |
| Documentation only                                 | No Chrome reload                                                       |

## Remove

```powershell
.\scripts\unregister-native-host-dev.ps1
```

Then remove the unpacked extension from `chrome://extensions`. This does not
delete the repository or alter Chrome profile data.
