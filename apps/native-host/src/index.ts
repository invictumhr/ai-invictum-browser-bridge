#!/usr/bin/env node

import { NativeHostBridge } from "./bridge.js";
import { stderrLogger } from "./logger.js";

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
