import { describe, expect, it } from "vitest";
import type { DesktopBridgeServer } from "./server.js";

import {
  DesktopControlServer,
  canonicalize,
  hasExplicitAuthorization,
  parameterHash,
} from "./control-server.js";

describe("audit canonicalisation", () => {
  it("orders keys so the same request hashes the same way", () => {
    expect(canonicalize({ b: 1, a: 2 })).toEqual({ a: 2, b: 1 });
    expect(JSON.stringify(canonicalize({ b: 1, a: 2 }))).toBe(
      JSON.stringify(canonicalize({ a: 2, b: 1 })),
    );
  });

  it("canonicalises nested objects and objects inside arrays", () => {
    expect(canonicalize({ outer: { z: 1, a: { y: 2, b: 3 } } })).toEqual({
      outer: { a: { b: 3, y: 2 }, z: 1 },
    });
    expect(canonicalize([{ b: 1, a: 2 }])).toEqual([{ a: 2, b: 1 }]);
  });

  it("leaves primitives and array order alone", () => {
    expect(canonicalize([3, 1, 2])).toEqual([3, 1, 2]);
    expect(canonicalize("text")).toBe("text");
    expect(canonicalize(null)).toBeNull();
  });
});

describe("idempotency hashing", () => {
  it("treats key order as irrelevant but action and values as significant", () => {
    const a = parameterHash("browser.click", { tabId: 1, elementId: "x" });
    const b = parameterHash("browser.click", { elementId: "x", tabId: 1 });
    expect(a).toBe(b);
    expect(parameterHash("browser.click", { tabId: 2, elementId: "x" })).not.toBe(a);
    // A different action with identical parameters must not collide, otherwise
    // one action could replay another's cached result.
    expect(parameterHash("browser.submit_form", { tabId: 1, elementId: "x" })).not.toBe(a);
  });

  it("produces a stable sha256 digest", () => {
    expect(parameterHash("browser.click", { tabId: 1 })).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("explicit authorization", () => {
  it("accepts only a complete explicit-user-instruction envelope", () => {
    expect(
      hasExplicitAuthorization({
        authorization: { source: "explicit_user_instruction", instructionId: "msg-1" },
      }),
    ).toBe(true);
  });

  it.each([
    ["no authorization at all", {}],
    ["a non-object authorization", { authorization: "yes" }],
    ["another source", { authorization: { source: "agent", instructionId: "msg-1" } }],
    ["a missing instruction id", { authorization: { source: "explicit_user_instruction" } }],
    [
      "an empty instruction id",
      { authorization: { source: "explicit_user_instruction", instructionId: "" } },
    ],
    [
      "a non-string instruction id",
      { authorization: { source: "explicit_user_instruction", instructionId: 7 } },
    ],
  ])("rejects %s", (_label, parameters) => {
    expect(hasExplicitAuthorization(parameters)).toBe(false);
  });

  it("rejects non-object parameters outright", () => {
    expect(hasExplicitAuthorization(null)).toBe(false);
    expect(hasExplicitAuthorization("explicit_user_instruction")).toBe(false);
    expect(hasExplicitAuthorization([])).toBe(false);
  });
});

describe("authenticated loopback control", () => {
  it("keeps health public but requires the per-user bearer token for commands", async () => {
    const bridge = {
      connected: true,
      address: { url: "ws://127.0.0.1:47821/native" },
      ping: async () => ({ reply: "pong" }),
    } as unknown as DesktopBridgeServer;
    const server = new DesktopControlServer({ bridge, port: 0, authToken: "x".repeat(43) });
    const address = await server.start();
    try {
      const health = await fetch(`${address.url}/v1/health`);
      expect(health.status).toBe(200);
      expect(await health.json()).toMatchObject({ ok: true, authenticationRequired: true });

      const denied = await fetch(`${address.url}/v1/call`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "system.ping", parameters: {} }),
      });
      expect(denied.status).toBe(401);
      expect(await denied.json()).toMatchObject({
        ok: false,
        error: { code: "AUTHENTICATION_FAILED" },
      });

      const allowed = await fetch(`${address.url}/v1/call`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${"x".repeat(43)}`,
        },
        body: JSON.stringify({ action: "system.ping", parameters: {} }),
      });
      expect(allowed.status).toBe(200);
      expect(await allowed.json()).toMatchObject({ ok: true, data: { reply: "pong" } });

      const detailedHealth = await fetch(`${address.url}/v1/call`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${"x".repeat(43)}`,
        },
        body: JSON.stringify({ action: "system.health_details", parameters: {} }),
      });
      expect(detailedHealth.status).toBe(200);
      expect(await detailedHealth.json()).toMatchObject({
        ok: true,
        data: {
          component: "desktop-authority",
          nativeConnected: true,
          authenticatedControlApi: true,
          controlledSessions: 0,
          controlledTabs: 0,
          journalEnabled: false,
          auditPersistenceEnabled: false,
        },
      });
    } finally {
      await server.stop();
    }
  });
});
