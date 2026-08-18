import {
  CaptureScreenshotDataSchema,
  IBP_ERROR_CODES,
  type CaptureScreenshotData,
  type CaptureScreenshotParameters,
  type ScreenshotAnnotation,
  type ScreenshotRegion,
} from "@invictum/protocol";

import {
  SCREENSHOT_RENDER_CHANNEL,
  type ResolvedScreenshotAnnotation,
  type ScreenshotRenderRequest,
  type ScreenshotRenderResult,
} from "../screenshot-renderer-contract.js";
import { renderScreenshotInIsolatedWorld } from "../screenshot-renderer.js";
import { ExtensionCommandError } from "./command-error.js";
import { debuggerSessions } from "./debugger-session.js";
import { isChromePageAccessDenied, pageAccessDeniedMessage } from "./page-access.js";

const MAX_SCREENSHOT_BYTES = 500_000;

interface CssRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ScreenshotRevision {
  documentId: string;
  domRevision: number;
  viewport: { width: number; height: number; deviceScaleFactor: number };
  scroll: { x: number; y: number };
  elementRects: Readonly<Record<string, CssRect>>;
}

interface CapturedImage {
  dataUrl: string;
  sourceCssRect: CssRect;
}

interface LayoutMetricsResponse {
  cssContentSize?: CssRect;
  contentSize?: CssRect;
}

const regionToDocumentRect = (region: ScreenshotRegion, revision: ScreenshotRevision): CssRect => ({
  x: region.x + (region.coordinateSpace === "viewport" ? revision.scroll.x : 0),
  y: region.y + (region.coordinateSpace === "viewport" ? revision.scroll.y : 0),
  width: region.width,
  height: region.height,
});

const expandRect = (rect: CssRect, padding: number): CssRect => ({
  x: rect.x - padding,
  y: rect.y - padding,
  width: rect.width + padding * 2,
  height: rect.height + padding * 2,
});

const clampRect = (rect: CssRect, bounds: CssRect): CssRect => {
  const x = Math.max(bounds.x, rect.x);
  const y = Math.max(bounds.y, rect.y);
  const right = Math.min(bounds.x + bounds.width, rect.x + rect.width);
  const bottom = Math.min(bounds.y + bounds.height, rect.y + rect.height);
  if (right <= x || bottom <= y) {
    throw new ExtensionCommandError(
      IBP_ERROR_CODES.ELEMENT_NOT_INTERACTABLE,
      "The requested screenshot region is outside the page content",
      false,
    );
  }
  return { x, y, width: right - x, height: bottom - y };
};

const elementRect = (elementId: string, revision: ScreenshotRevision, padding = 0): CssRect => {
  const rect = revision.elementRects[elementId];
  if (rect === undefined || rect.width <= 0 || rect.height <= 0) {
    throw new ExtensionCommandError(
      IBP_ERROR_CODES.ELEMENT_NOT_INTERACTABLE,
      `Screenshot target ${elementId} is unavailable or has no visible dimensions`,
      false,
    );
  }
  return expandRect(rect, padding);
};

const viewportRect = (revision: ScreenshotRevision): CssRect => ({
  x: Math.max(0, revision.scroll.x),
  y: Math.max(0, revision.scroll.y),
  width: revision.viewport.width,
  height: revision.viewport.height,
});

const resolveCaptureRect = (
  parameters: CaptureScreenshotParameters,
  revision: ScreenshotRevision,
  contentBounds: CssRect,
): CssRect => {
  switch (parameters.mode) {
    case "full_page":
      return contentBounds;
    case "element":
      return clampRect(
        elementRect(parameters.elementId!, revision, parameters.padding),
        contentBounds,
      );
    case "region":
      return clampRect(regionToDocumentRect(parameters.region!, revision), contentBounds);
    case "viewport":
      return viewportRect(revision);
  }
};

const captureWithDebugger = async (
  parameters: CaptureScreenshotParameters,
  revision: ScreenshotRevision,
): Promise<CapturedImage> => {
  const permissionGranted = await chrome.permissions.contains({ permissions: ["debugger"] });
  if (!permissionGranted) {
    throw new ExtensionCommandError(
      IBP_ERROR_CODES.PERMISSION_DENIED,
      "Element, region, full-page, annotated, or background screenshots require the Chrome debugger permission",
      false,
    );
  }

  const lease = await debuggerSessions.acquire(parameters.tabId);
  try {
    await lease.sendCommand("Page.enable");
    let sourceCssRect = viewportRect(revision);
    const captureParameters: Record<string, unknown> = {
      format: "jpeg",
      quality: parameters.quality,
      fromSurface: true,
      captureBeyondViewport: false,
    };
    if (parameters.mode !== "viewport") {
      const metrics = (await lease.sendCommand("Page.getLayoutMetrics")) as LayoutMetricsResponse;
      const contentBounds = metrics.cssContentSize ?? metrics.contentSize;
      if (contentBounds === undefined || contentBounds.width <= 0 || contentBounds.height <= 0) {
        throw new ExtensionCommandError(
          IBP_ERROR_CODES.BROWSER_API_ERROR,
          "Chrome debugger returned invalid page layout metrics",
          true,
        );
      }
      sourceCssRect = resolveCaptureRect(parameters, revision, contentBounds);
      const captureScale = Math.min(
        1,
        parameters.maxWidth / sourceCssRect.width,
        parameters.maxHeight / sourceCssRect.height,
      );
      captureParameters.captureBeyondViewport = true;
      captureParameters.clip = { ...sourceCssRect, scale: Math.max(0.01, captureScale) };
    }
    const response = (await lease.sendCommand("Page.captureScreenshot", captureParameters)) as {
      data?: unknown;
    };
    if (typeof response.data !== "string" || response.data.length === 0) {
      throw new ExtensionCommandError(
        IBP_ERROR_CODES.BROWSER_API_ERROR,
        "Chrome debugger returned an invalid screenshot payload",
        true,
      );
    }
    return { dataUrl: `data:image/jpeg;base64,${response.data}`, sourceCssRect };
  } finally {
    await lease.release();
  }
};

const blobToDataUrl = async (blob: Blob): Promise<string> => {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const chunks: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 32_768) {
    chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 32_768)));
  }
  return `data:${blob.type};base64,${btoa(chunks.join(""))}`;
};

const annotationDocumentRect = (
  annotation: ScreenshotAnnotation,
  revision: ScreenshotRevision,
): CssRect =>
  annotation.target.type === "element"
    ? elementRect(annotation.target.elementId, revision, annotation.target.padding)
    : regionToDocumentRect(annotation.target.region, revision);

const resolveAnnotations = (
  annotations: readonly ScreenshotAnnotation[],
  revision: ScreenshotRevision,
): ResolvedScreenshotAnnotation[] =>
  annotations.map((annotation) => ({
    rect: annotationDocumentRect(annotation, revision),
    shape: annotation.shape,
    stroke: annotation.stroke,
    strokeWidth: annotation.strokeWidth,
    ...(annotation.fill === undefined ? {} : { fill: annotation.fill }),
    fillOpacity: annotation.fillOpacity,
    ...(annotation.label === undefined ? {} : { label: annotation.label }),
  }));

const renderAnnotatedScreenshot = async (
  captured: CapturedImage,
  parameters: CaptureScreenshotParameters,
  revision: ScreenshotRevision,
): Promise<ScreenshotRenderResult> => {
  const request: ScreenshotRenderRequest = {
    channel: SCREENSHOT_RENDER_CHANNEL,
    rawDataUrl: captured.dataUrl,
    quality: parameters.quality,
    maxWidth: parameters.maxWidth,
    maxHeight: parameters.maxHeight,
    sourceCssRect: captured.sourceCssRect,
    annotations: resolveAnnotations(parameters.annotations, revision),
  };
  let result: ScreenshotRenderResult | undefined;
  try {
    const executions = await chrome.scripting.executeScript({
      target: { tabId: parameters.tabId },
      world: "ISOLATED",
      func: renderScreenshotInIsolatedWorld,
      args: [request],
    });
    result = executions[0]?.result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new ExtensionCommandError(
      message.includes("outside the captured area")
        ? IBP_ERROR_CODES.ELEMENT_NOT_INTERACTABLE
        : IBP_ERROR_CODES.BROWSER_API_ERROR,
      message,
      false,
      { cause: error },
    );
  }
  if (result === undefined) {
    throw new ExtensionCommandError(
      IBP_ERROR_CODES.BROWSER_API_ERROR,
      "The isolated screenshot renderer returned no result",
      false,
    );
  }
  const valid =
    result.dataUrl.startsWith("data:image/jpeg;base64,") &&
    Number.isInteger(result.width) &&
    result.width > 0 &&
    result.width <= parameters.maxWidth &&
    Number.isInteger(result.height) &&
    result.height > 0 &&
    result.height <= parameters.maxHeight &&
    Number.isInteger(result.byteLength) &&
    result.byteLength > 0 &&
    result.byteLength <= MAX_SCREENSHOT_BYTES &&
    result.annotationsApplied === parameters.annotations.length;
  if (!valid) {
    throw new ExtensionCommandError(
      IBP_ERROR_CODES.BROWSER_API_ERROR,
      "The screenshot renderer returned invalid bounded output",
      false,
    );
  }
  return result;
};

export class ChromeScreenshotAdapter {
  public async capture(
    parameters: CaptureScreenshotParameters,
    revision: ScreenshotRevision,
  ): Promise<CaptureScreenshotData> {
    const permissionsGranted = await chrome.permissions.contains({
      permissions: ["activeTab", "tabs"],
    });
    if (!permissionsGranted) {
      throw new ExtensionCommandError(
        IBP_ERROR_CODES.PERMISSION_DENIED,
        "Screenshot permission is unavailable; set Invictum Site access to On all sites",
        false,
      );
    }
    const tab = await chrome.tabs.get(parameters.tabId);
    const tabUrl = tab.pendingUrl ?? tab.url;
    try {
      let captured: CapturedImage;
      const simpleVisibleViewport =
        parameters.mode === "viewport" && parameters.annotations.length === 0 && tab.active;
      if (simpleVisibleViewport) {
        try {
          captured = {
            dataUrl: await chrome.tabs.captureVisibleTab(tab.windowId, {
              format: "jpeg",
              quality: parameters.quality,
            }),
            sourceCssRect: viewportRect(revision),
          };
        } catch {
          captured = await captureWithDebugger(parameters, revision);
        }
      } else {
        captured = await captureWithDebugger(parameters, revision);
      }
      if (parameters.annotations.length > 0) {
        const rendered = await renderAnnotatedScreenshot(captured, parameters, revision);
        return CaptureScreenshotDataSchema.parse({
          screenshotId: crypto.randomUUID(),
          tabId: parameters.tabId,
          documentId: revision.documentId,
          domRevision: revision.domRevision,
          capturedAt: new Date().toISOString(),
          mediaType: "image/jpeg",
          width: rendered.width,
          height: rendered.height,
          viewport: {
            cssWidth: revision.viewport.width,
            cssHeight: revision.viewport.height,
            deviceScaleFactor: revision.viewport.deviceScaleFactor,
          },
          capture: {
            mode: parameters.mode,
            sourceCssRect: captured.sourceCssRect,
            fullPage: parameters.mode === "full_page",
            annotationsApplied: rendered.annotationsApplied,
          },
          byteLength: rendered.byteLength,
          dataUrl: rendered.dataUrl,
        });
      }
      const sourceBlob = await (await fetch(captured.dataUrl)).blob();
      const bitmap = await createImageBitmap(sourceBlob);
      try {
        let scale = Math.min(
          1,
          parameters.maxWidth / bitmap.width,
          parameters.maxHeight / bitmap.height,
        );
        let quality = parameters.quality;
        for (let attempt = 0; attempt < 6; attempt += 1) {
          const width = Math.max(1, Math.floor(bitmap.width * scale));
          const height = Math.max(1, Math.floor(bitmap.height * scale));
          const canvas = new OffscreenCanvas(width, height);
          const context = canvas.getContext("2d");
          if (context === null) {
            throw new ExtensionCommandError(
              IBP_ERROR_CODES.BROWSER_API_ERROR,
              "Chrome could not create the screenshot rendering context",
              false,
            );
          }
          context.drawImage(bitmap, 0, 0, width, height);
          const blob = await canvas.convertToBlob({ type: "image/jpeg", quality: quality / 100 });
          if (blob.size <= MAX_SCREENSHOT_BYTES) {
            return CaptureScreenshotDataSchema.parse({
              screenshotId: crypto.randomUUID(),
              tabId: parameters.tabId,
              documentId: revision.documentId,
              domRevision: revision.domRevision,
              capturedAt: new Date().toISOString(),
              mediaType: "image/jpeg",
              width,
              height,
              viewport: {
                cssWidth: revision.viewport.width,
                cssHeight: revision.viewport.height,
                deviceScaleFactor: revision.viewport.deviceScaleFactor,
              },
              capture: {
                mode: parameters.mode,
                sourceCssRect: captured.sourceCssRect,
                fullPage: parameters.mode === "full_page",
                annotationsApplied: 0,
              },
              byteLength: blob.size,
              dataUrl: await blobToDataUrl(blob),
            });
          }
          scale *= 0.8;
          quality = Math.max(30, quality - 10);
        }
      } finally {
        bitmap.close();
      }
      throw new ExtensionCommandError(
        IBP_ERROR_CODES.MESSAGE_TOO_LARGE,
        "The screenshot could not be reduced below the safe transport limit",
        false,
      );
    } catch (error) {
      if (error instanceof ExtensionCommandError) throw error;
      if (isChromePageAccessDenied(error)) {
        throw new ExtensionCommandError(
          IBP_ERROR_CODES.PERMISSION_DENIED,
          pageAccessDeniedMessage(parameters.tabId, tabUrl, "screenshot capture"),
          false,
        );
      }
      throw new ExtensionCommandError(
        IBP_ERROR_CODES.BROWSER_API_ERROR,
        "Chrome could not capture the target tab",
        true,
        { cause: error },
      );
    }
  }
}
