# Browser capability audit

Date: 2026-07-24

## Current coverage

The Bridge now exposes 46 runtime browser actions and 50 MCP tools. Together
they cover:

- tab discovery, background opening/navigation, back/forward history, explicit
  activation, waits, close, reservation, identity, and release;
- compact, outline, full, and scoped semantic snapshots;
- clean page text and deterministic natural-language element discovery;
- revision-bound find, click, typing, selection, checkbox, submit, coordinate
  fallback, modifier keys, double/context click, drag/drop, relative/absolute
  scrolling, and other synthetic gestures;
- native inputs, contenteditable, WYSIWYG, CodeMirror-like models, Gutenberg,
  Classic Editor, WordPress menus, notices, and list tables;
- local file upload through CDP;
- constrained evaluation, typed DOM mutation, element/listener inspection,
  CSS injection/removal, event observation, and authorized raw JavaScript;
- native JavaScript dialogs, leave-site prompts, prefilled login, and ephemeral
  HTTP Basic Auth;
- viewport/element/region/full-page screenshots with tutorial annotations;
- programmatic console capture, mobile emulation, metadata-only network
  diagnostics, and PDF export;
- explicitly authorized same-origin page API calls with bounded/redacted
  responses and optional browser-side WordPress nonce handling;
- MCP, CLI, and SDK batching that preserves every step's normal policy, audit,
  validation, reservation, and error semantics.

## Improvements added in this audit

### Revision-bound gesture API

Adds hover, focus, blur, safe key presses, scroll, and drag-and-drop without
requiring screen coordinates. Submit/reset guards remain active.

### Metadata-only network capture

Adds request lifecycle diagnostics while deliberately excluding headers,
bodies, cookies, POST data, query strings, fragments, and URL credentials.

### PDF export

Adds bounded page-to-PDF export with common paper sizes, margins, scale,
backgrounds, page ranges, and CSS page-size support.

### English-only extension UI

The popup, in-page control indicator, toolbar-facing states, generated
WordPress labels, tests, CLI help, and authoritative documentation now use
English. Croatian IBB/IBG trigger phrases remain accepted aliases.

### Agent productivity actions

Adds sanitized clean-text extraction, deterministic natural-language element
ranking, non-activating back/forward navigation, explicit tab activation,
same-origin page API requests and sequential policy-preserving batches.

### Expanded gesture vocabulary

Adds double-click, context-click, modifier-aware key events, deterministic
Tab/Shift+Tab focus traversal, and absolute document scrolling. These remain
synthetic page events and do not claim OS-trusted input.

## Evaluated and intentionally deferred

### Cookies, storage, cache contents, and autofill data

Not added. These surfaces frequently contain credentials, tokens, personal
data, or cross-site tracking identifiers. They would weaken the Bridge's
existing redaction model.

### Passive request/response bodies and headers

Not added to network capture. Passive diagnostics remain metadata-only because
body or header capture would expose credentials, private API payloads, and
uploaded files. The separate R3 `browser.page_api_request` action accepts an
agent-supplied same-origin body and returns a bounded/redacted response; it
never exposes ambient request bodies or arbitrary headers.

### Traffic interception or modification

Not added. Request blocking, header rewriting, response replacement, and proxy
behavior can silently change application semantics and bypass normal security
controls.

### Automatic permission, camera, microphone, geolocation, and notification

approval

Not added. Browser permission prompts are explicit user control points and
must not be bypassed.

### Arbitrary OS-level trusted input

Not added to the extension protocol. Synthetic semantic input is safer,
deterministic, revision-bound, and auditable. Existing machine-level
automation remains a separately authorized fallback for browser chrome that
the extension cannot control.

### Unrestricted download management

Deferred. A safe future design should require an explicit target directory,
sanitize filenames, verify final paths, distinguish user-requested downloads
from unsolicited ones, and avoid opening downloaded executables.

### Deep cross-origin iframe control

Deferred pending a frame-scoped reference model. Reusing top-frame
`documentId`/`domRevision` semantics across cross-origin frames would create
ambiguous stale references and policy scope.

### Performance tracing and Lighthouse orchestration

Deferred. CDP tracing is large and expensive, and Lighthouse adds a separate
runtime/dependency surface. Current console, network metadata, mobile
emulation, screenshots, PageSpeed browsing, and PDF export cover the common
diagnostic workflow without turning the extension into a profiler.

### Bookmarks and download history

Not added because these are profile-wide personal data surfaces rather than
tab-scoped task capabilities. Tab-local back/forward navigation is implemented
without exposing the user's history database.

## Next safe candidates

Future work should prioritize:

1. frame-scoped snapshots and references for explicitly selected iframes;
2. safe download completion tracking with explicit per-download user intent;
3. accessibility-tree diffing between revisions;
4. bounded performance metrics without trace payloads;
5. reusable transaction-style verification helpers for high-level WordPress
   workflows.
