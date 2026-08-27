# Agent discovery: Codex, Cursor, and Claude

## Goal

The user should be able to say only:

```text
koristi IBB
koristi IBG
koristi Invictum Browser Gate
use Invictum Browser Bridge
```

All variants select Invictum Browser Bridge and the same policy-controlled
workflow. `IBB` is the canonical acronym; `IBG` and “Browser Gate” are supported
aliases.

## Why discovery has two layers

1. **MCP discovery** is portable. The server's `initialize.instructions` and
   `invictum_ping` tool description advertise the aliases and mandatory startup
   and cleanup sequence to every MCP client.
2. **Agent rules** are defensive. Short global rules teach Codex, Cursor, and
   Claude what to do when the tool is temporarily unavailable and where to find
   the canonical documentation.

The large [AGENT_USAGE.md](../AGENT_USAGE.md) is intentionally not injected into
every conversation. Agents first receive the compact
[AGENT_TRIGGER.md](../AGENT_TRIGGER.md) and load detailed topic documentation
only when the request needs it.

## One-command installation

Build first, then run:

```powershell
Set-Location <repository>
pnpm build
powershell -ExecutionPolicy Bypass -File .\scripts\install-agent-discovery.ps1
```

The script:

- updates a marked, replaceable block in
  `%USERPROFILE%\.codex\AGENTS.md`;
- updates the same block in `%USERPROFILE%\.claude\CLAUDE.md`;
- registers the `invictum-browser` MCP in Codex when the Codex CLI exists;
- merges the server into `%USERPROFILE%\.cursor\mcp.json` without removing other
  servers;
- registers a Claude user-scoped MCP when the Claude Code CLI exists;
- prepares `%USERPROFILE%\.cursor\IBB_USER_RULE.txt` for the Cursor User Rules
  field;
- updates the optional local `D:\tools\AI_PC_START.md` inventory when that file
  already exists.

The generated global rule contains the clone's resolved absolute path. Moving
the repository requires rerunning the installer so agents receive the new
`AGENT_TRIGGER.md` location.

The script is idempotent. Rerunning it replaces only the content between its
own markers.

## Codex

Codex receives:

- global phrase recognition from `%USERPROFILE%\.codex\AGENTS.md`;
- the `invictum_*` tools through its MCP registration;
- portable alias instructions from the MCP server itself.

Start a new Codex task after first registration or after changing the MCP
configuration.

## Cursor

Cursor receives the MCP server globally from `%USERPROFILE%\.cursor\mcp.json`.
This repository also contains an always-applied project rule:

```text
.cursor/rules/invictum-browser.mdc
```

For redundant phrase recognition in every unrelated repository, paste the
contents of `%USERPROFILE%\.cursor\IBB_USER_RULE.txt` once into:

```text
Cursor Settings → Rules → User Rules
```

Cursor User Rules are configured in the UI and are plain text. The MCP server
instructions and alias-rich tool description still provide discovery even
without this optional paste.

## Claude Code

Claude Code automatically loads `%USERPROFILE%\.claude\CLAUDE.md` as user
memory. The setup script adds the compact trigger block there.

If the `claude` command is installed, the script also registers the MCP with
`--scope user`, making it available in all projects. If the command is not yet
installed, the rule directs Claude to the CLI/control-API fallback. Rerun the
installer after installing Claude Code to add the MCP registration.

## Verification

After starting a fresh task in each agent, use a harmless prompt:

```text
Use IBG. Check only ping and capabilities; do not open a tab.
```

Expected behavior:

1. The agent selects `invictum_ping`, not a generic browser.
2. It calls `invictum_capabilities`.
3. It does not open or focus a tab.
4. It reports the bridge/extension connection state.

For a tab lifecycle test:

```text
Use IBB, open https://example.com in the background, read the title, and then
oslobodi tab.
```

Expected behavior:

- `active` is omitted;
- the tab is identified with the current agent name;
- semantic tools are preferred;
- `invictum_unlock_tab` or `invictum_end_session` runs at completion.

## Official configuration references

- [OpenAI Codex customization](https://developers.openai.com/codex/)
- [Cursor Rules](https://docs.cursor.com/context/rules)
- [Cursor MCP](https://docs.cursor.com/context/model-context-protocol)
- [Claude Code memory](https://docs.anthropic.com/en/docs/claude-code/memory)
- [Claude Code MCP](https://docs.anthropic.com/en/docs/claude-code/mcp)
