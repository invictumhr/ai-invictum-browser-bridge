# Browser capability audit

Date: 2026-09-14

## Current coverage

The current source exposes 64 extension actions, one Desktop Authority health
action, and 74 MCP tools. Runtime `system.capabilities` is authoritative. The
surface covers:

- tab discovery, background opening/navigation, back/forward history, explicit
  activation, waits, close, reservation, identity, and release;
- compact, outline, full, scoped semantic snapshots, clean text, deterministic
  natural-language element discovery, and value-redacted accessibility trees;
- sanitized frame topology, navigation/readiness/history state, bounded
  performance/Web Vitals metrics, semantic/AX diffs, visual fingerprints, and
  viewport screenshot comparison;
- revision-bound find, click, typing, selection, checkbox, submit, coordinate
  fallback, modifier keys, double/context click, drag/drop, relative/absolute
  scrolling, and other synthetic gestures;
- native inputs, contenteditable, WYSIWYG, CodeMirror-like models, Gutenberg,
  Classic Editor, WordPress menus, notices, and list tables;
- local file upload through CDP and explicitly authorized, byte-bounded managed
  downloads without path disclosure or executable acceptance;
- constrained evaluation, typed DOM mutation, element/listener inspection,
  CSS injection/removal, event observation, and authorized raw JavaScript;
- native JavaScript dialogs, leave-site prompts, prefilled login, and ephemeral
  HTTP Basic Auth;
- viewport/element/region/full-page screenshots with tutorial annotations;
- programmatic console capture, mobile emulation, metadata-only network
  diagnostics, same-origin page API, and PDF export;
- typed xterm/WHM terminal discovery, bounded redacted buffer or scoped
  WebSocket-stream readback, fail-closed draft verification, background trusted
  input, special keys, and prompt/text/quiet waits;
- experimental, feature-detected page WebMCP discovery/invocation with R3
  authorization and untrusted-content labeling;
- MCP, CLI, and SDK batching plus single-action transactions that preserve
  action policy, audit, validation, reservation, and error semantics;
- authenticated loopback POSTs, durable sanitized audit, crash-safe
  idempotency journaling, per-hostname policy boundaries, and Native Host
  authority recovery after restart/sleep/browser update.

## Security and reliability additions

### Authenticated local control

Desktop Authority creates a per-user 256-bit bearer token outside the
repository. Only the content-free health GET is public; every control/session
POST is authenticated. Host, Origin, content-type, size, protocol, session, and
action validation remain independent checks.

### Durable audit and idempotency boundary

Sanitized audit is a bounded rotating JSONL record. The operation journal
writes a mutation as pending before dispatch and contains only hashes plus
lifecycle metadata. Pending work found after a process restart becomes unknown
and cannot be replayed under the same key. `invictum_transaction` and
cross-surface enhancement helpers make post-state, verification, timing, and
visual fingerprints one agent call without weakening the underlying action.

### Domain boundaries

The extension popup persists a policy for the active hostname: full Bridge
policy, observe only, safe R0/R1 interaction, trusted admin without terminal
input, or block. Current and destination URLs are checked. Incognito control is
denied. Chrome Site access, User Stop, restricted pages and explicit R2/R3
authorization remain final.

### Advanced bounded diagnostics

Frame topology and navigation history are URL-sanitized. Performance output is
aggregate and excludes resource URLs/bodies. Accessibility output is bounded
and value-redacted. Visual traces contain hashes rather than pixels; explicit
screenshot comparison returns a bounded visual diff. These diagnostics provide
pre/post evidence without turning network or browser-profile state into a data
extraction surface.

### Managed downloads

A new R2 start action accepts only credential-free HTTP(S) URLs, safe relative
filenames, an explicit user authorization, and a byte ceiling. Executable
extensions, path traversal, dangerous-file acceptance, and absolute-path
disclosure are blocked. Waiting is restricted to an IBB-managed ID for the same
tab. IBB never opens the result.

### Experimental page WebMCP

Chrome WebMCP is feature-detected and may be unsupported. Discovery output,
schemas, annotations, and results are marked untrusted because the page
controls them. Invocation is R3, frame/tool scoped, size/time bounded, cancelled
on timeout, omitted from audit payloads, and never automatically retried.

### Restart and long-running resilience

MCP and CLI start Desktop Authority when absent. The Chrome-launched Native
Host can also recover the exact built authority after login, sleep, process
failure, or a browser update. The full-path `test:soak` probe is read-only, and
the durable journal prevents reconnect from becoming mutation replay.

## Existing advanced adapters retained

- Revision-bound gesture APIs add hover, focus, blur, modifier-aware keys,
  deterministic Tab traversal, absolute scrolling, and drag/drop without
  claiming OS-trusted input.
- Metadata-only network capture excludes headers, bodies, cookies, POST data,
  query strings, fragments, and URL credentials.
- PDF export is bounded and supports common paper sizes, margins, scale,
  backgrounds, ranges, and CSS page size.
- The English extension UI retains Croatian IBB/IBG trigger aliases.
- The xterm adapter targets a detected terminal rather than arbitrary focused
  inputs, requires draft proof before Enter, and never auto-retries uncertain
  input.

## Evaluated and intentionally excluded

### Cookies, storage, cache contents, passwords, and autofill

Not exposed. These surfaces frequently contain credentials, tokens, personal
data, or cross-site tracking identifiers.

### Passive request/response bodies and headers

Not exposed. The separate authorized same-origin page API accepts an
agent-supplied request and returns a bounded/redacted response; it does not
reveal ambient browser traffic.

### Traffic interception or modification

Not added. Header rewriting, response replacement, proxying, and transparent
request blocking can silently change application semantics and bypass security
controls.

### Automatic browser permission approval

Camera, microphone, geolocation, notifications, dangerous download approval,
and similar browser prompts remain user-controlled.

### Arbitrary OS-level trusted input or DevTools UI automation

Not added to the extension protocol. Synthetic semantic input is deterministic,
revision-bound, and auditable. The terminal adapter is a narrow exception using
trusted CDP input only for a detected revision-bound terminal under R3.

### Deep cross-origin DOM control

Frame topology and frame-scoped accessibility inspection exist, but generic
cross-origin DOM mutation remains excluded until a complete frame-scoped
document/revision/reference and domain-policy model can fail closed.

### Full CDP performance traces and Lighthouse orchestration

Not embedded. Aggregate performance metrics, mobile emulation, console/network
metadata, screenshots, PageSpeed browsing, and PDF cover normal diagnostics
without transporting massive trace payloads or adding a Lighthouse runtime.

### Profile-wide bookmarks and download history

Not exposed. Managed downloads reveal only the IBB-started item for the same
tab, not the user's download database.

### Remote control or relay

Not included. Both local ports remain loopback-only; the current design is for
the signed-in local OS user.

## Future safe candidates

1. signed installer/update provenance and explicit Windows ACL verification;
2. enterprise-managed domain/policy import and export without secrets;
3. full frame-scoped semantic references for explicitly selected cross-origin
   frames;
4. durable, content-free accessibility baselines shared across client process
   restarts;
5. longer supervised soak suites that automate sleep/resume and Chrome-version
   matrix testing without page mutation.
