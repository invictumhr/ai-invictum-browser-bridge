import { describe, expect, it } from "vitest";

import { canonicalize, hasExplicitAuthorization, parameterHash } from "./control-server.js";

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
