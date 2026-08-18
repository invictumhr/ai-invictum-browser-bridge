import { afterEach, describe, expect, it, vi } from "vitest";

import { HandleJavaScriptDialogParametersSchema } from "@invictum/protocol";

import { ChromeJavaScriptDialogAdapter } from "./dialogs.js";

type Listener = (...arguments_: unknown[]) => unknown;

const event = () => {
  const listeners = new Set<Listener>();
  return {
    api: {
      addListener: vi.fn((listener: Listener) => listeners.add(listener)),
      removeListener: vi.fn((listener: Listener) => listeners.delete(listener)),
    },
    emit: (...arguments_: unknown[]) => {
      for (const listener of listeners) listener(...arguments_);
    },
  };
};

afterEach(() => vi.unstubAllGlobals());

describe("ChromeJavaScriptDialogAdapter", () => {
  it("arms CDP before a click and accepts the resulting confirm", async () => {
    const debuggerEvent = event();
    const detachEvent = event();
    const sendCommand = vi.fn().mockResolvedValue({});
    vi.stubGlobal("chrome", {
      permissions: { contains: vi.fn().mockResolvedValue(true) },
      tabs: { get: vi.fn().mockResolvedValue({ url: "https://example.test/form" }) },
      debugger: {
        attach: vi.fn().mockResolvedValue(undefined),
        detach: vi.fn().mockResolvedValue(undefined),
        sendCommand,
        onEvent: debuggerEvent.api,
        onDetach: detachEvent.api,
      },
    });
    const trigger = vi.fn().mockImplementation(async () => {
      debuggerEvent.emit({ tabId: 6 }, "Page.javascriptDialogOpening", {
        type: "confirm",
        message: "Continue?",
        url: "https://example.test/form",
      });
    });
    const result = await new ChromeJavaScriptDialogAdapter().handle(
      HandleJavaScriptDialogParametersSchema.parse({
        tabId: 6,
        accept: true,
        trigger: {
          type: "click",
          documentId: "document-1",
          domRevision: 2,
          elementId: "delete-preview",
        },
        authorization: {
          source: "explicit_user_instruction",
          instructionId: "user-dialog-1",
        },
      }),
      trigger,
    );
    expect(result).toMatchObject({
      accepted: true,
      type: "confirm",
      message: "Continue?",
      triggerType: "click",
    });
    expect(sendCommand).toHaveBeenCalledWith({ tabId: 6 }, "Page.handleJavaScriptDialog", {
      accept: true,
    });
    expect(chrome.debugger.detach).toHaveBeenCalledWith({ tabId: 6 });
  });

  it("passes prompt text only when accepting a prompt", async () => {
    const debuggerEvent = event();
    const detachEvent = event();
    const sendCommand = vi.fn().mockImplementation(async (_target, method: string) => {
      if (method === "Page.handleJavaScriptDialog") throw new Error("No current dialog");
      return {};
    });
    vi.stubGlobal("chrome", {
      permissions: { contains: vi.fn().mockResolvedValue(true) },
      tabs: { get: vi.fn().mockResolvedValue({ url: "https://example.test/" }) },
      debugger: {
        attach: vi.fn().mockResolvedValue(undefined),
        detach: vi.fn().mockResolvedValue(undefined),
        sendCommand,
        onEvent: debuggerEvent.api,
        onDetach: detachEvent.api,
      },
    });
    const operation = new ChromeJavaScriptDialogAdapter().handle(
      HandleJavaScriptDialogParametersSchema.parse({
        tabId: 7,
        accept: true,
        promptText: "fixture response",
        authorization: {
          source: "explicit_user_instruction",
          instructionId: "user-dialog-2",
        },
      }),
      async () => undefined,
    );
    await vi.waitFor(() => expect(sendCommand).toHaveBeenCalledWith({ tabId: 7 }, "Page.enable"));
    sendCommand.mockResolvedValue({});
    debuggerEvent.emit({ tabId: 7 }, "Page.javascriptDialogOpening", {
      type: "prompt",
      message: "Name?",
      url: "https://example.test/",
    });
    await expect(operation).resolves.toMatchObject({ type: "prompt", promptTextSupplied: true });
    expect(sendCommand).toHaveBeenCalledWith({ tabId: 7 }, "Page.handleJavaScriptDialog", {
      accept: true,
      promptText: "fixture response",
    });
  });

  it("tries the immediate trigger:none recovery command before enabling Page", async () => {
    const debuggerEvent = event();
    const detachEvent = event();
    const sendCommand = vi.fn().mockResolvedValue({});
    vi.stubGlobal("chrome", {
      permissions: { contains: vi.fn().mockResolvedValue(true) },
      tabs: { get: vi.fn().mockResolvedValue({ url: "https://example.test/wp-admin/" }) },
      debugger: {
        attach: vi.fn().mockResolvedValue(undefined),
        detach: vi.fn().mockResolvedValue(undefined),
        sendCommand,
        onEvent: debuggerEvent.api,
        onDetach: detachEvent.api,
      },
    });

    const result = await new ChromeJavaScriptDialogAdapter().handle(
      HandleJavaScriptDialogParametersSchema.parse({
        tabId: 8,
        accept: false,
        trigger: { type: "none" },
        authorization: {
          source: "explicit_user_instruction",
          instructionId: "user-beforeunload-stay",
        },
      }),
      async () => undefined,
    );

    expect(result).toMatchObject({
      tabId: 8,
      handled: true,
      accepted: false,
      type: "unknown",
      triggerType: "none",
      requiresNewSnapshot: true,
    });
    expect(sendCommand).toHaveBeenCalledWith({ tabId: 8 }, "Page.handleJavaScriptDialog", {
      accept: false,
    });
    expect(sendCommand).not.toHaveBeenCalledWith({ tabId: 8 }, "Page.enable");
  });
});
