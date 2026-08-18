# Agent productivity actions

This guide covers the high-level actions that reduce round trips without
weakening the Bridge's per-action policy, audit, reservation, and cleanup
model.

Always begin with `invictum_ping` and `invictum_capabilities`. Treat the
installed extension's capabilities as authoritative.

## Clean page text

Action: `browser.get_page_text`  
MCP: `invictum_get_page_text`  
CLI: `text <tabId> [maxChars]`

Use this for articles, documentation, result pages, and other reading tasks
where interactive element metadata is unnecessary. It joins only sanitized
semantic text blocks, never control values, and is capped at 200,000
characters.

An optional revision-bound `scope` limits extraction to a known subtree:

```json
{
  "tabId": 42,
  "maxChars": 50000,
  "scope": {
    "documentId": "document-...",
    "domRevision": 7,
    "elementId": "main-content"
  }
}
```

Use `snapshot` when element structure or actionable references are needed.

## Natural-language element discovery

Action: `browser.find_natural_language`  
MCP: `invictum_find_natural_language`  
CLI: `natural <tabId> "<query>"`

This is a deterministic local locator, not a remote AI call. It ranks current
semantic controls by accessible name, role, visible text, tag, selector hints,
visibility and enabled state.

Examples:

```text
Update button
select all checkbox
country dropdown
search input
```

The result includes fresh `documentId`, `domRevision`, `elementId`, score and
bounded scoring reasons. Prefer exact `find_elements` when exact criteria are
already known or before a destructive action where uniqueness matters.

## History and explicit foreground activation

Actions:

- `browser.go_back`
- `browser.go_forward`
- `browser.activate_tab`

MCP:

- `invictum_go_back`
- `invictum_go_forward`
- `invictum_activate_tab`

CLI:

```powershell
pnpm browser back 42
pnpm browser forward 42
pnpm browser activate 42
```

Back and forward never activate the tab. `activate_tab` is an explicit,
audited foreground action. Do not use it for snapshots, screenshots, normal
interaction, diagnostics, mobile emulation, PDF export, text extraction, or
API calls. The user's toolbar setting remains the default for `open_tab` and
`navigate` when `active` is omitted.

For applications that genuinely delay rendering while backgrounded (observed
in parts of Google Search Console, Cloudflare, and WHM/cPanel Terminal), first
wait 20 seconds for a task-specific readiness condition. If and only if the
expected renderer is still absent, activate once, wait up to 20 seconds again,
then restore the user's previously active tab when it is still safe to do so.
Never activate repeatedly, and never classify login, consent, challenge,
permission, or error UI as a lazy-render timeout.

Navigation completion is tied to the triggered load. The adapter installs its
Chrome update listener before `navigate`, `go_back`, or `go_forward`, so an
already-complete previous page cannot be mistaken for completion of the new
history entry. Existing-tab navigation uses Chrome's official
`chrome.tabs.update({url})` navigation contract. A 2026-08-17 live gate proved
that isolated-world `location.assign` changed the document but did not leave a
usable Chrome Back/Forward entry in the tested Chrome build. Activation remains
a separate setting and does not require foreground focus.

If Chrome's `tabs.goBack` or `tabs.goForward` promise rejects immediately, the
adapter performs one bounded fallback through the existing shared debugger
session: it reads `Page.getNavigationHistory` and targets only the adjacent
entry with `Page.navigateToHistoryEntry`. The fallback does not run for a
navigation-completion timeout, so a blocking `beforeunload` dialog still
requires the explicitly armed dialog workflow. It never activates the tab.

## Same-origin page API

Action: `browser.page_api_request`  
MCP: `invictum_page_api_request`  
CLI: `api <tabId> <method> <url> [body] --instruction <id>`

Use this when the page itself exposes a first-party REST endpoint and semantic
UI interaction would be slower or less reliable. The request executes in the
page origin with the browser's existing same-origin credentials. It supports
`GET`, `POST`, `PUT`, `PATCH`, and `DELETE`.

Example:

```json
{
  "tabId": 42,
  "method": "POST",
  "url": "/wp-json/wp/v2/posts/123",
  "body": {
    "title": "Updated title"
  },
  "useWordPressNonce": true,
  "responseMode": "json",
  "authorization": {
    "source": "explicit_user_instruction",
    "instructionId": "update-post-123"
  }
}
```

Security boundaries are deliberate:

- URL must resolve to the controlled tab's exact HTTP(S) origin;
- URL credentials, fragments and redirects are rejected;
- only `Accept`, `Content-Type`, `If-Match`, and `If-None-Match` are accepted;
- cookies and browser credentials remain inside Chrome;
- an optional WordPress REST nonce is read and applied inside the page but is
  never returned;
- request bodies are never returned or written to audit;
- query values, credential-shaped JSON keys and token-shaped response text
  are redacted;
- response content is bounded to 500,000 characters;
- non-GET requests report `verificationRequired`;
- every call is R3 and requires explicit user authorization, including GET.

The manual redirect mode prevents a request from silently leaving the origin.
Use semantic state, a fresh snapshot, or a follow-up bounded GET to verify
mutations. Never use the page API to bypass WordPress capabilities or the
Bridge's submit/upload policies.

## Policy-preserving batch

MCP: `invictum_batch`  
CLI: `batch --stdin`  
SDK: `client.batch(steps)`

A batch runs 1–25 actions sequentially through the ordinary local control API.
Every step retains its normal schema validation, risk classification,
authorization check, audit entry, tab reservation, stale-reference behavior,
and error result. A batch is orchestration, not a privileged protocol action.

```json
{
  "steps": [
    {
      "id": "open",
      "action": "browser.open_tab",
      "parameters": {
        "url": "https://example.com/"
      }
    },
    {
      "id": "text",
      "action": "browser.get_page_text",
      "parameters": {
        "tabId": "$steps.open.tab.id",
        "maxChars": 20000
      }
    }
  ]
}
```

Placeholders must occupy the entire value and use one of:

```text
$steps.<step-id>.<property.path>
$last.<property.path>
```

Duplicate IDs, nested batches, missing placeholder paths, and more than 25
steps are rejected. Execution stops at the first failure unless
`continueOnError: true` is set. Prefer the default stop behavior for mutations.

Do not batch screenshots or other large binary results unless the caller
specifically needs them together; dedicated screenshot calls produce better
media handling.

## Recommended flow

```text
ping
capabilities
open_tab or list_tabs
set_control_identity once
get_page_text or natural find
typed action / same-origin page API / short batch
wait and verify
unlock_tab in finally
```

Use `invictum_end_session` when one agent has reserved multiple tabs.
