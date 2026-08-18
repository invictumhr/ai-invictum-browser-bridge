import { afterEach, describe, expect, it, vi } from "vitest";

import { AgentWindow } from "./agent-window.js";

afterEach(() => vi.unstubAllGlobals());

const stubChrome = (options: {
  stored?: Record<string, unknown>;
  windowExists?: boolean;
  createWindow?: unknown;
}) => {
  const get = vi.fn().mockResolvedValue(options.stored ?? {});
  const set = vi.fn().mockResolvedValue(undefined);
  const remove = vi.fn().mockResolvedValue(undefined);
  const windowsGet = vi
    .fn()
    .mockImplementation(async (id: number) =>
      options.windowExists === true ? { id } : Promise.reject(new Error("No such window")),
    );
  const windowsCreate = vi.fn().mockResolvedValue(options.createWindow);
  const tabsCreate = vi
    .fn()
    .mockImplementation(async (info: Record<string, unknown>) => ({ id: 99, ...info }));
  vi.stubGlobal("chrome", {
    storage: { session: { get, set, remove } },
    windows: { get: windowsGet, create: windowsCreate },
    tabs: { create: tabsCreate },
  });
  return { set, remove, windowsCreate, tabsCreate };
};

describe("AgentWindow", () => {
  it("creates its own unfocused window on first use", async () => {
    const mocks = stubChrome({
      createWindow: { id: 7, tabs: [{ id: 42, windowId: 7 }] },
    });

    const tab = await new AgentWindow().openTab("https://example.com", false);

    // The window must not be focused, otherwise it jumps over the user's work.
    expect(mocks.windowsCreate).toHaveBeenCalledWith({
      url: "https://example.com",
      focused: false,
    });
    expect(mocks.set).toHaveBeenCalledWith({ "invictum.agent.window": 7 });
    expect(tab.id).toBe(42);
  });

  it("reuses the remembered window instead of the user's focused one", async () => {
    const mocks = stubChrome({
      stored: { "invictum.agent.window": 7 },
      windowExists: true,
    });

    await new AgentWindow().openTab("https://example.com", false);

    expect(mocks.windowsCreate).not.toHaveBeenCalled();
    // Naming the window is the whole point: without it Chrome uses whichever
    // window was focused last, which is the user's.
    expect(mocks.tabsCreate).toHaveBeenCalledWith({
      url: "https://example.com",
      active: false,
      windowId: 7,
    });
  });

  it("forgets a window the user has closed and opens a fresh one", async () => {
    const mocks = stubChrome({
      stored: { "invictum.agent.window": 7 },
      windowExists: false,
      createWindow: { id: 8, tabs: [{ id: 43, windowId: 8 }] },
    });

    await new AgentWindow().openTab("https://example.com", false);

    expect(mocks.remove).toHaveBeenCalledWith("invictum.agent.window");
    expect(mocks.set).toHaveBeenCalledWith({ "invictum.agent.window": 8 });
  });

  it("falls back to an ordinary tab when Chrome refuses a new window", async () => {
    const mocks = stubChrome({ createWindow: undefined });

    const tab = await new AgentWindow().openTab("https://example.com", true);

    expect(mocks.tabsCreate).toHaveBeenCalledWith({ url: "https://example.com", active: true });
    expect(tab.id).toBe(99);
  });

  it("reports no window before one has been created", async () => {
    stubChrome({});
    await expect(new AgentWindow().current()).resolves.toBeUndefined();
  });
});
