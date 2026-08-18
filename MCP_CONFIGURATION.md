# MCP configuration

The built stdio MCP server is `apps/mcp/dist/index.js`. It is a thin client of the persistent Desktop Authority control API; it never connects directly to Chrome or port 47821. It automatically starts the built authority in a hidden process if `http://127.0.0.1:47820` is offline.

The server's MCP `initialize.instructions` and `invictum_ping` description
declare `IBB`, `IBG`, `Invictum Browser Bridge`, and `Invictum Browser Gate` as
aliases. Any compliant MCP client can therefore discover the user's shorthand
without client-specific prompt duplication.

## One-command agent setup

After `pnpm build`, install the discovery rules and MCP registrations:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install-agent-discovery.ps1
```

The script is idempotent and preserves unrelated MCP servers and global agent
instructions. It configures Codex and Cursor immediately. If Claude Code is
installed, it also runs a user-scoped Claude MCP registration; otherwise the
global Claude trigger rule retains the documented CLI fallback until the script
is rerun after Claude Code installation.

## Codex

Build and register once:

```powershell
Set-Location D:\laragon\www\invictum\invictum-browser-bridge
pnpm build
codex mcp add invictum-browser -- "C:\Program Files\nodejs\node.exe" "D:\laragon\www\invictum\invictum-browser-bridge\apps\mcp\dist\index.js"
codex mcp get invictum-browser
```

Start a new Codex task after adding or changing the MCP registration. Remove it with:

```powershell
codex mcp remove invictum-browser
```

## Generic stdio MCP client

Configure command `C:\Program Files\nodejs\node.exe` with argument:

```text
D:\laragon\www\invictum\invictum-browser-bridge\apps\mcp\dist\index.js
```

Optional environment variables:

- `INVICTUM_CONTROL_URL` — default `http://127.0.0.1:47820`;
- `INVICTUM_SESSION_ID` — stable unique ID per concurrent agent/task;
- `INVICTUM_AGENT_ID` — audit-facing agent ID;
- `INVICTUM_SESSION_AUTHORIZED=false` — intentionally fail closed.

## Cursor

Cursor reads a global server from `%USERPROFILE%\.cursor\mcp.json`. The setup
script merges `invictum-browser` into that file without deleting other servers.
It also writes `%USERPROFILE%\.cursor\IBB_USER_RULE.txt`, ready to paste once
into **Cursor Settings → Rules → User Rules** as a redundant global trigger.
Within this repository, `.cursor/rules/invictum-browser.mdc` applies
automatically.

## Claude Code

Claude Code uses `%USERPROFILE%\.claude\CLAUDE.md` for user instructions and a
user-scoped MCP registration for tools available in every project. The setup
script installs the trigger block and, when the `claude` command exists, runs
the equivalent of:

```powershell
claude mcp add --scope user invictum-browser -- "C:\Program Files\nodejs\node.exe" "D:\laragon\www\invictum\invictum-browser-bridge\apps\mcp\dist\index.js"
```

## MCP tools

The server exposes 50 tools for the complete runtime action set plus batching,
session cleanup, and a forward-compatible escape hatch. It also exposes five
MCP prompts for safe web work, login, form filling, WordPress editing, and
bounded diagnostics. `invictum_call` must never bypass policy.

Tool schemas include standard MCP read-only, destructive, idempotent, and
open-world annotations. Mutating tools additionally support adapter-level
`dryRun`, `idempotencyKey`, `postSnapshot`, `domDelta`, and `verify`. Screenshot
supports `autoMarks`. R2/R3 authorization can use MCP elicitation when the
client advertises it; sensitive values are never elicited. Full contracts and
examples are in
[docs/MCP_AGENT_ERGONOMICS.md](docs/MCP_AGENT_ERGONOMICS.md).

`invictum_authenticate_http` accepts credentials only when the user explicitly supplied or authorized them; they are forwarded ephemerally and never returned/audited. `invictum_handle_javascript_dialog` should normally include the click or navigation trigger that is expected to open the dialog, allowing the extension to arm CDP before the page blocks.

Call `invictum_ping` and `invictum_capabilities` first. For `invictum_open_tab` and `invictum_navigate`, omit `active` so the user's persisted toolbar preference remains authoritative. Do not force `active: true` for visibility, screenshots, debugging, the reservation indicator, or convenience; background tabs support semantic actions and debugger screenshots. Use an explicit activation override only when the current task genuinely requires showing/focusing that tab for the user.

For runtime errors use `invictum_console` in the order `start` → tested action → `read` → `stop`. For responsive testing use `invictum_emulate_device set`, then a fresh snapshot/interactions/screenshot, then `reset`. Both work without activating the tab. Visible DevTools should remain closed because Chrome permits one debugger client per target.

Always stop/reset those temporary tools and unlock a controlled tab in `finally`, or call `invictum_end_session` once on task completion. Screenshot output is emitted as MCP image content rather than copied into text. See [docs/DEVTOOLS_CONSOLE_AND_MOBILE.md](docs/DEVTOOLS_CONSOLE_AND_MOBILE.md).

The MCP process writes JSON-RPC messages only to stdout. Do not add diagnostic `console.log` calls there.
