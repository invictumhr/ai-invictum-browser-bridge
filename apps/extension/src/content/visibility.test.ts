import { describe, expect, it } from "vitest";

import { classifyTextBlock, isRenderedBox, suppressesSubtree } from "./visibility.js";

const style = (overrides: Partial<Record<string, string>> = {}) => ({
  display: "block",
  visibility: "visible",
  opacity: "1",
  overflowX: "visible",
  overflowY: "visible",
  ...overrides,
});

const box = (width: number, height: number) => ({ width, height });

describe("subtree suppression", () => {
  it("keeps walking through a zero-sized layout wrapper", () => {
    // `display: contents` and wrappers whose children are absolutely positioned
    // measure 0x0 while their descendants fill the screen. Pruning here is what
    // silently blanked whole application UIs.
    expect(suppressesSubtree(style({ display: "contents" }), box(0, 0), false, "visible")).toBe(
      false,
    );
  });

  it("keeps walking through a visibility:hidden wrapper so descendants can override it", () => {
    expect(
      suppressesSubtree(style({ visibility: "hidden" }), box(800, 600), false, "visible"),
    ).toBe(false);
  });

  it("skips a display:none subtree", () => {
    expect(suppressesSubtree(style({ display: "none" }), box(0, 0), false, "visible")).toBe(true);
  });

  it("skips a fully transparent subtree because opacity cannot be reset by a child", () => {
    expect(suppressesSubtree(style({ opacity: "0" }), box(800, 600), false, "visible")).toBe(true);
  });

  it("skips a subtree behind the hidden attribute", () => {
    expect(suppressesSubtree(style(), box(800, 600), true, "visible")).toBe(true);
  });

  it("skips a content-visibility:hidden subtree", () => {
    expect(suppressesSubtree(style(), box(800, 600), false, "hidden")).toBe(true);
  });

  it("skips a zero-sized wrapper only when it also clips its children", () => {
    const clipping = style({ overflowX: "hidden", overflowY: "hidden" });
    expect(suppressesSubtree(clipping, box(0, 0), false, "visible")).toBe(true);
    // The same clipping wrapper still renders its children once it has a size.
    expect(suppressesSubtree(clipping, box(320, 240), false, "visible")).toBe(false);
  });

  it("keeps walking through an ordinary visible element", () => {
    expect(suppressesSubtree(style(), box(1280, 800), false, "visible")).toBe(false);
  });
});

describe("rendered box", () => {
  it("reports an ordinary painted element as visible", () => {
    expect(isRenderedBox(style(), box(1280, 800), false)).toBe(true);
  });

  it("does not report a zero-sized wrapper as visible even though the walk continues", () => {
    expect(isRenderedBox(style({ display: "contents" }), box(0, 0), false)).toBe(false);
  });

  it.each([
    ["display:none", style({ display: "none" })],
    ["visibility:hidden", style({ visibility: "hidden" })],
    ["visibility:collapse", style({ visibility: "collapse" })],
    ["opacity:0", style({ opacity: "0" })],
  ])("does not report %s as visible", (_label, value) => {
    expect(isRenderedBox(value, box(800, 600), false)).toBe(false);
  });

  it("does not report an element behind the hidden attribute as visible", () => {
    expect(isRenderedBox(style(), box(800, 600), true)).toBe(false);
  });
});

describe("text block classification", () => {
  it("reads a native heading level from its tag", () => {
    expect(classifyTextBlock("H2", null, null)).toEqual({ kind: "heading", level: 2 });
  });

  it("recognises an ARIA heading, which tag-only detection missed entirely", () => {
    // Applications that mark headings with role="heading" produced no text
    // blocks at all, so get_page_text returned nothing on a page full of text.
    expect(classifyTextBlock("DIV", "heading", "3")).toEqual({ kind: "heading", level: 3 });
  });

  it("keeps an ARIA heading without a usable level", () => {
    expect(classifyTextBlock("DIV", "heading", null)).toEqual({ kind: "heading", level: null });
    expect(classifyTextBlock("DIV", "heading", "0")).toEqual({ kind: "heading", level: null });
  });

  it.each([
    ["P", null, "paragraph"],
    ["DIV", "paragraph", "paragraph"],
    ["LABEL", null, "label"],
    ["NAV", null, "navigation"],
    ["DIV", "navigation", "navigation"],
  ])("classifies %s/%s as %s", (tag, role, kind) => {
    expect(classifyTextBlock(tag, role, null)?.kind).toBe(kind);
  });

  it("ignores elements that carry no text-block semantics", () => {
    expect(classifyTextBlock("DIV", null, null)).toBeUndefined();
    expect(classifyTextBlock("SPAN", "presentation", null)).toBeUndefined();
  });
});
