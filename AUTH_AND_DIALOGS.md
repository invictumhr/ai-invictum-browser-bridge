# Login, HTTP authentication, and native dialogs

This document is the technical reference for credential-adjacent and browser-native dialog actions. AI agents must first read [AGENT_USAGE.md](AGENT_USAGE.md); security invariants are in [SECURITY.md](SECURITY.md).

## Capability summary

| Use case                                   | Action / MCP tool                                                        | Risk | Secret handling                                        |
| ------------------------------------------ | ------------------------------------------------------------------------ | ---: | ------------------------------------------------------ |
| Detect prefilled HTML fields               | `browser.get_page_snapshot` / `invictum_snapshot`                        |   R0 | returns only `hasValue`                                |
| Submit a prefilled HTML login              | `browser.submit_form` / `invictum_submit_form`                           |   R2 | existing DOM values are never returned                 |
| Detect HTTP auth                           | `browser.get_http_auth_state` / `invictum_get_http_auth_state`           |   R0 | origin/scheme/realm only                               |
| Answer HTTP Basic Auth                     | `browser.authenticate_http` / `invictum_authenticate_http`               |   R2 | transient local transport, no persistence/result/audit |
| Handle `alert/confirm/prompt/beforeunload` | `browser.handle_javascript_dialog` / `invictum_handle_javascript_dialog` |   R2 | prompt input excluded from audit                       |
| Resolve an open unsaved-changes block      | `invictum_handle_beforeunload` (typed MCP alias)                         |   R2 | explicit `leave` or `stay`; no page data returned      |

All R2 calls require:

```json
{
  "source": "explicit_user_instruction",
  "instructionId": "stable-id-of-the-authorizing-user-message"
}
```

The instruction must genuinely authorize that effect. It is not a generic session token.

## Prefilled HTML login forms

Snapshots never return the current value of `input`, `textarea`, or contenteditable controls. Each element instead contains:

```json
{
  "sensitive": true,
  "hasValue": true
}
```

`hasValue` answers only whether content exists. For a user-authorized login:

1. take a fresh interactive snapshot;
2. confirm the intended username/password controls have `hasValue: true` without attempting to read them;
3. find the form or submit control in that exact document/revision;
4. call `browser.submit_form` with the user-message authorization;
5. wait for URL/title/selector/text/DOM stability and take a fresh snapshot to verify the result;
6. unlock in `finally`.

Direct password typing remains blocked. This exception permits submission of values already present in the page; it does not expose or modify them.

## HTTP Basic Auth

The extension uses Chrome `webRequest.onAuthRequired` with `webRequestAuthProvider`. It records a sanitized challenge for 60 seconds. No authorization header or credential is exposed.

When opening or navigating directly to a protected URL, use `waitUntil: "none"` so a native auth prompt does not make the load wait time out:

```json
{
  "url": "https://protected.example.test/",
  "active": true,
  "waitUntil": "none"
}
```

Detection:

```json
{ "tabId": 123 }
```

Example sanitized response:

```json
{
  "tabId": 123,
  "challengeDetected": true,
  "origin": "https://protected.example.test",
  "scheme": "basic",
  "realm": "robots",
  "isProxy": false,
  "detectedAt": "2026-07-22T12:00:00.000Z"
}
```

Authentication request shape (placeholders only):

```json
{
  "tabId": 123,
  "username": "USER_SUPPLIED_VALUE",
  "password": "USER_SUPPLIED_VALUE",
  "timeoutMs": 15000,
  "authorization": {
    "source": "explicit_user_instruction",
    "instructionId": "user-message-id"
  }
}
```

The adapter:

- verifies required Chrome permissions and a current HTTP(S) tab;
- binds the attempt to the tab's current origin;
- reloads the tab and answers only a non-proxy, main-frame `Basic` challenge;
- supplies credentials at most once; a second challenge is treated as rejection;
- removes its retained credential reference in `finally`, including timeout/error paths;
- returns no username/password and writes neither to audit;
- reports `credentialsRetained: false` and requires post-login verification.

`Digest`, `NTLM`, `Negotiate`, `Bearer`, proxy auth, embedded URL credentials, and cross-origin reuse are intentionally unsupported. `AUTHENTICATION_FAILED` is not an invitation to loop retries.

Credentials necessarily exist briefly in local MCP/control, Desktop, Native Host, and extension message memory. They are not persisted, returned, or audited, but JavaScript garbage collection cannot guarantee cryptographic RAM erasure. Do not use this development build for high-risk production credentials.

The Bridge cannot control retention by the calling AI client or conversation transcript. A client may display/store MCP tool arguments according to its own policy. Prefer a prefilled form when available, and provide real credentials to an agent only when that client-side exposure is acceptable.

## Native JavaScript dialogs

Content scripts cannot reliably inspect browser-native `alert()`, `confirm()`, `prompt()`, or `beforeunload` UI. The extension therefore uses the Chrome `debugger` permission and the DevTools Protocol `Page` domain for one bounded R2 action.

Prefer arming the handler and triggering the dialog in the same call:

```json
{
  "tabId": 123,
  "accept": true,
  "trigger": {
    "type": "click",
    "documentId": "document-current",
    "domRevision": 7,
    "elementId": "open-confirm-button",
    "scrollIntoView": true
  },
  "timeoutMs": 5000,
  "authorization": {
    "source": "explicit_user_instruction",
    "instructionId": "user-message-id"
  }
}
```

Supported triggers:

- `{"type":"click", ...}` — revision-bound semantic click; best option for buttons/links;
- `{"type":"navigate","url":"https://..."}` — credential-free HTTP(S) navigation with no load wait;
- `{"type":"none"}` — wait for a dialog expected asynchronously during the timeout, or make a best-effort recovery attempt when Chrome still permits a late debugger attachment.

For `prompt`, include `promptText` only when the user supplied or authorized that text. It is never included in audit. `accept: true` accepts/continues; `accept: false` dismisses/stays. The result includes bounded dialog type/message/origin metadata, never the prompt response, and always requires a new snapshot.

The adapter attaches only to the reserved target tab, handles one dialog,
removes listeners, and detaches in `finally`. For `trigger.type: "none"` it
sends `Page.handleJavaScriptDialog` immediately after attach, before
`Page.enable`. This is only best-effort recovery: Chrome can block the debugger
attachment itself after browser-native UI is already visible. If no current
dialog exists, it then enables `Page` and waits for one during the bounded
timeout.
Chrome can display its normal debugging warning/banner. Chrome permits only one
debugger client per tab; close DevTools or another debugger on that tab before
one careful retry.

Always arm the dialog action with a typed `click` or `navigate` trigger before
the action when the user's instruction already determines accept/dismiss. Do
not deliberately open a browser-native modal and then attempt to attach:
Chrome may block every later debugger or DOM command behind that UI. If an
unexpected dialog is already visible, `trigger: {"type":"none"}` is
best-effort only; otherwise the user must close it. Never guess an irreversible
choice.

### WordPress / Chrome “Leave site?” recovery

WordPress sets a dirty-page guard on menu, editor, plugin, settings, and other
admin forms. A redirect or refresh can then open a browser-native
`beforeunload` dialog and block all later DOM actions. MCP exposes a dedicated
alias so agents do not need to remember that Chrome maps “Leave” to
`accept: true`:

```json
{
  "tabId": 123,
  "decision": "leave",
  "navigateUrl": "https://example.test/next",
  "timeoutMs": 5000,
  "authorization": {
    "source": "explicit_user_instruction",
    "instructionId": "user-message-id"
  }
}
```

For reliable navigation, pass `navigateUrl` so the alias arms the bounded R2
dialog adapter before navigating. Without `navigateUrl`, the alias uses
`trigger.type: "none"` as best-effort recovery only after the browser modal is
already visible.
`decision: "stay"` cancels the attempted navigation and preserves the page.
`decision: "leave"` permits it and may discard unsaved changes. If a save was
intended but not verified, choose `stay`, save with the typed WordPress action,
and verify before navigating. Never infer permission to discard changes from a
timeout alone.

## Audit and redaction

Audit includes only bounded operational metadata:

- auth: tab, origin after success, scheme/challenge status, timeout, authorization reference;
- dialog: tab, accept/dismiss, trigger type, dialog type, message hash/length, timeout, authorization reference.

The sanitizer also redacts keys matching username, password, authorization, prompt text, tokens, secrets, cookies, OTP, and related credential terms. Raw credentials, prompt input, JavaScript source, typed text, and screenshot bytes are not retained by the audit sink.

## Installation and verification

These features require extension permissions `webRequest`, `webRequestAuthProvider`, `debugger`, plus HTTP(S) host access. After rebuilding, reload the unpacked extension once at `chrome://extensions`; Chrome may display a new permission warning.

Offline gates:

```powershell
$env:CI='true'
pnpm typecheck
pnpm test
pnpm lint
pnpm build
```

Real-Chrome smoke after Reload:

```powershell
node tests/fixtures/server.mjs
pnpm --filter @invictum/integration-tests smoke:chrome:auth-dialog
```

Open `http://127.0.0.1:47822/basic-form` as the active tab before the smoke command. It validates a real Basic challenge, `hasValue` redaction, a native `confirm()`, post-action state, and guaranteed unlock. Fixture credentials are local deterministic test values only.

The harness adds a unique challenge nonce, so rerunning it still receives a fresh 401 challenge even when Chrome has cached fixture Basic credentials. If Chrome then satisfies the reload from its own cache without a second auth callback, the adapter accepts only the matching recently observed Basic challenge and returns `challengeHandled: false`; the fixture selector still must verify success.

Official API references: [Chrome webRequest](https://developer.chrome.com/docs/extensions/reference/api/webRequest), [Chrome debugger](https://developer.chrome.com/docs/extensions/reference/api/debugger), and [CDP Page dialogs](https://chromedevtools.github.io/devtools-protocol/tot/Page/).
