# Real-Chrome and PageSpeed test report

Last updated: 2026-07-24 (Europe/Zagreb).

Current prepared source status: the build exposes exactly 46 runtime actions
and 50 MCP tools. In addition to the previously real-Chrome-verified
upload/WordPress/DOM/CSS/events/identity/settings/console/network/device/
gesture/PDF/screenshot features, the source now includes clean page text,
deterministic natural-language element discovery, non-activating back/forward
navigation, explicit tab activation, modifier keys, double/context click,
absolute scrolling, an explicitly authorized same-origin page API, and
policy-preserving MCP/CLI/SDK batches. These new source capabilities have
passed offline type, unit and integration checks but are intentionally not
claimed as loaded real-Chrome evidence until the user Reloads the unpacked
extension and the post-Reload gate runs.

The 2026-07-24 post-Reload run reached the current 46-action contract and
verified the one-based WordPress menu-position fix in real Chrome: the first
unrelated item remained first after moving a subtree below **Info**, the
submitted form contained positions 1–5, and the post-submit typed tree
preserved the complete subtree. Follow-up history testing separated two
problems: the completion-listener race and Chrome replacing the initial entry
when an extension navigates a newly opened tab with `tabs.update({url})`.
Source now installs the listener before the trigger, requires evidence of the
new load, and uses document-level `location.assign` for existing-tab
navigation. This preserves a real Back/Forward entry without activating the
tab. The final implementation has full offline coverage and needs one more
Reload before the complete real-Chrome verifier is repeated.

The most recently loaded real-Chrome gate verified background tab operation,
local upload, snapshots, forms, ordinary and model-backed editors, Shadow DOM,
stale-reference behavior, constrained and raw JavaScript, typed DOM mutation,
HTML/style sanitization, CSS add/remove, scoped event capture,
listener/source inspection, programmatic console capture, mobile
viewport/touch emulation, metadata-only network capture, gestures, PDF,
viewport/region/element/full-page screenshots, revision-bound tutorial
annotations, coordinate control, submit policy, and unconditional cleanup.
See [FILE_UPLOAD.md](FILE_UPLOAD.md),
[ADVANCED_BROWSER_TOOLS.md](ADVANCED_BROWSER_TOOLS.md),
[ADVANCED_AGENT_CAPABILITIES.md](ADVANCED_AGENT_CAPABILITIES.md),
[AGENT_PRODUCTIVITY_ACTIONS.md](AGENT_PRODUCTIVITY_ACTIONS.md),
[DEVTOOLS_CONSOLE_AND_MOBILE.md](DEVTOOLS_CONSOLE_AND_MOBILE.md), and
[SCREENSHOTS_AND_ANNOTATIONS.md](SCREENSHOTS_AND_ANNOTATIONS.md).

## Scope

This report covers the persistent chain `agent/CLI/MCP -> control API :47820 -> Desktop Authority -> Native Host :47821 -> reloaded Chrome extension`. Tests used the user's normal Chrome profile, deterministic local fixtures on `127.0.0.1:47822`/`:47823`, `example.com`, and the live Google PageSpeed Insights UI.

No test connected directly to the Native Messaging port. Every reserved tab was released through `unlock_tab`, `closeSession()` or the SDK `withReservedTab()` cleanup path.

## Runtime discovery

- `health`: Desktop Authority reachable and `nativeConnected: true`.
- `system.ping`: full extension round trip returned `pong`.
- Loaded `system.capabilities` after the final 2026-07-23 Reload: exactly 30 unique actions.
- Loaded feature flags include `localFileUpload`, `elementInspection`, `domMutation`, `cssInjection`, `eventCapture`, `browserConsole`, `deviceEmulation`, `rawJavaScript`, `customControlIdentity`, `configurableTabActivation`, compact/outline snapshots, safe previous-revision relocation, structured parameter errors, persistent host access, screenshots, coordinate fallback, auth/dialog support and User Stop.
- Current source MCP stdio returns exactly 50 tools, including local upload,
  custom control identity, clean text, natural-language find, history
  navigation, explicit activation, same-origin page API, batching, console and
  metadata-only network capture, device emulation, gestures, PDF export, and
  dedicated tools for advanced DOM/CSS/event/JavaScript actions.
- The one-step verifier also detected and repaired an older Desktop Authority process whose result schema predated the five feature flags; the restarted current Authority then accepted the capability response and completed the full extension ping.

## Deterministic kitchen-sink validation

`tests/fixtures/kitchen-sink.html` and `smoke:chrome:kitchen-sink` cover:

- `outline`, `minimal`, `interactive`, `semantic`, `full` and form-scoped snapshots;
- compact default-field omission and password-value non-disclosure;
- clean-text extraction without control values and deterministic
  natural-language element ranking;
- unique, truncated, regex and table-relative semantic search;
- text/search/email/number/date/textarea replacement and native input/change events;
- rejection of readonly, disabled, file, color and password typing;
- prepared upload regression path: missing local path denial, one file on a single input, two files on a `multiple` input, native input/change observation and no implicit submit;
- native single/multi select, checkbox and radio actions;
- contenteditable, ProseMirror-like, CKEditor-like and open-Shadow-DOM editors;
- a model-backed CodeMirror editor whose authoritative value and hidden textarea must both match before its form reports success;
- ordinary buttons, implicit non-form buttons and Shadow DOM buttons;
- safe N-1 relocation for an unchanged node, plus stale rejection after identity change;
- policy-approved read/mutation JavaScript and rejection of network/dynamic-code expressions;
- bounded viewport/region/element/full-page JPEG capture, revision-bound shapes/tutorial text and coordinate click;
- non-activating history navigation, modifier keys, double/context click and
  absolute document scrolling;
- bounded same-origin page API request/response handling with redaction and
  explicit authorization;
- ordinary submit-click denial followed by explicitly authorized `submit_form` and result verification;
- automatic reservation indicator and unconditional unlock.

The real-Chrome discovery runs found seven concrete issues, all fixed in source and covered by regression tests:

1. readonly/file/color controls were advertised as editable and readonly accepted text;
2. a button outside any form was treated as submit solely because its implicit type is `submit`;
3. policy-approved JavaScript returned an empty Chrome injection result because MV3 blocks dynamic `eval` in the extension isolated world. The prepared fix uses one bounded tab-scoped Chrome Runtime attachment, creates an isolated context when requested, directly compiles the already policy-approved expression inside a fixed serializer, releases the object group and detaches in `finally`;
4. repeated Basic Auth smoke failed when Chrome satisfied a recently detected challenge from its own auth cache without firing a second challenge callback;
5. listener inspection treated the `DOM.resolveNode` return envelope like `Runtime.evaluate`; the adapter now reads the former from `object.objectId` and the latter from `result.objectId`, matching their distinct CDP contracts;
6. inline listener locations were applied directly to the isolated script body even when Chrome located them relative to the containing HTML resource. The adapter records `scriptParsed.startLine`, maps the location into the script source, and falls back to a bounded named-handler search only when the reported location is unusable. Source output remains size-bounded and credential/high-entropy redacted.
7. annotation text stalled `OffscreenCanvas.convertToBlob` in the MV3 service worker, while an offscreen-document/content-message workaround still left the long response unresolved. The final implementation executes one fixed self-contained renderer directly through `chrome.scripting.executeScript` in the tab's `ISOLATED` world. Its detached canvas is never inserted into the page, accepts no caller-supplied JavaScript, returns through Chrome's standard scripting result and is bounded/revalidated by the service worker.
8. direct `contenteditable` mutation made the WordPress code editor look updated while its framework model and backing form value remained stale. Recognized model-backed editors now use a fixed MAIN-world adapter, verify the resulting model and fail closed when no safe editor API is reachable.

## Model-backed editor persistence (real Chrome verified)

The 2026-07-23 post-Reload kitchen-sink run typed `<?php return 'synchronized';` into a CodeMirror-style visible surface, then submitted its form through the authorized `browser.submit_form` path. The fixture intentionally keeps an independent authoritative editor value and hidden textarea: direct DOM text mutation leaves both stale and produces **Code editor submitted stale model**. The loaded build instead called the page's CodeMirror API, synchronized the backing textarea, re-read the model and reached **Code editor submitted with synchronized model**. The gate then continued through Shadow DOM, stale references, JavaScript, advanced DOM/CSS/event tools, console/mobile emulation, screenshots and final submit.

The adapter has fixed paths for CodeMirror 5/6, Ace, Monaco, Quill and TinyMCE. It returns no typed text, uses a random revision-neutral marker only to bind the isolated-world element to the fixed MAIN-world function, removes that marker in `finally`, and reports `ELEMENT_NOT_INTERACTABLE` rather than success if the framework model cannot be reached or does not equal the requested result.

The complete verifier was run twice after Reload. The first run passed the new editor persistence test and later encountered a transient pre-existing computed-style assertion during reversible CSS validation. An immediate full rerun passed the editor test and every remaining gate, including CSS add/remove and unconditional unlock.

## Local file upload (real Chrome verified)

The loaded build includes a revision-bound R2 `browser.set_file_input_files` action and dedicated `invictum_set_file_input_files` MCP tool. Desktop Authority validates 1–20 absolute readable regular files and canonicalizes their paths. The extension validates an enabled native file input, uses a random temporary target marker plus `DOM.setFileInputFiles` through the tab's shared debugger session, verifies the count, removes the marker and releases its session reference in `finally`. Paths and filenames are excluded from results and audit; the action never submits the form.

The 2026-07-23 post-Reload smoke passed:

- exact runtime action/feature discovery through the reloaded extension;
- missing local path rejected as `LOCAL_FILE_NOT_FOUND`;
- one real local fixture file attached to a single-file input with `fileCount: 1` and `countVerified: true`;
- two real local fixture files attached to a `multiple` input with `fileCount: 2` and `countVerified: true`;
- native change-event text observed after the two-file attachment;
- the run proceeded through selects, checkbox/radio, three editor patterns, Shadow DOM and stale-reference checks, proving upload did not destabilize the tab;
- unconditional SDK unlock still ran when the later, independent constrained-evaluator assertion failed.

Schema, R2 policy, readable errors, path-redacted audit, CDP detach/marker cleanup, MCP registration and emulated transport remain covered by automated tests. File upload is no longer pending.

## Advanced control build (real Chrome verified)

The current source build contains the advanced DOM actions plus R0
`browser.set_control_identity`, R0 `browser.console`, R0 `browser.network`, R1
`browser.emulate_device`, R1 `browser.perform_gesture`, R0
`browser.print_to_pdf`, clean text/find helpers, history/activation, and the R3
same-origin page API. The built MCP server returns 50 tools and the extension
reports 46 actions. A source-only change is not considered loaded real-Chrome
evidence until the user Reloads the unpacked extension.

Offline gates passed on the prepared DOM-parser build on 2026-07-23:

- 19/19 workspace typecheck tasks;
- 145 unit tests, including an exact 30-action/no-duplicates capability contract, all upload/advanced/identity/settings/console/device/screenshot feature flags, model-backed editor MAIN-world synchronization and fail-closed behavior, shared debugger attachment and reference-counted cleanup, bounded/redacted console capture, mobile preset/custom-profile validation and partial-override rollback, safe identity-name validation, persisted background/foreground preference with explicit override, SDK identity convenience, serialized lease cleanup, in-flight User Stop cleanup, custom-name persistence through commands and cancellable 20-second unlock grace, first-injection identity synchronization, isolated/main-world Chrome Runtime evaluator coverage, both `Runtime.evaluate`/`DOM.resolveNode` remote-object envelope shapes, inline-script source-coordinate mapping, bounded named-handler fallback, full-page CDP capture and revision-bound isolated-world tutorial rendering;
- 12 transport/control integration tests, including the custom-identity control API/native transport/audit round trip plus R0/R2/R3 policy and audit-redaction coverage for all five advanced actions;
- 19/19 lint tasks plus repository-wide Prettier check;
- 11/11 production build tasks;
- that historical build's MCP `tools/list` count 32 and all
  advanced/identity/console/device tool names;
- built extension bundles contain all five advanced action markers plus `browser.set_control_identity`.

The deterministic real-Chrome fixture adds a dynamically generated delegated dropdown and custom element. The final post-Reload pass proved the constrained evaluator, typed DOM/inline-style mutation, HTML stylesheet/resource/script sanitization, safe element inspection, delegated listener discovery and a non-empty bounded source excerpt for `handleFixtureDropdownClick`. It also completed standard/custom event capture with monotonic sequence after buffer clear, reversible page-wide CSS, raw expression/function-body execution, direct protected-source denial and unconditional cleanup. The same run returned **Codex is using this tab** from the custom identity action, captured a final 1200 × 893 JPEG (47,775 bytes), and completed ordinary-submit denial followed by an explicitly authorized submit.

## Toolbar settings, console and mobile build (real Chrome verified)

The loaded extension bundle includes `popup.html`, `popup.css`, and `popup.js`, referenced by `action.default_popup`. A left toolbar click opens settings instead of directly mutating tab authorization. The popup:

- persists **Work in the background** (initial default) or **Activate the agent tab** in `chrome.storage.local`;
- shows Bridge connection and current-tab reservation/identity state;
- shows and toggles programmatic console capture for the current tab;
- shows and toggles a default 390 x 844 DPR 3 mobile viewport with touch for the current tab;
- exposes blocked-tab reauthorization only after the user presses **Stop**;
- never reserves a tab merely by opening or changing a preference.

`open_tab` and `navigate` leave `active` optional end-to-end. Omission resolves the user's saved default inside the extension; explicit true/false remains a per-call override. MCP descriptions tell agents to omit the field, CLI shorthand does the same and adds explicit `--active`/`--background` flags, and navigation audit records `user-default` rather than guessing the resolved preference. The real-Chrome kitchen-sink gate opened and completed entirely with `active: false`, proving that background snapshots, editors, upload, debugger screenshot, JavaScript and submit do not steal focus.

The same loaded gate started console capture before the tested action, generated and read one diagnostic error entry, and stopped capture successfully. It then applied the 390 × 844 DPR 3 mobile preset with touch. Runtime JavaScript reported `screen.width/outerWidth = 390`, `screen.height/outerHeight = 844`, and DPR 3. The fixture's actual CSS layout viewport was 452 × 977 because its minimum-content width triggered Chrome's real shrink-to-fit/page-scale behavior; the mobile screenshot metadata matched that layout viewport and visually exposed horizontal overflow. Reset restored desktop mode and final reservation cleanup completed. Console capture and device emulation share one reference-counted debugger attachment, so stopping either feature cannot detach the other. Visible DevTools does not need to open and, because Chrome allows only one debugger client per tab, should remain closed while these programmatic modes are active.

## Screenshot and tutorial annotation build (real Chrome verified)

The final loaded 2026-07-23 build passed all four capture modes without activating the fixture tab:

- viewport JPEG: 1200 × 893;
- viewport-relative region crop: 994 × 87;
- revision-bound element tutorial crop: 1138 × 231 with one rounded red outline, arrow and **Click this button** label;
- complete page: 741 × 1600 from a 3650-CSS-pixel page, captured without scripted scrolling.

A second MCP call independently reproduced the annotated 1138 × 231 JPEG in 4.2 seconds with `annotationsApplied: 1` and a 25,458-byte payload. The source element and crop were resolved against the exact `documentId`/`domRevision`, output bounds were enforced and the tab was explicitly unlocked. Canvas/bitmap/JPEG primitives were also diagnosed directly in real Chrome: text drawing plus JPEG encoding completed in about one second. The final self-contained isolated-world renderer removes the two message paths that had caused 30-second timeouts.

## CLI and control API

The real CLI workflow passed:

```text
open -> outline snapshot -> find textbox -> type -> find button -> click
     -> wait dom_stable -> screenshot file -> unlock -> close-session
```

Observed result: 20 typed characters, the expected ordinary-button target, `dom_stable`, a 59,428-byte JPEG and successful unlock. Invalid stdin parameters returned one readable `INVALID_PARAMETERS` sentence plus structured `allowedKeys` and `details.issues`; the raw Zod dump did not leak into the top-level message.

The persistent Agent SDK smoke independently passed automatic CLI authority discovery, 21 capabilities, `open_tab`, selector/DOM waits, full-to-scoped reduction, sanitized navigation and guaranteed unlock.

## Google PageSpeed Insights

Live workflow on `https://pagespeed.web.dev/`:

1. Bridge opened the page automatically with no per-domain toolbar permission.
2. Outline snapshot found the Croatian URL textbox, Analyze form and consent button.
3. `type_text` entered `https://example.com/` and emitted a new revision-bound ID.
4. The Analyze form was submitted using `browser.submit_form` with the user's explicit test instruction.
5. The analysis exceeded one 120-second local wait by a few seconds; the tab itself completed successfully. A follow-up tab read and outline snapshot found the `/analysis/` result route.
6. Result snapshot exposed Performance 100, Accessibility 96, Best Practices 96, SEO 80 and Agentic browsing 2/2.
7. A 74,254-byte bounded JPEG (1449 x 1080) was captured and visually inspected. It showed the result page and the `AI agent radi` reservation indicator.
8. The PageSpeed session was explicitly unlocked and closed.

The consent button exposed the implicit non-form-button bug described above. After the fix it is an ordinary semantic click; it does not require submit authorization.

## Snapshot measurements

Exact compact JSON measurements are maintained in [SNAPSHOT_SIZE_BENCHMARK.md](SNAPSHOT_SIZE_BENCHMARK.md). On the reloaded build, outline reduction versus the equivalent expanded representation was 77.7% on `basic-form`, 82.8% on `kitchen-sink`, and 73.3% on `example.com`. The previously reported real 35-element response was about 65 KB; the current 35-element interactive fixture response is 14,699 bytes (roughly 77% smaller).

## Automated gates

- typecheck: 19/19 tasks passed;
- unit tests: 175 passed, including clean-text/natural-find, same-origin API
  origin/credential/redaction/WordPress nonce, navigation, gesture,
  capabilities, protocol, policy, audit, SDK batch, and WordPress one-based
  menu-position regression coverage;
- emulated integration tests: 12 passed;
- lint: 19/19 tasks passed;
- repository formatting: passed;
- production build: 11/11 packages;
- built extension contains all six new runtime action markers plus expanded
  gesture markers;
- built MCP `tools/list` returned exactly 50 tools;
- upload-specific real-Chrome confirmation: passed;
- constrained evaluator, typed DOM mutation, HTML/CSS sanitization and delegated listener metadata: passed in real Chrome;
- custom identity, final listener source, events, page-wide CSS, raw JavaScript and cleanup in real Chrome: passed.
- toolbar bundle/state handlers, full background mode, programmatic console capture, 390 × 844 DPR 3 touch emulation, mobile screenshot metadata, desktop reset and cleanup: passed.
- viewport/region/element/full-page capture plus revision-bound shape, arrow and tutorial text rendering in a background tab: passed.

## Reproduction

Start the fixture and keep the persistent authority running:

```powershell
node tests/fixtures/server.mjs
pnpm browser health
pnpm browser ping
pnpm browser capabilities
pnpm --filter @invictum/integration-tests smoke:chrome:kitchen-sink
pnpm --filter @invictum/integration-tests smoke:chrome:agent-control
pnpm --filter @invictum/integration-tests smoke:chrome:auth-dialog
pnpm benchmark:snapshots
```

After any future extension rebuild and Reload, use the single complete command:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\verify-after-reload.ps1
```

For PageSpeed, use `open_tab`, find/type the URL textbox, find the form, explicitly authorize `submit_form`, then wait for `/analysis/` in bounded intervals. A timeout must be followed by state inspection, not an automatic resubmit.
