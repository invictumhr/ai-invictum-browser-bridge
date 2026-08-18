import { InMemoryAuditLog } from "@invictum/audit-log";
import { DesktopBridgeServer } from "@invictum/desktop";

const audit = new InMemoryAuditLog();
const desktop = new DesktopBridgeServer({
  host: "127.0.0.1",
  port: 47_821,
  requestTimeoutMs: 5_000,
  auditLog: audit,
});

try {
  const address = await desktop.start();
  await desktop.waitForConnection(10_000);
  const result = await desktop.listTabs({
    sessionId: "chrome-list-tabs-smoke",
    agentId: "local-development-agent",
    clientId: "integration-smoke",
    sessionAuthorized: true,
  });
  process.stdout.write(
    `${JSON.stringify({
      success: true,
      transport: address.url,
      count: result.count,
      tabs: result.tabs.map((tab) => ({
        tabId: tab.tabId,
        windowId: tab.windowId,
        active: tab.active,
        title: tab.title,
        url: tab.url,
        restricted: tab.restricted,
      })),
      audit: audit.list().map((entry) => ({
        tool: entry.tool,
        riskLevel: entry.riskLevel,
        result: entry.result,
      })),
    })}\n`,
  );
} finally {
  await desktop.stop();
}
