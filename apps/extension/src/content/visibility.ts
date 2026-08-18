/**
 * Pure visibility rules shared by the snapshot walker and the interaction
 * guards. They take plain style/box values instead of reading the DOM so the
 * decisions can be tested directly.
 */

export interface VisibilityStyle {
  readonly display: string;
  readonly visibility: string;
  readonly opacity: string;
  readonly overflowX: string;
  readonly overflowY: string;
}

export interface VisibilityBox {
  readonly width: number;
  readonly height: number;
}

/** The element itself paints a box the user can see. */
export const isRenderedBox = (
  style: VisibilityStyle,
  box: VisibilityBox,
  hiddenAttribute: boolean,
): boolean => {
  if (hiddenAttribute) return false;
  if (
    style.display === "none" ||
    style.visibility === "hidden" ||
    style.visibility === "collapse"
  ) {
    return false;
  }
  if (Number(style.opacity) === 0) return false;
  return box.width > 0 && box.height > 0;
};

/**
 * True only when the element also stops every descendant from rendering, so the
 * snapshot walk may skip the whole subtree.
 *
 * `visibility: hidden` is deliberately absent because a descendant can restore
 * itself with `visibility: visible`, and inherited computed style already hides
 * the ones that do not. A zero-sized box is absent for the same reason unless it
 * also clips: layout wrappers such as `display: contents`, or wrappers whose
 * children are absolutely positioned, measure 0x0 while their descendants are
 * fully on screen. Pruning on those silently blanks modern application UIs.
 */
export const suppressesSubtree = (
  style: VisibilityStyle,
  box: VisibilityBox,
  hiddenAttribute: boolean,
  contentVisibility: string,
): boolean => {
  if (hiddenAttribute) return true;
  if (style.display === "none") return true;
  if (contentVisibility === "hidden") return true;
  // Opacity applies to the whole subtree and cannot be reset by a descendant.
  if (Number(style.opacity) === 0) return true;
  if (box.width <= 0 && box.height <= 0) {
    return style.overflowX !== "visible" && style.overflowY !== "visible";
  }
  return false;
};

export type TextBlockKind = "heading" | "paragraph" | "label" | "navigation";

export interface TextBlockClassification {
  kind: TextBlockKind;
  level: number | null;
}

/**
 * Which elements count as readable text blocks.
 *
 * Tag names alone miss modern applications, which mark headings with
 * `role="heading"` and `aria-level` rather than `h1`-`h6`. Those pages produced
 * no text blocks at all, so `get_page_text` returned nothing while the page was
 * plainly full of text.
 */
export const classifyTextBlock = (
  tagName: string,
  role: string | null,
  ariaLevel: string | null,
): TextBlockClassification | undefined => {
  const tag = tagName.toLowerCase();
  const explicitRole = role?.trim().toLowerCase() ?? "";
  if (/^h[1-6]$/.test(tag)) return { kind: "heading", level: Number(tag.slice(1)) };
  if (explicitRole === "heading") {
    const level = Number(ariaLevel);
    return { kind: "heading", level: Number.isFinite(level) && level > 0 ? level : null };
  }
  if (tag === "p" || explicitRole === "paragraph") return { kind: "paragraph", level: null };
  if (tag === "label") return { kind: "label", level: null };
  if (tag === "nav" || explicitRole === "navigation") return { kind: "navigation", level: null };
  return undefined;
};
