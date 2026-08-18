import { afterEach, describe, expect, it, vi } from "vitest";

import { executeSameOriginPageApiRequest } from "./page-api.js";

afterEach(() => {
  vi.unstubAllGlobals();
  delete (globalThis as typeof globalThis & { wpApiSettings?: unknown }).wpApiSettings;
});

const input = {
  url: "/wp-json/example/v1/item?token=must-not-return",
  method: "GET" as const,
  headers: {},
  responseMode: "json" as const,
  maxResponseChars: 10_000,
  useWordPressNonce: false,
};

describe("same-origin page API execution", () => {
  it("rejects cross-origin URLs before fetch", async () => {
    vi.stubGlobal("location", {
      href: "https://example.test/admin",
      origin: "https://example.test",
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      executeSameOriginPageApiRequest({ ...input, url: "https://evil.test/data" }),
    ).rejects.toThrow("same-origin");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps credentials in the browser, redacts secret-shaped JSON, and sanitizes the URL", async () => {
    vi.stubGlobal("location", {
      href: "https://example.test/admin",
      origin: "https://example.test",
    });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          title: "Public",
          token: "secret-token",
          nested: { password: "secret-password", value: "safe" },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await executeSameOriginPageApiRequest(input);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.test/wp-json/example/v1/item?token=must-not-return",
      expect.objectContaining({ credentials: "same-origin", redirect: "manual" }),
    );
    expect(result.url).toBe("https://example.test/wp-json/example/v1/item?[redacted]");
    expect(result.body).toEqual({
      title: "Public",
      token: "[REDACTED]",
      nested: { password: "[REDACTED]", value: "safe" },
    });
    expect(JSON.stringify(result)).not.toContain("secret-token");
    expect(JSON.stringify(result)).not.toContain("must-not-return");
  });

  it("uses a WordPress nonce without returning it", async () => {
    vi.stubGlobal("location", {
      href: "https://example.test/wp-admin/",
      origin: "https://example.test",
    });
    (globalThis as typeof globalThis & { wpApiSettings?: unknown }).wpApiSettings = {
      nonce: "private-wp-nonce",
    };
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204, headers: {} }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await executeSameOriginPageApiRequest({
      ...input,
      url: "/wp-json/wp/v2/posts/1",
      responseMode: "status_only",
      useWordPressNonce: true,
    });

    const options = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(new Headers(options.headers).get("X-WP-Nonce")).toBe("private-wp-nonce");
    expect(result.wordpressNonceUsed).toBe(true);
    expect(JSON.stringify(result)).not.toContain("private-wp-nonce");
  });
});
