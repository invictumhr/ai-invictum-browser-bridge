import { randomUUID } from "node:crypto";

const controlUrl = process.env.INVICTUM_CONTROL_URL ?? "http://127.0.0.1:47820";
const context = {
  sessionId: `snapshot-benchmark-${randomUUID()}`,
  agentId: "snapshot-benchmark",
  clientId: "invictum-repo-script",
  sessionAuthorized: true,
};

const call = async (action, parameters = {}) => {
  const response = await fetch(`${controlUrl}/v1/call`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action, parameters, context }),
  });
  const body = await response.json();
  if (!response.ok || body.ok !== true) {
    throw new Error(
      `${action}: ${body.error?.code ?? response.status} ${body.error?.message ?? ""}`,
    );
  }
  return body.data;
};

const byteLength = (value) => Buffer.byteLength(JSON.stringify(value), "utf8");

const expandedEquivalent = (snapshot) => {
  const { outline: _outline, ...copy } = snapshot;
  return {
    ...copy,
    elements: snapshot.elements.map((element) => ({
      ...element,
      text: element.text ?? "",
      visible: element.visible ?? true,
      enabled: element.enabled ?? true,
      editable: element.editable ?? false,
      clickable: element.clickable ?? false,
      focused: element.focused ?? false,
      checked: element.checked ?? null,
      selected: element.selected ?? null,
      required: element.required ?? false,
      sensitive: element.sensitive ?? false,
      hasValue: element.hasValue ?? false,
      outsideViewport: element.outsideViewport ?? false,
    })),
  };
};

const healthResponse = await fetch(`${controlUrl}/v1/health`);
const health = await healthResponse.json();
if (!healthResponse.ok || health.nativeConnected !== true) {
  throw new Error(
    "Desktop Authority and the Chrome extension must be connected before benchmarking",
  );
}

const pages = process.argv.slice(2);
if (pages.length === 0) {
  pages.push("http://127.0.0.1:47822/basic-form", "https://example.com/");
}

const results = [];
try {
  for (const url of pages) {
    const opened = await call("browser.open_tab", {
      url,
      active: true,
      waitUntil: "complete",
      timeoutMs: 30_000,
    });
    const tabId = opened.tab.tabId;
    try {
      const interactive = await call("browser.get_page_snapshot", {
        tabId,
        detail: "interactive",
      });
      const outline = await call("browser.get_page_snapshot", { tabId, detail: "outline" });
      const expandedBytes = byteLength(expandedEquivalent(interactive));
      const interactiveBytes = byteLength(interactive);
      const outlineBytes = byteLength(outline);
      results.push({
        url,
        tabId,
        elements: interactive.metadata.elementCount,
        outlineElements: outline.metadata.elementCount,
        expandedBytes,
        interactiveBytes,
        outlineBytes,
        interactiveReductionPercent: Number(
          (((expandedBytes - interactiveBytes) / expandedBytes) * 100).toFixed(1),
        ),
        outlineReductionPercent: Number(
          (((expandedBytes - outlineBytes) / expandedBytes) * 100).toFixed(1),
        ),
      });
    } finally {
      await call("browser.unlock_tab", { tabId }).catch(() => undefined);
    }
  }
} finally {
  await fetch(`${controlUrl}/v1/session/close`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ context }),
  }).catch(() => undefined);
}

process.stdout.write(`${JSON.stringify({ success: true, results })}\n`);
