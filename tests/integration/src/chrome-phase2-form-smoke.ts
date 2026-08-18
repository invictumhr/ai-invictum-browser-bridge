import { randomUUID } from "node:crypto";

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
  sessionId: "chrome-phase2-form-smoke",
  agentId: "local-development-agent",
  clientId: "integration-smoke",
  sessionAuthorized: true,
};
const preconditionEmail = `precondition.${randomUUID()}@example.test`;
const typedEmail = "agent.fixture@example.test";

try {
  const address = await desktop.start();
  await desktop.waitForConnection(10_000);
  const tabs = await desktop.listTabs(context);
  const isFixture = (candidate: (typeof tabs.tabs)[number]): boolean =>
    !candidate.restricted && candidate.url.startsWith("http://127.0.0.1:47822/basic-form");
  const tab =
    tabs.tabs.find((candidate) => candidate.active && isFixture(candidate)) ??
    tabs.tabs.find(isFixture);
  if (tab === undefined) throw new Error("No Invictum fixture tab was found");

  const initial = await desktop.getPageSnapshot(context, { tabId: tab.tabId });
  const initialSerialized = JSON.stringify(initial);
  for (const forbidden of [
    "fixture-secret",
    "must-never-leave-the-page",
    "123456",
    "AI agent radi",
    "AI control",
    "data-invictum-control-ui",
  ]) {
    if (initialSerialized.includes(forbidden)) {
      throw new Error(`Initial snapshot leaked protected fixture value: ${forbidden}`);
    }
  }

  const email = await desktop.findElements(context, {
    tabId: tab.tabId,
    documentId: initial.metadata.documentId,
    domRevision: initial.metadata.domRevision,
    role: "textbox",
    label: "Email",
    inputType: "email",
    matchMode: "exact",
  });
  const preview = await desktop.findElements(context, {
    tabId: tab.tabId,
    documentId: initial.metadata.documentId,
    domRevision: initial.metadata.domRevision,
    role: "button",
    name: "Preview settings",
    css: "#save",
    xpath: "//*[@id='save']",
    testId: "fixture-save",
    parent: { tag: "form" },
    matchMode: "exact",
  });
  if (email.count !== 1 || preview.count !== 1) {
    throw new Error("Semantic fixture element search did not return unique email/preview controls");
  }

  const prepared = await desktop.typeText(context, {
    tabId: tab.tabId,
    documentId: initial.metadata.documentId,
    domRevision: initial.metadata.domRevision,
    elementId: email.matches[0]!.element.elementId,
    text: preconditionEmail,
  });
  if (
    !prepared.changed ||
    prepared.characters !== preconditionEmail.length ||
    prepared.resolvedElementId === undefined
  ) {
    throw new Error("type_text did not establish a value and return a reusable reference");
  }

  const typed = await desktop.typeText(context, {
    tabId: tab.tabId,
    documentId: prepared.documentId,
    domRevision: prepared.domRevisionAfter,
    elementId: prepared.resolvedElementId,
    text: typedEmail,
  });
  if (
    !typed.changed ||
    typed.characters !== typedEmail.length ||
    !typed.requiresNewSnapshot ||
    typed.resolvedElementId === undefined
  ) {
    throw new Error("type_text did not reuse and refresh its revision-bound reference");
  }

  let staleRejected = false;
  try {
    await desktop.findElements(context, {
      tabId: tab.tabId,
      documentId: initial.metadata.documentId,
      domRevision: initial.metadata.domRevision,
      role: "button",
    });
  } catch (error) {
    staleRejected = error instanceof IbpProtocolError && error.code === "STALE_ELEMENT_REFERENCE";
  }
  if (!staleRejected) throw new Error("A reference two revisions behind was not rejected");

  const refreshedPreview = await desktop.findElements(context, {
    tabId: tab.tabId,
    documentId: typed.documentId,
    domRevision: typed.domRevisionAfter,
    role: "button",
    name: "Preview settings",
    matchMode: "exact",
  });
  if (refreshedPreview.count !== 1) throw new Error("Preview button was not found after type_text");

  const clicked = await desktop.click(context, {
    tabId: tab.tabId,
    documentId: typed.documentId,
    domRevision: typed.domRevisionAfter,
    elementId: refreshedPreview.matches[0]!.element.elementId,
  });
  if (
    !clicked.clicked ||
    !clicked.domChanged ||
    !clicked.requiresNewSnapshot ||
    clicked.resolvedElementId === undefined
  ) {
    throw new Error("click did not report the expected mutation and refreshed reference");
  }

  const finalSnapshot = await desktop.getPageSnapshot(context, { tabId: tab.tabId });
  if (
    !finalSnapshot.alerts.some(
      (alert) => alert.text === "Settings previewed with the updated email.",
    )
  ) {
    throw new Error("Fixture did not observe the typed value after the semantic click");
  }
  if (JSON.stringify(finalSnapshot).includes(typedEmail)) {
    throw new Error("Typed input value leaked into the post-click snapshot");
  }

  const password = await desktop.findElements(context, {
    tabId: tab.tabId,
    documentId: finalSnapshot.metadata.documentId,
    domRevision: finalSnapshot.metadata.domRevision,
    label: "Password",
    inputType: "password",
    matchMode: "exact",
  });
  let sensitiveTypingDenied = false;
  try {
    await desktop.typeText(context, {
      tabId: tab.tabId,
      documentId: finalSnapshot.metadata.documentId,
      domRevision: finalSnapshot.metadata.domRevision,
      elementId: password.matches[0]!.element.elementId,
      text: "blocked-sensitive-value",
    });
  } catch (error) {
    sensitiveTypingDenied = error instanceof IbpProtocolError && error.code === "POLICY_DENIED";
  }
  if (!sensitiveTypingDenied) throw new Error("Sensitive text input was not denied fail-closed");

  const unlocked = await desktop.unlockTab(context, { tabId: tab.tabId });
  if (!unlocked.unlocked) throw new Error("Agent tab reservation was not unlocked");

  const entries = audit.list();
  const serializedAudit = JSON.stringify(entries);
  if (
    serializedAudit.includes(preconditionEmail) ||
    serializedAudit.includes(typedEmail) ||
    serializedAudit.includes("blocked-sensitive-value")
  ) {
    throw new Error("Raw typed text leaked into the audit log");
  }
  const clickAudit = entries.find((entry) => entry.tool === "browser.click");
  const typeAudit = entries.filter((entry) => entry.tool === "browser.type_text");
  const unlockAudit = entries.find((entry) => entry.tool === "browser.unlock_tab");
  if (clickAudit?.riskLevel !== "R1" || clickAudit.result !== "success") {
    throw new Error("Click audit did not record an R1 success");
  }
  if (
    typeAudit.filter((entry) => entry.riskLevel === "R1" && entry.result === "success").length !==
      2 ||
    typeAudit.filter((entry) => entry.result === "denied").length !== 1
  ) {
    throw new Error("type_text audit did not record the expected R1 success/denial");
  }
  if (unlockAudit?.riskLevel !== "R0" || unlockAudit.result !== "success") {
    throw new Error("Tab unlock audit did not record an R0 success");
  }

  process.stdout.write(
    `${JSON.stringify({
      success: true,
      transport: address.url,
      tabId: tab.tabId,
      documentId: finalSnapshot.metadata.documentId,
      revisions: {
        initial: initial.metadata.domRevision,
        prepared: prepared.domRevisionAfter,
        afterType: typed.domRevisionAfter,
        afterClick: finalSnapshot.metadata.domRevision,
      },
      assertions: {
        semanticFind: true,
        cssXPathTestId: true,
        typeText: true,
        click: true,
        staleReferencesRejected: true,
        sensitiveTypingDenied: true,
        typedValuesAbsentFromSnapshots: true,
        typedValuesAbsentFromAudit: true,
        tabReservationReleased: true,
      },
      result: {
        alert: finalSnapshot.alerts.map((alert) => alert.text),
        clickRisk: clickAudit.riskLevel,
        typeResults: typeAudit.map((entry) => entry.result),
      },
    })}\n`,
  );
} finally {
  await desktop.stop();
}
