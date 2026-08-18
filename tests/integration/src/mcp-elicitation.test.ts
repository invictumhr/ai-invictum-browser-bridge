import { createServer } from "node:http";
import { spawn } from "node:child_process";
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

const listen = async (
  server: ReturnType<typeof createServer>,
): Promise<{ url: string; close: () => Promise<void> }> => {
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

describe("MCP confirmation flow", () => {
  it("elicits a boolean R2 approval and forwards only the generated authorization", async () => {
    let actionRequest: Record<string, unknown> | undefined;
    const server = createServer((request, response) => {
      if (request.method === "GET" && request.url === "/v1/health") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ ok: true, nativeConnected: true }));
        return;
      }
      if (request.method === "POST" && request.url === "/v1/call") {
        const chunks: Buffer[] = [];
        request.on("data", (chunk: Buffer) => chunks.push(chunk));
        request.on("end", () => {
          actionRequest = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<
            string,
            unknown
          >;
          response.writeHead(200, { "content-type": "application/json" });
          response.end(JSON.stringify({ ok: true, data: { tabId: 9, closed: true } }));
        });
        return;
      }
      response.writeHead(404, { "content-type": "application/json" });
      response.end(JSON.stringify({ ok: false }));
    });
    const authority = await listen(server);
    const child = spawn(process.execPath, [mcpEntry], {
      cwd: repositoryRoot,
      env: { ...process.env, INVICTUM_CONTROL_URL: authority.url },
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    children.add(child);
    const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
    const received: Array<Record<string, unknown>> = [];
    const waitFor = async (
      predicate: (message: Record<string, unknown>) => boolean,
    ): Promise<Record<string, unknown>> => {
      const existing = received.find(predicate);
      if (existing !== undefined) return existing;
      return new Promise((resolveMessage, reject) => {
        const timeout = setTimeout(() => {
          lines.off("line", onLine);
          reject(new Error("Timed out waiting for MCP response"));
        }, 5_000);
        const onLine = (line: string): void => {
          const parsed = JSON.parse(line) as Record<string, unknown>;
          received.push(parsed);
          if (!predicate(parsed)) return;
          clearTimeout(timeout);
          lines.off("line", onLine);
          resolveMessage(parsed);
        };
        lines.on("line", onLine);
      });
    };

    try {
      child.stdin.write(
        `${JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2025-06-18",
            capabilities: { elicitation: {} },
          },
        })}\n`,
      );
      await waitFor((message) => message["id"] === 1);
      child.stdin.write(
        `${JSON.stringify({
          jsonrpc: "2.0",
          id: 2,
          method: "tools/call",
          params: { name: "invictum_close_tab", arguments: { tabId: 9 } },
        })}\n`,
      );
      const elicitation = await waitFor((message) => message["method"] === "elicitation/create");
      const elicitationJson = JSON.stringify(elicitation);
      expect(elicitationJson).toContain('"approved"');
      expect(elicitationJson).not.toMatch(/password|credential|token/iu);
      child.stdin.write(
        `${JSON.stringify({
          jsonrpc: "2.0",
          id: elicitation["id"],
          result: { action: "accept", content: { approved: true } },
        })}\n`,
      );
      const result = await waitFor((message) => message["id"] === 2);
      expect(result).toMatchObject({
        result: { structuredContent: { tabId: 9, closed: true }, isError: false },
      });
      expect(actionRequest).toMatchObject({
        action: "browser.close_tab",
        parameters: {
          tabId: 9,
          authorization: {
            source: "explicit_user_instruction",
            instructionId: expect.stringMatching(/^mcp-elicit-/u),
          },
        },
      });
    } finally {
      child.stdin.end();
      lines.close();
      child.kill();
      children.delete(child);
      await authority.close();
    }
  });

  it("returns structured confirmation guidance when an advertised client never answers", async () => {
    const server = createServer((request, response) => {
      if (request.method === "GET" && request.url === "/v1/health") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ ok: true, nativeConnected: true }));
        return;
      }
      response.writeHead(500, { "content-type": "application/json" });
      response.end(JSON.stringify({ ok: false }));
    });
    const authority = await listen(server);
    const child = spawn(process.execPath, [mcpEntry], {
      cwd: repositoryRoot,
      env: {
        ...process.env,
        INVICTUM_CONTROL_URL: authority.url,
        INVICTUM_MCP_ELICITATION_TIMEOUT_MS: "100",
      },
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    children.add(child);
    const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
    const received: Array<Record<string, unknown>> = [];
    lines.on("line", (line) => received.push(JSON.parse(line) as Record<string, unknown>));
    const waitFor = async (
      predicate: (message: Record<string, unknown>) => boolean,
    ): Promise<Record<string, unknown>> => {
      const startedAt = Date.now();
      while (Date.now() - startedAt < 5_000) {
        const existing = received.find(predicate);
        if (existing !== undefined) return existing;
        await new Promise((resolveWait) => setTimeout(resolveWait, 10));
      }
      throw new Error("Timed out waiting for MCP response");
    };

    try {
      child.stdin.write(
        `${JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2025-06-18",
            capabilities: { elicitation: {} },
          },
        })}\n`,
      );
      await waitFor((message) => message["id"] === 1);
      child.stdin.write(
        `${JSON.stringify({
          jsonrpc: "2.0",
          id: 2,
          method: "tools/call",
          params: { name: "invictum_close_tab", arguments: { tabId: 9 } },
        })}\n`,
      );
      await waitFor((message) => message["method"] === "elicitation/create");
      const result = await waitFor((message) => message["id"] === 2);
      expect(result).toMatchObject({
        result: {
          structuredContent: {
            code: "CONFIRMATION_REQUIRED",
            retryable: false,
            details: {
              action: "browser.close_tab",
              elicitation: "unavailable_or_timed_out",
              timeoutMs: 100,
            },
          },
          isError: true,
        },
      });
    } finally {
      child.stdin.end();
      lines.close();
      child.kill();
      children.delete(child);
      await authority.close();
    }
  });
});
