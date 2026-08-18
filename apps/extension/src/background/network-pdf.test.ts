import { afterEach, describe, expect, it, vi } from "vitest";

import { NetworkCaptureParametersSchema, PrintToPdfParametersSchema } from "@invictum/protocol";

import { ChromeNetworkCaptureAdapter } from "./network.js";
import { ChromePdfAdapter } from "./pdf.js";

afterEach(() => vi.unstubAllGlobals());

describe("network metadata capture and PDF export", () => {
  it("captures bounded request metadata without headers, bodies, query strings, or credentials", async () => {
    let eventListener:
      | ((source: chrome.debugger.DebuggerSession, method: string, parameters?: object) => void)
      | undefined;
    const attach = vi.fn().mockResolvedValue(undefined);
    const detach = vi.fn().mockResolvedValue(undefined);
    const sendCommand = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("chrome", {
      permissions: { contains: vi.fn().mockResolvedValue(true) },
      tabs: { get: vi.fn().mockResolvedValue({ url: "https://example.test/app" }) },
      debugger: {
        attach,
        detach,
        sendCommand,
        onEvent: {
          addListener: vi.fn((listener) => {
            eventListener = listener;
          }),
        },
        onDetach: { addListener: vi.fn() },
      },
    });

    const adapter = new ChromeNetworkCaptureAdapter();
    await adapter.manage(
      NetworkCaptureParametersSchema.parse({ operation: "start", tabId: 12, bufferSize: 20 }),
    );
    eventListener?.({ tabId: 12 }, "Network.requestWillBeSent", {
      requestId: "request-1",
      type: "Fetch",
      request: {
        url: "https://user:secret@example.test/api/items?token=secret#fragment",
        method: "POST",
        headers: { Authorization: "Bearer secret" },
        postData: "password=secret",
      },
    });
    eventListener?.({ tabId: 12 }, "Network.responseReceived", {
      requestId: "request-1",
      type: "Fetch",
      response: {
        url: "https://example.test/api/items?token=secret",
        status: 201,
        mimeType: "application/json",
      },
    });

    const read = await adapter.manage(
      NetworkCaptureParametersSchema.parse({ operation: "read", tabId: 12 }),
    );
    expect(read).toMatchObject({
      active: true,
      entryCount: 2,
      bodiesCaptured: false,
      headersCaptured: false,
      queryStringsRedacted: true,
    });
    expect(read.entries[0]).toMatchObject({
      phase: "request",
      url: "https://example.test/api/items",
      method: "POST",
      resourceType: "Fetch",
    });
    expect(JSON.stringify(read)).not.toContain("secret");
    expect(JSON.stringify(read)).not.toContain("Authorization");

    const stopped = await adapter.manage(
      NetworkCaptureParametersSchema.parse({ operation: "stop", tabId: 12 }),
    );
    expect(stopped.active).toBe(false);
    expect(sendCommand).toHaveBeenCalledWith({ tabId: 12 }, "Network.enable", {
      maxPostDataSize: 0,
    });
    expect(detach).toHaveBeenCalledTimes(1);
  });

  it("exports a bounded PDF and releases the shared debugger session", async () => {
    const attach = vi.fn().mockResolvedValue(undefined);
    const detach = vi.fn().mockResolvedValue(undefined);
    const pdf = Buffer.from("%PDF-1.7\nfixture", "utf8");
    const sendCommand = vi.fn(
      async (_target: chrome.debugger.Debuggee, method: string): Promise<unknown> =>
        method === "Page.printToPDF" ? { data: pdf.toString("base64") } : undefined,
    );
    vi.stubGlobal("chrome", {
      permissions: { contains: vi.fn().mockResolvedValue(true) },
      tabs: { get: vi.fn().mockResolvedValue({ url: "https://example.test/report" }) },
      debugger: {
        attach,
        detach,
        sendCommand,
        onEvent: { addListener: vi.fn() },
        onDetach: { addListener: vi.fn() },
      },
    });

    const result = await new ChromePdfAdapter().print(
      PrintToPdfParametersSchema.parse({
        tabId: 14,
        paperSize: "a4",
        printBackground: true,
      }),
    );

    expect(result).toMatchObject({
      tabId: 14,
      mediaType: "application/pdf",
      paperSize: "a4",
      printBackground: true,
    });
    expect(result.dataUrl).toBe(`data:application/pdf;base64,${pdf.toString("base64")}`);
    expect(sendCommand).toHaveBeenCalledWith(
      { tabId: 14 },
      "Page.printToPDF",
      expect.objectContaining({
        paperWidth: 8.27,
        paperHeight: 11.69,
        transferMode: "ReturnAsBase64",
      }),
    );
    expect(detach).toHaveBeenCalledTimes(1);
  });
});
