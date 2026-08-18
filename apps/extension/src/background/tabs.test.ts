import { afterEach, describe, expect, it, vi } from "vitest";

import { IBP_ERROR_CODES } from "@invictum/protocol";

import { ChromeTabsAdapter } from "./tabs.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ChromeTabsAdapter", () => {
  it("requires explicit optional tabs permission", async () => {
    vi.stubGlobal("chrome", {
      permissions: { contains: vi.fn().mockResolvedValue(false) },
      tabs: { query: vi.fn() },
    });

    await expect(new ChromeTabsAdapter().listTabs()).rejects.toMatchObject({
      code: IBP_ERROR_CODES.PERMISSION_DENIED,
    });
  });

  it("detects persistent all-site access without a per-domain prompt", async () => {
    const contains = vi.fn().mockResolvedValue(true);
    vi.stubGlobal("chrome", {
      permissions: { contains },
    });

    await expect(new ChromeTabsAdapter().hasGlobalPageAccess()).resolves.toBe(true);
    expect(contains).toHaveBeenCalledWith({
      permissions: ["tabs", "scripting"],
      origins: ["http://*/*", "https://*/*"],
    });
  });

  it("maps tabs and redacts sensitive URL parameters", async () => {
    vi.stubGlobal("chrome", {
      permissions: { contains: vi.fn().mockResolvedValue(true) },
      tabs: {
        query: vi.fn().mockResolvedValue([
          {
            id: 9,
            windowId: 2,
            index: 1,
            active: true,
            highlighted: true,
            pinned: false,
            incognito: false,
            audible: false,
            discarded: false,
            status: "complete",
            title: "Admin",
            url: "https://user:pass@example.test/admin?access_token=secret&page=2#section",
          },
          {
            id: 10,
            windowId: 2,
            index: 2,
            active: false,
            highlighted: false,
            pinned: false,
            incognito: false,
            status: "complete",
            title: "Local file",
            url: "file:///C:/Users/info/private.txt",
          },
        ]),
      },
    });

    const result = await new ChromeTabsAdapter().listTabs();

    expect(result.tabs[0]).toMatchObject({
      tabId: 9,
      origin: "https://example.test",
      restricted: false,
    });
    expect(result.tabs[0]?.url).toContain("access_token=%5BREDACTED%5D");
    expect(result.tabs[0]?.url).toContain("page=%5BREDACTED%5D");
    expect(result.tabs[0]?.url).toContain("#[REDACTED]");
    expect(result.tabs[0]?.url).not.toContain("user:pass");
    expect(result.tabs[0]?.url).not.toContain("secret");
    expect(result.tabs[0]?.url).not.toContain("page=2");
    expect(result.tabs[1]).toMatchObject({
      url: "file:///[LOCAL_FILE]",
      restricted: true,
    });
  });
});
