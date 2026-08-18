import { describe, expect, it } from "vitest";

import { redactedPreviewValue } from "./index.js";

describe("MCP preview redaction", () => {
  it.each([
    "password",
    "passwd",
    "clientSecret",
    "apiToken",
    "credential",
    "cookie",
    "authorization",
    "otp",
    "oneTimeCode",
    "pin",
    "cardNumber",
    "cvv",
    "username",
  ])("redacts a %s field", (key) => {
    expect(redactedPreviewValue(key, "hunter2")).toBe("[redacted]");
  });

  it("redacts page content that could carry secrets", () => {
    expect(redactedPreviewValue("text", "typed value")).toBe("[redacted]");
    expect(redactedPreviewValue("source", "document.cookie")).toBe("[redacted]");
    expect(redactedPreviewValue("body", "grant_type=password")).toBe("[redacted]");
  });

  it("keeps ordinary fields readable", () => {
    expect(redactedPreviewValue("tabId", 42)).toBe(42);
    expect(redactedPreviewValue("detail", "outline")).toBe("outline");
  });

  it("strips credentials, query strings, and fragments from URLs", () => {
    expect(redactedPreviewValue("url", "https://user:secret@example.com/a?token=abc#frag")).toBe(
      "https://example.com/a?[REDACTED]#[REDACTED]",
    );
  });

  it("reports upload paths only by count, never by name", () => {
    expect(redactedPreviewValue("filePaths", ["C:/secret/tax-return.pdf", "C:/b.png"])).toBe(
      "[2 local file(s)]",
    );
  });

  it("redacts sensitive keys nested inside objects and arrays", () => {
    expect(redactedPreviewValue("payload", { safe: "yes", password: "hunter2" })).toEqual({
      safe: "yes",
      password: "[redacted]",
    });
    expect(redactedPreviewValue("items", [{ token: "abc" }])).toEqual([{ token: "[redacted]" }]);
  });

  it("bounds long strings and deep nesting", () => {
    const long = redactedPreviewValue("detail", "x".repeat(500));
    expect(typeof long === "string" && long.endsWith("...")).toBe(true);
    expect((long as string).length).toBe(200);
    expect(redactedPreviewValue("detail", "deep", 6)).toBe("[bounded]");
  });
});
