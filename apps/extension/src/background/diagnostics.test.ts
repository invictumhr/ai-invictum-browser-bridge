import { afterEach, describe, expect, it, vi } from "vitest";

import { ChromeDiagnosticsAdapter } from "./diagnostics.js";

afterEach(() => vi.unstubAllGlobals());

describe("CDP production diagnostics", () => {
  it("returns a bounded frame tree with credentials, query, and fragment removed", async () => {
    vi.stubGlobal("chrome", {
      permissions: { contains: vi.fn(async () => true) },
      debugger: {
        attach: vi.fn(async () => undefined),
        detach: vi.fn(async () => undefined),
        onDetach: { addListener: vi.fn() },
        sendCommand: vi.fn(async (_target, method: string) => {
          if (method === "Page.getFrameTree") {
            return {
              frameTree: {
                frame: {
                  id: "main",
                  url: "https://user:pass@example.test/app?token=secret#part",
                  name: "",
                  mimeType: "text/html",
                  securityOrigin: "https://example.test",
                },
                childFrames: [
                  {
                    frame: {
                      id: "child",
                      parentId: "main",
                      url: "https://cdn.example.test/widget?id=7",
                      name: "widget",
                      mimeType: "text/html",
                      securityOrigin: "https://cdn.example.test",
                    },
                  },
                ],
              },
            };
          }
          return {};
        }),
      },
    });

    const result = await new ChromeDiagnosticsAdapter().listFrames({ tabId: 9, maxFrames: 10 });
    expect(result.mainFrameId).toBe("main");
    expect(result.frames).toHaveLength(2);
    expect(result.frames[0]?.url).toBe("https://example.test/app");
    expect(result.frames[1]?.url).toBe("https://cdn.example.test/widget");
    expect(JSON.stringify(result)).not.toContain("secret");
    expect(JSON.stringify(result)).not.toContain("pass");
  });

  it("omits AX values and redacts credential-shaped accessible text", async () => {
    vi.stubGlobal("chrome", {
      permissions: { contains: vi.fn(async () => true) },
      debugger: {
        attach: vi.fn(async () => undefined),
        detach: vi.fn(async () => undefined),
        onDetach: { addListener: vi.fn() },
        sendCommand: vi.fn(async (_target, method: string) => {
          if (method === "Accessibility.getFullAXTree") {
            return {
              nodes: [
                {
                  nodeId: "1",
                  role: { value: "textbox" },
                  name: { value: "token=super-secret-value" },
                  value: { value: "must-never-leave" },
                  ignored: false,
                  properties: [{ name: "required", value: { value: true } }],
                },
              ],
            };
          }
          return {};
        }),
      },
    });

    const result = await new ChromeDiagnosticsAdapter().accessibilityTree({
      tabId: 9,
      depth: 12,
      maxNodes: 100,
      interestingOnly: true,
    });
    expect(result.nodes[0]).toMatchObject({
      role: "textbox",
      name: "token=[REDACTED]",
      properties: { required: true },
    });
    expect(JSON.stringify(result)).not.toContain("must-never-leave");
    expect(JSON.stringify(result)).not.toContain("super-secret-value");
  });
});
