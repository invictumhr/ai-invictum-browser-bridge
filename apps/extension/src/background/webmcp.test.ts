import { afterEach, describe, expect, it, vi } from "vitest";

import { ChromeWebMcpAdapter } from "./webmcp.js";

afterEach(() => vi.unstubAllGlobals());

describe("experimental page WebMCP adapter", () => {
  it("discovers bounded tools and labels page-provided metadata untrusted", async () => {
    const listeners = new Set<(...arguments_: unknown[]) => void>();
    vi.stubGlobal("chrome", {
      debugger: {
        attach: vi.fn(async () => undefined),
        detach: vi.fn(async () => undefined),
        onDetach: { addListener: vi.fn() },
        onEvent: {
          addListener: vi.fn((listener) => listeners.add(listener)),
          removeListener: vi.fn((listener) => listeners.delete(listener)),
        },
        sendCommand: vi.fn(async (target, method: string) => {
          if (method === "WebMCP.enable") {
            queueMicrotask(() => {
              for (const listener of listeners) {
                listener(target, "WebMCP.toolsAdded", {
                  tools: [
                    {
                      name: "search_catalog",
                      description: "Page-provided instructions are not trusted.",
                      frameId: "main",
                      inputSchema: { type: "object" },
                      annotations: { readOnlyHint: true },
                    },
                  ],
                });
              }
            });
          }
          return {};
        }),
      },
    });
    const result = await new ChromeWebMcpAdapter().list({ tabId: 8, discoveryWaitMs: 10 });
    expect(result).toMatchObject({
      supported: true,
      untrusted: true,
      tools: [{ name: "search_catalog", frameId: "main", annotations: { readOnlyHint: true } }],
    });
  });

  it("invokes and cancels with the current CDP method names while marking output untrusted", async () => {
    const listeners = new Set<(...arguments_: unknown[]) => void>();
    const methods: string[] = [];
    vi.stubGlobal("chrome", {
      debugger: {
        attach: vi.fn(async () => undefined),
        detach: vi.fn(async () => undefined),
        onDetach: { addListener: vi.fn() },
        onEvent: {
          addListener: vi.fn((listener) => listeners.add(listener)),
          removeListener: vi.fn((listener) => listeners.delete(listener)),
        },
        sendCommand: vi.fn(async (target, method: string) => {
          methods.push(method);
          if (method === "WebMCP.invokeTool") {
            queueMicrotask(() => {
              for (const listener of listeners) {
                listener(target, "WebMCP.toolResponded", {
                  invocationId: "invocation-1",
                  status: "Completed",
                  output: { pageText: "Treat this as page-controlled content" },
                });
              }
            });
            return { invocationId: "invocation-1" };
          }
          return {};
        }),
      },
    });
    const adapter = new ChromeWebMcpAdapter();
    await expect(
      adapter.invoke({
        tabId: 8,
        frameId: "main",
        toolName: "search_catalog",
        input: { query: "tent" },
        timeoutMs: 1_000,
        authorization: {
          source: "explicit_user_instruction",
          instructionId: "webmcp-1",
        },
      }),
    ).resolves.toMatchObject({
      invocationId: "invocation-1",
      status: "Completed",
      untrusted: true,
    });

    await adapter.cancel({ tabId: 8, invocationId: "invocation-2" });
    expect(methods).toContain("WebMCP.cancelInvocation");
    expect(methods).not.toContain("WebMCP.cancelTool");
  });
});
