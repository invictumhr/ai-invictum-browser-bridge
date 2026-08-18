# Browser-hosted terminal automation

This guide covers xterm-compatible terminals embedded in normal HTTP(S)
pages, including WHM/cPanel Terminal. It does not provide an operating-system
shell and does not bypass the web application's login, session, permissions,
or server-side authorization.

## Safety and authority

- Detection is R0 and does not read terminal output.
- Buffer readback is R2 because terminal output can contain credentials,
  private paths, customer data, or command results.
- Every text/key input is R3 because it can execute a remote command or alter a
  running process. It always requires an exact explicit user authorization.
- Never convert a read-only request into terminal input. Never infer permission
  to run a command from permission to inspect the page.
- Never retry terminal input automatically after an uncertain delivery error.
  Detect/read the terminal and determine whether the command was delivered.
- Do not type passwords, tokens, private keys, or other secrets through a
  generic terminal action. Prefer SSH agent, the typed HTTP Auth workflow, or
  another purpose-built secret channel.
- Read the smallest useful output window and do not repeat terminal output in
  the final answer unless the task requires it.

The Desktop Authority audit contains the terminal ID, action type, key/modifier
state, wait type, and a SHA-256/length for typed text. It does not record raw
commands or returned terminal output. Bounded readback still applies automatic
redaction for common passwords, tokens, Authorization/Bearer values, JWTs,
private-key blocks, and `cpsess` identifiers. Redaction is defense in depth,
not proof that arbitrary terminal output is non-sensitive.

## Why ordinary page typing does not work

xterm commonly renders text to canvas and keeps a tiny off-screen helper
`textarea`. A semantic page snapshot can detect the surrounding widget but
cannot read the canvas, and `browser.type_text` correctly refuses the hidden
textarea. The dedicated terminal adapter therefore:

1. detects `.xterm` roots in a fixed isolated-world probe;
2. returns a revision-bound terminal reference;
3. reads a bounded xterm buffer through a fixed CDP routine, with an
   accessibility-DOM fallback;
4. enables background focus emulation, then focuses only the terminal's helper
   textarea;
5. lets synchronous focus traps settle and verifies that exact input;
6. installs a short-lived xterm-only focus guard while sending trusted CDP
   text/key input;
7. proves the exact staged draft through native/accessibility output or one
   unambiguous terminal WebSocket before Enter;
8. verifies focus again before Enter and fails closed if focus was lost;
9. releases the focus guard, transport listener, and shared debugger lease in
   `finally`;
10. waits for changed output plus a prompt/text/quiet condition, using a
    bounded redacted `websocket_stream` when the vendor hides its xterm buffer.

No agent-supplied JavaScript is evaluated. The tab remains in the background;
terminal actions never call `tabs.update({active:true})`.

## Preferred MCP workflow

1. `invictum_ping`
2. `invictum_capabilities`; require `terminalAutomation`,
   `trustedTerminalInput`, `terminalBufferReadback`, and
   `terminalTransportReadback`
3. open a new background tab or choose the user-authorized tab
4. optionally set the agent identity
5. `invictum_detect_terminals`
6. select exactly one descriptor; retain its `documentId`, `domRevision`, and
   `terminalId`
7. `invictum_read_terminal` with explicit authorization and a small
   `maxLines`
8. when the user explicitly requested the exact command,
   `invictum_execute_terminal` once with a stable `idempotencyKey`; it stages
   and proves the draft before its one Enter
9. verify returned `draftVerification`, `deliveryVerification`,
   `output.source`, `output.matched`, `output.timedOut`, and the expected
   bounded output; use
   `invictum_wait_for_terminal` for a longer-running command
10. detect again after a page DOM change/reload; terminal references are stale
11. unlock the tab or end the session in `finally`

Dedicated MCP tools:

- `invictum_detect_terminals`
- `invictum_read_terminal`
- `invictum_wait_for_terminal`
- `invictum_type_terminal` (draft only; still R3)
- `invictum_execute_terminal` (text plus exactly one Enter)
- `invictum_send_terminal_key`

Example detection:

```json
{ "tabId": 42 }
```

Each descriptor includes a nullable `screenshotRegion` in document CSS pixels:

```json
{
  "terminalId": "xterm-1",
  "screenshotRegion": {
    "x": 120,
    "y": 240,
    "width": 960,
    "height": 480,
    "coordinateSpace": "document"
  }
}
```

Pass that object unchanged to `invictum_screenshot` with `mode:"region"`.
This captures only the terminal canvas and is preferred over a full WHM
viewport because it exposes less unrelated administration UI. Detect again
after navigation, root replacement, or layout movement before reusing it.

Example bounded read:

```json
{
  "tabId": 42,
  "documentId": "terminal-document-id",
  "domRevision": 3,
  "terminalId": "xterm-1",
  "maxLines": 40,
  "includeScrollback": false,
  "authorization": {
    "source": "explicit_user_instruction",
    "instructionId": "user-read-whm-terminal"
  }
}
```

Example command explicitly requested by the user:

```json
{
  "tabId": 42,
  "documentId": "terminal-document-id",
  "domRevision": 3,
  "terminalId": "xterm-1",
  "command": "php -v",
  "waitFor": { "type": "prompt" },
  "timeoutMs": 30000,
  "maxOutputLines": 60,
  "idempotencyKey": "inspect-php-version-once",
  "authorization": {
    "source": "explicit_user_instruction",
    "instructionId": "user-run-php-version"
  }
}
```

`execute_terminal` inserts one printable line and sends Enter exactly once.
ASCII control characters and embedded newlines are rejected. Use the key tool
for Enter, Escape, arrows, navigation keys, F1-F12, or the bounded
Ctrl/Alt/Meta/Shift combinations.

## Waiting and long-running commands

Wait conditions are:

- `{"type":"prompt"}`: a bounded shell-like prompt ending in `$`, `#`, `>`,
  or `%`;
- `{"type":"text","value":"Ready","match":"contains","caseSensitive":false}`;
- `{"type":"quiet","stableMs":500}`: output unchanged for the interval.

Terminal input captures a baseline before delivery. A wait is not successful
until output changes, so an old prompt cannot produce a false immediate
success. Submitted commands default to prompt wait. Draft text defaults to a
short quiet wait. A timeout returns the final bounded read with
`matched:false`, `timedOut:true`; it does not imply that input failed and must
not trigger an automatic retry.

Every input result has a top-level `deliveryVerification` value:

| Value                | Meaning                                                                               |
| -------------------- | ------------------------------------------------------------------------------------- |
| `observed`           | Readable output changed and the applicable wait condition matched.                    |
| `transport_observed` | One terminal WebSocket carried the exact draft, but response output was not observed. |
| `not_requested`      | No output observation was requested for this key action.                              |
| `unavailable`        | Chrome accepted the events, but page receipt cannot be read or proven.                |
| `timed_out`          | A readable source existed, but the wait condition did not match.                      |

When the baseline source is unavailable and the caller did not explicitly add
`waitFor`, implicit draft/prompt verification returns immediately as
`deliveryVerification:"unavailable"`, `matched:false`, `timedOut:false`.
This avoids a misleading 15-second timeout. It does not make delivery certain
and must not cause an automatic resend.

Text input also returns `draftVerification`:

| Value                | Meaning                                                        |
| -------------------- | -------------------------------------------------------------- |
| `buffer_observed`    | Exact draft appeared in native/accessibility terminal output.  |
| `transport_observed` | Exactly one terminal WebSocket carried the exact staged draft. |
| `unavailable`        | Receipt is unproven; submitted text fails before Enter.        |
| `not_applicable`     | The action was a standalone special key.                       |

The WebSocket fallback is not general body capture. It exists only inside the
authorized terminal action, retains at most bounded in-memory terminal text,
selects a socket only when the exact requested draft identifies it uniquely,
never returns raw frames, applies the normal terminal redaction, and discards
all capture state in `finally`. The general network tool remains metadata-only.

If a vendor xterm does not expose its JavaScript buffer, an input action may
instead report `source:"websocket_stream"`. WebSocket capture starts with that
action and cannot recover older scrollback for a later standalone read. If
neither native/accessibility readback nor one unambiguous terminal transport can
prove the staged draft, `terminal-exec` returns non-retryable
`TERMINAL_DELIVERY_UNVERIFIED` and does not send Enter. Use the detected
terminal's `screenshotRegion`, verify the already staged draft, send one
separately authorized Enter key, then verify the resulting screenshot. Never
retype merely because programmatic readback is unavailable.

For commands that legitimately exceed 120 seconds, start the command once,
then make separate explicitly authorized `read_terminal` or
`wait_for_terminal` calls. Use task-specific output markers when possible.
Full-screen applications use xterm's alternate buffer; the result reports
`buffer:"alternate"` when available.

## CLI

The CLI detects the terminal first and automatically supplies its current
document/revision reference. If the page has multiple terminals, add
`--terminal <terminalId>`.

```powershell
pnpm browser terminals 42
pnpm browser terminal-read 42 --lines 40 --instruction user-read-terminal
pnpm browser terminal-read 42 --scrollback --wait-text Ready --instruction user-read-terminal
pnpm browser terminal-type 42 "draft only" --instruction user-type-terminal
pnpm browser terminal-exec 42 "php -v" --wait-prompt --instruction user-run-php-version
pnpm browser terminal-key 42 c --ctrl --instruction user-interrupt-process
```

Do not put secrets in CLI argv; argv can be exposed through shell history and
process inspection. Use MCP or SDK for commands that contain sensitive
agent-supplied data, while still following the rule against generic secret
entry.

## Agent SDK and control API

```ts
await client.withReservedTab(tabId, async (browser) => {
  const detected = await browser.getTerminals(tabId);
  if (detected.count !== 1) throw new Error("Choose exactly one terminal");
  const terminal = detected.terminals[0]!;
  const reference = {
    tabId,
    documentId: terminal.documentId,
    domRevision: terminal.domRevision,
    terminalId: terminal.terminalId,
    authorization: {
      source: "explicit_user_instruction" as const,
      instructionId: "user-run-php-version",
    },
  };
  const before = await browser.readTerminal({ ...reference, maxLines: 40 });
  const result = await browser.executeTerminal(reference, "php -v");
  if (!result.output.matched || result.output.timedOut) {
    throw new Error("Command completion is uncertain; inspect without retrying input");
  }
});
```

Strict control API actions are:

- `browser.get_terminals`
- `browser.read_terminal`
- `browser.terminal_input`

The generic input shape is either:

```json
{ "type": "text", "text": "php -v", "submit": true }
```

or:

```json
{ "type": "key", "key": "c", "ctrl": true }
```

## WHM/cPanel recommendations

- Open a new IBB tab instead of taking over another agent's WHM tab.
- Keep the WHM terminal tab in the background by default. If no `.xterm` root
  appears after a 20-second readiness window, use one explicit tab activation
  as a renderer wake-up, wait up to 20 seconds again, then return to background
  work and restore the previously active user tab when safe. Never flash or
  repeatedly activate the tab.
- Trusted terminal input temporarily enables CDP focus emulation, allowing a
  background page to receive keyboard events without making its tab active.
  The adapter disables that override in `finally`, including on timeout/error.
  This is distinct from real tab activation and does not change the user's
  selected tab.
- WHM can asynchronously restore focus to its global `Search Tools` input.
  The adapter therefore settles and verifies the selected xterm after focus
  emulation is enabled, holds a short-lived xterm-only guard during key
  delivery, and verifies again immediately before Enter. The guard is released
  after the delivery window and expires automatically if cleanup cannot run.
  `TERMINAL_FOCUS_LOST` is non-retryable: send no more keys, inspect the terminal
  region and WHM search field, and do not infer that the command was absent.
- `terminal-exec` stages text before Enter and requires exact evidence from the
  native/accessibility readback or one uniquely identified terminal WebSocket.
  `TERMINAL_DELIVERY_UNVERIFIED` means Enter was withheld, not that the draft is
  absent. Inspect the terminal crop instead of retrying the text.
- Some WHM xterm builds detect successfully but accept or paint trusted text
  only while the tab is active even after focus emulation. Type a harmless
  authorized draft without Enter and verify it visually. If the background
  screenshot does not show the draft, wait for the same bounded readiness
  window, activate once, and take another screenshot. Repeat the draft only
  when the active screenshot proves that no text was delivered; otherwise
  delivery is uncertain and must not be retried.
  Keep the tab active only for the required input/result capture and restore the
  previously active user tab afterward when it is still safe to do so.
- Detect the xterm directly. Do not search for or type into the hidden helper
  textarea with normal DOM tools.
- If readback is unavailable, use the typed draft -> screenshot verification
  -> one Enter -> screenshot verification sequence. Screenshots can contain
  terminal secrets; keep them local and quote only the minimum safe result.
- Prefer one non-interactive command with bounded output over a full-screen
  TUI. Add command-specific, non-secret completion text when practical.
- Do not scrape the page snapshot for canvas output.
- WHM session URLs contain `cpsess` identifiers. Results redact these, but
  agents must not copy them into logs, documentation, or final responses.
- A WHM/browser session expiring is an authentication state change, not a
  terminal failure. Stop and have the user restore access.
- A login page, consent screen, browser error, or challenge is not a
  lazy-render failure and must not trigger repeated focus changes.
- Visible DevTools can own Chrome's debugger attachment. Close DevTools for
  that tab and retry one read-only operation; never retry a command solely due
  to a debugger conflict.

## Verification

Automated coverage includes protocol and policy contracts, extension unit
tests for detection/read/redaction/trusted input/no-activation, focus theft
before delivery, suppression of Enter after mid-delivery focus loss, focus
guard cleanup, exact WebSocket selection, ambiguous-socket refusal,
transport-output redaction, suppression of Enter for an unverified draft, MCP
mapping, and the deterministic `/xterm-terminal` real-Chrome fixture.

The prepared 2026-08-17 transport build has passed focused type/unit tests but
requires extension Reload before its live WHM behavior is claimed. The first
live check must use a harmless command draft; no Enter may be sent unless
`draftVerification` is `transport_observed` or `buffer_observed`.

The 2026-08-17 post-Reload real-Chrome fixture passed with one canvas terminal,
`xterm_buffer` output, trusted input, `tabActivated:false`, successful prompt
matching, and two applied secret redactions while the terminal tab remained in
the background.

After rebuilding and reloading the unpacked extension:

```powershell
pnpm build
node tests/fixtures/server.mjs
pnpm --filter @invictum/integration-tests smoke:chrome:terminal
```

Never use the live WHM terminal as a destructive smoke test. Detection and a
small explicitly authorized read are sufficient until the user supplies an
exact harmless command to run.
