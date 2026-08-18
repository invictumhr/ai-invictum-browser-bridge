# Invictum Browser Bridge agent instructions

The phrases `use IBB`, `use IBG`, `use Invictum Browser Bridge`, and
`use Invictum Browser Gate` all mean the same thing. Croatian equivalents such
as `koristi IBB`, `koristi IBG`, `koristi Invictum Browser Bridge`, and
`koristi Invictum Browser Gate` are recognized aliases. Read the entire
[AGENT_TRIGGER.md](AGENT_TRIGGER.md) before the first browser action.

Before developing, starting, diagnosing, or using the Bridge, read the entire
[AGENT_USAGE.md](AGENT_USAGE.md).

Read the specialized guide that applies to the task:

- Login, HTTP Basic Auth, and native JavaScript dialogs:
  [AUTH_AND_DIALOGS.md](AUTH_AND_DIALOGS.md).
- Local file upload: [docs/FILE_UPLOAD.md](docs/FILE_UPLOAD.md). Use only
  `browser.set_file_input_files`; never attempt to set `FileList` through
  JavaScript or a coordinate click.
- Classic WordPress **Appearance > Menus**:
  [docs/WORDPRESS_MENUS.md](docs/WORDPRESS_MENUS.md). Use typed
  `browser.get_wordpress_menu` and `browser.edit_wordpress_menu`; do not
  reorganize menus with coordinate dragging or raw JavaScript.
- WordPress admin list tables, notices, Gutenberg, and Classic Editor:
  [docs/WORDPRESS_ADMIN.md](docs/WORDPRESS_ADMIN.md). Prefer typed WordPress
  actions and authoritative editor models.
- Advanced DOM/CSS work, custom widgets, event listeners, event capture, and
  raw-JavaScript fallback:
  [docs/ADVANCED_BROWSER_TOOLS.md](docs/ADVANCED_BROWSER_TOOLS.md). Always
  prefer a typed action; raw JavaScript is an explicitly authorized R3 last
  resort.
- Viewport, element, region, and full-page screenshots plus tutorial
  annotations: [docs/SCREENSHOTS_AND_ANNOTATIONS.md](docs/SCREENSHOTS_AND_ANNOTATIONS.md).
- Programmatic console, metadata-only network capture, mobile emulation,
  advanced gestures, and PDF export:
  [docs/ADVANCED_AGENT_CAPABILITIES.md](docs/ADVANCED_AGENT_CAPABILITIES.md).
- MCP dry runs, idempotency, structured confirmation/elicitation,
  post-action context, strict stale relocation, conditional batching, and
  set-of-marks screenshots:
  [docs/MCP_AGENT_ERGONOMICS.md](docs/MCP_AGENT_ERGONOMICS.md).
- Clean page text, natural-language element discovery, history navigation,
  same-origin page API calls, and policy-preserving batches:
  [docs/AGENT_PRODUCTIVITY_ACTIONS.md](docs/AGENT_PRODUCTIVITY_ACTIONS.md).

[AGENT_USAGE.md](AGENT_USAGE.md) is authoritative for:

- MCP, CLI, Agent SDK, and local control API usage;
- automatic Bridge startup and recovery;
- Native Messaging connectivity checks;
- runtime capabilities reported by `system.capabilities`;
- Chrome Site access and restricted pages;
- automatic background-tab behavior and per-tab agent identity;
- prefilled login, ephemeral HTTP Basic Auth, and native dialogs;
- explicitly authorized local file upload without path leakage in audit logs;
- typed WordPress menu/admin/editor workflows;
- advanced inspection, event capture, DOM/CSS mutation, and raw-JS fallback;
- metadata-only network diagnostics, synthetic gestures, and PDF export;
- screenshots, annotations, and coordinate fallback;
- the required `reserve -> work -> browser.unlock_tab` lifecycle;
- policy, audit, and security boundaries;
- unit, integration, and real-Chrome verification.

Never connect directly to the extension, Native Messaging, or port `47821`
outside Desktop Authority. Prefer MCP. If MCP is unavailable, use the CLI on
control API port `47820`.

For the wider machine inventory and operating instructions, read
`D:\tools\AI_PC_START.md`. For AutoHotkey/Claude permission automation, also
read `D:\tools\auto-hotkey\readme.txt`; never start auto-approval without the
user explicitly requesting it.
