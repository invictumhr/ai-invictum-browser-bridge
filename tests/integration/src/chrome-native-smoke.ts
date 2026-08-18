import { randomUUID } from "node:crypto";

import { DesktopBridgeServer } from "@invictum/desktop";

const desktop = new DesktopBridgeServer({
  host: "127.0.0.1",
  port: 47_821,
  requestTimeoutMs: 5_000,
});

try {
  const address = await desktop.start();
  await desktop.waitForConnection(10_000);
  const pong = await desktop.ping(`chrome-smoke-${randomUUID()}`);
  process.stdout.write(
    `${JSON.stringify({
      success: true,
      transport: address.url,
      reply: pong.reply,
      component: pong.component,
      nonceLength: pong.nonce.length,
      receivedAt: pong.receivedAt,
    })}\n`,
  );
} finally {
  await desktop.stop();
}
