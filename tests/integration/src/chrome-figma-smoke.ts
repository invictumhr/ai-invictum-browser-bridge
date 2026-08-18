import { InMemoryAuditLog } from "@invictum/audit-log";
import { DesktopBridgeServer } from "@invictum/desktop";

/**
 * Real-Chrome smoke test for the Figma adapter.
 *
 * Pass a Figma design URL as the first argument, or set FIGMA_SMOKE_URL. No
 * default is baked in: a file key identifies someone's private document and
 * does not belong in the repository.
 *
 * The tab opens in the agent's own window, which is what lets Figma finish
 * initialising: it does not do so in a tab that has never been visible.
 */
const url = process.argv[2] ?? process.env["FIGMA_SMOKE_URL"];
if (url === undefined || url.length === 0) {
  process.stdout.write(
    `${JSON.stringify({
      success: false,
      error: "Pass a Figma design URL as the first argument or set FIGMA_SMOKE_URL",
    })}\n`,
  );
  process.exit(1);
}

const context = {
  sessionId: "chrome-figma-smoke",
  agentId: "local-development-agent",
  clientId: "integration-smoke",
  sessionAuthorized: true,
};

const audit = new InMemoryAuditLog();
const desktop = new DesktopBridgeServer({
  host: "127.0.0.1",
  port: 47_821,
  requestTimeoutMs: 20_000,
  auditLog: audit,
});

const delay = async (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

let tabId: number | undefined;
try {
  await desktop.start();
  await desktop.waitForConnection(10_000);

  const opened = await desktop.openTab(context, { url });
  tabId = opened.tab.tabId;

  // Figma takes its time even in a visible tab; wait on the anchors rather than
  // on load state, because an unloaded file and a changed Figma UI look alike.
  let health = await desktop.figmaHealthcheck(context, { tabId });
  for (let attempt = 0; attempt < 40 && !health.ok; attempt += 1) {
    await delay(3_000);
    health = await desktop.figmaHealthcheck(context, { tabId });
  }
  if (!health.ok) {
    throw new Error(
      `Figma anchors did not resolve. Missing: ${health.checks
        .filter((check) => !check.ok)
        .map((check) => check.anchor)
        .join(", ")}`,
    );
  }

  const document = await desktop.getFigmaDocument(context, { tabId });
  const layers = await desktop.getFigmaLayers(context, { tabId, maxRows: 20 });
  const properties = await desktop.getFigmaProperties(context, { tabId });

  if (document.pages.length === 0) throw new Error("No Figma pages were listed");
  if (layers.renderedOnly !== true) throw new Error("Layer results must declare renderedOnly");
  for (const layer of layers.layers) {
    if (/toggle layer/iu.test(layer.name)) {
      throw new Error(`Layer name absorbed a row control: ${layer.name}`);
    }
  }

  process.stdout.write(
    `${JSON.stringify({
      success: true,
      file: document.file.name,
      mode: document.mode,
      pages: document.pages,
      layerCount: layers.layers.length,
      layersTruncated: layers.truncated,
      firstLayers: layers.layers.slice(0, 5).map((layer) => layer.name),
      propertySource: properties.source,
      propertySections: properties.sections.map((section) => section.name),
      anchors: health.checks.map((check) => ({ anchor: check.anchor, ok: check.ok })),
      audit: audit.list().map((entry) => ({
        tool: entry.tool,
        riskLevel: entry.riskLevel,
        result: entry.result,
      })),
    })}\n`,
  );
} catch (error) {
  process.stdout.write(
    `${JSON.stringify({ success: false, error: error instanceof Error ? error.message : String(error) })}\n`,
  );
  process.exitCode = 1;
} finally {
  if (tabId !== undefined) {
    await desktop
      .closeTab(context, {
        tabId,
        authorization: { source: "explicit_user_instruction", instructionId: "figma-smoke" },
      })
      .catch(() => undefined);
  }
  await desktop.stop();
}
