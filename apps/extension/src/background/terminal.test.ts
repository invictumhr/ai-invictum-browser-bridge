import { afterEach, describe, expect, it, vi } from "vitest";

import {
  IBP_ERROR_CODES,
  ReadTerminalParametersSchema,
  TerminalInputParametersSchema,
} from "@invictum/protocol";

import { ChromeTerminalAdapter } from "./terminal.js";

const authorization = {
  source: "explicit_user_instruction" as const,
  instructionId: "user-terminal-fixture",
};

const terminal = {
  terminalId: "xterm-1",
  engine: "xterm" as const,
  renderer: "canvas" as const,
  documentId: "terminal-document",
  domRevision: 3,
  index: 0,
  focused: false,
  inputAvailable: true,
  screenshotRegion: {
    x: 120,
    y: 240,
    width: 960,
    height: 480,
    coordinateSpace: "document" as const,
  },
};

const debuggerApi = (
  bufferLines: readonly (readonly string[])[],
): {
  attach: ReturnType<typeof vi.fn>;
  detach: ReturnType<typeof vi.fn>;
  sendCommand: ReturnType<typeof vi.fn>;
  onDetach: { addListener: ReturnType<typeof vi.fn> };
} => {
  let bufferRead = 0;
  return {
    attach: vi.fn().mockResolvedValue(undefined),
    detach: vi.fn().mockResolvedValue(undefined),
    sendCommand: vi.fn(
      async (_target: chrome.debugger.Debuggee, method: string): Promise<unknown> => {
        if (method === "Runtime.evaluate") return { result: { objectId: "prototype" } };
        if (method === "Runtime.queryObjects") return { objects: { objectId: "instances" } };
        if (method === "Runtime.callFunctionOn") {
          const lines = bufferLines[Math.min(bufferRead, bufferLines.length - 1)] ?? [];
          bufferRead += 1;
          return {
            result: {
              value: {
                ok: true,
                lines: [...lines],
                buffer: "normal",
                columns: 100,
                rows: 30,
                cursor: { x: 2, y: 2 },
                totalLines: lines.length,
              },
            },
          };
        }
        return undefined;
      },
    ),
    onDetach: { addListener: vi.fn() },
  };
};

afterEach(() => vi.unstubAllGlobals());

describe("ChromeTerminalAdapter", () => {
  it("detects a canvas xterm without activating the tab", async () => {
    const tabsUpdate = vi.fn();
    vi.stubGlobal("chrome", {
      permissions: { contains: vi.fn().mockResolvedValue(true) },
      tabs: {
        get: vi.fn().mockResolvedValue({ url: "https://server.example.test:2087/terminal" }),
        update: tabsUpdate,
      },
      scripting: {
        executeScript: vi.fn().mockResolvedValue([
          {
            frameId: 0,
            result: {
              ok: true,
              origin: "https://server.example.test:2087",
              documentId: "terminal-document",
              domRevision: 3,
              terminals: [terminal],
            },
          },
        ]),
      },
    });

    await expect(new ChromeTerminalAdapter().getTerminals({ tabId: 31 })).resolves.toMatchObject({
      count: 1,
      terminals: [
        {
          terminalId: "xterm-1",
          renderer: "canvas",
          trustedInputAvailable: true,
          bufferReadbackAvailable: true,
          screenshotRegion: terminal.screenshotRegion,
        },
      ],
    });
    expect(tabsUpdate).not.toHaveBeenCalled();
  });

  it("reads the bounded xterm buffer and redacts common credentials", async () => {
    const debuggerMock = debuggerApi([
      ["password=hunter2", "Authorization: Bearer abcdefghijklmnop", "fixture@test:~$"],
    ]);
    vi.stubGlobal("chrome", {
      permissions: { contains: vi.fn().mockResolvedValue(true) },
      tabs: { get: vi.fn().mockResolvedValue({ url: "https://example.test/terminal" }) },
      scripting: {
        executeScript: vi.fn().mockResolvedValue([
          {
            frameId: 0,
            result: {
              ok: true,
              documentId: "terminal-document",
              domRevision: 3,
              terminal,
              lines: [],
            },
          },
        ]),
      },
      debugger: debuggerMock,
    });

    const result = await new ChromeTerminalAdapter().readTerminal(
      ReadTerminalParametersSchema.parse({
        tabId: 32,
        documentId: "terminal-document",
        domRevision: 3,
        terminalId: "xterm-1",
        authorization,
      }),
    );

    expect(result).toMatchObject({ source: "xterm_buffer", matched: true, timedOut: false });
    expect(result.text).toContain("password=[REDACTED]");
    expect(result.text).toContain("Authorization: [REDACTED]");
    expect(result.text).not.toContain("hunter2");
    expect(result.text).not.toContain("abcdefghijklmnop");
    expect(result.redactionsApplied).toBeGreaterThanOrEqual(2);
    expect(debuggerMock.detach).toHaveBeenCalledWith({ tabId: 32 });
  });

  it("delivers one trusted text insertion, waits for output change, and never activates the tab", async () => {
    const debuggerMock = debuggerApi([
      ["fixture@test:~$"],
      ["fixture@test:~$ printf terminal-ok", "terminal-ok", "fixture@test:~$"],
    ]);
    const tabsUpdate = vi.fn();
    vi.stubGlobal("chrome", {
      permissions: { contains: vi.fn().mockResolvedValue(true) },
      tabs: {
        get: vi.fn().mockResolvedValue({ url: "https://example.test/terminal" }),
        update: tabsUpdate,
      },
      scripting: {
        executeScript: vi.fn().mockResolvedValue([
          {
            frameId: 0,
            result: {
              ok: true,
              documentId: "terminal-document",
              domRevision: 3,
              terminal: { ...terminal, domRevision: 4, focused: true },
            },
          },
        ]),
      },
      debugger: debuggerMock,
    });

    const result = await new ChromeTerminalAdapter().input(
      TerminalInputParametersSchema.parse({
        tabId: 33,
        documentId: "terminal-document",
        domRevision: 3,
        terminalId: "xterm-1",
        input: { type: "text", text: "printf terminal-ok", submit: true },
        authorization,
      }),
    );

    expect(result).toMatchObject({
      domRevision: 4,
      submitted: true,
      trustedInput: true,
      tabActivated: false,
      deliveryVerification: "observed",
      output: { matched: true, timedOut: false },
    });
    expect(result.output.text).toContain("terminal-ok");
    const characterEvents = debuggerMock.sendCommand.mock.calls.filter(
      ([, method, parameters]) =>
        method === "Input.dispatchKeyEvent" && parameters?.type === "char",
    );
    expect(characterEvents.map(([, , parameters]) => parameters?.text).join("")).toBe(
      "printf terminal-ok",
    );
    expect(characterEvents).toHaveLength(Array.from("printf terminal-ok").length);
    expect(
      characterEvents.every(
        ([, , parameters]) => Array.from(String(parameters?.text)).length === 1,
      ),
    ).toBe(true);
    expect(debuggerMock.sendCommand).toHaveBeenCalledWith(
      { tabId: 33 },
      "Emulation.setFocusEmulationEnabled",
      { enabled: true },
    );
    expect(debuggerMock.sendCommand).toHaveBeenCalledWith(
      { tabId: 33 },
      "Emulation.setFocusEmulationEnabled",
      { enabled: false },
    );
    expect(tabsUpdate).not.toHaveBeenCalled();
  });

  it("returns immediately with explicit unverified delivery when readback is unavailable", async () => {
    const debuggerMock = {
      attach: vi.fn().mockResolvedValue(undefined),
      detach: vi.fn().mockResolvedValue(undefined),
      sendCommand: vi.fn(
        async (...args: [chrome.debugger.Debuggee, string, Record<string, unknown>?]) => {
          const method = args[1];
          if (method === "Runtime.evaluate") return { result: {} };
          return undefined;
        },
      ),
      onDetach: { addListener: vi.fn() },
    };
    const executeScript = vi
      .fn()
      .mockResolvedValueOnce([
        {
          frameId: 0,
          result: {
            ok: true,
            documentId: "terminal-document",
            domRevision: 4,
            terminal: { ...terminal, domRevision: 4, focused: true },
          },
        },
      ])
      .mockResolvedValue([
        {
          frameId: 0,
          result: {
            ok: true,
            documentId: "terminal-document",
            domRevision: 4,
            terminal: { ...terminal, domRevision: 4, focused: true },
            lines: [],
          },
        },
      ]);
    vi.stubGlobal("chrome", {
      permissions: { contains: vi.fn().mockResolvedValue(true) },
      tabs: { get: vi.fn().mockResolvedValue({ url: "https://example.test/terminal" }) },
      scripting: { executeScript },
      debugger: debuggerMock,
    });

    const result = await new ChromeTerminalAdapter().input(
      TerminalInputParametersSchema.parse({
        tabId: 34,
        documentId: "terminal-document",
        domRevision: 3,
        terminalId: "xterm-1",
        input: { type: "text", text: "echo 🧪", submit: false },
        authorization,
      }),
    );

    expect(result).toMatchObject({
      characters: 6,
      submitted: false,
      deliveryVerification: "unavailable",
      output: { source: "unavailable", matched: false, timedOut: false },
    });
    const characterEvents = debuggerMock.sendCommand.mock.calls.filter(
      ([, method, parameters]) =>
        method === "Input.dispatchKeyEvent" && parameters?.type === "char",
    );
    expect(characterEvents.map(([, , parameters]) => parameters?.text).join("")).toBe("echo 🧪");
    expect(characterEvents).toHaveLength(6);
  });

  it("uses an unambiguous terminal WebSocket to verify a draft and read command output", async () => {
    const listeners = new Set<Parameters<typeof chrome.debugger.onEvent.addListener>[0]>();
    const emit = (method: string, parameters: Record<string, unknown>): void => {
      for (const listener of listeners) listener({ tabId: 37 }, method, parameters);
    };
    const debuggerMock = {
      attach: vi.fn().mockResolvedValue(undefined),
      detach: vi.fn().mockResolvedValue(undefined),
      sendCommand: vi.fn(
        async (
          _target: chrome.debugger.Debuggee,
          method: string,
          parameters?: Record<string, unknown>,
        ): Promise<unknown> => {
          if (method === "Runtime.evaluate") return { result: {} };
          if (method === "Input.dispatchKeyEvent" && parameters?.["type"] === "char") {
            emit("Network.webSocketFrameSent", {
              requestId: "terminal-socket",
              response: { opcode: 1, payloadData: parameters["text"] },
            });
          }
          if (method === "Input.dispatchKeyEvent" && parameters?.["key"] === "Enter") {
            emit("Network.webSocketFrameReceived", {
              requestId: "terminal-socket",
              response: {
                opcode: 1,
                payloadData: "password=transport-secret\r\ntransport-ok\r\nroot@test:~# ",
              },
            });
          }
          return undefined;
        },
      ),
      onDetach: { addListener: vi.fn() },
      onEvent: {
        addListener: vi.fn((listener) => listeners.add(listener)),
        removeListener: vi.fn((listener) => listeners.delete(listener)),
      },
    };
    vi.stubGlobal("chrome", {
      permissions: { contains: vi.fn().mockResolvedValue(true) },
      tabs: { get: vi.fn().mockResolvedValue({ url: "https://example.test/terminal" }) },
      scripting: {
        executeScript: vi.fn().mockResolvedValue([
          {
            frameId: 0,
            result: {
              ok: true,
              documentId: "terminal-document",
              domRevision: 4,
              terminal: { ...terminal, domRevision: 4, focused: true },
              lines: [],
            },
          },
        ]),
      },
      debugger: debuggerMock,
    });

    const result = await new ChromeTerminalAdapter().input(
      TerminalInputParametersSchema.parse({
        tabId: 37,
        documentId: "terminal-document",
        domRevision: 3,
        terminalId: "xterm-1",
        input: { type: "text", text: "printf transport-ok", submit: true },
        authorization,
      }),
    );

    expect(result).toMatchObject({
      submitted: true,
      draftVerification: "transport_observed",
      deliveryVerification: "observed",
      output: { source: "websocket_stream", matched: true, timedOut: false },
    });
    expect(result.output.text).toContain("transport-ok");
    expect(result.output.text).toContain("password=[REDACTED]");
    expect(result.output.text).not.toContain("transport-secret");
    expect(result.output.redactionsApplied).toBeGreaterThanOrEqual(1);
    expect(debuggerMock.onEvent.removeListener).toHaveBeenCalledOnce();
  });

  it("stages text but refuses Enter when neither readback nor transport proves delivery", async () => {
    const listeners = new Set<Parameters<typeof chrome.debugger.onEvent.addListener>[0]>();
    const debuggerMock = {
      attach: vi.fn().mockResolvedValue(undefined),
      detach: vi.fn().mockResolvedValue(undefined),
      sendCommand: vi.fn(
        async (
          _target: chrome.debugger.Debuggee,
          method: string,
          parameters?: Record<string, unknown>,
        ) => {
          void parameters;
          return method === "Runtime.evaluate" ? { result: {} } : undefined;
        },
      ),
      onDetach: { addListener: vi.fn() },
      onEvent: {
        addListener: vi.fn((listener) => listeners.add(listener)),
        removeListener: vi.fn((listener) => listeners.delete(listener)),
      },
    };
    vi.stubGlobal("chrome", {
      permissions: { contains: vi.fn().mockResolvedValue(true) },
      tabs: { get: vi.fn().mockResolvedValue({ url: "https://example.test/terminal" }) },
      scripting: {
        executeScript: vi.fn().mockResolvedValue([
          {
            frameId: 0,
            result: {
              ok: true,
              documentId: "terminal-document",
              domRevision: 4,
              terminal: { ...terminal, domRevision: 4, focused: true },
              lines: [],
            },
          },
        ]),
      },
      debugger: debuggerMock,
    });

    await expect(
      new ChromeTerminalAdapter().input(
        TerminalInputParametersSchema.parse({
          tabId: 38,
          documentId: "terminal-document",
          domRevision: 3,
          terminalId: "xterm-1",
          input: { type: "text", text: "never-submit-unverified", submit: true },
          authorization,
        }),
      ),
    ).rejects.toMatchObject({
      code: IBP_ERROR_CODES.TERMINAL_DELIVERY_UNVERIFIED,
      retryable: false,
    });

    const keyEvents = debuggerMock.sendCommand.mock.calls.filter(
      ([, method]) => method === "Input.dispatchKeyEvent",
    );
    expect(keyEvents.some(([, , parameters]) => parameters?.type === "char")).toBe(true);
    expect(keyEvents.some(([, , parameters]) => parameters?.key === "Enter")).toBe(false);
    expect(debuggerMock.onEvent.removeListener).toHaveBeenCalledOnce();
  });

  it("sends no trusted keys when WHM steals focus before terminal text delivery", async () => {
    const debuggerMock = debuggerApi([["fixture@test:~$"]]);
    const executeScript = vi.fn(async (details: { args?: unknown[] }) => {
      const mode = Array.isArray(details.args) ? details.args[0] : undefined;
      const focusLost = mode === "verify_focus";
      return [
        {
          frameId: 0,
          result: focusLost
            ? { ok: false, reason: "focus_lost" }
            : {
                ok: true,
                documentId: "terminal-document",
                domRevision: 4,
                terminal: { ...terminal, domRevision: 4, focused: mode === "focus" },
                lines: [],
              },
        },
      ];
    });
    vi.stubGlobal("chrome", {
      permissions: { contains: vi.fn().mockResolvedValue(true) },
      tabs: { get: vi.fn().mockResolvedValue({ url: "https://example.test/terminal" }) },
      scripting: { executeScript },
      debugger: debuggerMock,
    });

    await expect(
      new ChromeTerminalAdapter().input(
        TerminalInputParametersSchema.parse({
          tabId: 35,
          documentId: "terminal-document",
          domRevision: 3,
          terminalId: "xterm-1",
          input: { type: "text", text: "dangerous-command", submit: true },
          authorization,
        }),
      ),
    ).rejects.toMatchObject({ code: IBP_ERROR_CODES.TERMINAL_FOCUS_LOST, retryable: false });

    expect(
      debuggerMock.sendCommand.mock.calls.filter(
        ([, method]) => method === "Input.dispatchKeyEvent",
      ),
    ).toHaveLength(0);
  });

  it("never presses Enter when focus leaves xterm after terminal text delivery", async () => {
    const debuggerMock = debuggerApi([["fixture@test:~$"]]);
    let verificationCount = 0;
    const executeScript = vi.fn(async (details: { args?: unknown[] }) => {
      const mode = Array.isArray(details.args) ? details.args[0] : undefined;
      if (mode === "verify_focus") verificationCount += 1;
      const focusLost = mode === "verify_focus" && verificationCount === 3;
      return [
        {
          frameId: 0,
          result: focusLost
            ? { ok: false, reason: "focus_lost" }
            : {
                ok: true,
                documentId: "terminal-document",
                domRevision: 4,
                terminal: { ...terminal, domRevision: 4, focused: mode !== "dom_read" },
                lines: [],
              },
        },
      ];
    });
    vi.stubGlobal("chrome", {
      permissions: { contains: vi.fn().mockResolvedValue(true) },
      tabs: { get: vi.fn().mockResolvedValue({ url: "https://example.test/terminal" }) },
      scripting: { executeScript },
      debugger: debuggerMock,
    });

    await expect(
      new ChromeTerminalAdapter().input(
        TerminalInputParametersSchema.parse({
          tabId: 36,
          documentId: "terminal-document",
          domRevision: 3,
          terminalId: "xterm-1",
          input: { type: "text", text: "draft-command", submit: true },
          authorization,
        }),
      ),
    ).rejects.toMatchObject({ code: IBP_ERROR_CODES.TERMINAL_FOCUS_LOST, retryable: false });

    const events = debuggerMock.sendCommand.mock.calls.filter(
      ([, method]) => method === "Input.dispatchKeyEvent",
    );
    expect(events.some(([, , parameters]) => parameters?.type === "char")).toBe(true);
    expect(events.some(([, , parameters]) => parameters?.key === "Enter")).toBe(false);
    const probeModes = executeScript.mock.calls.map(([details]) => details.args?.[0]);
    expect(probeModes).toContain("guard_focus");
    expect(probeModes).toContain("release_focus");
  });
});
