# Documentation

This index separates current operating instructions from dated implementation
and verification records. Runtime `system.capabilities` is authoritative when
the loaded Chrome extension and the checkout may differ.

## Start here

- [Project overview](../README.md) — features, architecture, requirements, and
  quick start.
- [Windows installation](../INSTALL_WINDOWS.md) — source-based developer setup.
- [Chrome extension installation](../EXTENSION_INSTALL.md) — unpacked extension,
  Native Host registration, permissions, reload, and removal.
- [Agent usage](../AGENT_USAGE.md) — complete MCP, CLI, SDK, control API, safety,
  recovery, and lifecycle contract.
- [Troubleshooting](../TROUBLESHOOTING.md) — connection, permissions, stale
  state, editors, terminals, Figma, and debugger conflicts.

## Agent integration

- [Agent trigger](../AGENT_TRIGGER.md) — compact IBB/IBG rules agents must read.
- [Agent discovery](AGENT_DISCOVERY.md) — Codex, Cursor, and Claude Code setup.
- [MCP configuration](../MCP_CONFIGURATION.md) — server registration and tool
  surface.
- [MCP agent ergonomics](MCP_AGENT_ERGONOMICS.md) — dry run, idempotency,
  confirmation, post-snapshots, DOM deltas, marks, and batches.
- [Agent productivity actions](AGENT_PRODUCTIVITY_ACTIONS.md) — clean text,
  natural-language find, history, same-origin API, and batches.

## Platform guides

- [WordPress wp-admin](WORDPRESS_ADMIN.md) — screen context, notices, list
  tables, Gutenberg, Classic Editor, save, and verification.
- [WordPress classic menus](WORDPRESS_MENUS.md) — inspect, add, update, remove,
  reorder, nest, and save complete menu trees.
- [WHM/cPanel and xterm terminals](TERMINAL_AUTOMATION.md) — typed detection,
  bounded readback, trusted input, draft proof, waits, and fail-closed recovery.
- [Figma design files](FIGMA.md) — browser UI health, pages, rendered layers,
  inspector properties, safe selection, and canvas limitations.

## Browser capabilities

- [Authentication and native dialogs](../AUTH_AND_DIALOGS.md)
- [Local file upload](FILE_UPLOAD.md)
- [Advanced DOM, CSS, events, and JavaScript](ADVANCED_BROWSER_TOOLS.md)
- [Console, network, mobile, gestures, and PDF](ADVANCED_AGENT_CAPABILITIES.md)
- [Console and mobile details](DEVTOOLS_CONSOLE_AND_MOBILE.md)
- [Screenshots and tutorial annotations](SCREENSHOTS_AND_ANNOTATIONS.md)
- [Capability and privacy audit](CAPABILITY_AUDIT.md)

## Design, security, and development

- [Architecture](../ARCHITECTURE.md)
- [Security model](../SECURITY.md)
- [Policy configuration](../POLICY_CONFIGURATION.md)
- [Development and testing](../DEVELOPMENT.md)
- [Contributing](../CONTRIBUTING.md)
- [Safe Git publishing](../GIT_PUBLISHING.md)
- [Release process](../RELEASE.md)
- [Relay design status](../RELAY_DEPLOYMENT.md)

## Historical verification records

These files record a specific build or date. They are evidence, not the current
runtime contract:

- [Phase 1 report](PHASE_1_REPORT.md)
- [Phase 2 progress](PHASE_2_PROGRESS.md)
- [Auth/dialog test status](AUTH_DIALOG_TEST_STATUS.md)
- [Snapshot size benchmark](SNAPSHOT_SIZE_BENCHMARK.md)
- [Real-Chrome and PageSpeed report](REAL_CHROME_TEST_REPORT.md)

For the current contract, run:

```powershell
pnpm browser capabilities
powershell -ExecutionPolicy Bypass -File .\scripts\verify-after-reload.ps1
```
