# Figma design files

Figma paints its design surface into a single WebGL canvas but renders its
chrome — pages list, layer tree, inspector — as ordinary DOM. The typed Figma
actions read that chrome. The canvas itself is not readable; use screenshots for
the artwork.

## Actions

| Action                         | Risk | Purpose                                              |
| ------------------------------ | ---- | ---------------------------------------------------- |
| `browser.get_figma_document`   | R0   | file name, mode, page list, current selection        |
| `browser.get_figma_layers`     | R0   | rendered rows of the layer tree for the current page |
| `browser.get_figma_properties` | R0   | inspector properties of the current selection        |
| `browser.figma_select`         | R1   | switch page, switch mode, or select a layer          |
| `browser.figma_healthcheck`    | R0   | verify every UI anchor the adapter depends on        |

MCP wrappers are `invictum_get_figma_document`, `invictum_get_figma_layers`,
`invictum_get_figma_properties`, `invictum_figma_select`, and
`invictum_figma_healthcheck`. CLI shorthands are `figma-doc`, `figma-layers`,
`figma-props`, `figma-select`, and `figma-health`.

```powershell
pnpm browser figma-doc 42
pnpm browser figma-layers 42 300
pnpm browser figma-props 42
pnpm browser figma-select 42 page "Mobile"
pnpm browser figma-select 42 layer 17 "Frame 67821"
pnpm browser figma-select 42 mode dev
pnpm browser figma-health 42
```

## Workflow

```text
open_tab (Figma design URL)
figma_healthcheck        -> confirms the file is loaded and anchors resolve
figma_get_document       -> pages, mode, selection
figma_select page|layer  -> move to what you care about
figma_get_layers         -> the rendered rows
figma_get_properties     -> values for the current selection
unlock_tab in finally
```

Start with `figma_healthcheck`. It distinguishes the three states that otherwise
look identical: the tab is not a Figma design file, Figma has not finished
loading, or Figma changed its UI and an anchor no longer resolves.

## Figma needs a visible tab

Figma does not finish initialising in a tab that has never been visible. In
testing, a background tab still reported no anchors after 180 seconds and became
ready immediately once activated.

Agent tabs open in the agent's own window (see
[AGENT_USAGE.md](../AGENT_USAGE.md) section 7), and the tab is active inside that
window, so Figma initialises without touching the user's windows. If the agent
window is minimised, Figma may stall again; leave it open beside the user's work.

Until `figma_healthcheck` reports `ok`, every other Figma action returns empty
results rather than failing. Wait for the healthcheck instead of retrying.

## What the results mean

- `pages[].current` — Figma marks the open page with `aria-current="page"`.
- `layers` — **only the rows Figma has rendered**. The panel is virtualised, so
  `renderedOnly` is always `true` and `truncated` reports that more rows exist.
  Scroll the panel or select a layer to bring more rows into the DOM.
- `layers[].layerId` — Figma's own rendered-row index, not a persistent node
  id: it points at a different layer as soon as the panel scrolls or a node
  expands. Pass it to `figma_select` **together with the `name` from the same
  result**. The adapter checks that the row still carries that name and fails
  with `STALE_ELEMENT_REFERENCE` if it does not, so a scrolled panel cannot
  cause the wrong layer to be selected. Two layers sharing a name at different
  positions are the one case the check cannot separate.
- `layers[].depth` — from Figma's `aria-level`, which is **zero-based**: a
  top-level layer is depth 0.
- `properties.source` — `dev_mode_inspect` carries Figma's own CSS in `css`.
  `design_panel` means the values were reassembled from the design inspector and
  `reconstructed` is `true`; they may differ from the CSS Figma emits, especially
  for effects, gradients, and auto-layout.
- `anchors` — every response carries the same anchor health as the healthcheck.

## Anchors and why they break

Anchors are layered on purpose:

1. `data-testid` where Figma ships one — the layer rows have
   `layer-row-with-children`.
2. `role` plus accessible name everywhere else.
3. Never hashed CSS module classes such as `_1kmy3qh0`; they change on every
   Figma deploy.

Figma does **not** ship `data-testid` for the pages list, the inspector, or the
mode switch, so those anchors use `role` and accessible names. Accessible names
are language-dependent: switching the Figma interface away from English will
break them, and `figma_healthcheck` will name exactly which ones.

Run `figma_healthcheck` after a Figma release, or whenever a Figma action returns
unexpectedly empty results.

## Limits

- The design canvas is WebGL. Layer geometry and artwork are not readable from
  the DOM; use `browser.screenshot` for the visuals.
- `figma_select` drives Figma's own controls, which changes the live document
  selection. Collaborators in the file see it happen.
- A `layer` target is delivered as **trusted Chrome input** through CDP, not as
  a synthetic DOM event, because Figma's layer tree ignores synthetic events
  entirely. The row is scrolled into view, located, and clicked at its centre.
  This attaches the debugger for the duration of the click, so a visible
  DevTools window on the same tab can conflict.
- Every `figma_select` reads its result back after a short settle rather than in
  the same turn as the click, because Figma repaints asynchronously.
- `figma_get_properties` reads inspector controls by role, naming each from
  `aria-label`, `aria-labelledby`, `title`, or a placeholder. Which sections
  appear depends on the selected node: a text node yields Position and
  Typography, a vector yields Position, Fill, and Selection colors.

  A control that names itself none of those ways is skipped rather than
  reported under a meaningless name. Figma's auto-layout sizing controls are the
  known case: they render as `combobox` elements whose only name is their own
  text, such as `HugHugHug (110)110`, so width and height are absent. The
  `inspector` anchor count in `figma_healthcheck` reports how many controls
  passed the naming check, which is the number to compare a result against.

- Switching to Dev Mode works, but the panel itself needs a Dev or Full seat.
  Without one Figma still swaps the inspector for Inspect/Plugins and then
  covers it with an upgrade prompt, so `mode` reads `dev` while no CSS is
  available and `get_figma_properties` stays on `design_panel` with
  `reconstructed: true`.
- Inspector values come from input controls, which the generic snapshot never
  returns. The adapter reads them deliberately and refuses password inputs and
  credential-shaped labels.

## Reading the whole document

The DOM gives what is on screen. For a complete machine-readable export of every
page and node, Figma's REST API is the right channel — it is outside the Bridge,
needs a personal token, and `browser.page_api_request` cannot reach it because it
is cross-origin and forbids `Authorization` headers.
