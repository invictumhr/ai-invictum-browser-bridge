#!/usr/bin/env node

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { NativeHostBridge } from "./bridge.js";
import { stderrLogger } from "./logger.js";

const ensureDesktopAuthority = async (): Promise<void> => {
  if (process.env["IBP_NATIVE_HOST_AUTOSTART"] === "false") return;
  const controlPort = process.env["IBP_CONTROL_PORT"] ?? "47820";
  try {
    const health = await fetch(`http://127.0.0.1:${controlPort}/v1/health`, {
      signal: AbortSignal.timeout(500),
    });
    if (health.ok) return;
  } catch {
    // The native host is Chrome-launched, so it can recover the local authority
    // after login, sleep, a process crash, or a browser update.
  }
  const desktopEntry = fileURLToPath(new URL("../../desktop/dist/index.js", import.meta.url));
  if (!existsSync(desktopEntry)) {
    stderrLogger.warn("desktop_autostart_skipped", { reason: "desktop_build_missing" });
    return;
  }
  const child = spawn(process.execPath, [desktopEntry], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
    env: process.env,
  });
  child.unref();
  stderrLogger.info("desktop_autostart_requested", { trigger: "chrome_native_host" });
};

await ensureDesktopAuthority();

const desktopUrlArgument = process.argv.find((argument) => argument.startsWith("--desktop-url="));
const desktopUrl =
  desktopUrlArgument?.slice("--desktop-url=".length) ??
  process.env["IBP_DESKTOP_WS_URL"] ??
  "ws://127.0.0.1:47821/native";
const parsedDesktopUrl = new URL(desktopUrl);
if (parsedDesktopUrl.protocol !== "ws:" || parsedDesktopUrl.hostname !== "127.0.0.1") {
  throw new Error("Native host desktop transport must use ws://127.0.0.1");
}
const bridge = new NativeHostBridge({
  input: process.stdin,
  output: process.stdout,
  desktopUrl,
  logger: stderrLogger,
});

bridge.start();
process.stdin.resume();

const shutdown = (): void => {
  bridge.stop();
  process.exitCode = 0;
};

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
