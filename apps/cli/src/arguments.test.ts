import { describe, expect, it } from "vitest";

import {
  activationOverride,
  buildEnhancementArguments,
  buildWaitParameters,
  unknownFlags,
} from "./arguments.js";

describe("CLI wait argument mapping", () => {
  it("builds a strict dom_stable condition without text-only keys", () => {
    expect(buildWaitParameters(7, "dom_stable", "750", "5000")).toEqual({
      tabId: 7,
      condition: { type: "dom_stable", stableMs: 750 },
      timeoutMs: 5000,
    });
  });

  it("uses the default stability interval", () => {
    expect(buildWaitParameters(7, "dom_stable", undefined, undefined)).toEqual({
      tabId: 7,
      condition: { type: "dom_stable", stableMs: 500 },
    });
  });

  it("builds selector and text conditions according to their schemas", () => {
    expect(buildWaitParameters(7, "selector", "main", undefined)).toEqual({
      tabId: 7,
      condition: { type: "selector", value: "main" },
    });
    expect(buildWaitParameters(7, "text", "Account settings", undefined)).toEqual({
      tabId: 7,
      condition: {
        type: "text",
        value: "Account settings",
        match: "contains",
        caseSensitive: false,
      },
    });
  });

  it("rejects unsupported wait types", () => {
    expect(() => buildWaitParameters(7, "network_idle", "500", undefined)).toThrow(/wait type/);
  });

  it("maps optional tab-activation overrides without bypassing the user default", () => {
    expect(activationOverride([])).toBeUndefined();
    expect(activationOverride(["--active"])).toBe(true);
    expect(activationOverride(["--background"])).toBe(false);
    expect(() => activationOverride(["--active", "--background"])).toThrow(/either/);
  });

  it("maps the shared action-enhancement flags", () => {
    expect(
      buildEnhancementArguments([
        "--dry-run",
        "--post-snapshot",
        "interactive",
        "--dom-delta",
        "--verify",
        '{"condition":{"type":"text","value":"Saved"}}',
        "--auto-marks",
        '{"label":"name"}',
        "--timings",
        "--idempotency-key",
        "save-once",
      ]),
    ).toEqual({
      dryRun: true,
      postSnapshot: "interactive",
      domDelta: true,
      verify: { condition: { type: "text", value: "Saved" } },
      autoMarks: { label: "name" },
      timings: true,
      idempotencyKey: "save-once",
    });
  });

  it("rejects malformed enhancement flags before any browser action", () => {
    expect(() => buildEnhancementArguments(["--post-snapshot", "full"])).toThrow(
      /outline or interactive/,
    );
    expect(() => buildEnhancementArguments(["--verify", "[]"])).toThrow(/JSON object/);
    expect(() => buildEnhancementArguments(["--idempotency-key"])).toThrow(/requires a value/);
  });
});

describe("unknown CLI flags", () => {
  it("names a flag the CLI does not support", () => {
    // `call --out file.jpg` used to be dropped silently, which looked like the
    // screenshot had been written to disk.
    expect(unknownFlags(["call", "browser.screenshot", "--stdin", "--out", "page.jpg"])).toEqual([
      "--out",
    ]);
  });

  it("accepts every documented flag", () => {
    expect(unknownFlags(["--pretty", "--dry-run", "--dom-delta", "--timings", "--stdin"])).toEqual(
      [],
    );
  });

  it("ignores positional arguments and values", () => {
    expect(unknownFlags(["snapshot", "42", "outline", "--post-snapshot", "outline"])).toEqual([]);
  });
});
