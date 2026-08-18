import { afterEach, describe, expect, it, vi } from "vitest";

import {
  GetPageSnapshotParametersSchema,
  IBP_ERROR_CODES,
  PageSnapshotSchema,
} from "@invictum/protocol";

import { ChromePageSnapshotAdapter } from "./snapshot.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

const createSnapshot = () =>
  PageSnapshotSchema.parse({
    page: {
      url: "https://example.test/form",
      title: "Form",
      origin: "https://example.test",
      viewport: { width: 1280, height: 720, deviceScaleFactor: 1 },
      scroll: { x: 0, y: 0, maxX: 0, maxY: 0 },
      loadingState: "complete",
    },
    frames: [
      {
        frameId: "top",
        parentFrameId: null,
        url: "https://example.test/form",
        title: "Form",
        name: "top",
        accessible: true,
      },
    ],
    elements: [],
    forms: [],
    dialogs: [],
    alerts: [],
    textBlocks: [],
    metadata: {
      generatedAt: new Date().toISOString(),
      documentId: "document-1",
      domRevision: 0,
      elementCount: 0,
      textLength: 0,
      truncated: false,
      detail: "interactive",
    },
  });

describe("ChromePageSnapshotAdapter", () => {
  it("fails closed when page inspection permissions are absent", async () => {
    vi.stubGlobal("chrome", {
      permissions: { contains: vi.fn().mockResolvedValue(false) },
    });

    await expect(
      new ChromePageSnapshotAdapter().getPageSnapshot(
        GetPageSnapshotParametersSchema.parse({ tabId: 1 }),
      ),
    ).rejects.toMatchObject({ code: IBP_ERROR_CODES.PERMISSION_DENIED });
  });

  it("rejects Chrome-internal pages before script injection", async () => {
    const executeScript = vi.fn();
    vi.stubGlobal("chrome", {
      permissions: { contains: vi.fn().mockResolvedValue(true) },
      tabs: { get: vi.fn().mockResolvedValue({ active: true, url: "chrome://settings/" }) },
      scripting: { executeScript },
    });

    await expect(
      new ChromePageSnapshotAdapter().getPageSnapshot(
        GetPageSnapshotParametersSchema.parse({ tabId: 2 }),
      ),
    ).rejects.toMatchObject({ code: IBP_ERROR_CODES.RESTRICTED_PAGE });
    expect(executeScript).not.toHaveBeenCalled();
  });

  it("injects the isolated content script and validates its snapshot", async () => {
    const snapshot = createSnapshot();
    const executeScript = vi.fn().mockResolvedValue([]);
    const sendMessage = vi
      .fn()
      .mockImplementation(async (_tabId: number, message: { requestId: string }) => ({
        ok: true,
        requestId: message.requestId,
        snapshot,
      }));
    vi.stubGlobal("chrome", {
      permissions: { contains: vi.fn().mockResolvedValue(true) },
      tabs: {
        get: vi.fn().mockResolvedValue({ active: true, url: "https://example.test/form" }),
        sendMessage,
      },
      scripting: { executeScript },
    });

    await expect(
      new ChromePageSnapshotAdapter().getPageSnapshot(
        GetPageSnapshotParametersSchema.parse({ tabId: 3 }),
      ),
    ).resolves.toMatchObject({ page: { title: "Form" } });
    expect(executeScript).toHaveBeenCalledWith({
      target: { tabId: 3 },
      files: ["content.js"],
    });
  });

  it("allows an inactive snapshot when its host is approved", async () => {
    const snapshot = createSnapshot();
    vi.stubGlobal("chrome", {
      permissions: { contains: vi.fn().mockResolvedValue(true) },
      tabs: {
        get: vi.fn().mockResolvedValue({ active: false, url: "https://example.test/form" }),
        sendMessage: vi
          .fn()
          .mockImplementation(async (_tabId: number, message: { requestId: string }) => ({
            ok: true,
            requestId: message.requestId,
            snapshot,
          })),
      },
      scripting: { executeScript: vi.fn().mockResolvedValue([]) },
    });

    await expect(
      new ChromePageSnapshotAdapter().getPageSnapshot(
        GetPageSnapshotParametersSchema.parse({ tabId: 3 }),
      ),
    ).resolves.toMatchObject({ page: { title: "Form" } });
  });
});
