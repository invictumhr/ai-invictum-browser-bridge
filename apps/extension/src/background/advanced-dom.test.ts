import { describe, expect, it } from "vitest";

import { evaluatedObjectId, listenerSourceExcerpt, resolvedNodeObjectId } from "./advanced-dom.js";

describe("ChromeAdvancedDomAdapter CDP response parsing", () => {
  it("reads DOM.resolveNode object.objectId", () => {
    expect(
      resolvedNodeObjectId({
        object: { type: "object", subtype: "node", objectId: "node-runtime-object" },
      }),
    ).toBe("node-runtime-object");
    expect(resolvedNodeObjectId({ result: { objectId: "wrong-envelope" } })).toBeUndefined();
  });

  it("reads Runtime.evaluate result.objectId", () => {
    expect(evaluatedObjectId({ result: { type: "object", objectId: "evaluated-object" } })).toBe(
      "evaluated-object",
    );
    expect(evaluatedObjectId({ object: { objectId: "wrong-envelope" } })).toBeUndefined();
  });

  it("maps an inline-script resource line to the script source", () => {
    const result = listenerSourceExcerpt(
      [
        "const before = true;",
        "function handleFixtureDropdownClick(event) {",
        "  openGeneratedDropdown(event);",
        "}",
        "document.addEventListener('click', handleFixtureDropdownClick);",
      ].join("\n"),
      315,
      2_000,
      314,
      "handleFixtureDropdownClick",
    );

    expect(result.excerpt).toContain("315: const before = true;");
    expect(result.excerpt).toContain("316: function handleFixtureDropdownClick(event)");
    expect(result.truncated).toBe(false);
  });

  it("falls back to a bounded named-handler excerpt when a framework reports an unusable line", () => {
    const source = [
      "const unrelated = true;",
      "function frameworkHandler(event) {",
      "  return event.type;",
      "}",
      "const after = true;",
    ].join("\n");

    const result = listenerSourceExcerpt(source, 9_999, 80, 0, "frameworkHandler");

    expect(result.excerpt).toContain("function frameworkHandler");
    expect(result.excerpt.length).toBeLessThanOrEqual(80);
    expect(result.truncated).toBe(true);
  });
});
