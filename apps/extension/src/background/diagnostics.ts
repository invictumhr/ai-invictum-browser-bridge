import {
  CompareScreenshotDataSchema,
  GetAccessibilityTreeDataSchema,
  GetNavigationStateDataSchema,
  GetPerformanceMetricsDataSchema,
  IBP_ERROR_CODES,
  ListFramesDataSchema,
  type CompareScreenshotData,
  type CompareScreenshotParameters,
  type GetAccessibilityTreeData,
  type GetAccessibilityTreeParameters,
  type GetNavigationStateData,
  type GetNavigationStateParameters,
  type GetPerformanceMetricsData,
  type GetPerformanceMetricsParameters,
  type ListFramesData,
  type ListFramesParameters,
} from "@invictum/protocol";

import { ExtensionCommandError } from "./command-error.js";
import { debuggerSessions } from "./debugger-session.js";

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const sanitizedUrl = (raw: unknown): string => {
  if (typeof raw !== "string") return "";
  try {
    const url = new URL(raw);
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    return url.toString().slice(0, 4_096);
  } catch {
    return "about:invalid";
  }
};

const redactedText = (value: string): string =>
  value
    .slice(0, 2_000)
    .replace(/\b(Bearer\s+)[A-Za-z0-9._~+/=-]{12,}/giu, "$1[REDACTED]")
    .replace(/\b(password|passwd|secret|token|api[_-]?key)(\s*[:=]\s*)[^\s]+/giu, "$1$2[REDACTED]")
    .replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/gu, "[REDACTED JWT]");

const originFor = (raw: string): string => {
  try {
    const origin = new URL(raw).origin;
    return origin === "null" ? "" : origin.slice(0, 2_048);
  } catch {
    return "";
  }
};

const ensureDebuggerPermission = async (): Promise<void> => {
  if (await chrome.permissions.contains({ permissions: ["debugger"] })) return;
  throw new ExtensionCommandError(
    IBP_ERROR_CODES.PERMISSION_DENIED,
    "This diagnostic requires the Chrome debugger permission",
    false,
  );
};

const remoteValue = (response: unknown): unknown =>
  isRecord(response) && isRecord(response["result"]) ? response["result"]["value"] : undefined;

const numberOrUndefined = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;

export class ChromeDiagnosticsAdapter {
  public async listFrames(parameters: ListFramesParameters): Promise<ListFramesData> {
    await ensureDebuggerPermission();
    const lease = await debuggerSessions.acquire(parameters.tabId);
    try {
      await lease.sendCommand("Page.enable");
      const response = (await lease.sendCommand("Page.getFrameTree")) as UnknownRecord;
      const root = isRecord(response["frameTree"]) ? response["frameTree"] : undefined;
      if (root === undefined) throw this.#invalid("Chrome returned no frame tree");
      const collected: UnknownRecord[] = [];
      const walk = (tree: UnknownRecord): void => {
        const frame = isRecord(tree["frame"]) ? tree["frame"] : undefined;
        if (frame !== undefined) collected.push(frame);
        if (Array.isArray(tree["childFrames"])) {
          for (const child of tree["childFrames"]) if (isRecord(child)) walk(child);
        }
      };
      walk(root);
      const mainFrame = collected[0];
      const mainFrameId = typeof mainFrame?.["id"] === "string" ? mainFrame["id"] : undefined;
      if (mainFrameId === undefined) throw this.#invalid("Chrome returned an invalid main frame");
      const limited = collected.slice(0, parameters.maxFrames);
      return ListFramesDataSchema.parse({
        tabId: parameters.tabId,
        mainFrameId,
        frames: limited.map((frame) => {
          const url = sanitizedUrl(frame["url"]);
          return {
            frameId: String(frame["id"] ?? ""),
            ...(typeof frame["parentId"] === "string" ? { parentFrameId: frame["parentId"] } : {}),
            ...(typeof frame["loaderId"] === "string" ? { loaderId: frame["loaderId"] } : {}),
            name: typeof frame["name"] === "string" ? frame["name"].slice(0, 512) : "",
            url,
            origin: originFor(url),
            mimeType: typeof frame["mimeType"] === "string" ? frame["mimeType"].slice(0, 256) : "",
            securityOrigin:
              typeof frame["securityOrigin"] === "string"
                ? originFor(frame["securityOrigin"])
                : originFor(url),
            ...(typeof frame["unreachableUrl"] === "string" && frame["unreachableUrl"].length > 0
              ? { unreachableUrl: sanitizedUrl(frame["unreachableUrl"]) }
              : {}),
            mainFrame: frame["id"] === mainFrameId,
          };
        }),
        truncated: collected.length > limited.length,
      });
    } finally {
      await lease.release();
    }
  }

  public async navigationState(
    parameters: GetNavigationStateParameters,
  ): Promise<GetNavigationStateData> {
    await ensureDebuggerPermission();
    const lease = await debuggerSessions.acquire(parameters.tabId);
    try {
      await lease.sendCommand("Page.enable");
      const [treeResponse, historyResponse, runtimeResponse] = await Promise.all([
        lease.sendCommand("Page.getFrameTree"),
        lease.sendCommand("Page.getNavigationHistory"),
        lease.sendCommand("Runtime.evaluate", {
          expression: `(() => { const n=performance.getEntriesByType('navigation')[0]; return {readyState:document.readyState,visibilityState:document.visibilityState,timing:n?{navigationStart:n.startTime,domContentLoadedMs:n.domContentLoadedEventEnd,loadMs:n.loadEventEnd,responseEndMs:n.responseEnd}:{navigationStart:0}}; })()`,
          returnByValue: true,
          awaitPromise: false,
        }),
      ]);
      const tree =
        isRecord(treeResponse) && isRecord(treeResponse["frameTree"])
          ? treeResponse["frameTree"]
          : undefined;
      const frame = tree !== undefined && isRecord(tree["frame"]) ? tree["frame"] : undefined;
      const history = isRecord(historyResponse) ? historyResponse : {};
      const runtime = remoteValue(runtimeResponse);
      const runtimeRecord = isRecord(runtime) ? runtime : {};
      const timing = isRecord(runtimeRecord["timing"]) ? runtimeRecord["timing"] : {};
      const allEntries = Array.isArray(history["entries"])
        ? history["entries"].filter(isRecord)
        : [];
      const currentIndex =
        typeof history["currentIndex"] === "number" ? history["currentIndex"] : -1;
      const start = Math.max(0, currentIndex - Math.floor(parameters.maxHistoryEntries / 2));
      const selected = allEntries.slice(start, start + parameters.maxHistoryEntries);
      const url = sanitizedUrl(frame?.["url"]);
      const readyState = ["loading", "interactive", "complete"].includes(
        String(runtimeRecord["readyState"]),
      )
        ? String(runtimeRecord["readyState"])
        : "unknown";
      const visibilityState = ["hidden", "visible", "prerender"].includes(
        String(runtimeRecord["visibilityState"]),
      )
        ? String(runtimeRecord["visibilityState"])
        : "unknown";
      return GetNavigationStateDataSchema.parse({
        tabId: parameters.tabId,
        mainFrameId: String(frame?.["id"] ?? "unknown"),
        url,
        origin: originFor(url),
        readyState,
        visibilityState,
        currentHistoryIndex: currentIndex,
        history: selected.map((entry) => ({
          entryId: typeof entry["id"] === "number" ? entry["id"] : -1,
          url: sanitizedUrl(entry["url"]),
          title: typeof entry["title"] === "string" ? entry["title"].slice(0, 1_000) : "",
          transitionType:
            typeof entry["transitionType"] === "string"
              ? entry["transitionType"].slice(0, 128)
              : "unknown",
        })),
        historyTruncated: selected.length < allEntries.length,
        timing: {
          navigationStart: numberOrUndefined(timing["navigationStart"]) ?? 0,
          ...(numberOrUndefined(timing["domContentLoadedMs"]) === undefined
            ? {}
            : { domContentLoadedMs: numberOrUndefined(timing["domContentLoadedMs"]) }),
          ...(numberOrUndefined(timing["loadMs"]) === undefined
            ? {}
            : { loadMs: numberOrUndefined(timing["loadMs"]) }),
          ...(numberOrUndefined(timing["responseEndMs"]) === undefined
            ? {}
            : { responseEndMs: numberOrUndefined(timing["responseEndMs"]) }),
        },
      });
    } finally {
      await lease.release();
    }
  }

  public async performanceMetrics(
    parameters: GetPerformanceMetricsParameters,
  ): Promise<GetPerformanceMetricsData> {
    await ensureDebuggerPermission();
    const lease = await debuggerSessions.acquire(parameters.tabId);
    try {
      await lease.sendCommand("Performance.enable");
      const [metricsResponse, runtimeResponse] = await Promise.all([
        lease.sendCommand("Performance.getMetrics"),
        lease.sendCommand("Runtime.evaluate", {
          expression: `(() => { const nav=performance.getEntriesByType('navigation')[0]; const paints=performance.getEntriesByType('paint'); const lcp=performance.getEntriesByType('largest-contentful-paint').at(-1); const cls=performance.getEntriesByType('layout-shift').filter(e=>!e.hadRecentInput).reduce((s,e)=>s+e.value,0); const resources=performance.getEntriesByType('resource'); return {webVitals:{largestContentfulPaintMs:lcp?.startTime,cumulativeLayoutShift:cls,firstContentfulPaintMs:paints.find(e=>e.name==='first-contentful-paint')?.startTime},navigation:nav?{type:nav.type,domContentLoadedMs:nav.domContentLoadedEventEnd,loadMs:nav.loadEventEnd,responseEndMs:nav.responseEnd,transferSize:nav.transferSize,decodedBodySize:nav.decodedBodySize}:{type:'unknown'},resourceSummary:{count:resources.length,transferSize:resources.reduce((s,e)=>s+(e.transferSize||0),0),decodedBodySize:resources.reduce((s,e)=>s+(e.decodedBodySize||0),0)}}; })()`,
          returnByValue: true,
        }),
      ]);
      const metrics: Record<string, number> = {};
      if (isRecord(metricsResponse) && Array.isArray(metricsResponse["metrics"])) {
        for (const metric of metricsResponse["metrics"].filter(isRecord).slice(0, 128)) {
          if (typeof metric["name"] === "string" && typeof metric["value"] === "number") {
            metrics[metric["name"].slice(0, 128)] = metric["value"];
          }
        }
      }
      const page = remoteValue(runtimeResponse);
      const pageRecord = isRecord(page) ? page : {};
      const webVitals = isRecord(pageRecord["webVitals"]) ? pageRecord["webVitals"] : {};
      const navigation = isRecord(pageRecord["navigation"]) ? pageRecord["navigation"] : {};
      const resources = isRecord(pageRecord["resourceSummary"])
        ? pageRecord["resourceSummary"]
        : {};
      return GetPerformanceMetricsDataSchema.parse({
        tabId: parameters.tabId,
        metrics,
        webVitals: {
          ...(numberOrUndefined(webVitals["largestContentfulPaintMs"]) === undefined
            ? {}
            : { largestContentfulPaintMs: webVitals["largestContentfulPaintMs"] }),
          cumulativeLayoutShift: numberOrUndefined(webVitals["cumulativeLayoutShift"]) ?? 0,
          ...(numberOrUndefined(webVitals["firstContentfulPaintMs"]) === undefined
            ? {}
            : { firstContentfulPaintMs: webVitals["firstContentfulPaintMs"] }),
        },
        navigation: {
          type:
            typeof navigation["type"] === "string" ? navigation["type"].slice(0, 64) : "unknown",
          ...Object.fromEntries(
            ["domContentLoadedMs", "loadMs", "responseEndMs", "transferSize", "decodedBodySize"]
              .map((key) => [key, numberOrUndefined(navigation[key])])
              .filter((entry): entry is [string, number] => entry[1] !== undefined),
          ),
        },
        resourceSummary: {
          count:
            typeof resources["count"] === "number" && Number.isInteger(resources["count"])
              ? Math.max(0, resources["count"])
              : 0,
          transferSize: numberOrUndefined(resources["transferSize"]) ?? 0,
          decodedBodySize: numberOrUndefined(resources["decodedBodySize"]) ?? 0,
        },
      });
    } finally {
      await lease.sendCommand("Performance.disable").catch(() => undefined);
      await lease.release();
    }
  }

  public async accessibilityTree(
    parameters: GetAccessibilityTreeParameters,
  ): Promise<GetAccessibilityTreeData> {
    await ensureDebuggerPermission();
    const lease = await debuggerSessions.acquire(parameters.tabId);
    try {
      await lease.sendCommand("Accessibility.enable");
      const response = (await lease.sendCommand("Accessibility.getFullAXTree", {
        depth: parameters.depth,
        ...(parameters.frameId === undefined ? {} : { frameId: parameters.frameId }),
      })) as UnknownRecord;
      const allNodes = Array.isArray(response["nodes"]) ? response["nodes"].filter(isRecord) : [];
      const allowedProperties = new Set([
        "checked",
        "disabled",
        "expanded",
        "focused",
        "invalid",
        "level",
        "multiselectable",
        "orientation",
        "readonly",
        "required",
        "selected",
      ]);
      const filtered = allNodes.filter((node) => {
        if (!parameters.interestingOnly) return true;
        const ignored = node["ignored"] === true;
        const role = isRecord(node["role"]) ? node["role"]["value"] : undefined;
        return !ignored && role !== "none" && role !== "generic";
      });
      const limited = filtered.slice(0, parameters.maxNodes);
      const nodes = limited.map((node) => {
        const properties: Record<string, unknown> = {};
        if (Array.isArray(node["properties"])) {
          for (const property of node["properties"].filter(isRecord)) {
            const name = typeof property["name"] === "string" ? property["name"] : "";
            const raw = isRecord(property["value"]) ? property["value"]["value"] : undefined;
            if (
              allowedProperties.has(name) &&
              ["string", "number", "boolean"].includes(typeof raw)
            ) {
              properties[name] = raw;
            }
          }
        }
        const valueOf = (key: string): string => {
          const container = isRecord(node[key]) ? node[key] : undefined;
          return typeof container?.["value"] === "string" ? redactedText(container["value"]) : "";
        };
        return {
          nodeId: String(node["nodeId"] ?? ""),
          ...(typeof node["parentId"] === "string" ? { parentId: node["parentId"] } : {}),
          ...(typeof node["backendDOMNodeId"] === "number"
            ? { backendNodeId: node["backendDOMNodeId"] }
            : {}),
          role: valueOf("role"),
          name: valueOf("name"),
          ...(valueOf("description").length > 0 ? { description: valueOf("description") } : {}),
          ignored: node["ignored"] === true,
          properties,
        };
      });
      const canonical = JSON.stringify(nodes);
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
      const fingerprint = [...new Uint8Array(digest)]
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
      return GetAccessibilityTreeDataSchema.parse({
        tabId: parameters.tabId,
        ...(parameters.frameId === undefined ? {} : { frameId: parameters.frameId }),
        nodes,
        truncated: filtered.length > limited.length,
        fingerprint,
      });
    } finally {
      await lease.sendCommand("Accessibility.disable").catch(() => undefined);
      await lease.release();
    }
  }

  public async compareScreenshot(
    parameters: CompareScreenshotParameters,
  ): Promise<CompareScreenshotData> {
    await ensureDebuggerPermission();
    const lease = await debuggerSessions.acquire(parameters.tabId);
    try {
      await lease.sendCommand("Page.enable");
      const captured = (await lease.sendCommand("Page.captureScreenshot", {
        format: "jpeg",
        quality: parameters.quality,
        fromSurface: true,
        captureBeyondViewport: false,
      })) as UnknownRecord;
      if (typeof captured["data"] !== "string")
        throw this.#invalid("Chrome returned no screenshot");
      const currentUrl = `data:image/jpeg;base64,${captured["data"]}`;
      const [baseline, current] = await Promise.all([
        createImageBitmap(await (await fetch(parameters.baselineDataUrl)).blob()),
        createImageBitmap(await (await fetch(currentUrl)).blob()),
      ]);
      const baselineWidth = baseline.width;
      const baselineHeight = baseline.height;
      const currentWidth = current.width;
      const currentHeight = current.height;
      const width = Math.min(baseline.width, current.width);
      const height = Math.min(baseline.height, current.height);
      const baselineCanvas = new OffscreenCanvas(width, height);
      const currentCanvas = new OffscreenCanvas(width, height);
      baselineCanvas.getContext("2d")!.drawImage(baseline, 0, 0, width, height);
      currentCanvas.getContext("2d")!.drawImage(current, 0, 0, width, height);
      baseline.close();
      current.close();
      const baselinePixels = baselineCanvas.getContext("2d")!.getImageData(0, 0, width, height);
      const currentContext = currentCanvas.getContext("2d")!;
      const output = currentContext.getImageData(0, 0, width, height);
      let changedPixels = 0;
      for (let offset = 0; offset < output.data.length; offset += 4) {
        const difference =
          Math.max(
            Math.abs(output.data[offset]! - baselinePixels.data[offset]!),
            Math.abs(output.data[offset + 1]! - baselinePixels.data[offset + 1]!),
            Math.abs(output.data[offset + 2]! - baselinePixels.data[offset + 2]!),
          ) / 255;
        if (difference >= parameters.threshold) {
          changedPixels += 1;
          output.data[offset] = 255;
          output.data[offset + 1] = Math.round(output.data[offset + 1]! * 0.25);
          output.data[offset + 2] = Math.round(output.data[offset + 2]! * 0.25);
        } else {
          const gray = Math.round(
            output.data[offset]! * 0.299 +
              output.data[offset + 1]! * 0.587 +
              output.data[offset + 2]! * 0.114,
          );
          output.data[offset] = gray;
          output.data[offset + 1] = gray;
          output.data[offset + 2] = gray;
        }
      }
      currentContext.putImageData(output, 0, 0);
      let quality = parameters.quality / 100;
      let blob = await currentCanvas.convertToBlob({ type: "image/jpeg", quality });
      while (blob.size > 700_000 && quality > 0.25) {
        quality -= 0.1;
        blob = await currentCanvas.convertToBlob({ type: "image/jpeg", quality });
      }
      if (blob.size > 700_000) throw this.#invalid("Visual diff exceeds the bounded output size");
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let binary = "";
      for (let offset = 0; offset < bytes.length; offset += 32_768) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + 32_768));
      }
      const totalPixels = width * height;
      return CompareScreenshotDataSchema.parse({
        tabId: parameters.tabId,
        changed:
          changedPixels > 0 || baselineWidth !== currentWidth || baselineHeight !== currentHeight,
        changedPixels,
        totalPixels,
        changedPercent: (changedPixels / totalPixels) * 100,
        width,
        height,
        mediaType: "image/jpeg",
        byteLength: blob.size,
        dataUrl: `data:image/jpeg;base64,${btoa(binary)}`,
      });
    } finally {
      await lease.release();
    }
  }

  #invalid(message: string): ExtensionCommandError {
    return new ExtensionCommandError(IBP_ERROR_CODES.BROWSER_API_ERROR, message, true);
  }
}
