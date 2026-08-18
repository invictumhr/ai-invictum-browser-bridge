import { InMemoryAuditLog } from "@invictum/audit-log";
import { DesktopBridgeServer } from "@invictum/desktop";
import { IbpProtocolError } from "@invictum/protocol";

const audit = new InMemoryAuditLog();
const desktop = new DesktopBridgeServer({
  host: "127.0.0.1",
  port: 47_821,
  requestTimeoutMs: 5_000,
  auditLog: audit,
});
const context = {
  sessionId: "chrome-find-elements-smoke",
  agentId: "local-development-agent",
  clientId: "integration-smoke",
  sessionAuthorized: true,
};

try {
  const address = await desktop.start();
  await desktop.waitForConnection(10_000);
  const tabs = await desktop.listTabs(context);
  const tab = tabs.tabs.find(
    (candidate) =>
      candidate.active &&
      !candidate.restricted &&
      candidate.url.startsWith("http://127.0.0.1:47822/basic-form"),
  );
  if (tab === undefined) {
    throw new Error("No active Invictum fixture tab was found");
  }

  const snapshot = await desktop.getPageSnapshot(context, { tabId: tab.tabId });
  const saveInSnapshot = snapshot.elements.find(
    (element) => element.role === "button" && element.name === "Preview settings",
  );
  const passwordInSnapshot = snapshot.elements.find(
    (element) => element.sensitive && element.name === "Password",
  );
  const frameButtonInSnapshot = snapshot.elements.find(
    (element) => element.role === "button" && element.name === "Frame action",
  );
  if (
    saveInSnapshot === undefined ||
    passwordInSnapshot === undefined ||
    frameButtonInSnapshot === undefined
  ) {
    throw new Error("Snapshot is missing the save, password, or frame-button fixture element");
  }

  const save = await desktop.findElements(context, {
    tabId: tab.tabId,
    documentId: snapshot.metadata.documentId,
    domRevision: snapshot.metadata.domRevision,
    role: "button",
    name: "Preview settings",
    css: "#save",
    xpath: "//*[@id='save']",
    testId: "fixture-save",
    enabled: true,
    parent: { tag: "form" },
    proximity: { elementId: passwordInSnapshot.elementId, maxDistancePx: 1_000 },
    matchMode: "exact",
  });
  if (save.count !== 1 || save.matches[0]?.element.elementId !== saveInSnapshot.elementId) {
    throw new Error("Semantic save-button search did not preserve the snapshot element reference");
  }

  const password = await desktop.findElements(context, {
    tabId: tab.tabId,
    documentId: snapshot.metadata.documentId,
    domRevision: snapshot.metadata.domRevision,
    label: "Password",
    inputType: "password",
    matchMode: "exact",
  });
  const passwordMatch = password.matches[0]?.element;
  if (
    password.count !== 1 ||
    passwordMatch?.sensitive !== true ||
    passwordMatch.text !== "[REDACTED]"
  ) {
    throw new Error("Password search did not preserve sensitive-field redaction");
  }

  const frameButton = await desktop.findElements(context, {
    tabId: tab.tabId,
    documentId: snapshot.metadata.documentId,
    domRevision: snapshot.metadata.domRevision,
    regex: { pattern: "^Frame action$", flags: "iu" },
    role: "button",
    frameId: frameButtonInSnapshot.frameId,
    matchMode: "exact",
  });
  if (frameButton.count !== 1 || frameButton.matches[0]?.element.frameId === "top") {
    throw new Error("Frame-scoped regex search did not return the iframe button");
  }

  let staleRejected = false;
  try {
    await desktop.findElements(context, {
      tabId: tab.tabId,
      documentId: snapshot.metadata.documentId,
      domRevision: snapshot.metadata.domRevision + 1,
      role: "button",
    });
  } catch (error) {
    staleRejected = error instanceof IbpProtocolError && error.code === "STALE_ELEMENT_REFERENCE";
  }
  if (!staleRejected) {
    throw new Error("An incorrect DOM revision did not fail with STALE_ELEMENT_REFERENCE");
  }

  const auditEntries = audit.list();
  if (JSON.stringify(auditEntries).includes("Preview settings")) {
    throw new Error("Raw find-elements query text leaked into the audit log");
  }
  const findAudit = auditEntries.filter((entry) => entry.tool === "browser.find_elements");
  if (
    findAudit.filter((entry) => entry.result === "success" && entry.riskLevel === "R0").length !==
      3 ||
    findAudit.filter((entry) => entry.result === "failure").length !== 1
  ) {
    throw new Error("Find-elements audit did not record the expected R0 success/failure results");
  }

  process.stdout.write(
    `${JSON.stringify({
      success: true,
      transport: address.url,
      tabId: tab.tabId,
      documentId: snapshot.metadata.documentId,
      domRevision: snapshot.metadata.domRevision,
      assertions: {
        semanticRanking: true,
        cssXPathTestId: true,
        parentAndProximity: true,
        sensitiveRedaction: true,
        frameRegex: true,
        staleRevisionRejected: true,
        rawQueryAbsentFromAudit: true,
      },
      matches: {
        save: save.matches.map((match) => ({
          elementId: match.element.elementId,
          score: match.score,
          matchedBy: match.matchedBy,
        })),
        password: password.matches.map((match) => ({
          elementId: match.element.elementId,
          sensitive: match.element.sensitive,
          text: match.element.text,
        })),
        frameButton: frameButton.matches.map((match) => ({
          elementId: match.element.elementId,
          frameId: match.element.frameId,
        })),
      },
      audit: findAudit.map((entry) => ({
        tool: entry.tool,
        riskLevel: entry.riskLevel,
        result: entry.result,
        sanitizedParameters: entry.sanitizedParameters,
      })),
    })}\n`,
  );
} finally {
  await desktop.stop();
}
