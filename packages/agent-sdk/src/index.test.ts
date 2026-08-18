import { describe, expect, it, vi } from "vitest";

import { InvictumControlClient } from "./index.js";

describe("InvictumControlClient", () => {
  it("sets an optional per-tab control identity", async () => {
    const fetchImplementation = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          data: {
            tabId: 8,
            agentName: "Codex",
            label: "Codex is using this tab",
            identified: true,
          },
        }),
        { headers: { "content-type": "application/json" } },
      ),
    );
    const client = new InvictumControlClient({
      fetchImplementation,
      context: { sessionId: "test-session" },
    });

    await expect(client.identifyTab(8, "Codex")).resolves.toMatchObject({
      label: "Codex is using this tab",
    });
    expect(fetchImplementation.mock.calls[0]?.[1]?.body).toContain(
      '"action":"browser.set_control_identity"',
    );
  });

  it("returns top-level health metadata from the control API", async () => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(JSON.stringify({ ok: true, nativeConnected: true, controlUrl: "local" })),
      );
    const client = new InvictumControlClient({ fetchImplementation });

    await expect(client.health()).resolves.toMatchObject({
      nativeConnected: true,
      controlUrl: "local",
    });
  });

  it("forwards an idempotency key outside action parameters", async () => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify({ ok: true, data: { submitted: true } })));
    const client = new InvictumControlClient({ fetchImplementation });

    await client.call(
      "browser.submit_form",
      { tabId: 8, elementId: "form-1" },
      { idempotencyKey: "save-post-42" },
    );

    const body = JSON.parse(String(fetchImplementation.mock.calls[0]?.[1]?.body)) as {
      idempotencyKey?: string;
      parameters: Record<string, unknown>;
    };
    expect(body.idempotencyKey).toBe("save-post-42");
    expect(body.parameters).not.toHaveProperty("idempotencyKey");
  });

  it("exposes the shared enhanced action workflow to SDK callers", async () => {
    const requests: string[] = [];
    const fetchImplementation = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {
      const request = JSON.parse(String(init?.body)) as { action: string };
      requests.push(request.action);
      return new Response(
        JSON.stringify({
          ok: true,
          data:
            request.action === "browser.wait_for"
              ? { matched: true }
              : request.action === "browser.get_page_snapshot"
                ? {
                    metadata: {
                      documentId: "document-1",
                      domRevision: 2,
                      detail: "outline",
                    },
                    elements: [],
                  }
                : { clicked: true },
        }),
      );
    });
    const client = new InvictumControlClient({ fetchImplementation });

    await expect(
      client.enhancedCall("browser.click", {
        tabId: 8,
        documentId: "document-1",
        domRevision: 1,
        elementId: "save",
        verify: { condition: { type: "text", value: "Saved" } },
        postSnapshot: "outline",
      }),
    ).resolves.toMatchObject({
      clicked: true,
      verification: { matched: true },
      postSnapshot: { metadata: { domRevision: 2 } },
    });
    expect(requests).toEqual(["browser.click", "browser.wait_for", "browser.get_page_snapshot"]);
  });

  it("always releases a reserved tab in finally", async () => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, data: { value: 1 } })))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, data: { tabId: 8, unlocked: true } })),
      );
    const client = new InvictumControlClient({
      fetchImplementation,
      context: { sessionId: "test-session" },
    });

    await expect(
      client.withReservedTab(8, async (reserved) =>
        reserved.call<{ value: number }>("browser.get_page_snapshot", { tabId: 8 }),
      ),
    ).resolves.toEqual({ value: 1 });
    expect(fetchImplementation).toHaveBeenCalledTimes(2);
    expect(fetchImplementation.mock.calls[1]?.[1]?.body).toContain('"browser.unlock_tab"');
  });

  it("builds a revision-bound annotated tutorial screenshot", async () => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(JSON.stringify({ ok: true, data: { screenshotId: "shot" } })),
      );
    const client = new InvictumControlClient({ fetchImplementation });

    await client.captureTutorialScreenshot({
      tabId: 8,
      documentId: "document-1",
      domRevision: 4,
      elementId: "button-save",
      text: "Click here",
    });

    const body = JSON.parse(String(fetchImplementation.mock.calls[0]?.[1]?.body)) as {
      action: string;
      parameters: Record<string, unknown>;
    };
    expect(body.action).toBe("browser.screenshot");
    expect(body.parameters).toMatchObject({
      tabId: 8,
      mode: "element",
      elementId: "button-save",
      annotations: [
        {
          target: { type: "element", elementId: "button-save" },
          label: { text: "Click here", arrow: true },
        },
      ],
    });
  });

  it("preserves an operation failure after successfully releasing the tab", async () => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(JSON.stringify({ ok: true, data: { tabId: 8, unlocked: true } })),
      );
    const client = new InvictumControlClient({ fetchImplementation });

    await expect(
      client.withReservedTab(8, async () => {
        throw new Error("work failed");
      }),
    ).rejects.toThrow("work failed");
    expect(fetchImplementation).toHaveBeenCalledTimes(1);
  });

  it("runs a sequential batch and resolves prior-step placeholders", async () => {
    const requests: Array<{ action: string; parameters: Record<string, unknown> }> = [];
    const fetchImplementation = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {
      const request = JSON.parse(String(init?.body)) as {
        action: string;
        parameters: Record<string, unknown>;
      };
      requests.push(request);
      return new Response(
        JSON.stringify({
          ok: true,
          data:
            request.action === "browser.open_tab"
              ? { tab: { tabId: 9 } }
              : { documentId: "doc-9", tabId: request.parameters["tabId"] },
        }),
      );
    });
    const client = new InvictumControlClient({ fetchImplementation });

    const result = await client.batch([
      {
        id: "open",
        action: "browser.open_tab",
        parameters: { url: "https://example.test/" },
      },
      {
        id: "text",
        action: "browser.get_page_text",
        parameters: { tabId: "$steps.open.tab.tabId" },
      },
    ]);

    expect(result).toMatchObject({ completed: 2, failed: 0, stoppedEarly: false });
    expect(requests[1]).toMatchObject({
      action: "browser.get_page_text",
      parameters: { tabId: 9 },
    });
  });

  it("maps the terminal execution helper to one submitted typed terminal action", async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          data: {
            tabId: 8,
            documentId: "terminal-document",
            domRevision: 2,
            terminalId: "xterm-1",
            inputType: "text",
            characters: 6,
            submitted: true,
            key: null,
            trustedInput: true,
            tabActivated: false,
            output: { text: "ok" },
          },
        }),
      ),
    );
    const client = new InvictumControlClient({ fetchImplementation });

    await client.executeTerminal(
      {
        tabId: 8,
        documentId: "terminal-document",
        domRevision: 2,
        terminalId: "xterm-1",
        authorization: {
          source: "explicit_user_instruction",
          instructionId: "user-terminal-sdk-test",
        },
      },
      "pwd -P",
    );

    const body = JSON.parse(String(fetchImplementation.mock.calls[0]?.[1]?.body)) as {
      action: string;
      parameters: Record<string, unknown>;
    };
    expect(body).toMatchObject({
      action: "browser.terminal_input",
      parameters: {
        tabId: 8,
        terminalId: "xterm-1",
        input: { type: "text", text: "pwd -P", submit: true },
      },
    });
  });
});
