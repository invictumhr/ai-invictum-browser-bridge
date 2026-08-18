import { InMemoryAuditLog } from "@invictum/audit-log";
import { DesktopBridgeServer } from "@invictum/desktop";
import { IbpProtocolError, type AgentElement, type PageSnapshot } from "@invictum/protocol";

const audit = new InMemoryAuditLog();
const desktop = new DesktopBridgeServer({
  host: "127.0.0.1",
  port: 47_821,
  requestTimeoutMs: 7_500,
  auditLog: audit,
});
const context = {
  sessionId: "chrome-advanced-form-smoke",
  agentId: "local-development-agent",
  clientId: "integration-smoke",
  sessionAuthorized: true,
};
const authorization = {
  source: "explicit_user_instruction" as const,
  instructionId: "codex-user-submit-2026-07-22",
};

const findOne = async (
  tabId: number,
  snapshot: PageSnapshot,
  criteria: Omit<
    Parameters<typeof desktop.findElements>[1],
    "tabId" | "documentId" | "domRevision"
  >,
): Promise<AgentElement> => {
  const result = await desktop.findElements(context, {
    ...criteria,
    tabId,
    documentId: snapshot.metadata.documentId,
    domRevision: snapshot.metadata.domRevision,
    matchMode: criteria.matchMode ?? "exact",
  });
  if (result.count !== 1) {
    throw new Error(`Expected one fixture element, received ${result.count}`);
  }
  return result.matches[0]!.element;
};

const isDenied = (error: unknown, code: string): boolean =>
  error instanceof IbpProtocolError && error.code === code;

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
    throw new Error("No active Invictum advanced fixture tab was found");
  }

  let snapshot = await desktop.getPageSnapshot(context, { tabId: tab.tabId, detail: "full" });
  const textarea = await findOne(tab.tabId, snapshot, {
    role: "textbox",
    label: "Biography",
    tag: "textarea",
  });
  await desktop.typeText(context, {
    tabId: tab.tabId,
    documentId: snapshot.metadata.documentId,
    domRevision: snapshot.metadata.domRevision,
    elementId: textarea.elementId,
    text: "",
  });

  snapshot = await desktop.getPageSnapshot(context, { tabId: tab.tabId, detail: "full" });
  const editor = await findOne(tab.tabId, snapshot, {
    role: "textbox",
    name: "Rich text biography",
  });
  const editorText = "WYSIWYG content written by the agent.";
  await desktop.typeText(context, {
    tabId: tab.tabId,
    documentId: snapshot.metadata.documentId,
    domRevision: snapshot.metadata.domRevision,
    elementId: editor.elementId,
    text: editorText,
  });

  snapshot = await desktop.getPageSnapshot(context, { tabId: tab.tabId, detail: "full" });
  if (!snapshot.elements.some((element) => element.text?.includes(editorText) === true)) {
    throw new Error("WYSIWYG content did not survive the editor input workflow");
  }
  const frameInput = await findOne(tab.tabId, snapshot, {
    frameId: "frame_1",
    role: "textbox",
    label: "Frame note",
    tag: "input",
  });
  const frameTyped = await desktop.typeText(context, {
    tabId: tab.tabId,
    documentId: snapshot.metadata.documentId,
    domRevision: snapshot.metadata.domRevision,
    elementId: frameInput.elementId,
    text: "Updated inside the same-origin frame",
  });
  if (!frameTyped.changed) throw new Error("Same-origin iframe input did not change");

  snapshot = await desktop.getPageSnapshot(context, { tabId: tab.tabId, detail: "full" });
  const country = await findOne(tab.tabId, snapshot, {
    role: "combobox",
    label: "Country",
  });
  const selected = await desktop.selectOption(context, {
    tabId: tab.tabId,
    documentId: snapshot.metadata.documentId,
    domRevision: snapshot.metadata.domRevision,
    elementId: country.elementId,
    selection: { values: ["hr"] },
  });
  if (!selected.changed || selected.selectedCount !== 1 || selected.selectedIndices[0] !== 1) {
    throw new Error("Select-option interaction did not select Croatia");
  }

  snapshot = await desktop.getPageSnapshot(context, { tabId: tab.tabId, detail: "full" });
  const terms = await findOne(tab.tabId, snapshot, {
    role: "checkbox",
    name: "Accept terms",
  });
  const checked = await desktop.check(context, {
    tabId: tab.tabId,
    documentId: snapshot.metadata.documentId,
    domRevision: snapshot.metadata.domRevision,
    elementId: terms.elementId,
  });
  if (!checked.checked) throw new Error("Checkbox interaction did not check the control");

  const title = await desktop.evaluateJavaScript(context, {
    tabId: tab.tabId,
    expression: "document.title",
    authorization,
  });
  if (title.value !== "Invictum Phase 2 Form Fixture") {
    throw new Error("Read-only constrained JavaScript returned the wrong page title");
  }
  await desktop.evaluateJavaScript(context, {
    tabId: tab.tabId,
    expression: 'document.querySelector("#fixture-status")?.setAttribute("aria-live", "polite")',
    mode: "page_mutation",
    world: "MAIN",
    authorization,
  });
  let unsafeJavaScriptDenied = false;
  try {
    await desktop.evaluateJavaScript(context, {
      tabId: tab.tabId,
      expression: 'fetch("https://example.test")',
      mode: "page_mutation",
      authorization,
    });
  } catch (error) {
    unsafeJavaScriptDenied = isDenied(error, "SCRIPT_POLICY_DENIED");
  }
  if (!unsafeJavaScriptDenied) throw new Error("Unsafe network JavaScript was not denied");

  snapshot = await desktop.getPageSnapshot(context, { tabId: tab.tabId, detail: "full" });
  const previewButton = await findOne(tab.tabId, snapshot, {
    role: "button",
    name: "Preview settings",
  });
  if (previewButton.outsideViewport || previewButton.boundingBox.width === 0) {
    throw new Error("Coordinate-click fixture target is outside the visible viewport");
  }
  const screenshot = await desktop.captureScreenshot(context, {
    tabId: tab.tabId,
    quality: 70,
    maxWidth: 1_280,
    maxHeight: 900,
  });
  if (
    screenshot.mediaType !== "image/jpeg" ||
    !screenshot.dataUrl.startsWith("data:image/jpeg;base64,") ||
    screenshot.byteLength <= 0 ||
    screenshot.byteLength > 500_000 ||
    screenshot.width > 1_280 ||
    screenshot.height > 900 ||
    screenshot.viewport.cssWidth !== snapshot.page.viewport.width ||
    screenshot.viewport.cssHeight !== snapshot.page.viewport.height
  ) {
    throw new Error("Active-tab screenshot metadata or transport bounds are invalid");
  }
  const cursorClick = await desktop.clickAt(context, {
    tabId: tab.tabId,
    documentId: screenshot.documentId,
    domRevision: screenshot.domRevision,
    x: previewButton.boundingBox.x + previewButton.boundingBox.width / 2,
    y: previewButton.boundingBox.y + previewButton.boundingBox.height / 2,
  });
  if (!cursorClick.clicked || cursorClick.target.name !== "Preview settings") {
    throw new Error("Revision-bound coordinate click did not activate the preview button");
  }
  snapshot = await desktop.getPageSnapshot(context, { tabId: tab.tabId, detail: "full" });
  if (!snapshot.alerts.some((alert) => alert.text === "Email value was not updated.")) {
    throw new Error("The fixture did not observe the coordinate fallback click");
  }

  const submitButton = await findOne(tab.tabId, snapshot, {
    role: "button",
    name: "Submit settings",
  });
  let ordinarySubmitDenied = false;
  try {
    await desktop.click(context, {
      tabId: tab.tabId,
      documentId: snapshot.metadata.documentId,
      domRevision: snapshot.metadata.domRevision,
      elementId: submitButton.elementId,
    });
  } catch (error) {
    ordinarySubmitDenied = isDenied(error, "POLICY_DENIED");
  }
  if (!ordinarySubmitDenied) throw new Error("Ordinary click bypassed the submit policy");

  snapshot = await desktop.getPageSnapshot(context, { tabId: tab.tabId, detail: "full" });
  const form = await findOne(tab.tabId, snapshot, { css: "#account-form", tag: "form" });
  const submitted = await desktop.submitForm(context, {
    tabId: tab.tabId,
    documentId: snapshot.metadata.documentId,
    domRevision: snapshot.metadata.domRevision,
    elementId: form.elementId,
    authorization,
  });
  if (!submitted.submitted || !submitted.verificationRequired) {
    throw new Error("Authorized submit was not scheduled with mandatory verification");
  }
  await new Promise<void>((resolve) => setTimeout(resolve, 100));
  snapshot = await desktop.getPageSnapshot(context, { tabId: tab.tabId, detail: "full" });
  if (!snapshot.alerts.some((alert) => alert.text === "Form submitted by the authorized agent.")) {
    throw new Error("The fixture did not observe the authorized form submit");
  }

  await desktop.unlockTab(context, { tabId: tab.tabId });
  const entries = audit.list();
  const serializedAudit = JSON.stringify(entries);
  const screenshotPayloadFragment = screenshot.dataUrl.slice(23, 80);
  if (
    serializedAudit.includes(editorText) ||
    serializedAudit.includes("Updated inside the same-origin frame") ||
    serializedAudit.includes("document.title") ||
    serializedAudit.includes(screenshotPayloadFragment)
  ) {
    throw new Error("Raw editor, iframe, JavaScript, or screenshot data leaked into the audit log");
  }
  const submitAudit = entries.find((entry) => entry.tool === "browser.submit_form");
  const scriptAudits = entries.filter((entry) => entry.tool === "browser.evaluate");
  const screenshotAudit = entries.find((entry) => entry.tool === "browser.screenshot");
  const clickAtAudit = entries.find((entry) => entry.tool === "browser.click_at");
  if (
    submitAudit?.riskLevel !== "R2" ||
    submitAudit.confirmationId !== authorization.instructionId
  ) {
    throw new Error("Authorized submit audit does not contain the R2 authorization reference");
  }
  if (
    scriptAudits.length !== 3 ||
    scriptAudits.filter((entry) => entry.result === "denied").length !== 1
  ) {
    throw new Error("JavaScript audit did not record two successes and one policy denial");
  }
  if (screenshotAudit?.riskLevel !== "R0" || clickAtAudit?.riskLevel !== "R1") {
    throw new Error("Screenshot or coordinate-click audit risk classification is invalid");
  }

  process.stdout.write(
    `${JSON.stringify({
      success: true,
      transport: address.url,
      tabId: tab.tabId,
      assertions: {
        textareaClear: true,
        wysiwyg: true,
        sameOriginIframe: true,
        selectOption: true,
        checkbox: true,
        constrainedJavaScript: true,
        unsafeJavaScriptDenied: true,
        activeTabScreenshot: true,
        coordinateFallbackClick: true,
        ordinarySubmitDenied: true,
        authorizedSubmit: true,
        auditRedaction: true,
        tabReservationReleased: true,
      },
    })}\n`,
  );
} finally {
  await desktop.stop();
}
