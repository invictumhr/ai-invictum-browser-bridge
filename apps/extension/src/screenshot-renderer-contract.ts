import type { ScreenshotAnnotation } from "@invictum/protocol";

export const SCREENSHOT_RENDER_CHANNEL = "invictum.screenshot.render.v1";

export interface ScreenshotCssRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ResolvedScreenshotAnnotation {
  rect: ScreenshotCssRect;
  shape: ScreenshotAnnotation["shape"];
  stroke: string;
  strokeWidth: number;
  fill?: string;
  fillOpacity: number;
  label?: NonNullable<ScreenshotAnnotation["label"]>;
}

export interface ScreenshotRenderRequest {
  channel: typeof SCREENSHOT_RENDER_CHANNEL;
  rawDataUrl: string;
  quality: number;
  maxWidth: number;
  maxHeight: number;
  sourceCssRect: ScreenshotCssRect;
  annotations: ResolvedScreenshotAnnotation[];
}

export interface ScreenshotRenderResult {
  dataUrl: string;
  width: number;
  height: number;
  byteLength: number;
  annotationsApplied: number;
}

export interface ScreenshotRenderResponse {
  ok: boolean;
  result?: ScreenshotRenderResult;
  error?: string;
}
