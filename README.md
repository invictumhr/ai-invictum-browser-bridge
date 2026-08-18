# Invictum Browser Bridge

Invictum Browser Bridge is a security-first local bridge that lets authorized AI agents use the user's existing Google Chrome profile without copying cookies, credentials, or browser-profile files.

## What works now

- persistent loopback agent control API on `127.0.0.1:47820` while the Native Host keeps its private WebSocket on `127.0.0.1:47821`;
- MCP server for Codex and other stdio MCP clients, plus a JSON CLI and
  TypeScript Agent SDK with shared dry-run, verification, post-snapshot,
  semantic-delta, timing, marks, and safe stale-reference orchestration;
- automatic hidden startup of the Desktop Authority from MCP/CLI;
- runtime `system.capabilities` so agents use the installed build rather than stale documentation;
- typed xterm/WHM terminal detection, bounded redacted buffer or action-local
  WebSocket-stream readback, fail-closed draft verification before Enter,
  trusted background-tab input, prompt/text/quiet waits, and strict R2/R3
  authorization;
- tab listing, `browser.open_tab`, explicitly authorized `browser.close_tab`, `browser.navigate`, and condition-based `browser.wait_for`, with a persisted toolbar choice between background work and foreground activation plus explicit per-call override;
- bounded lazy-render recovery for focus-gated applications: remain in the
  background for 20 seconds, activate once only when the expected renderer is
  still absent, then restore prior user focus when safe;
- required all-HTTP(S) Chrome site access, avoiding manual permission approval for every new domain;
- bounded compact semantic snapshots, token-light `outline` and subtree modes, semantic element search, and deterministic one-revision stale-reference recovery;
- MCP dry runs, structured confirmation/elicitation, idempotent retry keys,
  strict R0/R1 stale relocation, post-action snapshots, bounded semantic
  deltas, one-call verification, conditional batches, recipes, and tool
  annotations;
- click, input/textarea/contenteditable/WYSIWYG typing, model-backed CodeMirror/Ace/Monaco/Quill/TinyMCE synchronization that survives form submit, select, checkbox, radio, and explicitly authorized form submit;
- explicitly authorized single/multiple local-file attachment to native file inputs, including hidden upload-widget inputs;
- typed classic WordPress menu inspection, custom-link add/update/remove, complete-subtree reorganization, and explicitly authorized save without coordinate dragging;
- typed WordPress wp-admin notices/list tables plus authoritative Gutenberg/Classic post editing, review, save, and verification;
- value-presence-only detection for prefilled login fields, explicitly authorized prefilled-form login, and ephemeral HTTP Basic authentication;
- explicitly authorized handling of native JavaScript alert/confirm/prompt/beforeunload dialogs;
- revision-bound DOM/inline-style mutation, reversible CSS injection, custom-element/computed-style inspection, delegated event-listener source discovery, and bounded value-redacted event capture;
- explicitly authorized R3 raw page JavaScript as a short-lived, bounded last resort with direct sensitive/network/navigation/submit surfaces denied;
- bounded redacted browser-console capture, metadata-only network diagnostics, reversible mobile viewport/orientation/DPR/touch preview, revision-bound hover/focus/keyboard/scroll/drag gestures, and bounded PDF export that all work in background tabs;
- plain-text or lightweight Markdown page extraction and automatic numbered
  set-of-marks screenshots for multimodal agents;
- policy-constrained JavaScript fallback, bounded viewport/element/region/full-page screenshots, non-DOM tutorial annotations, and revision-bound coordinate fallback clicks;
- English toolbar settings popup with Bridge/current-tab status, background/foreground default, console/mobile toggles, and blocked-tab reauthorization; automatic per-tab reservation with a stable toolbar `AI` badge, default in-page **AI agent is using this tab** indicator, optional safe per-tab names such as **Codex is using this tab**, immediate User **Stop**, a cancellable 20-second explicit-release grace, and serialized crash-lease cleanup of temporary CSS/event/console/network/device resources;
- fail-closed policy evaluation, secret redaction, sanitized audit data, unit/integration tests, and real-Chrome smoke tests.

Not implemented: download management, OS-level trusted cursor input, cookie/storage access, traffic interception, persistent production audit/session storage, Tauri policy UI, packaged installer, or remote relay. CDP is bounded and tab-scoped. Short operations share and release one attachment; console/network/mobile preview retain a reference only until `stop`/`reset` or automatic tab cleanup.

## Quick start

Requirements: Windows 11, Node.js 22+, pnpm 11, Chrome 120+.

```powershell
$env:CI='true'
pnpm install --frozen-lockfile
pnpm build
pnpm test
pnpm lint
pnpm browser ping
pnpm browser capabilities
```

Load `apps/extension/dist` as an unpacked extension and set its Chrome **Site access** to **On all sites**. Full setup is in [EXTENSION_INSTALL.md](EXTENSION_INSTALL.md).

For Codex, register the built MCP server once:

```powershell
codex mcp add invictum-browser -- "C:\Program Files\nodejs\node.exe" "D:\laragon\www\invictum\invictum-browser-bridge\apps\mcp\dist\index.js"
```

Start a new Codex task after registration. MCP and CLI automatically start the local authority if it is offline.

To make `koristi IBB`, `koristi IBG`, `use Invictum Browser Bridge`, and
`use Invictum Browser Gate` work consistently in Codex, Cursor, and Claude, run
the idempotent cross-agent setup once:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install-agent-discovery.ps1
```

See [AGENT_TRIGGER.md](AGENT_TRIGGER.md) for the compact trigger contract and
[docs/AGENT_DISCOVERY.md](docs/AGENT_DISCOVERY.md) for agent-specific behavior.

## Agent workflow

```text
ping -> capabilities -> open/navigate -> optional identify -> wait -> outline/snapshot -> find
     -> typed action (inspect/events only when unclear) -> verify -> unlock in finally
```

Read [AGENT_USAGE.md](AGENT_USAGE.md) for exact MCP/CLI/SDK examples, action contracts, recovery steps, submit rules, permission behavior, and testing. Browser-hosted terminals have a dedicated [terminal automation guide](docs/TERMINAL_AUTOMATION.md).

The dedicated local-upload contract and post-Reload verification are in [docs/FILE_UPLOAD.md](docs/FILE_UPLOAD.md).

Classic WordPress Appearance > Menus read/edit/save workflows are in [docs/WORDPRESS_MENUS.md](docs/WORDPRESS_MENUS.md).

WordPress wp-admin list tables and Gutenberg/Classic editor workflows are in
[docs/WORDPRESS_ADMIN.md](docs/WORDPRESS_ADMIN.md).

Advanced DOM/CSS, listener/source inspection, event capture and raw-JavaScript contracts are in [docs/ADVANCED_BROWSER_TOOLS.md](docs/ADVANCED_BROWSER_TOOLS.md).

Network diagnostics, gestures, PDF export, console, and mobile emulation are in
[docs/ADVANCED_AGENT_CAPABILITIES.md](docs/ADVANCED_AGENT_CAPABILITIES.md).

The latest capability and security trade-off review is in
[docs/CAPABILITY_AUDIT.md](docs/CAPABILITY_AUDIT.md).

Programmatic console and mobile-preview contracts are in [docs/DEVTOOLS_CONSOLE_AND_MOBILE.md](docs/DEVTOOLS_CONSOLE_AND_MOBILE.md).

Viewport, element, region, full-page, and annotated tutorial screenshot contracts are in [docs/SCREENSHOTS_AND_ANNOTATIONS.md](docs/SCREENSHOTS_AND_ANNOTATIONS.md).

Credential-adjacent behavior and native-dialog contracts are specified separately in [AUTH_AND_DIALOGS.md](AUTH_AND_DIALOGS.md).

## Workspace map

```text
apps/
  cli/           JSON CLI and authority auto-start
  desktop/       policy/audit authority and loopback control API
  extension/     Manifest V3 Chrome controller
  mcp/           stdio MCP adapter
  native-host/   Native Messaging stdio <-> private local WebSocket
packages/
  agent-sdk/     control client and withReservedTab helper
  audit-log/     redacted audit contract and development sink
  policy-engine/ fail-closed action classification
  protocol/      strict IBP schemas and factories
  shared-types/  transport-neutral contracts
tests/
  fixtures/      deterministic local browser pages
  integration/   emulated transport and real-Chrome smoke tests
```

See [ARCHITECTURE.md](ARCHITECTURE.md), [SECURITY.md](SECURITY.md), [DEVELOPMENT.md](DEVELOPMENT.md), [TROUBLESHOOTING.md](TROUBLESHOOTING.md), the [comprehensive real-Chrome/PageSpeed report](docs/REAL_CHROME_TEST_REPORT.md), and the [24sata.hr live test report](docs/24SATA_LIVE_TEST.md).

Before the first commit or any remote push, follow the private-data and secret
scan checklist in [GIT_PUBLISHING.md](GIT_PUBLISHING.md).
