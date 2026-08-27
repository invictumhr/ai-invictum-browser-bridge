# Development

## Prerequisites

- Windows 11 x64
- Chrome Stable 120+
- Node.js 22+ and pnpm 11
- Git

## Build and gates

```powershell
$env:CI='true'
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm lint
pnpm build
```

## Run and call the bridge

The easiest path is the CLI; it starts the authority if needed:

```powershell
pnpm browser health
pnpm browser ping
pnpm browser capabilities
```

Manual foreground authority:

```powershell
node apps/desktop/dist/index.js
```

It starts:

- `http://127.0.0.1:47820` — persistent agent control API;
- `ws://127.0.0.1:47821/native` — Native Host transport.

Development overrides are `IBP_CONTROL_PORT`, `IBP_DESKTOP_WS_PORT`, `INVICTUM_CONTROL_URL`, and the existing Native Host `IBP_DESKTOP_WS_URL`. Never bind these unauthenticated development transports publicly.

Chrome launches the registered Native Host; no second terminal is needed. See [EXTENSION_INSTALL.md](EXTENSION_INSTALL.md).

## Test design

Unit tests cover strict protocol schemas, navigation URL restrictions, the exact
runtime capability contract, waits/timeouts/cancellation, permission/error
mapping, semantic snapshots/search, typed interactions, WordPress editors and
menus, Figma anchors and selection, xterm/WHM terminal focus and delivery,
local-file CDP attachment, constrained and raw JavaScript, DOM/CSS/events,
console/network/mobile/PDF adapters, screenshots, authentication/dialogs,
reservation cleanup, policy, redacted audit, Native Messaging framing, Agent
SDK cleanup, and size limits.

Integration tests emulate Native Messaging streams and verify Desktop Authority,
the persistent HTTP control API, protocol routing, reconnect behavior, forms,
WordPress and terminal routing, explicitly authorized actions, and sensitive
argument/audit exclusion.

## MCP smoke without Chrome

After build, send JSON-RPC `initialize` and `tools/list` lines to `node apps/mcp/dist/index.js`. The server must return only valid JSON-RPC on stdout and list the Invictum browser tools. `tools/list` does not require Chrome; browser calls do.

## Real Chrome smoke tests

Build and reload the unpacked extension once, verify Site access is On all sites, then start the deterministic fixture:

```powershell
node tests/fixtures/server.mjs
```

Available harnesses:

```powershell
pnpm --filter @invictum/integration-tests smoke:chrome:list-tabs
pnpm --filter @invictum/integration-tests smoke:chrome:page-snapshot
pnpm --filter @invictum/integration-tests smoke:chrome:find-elements
pnpm --filter @invictum/integration-tests smoke:chrome:phase2-form
pnpm --filter @invictum/integration-tests smoke:chrome:advanced-form
pnpm --filter @invictum/integration-tests smoke:chrome:agent-control
pnpm --filter @invictum/integration-tests smoke:chrome:auth-dialog
pnpm --filter @invictum/integration-tests smoke:chrome:kitchen-sink
```

Legacy harnesses temporarily own 47821 to inspect sanitized audit output. Before running one, stop only a process positively identified as this project's development authority. The fixture values include known secrets; snapshot tests prove they never leave the extension.

The advanced harness validates textarea clearing, WYSIWYG and same-origin iframe input, select/checked state, constrained JavaScript, bounded screenshot capture, screenshot-to-CSS coordinate binding, revision-bound fallback click, ordinary-submit denial, explicitly authorized submit, post-action verification, User Stop/reservation cleanup and audit redaction.

The auth/dialog harness uses the persistent control API. It validates a real browser HTTP Basic challenge with ephemeral credentials, `hasValue` without credential disclosure, and an armed native `confirm()` accept through the tab's shared debugger-session manager.

The kitchen-sink harness also uses the persistent control API. It creates its own tab and validates outline/minimal/interactive/semantic/full plus scoped snapshots; semantic find and truncation flags; text, search, email, number, date and textarea events; single/multiple local-file attachment plus missing-path denial and native events; select, checkbox and radio actions; contenteditable, ProseMirror-like and CKEditor-like editors; open Shadow DOM; safe N-1 relocation and fingerprint rejection; constrained JavaScript; typed DOM mutation/HTML sanitization including stylesheet and inline-network denial; inline/computed CSS inspection and CSS add/remove; delegated listener/source discovery for a JS-generated dropdown; scoped standard/custom event capture with monotonic sequence after clear; raw expression/function JavaScript and protected-source denial; bounded screenshots and coordinate clicks; non-form implicit buttons; submit denial/authorization; and guaranteed unlock.

After rebuilding/reloading the extension, `scripts/verify-after-reload.ps1` is
the one-step gate. The current gate checks ping, exactly 54 runtime actions, 61
MCP tools, the required feature flags, the deterministic fixture, and the
complete kitchen-sink smoke. Runtime `system.capabilities` and the script are
the source of truth when a later release changes those counts.

For normal agent operation do not use the legacy harness: keep the persistent authority running and exercise the browser through MCP/CLI/control API.

`smoke:chrome:agent-control` is the exception: it deliberately uses the persistent control API, verifies CLI auto-start, runtime capabilities, automatic `open_tab`, `wait_for`, full-to-scoped snapshot reduction, navigation redaction, DOM-stability waiting, and guaranteed SDK unlock without taking ownership of 47821.

Platform-specific real-Chrome procedures are documented in
[docs/WORDPRESS_ADMIN.md](docs/WORDPRESS_ADMIN.md),
[docs/WORDPRESS_MENUS.md](docs/WORDPRESS_MENUS.md),
[docs/TERMINAL_AUTOMATION.md](docs/TERMINAL_AUTOMATION.md), and
[docs/FIGMA.md](docs/FIGMA.md).

The latest live-site validation and reproducible Google PageSpeed workflow are recorded in [docs/REAL_CHROME_TEST_REPORT.md](docs/REAL_CHROME_TEST_REPORT.md).
