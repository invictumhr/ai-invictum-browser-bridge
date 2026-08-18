import { describe, expect, it, vi } from "vitest";

import { EnhancedActionRunner, type EnhancedActionTransport } from "./enhanced-actions.js";

const snapshot = (
  domRevision: number,
  name: string,
  detail: "outline" | "interactive" = "outline",
): Record<string, unknown> => ({
  metadata: {
    documentId: "document-1",
    domRevision,
    detail,
  },
  elements: [
    {
      elementId: `button-${domRevision}`,
      frameId: "top",
      tag: "button",
      role: "button",
      name,
      clickable: true,
      enabled: true,
      selectors: { css: "#save" },
    },
  ],
});

describe("EnhancedActionRunner", () => {
  it("waits for verification before taking the final snapshot", async () => {
    const actions: string[] = [];
    const transport: EnhancedActionTransport = {
      call: vi.fn(async (action: string) => {
        actions.push(action);
        if (action === "browser.wait_for") return { matched: true };
        if (action === "browser.get_page_snapshot") return snapshot(2, "Saved");
        return { clicked: true };
      }),
    };
    const runner = new EnhancedActionRunner(transport);

    const result = await runner.run("browser.click", {
      tabId: 7,
      documentId: "document-1",
      domRevision: 1,
      elementId: "button-1",
      verify: { condition: { type: "text", value: "Saved" } },
      postSnapshot: "outline",
    });

    expect(actions).toEqual(["browser.click", "browser.wait_for", "browser.get_page_snapshot"]);
    expect(result).toMatchObject({
      clicked: true,
      verification: { matched: true },
      postSnapshot: { metadata: { domRevision: 2 } },
    });
  });

  it("captures a baseline automatically when domDelta has no cached state", async () => {
    let snapshots = 0;
    const transport: EnhancedActionTransport = {
      call: vi.fn(async (action: string) => {
        if (action === "browser.get_page_snapshot") {
          snapshots += 1;
          return snapshots === 1 ? snapshot(1, "Save") : snapshot(2, "Saved");
        }
        return { clicked: true };
      }),
    };
    const runner = new EnhancedActionRunner(transport);

    const result = await runner.run("browser.click", {
      tabId: 7,
      documentId: "document-1",
      domRevision: 1,
      elementId: "button-1",
      domDelta: true,
    });

    expect(result).toMatchObject({
      domDelta: {
        available: true,
        previousDomRevision: 1,
        domRevision: 2,
        changedCount: 1,
      },
    });
  });

  it("returns an explicit unavailable reason when baseline capture fails", async () => {
    let snapshots = 0;
    const transport: EnhancedActionTransport = {
      call: vi.fn(async (action: string) => {
        if (action === "browser.get_page_snapshot") {
          snapshots += 1;
          if (snapshots === 1) throw new Error("snapshot unavailable");
          return snapshot(2, "Saved");
        }
        return { clicked: true };
      }),
    };
    const runner = new EnhancedActionRunner(transport);

    const result = await runner.run("browser.click", {
      tabId: 7,
      documentId: "document-1",
      domRevision: 1,
      elementId: "button-1",
      domDelta: true,
    });

    expect(result).toMatchObject({
      clicked: true,
      domDelta: { available: false, reason: "no_baseline" },
    });
  });

  it("bounds cache growth and clears tab state on unlock", async () => {
    const transport: EnhancedActionTransport = {
      call: vi.fn(async () => ({ unlocked: true })),
    };
    const runner = new EnhancedActionRunner(transport, {
      maxCachedTabs: 2,
      maxElementReferencesPerTab: 10,
    });
    for (let tabId = 1; tabId <= 3; tabId += 1) {
      runner.observe("browser.get_page_snapshot", { tabId }, snapshot(tabId, `Tab ${tabId}`));
    }
    expect(runner.stateStats()).toMatchObject({
      cachedTabs: 2,
      cachedSnapshots: 2,
    });

    await runner.run("browser.unlock_tab", { tabId: 3 });
    expect(runner.stateStats()).toMatchObject({
      cachedTabs: 1,
      cachedSnapshots: 1,
    });
  });

  it("returns optional phase timings without changing the default result", async () => {
    const transport: EnhancedActionTransport = {
      call: vi.fn(async () => ({ activated: true })),
    };
    const runner = new EnhancedActionRunner(transport);

    await expect(
      runner.run("browser.activate_tab", { tabId: 7, timings: true }),
    ).resolves.toMatchObject({
      activated: true,
      timings: {
        actionMs: expect.any(Number),
        totalMs: expect.any(Number),
      },
    });
  });

  it("relocates a nameless generic element without sending invalid empty criteria", async () => {
    let gestureCalls = 0;
    const transport: EnhancedActionTransport = {
      call: vi.fn(async (action: string, parameters: Readonly<Record<string, unknown>>) => {
        if (action === "browser.perform_gesture") {
          gestureCalls += 1;
          if (gestureCalls === 1) {
            throw Object.assign(new Error("stale"), {
              code: "STALE_ELEMENT_REFERENCE",
              retryable: true,
            });
          }
          return { performed: true, resolvedElementId: parameters["elementId"] };
        }
        if (action === "browser.get_page_snapshot") {
          return {
            metadata: { documentId: "document-1", domRevision: 2, detail: "interactive" },
            elements: [
              {
                elementId: "generic-2",
                frameId: "top",
                tag: "div",
                role: "generic",
                name: "",
                selectors: { css: "#terminal-shell" },
              },
            ],
          };
        }
        if (action === "browser.find_elements") {
          expect(parameters).not.toHaveProperty("name");
          expect(parameters).not.toHaveProperty("role");
          expect(parameters).toMatchObject({
            tag: "div",
            frameId: "top",
            css: "#terminal-shell",
            matchMode: "exact",
          });
          return {
            documentId: "document-1",
            domRevision: 2,
            matches: [
              {
                element: {
                  elementId: "generic-2",
                  frameId: "top",
                  tag: "div",
                  role: "generic",
                  name: "",
                  selectors: { css: "#terminal-shell" },
                },
              },
            ],
            count: 1,
          };
        }
        throw new Error(`Unexpected action ${action}`);
      }),
    };
    const runner = new EnhancedActionRunner(transport);
    runner.observe(
      "browser.get_page_snapshot",
      { tabId: 7 },
      {
        metadata: { documentId: "document-1", domRevision: 1, detail: "interactive" },
        elements: [
          {
            elementId: "generic-1",
            frameId: "top",
            tag: "div",
            role: "generic",
            name: "",
            selectors: { css: "#terminal-shell" },
          },
        ],
      },
    );

    await expect(
      runner.run("browser.perform_gesture", {
        tabId: 7,
        documentId: "document-1",
        domRevision: 1,
        elementId: "generic-1",
        operation: "scroll_into_view",
      }),
    ).resolves.toMatchObject({
      performed: true,
      automaticallyRelocated: true,
      resolvedElementId: "generic-2",
    });
  });
});
