import { afterEach, describe, expect, it, vi } from "vitest";
import { runInNewContext } from "node:vm";

import { EvaluateJavaScriptParametersSchema, IBP_ERROR_CODES } from "@invictum/protocol";

import { ChromeJavaScriptAdapter } from "./javascript.js";

afterEach(() => vi.unstubAllGlobals());

const authorization = {
  source: "explicit_user_instruction" as const,
  instructionId: "user-turn-js",
};

describe("ChromeJavaScriptAdapter", () => {
  it("executes and validates a policy-approved read-only expression", async () => {
    const sendCommand = vi
      .fn()
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ frameTree: { frame: { id: "root-frame" } } })
      .mockResolvedValueOnce({ executionContextId: 17 })
      .mockResolvedValueOnce({
        result: {
          type: "string",
          value: JSON.stringify({
            value: "Dashboard",
            valueType: "string",
            truncated: false,
          }),
        },
      })
      .mockResolvedValueOnce({});
    vi.stubGlobal("chrome", {
      permissions: { contains: vi.fn().mockResolvedValue(true) },
      tabs: { get: vi.fn().mockResolvedValue({ url: "https://example.test/" }) },
      debugger: {
        attach: vi.fn().mockResolvedValue(undefined),
        sendCommand,
        detach: vi.fn().mockResolvedValue(undefined),
      },
    });
    const parameters = EvaluateJavaScriptParametersSchema.parse({
      tabId: 3,
      expression: "document.title",
      authorization,
    });
    await expect(new ChromeJavaScriptAdapter().evaluate(parameters)).resolves.toMatchObject({
      value: "Dashboard",
      mode: "read_only",
    });
    expect(sendCommand).toHaveBeenCalledWith(
      { tabId: 3 },
      "Page.createIsolatedWorld",
      expect.objectContaining({ frameId: "root-frame" }),
    );
    expect(sendCommand).toHaveBeenCalledWith(
      { tabId: 3 },
      "Runtime.evaluate",
      expect.objectContaining({
        contextId: 17,
        expression: expect.stringContaining("document.title"),
      }),
    );
    const runtimeCall = sendCommand.mock.calls.find((call) => call[1] === "Runtime.evaluate");
    const runtimeParameters = runtimeCall?.[2] as { expression?: unknown } | undefined;
    expect(typeof runtimeParameters?.expression).toBe("string");
    const locallyEvaluated = runInNewContext(runtimeParameters?.expression as string, {
      document: { title: "Dashboard" },
    }) as string;
    expect(JSON.parse(locallyEvaluated)).toEqual({
      value: "Dashboard",
      valueType: "string",
      truncated: false,
    });
  });

  it("evaluates MAIN-world expressions without creating an isolated context", async () => {
    const sendCommand = vi
      .fn()
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        result: {
          type: "string",
          value: JSON.stringify({
            value: "Dashboard",
            valueType: "string",
            truncated: false,
          }),
        },
      })
      .mockResolvedValueOnce({});
    vi.stubGlobal("chrome", {
      permissions: { contains: vi.fn().mockResolvedValue(true) },
      tabs: { get: vi.fn().mockResolvedValue({ url: "https://example.test/" }) },
      debugger: {
        attach: vi.fn().mockResolvedValue(undefined),
        sendCommand,
        detach: vi.fn().mockResolvedValue(undefined),
      },
    });
    const parameters = EvaluateJavaScriptParametersSchema.parse({
      tabId: 4,
      expression: "document.title",
      world: "MAIN",
      authorization,
    });
    await expect(new ChromeJavaScriptAdapter().evaluate(parameters)).resolves.toMatchObject({
      value: "Dashboard",
      world: "MAIN",
    });
    expect(sendCommand).not.toHaveBeenCalledWith(
      { tabId: 4 },
      "Page.createIsolatedWorld",
      expect.anything(),
    );
  });

  it("denies network and submit expressions before Chrome execution", async () => {
    vi.stubGlobal("chrome", {});
    for (const expression of [
      'fetch("https://example.test")',
      'document.querySelector("form")?.submit()',
    ]) {
      const parameters = EvaluateJavaScriptParametersSchema.parse({
        tabId: 3,
        expression,
        mode: "page_mutation",
        authorization,
      });
      await expect(new ChromeJavaScriptAdapter().evaluate(parameters)).rejects.toMatchObject({
        code: IBP_ERROR_CODES.SCRIPT_POLICY_DENIED,
      });
    }
  });
});
