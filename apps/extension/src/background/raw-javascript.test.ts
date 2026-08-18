import { afterEach, describe, expect, it, vi } from "vitest";

import { ExecuteJavaScriptParametersSchema, IBP_ERROR_CODES } from "@invictum/protocol";

import { ChromeRawJavaScriptAdapter } from "./raw-javascript.js";

afterEach(() => vi.unstubAllGlobals());

const authorization = {
  source: "explicit_user_instruction" as const,
  instructionId: "user-raw-js-test",
};

describe("ChromeRawJavaScriptAdapter", () => {
  it("uses a short-lived debugger session and returns a bounded by-value result", async () => {
    const sendCommand = vi.fn(async (_target: unknown, command: string) => {
      if (command === "Runtime.evaluate") {
        return {
          result: {
            type: "object",
            subtype: "array",
            value: [{ title: "Fixture", token: "must be redacted" }],
            description: "Array(1)",
          },
        };
      }
      return undefined;
    });
    const detach = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("chrome", {
      permissions: { contains: vi.fn().mockResolvedValue(true) },
      tabs: { get: vi.fn().mockResolvedValue({ url: "https://example.test/" }) },
      debugger: {
        attach: vi.fn().mockResolvedValue(undefined),
        sendCommand,
        detach,
      },
    });

    const result = await new ChromeRawJavaScriptAdapter().execute(
      ExecuteJavaScriptParametersSchema.parse({
        tabId: 4,
        source: "[...document.querySelectorAll('h1')].map(node => ({ title: node.textContent }))",
        authorization,
      }),
    );
    expect(result).toMatchObject({
      value: [{ title: "Fixture", token: "[REDACTED]" }],
      valueType: "array",
      debuggerUsed: true,
      requiresNewSnapshot: true,
    });
    expect(sendCommand).toHaveBeenCalledWith(
      { tabId: 4 },
      "Runtime.evaluate",
      expect.objectContaining({
        awaitPromise: true,
        returnByValue: true,
        includeCommandLineAPI: false,
        allowUnsafeEvalBlockedByCSP: false,
      }),
    );
    expect(detach).toHaveBeenCalledWith({ tabId: 4 });
  });

  it("denies protected credential and browser-storage surfaces before attachment", async () => {
    const attach = vi.fn();
    vi.stubGlobal("chrome", { debugger: { attach } });
    for (const source of [
      "document.cookie",
      "localStorage.getItem('theme')",
      "document.querySelector('input').value",
      "fetch('/private')",
      "document.querySelector('button').click()",
      "chrome.tabs",
    ]) {
      await expect(
        new ChromeRawJavaScriptAdapter().execute(
          ExecuteJavaScriptParametersSchema.parse({ tabId: 4, source, authorization }),
        ),
      ).rejects.toMatchObject({ code: IBP_ERROR_CODES.SCRIPT_POLICY_DENIED });
    }
    expect(attach).not.toHaveBeenCalled();
  });
});
