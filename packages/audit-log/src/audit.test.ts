import { describe, expect, it } from "vitest";

import { InMemoryAuditLog, sanitizeAuditValue } from "./index.js";

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
});
