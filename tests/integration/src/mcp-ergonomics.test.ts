import { spawn } from "node:child_process";
import { createServer } from "node:http";
import type { IncomingMessage, RequestListener, ServerResponse } from "node:http";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

const children = new Set<ReturnType<typeof spawn>>();
const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));
const mcpEntry = fileURLToPath(new URL("../../../apps/mcp/dist/index.js", import.meta.url));

afterEach(() => {
  for (const child of children) child.kill();
  children.clear();
});

const snapshot = (
  revision: number,
  elementId: string,
  name: string,
  detail: "outline" | "interactive" = "interactive",
): Record<string, unknown> => ({
  page: {
    url: "https://example.test/form",
    title: "Fixture",
    origin: "https://example.test",
  },
  frames: [],
  elements: [
    {
      elementId,
      frameId: "top",
      tag: "button",
      role: "button",
      name,
      clickable: true,
      selectors: { css: "#save" },
    },
  ],
  forms: [],
  dialogs: [],
  alerts: [],
  textBlocks: [],
  metadata: {
    documentId: "document-fixture",
    domRevision: revision,
    generatedAt: new Date(0).toISOString(),
    elementCount: 1,
    textLength: name.length,
    truncated: false,
    truncationReasons: [],
    detail,
  },
});

const listen = async (
  handler: RequestListener,
): Promise<{ url: string; close: () => Promise<void> }> => {
  const server = createServer(handler);
  await new Promise<void>((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("Test server did not bind");
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolveClose, reject) =>
        server.close((error) => (error === undefined ? resolveClose() : reject(error))),
      ),
  };
};

const startMcp = (
  controlUrl: string,
): {
  child: ReturnType<typeof spawn>;
  send: (message: Record<string, unknown>) => void;
  waitFor: (
    predicate: (message: Record<string, unknown>) => boolean,
  ) => Promise<Record<string, unknown>>;
  close: () => void;
} => {
  const child = spawn(process.execPath, [mcpEntry], {
    cwd: repositoryRoot,
    env: { ...process.env, INVICTUM_CONTROL_URL: controlUrl },
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });
  children.add(child);
  const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
  const received: Array<Record<string, unknown>> = [];
  lines.on("line", (line) => received.push(JSON.parse(line) as Record<string, unknown>));
  return {
    child,
    send: (message) => child.stdin.write(`${JSON.stringify(message)}\n`),
    waitFor: async (predicate) => {
      const startedAt = Date.now();
      while (Date.now() - startedAt < 5_000) {
        const existing = received.find(predicate);
        if (existing !== undefined) return existing;
        await new Promise((resolveWait) => setTimeout(resolveWait, 10));
      }
      throw new Error("Timed out waiting for MCP response");
    },
    close: () => {
      child.stdin.end();
      lines.close();
      child.kill();
      children.delete(child);
    },
  };
};

const healthResponse = (response: ServerResponse): void => {
  response.writeHead(200, { "content-type": "application/json" });
  response.end(JSON.stringify({ ok: true, nativeConnected: true }));
};

const readBody = async (request: IncomingMessage): Promise<Record<string, unknown>> => {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk as Uint8Array));
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
};

const writeData = (response: ServerResponse, data: Record<string, unknown>): void => {
  response.writeHead(200, { "content-type": "application/json" });
  response.end(JSON.stringify({ ok: true, data }));
};

describe("MCP ergonomic action enhancements", () => {
  it("uses a deterministic derived idempotency key for a safe stale-reference retry", async () => {
    const calls: Array<Record<string, unknown>> = [];
    let snapshotCount = 0;
    const authority = await listen(async (request, response) => {
      if (request.method === "GET" && request.url === "/v1/health") {
        healthResponse(response);
        return;
      }
      if (request.method !== "POST" || request.url !== "/v1/call") {
        response.writeHead(404).end();
        return;
      }
      const body = await readBody(request);
      calls.push(body);
      const action = body["action"];
      const parameters =
        typeof body["parameters"] === "object" && body["parameters"] !== null
          ? (body["parameters"] as Record<string, unknown>)
          : {};
      if (action === "browser.get_page_snapshot") {
        snapshotCount += 1;
        writeData(
          response,
          snapshot(
            snapshotCount - 1,
            snapshotCount === 1 ? "el_document_0_1" : "el_document_1_2",
            "Save",
          ),
        );
        return;
      }
      if (action === "browser.find_elements") {
        writeData(response, {
          documentId: "document-fixture",
          domRevision: 1,
          matches: [
            {
              element: {
                elementId: "el_document_1_2",
                frameId: "top",
                tag: "button",
                role: "button",
                name: "Save",
                clickable: true,
                selectors: { css: "#save" },
              },
            },
          ],
          count: 1,
          truncated: false,
        });
        return;
      }
      if (action === "browser.click" && parameters["elementId"] === "el_document_0_1") {
        response.writeHead(409, { "content-type": "application/json" });
        response.end(
          JSON.stringify({
            ok: false,
            error: {
              code: "STALE_ELEMENT_REFERENCE",
              message: "stale",
              retryable: true,
            },
          }),
        );
        return;
      }
      writeData(response, {
        documentId: "document-fixture",
        domRevisionBefore: 1,
        domRevisionAfter: 2,
        elementId: "el_document_1_2",
        resolvedElementId: "el_document_2_3",
        clicked: true,
      });
    });
    const mcp = startMcp(authority.url);

    try {
      mcp.send({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: { protocolVersion: "2025-06-18", capabilities: {} },
      });
      await mcp.waitFor((message) => message["id"] === 1);
      mcp.send({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { name: "invictum_snapshot", arguments: { tabId: 7 } },
      });
      await mcp.waitFor((message) => message["id"] === 2);
      mcp.send({
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: {
          name: "invictum_click",
          arguments: {
            tabId: 7,
            documentId: "document-fixture",
            domRevision: 0,
            elementId: "el_document_0_1",
            idempotencyKey: "save-once",
          },
        },
      });
      const result = await mcp.waitFor((message) => message["id"] === 3);
      expect(result).toMatchObject({
        result: {
          structuredContent: { clicked: true, automaticallyRelocated: true },
          isError: false,
        },
      });
      const clickCalls = calls.filter((call) => call["action"] === "browser.click");
      expect(clickCalls).toHaveLength(2);
      expect(clickCalls[0]?.["idempotencyKey"]).toBe("save-once");
      expect(clickCalls[1]?.["idempotencyKey"]).toMatch(/^relocated-[a-f0-9]{48}$/u);
      expect(clickCalls[1]?.["idempotencyKey"]).not.toBe("save-once");
    } finally {
      mcp.close();
      await authority.close();
    }
  });

  it("matches semantic elements across revision-specific element IDs", async () => {
    let snapshotCount = 0;
    const authority = await listen(async (request, response) => {
      if (request.method === "GET" && request.url === "/v1/health") {
        healthResponse(response);
        return;
      }
      if (request.method !== "POST" || request.url !== "/v1/call") {
        response.writeHead(404).end();
        return;
      }
      const body = await readBody(request);
      if (body["action"] === "browser.get_page_snapshot") {
        snapshotCount += 1;
        const initial = snapshotCount === 1;
        const postSnapshot = snapshotCount === 2;
        const result = snapshot(
          initial ? 0 : 1,
          initial ? "el_document_0_1" : postSnapshot ? "el_document_1_2" : "el_document_1_3",
          initial ? "Before" : "After",
          postSnapshot ? "outline" : "interactive",
        );
        if (postSnapshot) {
          delete result["elements"];
          result["outline"] = [
            {
              elementId: "el_document_1_2",
              frameId: "top",
              tag: "button",
              role: "button",
              name: "After",
              clickable: true,
              css: "#save",
            },
          ];
        }
        writeData(response, result);
        return;
      }
      writeData(response, {
        documentId: "document-fixture",
        domRevisionBefore: 0,
        domRevisionAfter: 1,
        operation: "scroll_to",
        performed: true,
      });
    });
    const mcp = startMcp(authority.url);

    try {
      mcp.send({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: { protocolVersion: "2025-06-18", capabilities: {} },
      });
      await mcp.waitFor((message) => message["id"] === 1);
      mcp.send({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { name: "invictum_snapshot", arguments: { tabId: 8 } },
      });
      await mcp.waitFor((message) => message["id"] === 2);
      mcp.send({
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: {
          name: "invictum_call",
          arguments: {
            action: "browser.perform_gesture",
            parameters: {
              tabId: 8,
              documentId: "document-fixture",
              domRevision: 0,
              operation: "scroll_to",
              x: 0,
              y: 100,
            },
            postSnapshot: "outline",
            domDelta: true,
          },
        },
      });
      const result = await mcp.waitFor((message) => message["id"] === 3);
      expect(result).toMatchObject({
        result: {
          structuredContent: {
            domDelta: {
              documentChanged: false,
              addedCount: 0,
              removedCount: 0,
              changedCount: 1,
              changedElementIds: ["el_document_1_3"],
            },
          },
          isError: false,
        },
      });
      expect(snapshotCount).toBe(3);
    } finally {
      mcp.close();
      await authority.close();
    }
  });
});
