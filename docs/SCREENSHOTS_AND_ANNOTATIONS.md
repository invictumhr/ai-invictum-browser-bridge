# Screenshots and tutorial annotations

Invictum Browser Bridge can capture the visible viewport, one semantic element, an arbitrary CSS-pixel region, or the complete page. It can also draw shapes, arrows, and labels on the final JPEG. Annotations are rendered by the extension in an in-memory canvas inside the existing isolated content context; Bridge does not insert the canvas, annotation markup, or CSS into the page.

The feature is R0/read-only. It works on background tabs and must not be used as a reason to activate or focus a tab.

## Recommended agent workflow

For a normal screenshot, call `browser.screenshot` with only `tabId`.

For a tutorial screenshot that marks a real button:

1. obtain a fresh semantic snapshot;
2. find the exact button and keep its `elementId`;
3. pass the snapshot's `documentId` and `domRevision`;
4. capture `mode: "element"` with generous crop `padding`;
5. add an annotation whose target is that same element;
6. use the returned MCP image content or decode the returned JPEG data URL;
7. unlock the tab in `finally`.

Example MCP/control parameters:

```json
{
  "tabId": 123,
  "mode": "element",
  "documentId": "document-...",
  "domRevision": 7,
  "elementId": "element-...",
  "padding": 96,
  "maxWidth": 1600,
  "maxHeight": 1200,
  "annotations": [
    {
      "target": {
        "type": "element",
        "elementId": "element-...",
        "padding": 8
      },
      "shape": "rounded_rectangle",
      "stroke": "#ef4444",
      "strokeWidth": 4,
      "label": {
        "text": "Click this button",
        "position": "auto",
        "background": "#ef4444",
        "color": "#ffffff",
        "fontSize": 18,
        "arrow": true
      }
    }
  ]
}
```

The crop and annotation may target different elements. Every element target is revision-bound and resolved before capture. A stale element fails closed; obtain a new snapshot/find result instead of guessing coordinates.

## Capture modes

| Mode        | Required fields                          | Result                                                                                          |
| ----------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `viewport`  | `tabId`                                  | Current CSS viewport. This is the backward-compatible default.                                  |
| `element`   | `documentId`, `domRevision`, `elementId` | Exact semantic element plus `padding`, clamped to page bounds.                                  |
| `region`    | `region`                                 | Exact CSS-pixel rectangle in viewport or document coordinates.                                  |
| `full_page` | `tabId`                                  | Complete compositor page bounds from CDP layout metrics, without scrolling or focusing the tab. |

Region example:

```json
{
  "tabId": 123,
  "mode": "region",
  "region": {
    "x": 100,
    "y": 250,
    "width": 900,
    "height": 500,
    "coordinateSpace": "document"
  }
}
```

`coordinateSpace: "viewport"` interprets `x/y` from the current visible viewport and adds the current scroll position. `document` interprets them from the document origin. Width and height are always CSS pixels.

Full-page example:

```json
{
  "tabId": 123,
  "mode": "full_page",
  "quality": 80,
  "maxWidth": 1920,
  "maxHeight": 2560
}
```

The full page is proportionally scaled into the requested maximum dimensions and safe transport limit. Very tall pages are therefore readable as an overview, not as an unlimited-resolution archival capture. Capture individual regions/elements for readable detail.

`full_page` captures content Chrome has rendered. It does not deliberately scroll the page because scrolling can trigger application behavior, steal visual context, or interfere with the user. Lazy content that only loads after a real scroll may be absent; if the task explicitly requires it, use normal semantic scrolling/waits first and then capture.

## Annotations

Up to 20 annotations can be applied in one capture.

Targets:

- `{"type":"element","elementId":"...","padding":8}` uses a revision-bound semantic element;
- `{"type":"region","region":{...}}` uses a CSS-pixel rectangle.

Shapes:

- `rectangle`
- `rounded_rectangle`
- `ellipse`
- `circle`
- `highlight`

Appearance:

- `stroke`: six-digit hex color, default `#ef4444`;
- `strokeWidth`: 1–16 output pixels, default 4;
- `fill`: optional six-digit hex color;
- `fillOpacity`: 0–1, default 0.12;
- label `text`: 1–200 characters;
- label `position`: `auto`, `top`, `bottom`, `left`, or `right`;
- label `background` and `color`: six-digit hex colors;
- label `fontSize`: 10–48;
- label `arrow`: defaults to true.

`auto` tries above, below, right, then left and clamps the label to the image. If a target is outside the selected capture, Bridge returns `ELEMENT_NOT_INTERACTABLE`; choose `element`, `full_page`, or a larger region.

Because annotation rendering occurs after capture:

- the page DOM, styles, events, focus, and mutation revision do not change;
- page CSP and cross-origin frames cannot block the drawing operation;
- the clean source screenshot is never temporarily altered;
- labels remain visible in the returned JPEG after the tab is unlocked.

The background service worker resolves revision-bound targets and obtains the bounded source image. Chrome then executes one fixed, self-contained renderer through `chrome.scripting.executeScript` in the tab's `ISOLATED` world. The renderer receives only that in-memory image plus bounded drawing instructions; a detached DOM canvas draws text/shapes and encodes the final JPEG. The canvas is never appended to the document. The result returns through Chrome's standard scripting result and is validated again for media type, dimensions, byte limit, and exact annotation count. The renderer receives no credentials or arbitrary caller-supplied JavaScript.

## CLI recipes

```powershell
# Visible viewport
pnpm browser screenshot 123 .\viewport.jpg

# Complete page, scaled to protocol bounds
pnpm browser screenshot 123 .\full-page.jpg --full-page

# Viewport-relative region
pnpm browser screenshot 123 .\region.jpg --region 100,200,900,500

# Document-relative region
pnpm browser screenshot 123 .\region.jpg --region 100,1200,900,500 --document

# Element crop; run snapshot/find in this CLI session first
pnpm browser screenshot-element 123 element-document-7-4 .\button.jpg

# Element crop with red outline, arrow, and tutorial label
pnpm browser tutorial-screenshot 123 element-document-7-4 "Click this button" .\tutorial.jpg
```

The CLI writes the JPEG and returns metadata plus the absolute output path. `screenshot-element` and `tutorial-screenshot` use the CLI's cached document revision and perform at most one deterministic stale-reference relocation.

## TypeScript SDK

```ts
const image = await client.captureTutorialScreenshot({
  tabId,
  documentId: snapshot.metadata.documentId,
  domRevision: snapshot.metadata.domRevision,
  elementId: saveButton.elementId,
  text: "Click this button",
  outputMode: "element",
  padding: 96,
});
```

For custom combinations use `client.captureScreenshot({...})`.

## Output and limits

Every result contains:

- JPEG `dataUrl`, dimensions, media type, byte length, and capture timestamp;
- `documentId` and `domRevision`;
- CSS viewport dimensions and device scale factor;
- `capture.mode`;
- `capture.sourceCssRect` in document CSS pixels;
- `capture.fullPage`;
- `capture.annotationsApplied`.

Hard bounds:

- maximum output dimensions: 2560 × 2560;
- maximum JPEG payload: 500,000 bytes;
- quality: 30–90;
- at most 20 annotations;
- desktop timeout for screenshot rendering: 30 seconds.

Bridge reduces dimensions and JPEG quality until the transport limit is met. Raw image data and label text are not written to audit records. Audit keeps bounded metadata such as mode, annotation count, dimensions, byte count, source rectangle, and revision.

## Browser and debugger behavior

The simple active `viewport` path first uses `chrome.tabs.captureVisibleTab`. Background viewport capture, all crops, full-page capture, and annotated capture use the shared short-lived CDP debugger session. All CDP users share the same reference-counted attachment per tab. Annotated captures then execute a fixed renderer with a detached canvas in Chrome's isolated world only for deterministic drawing and JPEG encoding; this avoids service-worker canvas text/encoding stalls and long extension-message responses without changing the captured page.

Chrome permits only one external debugger client per tab. If a debugger-backed screenshot fails while visible DevTools is attached to that same tab, close DevTools and retry once. Chrome may show its own debugging notification. None of these capture modes requires tab activation.

Restricted Chrome pages remain blocked. Site access, User Stop, reservation ownership, stale references, output bounds, and the normal finally/unlock contract still apply.
