#!/usr/bin/env node

import { DesktopBridgeServer } from "./server.js";
import { DesktopControlServer } from "./control-server.js";

const port = Number.parseInt(process.env["IBP_DESKTOP_WS_PORT"] ?? "47821", 10);
const controlPort = Number.parseInt(process.env["IBP_CONTROL_PORT"] ?? "47820", 10);
const server = new DesktopBridgeServer({ port });
const address = await server.start();
const control = new DesktopControlServer({ bridge: server, port: controlPort });
const controlAddress = await control.start();

process.stdout.write(
  `Invictum Browser Bridge authority listening at ${address.url}; agent control at ${controlAddress.url}\n`,
);

const shutdown = async (): Promise<void> => {
  await control.stop();
  await server.stop();
  process.exitCode = 0;
};

process.once("SIGINT", () => {
  void shutdown();
});
process.once("SIGTERM", () => {
  void shutdown();
});
