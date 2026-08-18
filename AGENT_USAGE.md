# Invictum Browser Bridge — agent usage guide

This is the authoritative operating guide for starting, diagnosing, using, and
developing Invictum Browser Bridge (IBB). Read it before the first browser
action.

The phrases `use IBB`, `use IBG`, `use Invictum Browser Bridge`, and
`use Invictum Browser Gate` are equivalent. Croatian equivalents beginning
with `koristi` are also recognized triggers. The short discovery contract is
[AGENT_TRIGGER.md](AGENT_TRIGGER.md).

Specialized references:

- [AUTH_AND_DIALOGS.md](AUTH_AND_DIALOGS.md)
- [docs/FILE_UPLOAD.md](docs/FILE_UPLOAD.md)
- [docs/WORDPRESS_MENUS.md](docs/WORDPRESS_MENUS.md)
- [docs/WORDPRESS_ADMIN.md](docs/WORDPRESS_ADMIN.md)
- [docs/ADVANCED_BROWSER_TOOLS.md](docs/ADVANCED_BROWSER_TOOLS.md)
- [docs/SCREENSHOTS_AND_ANNOTATIONS.md](docs/SCREENSHOTS_AND_ANNOTATIONS.md)
- [docs/DEVTOOLS_CONSOLE_AND_MOBILE.md](docs/DEVTOOLS_CONSOLE_AND_MOBILE.md)
- [docs/ADVANCED_AGENT_CAPABILITIES.md](docs/ADVANCED_AGENT_CAPABILITIES.md)
- [docs/AGENT_PRODUCTIVITY_ACTIONS.md](docs/AGENT_PRODUCTIVITY_ACTIONS.md)
- [docs/MCP_AGENT_ERGONOMICS.md](docs/MCP_AGENT_ERGONOMICS.md)
- [docs/CAPABILITY_AUDIT.md](docs/CAPABILITY_AUDIT.md)

## 1. Non-negotiable rules

1. Prefer the `invictum_*` MCP tools. If they are unavailable, use the local
   CLI, SDK, or loopback control API. Never connect directly to Native
   Messaging or the extension.
2. Start every agent session with `invictum_ping`, then
   `invictum_capabilities`. Runtime capabilities are the source of truth.
3. Use `open_tab` for a new page and `navigate` for an existing tab. Omit
   `active` unless the task genuinely requires the user to see or focus the
   tab. Background tabs support semantic actions, screenshots, diagnostics,
   mobile emulation, and PDF export.
4. The first targeted command automatically reserves the tab and shows
   **AI agent is using this tab**. Optionally set a safe identity such as
   `Codex`, `Cursor`, or `Claude`.
5. Always release tabs in `finally` with `unlock_tab`, or call
   `invictum_end_session` once for all tabs reserved by the session.
6. Prefer `snapshot -> find -> typed action`. Use element inspection and event
   observation for custom widgets. Use constrained evaluation before
   authorized raw JavaScript. Use screenshots and coordinates last.
7. After a mutation, reuse only the returned `domRevisionAfter` and
   `resolvedElementId` for that same target. Refresh all other references.
8. Never read password, OTP, payment, token, or credential-like values.
   Prefilled login may be submitted only when the user explicitly requested
   login and the snapshot reports `hasValue: true`.
9. Submit, upload, destructive WordPress actions, dialog decisions, HTTP Auth,
   page mutation, and raw JavaScript require the documented authorization.
10. Respect User Stop, Site access, restricted pages, and policy denials. Never
    bypass them with another automation surface.
11. Do not kill unknown processes on ports `47820` or `47821`. CLI and MCP
    start or repair Desktop Authority automatically.

## 2. Architecture and ports

```text
Agent / MCP / CLI / SDK
          |
          v
Desktop Authority control API 127.0.0.1:47820
          |
          v
Native Messaging authority 127.0.0.1:47821
          |
          v
Chrome Native Host -> extension -> selected tab
```

- `47820` is the persistent agent-facing loopback control API.
- `47821` belongs to Desktop Authority and the Native Host.
- Both listeners are loopback-only.
- The extension ID is installation-specific; never hard-code an ID from an
  unrelated profile.
- Source: `D:\laragon\www\invictum\invictum-browser-bridge`
- Loaded extension:
  `D:\laragon\www\invictum\invictum-browser-bridge\apps\extension\dist`

## 3. MCP workflow

MCP is the preferred surface for Codex, Cursor, and Claude.

```text
invictum_ping
invictum_capabilities
invictum_list_tabs or invictum_open_tab
invictum_set_control_identity (optional)
invictum_snapshot
invictum_find_elements
typed work
invictum_wait_for / snapshot / screenshot / PDF verification
invictum_unlock_tab in finally
```

Important MCP tools:

- `invictum_open_tab`, `invictum_navigate`, `invictum_go_back`,
  `invictum_go_forward`, `invictum_activate_tab`, `invictum_close_tab`
- `invictum_snapshot`, `invictum_get_page_text`,
  `invictum_find_elements`, `invictum_find_natural_language`,
  `invictum_wait_for`
- `invictum_click`, `invictum_type_text`, `invictum_select_option`
- `invictum_check`, `invictum_uncheck`, `invictum_submit_form`
- `invictum_set_file_input_files`
- `invictum_perform_gesture`
- `invictum_get_wordpress_menu`, `invictum_edit_wordpress_menu`
- `invictum_get_wordpress_admin`, `invictum_wordpress_list_table_action`
- `invictum_get_wordpress_editor`, `invictum_edit_wordpress_editor`
- `invictum_inspect_element`, `invictum_observe_events`
- `invictum_mutate_dom`, `invictum_manage_css`
- `invictum_evaluate`, `invictum_execute_javascript`
- `invictum_page_api_request` for explicitly authorized same-origin APIs
- `invictum_console`, `invictum_network`, `invictum_emulate_device`
- `invictum_screenshot`, `invictum_click_at`, `invictum_print_to_pdf`
- `invictum_get_http_auth_state`, `invictum_authenticate_http`
- `invictum_handle_beforeunload`, `invictum_handle_javascript_dialog`
- `invictum_unlock_tab`, `invictum_end_session`
- `invictum_batch` for up to 25 sequential, policy-checked actions
- `invictum_call` only for a capability that has no dedicated MCP wrapper

For mutating tools, prefer a stable `idempotencyKey`; add `dryRun` before a
risky change, and use `postSnapshot`, `domDelta`, or `verify` to avoid separate
agent round trips. MCP, CLI raw calls/batches, and SDK `enhancedCall()` share
this orchestration. `verify` runs before the final snapshot. When `domDelta`
has no cached baseline it attempts a bounded pre-action snapshot, and otherwise
returns an explicit unavailable reason. Add `timings: true` only when measuring
phase latency. Screenshot `autoMarks` creates a numbered set-of-marks image plus
element mapping. Elicitation-capable MCP clients can present R2/R3 approval,
while other or non-responsive clients receive structured
`CONFIRMATION_REQUIRED` details after a bounded confirmation wait. Safe R0/R1
stale relocation preserves the caller's logical idempotency key internally, and
`domDelta` matches stable frame/CSS identities rather than revision-specific
element IDs. See
[docs/MCP_AGENT_ERGONOMICS.md](docs/MCP_AGENT_ERGONOMICS.md).

The MCP server advertises IBB/IBG aliases during initialization. Global and
project-level MCP configuration may coexist; preserve unrelated servers when
editing configuration.

## 4. CLI workflow

Build once:

```powershell
pnpm build
```

Health and discovery:

```powershell
pnpm browser health
pnpm browser ping
pnpm browser capabilities
pnpm browser list-tabs
```

Common commands:

```powershell
pnpm browser open https://example.com
pnpm browser navigate 42 https://example.com/next
pnpm browser back 42
pnpm browser forward 42
pnpm browser identify 42 Codex
pnpm browser snapshot 42 outline
pnpm browser text 42 50000 markdown
pnpm browser natural 42 "Update button"
pnpm browser find 42 button "Save"
pnpm browser click 42 <elementId>
pnpm browser type 42 <elementId> "text"
pnpm browser wait 42 selector "#ready"
pnpm browser unlock 42
pnpm browser close-session
```

Do not add `--active` merely for visibility or debugging. `open` and
`navigate` without an activation flag honor the user's toolbar default.

Advanced shorthand:

```powershell
pnpm browser hover 42 <elementId>
pnpm browser focus 42 <elementId>
pnpm browser press 42 <elementId> ArrowDown
pnpm browser press 42 <elementId> s --ctrl --shift
pnpm browser double-click 42 <elementId>
pnpm browser context-click 42 <elementId>
pnpm browser drag 42 <sourceId> <targetId>
pnpm browser scroll-by 42 0 800
pnpm browser scroll-xy 42 0 1200
pnpm browser console 42 start
pnpm browser network 42 start
pnpm browser mobile 42 mobile_medium portrait
pnpm browser screenshot 42 page.jpg --full-page
pnpm browser tutorial-screenshot 42 <elementId> "Click this button" tutorial.jpg
pnpm browser pdf 42 report.pdf
pnpm browser api 42 /wp-json/wp/v2/posts/123 PATCH --stdin --wp-nonce --instruction user-edit-post
pnpm browser desktop 42
```

Run a sequential batch through stdin:

```powershell
@'
{
  "steps": [
    {"id":"open","action":"browser.open_tab","parameters":{"url":"https://example.com"}},
    {"id":"text","action":"browser.get_page_text","parameters":{"tabId":"$steps.open.tab.tabId"}}
  ]
}
'@ | pnpm browser batch --stdin
```

For arbitrary strict action parameters, send UTF-8 JSON through stdin:

```powershell
'{"tabId":42,"detail":"outline"}' |
  pnpm browser call browser.get_page_snapshot --stdin
```

Raw calls accept shared orchestration flags:

```powershell
'{"tabId":42,"documentId":"doc","domRevision":7,"elementId":"save"}' |
  pnpm browser call browser.click --stdin `
    --dry-run `
    --post-snapshot outline `
    --dom-delta `
    --verify '{"condition":{"type":"text","value":"Saved"}}' `
    --timings `
    --idempotency-key save-once
```

`--auto-marks '{"label":"name","max":12}'` is also available for
`browser.screenshot`. Batch steps accept the equivalent `dryRun`,
`postSnapshot`, `domDelta`, `verify`, `autoMarks`, `timings`, and
`idempotencyKey` keys.

This avoids PowerShell quoting problems. Stdin is limited to 1 MiB. Never put
passwords, prompt responses, or other secrets in argv where shell history and
process inspection can expose them.

CLI JSON is compact by default. Add `--pretty` for human reading. The CLI keeps
short-lived per-session reference state, carries the latest
`documentId`/`domRevision`, and performs at most one unique stale-reference
relocation retry. Separate concurrent agents should use distinct
`INVICTUM_SESSION_ID` values.

## 5. SDK and control API

The SDK offers `withReservedTab()`, `batch()`, and `closeSession()` helpers.
Use `call()` for a strict one-to-one control API action. Use `enhancedCall()`
for shared `dryRun`, `postSnapshot`, `domDelta`, `verify`, `autoMarks`,
`timings`, idempotency, and safe R0/R1 stale-reference relocation:

```ts
const result = await client.enhancedCall("browser.click", {
  tabId,
  documentId,
  domRevision,
  elementId,
  postSnapshot: "outline",
  domDelta: true,
  verify: { condition: { type: "text", value: "Saved" } },
  timings: true,
  idempotencyKey: "save-once",
});
```

`withReservedTab()` releases its tab in `finally`; use `closeSession()` at the
end of a multi-tab workflow. `batch()` resolves exact `$steps.<id>.<path>` and
`$last.<path>` placeholders, stops on the first error by default, and still
routes every step through normal validation, policy, reservation, and audit.
Batch steps also accept all `enhancedCall()` orchestration keys.

Control API endpoints:

- `GET http://127.0.0.1:47820/health`
- `POST http://127.0.0.1:47820/v1/call`
- `POST http://127.0.0.1:47820/v1/session/close`

Each action request includes a stable context:

```json
{
  "context": {
    "sessionId": "agent-session",
    "agentId": "codex",
    "clientId": "custom-client",
    "sessionAuthorized": true
  },
  "action": "browser.get_page_snapshot",
  "parameters": {
    "tabId": 42,
    "detail": "outline"
  }
}
```

Maximum request body size is 1 MiB. The API has no network authentication
because it is a local development channel; never expose it beyond loopback.

- HTTP 400: malformed envelope or parameters.
- HTTP 409: policy, reservation, runtime, or browser failure.
- `error.details.stage` distinguishes `parameters`, `extension_result`, and
  `desktop_result`.

## 6. Startup, health, and repair

The CLI and MCP launcher:

1. check `127.0.0.1:47820/health`;
2. start the built Desktop Authority if it is absent;
3. wait for the Native Host and extension to reconnect;
4. confirm the full round trip with `system.ping`.

Manual diagnostics:

```powershell
pnpm browser health
pnpm browser ping
pnpm browser capabilities
Get-NetTCPConnection -LocalPort 47820,47821 -ErrorAction SilentlyContinue
```

`health` proves that the daemon exists. Only `ping` proves the complete
Desktop -> Native Host -> Chrome extension round trip.

If `nativeConnected` is false:

1. confirm Chrome is running;
2. confirm the unpacked extension is enabled;
3. inspect the extension service-worker console;
4. verify Native Messaging installation;
5. rebuild if source changed;
6. ask the user to Reload only when `apps/extension/dist` changed.

Never start a second authority when an existing healthy authority owns the
ports.

## 7. Site access and restricted pages

The extension declares required HTTP(S) host access, so normal navigation to a
new domain does not require a toolbar click. If the user or administrator
narrows Chrome Site access, the Bridge returns `PERMISSION_DENIED` with the
tab and origin. Do not bypass it.

Unsupported/restricted targets include:

- `chrome://`
- `edge://`
- `devtools://`
- Chrome Web Store
- extension pages
- other browser-restricted pages
- `file://` in the browser protocol

The toolbar popup controls the default tab activation mode:

- **Work in the background** — initial and recommended.
- **Activate the agent tab** — opt-in foreground behavior.

An explicit `active: true` or `active: false` overrides the setting for one
open/navigation call.

`browser.go_back` and `browser.go_forward` never activate a tab.
`browser.activate_tab` is the only dedicated foreground action. Use it only
when the user asked to see/focus the tab or an interaction genuinely requires
foreground focus; snapshots, screenshots, diagnostics, mobile emulation, PDF,
text extraction, API calls, and normal interaction do not.

## 8. Reservation, identity, and User Stop

- The first targeted action reserves the tab.
- The toolbar badge becomes `AI`.
- The page overlay shows **AI agent is using this tab** and **Stop**.
- `browser.set_control_identity` changes only the safe agent name.
- Accepted names contain 1–40 letters/numbers plus spaces and `. _ + -`.
- HTML, control characters, and arbitrary messages are rejected.
- Rapid commands do not flash the overlay.
- `unlock_tab` starts a persisted, cancellable 20-second release grace.
- A new targeted command during the grace cancels release.
- A 30-second inactivity lease cleans abandoned reservations.
- Final release removes temporary CSS, event observers, console/network
  capture, and device emulation, then releases debugger references.
- User **Stop** blocks all targeted commands immediately and persists across
  MV3 service-worker suspension.
- Only the toolbar popup's explicit reauthorization clears the block.

## 9. Semantic snapshots and references

Snapshot detail levels:

- `outline` — interactive controls with minimal state; best default for
  find/action loops.
- `minimal`
- `interactive`
- `semantic`
- `full`

Scoped snapshots can return a subtree under a current element reference.

Absent boolean defaults in compact output:

- absent `visible`/`enabled` means `true`;
- absent other boolean states means `false`;
- absent `checked`/`selected` means not applicable.

Read truncation fields carefully:

- `matchesTruncated`: more matches exist than were returned.
- `scanTruncated`: the page scan itself hit a limit.
- `truncationReasons`: exact limits encountered.
- `truncated`: compatibility aggregate.

References are bound to `documentId` and `domRevision`. The immediately
previous revision (`N-1`) is accepted only if the same connected DOM node still
has the same tag, role, accessible name, sensitivity, and control type.
`submit_form` has no grace.

For article/body reading, prefer `browser.get_page_text`. It joins only the
sanitized semantic text blocks, accepts the same revision-bound subtree scope,
is capped at 200,000 characters, and never returns control values.

`browser.find_natural_language` is a one-call deterministic locator for phrases
such as `Update button` or `select all checkbox`. It does not invoke a remote
model. It ranks current semantic controls by accessible name, role, visible
text, tag, selector hints, and interactive state, and returns fresh
`documentId`/`domRevision` references. Use exact `find_elements` when the
criteria are already known or a destructive action requires deterministic
uniqueness.

## 10. Forms, editors, and submit

Use:

- `type_text` for native text controls and supported ordinary editors;
- model-aware editor handling for CodeMirror-like, ProseMirror, CKEditor-like,
  TinyMCE, Gutenberg, and Classic Editor;
- `select_option`, `check`, and `uncheck` for native controls;
- typed WordPress actions for WordPress state.

A visible DOM edit is not sufficient for model-backed editors. The Bridge
updates the authoritative model/backing field and verifies it before submit.

Submit is R2. It proceeds without a redundant prompt only when the current
user instruction explicitly authorizes submitting. Send:

```json
{
  "authorization": {
    "source": "explicit_user_instruction",
    "instructionId": "stable-user-message-id"
  }
}
```

After `submitted: true`, wait for navigation or a success/error message and
verify the result. Click, raw JS, coordinates, keys, and drag gestures cannot
bypass submit/reset protection.

## 11. File upload

Use only `browser.set_file_input_files` /
`invictum_set_file_input_files`.

- 1–20 absolute local paths;
- each path must exist, be a regular file, and be readable;
- paths are canonicalized in Desktop Authority;
- files are set through short-lived CDP `DOM.setFileInputFiles`;
- hidden inputs are supported with hidden-element snapshot/find options;
- multiple paths require an input with `multiple`;
- `accept` remains a hint that the agent must validate;
- the action does not submit the form.

Upload is R2 because page JavaScript may start upload on `input` or `change`.
The user must explicitly request uploading those files to that site. File
paths and names are excluded from results and audit logs. They necessarily
travel transiently through the local Bridge chain and are not persisted.

Never try to construct `FileList` with JavaScript and never use a coordinate
click to type a path into the native file chooser.

## 12. WordPress

Classic menus:

1. `get_wordpress_menu`
2. review the typed tree
3. `edit_wordpress_menu` with authorized add/remove/update/move operations
4. save and verify the returned tree

Do not coordinate-drag menu items.

Admin list tables:

1. `get_wordpress_admin`
2. identify exact notice/table/row/action keys
3. `wordpress_list_table_action` for a row or authorized bulk action
4. refresh and verify

Editors:

1. `get_wordpress_editor`
2. review authoritative Gutenberg/Classic model state
3. `edit_wordpress_editor` with `save:false`
4. review
5. save only when explicitly authorized
6. verify saved state

Before navigating away from unsaved changes, arm the native dialog handler
before navigation. Use `stay` to preserve changes. Use `leave` only when the
user has authorized discarding/leaving.

## 13. JavaScript, DOM, CSS, and events

Escalation order:

1. typed interaction or WordPress action;
2. `inspect_element` / `observe_events`;
3. `mutate_dom` / `manage_css`;
4. constrained `evaluate`;
5. explicitly authorized R3 `execute_javascript`;
6. screenshot and coordinate fallback.

`browser.evaluate` is not arbitrary JavaScript. It supports a constrained
expression DSL for bounded DOM reads and explicit page mutation. It blocks:

- cookies and storage;
- network and navigation;
- click, submit, and reset;
- credential selectors;
- event-handler attributes;
- `eval`, `Function`, import, and require.

`mutate_dom` sanitizes HTML, blocks sensitive/resource targets, strips scripts
and network-capable style constructs, and returns new revision metadata.

`manage_css` uses the same side-channel guards. Added styles receive an
`injectionId`; remove them by ID. Remaining injections are cleaned on final
release.

`observe_events` is bounded, scoped, excludes control values, and uses
monotonic sequence numbers.

Raw JavaScript is not a security sandbox. It requires explicit R3
authorization, a minimal bounded source, a fresh snapshot afterward, and must
never read credentials/storage/network secrets, submit forms, navigate, or
bypass policy.

For a page's own REST/API endpoint, prefer `browser.page_api_request` over raw
JavaScript. It is an explicitly authorized R3 action with these fixed limits:

- relative or absolute URL must resolve to the current page origin;
- methods are GET, POST, PUT, PATCH, or DELETE;
- only Accept, Content-Type, If-Match, and If-None-Match can be supplied;
- cookies remain inside browser `credentials: same-origin`;
- Authorization, Cookie, and arbitrary headers are impossible;
- redirects are manual and response content is capped at 500,000 characters;
- query values are removed from results/audit;
- credential-like JSON keys and token-shaped text are redacted;
- an optional WordPress REST nonce is read inside the page, used once, and
  never returned or audited;
- request URL/body are represented in audit only by length/hash metadata.

GET requests cannot carry a body. Every non-GET result sets
`verificationRequired:true`; inspect the page or refetch state before reporting
success.

## 14. Gestures

`browser.perform_gesture` supports:

- hover;
- focus and blur;
- double-click and context/right-click;
- scrolling an element into view;
- bounded page scrolling;
- absolute document scrolling to X/Y;
- bounded synthetic key events, optional code, and Ctrl/Alt/Meta/Shift;
- drag and drop.

Gestures are synthetic DOM events, not OS-level trusted input. They are
revision-bound and protected by submit/reset guards. See
[docs/ADVANCED_AGENT_CAPABILITIES.md](docs/ADVANCED_AGENT_CAPABILITIES.md).
`Tab` and `Shift+Tab` also perform deterministic focus traversal when the page
does not cancel the synthetic keydown. Browser-chrome shortcuts cannot be
triggered because events remain inside the page.

## 15. Console, network, mobile, and PDF

Console and network diagnostics must start before the action being diagnosed:

```text
start -> perform action -> read -> stop in finally
```

Network capture is metadata-only. It never captures headers, bodies, cookies,
POST data, query strings, fragments, or URL credentials.

Mobile emulation:

```text
set -> new snapshot -> test/screenshot -> reset in finally
```

PDF export supports A4, Letter, Legal, landscape, backgrounds, scale, margins,
page ranges, and CSS page size. It is capped at 10 MB and does not activate the
tab.

These features share one reference-counted debugger session per tab. Visible
DevTools may conflict; close it and retry once. Cleanup always releases the
feature's own reference.

## 16. Authentication and dialogs

Prefilled HTML login:

1. confirm username/password controls report `hasValue: true`;
2. never read either value;
3. find the current form/submit target;
4. submit only when the user explicitly requested login;
5. verify the resulting account/page state.

HTTP Basic Auth:

1. open/navigate with `waitUntil: "none"` if a challenge may block load;
2. call `get_http_auth_state`;
3. use `authenticate_http` only with user-provided/approved credentials and
   explicit authorization;
4. the Bridge answers at most one same-origin main-frame Basic challenge;
5. credentials are not persisted, returned, or audited;
6. verify the page afterward and never retry bad credentials blindly.

Do not place credentials in URLs, CLI argv, logs, comments, snapshots, or
generic JavaScript. Digest, NTLM, Bearer, and proxy authentication are not
supported.

Native JavaScript dialogs must be handled proactively:

- arm the typed handler before the click/navigation that opens the dialog;
- `trigger: { "type": "none" }` is best effort only for an already-open modal;
- Chrome may block late debugger attachment while browser-native UI is open;
- prompt text must come from explicit user input/approval;
- obtain a fresh snapshot after handling.

For “Leave site?” use the dedicated beforeunload helper. `stay` preserves the
page; `leave` may discard unsaved changes.

## 17. Screenshots and coordinates

Screenshot modes:

- `viewport`
- `element`
- `region`
- `full_page`

Up to 20 annotations may be applied to the final JPEG:

- rectangle;
- rounded rectangle;
- ellipse;
- circle;
- highlight;
- optional label text;
- optional arrow.

Element crop/annotation requires a current `documentId`, `domRevision`, and
`elementId`. Rendering occurs in an isolated fixed renderer and does not mutate
the page.

Use a generous element-crop padding and a labeled annotation for tutorials.
Full-page output is bounded to 2560 × 2560 and 500 KB, so use element/region
captures when small text must remain readable.

`click_at` requires current viewport coordinates and revision. It is a
synthetic DOM fallback, cannot submit/reset forms, and must be followed by a
new snapshot.

## 18. Errors and recovery

| Code                       | Meaning                                      | Agent response                                                  |
| -------------------------- | -------------------------------------------- | --------------------------------------------------------------- |
| `PERMISSION_DENIED`        | Site access/session authorization is missing | inspect tab/origin details; do not bypass                       |
| `POLICY_DENIED`            | User Stop or policy rejected the operation   | obey; request user action only when required                    |
| `CONFIRMATION_REQUIRED`    | R2/R3 authorization is missing               | connect the current explicit instruction                        |
| `INVALID_PARAMETERS`       | strict schema rejected keys/values           | use `issues` and `allowedKeys`; correct the call                |
| `STALE_ELEMENT_REFERENCE`  | page/revision/reference changed              | use returned relocation or refresh snapshot/find                |
| `ELEMENT_NOT_INTERACTABLE` | target is hidden/disabled/unsupported        | inspect current state; choose a semantic alternative            |
| `SENSITIVE_INPUT_BLOCKED`  | credential/payment/OTP target                | user handles the value                                          |
| `SCRIPT_POLICY_DENIED`     | constrained evaluator blocked source         | use a typed action; do not widen grammar to bypass              |
| `TIMEOUT`                  | load/wait/transport timed out                | check native dialog, health, and ping; retry once if meaningful |
| `BROWSER_API_ERROR`        | Chrome API/CDP failure                       | confirm tab and DevTools state; retry once if marked retryable  |
| `LOCAL_FILE_NOT_FOUND`     | upload path does not exist                   | correct the absolute path                                       |
| `LOCAL_FILE_ACCESS_DENIED` | file is unreadable/unavailable               | inspect permissions/locks                                       |
| `MESSAGE_TOO_LARGE`        | bounded output exceeded protocol limit       | reduce scope, size, range, or buffer                            |

Recovery order:

1. `pnpm browser health`
2. `pnpm browser ping`
3. allow CLI/MCP auto-start if 47820 is absent
4. `pnpm build` only if source/build artifacts are stale
5. verify enabled extension and Native Host if disconnected
6. ask the user to Reload only after rebuilding extension dist
7. request manual Site-access/reauthorization only when Chrome or User Stop
   requires it

## 19. Build and verification

Normal gates:

```powershell
pnpm typecheck
pnpm test
pnpm lint
pnpm build
```

Real Chrome requires the newly built unpacked extension to be Reloaded.
After Reload:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\verify-after-reload.ps1
```

The current gate expects:

- 46 runtime actions;
- 50 MCP tools;
- all upload, WordPress, DOM/CSS/event, console, network, device, gesture, PDF,
  identity, clean-text, natural-find, history-navigation, page-API, batching,
  screenshot, and annotation feature flags;
- deterministic background-tab behavior;
- typed forms/editors and WordPress workflows;
- file upload and missing-path denial;
- native dialog and beforeunload handling;
- console/mobile/screenshot/coordinate behavior;
- explicit submit policy;
- unconditional disposable-tab cleanup.

Never let an old test harness replace a healthy daily-use Desktop Authority.

## 20. Final checklist

- [ ] `ping` reached the extension.
- [ ] `capabilities` was read.
- [ ] The URL was opened/navigated through IBB.
- [ ] `active` was omitted unless foreground focus was genuinely required.
- [ ] The agent identity was set once if useful.
- [ ] Semantic typed actions preceded JS, screenshots, and coordinates.
- [ ] `activate_tab` was avoided unless foreground focus was genuinely needed.
- [ ] Page API work used the typed same-origin action instead of raw fetch.
- [ ] Batch placeholders referenced only successful earlier steps.
- [ ] Current revision-bound references were used.
- [ ] Diagnostic capture started before the tested action and stopped in
      `finally`.
- [ ] Mobile emulation was reset in `finally`.
- [ ] Submit/upload/destructive/dialog/auth/raw-JS authorization came from the
      current user instruction.
- [ ] No credential, restricted page, policy, or Site-access boundary was
      bypassed.
- [ ] Results were verified after mutation/navigation/submit.
- [ ] Disposable agent-created tabs were closed.
- [ ] `unlock_tab` or `end_session` released every reservation.
