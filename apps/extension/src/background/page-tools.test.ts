import { describe, expect, it, vi } from "vitest";

import type { PageSnapshot } from "@invictum/protocol";

import { ChromePageToolsAdapter } from "./page-tools.js";

const snapshot = (): PageSnapshot =>
  ({
    page: {
      url: "https://example.test/settings",
      title: "Settings",
      origin: "https://example.test",
      viewport: { width: 1280, height: 720, deviceScaleFactor: 1 },
      scroll: { x: 0, y: 0, maxX: 0, maxY: 1000 },
      loadingState: "complete",
    },
    frames: [],
    elements: [
      {
        elementId: "save",
        frameId: "top",
        tag: "button",
        role: "button",
        name: "Update settings",
        text: "Save changes",
        clickable: true,
        boundingBox: { x: 10, y: 20, width: 100, height: 30 },
        selectors: { css: "#save-settings" },
      },
      {
        elementId: "search",
        frameId: "top",
        tag: "input",
        role: "textbox",
        name: "Search",
        editable: true,
        boundingBox: { x: 10, y: 60, width: 200, height: 30 },
        selectors: { css: "#search" },
      },
    ],
    forms: [],
    dialogs: [],
    alerts: [],
    textBlocks: [
      {
        elementId: "heading",
        frameId: "top",
        kind: "heading",
        text: "Account settings",
        level: 1,
        boundingBox: { x: 0, y: 0, width: 300, height: 40 },
      },
      {
        elementId: "paragraph",
        frameId: "top",
        kind: "paragraph",
        text: "Change your public profile.",
        level: null,
        boundingBox: { x: 0, y: 50, width: 400, height: 30 },
      },
    ],
    metadata: {
      generatedAt: "2026-07-24T10:00:00.000Z",
      documentId: "doc-1",
      domRevision: 7,
      elementCount: 2,
      textLength: 42,
      truncated: false,
      truncationReasons: [],
      hiddenSubtreesSkipped: 0,
      detail: "interactive",
    },
  }) as PageSnapshot;

describe("ChromePageToolsAdapter", () => {
  it("returns clean bounded text without control values", async () => {
    const readSnapshot = vi.fn().mockResolvedValue(snapshot());
    const adapter = new ChromePageToolsAdapter(readSnapshot);

    const result = await adapter.getPageText({ tabId: 8, maxChars: 1_000, format: "text" });

    expect(result.text).toBe("Account settings\n\nChange your public profile.");
    expect(result.characterCount).toBe(result.text.length);
    expect(result.blockCount).toBe(2);
    expect(readSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ tabId: 8, detail: "semantic", maxTextLength: 1_000 }),
    );
  });

  it("renders semantic headings as bounded Markdown", async () => {
    const adapter = new ChromePageToolsAdapter(vi.fn().mockResolvedValue(snapshot()));

    const result = await adapter.getPageText({
      tabId: 8,
      maxChars: 1_000,
      format: "markdown",
    });

    expect(result.format).toBe("markdown");
    expect(result.text).toBe("# Account settings\n\nChange your public profile.");
  });

  it("ranks a natural-language control query deterministically", async () => {
    const adapter = new ChromePageToolsAdapter(vi.fn().mockResolvedValue(snapshot()));

    const result = await adapter.findNaturalLanguage({
      tabId: 8,
      query: "update button",
      maxResults: 10,
      includeHidden: false,
    });

    expect(result.matches[0]?.element.elementId).toBe("save");
    expect(result.matches[0]?.reasons).toContain("name");
    expect(result.documentId).toBe("doc-1");
    expect(result.domRevision).toBe(7);
  });
});
