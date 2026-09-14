import { randomUUID } from "node:crypto";

import { InvictumControlClient } from "@invictum/agent-sdk";
import type {
  CaptureScreenshotData,
  CloseTabData,
  CompareScreenshotData,
  GetAccessibilityTreeData,
  GetNavigationStateData,
  GetPerformanceMetricsData,
  ListFramesData,
  ListWebMcpToolsData,
  ManagedDownloadData,
  OpenTabData,
  SystemHealthDetailsData,
  WaitForData,
} from "@invictum/protocol";

const configuredFixtureUrl =
  process.env.INVICTUM_FIXTURE_URL ?? "http://127.0.0.1:47822/kitchen-sink";
const fixtureOrigin = new URL(configuredFixtureUrl).origin;
const fixtureUrl = `${fixtureOrigin}/basic-form`;
const authorization = {
  source: "explicit_user_instruction" as const,
  instructionId: "user-production-hardening-smoke",
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const main = async (): Promise<void> => {
  const client = new InvictumControlClient({
    context: {
      sessionId: `integration-hardening-${randomUUID()}`,
      agentId: "integration-hardening",
      clientId: "chrome-hardening-smoke",
      sessionAuthorized: true,
    },
  });
  let tabId: number | undefined;
  try {
    const health = await client.call<SystemHealthDetailsData>("system.health_details", {});
    assert(health.nativeConnected, "Native Host is not connected");
    assert(health.authenticatedControlApi, "Control API is not authenticated");
    assert(health.journalEnabled, "Durable operation journal is disabled");
    assert(health.auditPersistenceEnabled, "Persistent audit is disabled");

    const opened = await client.call<OpenTabData>("browser.open_tab", {
      url: fixtureUrl,
      active: false,
    });
    tabId = opened.tab.tabId;
    assert(!opened.tab.active, "Hardening fixture stole browser focus");

    const results = await client.withReservedTab(tabId, async (browser) => {
      await browser.call<WaitForData>("browser.wait_for", {
        tabId: tabId!,
        condition: { type: "selector", value: "iframe" },
        timeoutMs: 10_000,
      });
      await browser.call<WaitForData>("browser.wait_for", {
        tabId: tabId!,
        condition: { type: "dom_stable", stableMs: 300 },
        timeoutMs: 5_000,
      });

      const frames = await browser.call<ListFramesData>("browser.list_frames", {
        tabId: tabId!,
        maxFrames: 20,
      });
      assert(frames.frames.length >= 2, "Frame tree did not include the fixture iframe");
      assert(
        frames.frames.some((frame) => frame.mainFrame),
        "Frame tree has no main frame",
      );
      assert(
        frames.frames.every((frame) => !frame.url.includes("?") && !frame.url.includes("#")),
        "Frame diagnostics leaked query or fragment data",
      );

      const navigation = await browser.call<GetNavigationStateData>(
        "browser.get_navigation_state",
        { tabId: tabId!, maxHistoryEntries: 10 },
      );
      assert(navigation.readyState === "complete", "Navigation diagnostics are not complete");
      assert(navigation.url === fixtureUrl, "Navigation diagnostics returned the wrong URL");

      const performance = await browser.call<GetPerformanceMetricsData>(
        "browser.get_performance_metrics",
        { tabId: tabId! },
      );
      assert(Object.keys(performance.metrics).length > 0, "Chrome returned no performance metrics");
      assert(performance.resourceSummary.count >= 0, "Resource summary is invalid");

      const accessibility = await browser.call<GetAccessibilityTreeData>(
        "browser.get_accessibility_tree",
        { tabId: tabId!, depth: 16, maxNodes: 1_000, interestingOnly: true },
      );
      assert(accessibility.nodes.length > 0, "Chrome returned no accessibility nodes");
      assert(/^[a-f0-9]{64}$/u.test(accessibility.fingerprint), "AX fingerprint is invalid");
      assert(!JSON.stringify(accessibility).includes('"value"'), "AX tree exposed control values");
      assert(
        !JSON.stringify(accessibility).includes("fixture-only-password"),
        "AX tree exposed the fixture password",
      );

      const baseline = await browser.call<CaptureScreenshotData>("browser.screenshot", {
        tabId: tabId!,
        mode: "viewport",
        quality: 70,
        maxWidth: 1_000,
        maxHeight: 700,
      });
      const comparison = await browser.call<CompareScreenshotData>("browser.compare_screenshot", {
        tabId: tabId!,
        baselineDataUrl: baseline.dataUrl,
        quality: 70,
        threshold: 0.15,
      });
      assert(comparison.totalPixels > 0, "Screenshot comparison returned no pixels");
      assert(comparison.dataUrl.startsWith("data:image/jpeg;base64,"), "Visual diff is not JPEG");

      const traced = await browser.enhancedCall("browser.get_navigation_state", {
        tabId: tabId!,
        timings: true,
        visualTrace: true,
      });
      assert(isRecord(traced) && isRecord(traced["visualTrace"]), "Visual trace is missing");
      assert(traced["visualTrace"]["available"] === true, "Visual trace is unavailable");
      assert(
        !JSON.stringify(traced).includes("data:image"),
        "Visual trace returned screenshot pixels",
      );

      const webMcp = await browser.call<ListWebMcpToolsData>("browser.list_webmcp_tools", {
        tabId: tabId!,
        discoveryWaitMs: 100,
      });
      assert(webMcp.untrusted, "WebMCP content was not marked untrusted");
      assert(typeof webMcp.supported === "boolean", "WebMCP support result is invalid");

      const startedDownload = await browser.call<ManagedDownloadData>("browser.download", {
        tabId: tabId!,
        url: `${fixtureOrigin}/download-test.txt`,
        maxBytes: 8,
        authorization,
      });
      const download = await browser.call<ManagedDownloadData>("browser.wait_for_download", {
        tabId: tabId!,
        downloadId: startedDownload.downloadId,
        timeoutMs: 10_000,
      });
      assert(download.managed, "Download was not bound to IBB managed state");
      assert(download.state === "interrupted", "Oversized managed download was not interrupted");
      assert(download.exceededLimit, "Managed download did not report the byte ceiling");
      assert(!JSON.stringify(download).includes("\\"), "Download result exposed a local path");

      return {
        frames: frames.frames.length,
        navigation: navigation.readyState,
        performanceMetrics: Object.keys(performance.metrics).length,
        accessibilityNodes: accessibility.nodes.length,
        visualDiffPixels: comparison.totalPixels,
        visualTrace: true,
        webMcpSupported: webMcp.supported,
        managedDownload: download.state,
      };
    });

    process.stdout.write(`${JSON.stringify({ ok: true, ...results })}\n`);
  } finally {
    if (tabId !== undefined) {
      await client
        .call<CloseTabData>("browser.close_tab", { tabId, authorization })
        .catch(() => undefined);
    }
    await client.closeSession().catch(() => undefined);
  }
};

await main();
