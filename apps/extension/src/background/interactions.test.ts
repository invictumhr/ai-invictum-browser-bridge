import { afterEach, describe, expect, it, vi } from "vitest";
import { TOP_FRAME_ID } from "./frames.js";

import {
  ClickElementDataSchema,
  ClickElementParametersSchema,
  IBP_ERROR_CODES,
  TypeTextDataSchema,
  TypeTextParametersSchema,
  ClickAtDataSchema,
  ClickAtParametersSchema,
} from "@invictum/protocol";

import { ChromeInteractionsAdapter } from "./interactions.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

const clickParameters = () =>
  ClickElementParametersSchema.parse({
    tabId: 3,
    documentId: "document-1",
    domRevision: 0,
    elementId: "el-1",
  });

describe("ChromeInteractionsAdapter", () => {
  it("fails closed when interaction permissions are absent", async () => {
    vi.stubGlobal("chrome", {
      permissions: { contains: vi.fn().mockResolvedValue(false) },
    });

    await expect(new ChromeInteractionsAdapter().click(clickParameters())).rejects.toMatchObject({
      code: IBP_ERROR_CODES.PERMISSION_DENIED,
    });
  });

  it("injects the content script and validates click results", async () => {
    const result = ClickElementDataSchema.parse({
      page: {
        urlBefore: "https://example.test/form",
        urlAfter: "https://example.test/form",
        origin: "https://example.test",
      },
      documentId: "document-1",
      domRevisionBefore: 0,
      domRevisionAfter: 1,
      elementId: "el-1",
      target: { role: "button", name: "Preview", sensitive: false },
      clicked: true,
      domChanged: true,
      urlChanged: false,
      requiresNewSnapshot: true,
    });
    const executeScript = vi
      .fn()
      .mockResolvedValueOnce([{ result: true }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ result: false }]);
    vi.stubGlobal("chrome", {
      permissions: { contains: vi.fn().mockResolvedValue(true) },
      tabs: {
        get: vi.fn().mockResolvedValue({ active: true, url: "https://example.test/form" }),
        sendMessage: vi
          .fn()
          .mockImplementation(async (_tabId: number, message: { requestId: string }) => ({
            ok: true,
            requestId: message.requestId,
            result,
          })),
      },
      scripting: { executeScript },
    });

    await expect(new ChromeInteractionsAdapter().click(clickParameters())).resolves.toMatchObject({
      clicked: true,
      requiresNewSnapshot: true,
    });
    expect(executeScript).toHaveBeenCalledWith({ target: { tabId: 3 }, files: ["content.js"] });
  });

  it("validates type_text results without returning typed content", async () => {
    const parameters = TypeTextParametersSchema.parse({
      tabId: 3,
      documentId: "document-1",
      domRevision: 1,
      elementId: "el-2",
      text: "private-to-the-request",
    });
    const result = TypeTextDataSchema.parse({
      page: { url: "https://example.test/form", origin: "https://example.test" },
      documentId: "document-1",
      domRevisionBefore: 1,
      domRevisionAfter: 2,
      elementId: "el-2",
      target: { role: "textbox", name: "Email", sensitive: false },
      mode: "replace",
      characters: 22,
      changed: true,
      requiresNewSnapshot: true,
    });
    vi.stubGlobal("chrome", {
      permissions: { contains: vi.fn().mockResolvedValue(true) },
      tabs: {
        get: vi.fn().mockResolvedValue({ active: true, url: "https://example.test/form" }),
        sendMessage: vi
          .fn()
          .mockImplementation(async (_tabId: number, message: { requestId: string }) => ({
            ok: true,
            requestId: message.requestId,
            result,
          })),
      },
      scripting: { executeScript: vi.fn().mockResolvedValue([]) },
    });

    const response = await new ChromeInteractionsAdapter().typeText(parameters);
    expect(response).toMatchObject({ characters: 22, changed: true });
    expect(JSON.stringify(response)).not.toContain("private-to-the-request");
  });

  it("synchronizes model-backed editors in the page MAIN world", async () => {
    const parameters = TypeTextParametersSchema.parse({
      tabId: 3,
      documentId: "document-1",
      domRevision: 1,
      elementId: "el-code",
      text: "<?php return true;",
      dispatchChange: true,
    });
    const result = TypeTextDataSchema.parse({
      page: { url: "https://example.test/form", origin: "https://example.test" },
      documentId: "document-1",
      domRevisionBefore: 1,
      domRevisionAfter: 1,
      elementId: "el-code",
      target: { role: "textbox", name: "Code", sensitive: false },
      mode: "replace",
      characters: 18,
      changed: false,
      requiresNewSnapshot: true,
    });
    const executeScript = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          frameId: 0,
          result: {
            found: true,
            handled: true,
            synchronized: true,
            changed: true,
            kind: "codemirror5",
          },
        },
      ])
      .mockResolvedValueOnce([{ frameId: 0, result: 1 }]);
    vi.stubGlobal("chrome", {
      permissions: { contains: vi.fn().mockResolvedValue(true) },
      tabs: {
        get: vi.fn().mockResolvedValue({ active: true, url: "https://example.test/form" }),
        sendMessage: vi
          .fn()
          .mockImplementation(async (_tabId: number, message: { requestId: string }) => ({
            ok: true,
            requestId: message.requestId,
            modelEditorExpected: true,
            result,
          })),
      },
      scripting: { executeScript },
    });

    const response = await new ChromeInteractionsAdapter().typeText(parameters);
    expect(response).toMatchObject({ characters: 18, changed: true });
    expect(executeScript).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        target: { tabId: 3, allFrames: true },
        world: "MAIN",
      }),
    );
    expect(JSON.stringify(response)).not.toContain("<?php return true;");
  });

  it("fails closed when a detected model-backed editor has no safe adapter", async () => {
    const parameters = TypeTextParametersSchema.parse({
      tabId: 3,
      documentId: "document-1",
      domRevision: 1,
      elementId: "el-code",
      text: "replacement",
    });
    const result = TypeTextDataSchema.parse({
      page: { url: "https://example.test/form", origin: "https://example.test" },
      documentId: "document-1",
      domRevisionBefore: 1,
      domRevisionAfter: 1,
      elementId: "el-code",
      target: { role: "textbox", name: "Code", sensitive: false },
      mode: "replace",
      characters: 11,
      changed: true,
      requiresNewSnapshot: true,
    });
    vi.stubGlobal("chrome", {
      permissions: { contains: vi.fn().mockResolvedValue(true) },
      tabs: {
        get: vi.fn().mockResolvedValue({ active: true, url: "https://example.test/form" }),
        sendMessage: vi
          .fn()
          .mockImplementation(async (_tabId: number, message: { requestId: string }) => ({
            ok: true,
            requestId: message.requestId,
            modelEditorExpected: true,
            result,
          })),
      },
      scripting: {
        executeScript: vi
          .fn()
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([
            {
              frameId: 0,
              result: {
                found: true,
                handled: false,
                synchronized: false,
                changed: false,
              },
            },
          ])
          .mockResolvedValueOnce([{ frameId: 0, result: 1 }]),
      },
    });

    await expect(new ChromeInteractionsAdapter().typeText(parameters)).rejects.toMatchObject({
      code: IBP_ERROR_CODES.ELEMENT_NOT_INTERACTABLE,
    });
  });

  it("preserves content-script policy denial", async () => {
    vi.stubGlobal("chrome", {
      permissions: { contains: vi.fn().mockResolvedValue(true) },
      tabs: {
        get: vi.fn().mockResolvedValue({ active: true, url: "https://example.test/form" }),
        sendMessage: vi
          .fn()
          .mockImplementation(async (_tabId: number, message: { requestId: string }) => ({
            ok: false,
            requestId: message.requestId,
            error: { code: IBP_ERROR_CODES.POLICY_DENIED, message: "Blocked", retryable: false },
          })),
      },
      scripting: {
        executeScript: vi
          .fn()
          .mockResolvedValueOnce([{ result: true }])
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([{ result: false }]),
      },
    });

    await expect(new ChromeInteractionsAdapter().click(clickParameters())).rejects.toMatchObject({
      code: IBP_ERROR_CODES.POLICY_DENIED,
    });
  });

  it("fails closed when a click invokes programmatic form.submit", async () => {
    vi.stubGlobal("chrome", {
      permissions: { contains: vi.fn().mockResolvedValue(true) },
      tabs: {
        get: vi.fn().mockResolvedValue({ url: "https://example.test/form" }),
        sendMessage: vi
          .fn()
          .mockImplementation(async (_tabId: number, message: { requestId: string }) => ({
            ok: true,
            requestId: message.requestId,
            result: {},
          })),
      },
      scripting: {
        executeScript: vi
          .fn()
          .mockResolvedValueOnce([{ result: true }])
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([{ result: true }]),
      },
    });
    await expect(new ChromeInteractionsAdapter().click(clickParameters())).rejects.toMatchObject({
      code: IBP_ERROR_CODES.POLICY_DENIED,
    });
  });

  it("routes a revision-bound coordinate click through the same submit guard", async () => {
    const parameters = ClickAtParametersSchema.parse({
      tabId: 3,
      documentId: "document-1",
      domRevision: 2,
      x: 120,
      y: 240,
    });
    const result = ClickAtDataSchema.parse({
      page: {
        urlBefore: "https://example.test/form",
        urlAfter: "https://example.test/form",
        origin: "https://example.test",
      },
      documentId: "document-1",
      domRevisionBefore: 2,
      domRevisionAfter: 3,
      coordinates: { x: 120, y: 240 },
      target: { role: "button", name: "Fallback", sensitive: false },
      clicked: true,
      domChanged: true,
      urlChanged: false,
      requiresNewSnapshot: true,
    });
    const sendMessage = vi
      .fn()
      .mockImplementation(
        async (_tabId: number, message: { requestId: string; command: string }) => ({
          ok: true,
          requestId: message.requestId,
          result,
        }),
      );
    vi.stubGlobal("chrome", {
      permissions: { contains: vi.fn().mockResolvedValue(true) },
      tabs: {
        get: vi.fn().mockResolvedValue({ url: "https://example.test/form" }),
        sendMessage,
      },
      scripting: {
        executeScript: vi
          .fn()
          .mockResolvedValueOnce([{ result: true }])
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([{ result: false }]),
      },
    });
    await expect(new ChromeInteractionsAdapter().clickAt(parameters)).resolves.toMatchObject({
      coordinates: { x: 120, y: 240 },
    });
    expect(sendMessage).toHaveBeenCalledWith(3, expect.objectContaining({ command: "click_at" }), {
      frameId: TOP_FRAME_ID,
    });
  });

  it("denies an inactive interaction when Chrome rejects script injection", async () => {
    vi.stubGlobal("chrome", {
      permissions: { contains: vi.fn().mockResolvedValue(true) },
      tabs: {
        get: vi.fn().mockResolvedValue({ active: false, url: "https://example.test/form" }),
      },
      scripting: {
        executeScript: vi.fn().mockRejectedValue(new Error("Missing host permission")),
      },
    });

    await expect(new ChromeInteractionsAdapter().click(clickParameters())).rejects.toMatchObject({
      code: IBP_ERROR_CODES.PERMISSION_DENIED,
    });
  });
});
