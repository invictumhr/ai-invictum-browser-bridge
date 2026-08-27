# Phase 2 progress

> Historical record: this progress log predates the current WordPress, Figma,
> WHM/cPanel terminal, and advanced diagnostics surfaces. See
> [../README.md](../README.md), [README.md](README.md), and runtime
> `system.capabilities` for the current contract.

## Completed vertical slice: `browser.list_tabs`

- typed request, response, and tab metadata contracts
- strict Zod validation and correlation
- existing request timeout path and structured error mapping
- required Chrome `tabs` permission and all-HTTP(S) site access, with no per-domain toolbar gesture
- all URL query-value, credential, fragment, and local-path redaction
- restricted-page markers
- fail-closed desktop policy evaluation (`R0` for authorized sessions)
- recursively sanitized in-memory audit entries
- unit and transport-level integration tests
- real-Chrome smoke harness at `tests/integration/dist/chrome-list-tabs-smoke.js`

## Completed vertical slice: `browser.get_page_snapshot`

- typed input, response, semantic element, frame, form, dialog, alert, text-block, and metadata contracts
- strict Zod validation with safe defaults and hard element, depth, and text limits
- authorized desktop request path with timeout, structured error mapping, R0 policy evaluation, and sanitized audit
- on-demand isolated-world `content.js`; no page-world bridge or `window.postMessage`
- visible semantic and interactive content by default, stable document/revision-bound element references, open shadow roots, and same-origin iframe traversal
- inaccessible frame metadata without cross-origin DOM access
- universal URL query-value, credential, fragment, and local-path redaction
- input and textarea values omitted; password, OTP, payment, token, and credential-like fields marked sensitive and redacted
- boolean `hasValue` indicates prefilled controls without exposing any value
- unit and transport-level integration coverage plus a deterministic local fixture
- real-Chrome smoke test proving URL redaction, sensitive-field classification, hidden-content exclusion, frame traversal, and `R0/success` audit

## Implemented vertical slice: `browser.find_elements`

- exact snapshot `documentId` and `domRevision` are mandatory
- AND-composed criteria cover text, bounded regex, role/name/label, attributes, CSS, XPath, test ID, frame, proximity, table cell, and ancestor context
- deterministic score ordering, bounded results, original snapshot element IDs, and fail-closed stale-reference errors
- raw search strings and regexes are omitted from audit; only criterion names and bounded options are retained
- R0 policy, structured errors, unit/transport integration, and real-Chrome harness coverage

## Implemented vertical slices: `browser.click` and `browser.type_text`

- exact revision-bound element references are mandatory and success always requires a fresh snapshot
- click validates visible/enabled/clickable state, scrolls into view when requested, and is R1
- ordinary click denies native submit/reset controls and intercepts standard indirect submit/reset events
- text input supports replace/append/clear, cross-realm native setters/events, textareas, contenteditable/WYSIWYG controls, and accessible same-origin frames
- typed text is never returned or audited; only length/mode metadata is retained
- sensitive text fields are denied until explicit confirmation support exists
- inactive tabs work only when Chrome accepts an existing tab-scoped `activeTab` grant or persistent HTTP(S) host permission; rejected injection fails closed
- the first targeted command automatically reserves the tab and shows a stable per-tab `AI` badge plus isolated page overlay; optional R0 `browser.set_control_identity` changes the default **AI agent is using this tab** label to a sanitized name such as **Codex is using this tab**, persisted for that reservation; `browser.unlock_tab` starts a persisted, cancellable 20-second release grace, while a 30-second inactivity fallback handles abandoned work
- the toolbar settings popup persists a **background** (initial default) or **foreground** activation preference; omitted `active` honors it while explicit per-call booleans override it
- **Stop** persists a fail-closed tab block until explicit reauthorization from the toolbar popup; opening settings or reauthorizing alone does not reserve the tab
- Invictum-owned UI and UI-only mutations are omitted from snapshots, semantic search, and DOM revision changes
- R1 policy, structured errors, unit/transport integration, and a combined real-Chrome form harness

## Implemented advanced form and policy-constrained fallback slices

- `browser.select_option`, `browser.check`, and `browser.uncheck` are revision-bound R1 interactions with value-free audit metadata
- `browser.submit_form` is R2 and requires an `explicit_user_instruction` reference; it does not add a redundant prompt and always requires post-submit verification
- `browser.evaluate` is R2 and requires the same authorization assertion; its strict expression grammar supports only bounded DOM reads and a small allowlist of DOM mutations
- credential, storage, network, navigation, click, submit, event-handler, dynamic-code, and unknown JavaScript capabilities fail closed
- JavaScript source and result are excluded from audit; audit records source SHA-256, length, mode, world, and result type
- deterministic unit, transport, and advanced real-Chrome harness coverage is included
- `browser.set_file_input_files` is a revision-bound R2 action for 1–20 verified absolute local file paths; it supports single/multiple and hidden native file inputs through short-lived tab-scoped CDP, returns no paths/names, never submits the form, and excludes paths from audit

## Implemented advanced DOM, CSS and page-runtime diagnostics

- `browser.mutate_dom` is revision-bound R2 with ordered typed text/attribute/inline-style/sanitized-HTML/removal operations, sensitive/resource-target and CSS side-channel guards, safe removal support and content-free audit metadata
- `browser.inspect_element` returns redacted attributes, inline/computed CSS, geometry, ancestry and custom-element identity; optional short-lived CDP inspection adds direct/subtree/delegated listener metadata and bounded sanitized source excerpts
- `browser.manage_css` adds/removes bounded AUTHOR/USER CSS, denies external loads, credential side channels and legacy executable CSS, stores exact cleanup state in `chrome.storage.session` and removes remaining injections on unlock, lease expiry, User Stop or reauthorization
- `browser.observe_events` provides a subtree-scoped bounded ring buffer for standard/custom DOM events without returning form values, sensitive keystrokes or arbitrary custom detail
- `browser.execute_javascript` is an explicitly authorized R3 short-lived `Runtime.evaluate` escape hatch with bounded by-value results and fail-closed direct sensitive/network/navigation/click/submit/dynamic-code patterns; it is documented as not being a security sandbox
- Desktop/control/MCP support all five actions, sanitizes their audits, and exposes dedicated tools plus runtime feature flags
- deterministic kitchen-sink coverage includes a JS-generated delegated dropdown, listener source discovery, scoped event capture, DOM/HTML sanitization, inline/computed CSS, CSS add/remove, raw expression/function execution and protected-source denial

## Implemented visual fallback slice

- `browser.screenshot` captures only the visible active target tab as a bounded JPEG and returns image dimensions plus CSS viewport, document ID, and DOM revision metadata
- raw screenshot bytes never enter audit; only bounded capture metadata is retained
- `browser.click_at` accepts viewport CSS coordinates only against that exact document/revision, performs same-origin frame hit-testing, and invalidates the revision after success
- overlay, stale, outside-viewport, invisible/disabled, and direct or indirect submit/reset targets fail closed
- semantic typed actions remain first choice, advanced inspection/typed DOM-CSS tools are next, constrained/raw JavaScript are bounded fallbacks, and visual coordinate interaction is the final fallback

## Implemented agent ergonomics and persistent-control slice

- loopback-only HTTP control API on port 47820 coexists with the Native Host WebSocket on 47821, so an agent no longer owns or replaces the authority
- CLI and stdio MCP adapters automatically start the built authority when it is offline
- TypeScript Agent SDK provides a stable session context, generic calls, session close, and `withReservedTab()` cleanup
- `system.capabilities` reports exact runtime actions, risk levels, extension version, and feature flags
- `browser.open_tab` and `browser.navigate` validate credential-free HTTP(S) URLs and sanitize navigation audit data
- `browser.wait_for` supports URL, title, selector, text, and stable-DOM conditions without agent polling
- scoped semantic snapshots return a fresh element subtree instead of the complete page
- session close best-effort unlocks all tracked tabs
- MCP exposes dedicated browser tools and emits screenshots as image content rather than large text payloads

## Implemented login and native-dialog slice

- explicitly authorized prefilled HTML login uses existing `browser.submit_form`; `hasValue` lets the agent verify readiness without reading username/password
- `browser.get_http_auth_state` reports a recent sanitized challenge origin/scheme/realm without credentials
- `browser.authenticate_http` is R2, supports one same-origin main-frame Basic attempt, rejects proxy/non-Basic challenges, removes retained credentials in `finally`, and excludes username/password from result and audit
- `browser.handle_javascript_dialog` is R2 and handles one `alert`, `confirm`, `prompt`, or `beforeunload` through a short-lived tab-scoped CDP attachment
- click/navigation can be included as the dialog trigger, so CDP is armed before the page blocks; the adapter always detaches in `finally`
- `browser.open_tab` and `browser.navigate` support `waitUntil: "none"` for pages that intentionally stop on an HTTP auth challenge
- MCP exposes dedicated auth-state, authenticate, and JavaScript-dialog tools; runtime capabilities advertise all three feature flags
- deterministic unit tests cover credential attempt bounds and debugger cleanup; transport integration proves credentials and prompt text do not enter audit; a real-Chrome auth/dialog smoke harness is built

## Known limitations

- Session authorization is supplied by an explicit development context; persistent session management arrives in Phase 3.
- Audit storage is in memory and intentionally does not log returned tab titles or URLs.
- Persistent domain policy UI and authenticated process pairing are not implemented yet.
- `browser.get_active_tab`, download management, OS-level trusted cursor input, persistent console/network tracing, and the broader interaction catalog are not implemented yet.
- Full-page `raw_dom` serialization is intentionally unsupported; snapshots expose bounded semantic data, while revision-bound typed DOM mutation and bounded listener source excerpts cover targeted diagnostics.
- This development build has no persistent domain allowlist, tab lock, or user-confirmation UI. Do not use R1 interactions on sensitive or production pages yet.

The ordered sequence from runtime discovery through open/navigate/wait, scoped semantic interaction, advanced forms, explicitly authorized submit/login, bounded native dialogs, and guaranteed unlock is implemented. Direct sensitive-field reads/writes remain fail-closed; only prefilled submit and the dedicated ephemeral Basic Auth path are permitted. The next safety-critical milestone is authenticated persistent Phase 3 session/domain authority UI.
