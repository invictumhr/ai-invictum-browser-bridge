import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_TAB_ACTIVATION_MODE,
  TAB_ACTIVATION_STORAGE_KEY,
  TabActivationSettings,
} from "./tab-activation-settings.js";

afterEach(() => vi.unstubAllGlobals());

describe("TabActivationSettings", () => {
  it("defaults to background work and persists an explicit foreground preference", async () => {
    const get = vi
      .fn()
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ [TAB_ACTIVATION_STORAGE_KEY]: "foreground" });
    const set = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("chrome", { storage: { local: { get, set } } });
    const settings = new TabActivationSettings();

    await expect(settings.getMode()).resolves.toBe(DEFAULT_TAB_ACTIVATION_MODE);
    await settings.setMode("foreground");
    expect(set).toHaveBeenCalledWith({ [TAB_ACTIVATION_STORAGE_KEY]: "foreground" });
    await expect(settings.getMode()).resolves.toBe("foreground");
  });

  it("lets an explicit command override the stored user default", async () => {
    const get = vi.fn().mockResolvedValue({ [TAB_ACTIVATION_STORAGE_KEY]: "foreground" });
    vi.stubGlobal("chrome", { storage: { local: { get, set: vi.fn() } } });
    const settings = new TabActivationSettings();

    await expect(settings.resolve(undefined)).resolves.toBe(true);
    await expect(settings.resolve(false)).resolves.toBe(false);
    expect(get).toHaveBeenCalledOnce();
  });
});
