# Security

## Reporting a vulnerability

Use
[GitHub private vulnerability reporting](https://github.com/invictumhr/ai-invictum-browser-bridge/security/advisories/new)
to report a suspected vulnerability. Do not open a public issue and do not
include live credentials, cookies, tokens, private keys, private URLs, or
production page contents. Include the affected version, a minimal sanitized
reproduction, the security impact, and any proposed mitigation.

Detailed login/auth/dialog contracts are in
[AUTH_AND_DIALOGS.md](AUTH_AND_DIALOGS.md). Platform-specific safety rules are
in [WordPress wp-admin](docs/WORDPRESS_ADMIN.md),
[WordPress menus](docs/WORDPRESS_MENUS.md),
[terminal automation](docs/TERMINAL_AUTOMATION.md), and
[Figma support](docs/FIGMA.md).

## Current invariants

- Both the agent control API (`47820`) and Native Host WebSocket (`47821`) bind to `127.0.0.1`, not a public interface.
- The control API rejects non-loopback Host headers, every browser `Origin` header, and POST bodies that are not `application/json`. This blocks simple-request browser CSRF/DNS-rebinding paths while preserving local CLI/MCP/SDK clients.
- Native Messaging stdout contains framed protocol messages only. Sanitized operational logs go to stderr.
- Every relayed message must be valid IBP 1.0 with a consistent direction/type pair.
- Native messages are capped at 1 MiB by default; the offline queue is bounded.
- Native host manifests must allow one explicit unpacked extension ID.
- The extension requires `nativeMessaging`, `storage`, `alarms`, `activeTab`, `tabs`, `scripting`, `webRequest`, `webRequestAuthProvider`, and `debugger`. Auth and debugger capabilities are narrowly wrapped by the bounded R0/R1/R2/R3 actions described below. A reference-counted per-tab session prevents one adapter from detaching another; transient adapters release in `finally`, while console/device leases survive only until explicit or automatic cleanup.
- The extension requires HTTP/HTTPS host access so agents can open and operate a new domain without a per-domain toolbar gesture. Chrome's Details page remains the user/admin authority and can withhold site access. Restricted schemes remain denied.
- Cookies, authorization headers, stored credentials, and browser-profile files are never accessed. Page snapshots read only bounded semantic DOM data under Chrome's site-access controls. Snapshot elements expose only `hasValue`, never the current input/textarea value.
- `browser.authenticate_http` is R2 and requires an explicit-user-instruction reference. User-supplied Basic Auth credentials transit only through the local MCP/control, Desktop, Native Host, and extension message chain; they are not persisted, returned, or audited. The extension intentionally retains them only for one same-origin main-frame challenge and drops that reference in `finally`. Proxy and non-Basic challenges are not answered. JavaScript garbage collection cannot provide a cryptographic RAM-erasure guarantee.
- The Bridge cannot govern an external AI/MCP client's transcript or tool-argument retention. Users must treat credentials supplied to an agent as disclosed to that client even though Bridge audit/persistence excludes them.
- `browser.handle_javascript_dialog` is R2 and requires an explicit-user-instruction reference. It attaches Chrome debugger/CDP only to the reserved HTTP(S) tab for the duration of one bounded action, handles only `alert`, `confirm`, `prompt`, or `beforeunload`, then detaches in `finally`. Prompt text is never audited.
- `browser.set_file_input_files` is R2 because a page can react to file-input events with an immediate upload. Desktop Authority accepts only 1–20 absolute paths to existing readable regular files, canonicalizes them, and sends them only through the local in-memory transport to one short-lived `DOM.setFileInputFiles` call. Paths and filenames are excluded from results and audit; only count, target metadata and authorization source are recorded. The action never submits the form.
- WordPress read actions are bounded and omit nonces/action URLs. WordPress
  mutations are R2, require a current authoritative model plus an explicit user
  instruction, and verify the resulting editor/menu/list-table state. Batches
  do not weaken those checks.
- Terminal discovery is R0, bounded output readback is R2, and every terminal
  text/key action is R3. Raw commands/output are excluded from audit. Before a
  requested Enter, the exact draft must be observed in one approved source; on
  failure Enter is withheld and the adapter attempts to discard the line.
- Figma document/layer/property reads are R0 and return only the browser UI
  chrome, not hidden canvas/document data. Selection is R1 and verifies both a
  virtualized row index and its name to reduce stale-row mis-selection.
- `browser.evaluate` uses a bounded tab-scoped Chrome Runtime attachment, optionally creates an isolated execution world, embeds the already policy-approved expression directly into a fixed serialization wrapper, releases its object group and detaches in `finally`. It never calls `eval` or `Function`. Both desktop and extension independently accept only the exact allowlisted grammar; credential, storage, network, navigation, click, submit, event-handler and import/require capabilities remain denied.
- `browser.mutate_dom` is R2, revision-bound and explicitly authorized. Sensitive targets, internal bridge markers, executable/resource-loader mutation targets, event-handler/style/value/srcdoc/credential-like attributes, automatic resource attributes and unsafe URLs are denied. Inserted HTML removes scripts, stylesheets, frames, embeds, metadata, SVG resource/animation elements, handler attributes and unsafe/resource attributes. Inline style operations share the CSS network/credential-side-channel guard. Safe removal operations remain available. Raw text/HTML/style values are omitted from audit.
- `browser.manage_css` is R2 and explicitly authorized. CSS escapes/comments, external resource loads, `[value]`/`attr(...)` credential side channels, password-mask disabling and executable legacy constructs are denied. Exact CSS is kept only in `chrome.storage.session` for reliable removal after MV3 suspension, omitted from results/audit, and automatically removed on explicit unlock, lease expiry, User Stop or reauthorization.
- `browser.observe_events` is R0 but bounded to explicit event types, an optional fresh subtree and a maximum ring-buffer size. It returns semantic target and safe pointer/key metadata, never form values or arbitrary custom-event detail. Sequence numbers stay monotonic after buffer clears; unlock, lease expiry, User Stop and reauthorization stop abandoned capture.
- `browser.console` is R0 and captures at most 500 `Runtime.consoleAPICalled`, uncaught-exception and `Log.entryAdded` entries per tab. Remote objects are not expanded. Text and URLs are bounded and best-effort redacted for credential-like assignments, auth schemes and query secrets; raw console content is excluded from audit. Because page-controlled logs can still contain unexpected sensitive text, agents must not intentionally log credentials and should scope capture to the required diagnostic window.
- `browser.emulate_device` is reversible R1. It accepts bounded presets or width/height/DPR, orientation and touch state, but does not spoof credentials, storage, geolocation, network, CPU, a physical device identity or User-Agent Client Hints. Set/reset invalidates the agent's page-layout assumptions and requires a new snapshot. Cleanup always calls the CDP clear/touch-reset commands before releasing the debugger reference when the target still exists.
- `browser.inspect_element` returns bounded redacted attributes/styles/ancestry. Optional listener inspection uses one short-lived Debugger attachment and returns bounded, sanitized source excerpts rather than full scripts; query values/fragments and credential-like source assignments are redacted.
- `browser.execute_javascript` is an explicitly authorized R3 development escape hatch. Direct value/credential, cookie/storage, network, navigation, click/submit, dynamic-code, payment/OTP and extension references are denied, results are bounded/redacted, and source/results are excluded from audit. Static source checks are not a secure JavaScript sandbox, so this action is not suitable for untrusted source or sensitive production pages and must never be used to bypass another policy decision.
- `browser.screenshot` emits a bounded target-tab JPEG below 500 kB, binds it to the current document/DOM revision and CSS viewport, and excludes the image payload from audit. It prefers `captureVisibleTab`; a background/minimized-window fallback attaches Chrome Debugger only long enough to call `Page.captureScreenshot` and detaches in `finally`.
- `browser.click_at` is a last-resort R1 synthetic pointer/mouse fallback bound to that exact document/DOM revision. It rejects stale/out-of-viewport/overlay/disabled targets and applies the same direct and indirect submit/reset guards as semantic click.
- WebSocket heartbeat and reconnect do not bypass envelope validation.
- `browser.list_tabs` fails closed unless the desktop session context is explicitly authorized.
- `browser.list_tabs` is classified as R0 and produces an audit entry for success, failure, cancellation, or denial.
- The extension requires Chrome `tabs` permission before returning titles or URLs.
- `browser.open_tab` and `browser.navigate` accept only valid HTTP(S) URLs and reject embedded URL credentials. Navigation audit redacts credentials, query values and fragments.
- `browser.wait_for` is bounded by timeout/poll limits; raw text and selector conditions are represented by hashes rather than plaintext in audit.
- Scoped snapshots require an exact current `documentId`, `domRevision`, and `elementId`; stale subtree requests fail closed.
- URL credentials, all query values, fragments, and local file paths are redacted before tab metadata leaves the extension.
- Chrome-internal, extension, DevTools, file, and other non-web pages are marked `restricted`.
- Audit parameters are recursively sanitized; raw parameters are never retained by the in-memory sink.
- `browser.get_page_snapshot` is also classified as R0, fails closed without an authorized session, and emits success/failure/cancellation/denial audit results.
- The snapshot content script is injected on demand into Chrome's isolated world and communicates only through extension messaging; it does not use a page-world script or `window.postMessage`.
- Snapshot URLs redact credentials, every query value, fragments, and local paths before leaving the extension.
- Input and textarea values are never returned. Password, OTP, payment-card, token, secret, and credential-like controls are marked sensitive and their text is replaced with `[REDACTED]`. A boolean `hasValue` allows an agent to recognize that an explicitly authorized prefilled login form is ready without learning either credential.
- Hidden DOM is excluded by default, closed shadow roots and cross-origin frame DOM are not accessed, and output is bounded by schema-enforced element/depth/text limits plus the 1 MiB transport cap.
- `browser.find_elements` is R0 and requires an exact snapshot document/revision. Stale references fail closed, regex is bounded, and raw criteria are omitted from audit.
- `browser.click` and `browser.type_text` are R1, require Chrome site access plus an exact element revision, and invalidate the old revision on success.
- Chrome's scripting API remains the final authority for every target tab. Required HTTP(S) host patterns avoid repeated per-domain prompts but do not bypass Chrome's user/admin site-access setting or restricted-scheme checks.
- The toolbar action is not a normal permission workflow. It explicitly clears a prior User Stop block; it never reserves a tab by itself.
- Ordinary clicks cannot target native submit/reset controls and standard indirect submit/reset events are intercepted. `browser.submit_form` is a separate R2 action requiring an explicit-user-instruction reference and mandatory post-action verification; sensitive text inputs remain blocked.
- Typed text is never returned; audit stores only character count, mode, and element/revision metadata.
- Every isolated-world injection removes its prior registered listener when present and installs a fresh listener. This avoids both duplicate handlers and stale-listener suppression after an unpacked-extension reload.
- A controlled tab is visibly marked by a tab-scoped toolbar badge and an isolated Shadow DOM overlay. The overlay exposes only connection/control state and never prompt, page, or session contents.
- The first targeted agent command creates the reservation automatically. `browser.unlock_tab` is an audited R0 completion request with a persisted 20-second release grace; a new targeted command cancels that pending release, while a repeated unlock is idempotent. A separate 30-second inactivity lease removes abandoned non-blocked reservations. Final grace/lease expiry cleans temporary CSS, event and console captures, resets device emulation and releases debugger sessions through a per-tab release barrier. User Stop and toolbar reauthorization remain immediate and are never delayed by the grace period.
- The overlay **Stop** action blocks every targeted snapshot/find/interaction/submit/evaluate command for that tab until a new explicit toolbar authorization. The blocked state survives MV3 service-worker suspension in `chrome.storage.session`.
- Invictum-owned overlay nodes and overlay-only mutations are excluded from snapshot output, element search, and DOM revision tracking.
- Agents must prefer semantic typed actions, then the constrained JavaScript grammar, and use screenshot/coordinate click only when neither provides a stable path. Coordinate clicks cannot be used to route around a policy denial.

The local HTTP control API and WebSocket are development transports and do not yet authenticate a local process. Until desktop pairing/authentication is implemented, do not expose either port, bind either server to a non-loopback interface, or use this build for sensitive production browser control.

## Required future controls

Before this build can be considered production-capable, operations must additionally pass persistent session authorization, user-configured domain policy, robust action-effect classification, confirmation policy, tab locking, and post-action validation. A JavaScript click handler can do more than its HTML element type suggests, so do not use the development R1 path on real administrative, financial, or destructive workflows.

Report suspected vulnerabilities privately to the project owner. Do not include secrets, cookie values, private keys, or production page contents in a report.
