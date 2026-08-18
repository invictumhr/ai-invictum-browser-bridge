# Advanced DOM, CSS, event and JavaScript tools

This is the detailed contract for diagnosing and operating non-standard web interfaces. Read [AGENT_USAGE.md](../AGENT_USAGE.md) first. Runtime `system.capabilities` remains the source of truth.

## Decision order

Use the narrowest tool that can complete the task:

1. snapshot + `find_elements` + typed action (`click`, `type_text`, `select_option`, `check`, `submit_form`);
2. `inspect_element` when an element's state, CSS, custom-element identity or JavaScript event path is unclear;
3. `observe_events` to see which user/page events actually fire;
4. `mutate_dom` for explicit text, attribute, sanitized HTML or inline-style changes;
5. `manage_css` for reversible page-wide visual changes;
6. constrained `browser.evaluate` for its small allowlisted DOM grammar;
7. raw `execute_javascript` only as an explicitly authorized R3 last resort;
8. screenshot + `click_at` only when the page has no stable semantic target.

## Model-backed editors

CodeMirror, Ace, Monaco, Quill and TinyMCE keep authoritative content outside the visible editable DOM. Directly changing `textContent`, `innerHTML` or a rendered line can look correct and still submit the old value. `browser.type_text` has a fixed, non-arbitrary MAIN-world synchronization path for these editors:

- CodeMirror 5 uses its editor instance, then calls `save()` so the backing textarea is current;
- CodeMirror 6 dispatches a document transaction and verifies the resulting document;
- Ace, Monaco and Quill update and re-read their editor model;
- TinyMCE updates its editor content, calls `save()` and verifies its text model.

The action fails closed with `ELEMENT_NOT_INTERACTABLE` if a recognized model-backed surface has no safely reachable API. It never reports success from a visual DOM mutation alone. A random per-operation marker connects the revision-bound isolated-world element to the fixed adapter; the marker is ignored by DOM revision tracking and removed in `finally`, including failure paths. Typed content is not included in the returned metadata.

For an editor form workflow:

1. snapshot and locate the visible editor surface;
2. call `type_text`;
3. take a fresh snapshot because the model transaction can redraw the DOM;
4. locate the actual form and call explicitly authorized `submit_form`;
5. verify the saved result through a success message, navigation, refreshed value or application state.

Do not use `mutate_dom` as an editor-writing fallback. Use `inspect_element` to identify an unsupported widget, then use raw JavaScript only when the user explicitly authorized that R3 fallback.

Never use a broader tool to bypass User Stop, a sensitive-input block, submit policy, a restricted page, or withheld Chrome Site access.

`browser.evaluate` remains a small R2 expression DSL, not raw JavaScript. Its implementation acquires one bounded shared Chrome Runtime session because MV3 forbids `eval` in extension isolated worlds. For `world: "ISOLATED"` it creates a dedicated page execution context; for `world: "MAIN"` it uses the page's main context. The approved expression is compiled directly inside a fixed bounded serializer, the object group is released, and the session reference is released in `finally`. Close visible DevTools on that same tab before one careful retry if Chrome reports a debugger conflict.

## Inspect an element and discover custom-widget JavaScript

`browser.inspect_element` is revision-bound. It returns redacted safe attributes, inline CSS, selected computed CSS properties, geometry, visibility/editability/clickability, custom-element metadata and ancestors. With `includeEventListeners: true`, a shared Chrome Debugger session additionally reports:

- listener type, capture/passive/once flags and handler name;
- whether the listener is on the element/subtree, `document` or `window`;
- sanitized script URL, line and column;
- a bounded, credential-pattern-redacted source excerpt around the listener.

For inline `<script>` handlers, the adapter maps the resource-relative listener location through CDP `Debugger.scriptParsed.startLine` before slicing the script body. If a framework reports an unusable location but exposes a safe JavaScript handler name, Bridge performs only a bounded in-script name lookup and still returns at most `sourceExcerptChars`; it never returns the complete source as a fallback.

This is the preferred way to understand a JavaScript-generated dropdown: inspect the trigger with document listeners enabled, identify the delegated `click`/`keydown` handler, read its bounded source excerpt, then operate the generated options semantically.

```json
{
  "tabId": 123,
  "documentId": "document-...",
  "domRevision": 9,
  "elementId": "element-...",
  "computedStyleProperties": ["display", "visibility", "pointer-events", "z-index"],
  "includeEventListeners": true,
  "includeDocumentListeners": true,
  "listenerDepth": 2,
  "maxListeners": 40,
  "sourceExcerptChars": 1200
}
```

Set `includeEventListeners: false` for a fast content-only inspection without a Debugger attachment. Invictum's debugger-backed tools share one internal client, but Chrome supports only one external debugger client per tab; if visible DevTools is open on the same tab, close it and retry once.

The implementation uses the official `DOMDebugger.getEventListeners` and `Debugger.getScriptSource` APIs. It never returns complete script files and sanitizes URL query values/fragments.

## Observe real page events

`browser.observe_events` has a bounded `start -> read -> stop` lifecycle. `start` may bind to one revision-bound subtree and accepts at most 50 event types and 500 retained events. Each record contains event type/phase/trust/default state, a redacted semantic target summary, safe pointer metadata, safe keyboard metadata, `inputType`, and only the type of custom-event detail.

It never returns input values, form values or arbitrary `CustomEvent.detail`. Sensitive-target keystrokes are redacted. The capture is a ring buffer and reports `droppedEvents`.

```json
{
  "operation": "start",
  "tabId": 123,
  "eventTypes": ["click", "keydown", "input", "change", "fixture:selection"],
  "maxEvents": 200
}
```

Keep the returned `captureId`, perform the UI operation, then:

```json
{"operation":"read","tabId":123,"captureId":"00000000-0000-4000-8000-000000000000","clear":false}
{"operation":"stop","tabId":123,"captureId":"00000000-0000-4000-8000-000000000000"}
```

Always stop explicitly. Final expiry of the cancellable 20-second explicit-unlock grace, inactivity lease expiry, User Stop and toolbar reauthorization also stop abandoned captures. A new command during the unlock grace cancels cleanup; User Stop remains immediate. Event sequence numbers remain monotonic even when `read` clears the bounded ring buffer.

## Typed DOM and inline-CSS mutation

`browser.mutate_dom` is R2 and requires a genuine explicit-user-instruction reference. It accepts 1–50 ordered operations on one fresh element:

- `set_text`;
- `set_attribute` / `remove_attribute`;
- `set_style` / `remove_style`;
- `insert_html` at standard `insertAdjacentHTML` positions;
- `replace_children_html`;
- `remove_element` (must be last).

```json
{
  "tabId": 123,
  "documentId": "document-...",
  "domRevision": 9,
  "elementId": "element-...",
  "operations": [
    { "type": "set_attribute", "name": "aria-expanded", "value": "true" },
    {
      "type": "set_style",
      "property": "outline",
      "value": "2px solid #1683ff",
      "priority": "important"
    },
    { "type": "insert_html", "position": "beforeend", "html": "<strong>Preview</strong>" }
  ],
  "authorization": {
    "source": "explicit_user_instruction",
    "instructionId": "user-message-stable-id"
  }
}
```

The extension rejects sensitive elements, internal bridge markers, executable/resource-loader mutation targets, event-handler/style/value/srcdoc/credential-like attributes, automatic resource attributes and unsafe URLs. Safe removal of ordinary attributes, inline styles and entire elements remains available. Inserted HTML removes scripts, stylesheets, frames, embeds, metadata, SVG resource/animation elements, handler attributes, credential-like attributes and unsafe or automatic-resource attributes. `set_style` uses the same no-network/no-credential-side-channel CSS checks as page-wide injection. The result returns only operation types/counts plus the new revision; it never echoes supplied text/HTML/CSS into audit.

## Reversible CSS injection

`browser.manage_css` is R2. `add` returns a UUID `injectionId`; `remove` requires that ID. Exact CSS is retained only in `chrome.storage.session` so MV3 service-worker suspension does not prevent removal. Every remaining injection for the tab is removed when the cancellable 20-second explicit-unlock grace expires, during the 30-second abandoned lease release, immediately on User **Stop**, or during toolbar reauthorization.

```json
{
  "operation": "add",
  "tabId": 123,
  "css": "#panel { outline: 3px solid #1683ff !important; }",
  "origin": "USER",
  "allFrames": false,
  "authorization": {
    "source": "explicit_user_instruction",
    "instructionId": "user-message-stable-id"
  }
}
```

`USER` origin is useful when the temporary rule must override author CSS. CSS escapes/comments, external-load functions/rules and executable legacy constructs (`@import`, `url(...)`, `image(...)`, `image-set(...)`, `expression(...)`, `behavior`, `-moz-binding`) are rejected. Credential side channels are also rejected: CSS cannot query `[value]`, render `attr(...)`, or disable password masking with `text-security`. CSS source is never returned or audited; audit stores only its hash, byte length and options.

## Raw JavaScript last resort

`browser.execute_javascript` is R3 and requires a genuine explicit instruction. It acquires the tab's shared debugger session for one bounded `Runtime.evaluate`, requests a by-value result, releases the object group and its session reference in `finally`. It supports an expression or an async function body:

```json
{
  "tabId": 123,
  "sourceType": "function_body",
  "source": "const widget = document.querySelector('x-widget'); widget.open = true; return { opened: widget.open };",
  "awaitPromise": true,
  "userGesture": false,
  "timeoutMs": 5000,
  "authorization": {
    "source": "explicit_user_instruction",
    "instructionId": "user-message-stable-id"
  }
}
```

Returned objects are depth/item/string bounded and credential-like object keys are redacted. Obvious cookie, browser-storage, credential, payment, OTP and extension-source references are rejected. This static defense is not a secure JavaScript sandbox: arbitrary page JavaScript is inherently more powerful than a typed action. Never use it to read inputs, credentials, cookies/storage, make network requests, navigate, submit, or bypass a denial. Use only source necessary for the user's explicit task, verify the visible result with a fresh snapshot, and never place secrets in source or returned data.

Raw source/result is excluded from audit; only source SHA-256, length, execution options and result metadata are stored.

## MCP and generic control clients

Dedicated MCP tools are:

- `invictum_inspect_element`
- `invictum_observe_events`
- `invictum_mutate_dom`
- `invictum_manage_css`
- `invictum_execute_javascript`

Console and device-emulation tools are documented separately in [DEVTOOLS_CONSOLE_AND_MOBILE.md](DEVTOOLS_CONSOLE_AND_MOBILE.md).

CLI users can send the same strict parameters without PowerShell escaping:

```powershell
@{
  tabId = 123
  documentId = "document-..."
  domRevision = 9
  elementId = "element-..."
  includeEventListeners = $true
} | ConvertTo-Json -Depth 10 -Compress | pnpm browser call browser.inspect_element --stdin
```

The Agent SDK/control API uses identical action names and parameter bodies.

## Cleanup and verification

After any DOM, CSS or JavaScript mutation, discard unrelated old element references and obtain a new snapshot. Debugger-backed operations (`evaluate`, listener/source inspection, raw JavaScript, upload, screenshots and native-dialog handling) share a reference-counted attachment and release their own reference before returning. Programmatic console/mobile preview may intentionally keep the shared attachment alive until `stop`/`reset`. Chrome still permits only one external debugger client per tab, so close visible DevTools on that tab before one careful retry.

Always finish with:

```ts
try {
  // browser work
} finally {
  await browser.call("browser.unlock_tab", { tabId });
}
```

The deterministic `chrome-kitchen-sink-smoke` fixture covers typed DOM mutation and HTML sanitization, stylesheet/inline-network denial, inline/computed CSS inspection, reversible CSS injection, delegated custom-dropdown listener/source discovery, scoped standard/custom event capture with monotonic sequence after clear, raw expression/function execution and protected-source denial.

## Official implementation references

- [Chrome `scripting.insertCSS` / `removeCSS`](https://developer.chrome.com/docs/extensions/reference/api/scripting)
- [Chrome Debugger API and supported CDP domains](https://developer.chrome.com/docs/extensions/reference/api/debugger)
- [CDP DOMDebugger domain](https://chromedevtools.github.io/devtools-protocol/tot/DOMDebugger/)
- [CDP Debugger domain](https://chromedevtools.github.io/devtools-protocol/tot/Debugger/)
- [CDP Runtime domain](https://chromedevtools.github.io/devtools-protocol/v8/Runtime/)
