#!/usr/bin/env bash
# macOS and Linux counterpart of scripts/install-agent-discovery.ps1: installs the
# IBB trigger rule for Claude and Codex and registers the invictum-browser MCP server.
set -euo pipefail

skip_codex=0
skip_cursor=0
skip_claude=0
skip_claude_desktop=0
skip_rules=0

while [ $# -gt 0 ]; do
  case "$1" in
    --skip-codex) skip_codex=1 ;;
    --skip-cursor) skip_cursor=1 ;;
    --skip-claude) skip_claude=1 ;;
    --skip-claude-desktop) skip_claude_desktop=1 ;;
    --skip-global-rules) skip_rules=1 ;;
    -h | --help)
      echo "Usage: scripts/install-agent-discovery.sh [--skip-codex] [--skip-cursor] [--skip-claude] [--skip-claude-desktop] [--skip-global-rules]"
      exit 0
      ;;
    *) echo "error: unknown argument: $1" >&2; exit 2 ;;
  esac
  shift
done

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
helper="$repo_root/scripts/lib/agent-discovery.mjs"
node_path="$(command -v node || true)"
mcp_entry="$repo_root/apps/mcp/dist/index.js"
adapters_dir="$repo_root/docs/agent-adapters"
rule_template="$adapters_dir/GLOBAL_AGENT_RULE.md"

[ -n "$node_path" ] || { echo "error: node was not found on PATH" >&2; exit 1; }
[ -f "$mcp_entry" ] || { echo "error: built MCP entry is missing: $mcp_entry; run pnpm build first" >&2; exit 1; }
[ -f "$rule_template" ] || { echo "error: global agent rule source is missing: $rule_template" >&2; exit 1; }

summary=""
note() { summary="$summary- $1: $2"$'\n'; }

if [ "$skip_rules" -eq 0 ]; then
  "$node_path" "$helper" rule "$HOME/.claude/CLAUDE.md" "$rule_template" "$repo_root"
  "$node_path" "$helper" rule "$HOME/.codex/AGENTS.md" "$rule_template" "$repo_root"
  note "Global rules" "~/.claude/CLAUDE.md, ~/.codex/AGENTS.md"
fi

if [ "$skip_claude" -eq 0 ]; then
  if command -v claude >/dev/null 2>&1; then
    if claude mcp list 2>/dev/null | grep -q "invictum-browser"; then
      note "Claude Code MCP" "already registered"
    else
      claude mcp add --scope user invictum-browser -- "$node_path" "$mcp_entry"
      note "Claude Code MCP" "installed with the claude CLI"
    fi
  else
    # Without the CLI, write the user-scope server into ~/.claude.json, which the
    # Claude Code engine (also inside the Claude desktop app) reads at session start.
    "$node_path" "$helper" mcp --stdio-type "$HOME/.claude.json" invictum-browser "$node_path" "$mcp_entry"
    note "Claude Code MCP" "written to ~/.claude.json (claude CLI not found)"
  fi
fi

if [ "$skip_claude_desktop" -eq 0 ] && [ "$(uname -s)" = "Darwin" ]; then
  "$node_path" "$helper" mcp "$HOME/Library/Application Support/Claude/claude_desktop_config.json" \
    invictum-browser "$node_path" "$mcp_entry"
  note "Claude desktop MCP" "claude_desktop_config.json (restart the app to load it)"
fi

if [ "$skip_codex" -eq 0 ]; then
  if command -v codex >/dev/null 2>&1; then
    if codex mcp list 2>/dev/null | grep -q "invictum-browser"; then
      note "Codex MCP" "already registered"
    else
      codex mcp add invictum-browser -- "$node_path" "$mcp_entry"
      note "Codex MCP" "installed"
    fi
  else
    note "Codex MCP" "skipped: Codex CLI not found"
  fi
fi

if [ "$skip_cursor" -eq 0 ]; then
  "$node_path" "$helper" mcp "$HOME/.cursor/mcp.json" invictum-browser "$node_path" "$mcp_entry"
  note "Cursor MCP" "~/.cursor/mcp.json"
fi

echo
echo "Invictum Browser agent discovery setup:"
printf '%s' "$summary"
echo
echo "Trigger contract: $repo_root/AGENT_TRIGGER.md"
echo "Start a new Claude/Codex/Cursor task after changing MCP or global rules."
