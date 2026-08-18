import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CloseTabParametersSchema,
  ActivateTabParametersSchema,
  HistoryNavigationParametersSchema,
  NavigateParametersSchema,
  OpenTabParametersSchema,
  WaitForParametersSchema,
  type PageSnapshot,
} from "@invictum/protocol";

import { ChromeNavigationAdapter } from "./navigation.js";
import { TabActivationSettings } from "../tab-activation-settings.js";

const chromeTab = (url: string, title = "Example") => ({
  id: 7,
  windowId: 1,
  index: 0,
  active: true,
  highlighted: true,
  pinned: false,
  incognito: false,
  audible: false,
  discarded: false,
  status: "complete" as const,
  title,
  url,
});

afterEach(() => vi.unstubAllGlobals());

describe("ChromeNavigationAdapter", () => {
  it("opens and returns a sanitized complete HTTP(S) tab", async () => {
    const create = vi.fn().mockResolvedValue({ id: 7 });
    const get = vi.fn().mockResolvedValue(chromeTab("https://example.test/path?token=secret#x"));
    vi.stubGlobal("chrome", {
      storage: {
        local: { get: vi.fn().mockResolvedValue({}) },
        session: {
          get: vi.fn().mockResolvedValue({}),
          set: vi.fn().mockResolvedValue(undefined),
          remove: vi.fn().mockResolvedValue(undefined),
        },
      },
      windows: {
        get: vi.fn().mockRejectedValue(new Error("No such window")),
        create: vi.fn().mockResolvedValue({ id: 3, tabs: [{ id: 7 }] }),
      },
      tabs: { create, get },
    });
    const result = await new ChromeNavigationAdapter().openTab(
      OpenTabParametersSchema.parse({ url: "https://example.test/path" }),
    );
    expect(result).toMatchObject({ created: true, tab: { tabId: 7 } });
    expect(result.tab.url).not.toContain("secret");
    // The agent works in its own window, so no tab is added to the user's.
    expect(create).not.toHaveBeenCalled();
  });

  it("navigates and reports whether the origin changed", async () => {
    const update = vi.fn().mockResolvedValue({});
    const addListener = vi.fn();
    const removeListener = vi.fn();
    const get = vi
      .fn()
      .mockResolvedValueOnce(chromeTab("https://before.test/"))
      .mockResolvedValueOnce(chromeTab("https://after.test/next"))
      .mockResolvedValueOnce(chromeTab("https://after.test/next"));
    vi.stubGlobal("chrome", {
      storage: {
        local: {
          get: vi.fn().mockResolvedValue({ ibpTabActivationModeV1: "foreground" }),
        },
      },
      tabs: { get, update, onUpdated: { addListener, removeListener } },
    });
    const result = await new ChromeNavigationAdapter().navigate(
      NavigateParametersSchema.parse({ tabId: 7, url: "https://after.test/next" }),
    );
    expect(result).toMatchObject({
      navigated: true,
      previousOrigin: "https://before.test",
      originChanged: true,
    });
    expect(update).toHaveBeenCalledWith(7, {
      active: true,
    });
    expect(addListener.mock.invocationCallOrder[0]).toBeLessThan(
      update.mock.invocationCallOrder[1]!,
    );
    expect(update).toHaveBeenNthCalledWith(2, 7, { url: "https://after.test/next" });
    expect(removeListener).toHaveBeenCalledOnce();
  });

  it("uses the tabs URL navigation contract so a new history entry remains available", async () => {
    const update = vi.fn().mockResolvedValue({});
    const get = vi
      .fn()
      .mockResolvedValueOnce(chromeTab("https://example.test/one"))
      .mockResolvedValueOnce(chromeTab("https://example.test/two"))
      .mockResolvedValueOnce(chromeTab("https://example.test/two"));
    vi.stubGlobal("chrome", {
      storage: { local: { get: vi.fn().mockResolvedValue({}) } },
      tabs: {
        get,
        update,
        onUpdated: { addListener: vi.fn(), removeListener: vi.fn() },
      },
    });

    await new ChromeNavigationAdapter().navigate(
      NavigateParametersSchema.parse({
        tabId: 7,
        url: "https://example.test/two",
        active: false,
      }),
    );

    expect(update).toHaveBeenCalledWith(7, { active: false });
    expect(update).toHaveBeenCalledWith(7, { url: "https://example.test/two" });
  });

  it("closes an explicitly targeted tab without touching page DOM or debugger state", async () => {
    const remove = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("chrome", {
      tabs: {
        get: vi.fn().mockResolvedValue(chromeTab("https://example.test/dirty")),
        remove,
      },
    });

    const result = await new ChromeNavigationAdapter().closeTab(
      CloseTabParametersSchema.parse({
        tabId: 7,
        authorization: {
          source: "explicit_user_instruction",
          instructionId: "user-close-test-tab",
        },
      }),
    );

    expect(result).toEqual({ tabId: 7, closed: true });
    expect(remove).toHaveBeenCalledWith(7);
  });

  it("navigates backward without activating the tab", async () => {
    const goBack = vi.fn().mockResolvedValue(undefined);
    const addListener = vi.fn();
    const removeListener = vi.fn();
    const get = vi
      .fn()
      .mockResolvedValueOnce(chromeTab("https://example.test/two"))
      .mockResolvedValueOnce(chromeTab("https://example.test/one"))
      .mockResolvedValueOnce(chromeTab("https://example.test/one"));
    vi.stubGlobal("chrome", {
      tabs: { get, goBack, onUpdated: { addListener, removeListener } },
    });

    const result = await new ChromeNavigationAdapter().navigateHistory(
      "back",
      HistoryNavigationParametersSchema.parse({ tabId: 7 }),
    );

    expect(goBack).toHaveBeenCalledWith(7);
    expect(result).toMatchObject({
      direction: "back",
      previousUrl: "https://example.test/two",
      navigated: true,
    });
    expect(addListener.mock.invocationCallOrder[0]).toBeLessThan(
      goBack.mock.invocationCallOrder[0]!,
    );
    expect(removeListener).toHaveBeenCalledOnce();
  });

  it("falls back to the adjacent CDP history entry when the tabs API rejects", async () => {
    const tabsError = new Error("Cannot find a previous page in history.");
    const goBack = vi.fn().mockRejectedValue(tabsError);
    const addListener = vi.fn();
    const removeListener = vi.fn();
    const get = vi
      .fn()
      .mockResolvedValueOnce(chromeTab("https://example.test/two"))
      .mockResolvedValueOnce(chromeTab("https://example.test/one"))
      .mockResolvedValueOnce(chromeTab("https://example.test/one"));
    const attach = vi.fn().mockResolvedValue(undefined);
    const detach = vi.fn().mockResolvedValue(undefined);
    const sendCommand = vi.fn(
      async (_target: chrome.debugger.Debuggee, method: string): Promise<unknown> => {
        if (method === "Page.getNavigationHistory") {
          return {
            currentIndex: 1,
            entries: [
              { id: 11, url: "https://example.test/one" },
              { id: 12, url: "https://example.test/two" },
            ],
          };
        }
        return undefined;
      },
    );
    vi.stubGlobal("chrome", {
      tabs: { get, goBack, onUpdated: { addListener, removeListener } },
      debugger: {
        attach,
        detach,
        sendCommand,
        onDetach: { addListener: vi.fn() },
      },
    });

    const result = await new ChromeNavigationAdapter().navigateHistory(
      "back",
      HistoryNavigationParametersSchema.parse({ tabId: 7 }),
    );

    expect(result.tab.url).toBe("https://example.test/one");
    expect(attach).toHaveBeenCalledWith({ tabId: 7 }, "1.3");
    expect(sendCommand).toHaveBeenCalledWith({ tabId: 7 }, "Page.getNavigationHistory");
    expect(sendCommand).toHaveBeenCalledWith({ tabId: 7 }, "Page.navigateToHistoryEntry", {
      entryId: 11,
    });
    expect(detach).toHaveBeenCalledWith({ tabId: 7 });
  });

  it("activates only when the dedicated action is invoked", async () => {
    const update = vi.fn().mockResolvedValue({});
    vi.stubGlobal("chrome", {
      tabs: { update, get: vi.fn().mockResolvedValue(chromeTab("https://example.test/")) },
    });

    const result = await new ChromeNavigationAdapter().activateTab(
      ActivateTabParametersSchema.parse({ tabId: 7 }),
    );

    expect(update).toHaveBeenCalledWith(7, { active: true });
    expect(result.activated).toBe(true);
  });

  it("lets an explicit active value override the saved default", async () => {
    const create = vi.fn().mockResolvedValue({ id: 7 });
    vi.stubGlobal("chrome", {
      storage: {
        local: {
          get: vi.fn().mockResolvedValue({ ibpTabActivationModeV1: "foreground" }),
        },
        session: {
          get: vi.fn().mockResolvedValue({ "invictum.agent.window": 3 }),
          set: vi.fn().mockResolvedValue(undefined),
          remove: vi.fn().mockResolvedValue(undefined),
        },
      },
      windows: { get: vi.fn().mockResolvedValue({ id: 3 }), create: vi.fn() },
      tabs: {
        create,
        get: vi.fn().mockResolvedValue(chromeTab("https://example.test/")),
      },
    });

    await new ChromeNavigationAdapter(new TabActivationSettings()).openTab(
      OpenTabParametersSchema.parse({
        url: "https://example.test/",
        active: false,
      }),
    );

    expect(create).toHaveBeenCalledWith({
      url: "https://example.test/",
      active: false,
      windowId: 3,
    });
  });

  it("waits for a selector and returns a fresh document revision", async () => {
    vi.stubGlobal("chrome", {
      tabs: { get: vi.fn().mockResolvedValue(chromeTab("https://example.test/ready")) },
      scripting: {
        executeScript: vi
          .fn()
          .mockResolvedValue([{ result: { matched: true, invalidSelector: false } }]),
      },
    });
    const snapshot = {
      metadata: { documentId: "document-1", domRevision: 9 },
    } as PageSnapshot;
    const result = await new ChromeNavigationAdapter().waitFor(
      WaitForParametersSchema.parse({
        tabId: 7,
        condition: { type: "selector", value: "#ready" },
      }),
      async () => snapshot,
    );
    expect(result).toMatchObject({
      matched: true,
      conditionType: "selector",
      documentId: "document-1",
      domRevision: 9,
    });
  });
});
