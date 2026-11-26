import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

// macOS and Linux installation scripts. Windows keeps its PowerShell scripts.
const repositoryRoot = realpathSync(fileURLToPath(new URL("../../../", import.meta.url)));
const scripts = join(repositoryRoot, "scripts");
const hostEntry = join(repositoryRoot, "apps", "native-host", "dist", "index.js");
const mcpEntry = join(repositoryRoot, "apps", "mcp", "dist", "index.js");
const hostName = "com.invictum.browser_bridge";

const temporaryDirectories: string[] = [];
afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

const makeTemporaryDirectory = (): string => {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), "ibb-posix-")));
  temporaryDirectories.push(directory);
  return directory;
};

// A minimal PATH keeps any real claude/codex CLI out of the test.
const scriptEnvironment = (home: string, developmentDirectory: string): NodeJS.ProcessEnv => ({
  HOME: home,
  PATH: `${dirname(process.execPath)}:/usr/bin:/bin`,
  IBB_DEVELOPMENT_DIR: developmentDirectory,
});

const run = (
  script: string,
  args: string[],
  environment: NodeJS.ProcessEnv,
): { status: number | null; stdout: string; stderr: string } => {
  const result = spawnSync("bash", [join(scripts, script), ...args], {
    env: environment,
    encoding: "utf8",
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
};

const expectedNativeHostDirectory = (home: string): string =>
  process.platform === "darwin"
    ? join(home, "Library", "Application Support", "Google", "Chrome", "NativeMessagingHosts")
    : join(home, ".config", "google-chrome", "NativeMessagingHosts");

const chromeUnpackedId = (absolutePath: string): string =>
  [...createHash("sha256").update(absolutePath).digest("hex").slice(0, 32)]
    .map((digit) => String.fromCharCode(97 + Number.parseInt(digit, 16)))
    .join("");

const makeExtensionDirectory = (manifest: Record<string, unknown>): string => {
  const directory = join(makeTemporaryDirectory(), "extension dist");
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, "manifest.json"), JSON.stringify(manifest));
  return directory;
};

const posixOnly = process.platform === "win32" || !existsSync(hostEntry) || !existsSync(mcpEntry);

describe.skipIf(posixOnly)("POSIX native host registration", () => {
  it("derives the unpacked extension ID and writes the manifest and launcher", () => {
    const home = makeTemporaryDirectory();
    const development = makeTemporaryDirectory();
    const extensionDirectory = makeExtensionDirectory({ name: "IBB", manifest_version: 3 });

    const result = run(
      "register-native-host-dev.sh",
      ["--extension-dir", extensionDirectory, "--desktop-url", "ws://127.0.0.1:47821/native"],
      scriptEnvironment(home, development),
    );
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);

    const extensionId = chromeUnpackedId(extensionDirectory);
    expect(extensionId).toMatch(/^[a-p]{32}$/);
    const manifestPath = join(expectedNativeHostDirectory(home), `${hostName}.json`);
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<string, unknown>;
    const launcher = join(development, "invictum-native-host.sh");
    expect(manifest).toEqual({
      name: hostName,
      description: "Invictum Browser Bridge Native Messaging Host (development)",
      path: launcher,
      type: "stdio",
      allowed_origins: [`chrome-extension://${extensionId}/`],
    });

    const launcherSource = readFileSync(launcher, "utf8");
    expect(launcherSource.startsWith("#!/bin/sh\n")).toBe(true);
    expect(launcherSource).toContain(`'${hostEntry}'`);
    expect(launcherSource).toContain("'--desktop-url=ws://127.0.0.1:47821/native' \"$@\"");
    expect(statSync(launcher).mode & 0o111).not.toBe(0);

    const removal = run("unregister-native-host-dev.sh", [], scriptEnvironment(home, development));
    expect(removal.status).toBe(0);
    expect(existsSync(manifestPath)).toBe(false);
    expect(existsSync(launcher)).toBe(false);
  });

  it("accepts an explicit extension ID", () => {
    const home = makeTemporaryDirectory();
    const development = makeTemporaryDirectory();
    const extensionId = "abcdefghijklmnopabcdefghijklmnop";

    const result = run(
      "register-native-host-dev.sh",
      ["--extension-id", extensionId],
      scriptEnvironment(home, development),
    );
    expect(result.status).toBe(0);
    const manifest = JSON.parse(
      readFileSync(join(expectedNativeHostDirectory(home), `${hostName}.json`), "utf8"),
    ) as { allowed_origins: string[] };
    expect(manifest.allowed_origins).toEqual([`chrome-extension://${extensionId}/`]);
  });

  it("refuses to derive an ID when the manifest has a key, and rejects unsafe input", () => {
    const home = makeTemporaryDirectory();
    const development = makeTemporaryDirectory();
    const environment = scriptEnvironment(home, development);
    const keyed = makeExtensionDirectory({ name: "IBB", key: "MIIBIjANBg" });

    expect(
      run("register-native-host-dev.sh", ["--extension-dir", keyed], environment).status,
    ).not.toBe(0);
    expect(
      run("register-native-host-dev.sh", ["--extension-id", "not-an-id"], environment).status,
    ).not.toBe(0);
    expect(
      run(
        "register-native-host-dev.sh",
        [
          "--extension-id",
          "abcdefghijklmnopabcdefghijklmnop",
          "--desktop-url",
          "ws://example.com:1/x",
        ],
        environment,
      ).status,
    ).not.toBe(0);
    expect(existsSync(join(expectedNativeHostDirectory(home), `${hostName}.json`))).toBe(false);
  });
});

describe.skipIf(posixOnly)("POSIX agent discovery", () => {
  it("installs the trigger rule and MCP servers idempotently and keeps other settings", () => {
    const home = makeTemporaryDirectory();
    const development = makeTemporaryDirectory();
    const claudeConfig = join(home, ".claude.json");
    writeFileSync(
      claudeConfig,
      JSON.stringify({ theme: "dark", mcpServers: { other: { command: "x" } } }),
    );
    chmodSync(claudeConfig, 0o600);
    mkdirSync(join(home, ".claude"));
    writeFileSync(join(home, ".claude", "CLAUDE.md"), "# Existing instructions\n");

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const result = run("install-agent-discovery.sh", [], scriptEnvironment(home, development));
      expect(result.stderr).toBe("");
      expect(result.status).toBe(0);
    }

    const rule = readFileSync(join(home, ".claude", "CLAUDE.md"), "utf8");
    expect(rule.startsWith("# Existing instructions\n")).toBe(true);
    expect(rule.match(/INVICTUM_BROWSER_AGENT_RULE:START/g)).toHaveLength(1);
    expect(rule).toContain(`${repositoryRoot}/AGENT_TRIGGER.md`);
    expect(rule).not.toContain("{{REPOSITORY_ROOT}}");
    expect(existsSync(join(home, ".codex", "AGENTS.md"))).toBe(true);

    const claude = JSON.parse(readFileSync(claudeConfig, "utf8")) as {
      theme: string;
      mcpServers: Record<string, unknown>;
    };
    expect(claude.theme).toBe("dark");
    expect(claude.mcpServers["other"]).toEqual({ command: "x" });
    expect(claude.mcpServers["invictum-browser"]).toEqual({
      type: "stdio",
      command: process.execPath,
      args: [mcpEntry],
    });
    expect(statSync(claudeConfig).mode & 0o777).toBe(0o600);

    const cursor = JSON.parse(readFileSync(join(home, ".cursor", "mcp.json"), "utf8")) as {
      mcpServers: Record<string, unknown>;
    };
    expect(cursor.mcpServers["invictum-browser"]).toEqual({
      command: process.execPath,
      args: [mcpEntry],
    });

    const desktopConfig = join(
      home,
      "Library",
      "Application Support",
      "Claude",
      "claude_desktop_config.json",
    );
    // The Claude desktop app rewrites its own config while running: opt-in only.
    expect(existsSync(desktopConfig)).toBe(false);
  });

  it("writes the Claude desktop entry only with --with-claude-desktop", () => {
    const home = makeTemporaryDirectory();
    const development = makeTemporaryDirectory();
    const desktopDirectory = join(home, "Library", "Application Support", "Claude");
    const desktopConfig = join(desktopDirectory, "claude_desktop_config.json");
    mkdirSync(desktopDirectory, { recursive: true });
    writeFileSync(desktopConfig, JSON.stringify({ preferences: { keep: true } }));

    const result = run(
      "install-agent-discovery.sh",
      [
        "--skip-global-rules",
        "--skip-claude",
        "--skip-codex",
        "--skip-cursor",
        "--with-claude-desktop",
      ],
      scriptEnvironment(home, development),
    );
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);

    const desktop = JSON.parse(readFileSync(desktopConfig, "utf8")) as {
      preferences: Record<string, unknown>;
      mcpServers?: Record<string, unknown>;
    };
    expect(desktop.preferences).toEqual({ keep: true });
    expect(desktop.mcpServers?.["invictum-browser"] !== undefined).toBe(
      process.platform === "darwin",
    );
  });

  it("does not overwrite an invalid JSON configuration", () => {
    const home = makeTemporaryDirectory();
    const development = makeTemporaryDirectory();
    const claudeConfig = join(home, ".claude.json");
    writeFileSync(claudeConfig, "{ not json");

    const result = run(
      "install-agent-discovery.sh",
      ["--skip-global-rules", "--skip-cursor"],
      scriptEnvironment(home, development),
    );
    expect(result.status).not.toBe(0);
    expect(readFileSync(claudeConfig, "utf8")).toBe("{ not json");
  });
});
