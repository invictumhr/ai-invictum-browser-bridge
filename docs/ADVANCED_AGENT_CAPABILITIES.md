# Advanced agent capabilities

This guide covers the advanced browser features that complement semantic
snapshot/find/action workflows:

- safe synthetic gestures;
- double-click, context-click, modifier keys, and absolute scrolling;
- metadata-only network diagnostics;
- PDF export;
- programmatic console capture;
- mobile device emulation.

Always call `system.capabilities` first. The installed extension is the source
of truth.

## 1. Advanced gestures

Action: `browser.perform_gesture`  
MCP: `invictum_perform_gesture`  
CLI: `hover`, `focus`, `blur`, `scroll-to`, `press`, `double-click`,
`context-click`, `drag`, `scroll-by`, `scroll-xy`

Supported operations:

- `hover`
- `focus`
- `blur`
- `scroll_into_view`
- `double_click`
- `context_click`
- `press_key`
- `drag_and_drop`
- `scroll_by`
- `scroll_to`

All operations are revision-bound. Element operations require the current
`documentId`, `domRevision`, and `elementId`. Drag and drop also requires a
current `targetElementId`.

```json
{
  "tabId": 42,
  "operation": "drag_and_drop",
  "documentId": "doc-1",
  "domRevision": 7,
  "elementId": "source-id",
  "targetElementId": "target-id",
  "steps": 10
}
```

`press_key` accepts a bounded named key or printable key plus optional
`code`, `ctrl`, `alt`, `meta`, and `shift`. `Tab` and `Shift+Tab`
deterministically move focus through the current document's focusable
elements.

`scroll_to` accepts absolute document `x`/`y` coordinates. `scroll_by` accepts
relative deltas. Both work without an element reference but remain bound to
the current `documentId` and `domRevision`.

`double_click` dispatches the normal two-click sequence plus `dblclick`.
`context_click` dispatches the secondary-button sequence plus `contextmenu`.
They are page-level synthetic events; they do not open or control Chrome's own
browser menu.

The gesture implementation dispatches DOM pointer, mouse, keyboard, and drag
events in the page. It is not an OS-level trusted-input system. Use semantic
`click`, `type_text`, `select_option`, and WordPress actions first. Use gestures
for hover menus, focus/blur validation, keyboard-driven widgets, scrolling, and
HTML/custom drag interfaces.

Form submit and reset remain fail-closed. A gesture cannot replace the
explicitly authorized `browser.submit_form` path.

Every successful gesture returns `domRevisionAfter` and, where applicable,
`resolvedElementId`/`resolvedTargetElementId`. Use those references only for
the same targets; refresh other references.

Clean text, deterministic natural-language find, history navigation,
same-origin page API calls and policy-preserving batches are documented in
[AGENT_PRODUCTIVITY_ACTIONS.md](AGENT_PRODUCTIVITY_ACTIONS.md).

## 2. Metadata-only network diagnostics

Action: `browser.network`  
MCP: `invictum_network`  
CLI: `network <tabId> <start|read|clear|stop>`

Start capture before the action being diagnosed:

```json
{
  "tabId": 42,
  "operation": "start",
  "bufferSize": 500
}
```

Then perform the browser action, read the buffer, and stop in `finally`.

```json
{ "tabId": 42, "operation": "read", "limit": 200, "clear": false }
```

The capture intentionally records only bounded metadata:

- monotonically increasing sequence number;
- timestamp and request phase;
- opaque request ID;
- URL origin and path;
- method and resource type;
- response status and MIME type;
- disk-cache/service-worker flags;
- encoded transfer length;
- bounded failure, cancellation, and blocked-reason metadata.

The following are never captured:

- request or response bodies;
- headers;
- cookies;
- authorization values;
- POST data;
- query strings;
- URL fragments;
- URL credentials.

Every result explicitly reports:

```json
{
  "bodiesCaptured": false,
  "headersCaptured": false,
  "queryStringsRedacted": true
}
```

Capture uses the shared, reference-counted debugger session. Visible DevTools
on the same tab may conflict with attachment. Close DevTools and retry once.
`stop`, final tab release, User Stop, tab close, or unexpected debugger detach
releases the capture.

## 3. PDF export

Action: `browser.print_to_pdf`  
MCP: `invictum_print_to_pdf`  
CLI: `pdf <tabId> <output.pdf>`

```json
{
  "tabId": 42,
  "paperSize": "a4",
  "landscape": false,
  "printBackground": true,
  "scale": 1,
  "marginTop": 0.4,
  "marginBottom": 0.4,
  "marginLeft": 0.4,
  "marginRight": 0.4,
  "preferCssPageSize": false
}
```

Supported paper sizes are `a4`, `letter`, and `legal`. `pageRanges` uses
Chrome's print syntax, for example `1-3,5`.

The generated PDF is limited to 10 MB. The MCP tool returns it as an embedded
`application/pdf` resource. The CLI writes it to the explicit output path.
The protocol/control API returns a bounded data URL.

PDF export works only on normal HTTP(S) pages, does not activate the tab, and
releases its short-lived debugger reference in `finally`.

## 4. Programmatic console

Action: `browser.console`  
MCP: `invictum_console`

Use:

1. `start`
2. perform the action being diagnosed
3. `read`
4. `stop` in `finally`

Console entries are bounded and redacted. Starting capture after the failing
action cannot recover earlier messages.

## 5. Mobile preview

Action: `browser.emulate_device`  
MCP: `invictum_emulate_device`

Set a preset or a valid custom viewport, obtain a new snapshot, test and
capture screenshots, then call `reset` in `finally`. Emulation does not require
the tab to become active.

`screen`/outer metrics may differ from the page's CSS `innerWidth` because of
viewport metadata, zoom, shrink-to-fit, and minimum-content rules. Verify the
reported profile, snapshot viewport, and screenshot together.

## 6. Lifecycle template

```text
ping
capabilities
open_tab/navigate (omit active unless focus is genuinely required)
set_control_identity (optional)
snapshot/find
start diagnostic capture if needed
perform typed actions or bounded gesture
verify with wait/snapshot/screenshot/PDF
stop diagnostic capture in finally
reset device emulation in finally
unlock_tab in finally
```

Prefer `invictum_end_session` when one agent session reserved multiple tabs.
