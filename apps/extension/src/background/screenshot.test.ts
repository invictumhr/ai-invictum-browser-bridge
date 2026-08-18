import { afterEach, describe, expect, it, vi } from "vitest";

import { CaptureScreenshotParametersSchema, IBP_ERROR_CODES } from "@invictum/protocol";

import { ChromeScreenshotAdapter } from "./screenshot.js";

afterEach(() => vi.unstubAllGlobals());

describe("ChromeScreenshotAdapter", () => {
  it("captures, bounds, and serializes the active tab as JPEG", async () => {
    vi.stubGlobal("chrome", {
      permissions: { contains: vi.fn().mockResolvedValue(true) },
      tabs: {
        get: vi.fn().mockResolvedValue({ active: true, windowId: 4 }),
        captureVisibleTab: vi.fn().mockResolvedValue("data:image/jpeg;base64,ZmFrZQ=="),
      },
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ blob: async () => new Blob(["source"]) }));
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn().mockResolvedValue({ width: 1_600, height: 900, close: vi.fn() }),
    );
    class FakeOffscreenCanvas {
      public constructor(
        public readonly width: number,
        public readonly height: number,
      ) {}

      public getContext(): { drawImage: () => void } {
        return { drawImage: vi.fn() };
      }

      public async convertToBlob(): Promise<Blob> {
        return new Blob([new Uint8Array(256)], { type: "image/jpeg" });
      }
    }
    vi.stubGlobal("OffscreenCanvas", FakeOffscreenCanvas);

    const result = await new ChromeScreenshotAdapter().capture(
      CaptureScreenshotParametersSchema.parse({ tabId: 3, maxWidth: 800, maxHeight: 600 }),
      {
        documentId: "document-1",
        domRevision: 2,
        viewport: { width: 1_600, height: 900, deviceScaleFactor: 1 },
        scroll: { x: 0, y: 0 },
        elementRects: {},
      },
    );
    expect(result).toMatchObject({
      tabId: 3,
      width: 800,
      height: 450,
      byteLength: 256,
      mediaType: "image/jpeg",
      viewport: { cssWidth: 1_600, cssHeight: 900, deviceScaleFactor: 1 },
    });
    expect(result.dataUrl).toMatch(/^data:image\/jpeg;base64,/);
  });

  it("falls back to a short-lived debugger capture for a non-visible target tab", async () => {
    const detach = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("chrome", {
      permissions: { contains: vi.fn().mockResolvedValue(true) },
      tabs: { get: vi.fn().mockResolvedValue({ active: false, windowId: 4 }) },
      debugger: {
        attach: vi.fn().mockResolvedValue(undefined),
        sendCommand: vi
          .fn()
          .mockResolvedValueOnce(undefined)
          .mockResolvedValueOnce({ data: "ZmFrZQ==" }),
        detach,
      },
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ blob: async () => new Blob(["source"]) }));
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn().mockResolvedValue({ width: 800, height: 600, close: vi.fn() }),
    );
    class FakeOffscreenCanvas {
      public constructor(
        public readonly width: number,
        public readonly height: number,
      ) {}

      public getContext(): { drawImage: () => void } {
        return { drawImage: vi.fn() };
      }

      public async convertToBlob(): Promise<Blob> {
        return new Blob([new Uint8Array(256)], { type: "image/jpeg" });
      }
    }
    vi.stubGlobal("OffscreenCanvas", FakeOffscreenCanvas);

    const result = await new ChromeScreenshotAdapter().capture(
      CaptureScreenshotParametersSchema.parse({ tabId: 3 }),
      {
        documentId: "document-1",
        domRevision: 2,
        viewport: { width: 800, height: 600, deviceScaleFactor: 1 },
        scroll: { x: 0, y: 0 },
        elementRects: {},
      },
    );

    expect(result).toMatchObject({ tabId: 3, width: 800, height: 600, byteLength: 256 });
    expect(chrome.debugger.attach).toHaveBeenCalledWith({ tabId: 3 }, "1.3");
    expect(chrome.debugger.sendCommand).toHaveBeenNthCalledWith(
      2,
      { tabId: 3 },
      "Page.captureScreenshot",
      expect.objectContaining({ format: "jpeg", captureBeyondViewport: false }),
    );
    expect(detach).toHaveBeenCalledWith({ tabId: 3 });
  });

  it("detaches the debugger when the fallback capture fails", async () => {
    const detach = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("chrome", {
      permissions: { contains: vi.fn().mockResolvedValue(true) },
      tabs: {
        get: vi.fn().mockResolvedValue({ active: true, windowId: 4 }),
        captureVisibleTab: vi.fn().mockRejectedValue(new Error("window is not visible")),
      },
      debugger: {
        attach: vi.fn().mockResolvedValue(undefined),
        sendCommand: vi
          .fn()
          .mockResolvedValueOnce(undefined)
          .mockRejectedValueOnce(new Error("capture failed")),
        detach,
      },
    });

    await expect(
      new ChromeScreenshotAdapter().capture(CaptureScreenshotParametersSchema.parse({ tabId: 3 }), {
        documentId: "document-1",
        domRevision: 2,
        viewport: { width: 800, height: 600, deviceScaleFactor: 1 },
        scroll: { x: 0, y: 0 },
        elementRects: {},
      }),
    ).rejects.toMatchObject({ code: IBP_ERROR_CODES.BROWSER_API_ERROR });
    expect(detach).toHaveBeenCalledWith({ tabId: 3 });
  });

  it("captures the complete CSS page without scrolling or activating the tab", async () => {
    const sendCommand = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({
        cssContentSize: { x: 0, y: 0, width: 1_200, height: 3_000 },
      })
      .mockResolvedValueOnce({ data: "ZmFrZQ==" });
    vi.stubGlobal("chrome", {
      permissions: { contains: vi.fn().mockResolvedValue(true) },
      tabs: { get: vi.fn().mockResolvedValue({ active: false, windowId: 4 }) },
      debugger: {
        attach: vi.fn().mockResolvedValue(undefined),
        sendCommand,
        detach: vi.fn().mockResolvedValue(undefined),
      },
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ blob: async () => new Blob(["source"]) }));
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn().mockResolvedValue({ width: 432, height: 1_080, close: vi.fn() }),
    );
    class FakeOffscreenCanvas {
      public constructor(
        public readonly width: number,
        public readonly height: number,
      ) {}

      public getContext(): { drawImage: () => void } {
        return { drawImage: vi.fn() };
      }

      public async convertToBlob(): Promise<Blob> {
        return new Blob([new Uint8Array(256)], { type: "image/jpeg" });
      }
    }
    vi.stubGlobal("OffscreenCanvas", FakeOffscreenCanvas);

    const result = await new ChromeScreenshotAdapter().capture(
      CaptureScreenshotParametersSchema.parse({ tabId: 3, mode: "full_page" }),
      {
        documentId: "document-1",
        domRevision: 2,
        viewport: { width: 1_200, height: 800, deviceScaleFactor: 1 },
        scroll: { x: 0, y: 250 },
        elementRects: {},
      },
    );

    expect(result.capture).toEqual({
      mode: "full_page",
      sourceCssRect: { x: 0, y: 0, width: 1_200, height: 3_000 },
      fullPage: true,
      annotationsApplied: 0,
    });
    expect(sendCommand).toHaveBeenNthCalledWith(
      3,
      { tabId: 3 },
      "Page.captureScreenshot",
      expect.objectContaining({
        captureBeyondViewport: true,
        clip: { x: 0, y: 0, width: 1_200, height: 3_000, scale: 0.36 },
      }),
    );
  });

  it("crops a revision-bound element and executes its tutorial renderer in the isolated world", async () => {
    const executeScript = vi.fn().mockResolvedValue([
      {
        frameId: 0,
        result: {
          dataUrl: "data:image/jpeg;base64,ZmFrZS1zY3JlZW5zaG90",
          width: 420,
          height: 220,
          byteLength: 256,
          annotationsApplied: 1,
        },
      },
    ]);
    vi.stubGlobal("chrome", {
      permissions: { contains: vi.fn().mockResolvedValue(true) },
      tabs: { get: vi.fn().mockResolvedValue({ active: false, windowId: 4 }) },
      scripting: { executeScript },
      debugger: {
        attach: vi.fn().mockResolvedValue(undefined),
        sendCommand: vi
          .fn()
          .mockResolvedValueOnce(undefined)
          .mockResolvedValueOnce({
            cssContentSize: { x: 0, y: 0, width: 1_200, height: 2_000 },
          })
          .mockResolvedValueOnce({ data: "ZmFrZQ==" }),
        detach: vi.fn().mockResolvedValue(undefined),
      },
    });
    const parameters = CaptureScreenshotParametersSchema.parse({
      tabId: 3,
      mode: "element",
      documentId: "document-1",
      domRevision: 2,
      elementId: "button-save",
      padding: 40,
      annotations: [
        {
          target: { type: "element", elementId: "button-save" },
          label: { text: "Click this button" },
        },
      ],
    });

    const result = await new ChromeScreenshotAdapter().capture(parameters, {
      documentId: "document-1",
      domRevision: 2,
      viewport: { width: 1_200, height: 800, deviceScaleFactor: 1 },
      scroll: { x: 0, y: 600 },
      elementRects: {
        "button-save": { x: 360, y: 720, width: 220, height: 48 },
      },
    });

    expect(result.capture).toMatchObject({
      mode: "element",
      sourceCssRect: { x: 320, y: 680, width: 300, height: 128 },
      annotationsApplied: 1,
    });
    expect(executeScript).toHaveBeenCalledWith(
      expect.objectContaining({
        target: { tabId: 3 },
        world: "ISOLATED",
        func: expect.any(Function),
        args: [
          expect.objectContaining({
            channel: "invictum.screenshot.render.v1",
            sourceCssRect: { x: 320, y: 680, width: 300, height: 128 },
            annotations: [
              expect.objectContaining({
                rect: { x: 352, y: 712, width: 236, height: 64 },
                label: expect.objectContaining({ text: "Click this button" }),
              }),
            ],
          }),
        ],
      }),
    );
  });
});
