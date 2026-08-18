import type { FigmaAnchorHealth, FigmaMode } from "@invictum/protocol";

/**
 * Decision rules for the Figma adapter, kept free of DOM lookups so they can be
 * tested directly. `figma.ts` supplies the values it reads from the page.
 */

export const MAX_FIGMA_TEXT = 512;

export const cleanFigmaText = (value: string | null | undefined): string =>
  (value ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_FIGMA_TEXT);

/** A Figma design file, as opposed to FigJam, Slides, or the file browser. */
export const isFigmaDesignUrl = (hostname: string, pathname: string): boolean =>
  hostname.endsWith("figma.com") && /\/(design|file)\//.test(pathname);

export const figmaFileNameFrom = (fileNameLabel: string | null, documentTitle: string): string => {
  if (fileNameLabel !== null && /, file name$/i.test(fileNameLabel)) {
    return cleanFigmaText(fileNameLabel.replace(/, file name$/i, ""));
  }
  return cleanFigmaText(documentTitle.replace(/\s*[-–]\s*Figma\s*$/i, ""));
};

/**
 * Figma marks the open page with `aria-current="page"`, not `"true"`, so a plain
 * equality check against `"true"` silently reports that no page is open.
 */
export const isCurrentMarker = (ariaCurrent: string | null, ariaSelected: string | null): boolean =>
  ariaCurrent === "page" || ariaCurrent === "true" || ariaSelected === "true";

export interface ModeLabelState {
  name: string;
  active: boolean;
}

/**
 * The bottom toolbar owns the real mode. When no toolbar label reports itself
 * active, the Design/Prototype tab pair is the fallback because it only renders
 * while design mode is open.
 */
export const figmaModeFrom = (
  labels: readonly ModeLabelState[],
  selectedTabName: string | null,
): FigmaMode => {
  for (const label of labels) {
    if (!label.active) continue;
    const name = label.name.toLowerCase();
    if (name === "dev mode") return "dev";
    if (name === "design") return "design";
  }
  if (selectedTabName !== null) {
    const name = selectedTabName.toLowerCase();
    // Dev Mode replaces the Design/Prototype pair with Inspect/Plugins, and it
    // does so even on an account without a Dev seat, where the panel content is
    // locked behind an upgrade prompt.
    if (name.includes("inspect") || name.includes("plugins")) return "dev";
    if (name.includes("prototype")) return "prototype";
    if (name.includes("design")) return "design";
  }
  return "unknown";
};

/**
 * Figma's layer rows carry `aria-level`, but zero-based: a top-level layer is
 * level 0, not the level 1 that ARIA specifies. Treating it as one-based pushed
 * every row up a level, so the value is used as the depth directly. Indentation
 * is the fallback for builds that omit the attribute.
 */
export const figmaLayerDepthFrom = (
  ariaLevel: string | null,
  paddingLeft: string | null,
): number => {
  if (ariaLevel !== null && ariaLevel.trim().length > 0) {
    const level = Number(ariaLevel);
    if (Number.isFinite(level) && level >= 0) return Math.min(64, Math.round(level));
  }
  const padding = Number.parseFloat(paddingLeft ?? "0");
  return Number.isFinite(padding) ? Math.min(64, Math.max(0, Math.round(padding / 16))) : 0;
};

export const figmaLayerIdFrom = (
  id: string | null,
  dataId: string | null,
  index: number,
): string => {
  const explicit = id ?? dataId;
  return explicit !== null && explicit.length > 0 ? explicit.slice(0, 128) : `row-${index}`;
};

const CREDENTIAL_HINT = /pass|secret|token|otp|card|cvv|ssn/i;

/**
 * The generic snapshot never returns control values. Reading them is the whole
 * point of a typed adapter, so the credential guard is stated here explicitly
 * instead of being inherited.
 */
export const isCredentialLabel = (label: string): boolean => CREDENTIAL_HINT.test(label);

export const figmaControlValue = (
  label: string,
  inputType: string | null,
  rawValue: string | null,
): string => {
  if (isCredentialLabel(label)) return "";
  if (inputType !== null && inputType.toLowerCase() === "password") return "";
  return cleanFigmaText(rawValue);
};

export interface AnchorResult {
  name: string;
  found: boolean;
}

export const figmaAnchorHealthFrom = (results: readonly AnchorResult[]): FigmaAnchorHealth => {
  const resolved = results.filter((result) => result.found).map((result) => result.name);
  const missing = results.filter((result) => !result.found).map((result) => result.name);
  return { ok: missing.length === 0, resolved, missing };
};

/** Section headings that name inspector groups rather than the selected node. */
export const FIGMA_STRUCTURAL_HEADINGS: ReadonlySet<string> = new Set([
  "pages",
  "layers",
  "assets",
  "position",
  "layout",
  "appearance",
  "typography",
  "fill",
  "stroke",
  "effects",
  "export",
]);

export const figmaSelectionTypeFrom = (headings: readonly string[]): string | undefined =>
  headings.find(
    (heading) => heading.length > 0 && !FIGMA_STRUCTURAL_HEADINGS.has(heading.toLowerCase()),
  );

/**
 * Whether a layer row still holds the layer the caller was given.
 *
 * `layerId` is Figma's rendered-row index, so it points at a different node as
 * soon as the virtualised panel scrolls or a node expands. Comparing the name
 * that `get_figma_layers` reported against the name the row carries now turns
 * that silent mis-selection into a stale-reference error. An empty expected
 * name means the caller supplied no identity to check, so nothing is refused.
 */
export const figmaLayerRowMoved = (expectedName: string, actualName: string): boolean =>
  expectedName.length > 0 && actualName !== expectedName;
