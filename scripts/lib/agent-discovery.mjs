#!/usr/bin/env node
// File helpers for scripts/install-agent-discovery.sh (macOS and Linux).
// Windows uses scripts/install-agent-discovery.ps1, which has the same behavior.
//
//   node agent-discovery.mjs rule <target.md> <rule-template.md> <repository-root>
//   node agent-discovery.mjs mcp [--stdio-type] <config.json> <server-name> <command> [args...]
//
// Both commands are idempotent. `rule` replaces the marked block if present and
// appends it otherwise. `mcp` sets mcpServers[<server-name>] and keeps every other
// key; it refuses to overwrite a file that is not valid JSON. `--stdio-type` adds
// `"type": "stdio"`, which Claude Code's ~/.claude.json uses; other clients take
// only command and args. Existing file permissions are preserved.

import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";

const START_MARKER = "<!-- INVICTUM_BROWSER_AGENT_RULE:START -->";
const END_MARKER = "<!-- INVICTUM_BROWSER_AGENT_RULE:END -->";

const writeAtomic = (path, content) => {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}`;
  writeFileSync(temporary, content, { mode: 0o600 });
  if (existsSync(path)) chmodSync(temporary, statSync(path).mode & 0o777);
  renameSync(temporary, path);
};

const renderRule = (templatePath, repositoryRoot) =>
  readFileSync(templatePath, "utf8")
    .replaceAll("{{REPOSITORY_ROOT}}\\", `${repositoryRoot}/`)
    .replaceAll("{{REPOSITORY_ROOT}}", repositoryRoot)
    .replaceAll("\r\n", "\n")
    .trim();

export const installMarkedRule = (targetPath, rule) => {
  const block = `${START_MARKER}\n${rule}\n${END_MARKER}`;
  const existing = existsSync(targetPath) ? readFileSync(targetPath, "utf8") : "";
  const start = existing.indexOf(START_MARKER);
  const end = existing.indexOf(END_MARKER);
  let updated;
  if (start !== -1 && end > start) {
    updated = existing.slice(0, start) + block + existing.slice(end + END_MARKER.length);
  } else if (existing.trim() === "") {
    updated = `${block}\n`;
  } else {
    updated = `${existing.trimEnd()}\n\n${block}\n`;
  }
  if (updated !== existing) writeAtomic(targetPath, updated);
  return updated !== existing;
};

export const setMcpServer = (configPath, name, command, args, { stdioType = false } = {}) => {
  let config = {};
  if (existsSync(configPath)) {
    const raw = readFileSync(configPath, "utf8");
    if (raw.trim() !== "") {
      try {
        config = JSON.parse(raw);
      } catch {
        throw new Error(`${configPath} is not valid JSON; fix it before registering MCP`);
      }
    }
  }
  if (typeof config !== "object" || config === null || Array.isArray(config)) {
    throw new Error(`${configPath} must contain a JSON object`);
  }
  const servers =
    typeof config.mcpServers === "object" && config.mcpServers !== null ? config.mcpServers : {};
  const next = { ...servers[name], ...(stdioType ? { type: "stdio" } : {}), command, args };
  if (JSON.stringify(servers[name]) === JSON.stringify(next)) return false;
  config.mcpServers = { ...servers, [name]: next };
  writeAtomic(configPath, `${JSON.stringify(config, null, 2)}\n`);
  return true;
};

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
const [command, ...rest] = invokedDirectly ? process.argv.slice(2) : [];
if (command === "rule") {
  const [targetPath, templatePath, repositoryRoot] = rest;
  const changed = installMarkedRule(targetPath, renderRule(templatePath, repositoryRoot));
  console.log(`${changed ? "Installed" : "Unchanged"} trigger rule: ${targetPath}`);
} else if (command === "mcp") {
  const stdioType = rest[0] === "--stdio-type";
  const [configPath, name, serverCommand, ...serverArgs] = stdioType ? rest.slice(1) : rest;
  const changed = setMcpServer(configPath, name, serverCommand, serverArgs, { stdioType });
  console.log(`${changed ? "Registered" : "Unchanged"} MCP server ${name}: ${configPath}`);
} else if (command !== undefined) {
  console.error(`Unknown command: ${command}`);
  process.exitCode = 2;
}
