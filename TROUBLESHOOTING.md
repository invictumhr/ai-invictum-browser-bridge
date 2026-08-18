# Troubleshooting

## Fast health check

```powershell
pnpm browser health
pnpm browser ping
pnpm browser capabilities
```

`health` proves the Desktop Authority/control API exists. `nativeConnected:true` says a Native Host connection exists. Only `ping` proves the complete path reaches the Chrome extension.

## `pnpm` is not recognised

The documented gates (`pnpm build`, `pnpm test`, `pnpm browser ...`) need pnpm
on `PATH`. Node ships Corepack, which installs the version this repository pins:

```powershell
corepack enable
corepack prepare pnpm@11.9.0 --activate
pnpm --version
```

Without it, `turbo` also fails with `Unable to find package manager binary`,
because it shells out to the package manager. Until Corepack is enabled you can
run the same work per package with the local binaries:

```powershell
node apps/cli/dist/index.js health
node_modules/.bin/tsc -p packages/protocol/tsconfig.json
node_modules/.bin/vitest run --dir apps/extension
```

## Control API is offline

`pnpm browser ping` and the MCP server automatically start `apps/desktop/dist/index.js` in a hidden process. If auto-start fails, run `pnpm build` and retry. Check listeners without killing them:

```powershell
Get-NetTCPConnection -State Listen -LocalPort 47820,47821 -ErrorAction SilentlyContinue |
  Select-Object LocalAddress,LocalPort,OwningProcess
```

Do not stop an unknown owner. Port 47820 is agent control; port 47821 belongs only to the Native Host bridge.

CLI/MCP waits up to 10 seconds for Chrome to reconnect after authority startup. If the authority is healthy but the unpacked extension still has not connected, the error explicitly asks for one extension Reload; it does not silently create a competing daemon.

## Badge does not show `ON` / `nativeConnected:false`

- Verify `apps/extension/dist/background.js`, `content.js`, and `manifest.json` exist.
- Verify the unpacked extension is enabled and was reloaded after its last build.
- Verify the Native Host manifest contains the exact extension ID.
- Verify `HKCU\Software\Google\Chrome\NativeMessagingHosts\com.invictum.browser_bridge` points to that manifest.
- Verify the generated launcher and its `node-path.txt`, `host-entry-path.txt`, and `desktop-url.txt` files.
- Inspect the extension service worker for sanitized errors.

## A new website returns `PERMISSION_DENIED`

Open the extension's Chrome **Details** and set **Site access / Pristup web-lokaciji** to **On all sites / Na svim web-lokacijama**. Normal new domains no longer use per-domain toolbar prompts. The error includes the target `tabId` and sanitized origin. Do not bypass a user/admin restriction.

## `RESTRICTED_PAGE`

Chrome-internal, extension, DevTools, Web Store, file and other protected schemes cannot be controlled. Use a normal HTTP(S) page. This is intentional and cannot be fixed with a permission click.

## User clicked **Stop** / `POLICY_DENIED`

Do not retry or use another input path. The user must explicitly click the Invictum toolbar icon to clear the block. That click reauthorizes control but does not reserve the tab; the next targeted agent action does.

## Back/Forward reports no history after `browser.navigate`

Confirm that the unpacked extension was Reloaded after the latest build. The
current adapter uses Chrome's `tabs.update({url})` navigation contract and
installs its completion listener before triggering navigation. Older builds
that used isolated-world `location.assign` could load the destination without
leaving a usable Back/Forward entry in some Chrome versions. If the native tabs
history promise still rejects immediately, the current build targets only the
adjacent CDP history entry through its shared debugger session. This fallback
does not run after a completion timeout and therefore does not bypass an
unsaved-changes dialog. Do not work around a failure by activating the tab or
sending `Alt+Left`; update/Reload the extension, then retry the typed history
action once.

## `STALE_ELEMENT_REFERENCE`

Fetch a new snapshot, find the element again, and use its new `documentId`, `domRevision`, and `elementId`. Every successful mutation intentionally invalidates the previous revision.

## `CONTENT_SCRIPT_UNAVAILABLE`

Confirm the page is HTTP(S), Site access is On all sites, then refresh the tab. Reload the extension only if its extension files were rebuilt. On-demand injection replaces a stale isolated-world listener automatically.

## `crypto.randomUUID is not a function` on plain HTTP/LAN pages

Builds before 2026-08-17 assumed that `crypto.randomUUID()` existed inside the
content-script execution context. Chrome does not expose that API on every
non-secure origin, including ordinary `http://192.168.x.x` administration
pages, so content-script initialization could fail before IBB reserved or
inspected the tab.

Current builds use a compatibility generator: native `randomUUID` on secure
contexts, `getRandomValues` on plain HTTP when available, and a process-local
non-security fallback for internal DOM markers. Rebuild and Reload the unpacked
extension once, then refresh the affected page. If the extension errors page
still shows historical entries, clear those entries and reproduce once; old
logged errors are not evidence that the current content script failed.

## Forms and sensitive fields

Password, OTP, payment, token and credential-like fields are intentionally unreadable/unwritable. Snapshot `hasValue` reveals only whether a control is prefilled. When the user explicitly requested login, submit that prefilled form using `browser.submit_form` with a genuine `explicit_user_instruction` ID and required post-submit verification. Click, coordinate input, constrained JavaScript, and raw events cannot bypass this path.

`readonly`, disabled, file and color controls are also rejected by `type_text`. Use `select_option`, `check` or `uncheck` for their matching control types. A plain button outside a form is not a submit control even when HTML gives it the implicit `type=submit`; only a form-associated submitter requires `browser.submit_form`.

For `<input type="file">`, use `browser.set_file_input_files` with an absolute existing path and explicit user authorization. Hidden upload-widget inputs require `includeHidden: true` plus `visible: false`. `LOCAL_FILE_NOT_FOUND` means the indexed path is wrong; `LOCAL_FILE_ACCESS_DENIED` means Desktop Authority cannot read it. Multiple paths require the HTML `multiple` attribute. If CDP attach fails, close DevTools or another debugger on that tab and retry once; the adapter always detaches and removes its temporary marker in `finally`.

## HTTP Basic Auth / `AUTHENTICATION_FAILED`

Call `browser.get_http_auth_state` first. Only `scheme: "basic"`, non-proxy, main-frame challenges are supported. `browser.authenticate_http` reloads the current same-origin HTTP(S) tab and uses the supplied credentials once. `AUTHENTICATION_FAILED` means no Basic challenge appeared, the navigation failed, or the server challenged again after the attempt. Verify origin/realm and user-supplied data; do not loop retries. Credentials are cleared even on error.

When Chrome has already cached valid credentials for a challenge that the Bridge detected less than 60 seconds earlier, reload may complete without firing a second `onAuthRequired`. That is reported as authenticated with `challengeHandled: false`; verify the expected page selector before declaring login success.

## A long external analysis times out

`browser.wait_for` is bounded to 120 seconds. For PageSpeed Insights and similar queued services, a timeout does not prove the submitted job failed. Read the tab URL/title and a short outline snapshot once; if the result route or expected heading has appeared, continue. Otherwise perform at most one additional bounded wait. Do not resubmit the form blindly.

## Native JavaScript dialog cannot be handled

Use `browser.handle_javascript_dialog` with the expected click/navigation as its `trigger`; arming before the trigger avoids a blocked page. For a dialog already open, use `trigger: {"type":"none"}`. Chrome allows only one debugger client per tab, so close visible DevTools or another external debugger on that tab if attach fails. Chrome can show its normal debugging banner. The adapter always releases its shared debugger reference after success, timeout, or failure.

## Console/mobile/inspection/JavaScript cannot attach

Console capture, mobile preview, `inspect_element` with listeners, file upload, native dialogs, inactive-tab screenshot fallback and JavaScript actions all require Chrome's one debugger-client slot. Invictum internally shares one attachment among these actions, so its own tools can coexist. Close visible DevTools for that tab, verify the tab is a normal HTTP(S) page and retry once. If DevTools was opened after capture started, Chrome may detach the extension; `browser.console read` and `browser.emulate_device get` then report inactive state. Repeated failure indicates another external client or a Chrome policy restriction, not a reason to bypass the action.

Always stop console capture and reset mobile emulation in `finally`. `unlock_tab`, lease expiry, User Stop, reauthorization and tab close also clean them automatically.

## WHM terminal readback is `source:"unavailable"`

Some bundled xterm versions keep their buffer constructor private, so the
bounded public/legacy buffer reader and accessibility fallback cannot recover
text. Do not interpret the empty result as an empty terminal. Use the dedicated
typed terminal action, not normal DOM typing. Draft without Enter, verify the
exact draft through a bounded screenshot using the detected
`screenshotRegion`, send one Enter only after that verification, and inspect
the result screenshot. A changing xterm DOM no
longer invalidates a stable terminal reference; navigation or replacement of
the terminal root still does.

For terminal input, `deliveryVerification:"unavailable"` means Chrome accepted
the CDP events but the page receipt cannot be observed programmatically. With
no explicit wait, this result is intentionally immediate rather than a false
15-second timeout. Do not resend. If a background screenshot does not show the
draft, use the documented one-time foreground wake-up and repeat only after an
active screenshot proves the draft was not delivered.

Current builds can use a dedicated `websocket_stream` fallback during an
authorized terminal input action. This is separate from the general
metadata-only network tool: it selects only the single socket that carried the
exact staged draft, bounds and redacts decoded terminal text, returns no raw
frames, and discards capture state in `finally`. A standalone `terminal-read`
cannot recover WebSocket frames that occurred before it started.

## `TERMINAL_DELIVERY_UNVERIFIED`

The adapter staged the requested text but could not observe that exact draft in
the xterm/accessibility output or on one unambiguous terminal WebSocket. It
therefore did not send Enter. Do not run `terminal-exec` again: the draft may
already be present. Capture the terminal's bounded `screenshotRegion`; if the
draft is exact, send one separately authorized Enter key. Otherwise clear the
draft before deciding whether a new input action is safe.

## A terminal command appears in WHM `Search Tools`

This means the page moved keyboard focus from xterm to WHM's global search
field. Stop immediately: do not press Enter and do not resend the command. Clear
the misplaced draft manually if it is still present, then confirm that the
latest extension build is loaded.

Current builds focus xterm only after CDP focus emulation is ready, allow
synchronous focus traps to settle, verify the exact helper textarea, and hold a
short-lived xterm-only focus guard while trusted keys are delivered. The guard
is removed immediately afterward and also has a bounded automatic expiry.
Before Enter, focus is checked again. A failed check returns the non-retryable
`TERMINAL_FOCUS_LOST` error and sends no further keys. Treat this error as
uncertain partial draft delivery: inspect a bounded terminal screenshot and the
WHM search field before deciding any next action.

## Mobile CSS viewport differs from the selected preset

The preset controls emulated `screen.width`/`screen.height`, outer dimensions, DPR, orientation and touch. Chrome may expose a wider CSS `innerWidth` when viewport-meta processing, page zoom, shrink-to-fit or the page's own minimum-content width requires it. This is expected mobile rendering behavior and can reveal a real horizontal-overflow bug. Check runtime screen/outer metrics, DPR, a fresh snapshot viewport and the screenshot together. Reset and retry only if the screen metrics themselves do not match the requested profile.

## Event capture appears empty

Start capture before the page action, include the exact case-sensitive event type and scope only to an ancestor that contains the target. Read using the returned `captureId`, then stop it. Captures intentionally omit values and arbitrary custom-event detail. Unlock also stops the capture.

## Injected CSS remains visible

Remove it using the returned `injectionId`, or call `browser.unlock_tab`; unlock removes every remaining injection for that tab. Cleanup metadata persists in `chrome.storage.session` across service-worker suspension. A browser/extension crash may require page reload because injected page CSS is browser process state.

## MCP tools do not appear in Codex

```powershell
pnpm build
codex mcp get invictum-browser
```

If not registered, follow [MCP_CONFIGURATION.md](MCP_CONFIGURATION.md). Start a new Codex task after registration; the current running task does not dynamically acquire newly added MCP tools.

## Native Host exits immediately

Native Messaging stdout is reserved for binary framing. Do not add `console.log` there. Run the generated launcher from a terminal and inspect stderr.

## Tests report a port collision

Normal integration tests request ephemeral ports. Older real-Chrome smoke harnesses may own 47821; stop only a process confirmed as this project's development Desktop Authority. Do not terminate an unrelated listener.
