import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { InvictumControlClient } from "@invictum/agent-sdk";

const execFileAsync = promisify(execFile);
const cliEntry = fileURLToPath(new URL("../../../apps/cli/dist/index.js", import.meta.url));
const fixtureUrl = "http://127.0.0.1:47822/basic-form?session=agent-control-secret#form";

// This deliberately exercises the CLI auto-start path before the SDK uses the
// persistent authority. It does not take ownership of port 47821.
await execFileAsync(process.execPath, [cliEntry, "ping"], {
  windowsHide: true,
  timeout: 15_000,
});

const client = new InvictumControlClient({
  context: {
    sessionId: `chrome-agent-control-${Date.now()}`,
    agentId: "integration-agent",
    clientId: "chrome-agent-control-smoke",
    sessionAuthorized: true,
  },
});

let tabId: number | undefined;
try {
  const capabilities = await client.call<{
    actions: { action: string }[];
    features: { persistentHttpHostAccess: boolean; scopedSnapshots: boolean };
  }>("system.capabilities");
  const actionNames = new Set(capabilities.actions.map(({ action }) => action));
  for (const required of [
    "browser.open_tab",
    "browser.navigate",
    "browser.wait_for",
    "browser.get_page_snapshot",
  ]) {
    if (!actionNames.has(required)) throw new Error(`Runtime capability is missing ${required}`);
  }
  if (!capabilities.features.persistentHttpHostAccess || !capabilities.features.scopedSnapshots) {
    throw new Error("Runtime does not report persistent host access and scoped snapshots");
  }

  const opened = await client.call<{ tab: { tabId: number; url: string } }>("browser.open_tab", {
    url: fixtureUrl,
    active: true,
  });
  tabId = opened.tab.tabId;

  const result = await client.withReservedTab(tabId, async (browser) => {
    const ready = await browser.call<{ documentId: string; domRevision: number }>(
      "browser.wait_for",
      {
        tabId,
        condition: { type: "selector", value: "#account-form" },
        timeoutMs: 10_000,
      },
    );
    const snapshot = await browser.call<{
      metadata: { documentId: string; domRevision: number; elementCount: number };
    }>("browser.get_page_snapshot", { tabId, detail: "interactive" });
    const found = await browser.call<{
      matches: { element: { elementId: string } }[];
      count: number;
    }>("browser.find_elements", {
      tabId,
      documentId: snapshot.metadata.documentId,
      domRevision: snapshot.metadata.domRevision,
      css: "#account-form",
      maxResults: 2,
    });
    if (found.count !== 1 || found.matches[0] === undefined) {
      throw new Error(`Expected one #account-form match, received ${found.count}`);
    }
    const scoped = await browser.call<{
      metadata: { elementCount: number };
    }>("browser.get_page_snapshot", {
      tabId,
      detail: "semantic",
      scope: {
        documentId: snapshot.metadata.documentId,
        domRevision: snapshot.metadata.domRevision,
        elementId: found.matches[0].element.elementId,
      },
    });
    if (scoped.metadata.elementCount >= snapshot.metadata.elementCount) {
      throw new Error("Scoped snapshot did not reduce the page element count");
    }

    const navigated = await browser.call<{ tab: { url: string }; navigated: true }>(
      "browser.navigate",
      {
        tabId,
        url: "http://127.0.0.1:47822/basic-form?run=navigation-secret#ready",
        waitUntil: "complete",
      },
    );
    if (navigated.tab.url.includes("navigation-secret") || navigated.tab.url.includes("#ready")) {
      throw new Error("Navigation result leaked query or fragment data");
    }
    const stable = await browser.call<{ matched: true; conditionType: string }>(
      "browser.wait_for",
      {
        tabId,
        condition: { type: "dom_stable", stableMs: 300 },
        timeoutMs: 5_000,
      },
    );
    return {
      readyRevision: ready.domRevision,
      fullElements: snapshot.metadata.elementCount,
      scopedElements: scoped.metadata.elementCount,
      waitCondition: stable.conditionType,
    };
  });

  process.stdout.write(
    `${JSON.stringify({
      success: true,
      tabId,
      capabilities: capabilities.actions.length,
      ...result,
      unlocked: true,
    })}\n`,
  );
} finally {
  await client.closeSession().catch(() => undefined);
}
