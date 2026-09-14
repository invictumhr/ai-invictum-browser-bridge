import { afterEach, describe, expect, it, vi } from "vitest";

import { DomainPolicySettings } from "./domain-policy-settings.js";

afterEach(() => vi.unstubAllGlobals());

const chromeMock = (url = "https://example.test/admin", incognito = false) => {
  let stored: Record<string, unknown> = {};
  return {
    storage: {
      local: {
        get: vi.fn(async (key: string) => ({ [key]: stored[key] })),
        set: vi.fn(async (value: Record<string, unknown>) => {
          stored = { ...stored, ...value };
        }),
      },
    },
    tabs: { get: vi.fn(async () => ({ url, incognito })) },
  };
};

describe("per-domain browser boundaries", () => {
  it("allows ordinary Bridge policy by default and persists an observe-only boundary", async () => {
    vi.stubGlobal("chrome", chromeMock());
    const settings = new DomainPolicySettings();
    await expect(settings.authorize("browser.click", { tabId: 1 })).resolves.toBeUndefined();
    await settings.set("example.test", "observe_only");
    await expect(
      settings.authorize("browser.get_page_snapshot", { tabId: 1 }),
    ).resolves.toBeUndefined();
    await expect(settings.authorize("browser.click", { tabId: 1 })).rejects.toMatchObject({
      code: "POLICY_DENIED",
    });
  });

  it("checks both the current and destination domain for navigation", async () => {
    vi.stubGlobal("chrome", chromeMock("https://allowed.test/"));
    const settings = new DomainPolicySettings();
    await settings.set("blocked.test", "block");
    await expect(
      settings.authorize("browser.navigate", { tabId: 1, url: "https://blocked.test/path" }),
    ).rejects.toMatchObject({ code: "POLICY_DENIED" });
  });

  it("never controls incognito tabs", async () => {
    vi.stubGlobal("chrome", chromeMock("https://example.test/", true));
    await expect(
      new DomainPolicySettings().authorize("browser.get_page_snapshot", { tabId: 1 }),
    ).rejects.toMatchObject({ code: "POLICY_DENIED" });
    await expect(
      new DomainPolicySettings().authorize("browser.set_control_identity", { tabId: 1 }),
    ).rejects.toMatchObject({ code: "POLICY_DENIED" });
  });
});
