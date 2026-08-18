import { afterEach, describe, expect, it, vi } from "vitest";

import type { ChromeDebuggerLease } from "./debugger-session.js";
import {
  channelCarriedDraft,
  containsDraftInOrder,
  startTerminalTransportCapture,
} from "./terminal-transport.js";

afterEach(() => vi.unstubAllGlobals());

describe("terminal WebSocket transport capture", () => {
  it("selects one socket from structured sent data and returns only its bounded output", async () => {
    const listeners = new Set<Parameters<typeof chrome.debugger.onEvent.addListener>[0]>();
    vi.stubGlobal("chrome", {
      debugger: {
        onEvent: {
          addListener: vi.fn((listener) => listeners.add(listener)),
          removeListener: vi.fn((listener) => listeners.delete(listener)),
        },
      },
    });
    const lease = {
      tabId: 9,
      target: { tabId: 9 },
      sendCommand: vi.fn().mockResolvedValue(undefined),
      release: vi.fn().mockResolvedValue(undefined),
    } satisfies ChromeDebuggerLease;
    const capture = await startTerminalTransportCapture(9, lease);
    expect(capture).toBeDefined();

    const emit = (method: string, requestId: string, payloadData: string): void => {
      for (const listener of listeners) {
        listener({ tabId: 9 }, method, { requestId, response: { opcode: 1, payloadData } });
      }
    };
    emit("Network.webSocketFrameSent", "other-socket", '{"type":"ping","data":"alive"}');
    emit(
      "Network.webSocketFrameSent",
      "terminal-socket",
      '{"type":"stdin","data":"printf terminal-ok"}',
    );

    const requestId = await capture!.findRequestIdForSentText("printf terminal-ok", 0);
    expect(requestId).toBe("terminal-socket");
    const offset = capture!.receivedLength(requestId!);
    emit(
      "Network.webSocketFrameReceived",
      "terminal-socket",
      '{"type":"stdout","data":"terminal-ok\\r\\nroot@test:~# "}',
    );
    emit("Network.webSocketFrameReceived", "other-socket", "unrelated-secret");

    expect(capture!.readReceived(requestId!, offset, 20)).toEqual({
      lines: ["terminal-ok", "root@test:~# "],
      truncated: false,
    });
    capture!.stop();
    expect(listeners).toHaveLength(0);
  });

  it("refuses an ambiguous command match across multiple sockets", async () => {
    const listeners = new Set<Parameters<typeof chrome.debugger.onEvent.addListener>[0]>();
    vi.stubGlobal("chrome", {
      debugger: {
        onEvent: {
          addListener: vi.fn((listener) => listeners.add(listener)),
          removeListener: vi.fn((listener) => listeners.delete(listener)),
        },
      },
    });
    const lease = {
      tabId: 10,
      target: { tabId: 10 },
      sendCommand: vi.fn().mockResolvedValue(undefined),
      release: vi.fn().mockResolvedValue(undefined),
    } satisfies ChromeDebuggerLease;
    const capture = await startTerminalTransportCapture(10, lease);
    const emit = (requestId: string): void => {
      for (const listener of listeners) {
        listener({ tabId: 10 }, "Network.webSocketFrameSent", {
          requestId,
          response: { opcode: 1, payloadData: "same-command" },
        });
      }
    };
    emit("socket-a");
    emit("socket-b");

    await expect(capture!.findRequestIdForSentText("same-command", 0)).resolves.toBeUndefined();
    capture!.stop();
  });
});

describe("draft matching over a framed transport", () => {
  it("still accepts a contiguous draft", () => {
    expect(containsDraftInOrder('{"t":"uptime"}', "uptime")).toBe(true);
  });

  it("accepts a draft split one keystroke per frame", () => {
    // WHM sends each keystroke in its own envelope, so the concatenated stream
    // never contains the command as a substring. This is the case that made
    // terminal-exec fail intermittently with TERMINAL_DELIVERY_UNVERIFIED.
    const framed = [..."uptime"].map((character) => `{"t":"${character}"}`).join("");
    expect(framed.includes("uptime")).toBe(false);
    expect(containsDraftInOrder(framed, "uptime")).toBe(true);
  });

  it("accepts a long command split across frames", () => {
    const command = "ps aux --sort=-pcpu | head -12";
    const framed = [...command].map((character) => `["${character}"]`).join("");
    expect(containsDraftInOrder(framed, command)).toBe(true);
  });

  it("rejects letters scattered far apart", () => {
    const scattered = `${"x".repeat(500)}u${"x".repeat(500)}p${"x".repeat(500)}time`;
    expect(containsDraftInOrder(scattered, "uptime")).toBe(false);
  });

  it("rejects a draft that is not there at all", () => {
    expect(containsDraftInOrder('{"t":"ls -la"}', "rm -rf /")).toBe(false);
  });

  it("rejects an out-of-order draft", () => {
    expect(containsDraftInOrder('{"t":"emitpu"}', "uptime")).toBe(false);
  });

  it("never matches an empty draft", () => {
    expect(containsDraftInOrder("anything", "")).toBe(false);
  });

  it("checks the raw stream and the decoded stream", () => {
    expect(channelCarriedDraft('{"d":"id"}', "", "id")).toBe(true);
    expect(channelCarriedDraft("", "id", "id")).toBe(true);
    expect(channelCarriedDraft("", "", "id")).toBe(false);
  });
});
