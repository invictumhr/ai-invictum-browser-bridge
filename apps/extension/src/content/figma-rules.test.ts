import { describe, expect, it } from "vitest";

import {
  cleanFigmaText,
  figmaAnchorHealthFrom,
  figmaControlValue,
  figmaFileNameFrom,
  figmaLayerDepthFrom,
  figmaLayerIdFrom,
  figmaModeFrom,
  figmaSelectionTypeFrom,
  isCredentialLabel,
  isCurrentMarker,
  isFigmaDesignUrl,
} from "./figma-rules.js";

describe("figma file detection", () => {
  it.each([
    ["https design file", "www.figma.com", "/design/abc/Smokva", true],
    ["legacy file url", "www.figma.com", "/file/abc/Smokva", true],
    ["the plugin sandbox frame", "www.figma.com", "/plugin-sandbox", false],
    ["the file browser", "www.figma.com", "/files/recent", false],
    ["a lookalike host", "figma.com.evil.test", "/design/abc", false],
  ])("recognises %s", (_label, hostname, pathname, expected) => {
    expect(isFigmaDesignUrl(hostname, pathname)).toBe(expected);
  });
});

describe("file name", () => {
  it("prefers the labelled file-name control", () => {
    expect(figmaFileNameFrom("Smokva, file name", "Smokva – Figma")).toBe("Smokva");
  });

  it("falls back to the document title without the Figma suffix", () => {
    expect(figmaFileNameFrom(null, "Smokva – Figma")).toBe("Smokva");
  });

  it("ignores a label that is not the file-name control", () => {
    expect(figmaFileNameFrom("Main menu", "Smokva – Figma")).toBe("Smokva");
  });
});

describe("current page marker", () => {
  it("accepts the aria-current value Figma actually ships", () => {
    // Figma marks the open page with aria-current="page"; comparing against
    // "true" reported that no page was open at all.
    expect(isCurrentMarker("page", null)).toBe(true);
  });

  it("still accepts the generic markers", () => {
    expect(isCurrentMarker("true", null)).toBe(true);
    expect(isCurrentMarker(null, "true")).toBe(true);
  });

  it("does not treat an unmarked row as current", () => {
    expect(isCurrentMarker(null, null)).toBe(false);
    expect(isCurrentMarker("false", "false")).toBe(false);
  });
});

describe("mode detection", () => {
  it("reports dev mode from the toolbar", () => {
    expect(
      figmaModeFrom(
        [
          { name: "Design", active: false },
          { name: "Dev Mode", active: true },
        ],
        null,
      ),
    ).toBe("dev");
  });

  it("falls back to the selected inspector tab when no toolbar label is active", () => {
    expect(figmaModeFrom([{ name: "Design", active: false }], "Prototype Prototype")).toBe(
      "prototype",
    );
  });

  it("recognises Dev Mode from the Inspect tab, seat or no seat", () => {
    // Dev Mode swaps Design/Prototype for Inspect/Plugins even when the account
    // has no Dev seat and the panel itself is locked behind an upgrade prompt.
    expect(figmaModeFrom([], "Inspect")).toBe("dev");
    expect(figmaModeFrom([], "Plugins")).toBe("dev");
  });

  it("reports unknown rather than guessing", () => {
    expect(figmaModeFrom([], null)).toBe("unknown");
  });
});

describe("layer rows", () => {
  it("reads Figma zero-based aria-level as the depth directly", () => {
    // Figma reports a top-level layer as level 0, not the ARIA-specified level 1.
    expect(figmaLayerDepthFrom("0", "64px")).toBe(0);
    expect(figmaLayerDepthFrom("3", "64px")).toBe(3);
  });

  it("derives depth from indentation when aria-level is absent", () => {
    expect(figmaLayerDepthFrom(null, "48px")).toBe(3);
  });

  it("treats a missing indent as the root depth", () => {
    expect(figmaLayerDepthFrom(null, null)).toBe(0);
  });

  it("keeps a stable id when Figma provides one", () => {
    expect(figmaLayerIdFrom("layer-42", null, 7)).toBe("layer-42");
  });

  it("falls back to the rendered position when no id exists", () => {
    expect(figmaLayerIdFrom(null, null, 7)).toBe("row-7");
  });
});

describe("inspector values", () => {
  it("reads an ordinary inspector value", () => {
    expect(figmaControlValue("X-position", "text", "15")).toBe("15");
  });

  it("never reads a password control", () => {
    expect(figmaControlValue("Anything", "password", "hunter2")).toBe("");
  });

  it.each(["Password", "API token", "Card number", "CVV", "SSN", "client secret"])(
    "never reads a %s control",
    (label) => {
      expect(isCredentialLabel(label)).toBe(true);
      expect(figmaControlValue(label, "text", "value")).toBe("");
    },
  );

  it("does not mistake ordinary Figma labels for credentials", () => {
    for (const label of ["X-position", "Line height", "Letter spacing", "Font size"]) {
      expect(isCredentialLabel(label)).toBe(false);
    }
  });
});

describe("selection type", () => {
  it("skips inspector section headings and returns the node type", () => {
    expect(figmaSelectionTypeFrom(["Pages", "Layers", "Text", "Position"])).toBe("Text");
  });

  it("returns nothing when only structural headings are present", () => {
    expect(figmaSelectionTypeFrom(["Pages", "Layers"])).toBeUndefined();
  });
});

describe("anchor health", () => {
  it("is only ok when every anchor resolved", () => {
    expect(
      figmaAnchorHealthFrom([
        { name: "pages_list", found: true },
        { name: "layer_rows", found: true },
      ]),
    ).toEqual({ ok: true, resolved: ["pages_list", "layer_rows"], missing: [] });
  });

  it("names the anchors Figma stopped shipping", () => {
    expect(
      figmaAnchorHealthFrom([
        { name: "pages_list", found: true },
        { name: "layer_rows", found: false },
      ]),
    ).toEqual({ ok: false, resolved: ["pages_list"], missing: ["layer_rows"] });
  });
});

describe("text normalisation", () => {
  it("collapses whitespace and trims", () => {
    expect(cleanFigmaText("  Frame   67821 \n")).toBe("Frame 67821");
  });

  it("tolerates missing text", () => {
    expect(cleanFigmaText(null)).toBe("");
  });

  it("bounds very long text", () => {
    expect(cleanFigmaText("x".repeat(1_000))).toHaveLength(512);
  });
});
