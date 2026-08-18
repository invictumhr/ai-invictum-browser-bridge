import { InMemoryAuditLog } from "@invictum/audit-log";
import { DesktopBridgeServer } from "@invictum/desktop";

const tabIdArgument = process.argv.find((argument) => argument.startsWith("--tab-id="));
const requestedTabId =
  tabIdArgument === undefined ? undefined : Number(tabIdArgument.slice("--tab-id=".length));
if (requestedTabId !== undefined && (!Number.isInteger(requestedTabId) || requestedTabId < 0)) {
  throw new Error("--tab-id must be a non-negative integer");
}

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
  const tabId =
    requestedTabId ??
    (
      await desktop.listTabs({
        sessionId: "chrome-page-snapshot-smoke",
        agentId: "local-development-agent",
        clientId: "integration-smoke",
        sessionAuthorized: true,
      })
    ).tabs.find(
      (tab) =>
        tab.active && !tab.restricted && tab.url.startsWith("http://127.0.0.1:47822/basic-form"),
    )?.tabId;
  if (tabId === undefined) {
    throw new Error(
      "No active Invictum fixture tab was found; open http://127.0.0.1:47822/basic-form and keep it active",
    );
  }
  const snapshot = await desktop.getPageSnapshot(
    {
      sessionId: "chrome-page-snapshot-smoke",
      agentId: "local-development-agent",
      clientId: "integration-smoke",
      sessionAuthorized: true,
    },
    { tabId },
  );
  const serializedSnapshot = JSON.stringify(snapshot);
  const forbiddenFixtureValues = [
    "fixture-secret",
    "person@example.test",
    "must-never-leave-the-page",
    "123456",
    "hidden-content-must-not-appear",
  ];
  const leakedValues = forbiddenFixtureValues.filter((value) => serializedSnapshot.includes(value));
  if (leakedValues.length > 0) {
    throw new Error(`Snapshot leaked protected fixture values: ${leakedValues.join(", ")}`);
  }
  if (!snapshot.page.url.includes("[REDACTED]") && !snapshot.page.url.includes("%5BREDACTED%5D")) {
    throw new Error("Snapshot URL did not contain the expected redaction marker");
  }
  if (snapshot.elements.filter((element) => element.sensitive).length < 2) {
    throw new Error("Snapshot did not classify both password and OTP fields as sensitive");
  }
  if (snapshot.frames.length < 2 || snapshot.forms.length < 1 || snapshot.alerts.length < 1) {
    throw new Error("Snapshot is missing the expected frame, form, or alert structure");
  }
  process.stdout.write(
    `${JSON.stringify({
      success: true,
      transport: address.url,
      page: snapshot.page,
      counts: {
        frames: snapshot.frames.length,
        elements: snapshot.elements.length,
        forms: snapshot.forms.length,
        dialogs: snapshot.dialogs.length,
        alerts: snapshot.alerts.length,
        textBlocks: snapshot.textBlocks.length,
      },
      metadata: snapshot.metadata,
      privacyAssertions: {
        forbiddenValuesAbsent: true,
        urlRedacted: true,
        sensitiveFieldsClassified: true,
      },
      sample: snapshot.elements.slice(0, 20).map((element) => ({
        elementId: element.elementId,
        tag: element.tag,
        role: element.role,
        name: element.name,
        text: element.sensitive ? "[REDACTED]" : element.text,
        sensitive: element.sensitive,
        clickable: element.clickable,
        editable: element.editable,
      })),
      audit: audit.list().map((entry) => ({
        tool: entry.tool,
        riskLevel: entry.riskLevel,
        result: entry.result,
        tabId: entry.tabId,
      })),
    })}\n`,
  );
} finally {
  await desktop.stop();
}
