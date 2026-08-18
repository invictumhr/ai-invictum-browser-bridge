import { afterEach, describe, expect, it, vi } from "vitest";

import {
  BrowserConsoleParametersSchema,
  DeviceEmulationParametersSchema,
} from "@invictum/protocol";

import { ChromeBrowserConsoleAdapter } from "./console.js";
import { ChromeDeviceEmulationAdapter } from "./device-emulation.js";

afterEach(() => vi.unstubAllGlobals());

describe("shared DevTools controls", () => {
  it("captures redacted console output while mobile emulation shares one debugger session", async () => {
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

    const consoleAdapter = new ChromeBrowserConsoleAdapter();
    const deviceAdapter = new ChromeDeviceEmulationAdapter();
    await consoleAdapter.manage(
      BrowserConsoleParametersSchema.parse({
        operation: "start",
        tabId: 7,
        bufferSize: 20,
      }),
    );
    await deviceAdapter.manage(
      DeviceEmulationParametersSchema.parse({
        operation: "set",
        tabId: 7,
        preset: "mobile_medium",
        orientation: "portrait",
      }),
    );

    eventListener?.({ tabId: 7 }, "Runtime.consoleAPICalled", {
      type: "error",
      timestamp: Date.now(),
      args: [{ type: "string", value: "token=super-secret console failed" }],
      stackTrace: {
        callFrames: [
          {
            url: "https://example.test/app?token=leak",
            lineNumber: 12,
            columnNumber: 4,
          },
        ],
      },
    });
    const read = await consoleAdapter.manage(
      BrowserConsoleParametersSchema.parse({ operation: "read", tabId: 7 }),
    );

    expect(attach).toHaveBeenCalledTimes(1);
    expect(read.entries).toHaveLength(1);
    expect(read.entries[0]).toMatchObject({
      level: "error",
      text: "token=[REDACTED] console failed",
      url: "https://example.test/app",
      lineNumber: 12,
    });
    expect(sendCommand).toHaveBeenCalledWith(
      { tabId: 7 },
      "Emulation.setDeviceMetricsOverride",
      expect.objectContaining({
        width: 390,
        height: 844,
        deviceScaleFactor: 3,
        mobile: true,
      }),
    );

    await consoleAdapter.manage(
      BrowserConsoleParametersSchema.parse({ operation: "stop", tabId: 7 }),
    );
    expect(detach).not.toHaveBeenCalled();
    const reset = await deviceAdapter.manage(
      DeviceEmulationParametersSchema.parse({ operation: "reset", tabId: 7 }),
    );
    expect(reset).toMatchObject({
      active: false,
      profile: null,
      requiresNewSnapshot: true,
    });
    expect(detach).toHaveBeenCalledTimes(1);
  });

  it("validates custom mobile dimensions and returns inactive state idempotently", async () => {
    expect(() =>
      DeviceEmulationParametersSchema.parse({
        operation: "set",
        tabId: 1,
        preset: "custom",
        width: 360,
      }),
    ).toThrow();

    vi.stubGlobal("chrome", {
      debugger: {
        onDetach: { addListener: vi.fn() },
      },
    });
    const adapter = new ChromeDeviceEmulationAdapter();
    await expect(
      adapter.manage(DeviceEmulationParametersSchema.parse({ operation: "get", tabId: 99 })),
    ).resolves.toMatchObject({
      active: false,
      profile: null,
      debuggerAttached: false,
      requiresNewSnapshot: false,
    });
  });

  it("clears a partial mobile override without detaching another active feature", async () => {
    const attach = vi.fn().mockResolvedValue(undefined);
    const detach = vi.fn().mockResolvedValue(undefined);
    const sendCommand = vi.fn(
      async (_target: chrome.debugger.Debuggee, method: string, parameters?: object) => {
        if (
          method === "Emulation.setTouchEmulationEnabled" &&
          (parameters as { enabled?: boolean } | undefined)?.enabled === true
        ) {
          throw new Error("Touch emulation failed");
        }
      },
    );
    vi.stubGlobal("chrome", {
      permissions: { contains: vi.fn().mockResolvedValue(true) },
      tabs: { get: vi.fn().mockResolvedValue({ url: "https://example.test/mobile" }) },
      debugger: {
        attach,
        detach,
        sendCommand,
        onEvent: { addListener: vi.fn() },
        onDetach: { addListener: vi.fn() },
      },
    });

    const consoleAdapter = new ChromeBrowserConsoleAdapter();
    const deviceAdapter = new ChromeDeviceEmulationAdapter();
    await consoleAdapter.manage(
      BrowserConsoleParametersSchema.parse({ operation: "start", tabId: 8 }),
    );

    await expect(
      deviceAdapter.manage(
        DeviceEmulationParametersSchema.parse({
          operation: "set",
          tabId: 8,
          preset: "mobile_medium",
        }),
      ),
    ).rejects.toThrow("Chrome could not enable mobile preview");

    expect(deviceAdapter.state(8)).toBeUndefined();
    expect(sendCommand).toHaveBeenCalledWith({ tabId: 8 }, "Emulation.clearDeviceMetricsOverride");
    expect(sendCommand).toHaveBeenCalledWith({ tabId: 8 }, "Emulation.setTouchEmulationEnabled", {
      enabled: false,
      maxTouchPoints: 1,
    });
    expect(detach).not.toHaveBeenCalled();

    await consoleAdapter.manage(
      BrowserConsoleParametersSchema.parse({ operation: "stop", tabId: 8 }),
    );
    expect(detach).toHaveBeenCalledTimes(1);
  });
});
