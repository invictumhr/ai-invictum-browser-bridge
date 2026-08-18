import type {
  FigmaAnchorHealth,
  FigmaHealthcheckData,
  FigmaLayer,
  FigmaMode,
  FigmaSelectData,
  FigmaSelectParameters,
  GetFigmaDocumentData,
  GetFigmaLayersData,
  GetFigmaLayersParameters,
  GetFigmaPropertiesData,
} from "@invictum/protocol";

import {
  cleanFigmaText,
  figmaAnchorHealthFrom,
  figmaControlValue,
  figmaFileNameFrom,
  figmaLayerDepthFrom,
  figmaLayerIdFrom,
  figmaLayerRowMoved,
  figmaModeFrom,
  figmaSelectionTypeFrom,
  isCurrentMarker,
  isFigmaDesignUrl,
  type ModeLabelState,
} from "./figma-rules.js";

/**
 * Figma keeps its design surface in one WebGL canvas but renders its chrome -
 * pages, layer tree, inspector - as ordinary DOM. This module reads that chrome.
 *
 * Anchors are layered deliberately. Figma ships `data-testid` on some surfaces
 * (layer rows, panels) but not on others (pages, inspector, mode switch), so the
 * next choice is role plus accessible name. Hashed CSS module class names such
 * as `_1kmy3qh0` are never used: they change on every Figma deploy.
 */

export class FigmaContentError extends Error {
  public constructor(
    public readonly code: "ELEMENT_NOT_INTERACTABLE" | "INVALID_MESSAGE" | "POLICY_DENIED",
    message: string,
    public readonly retryable: boolean,
  ) {
    super(message);
    this.name = "FigmaContentError";
  }
}

const clean = cleanFigmaText;

const accessibleName = (element: Element): string =>
  clean(element.getAttribute("aria-label") ?? element.textContent);

/**
 * A layer row also carries its lock and visibility controls, so plain
 * `textContent` yields "Frame 67821Toggle layer lockingToggle layer visibility".
 * The layer name is the row's first text, and the control labels always follow
 * it, so taking the first text run keeps the name without depending on how
 * Figma marks up those controls or on the language of their labels.
 */
const firstTextRun = (element: Element): string => {
  const label = element.getAttribute("aria-label");
  if (label !== null && label.length > 0) return clean(label);
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node !== null) {
    const text = clean(node.textContent);
    if (text.length > 0) return text;
    node = walker.nextNode();
  }
  return "";
};

const isFigmaDesignFile = (): boolean => isFigmaDesignUrl(location.hostname, location.pathname);

const requireFigma = (): void => {
  if (!isFigmaDesignFile()) {
    throw new FigmaContentError("POLICY_DENIED", "The tab is not an open Figma design file", false);
  }
};

// --- anchors ----------------------------------------------------------------

interface AnchorProbe {
  name: string;
  strategy: FigmaHealthcheckData["checks"][number]["strategy"];
  resolve: () => Element | Element[] | null;
}

/**
 * The layer tree uses `role="gridcell"` too, so page cells must be scoped to the
 * pages panel. The walk stops if it reaches a container that also holds the
 * Layers heading, which would mean the two panels have been merged.
 */
const pagesPanel = (): Element | null => {
  const heading = headingNamed("Pages");
  if (heading === null) return null;
  const layersHeading = headingNamed("Layers");
  let node = heading.parentElement;
  while (node !== null) {
    if (layersHeading !== null && node.contains(layersHeading)) return null;
    if (node.querySelector('[role="gridcell"]') !== null) return node;
    node = node.parentElement;
  }
  return null;
};

const pageCells = (): Element[] => {
  const panel = pagesPanel();
  if (panel === null) return [];
  return [...panel.querySelectorAll('[role="gridcell"]')].filter(
    (cell) =>
      cell.closest('[data-testid^="layer-row"]') === null &&
      !(cell.getAttribute("data-testid") ?? "").startsWith("layer-row"),
  );
};

/**
 * The layer tree is a `treegrid`. Its `row` children carry the clean layer name,
 * while the `data-testid="layer-row-*"` wrapper also contains the lock and
 * visibility buttons, whose labels would otherwise be glued onto the name. The
 * pages panel is a plain grid, so scoping to the treegrid also keeps page rows
 * out of the layer list.
 */
const layersTreegrid = (): Element | null => document.querySelector('[role="treegrid"]');

const layerRows = (): Element[] => {
  const grid = layersTreegrid();
  if (grid !== null) return [...grid.querySelectorAll('[role="row"]')];
  return [...document.querySelectorAll('[data-testid^="layer-row"]')];
};

/**
 * Figma writes its inspector section titles as `role="heading"` divs rather than
 * `h2`/`h3` elements, so a tag-only query finds the sidebar headings but none of
 * the inspector ones.
 */
const HEADING_SELECTOR = 'h1, h2, h3, h4, [role="heading"]';

const headings = (root: ParentNode = document): Element[] => [
  ...root.querySelectorAll(HEADING_SELECTOR),
];

const headingNamed = (text: string): Element | null =>
  headings().find((heading) => accessibleName(heading).toLowerCase() === text.toLowerCase()) ??
  null;

const modeLabels = (): HTMLLabelElement[] =>
  [...document.querySelectorAll("label")].filter((label) =>
    ["draw", "design", "motion", "dev mode"].includes(accessibleName(label).toLowerCase()),
  );

/** The inspector is the container that holds both its tabs and its controls. */
const inspectorPanel = (): Element | null => {
  const control = document.querySelector('[role="spinbutton"]');
  if (control === null) return null;
  let node = control.parentElement;
  while (node !== null) {
    if (node.querySelector('[role="tab"]') !== null) return node;
    node = node.parentElement;
  }
  return null;
};

/**
 * Not every inspector control carries an `aria-label`. Sizing, appearance, and
 * fill controls name themselves through `aria-labelledby`, `title`, or a
 * placeholder instead, and requiring `aria-label` silently dropped those whole
 * sections from the result.
 */
const controlLabel = (element: Element): string => {
  const direct = element.getAttribute("aria-label");
  if (direct !== null && direct.trim().length > 0) return clean(direct);
  const labelledBy = element.getAttribute("aria-labelledby");
  if (labelledBy !== null) {
    const named = labelledBy
      .split(/\s+/)
      .map((id) => document.getElementById(id))
      .filter((node): node is HTMLElement => node !== null)
      .map((node) => accessibleName(node))
      .filter((text) => text.length > 0)
      .join(" ");
    if (named.length > 0) return clean(named);
  }
  for (const attribute of ["title", "placeholder"]) {
    const value = element.getAttribute(attribute);
    if (value !== null && value.trim().length > 0) return clean(value);
  }
  return "";
};

const INSPECTOR_CONTROL_SELECTOR =
  '[role="spinbutton"], [role="combobox"], [role="textbox"], [role="switch"], input';

const inspectorControls = (): HTMLElement[] => {
  const panel = inspectorPanel();
  const root: ParentNode = panel ?? document;
  return [...root.querySelectorAll<HTMLElement>(INSPECTOR_CONTROL_SELECTOR)].filter(
    (control) => controlLabel(control).length > 0,
  );
};

const ANCHORS: AnchorProbe[] = [
  { name: "pages_list", strategy: "role", resolve: () => pageCells() },
  { name: "pages_heading", strategy: "accessible_name", resolve: () => headingNamed("Pages") },
  { name: "layers_treegrid", strategy: "role", resolve: () => layersTreegrid() },
  { name: "layer_rows", strategy: "role", resolve: () => layerRows() },
  {
    name: "layer_row_testids",
    strategy: "test_id",
    resolve: () => [...document.querySelectorAll('[data-testid^="layer-row"]')],
  },
  { name: "layers_heading", strategy: "accessible_name", resolve: () => headingNamed("Layers") },
  { name: "mode_switch", strategy: "accessible_name", resolve: () => modeLabels() },
  { name: "inspector", strategy: "role", resolve: () => inspectorControls() },
];

const probeAnchors = (): FigmaAnchorHealth =>
  figmaAnchorHealthFrom(
    ANCHORS.map((anchor) => {
      try {
        const value = anchor.resolve();
        return {
          name: anchor.name,
          found: Array.isArray(value) ? value.length > 0 : value !== null,
        };
      } catch {
        return { name: anchor.name, found: false };
      }
    }),
  );

// --- document ---------------------------------------------------------------

const fileName = (): string => {
  const labelled = [...document.querySelectorAll("button[aria-label]")].find((button) =>
    /, file name$/i.test(button.getAttribute("aria-label") ?? ""),
  );
  return figmaFileNameFrom(labelled?.getAttribute("aria-label") ?? null, document.title);
};

/**
 * Figma marks the open page with `aria-current="page"` on the row's inner
 * button, not on the grid cell itself.
 */
const isCurrent = (element: Element): boolean =>
  isCurrentMarker(element.getAttribute("aria-current"), element.getAttribute("aria-selected")) ||
  [...element.querySelectorAll("[aria-current], [aria-selected]")].some((inner) =>
    isCurrentMarker(inner.getAttribute("aria-current"), inner.getAttribute("aria-selected")),
  );

const readPages = (): GetFigmaDocumentData["pages"] =>
  pageCells()
    .map((cell) => ({ name: accessibleName(cell), current: isCurrent(cell) }))
    .filter((page) => page.name.length > 0)
    .slice(0, 500);

const readMode = (): FigmaMode => {
  const labels: ModeLabelState[] = modeLabels().map((label) => {
    const input = label.querySelector<HTMLInputElement>(
      'input[type="radio"], input[type="checkbox"]',
    );
    return {
      name: accessibleName(label),
      active:
        (input?.checked ?? false) ||
        label.getAttribute("aria-selected") === "true" ||
        label.dataset["state"] === "active",
    };
  });
  // The Design/Prototype tab pair only exists while design mode is active.
  const selectedTab = [...document.querySelectorAll('[role="tab"]')].find(
    (tab) => tab.getAttribute("aria-selected") === "true",
  );
  return figmaModeFrom(labels, selectedTab === undefined ? null : accessibleName(selectedTab));
};

/**
 * The inspector heading names the selected node's type ("Text", "Frame") while
 * the highlighted layer row names the node itself.
 */
const readSelection = (): GetFigmaDocumentData["selection"] => {
  const selectedRow = layerRows().find((row) => row.getAttribute("aria-selected") === "true");
  // Scope the type heading to the inspector, otherwise unrelated headings such
  // as a missing-fonts notice get reported as the selected node's type.
  const panel = inspectorPanel();
  const typeHeading =
    panel === null
      ? undefined
      : figmaSelectionTypeFrom(headings(panel).map((heading) => accessibleName(heading)));
  if (selectedRow === undefined && typeHeading === undefined) return null;
  return {
    name: selectedRow === undefined ? "" : firstTextRun(selectedRow),
    type: typeHeading ?? "",
  };
};

export const performGetFigmaDocument = (): GetFigmaDocumentData => {
  requireFigma();
  return {
    file: { name: fileName() },
    mode: readMode(),
    pages: readPages(),
    selection: readSelection(),
    anchors: probeAnchors(),
  };
};

// --- layers -----------------------------------------------------------------

const layerDepth = (row: Element): number =>
  figmaLayerDepthFrom(
    row.getAttribute("aria-level"),
    row.querySelector<HTMLElement>("[style*='padding-left']")?.style.paddingLeft ?? null,
  );

// Figma numbers its rendered tree rows, which is a steadier handle than the
// position within the slice this call happened to return.
const layerIdOf = (row: Element, index: number): string =>
  figmaLayerIdFrom(
    row.getAttribute("data-fpl-tree-row-index"),
    row.getAttribute("id") ?? row.getAttribute("data-id"),
    index,
  );

export const performGetFigmaLayers = (parameters: GetFigmaLayersParameters): GetFigmaLayersData => {
  requireFigma();
  const rows = layerRows();
  const limited = rows.slice(0, parameters.maxRows);
  const layers: FigmaLayer[] = limited.map((row, index) => ({
    layerId: layerIdOf(row, index),
    name: firstTextRun(row),
    depth: layerDepth(row),
    hasChildren: (row.getAttribute("data-testid") ?? "").includes("with-children"),
    expanded:
      row.getAttribute("data-fpl-tree-row-expanded") === "true" ||
      row.getAttribute("aria-expanded") === "true",
    selected: row.getAttribute("aria-selected") === "true",
  }));
  const current = readPages().find((page) => page.current);
  return {
    page: current?.name ?? "",
    layers,
    renderedOnly: true,
    truncated: rows.length > limited.length,
    anchors: probeAnchors(),
  };
};

// --- properties -------------------------------------------------------------

const readControlValue = (element: HTMLElement): string => {
  const label = controlLabel(element);
  if (element instanceof HTMLInputElement) {
    return figmaControlValue(label, element.type, element.value);
  }
  if (element instanceof HTMLSelectElement) {
    return figmaControlValue(label, null, element.selectedOptions[0]?.text ?? "");
  }
  return figmaControlValue(
    label,
    null,
    element.getAttribute("aria-valuetext") ?? element.textContent,
  );
};

const devModeCss = (): string | undefined => {
  const code = [...document.querySelectorAll("pre, code")]
    .map((node) => clean(node.textContent))
    .find((text) => /[:;]/.test(text) && text.length > 8);
  return code !== undefined && code.length > 0 ? code.slice(0, 20_000) : undefined;
};

export const performGetFigmaProperties = (): GetFigmaPropertiesData => {
  requireFigma();
  const css = readMode() === "dev" ? devModeCss() : undefined;
  // A section heading and its controls are siblings rather than parent and
  // child, so each control belongs to the last heading that precedes it in
  // document order. That survives Figma changing how the panel is nested.
  const panel = inspectorPanel() ?? document;
  const sectionHeadings = headings(panel).filter((heading) => accessibleName(heading).length > 0);
  const grouped = new Map<Element, GetFigmaPropertiesData["sections"][number]["properties"]>();
  for (const control of inspectorControls()) {
    const owner = [...sectionHeadings]
      .reverse()
      .find(
        (heading) =>
          (heading.compareDocumentPosition(control) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
      );
    if (owner === undefined) continue;
    const property = {
      name: controlLabel(control),
      value: readControlValue(control),
    };
    if (property.name.length === 0 || property.value.length === 0) continue;
    const bucket = grouped.get(owner) ?? [];
    if (bucket.length < 64) bucket.push(property);
    grouped.set(owner, bucket);
  }
  const sections: GetFigmaPropertiesData["sections"] = [];
  for (const heading of sectionHeadings) {
    const properties = grouped.get(heading);
    if (properties === undefined || properties.length === 0) continue;
    sections.push({ name: accessibleName(heading), properties });
    if (sections.length >= 32) break;
  }
  return {
    selection: readSelection(),
    source: css === undefined ? "design_panel" : "dev_mode_inspect",
    reconstructed: css === undefined,
    sections,
    ...(css === undefined ? {} : { css }),
    anchors: probeAnchors(),
  };
};

// --- selection driving ------------------------------------------------------

const clickable = (element: Element): HTMLElement =>
  (element.querySelector<HTMLElement>("button, [role='button']") ?? element) as HTMLElement;

/**
 * Figma drives its tree and page rows from pointer events, so a bare `.click()`
 * reports success while changing nothing. Dispatching the full pointer/mouse
 * sequence at the element's centre is what actually moves the selection.
 */
const activateControl = (element: HTMLElement): void => {
  const rect = element.getBoundingClientRect();
  const clientX = rect.left + rect.width / 2;
  const clientY = rect.top + rect.height / 2;
  const base = { bubbles: true, cancelable: true, composed: true, clientX, clientY };
  element.dispatchEvent(new PointerEvent("pointerdown", { ...base, isPrimary: true, button: 0 }));
  element.dispatchEvent(new MouseEvent("mousedown", { ...base, button: 0 }));
  element.dispatchEvent(new PointerEvent("pointerup", { ...base, isPrimary: true, button: 0 }));
  element.dispatchEvent(new MouseEvent("mouseup", { ...base, button: 0 }));
  element.dispatchEvent(new MouseEvent("click", { ...base, button: 0 }));
};

/** Where a target sits on screen, so the background can aim trusted input. */
export interface FigmaTargetLocation {
  found: boolean;
  x: number;
  y: number;
  /** The row moved: this id now belongs to a different layer. */
  stale: boolean;
  /** What the row is actually called now, for the stale-reference message. */
  actualName: string;
}

/**
 * Figma's layer tree ignores synthetic DOM events, so selecting a layer needs
 * Chrome's trusted input. The content script can only say where the row is; the
 * background dispatches the actual click through CDP.
 */
export const performFigmaLocate = (parameters: FigmaSelectParameters): FigmaTargetLocation => {
  requireFigma();
  const { target } = parameters;
  if (target.type !== "layer") return { found: false, x: 0, y: 0, stale: false, actualName: "" };
  const row = layerRows().find(
    (candidate, index) => layerIdOf(candidate, index) === target.layerId,
  );
  if (row === undefined) return { found: false, x: 0, y: 0, stale: false, actualName: "" };
  // Figma's row index is positional, so the same id points at a different node
  // once the virtualised panel scrolls. Refuse the target when the row no
  // longer carries the name the caller was given, rather than selecting
  // whatever happens to sit there now.
  const actualName = firstTextRun(row);
  if (figmaLayerRowMoved(target.name, actualName)) {
    return { found: false, x: 0, y: 0, stale: true, actualName };
  }
  row.scrollIntoView({ block: "center", inline: "nearest" });
  const rect = row.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    return { found: false, x: 0, y: 0, stale: false, actualName };
  }
  return {
    found: true,
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
    stale: false,
    actualName,
  };
};

export const readFigmaState = (): FigmaSelectData => {
  requireFigma();
  const current = readPages().find((page) => page.current);
  return {
    selected: true,
    mode: readMode(),
    selection: readSelection(),
    currentPage: current?.name ?? "",
  };
};

export const performFigmaSelect = (parameters: FigmaSelectParameters): FigmaSelectData => {
  requireFigma();
  const { target } = parameters;
  if (target.type === "page") {
    const cell = pageCells().find(
      (candidate) => accessibleName(candidate).toLowerCase() === target.name.toLowerCase(),
    );
    if (cell === undefined) {
      throw new FigmaContentError(
        "ELEMENT_NOT_INTERACTABLE",
        `No Figma page named "${target.name}" is listed`,
        false,
      );
    }
    activateControl(clickable(cell));
  } else if (target.type === "layer") {
    throw new FigmaContentError(
      "INVALID_MESSAGE",
      "Layer selection is dispatched as trusted input by the background adapter",
      false,
    );
  } else {
    const wanted = target.mode === "dev" ? "dev mode" : "design";
    const label = modeLabels().find(
      (candidate) => accessibleName(candidate).toLowerCase() === wanted,
    );
    if (label === undefined) {
      throw new FigmaContentError(
        "ELEMENT_NOT_INTERACTABLE",
        `The ${target.mode} mode control is not available in this file`,
        false,
      );
    }
    activateControl(clickable(label));
  }
  return readFigmaState();
};

// --- health -----------------------------------------------------------------

export const performFigmaHealthcheck = (): FigmaHealthcheckData => {
  const detected = isFigmaDesignFile();
  const checks = ANCHORS.map((anchor) => {
    let count = 0;
    try {
      const value = anchor.resolve();
      count = Array.isArray(value) ? value.length : value === null ? 0 : 1;
    } catch {
      count = 0;
    }
    return {
      anchor: anchor.name,
      strategy: anchor.strategy,
      ok: count > 0,
      detail: count > 0 ? `resolved ${count}` : "no element matched this anchor",
    };
  });
  return { ok: detected && checks.every((check) => check.ok), figmaDetected: detected, checks };
};
