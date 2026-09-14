import { describe, expect, it } from "vitest";

import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { InMemoryAuditLog, JsonlAuditLog, sanitizeAuditValue } from "./index.js";

describe("audit sanitization", () => {
  it("redacts sensitive values recursively", () => {
    expect(
      sanitizeAuditValue({
        password: "do-not-log",
        nested: { authorization: "Bearer secret", api_key: "abc" },
        username: "private-user",
        promptText: "private-prompt",
      }),
    ).toEqual({
      password: "[REDACTED]",
      nested: { authorization: "[REDACTED]", api_key: "[REDACTED]" },
      username: "[REDACTED]",
      promptText: "[REDACTED]",
    });
  });

  it("stores sanitized parameters without retaining the raw input field", () => {
    const audit = new InMemoryAuditLog();
    const entry = audit.record({
      sessionId: "session-1",
      agentId: "agent-1",
      clientId: "client-1",
      domain: "browser://tabs",
      url: "browser://tabs",
      tool: "browser.list_tabs",
      parameters: { accessToken: "secret" },
      policyDecision: "allow",
      riskLevel: "R0",
      result: "success",
      durationMs: 3,
    });

    expect(entry.sanitizedParameters).toEqual({ accessToken: "[REDACTED]" });
    expect(entry).not.toHaveProperty("parameters");
    expect(audit.list()).toHaveLength(1);
  });

  it("persists only sanitized JSONL entries", () => {
    const path = join(mkdtempSync(join(tmpdir(), "ibb-audit-")), "audit.jsonl");
    const audit = new JsonlAuditLog(path);
    audit.record({
      sessionId: "session-1",
      agentId: "agent-1",
      clientId: "client-1",
      domain: "example.test",
      url: "https://example.test/",
      tool: "browser.submit_form",
      parameters: { password: "never-write-this", value: "safe" },
      policyDecision: "allow",
      riskLevel: "R2",
      result: "success",
      durationMs: 4,
    });
    const stored = readFileSync(path, "utf8");
    expect(stored).toContain('"password":"[REDACTED]"');
    expect(stored).not.toContain("never-write-this");
  });
});
