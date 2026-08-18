import { afterEach, describe, expect, it, vi } from "vitest";

import {
  FindElementsDataSchema,
  FindElementsParametersSchema,
  IBP_ERROR_CODES,
} from "@invictum/protocol";

import { ChromeFindElementsAdapter } from "./elements.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

const parameters = () =>
  FindElementsParametersSchema.parse({
    tabId: 3,
    documentId: "document-1",
    domRevision: 0,
    role: "button",
    name: "Save",
  });

const result = () =>
  FindElementsDataSchema.parse({
    page: { url: "https://example.test/form", origin: "https://example.test" },
    documentId: "document-1",
    domRevision: 0,
    matches: [],
    count: 0,
    truncated: false,
  });

describe("ChromeFindElementsAdapter", () => {
  it("fails closed when page inspection permissions are absent", async () => {
    vi.stubGlobal("chrome", {
      permissions: { contains: vi.fn().mockResolvedValue(false) },
    });

    await expect(new ChromeFindElementsAdapter().findElements(parameters())).rejects.toMatchObject({
      code: IBP_ERROR_CODES.PERMISSION_DENIED,
    });
  });

  it("maps Chrome's injection denial without leaking its URL", async () => {
    vi.stubGlobal("chrome", {
      permissions: { contains: vi.fn().mockResolvedValue(true) },
      tabs: { get: vi.fn().mockResolvedValue({ active: false, url: "https://example.test/" }) },
      scripting: {
        executeScript: vi
          .fn()
          .mockRejectedValue(new Error("Cannot access contents of url https://example.test/")),
      },
    });

    await expect(new ChromeFindElementsAdapter().findElements(parameters())).rejects.toMatchObject({
      code: IBP_ERROR_CODES.PERMISSION_DENIED,
      message:
        "Chrome blocked element search for tab 3 (https://example.test). In Invictum extension Details set Site access to On all sites",
    });
  });

  it("allows an inactive target when Chrome accepts script injection", async () => {
    const data = result();
    vi.stubGlobal("chrome", {
      permissions: { contains: vi.fn().mockResolvedValue(true) },
      tabs: {
        get: vi.fn().mockResolvedValue({ active: false, url: "https://example.test/form" }),
        sendMessage: vi
          .fn()
          .mockImplementation(async (_tabId: number, message: { requestId: string }) => ({
            ok: true,
            requestId: message.requestId,
            result: data,
          })),
      },
      scripting: { executeScript: vi.fn().mockResolvedValue([]) },
    });

    await expect(new ChromeFindElementsAdapter().findElements(parameters())).resolves.toMatchObject(
      { count: 0 },
    );
  });

  it("injects the content script and validates semantic matches", async () => {
    const data = result();
    const executeScript = vi.fn().mockResolvedValue([]);
    const sendMessage = vi
      .fn()
      .mockImplementation(async (_tabId: number, message: { requestId: string }) => ({
        ok: true,
        requestId: message.requestId,
        result: data,
      }));
    vi.stubGlobal("chrome", {
      permissions: { contains: vi.fn().mockResolvedValue(true) },
      tabs: {
        get: vi.fn().mockResolvedValue({ active: true, url: "https://example.test/form" }),
        sendMessage,
      },
      scripting: { executeScript },
    });

    await expect(new ChromeFindElementsAdapter().findElements(parameters())).resolves.toMatchObject(
      {
        documentId: "document-1",
        count: 0,
      },
    );
    expect(executeScript).toHaveBeenCalledWith({ target: { tabId: 3 }, files: ["content.js"] });
  });

  it("preserves a stale-element error returned by the content script", async () => {
    vi.stubGlobal("chrome", {
      permissions: { contains: vi.fn().mockResolvedValue(true) },
      tabs: {
        get: vi.fn().mockResolvedValue({ active: true, url: "https://example.test/form" }),
        sendMessage: vi
          .fn()
          .mockImplementation(async (_tabId: number, message: { requestId: string }) => ({
            ok: false,
            requestId: message.requestId,
            error: {
              code: IBP_ERROR_CODES.STALE_ELEMENT_REFERENCE,
              message: "Snapshot is stale",
              retryable: true,
            },
          })),
      },
      scripting: { executeScript: vi.fn().mockResolvedValue([]) },
    });

    await expect(new ChromeFindElementsAdapter().findElements(parameters())).rejects.toMatchObject({
      code: IBP_ERROR_CODES.STALE_ELEMENT_REFERENCE,
      retryable: true,
    });
  });
});
