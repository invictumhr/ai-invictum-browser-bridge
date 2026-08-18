# Architecture

## Authority boundary

The Desktop Authority is the single policy and audit boundary. MCP, CLI, and custom agents never talk directly to Chrome or Native Messaging.

```text
MCP / CLI / Agent SDK
          |
          | HTTP JSON, 127.0.0.1:47820
          v
Desktop Authority (session context, policy, audit, tab ownership)
          |
          | IBP 1.0 JSON, ws://127.0.0.1:47821/native
          v
Native Messaging host (transport only)
          |
          | 4-byte little-endian length + UTF-8 JSON
          v
Chrome MV3 extension (browser enforcement)
```

The Native Host validates envelopes, bounds messages and reconnects, but makes no browser or policy decisions. The Desktop Authority validates session authorization, classifies risk and sanitizes audit records. The extension independently enforces Chrome Site access, restricted schemes, sensitive inputs, stale references, submit guards, JavaScript/DOM/CSS bounds, screenshot/coordinate bounds, reservations and User Stop.

## Agent control API

The persistent control server exposes loopback-only endpoints:

- `GET /v1/health`: authority and Native Host connection state;
- `POST /v1/call`: one action, parameters and stable agent/session context;
- `POST /v1/session/close`: best-effort unlock of every tab tracked for a session.

MCP and CLI are thin clients of this API and automatically start the built authority when the endpoint is offline. They do not steal port 47821 or replace the running authority with a test harness. The TypeScript Agent SDK provides the same calls and `withReservedTab()` cleanup.

## Browser operation model

`system.capabilities` returns the exact extension version, supported actions, risk levels and feature flags. `browser.open_tab` and `browser.navigate` accept only credential-free HTTP(S) URLs. `browser.wait_for` performs bounded condition waiting inside the bridge. Snapshot scoping returns only a fresh revision-bound element subtree when the full page is unnecessary.

Canvas terminals use a separate revision-bound path: an isolated fixed probe
detects xterm roots, a fixed CDP routine reads only a bounded active/scrollback
buffer, and Chrome trusted input targets the terminal helper without activating
the tab implicitly. If a vendor hides its xterm buffer, an action-local listener
can identify exactly one WebSocket that received the exact staged draft and can
return only its bounded, redacted response stream. Submit fails closed before
Enter when neither the buffer nor that unique transport proves draft delivery.
General network diagnostics remain metadata-only, and raw terminal frames are
discarded in `finally`. The response distinguishes draft and output-delivery
verification states; discovery also returns a content-free document-coordinate
screenshot region for bounded canvas capture. Desktop Authority remains the
policy/audit boundary: detection is R0, readback is R2, and every terminal
text/key action is R3. Command content is represented in audit only by hash and
length.

Tab-scoped commands are delivered to the top frame only. `chrome.tabs.sendMessage`
without a frame reaches every frame that has a listener and resolves with
whichever answers first, so a small helper iframe — Figma's `plugin-sandbox` is
one — could win the race and answer for the page. Element references live in the
top frame's content script, which walks same-origin child frames itself, so the
top frame is the only correct recipient.

Agent tabs are created in a window of the agent's own, made unfocused on first
use and remembered in `chrome.storage.session`. The agent may switch tabs inside
that window but the Bridge never raises it, so agent work cannot displace or
cover what the user is doing. Chrome refusing a new window falls back to ordinary
tab creation.

Snapshot visibility filtering distinguishes an element that does not render from
one that stops its whole subtree rendering. Only `display: none`, `opacity: 0`,
the `hidden` attribute, `content-visibility: hidden`, and a clipping zero-sized
box skip a subtree; `visibility: hidden` and plain zero-sized layout wrappers
such as `display: contents` are walked through. `hiddenSubtreesSkipped` reports
how many subtrees were skipped so an empty snapshot is explainable rather than
silently wrong.

Figma is read through a typed adapter over its DOM chrome, anchored on
`data-testid` where Figma ships one and on role plus accessible name elsewhere,
never on hashed CSS module classes. Its inspector values come from input
controls, which the generic snapshot never returns, so the adapter carries its
own credential guard.

The first targeted operation automatically reserves a tab. The extension shows a tab-scoped badge and isolated Shadow DOM overlay whose active/idle presentation is intentionally identical, preventing rapid commands from flashing the UI. Every operation refreshes the lease. `browser.unlock_tab` persists a cancellable 20-second release request; a new command cancels it, while a 30-second inactivity lease remains crash cleanup. Release is serialized per tab so cleanup cannot race the next command. **Stop** writes a fail-closed tab block to `chrome.storage.session` and cleans immediately; only an explicit toolbar action clears that block. Final unlock-grace expiry, lease expiry, User Stop and toolbar reauthorization clean temporary CSS/event/console/network resources, reset device emulation and release its debugger reference. Invictum UI is excluded from page snapshots, search and DOM revision tracking.

Typed DOM mutation and value-redacted event capture execute in the isolated content runtime. DOM HTML/style mutation and page-wide CSS share resource-load and credential-side-channel guards. CSS uses `chrome.scripting.insertCSS/removeCSS` and persists only the exact cleanup record in `chrome.storage.session`. All debugger-backed operations acquire a reference to one tab-scoped `ChromeDebuggerSessionManager`; transient actions release after `finally`, while console capture, metadata-only network capture, and mobile emulation retain their reference only until `stop`/`reset` or automatic cleanup. This allows screenshots, upload, PDF export, JavaScript, listener inspection, and dialogs to coexist with agent diagnostic modes without detach races. Constrained evaluation creates an isolated CDP world when requested and directly compiles the policy-approved expression inside a fixed serializer, avoiding MV3-forbidden dynamic `eval`. A visible DevTools window remains a separate debugger client and can conflict. All paths remain behind the same reservation, policy, audit and User Stop boundary.

Snapshot elements expose `hasValue` but never the input value. This lets an explicitly authorized agent submit an already-prefilled login form without learning credentials. HTTP Basic Auth uses a dedicated R2 path: the extension records a recent sanitized main-frame challenge, accepts user-supplied credentials for one same-origin Basic attempt, and drops its retained reference in `finally`. Native `alert`/`confirm`/`prompt`/`beforeunload` uses a second R2 path: the extension attaches CDP to one reserved tab immediately before an optional click/navigation trigger, handles one dialog, then detaches.

## IBP 1.0

Every envelope contains protocol/version, message ID, session ID, ISO timestamp, direction, type, payload, optional correlation ID, and optional sequence. Direction and type must agree:

- request -> `ibp.request` with a validated `ProtocolRequest`;
- response -> `ibp.response` with correlation ID and validated `ProtocolResponse`;
- event -> `ibp.event` with validated `ProtocolEvent`.

The protocol supports bounded timeouts, retry metadata, risk context and idempotency keys. Screenshot content is returned only to the caller and omitted from audit.

## Remaining production work

The current local developer build still lacks authenticated process pairing, persistent audit/session storage, a user domain-policy UI, packaged installation, OS-level input, arbitrary/general-purpose DevTools UI control, download management, and an encrypted remote relay. Programmatic bounded console capture and viewport/touch emulation are implemented; they intentionally do not open the visible DevTools UI or impersonate a physical device. Loopback binding is mandatory until pairing/authentication exists.
