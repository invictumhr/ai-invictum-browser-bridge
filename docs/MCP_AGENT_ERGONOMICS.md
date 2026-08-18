# Cross-surface agent ergonomics

This guide describes the round-trip, retry, confirmation, and verification
helpers shared by the Invictum MCP adapter, JSON CLI, and TypeScript Agent SDK.
They do not weaken Desktop Authority policy or extension validation. MCP keeps
its own elicitation and media-result formatting, while action orchestration is
implemented once in `@invictum/agent-sdk`.

## Tool metadata and discovery

`tools/list` includes standard MCP annotations:

- `readOnlyHint` for actions that only inspect state;
- `destructiveHint` for actions that may remove data, submit, publish, or
  otherwise create an externally visible effect;
- `idempotentHint` only when repeating the action is inherently safe;
- `openWorldHint` for tools that interact with browser/web state.

These annotations are hints to MCP clients, not authorization. R2/R3 policy is
still enforced by Desktop Authority.

`invictum_capabilities` returns the runtime action list. Each action includes
its risk level, targeting behavior, read-only/destructive/idempotent flags,
whether explicit authorization is required, and the accepted parameter keys.
The full JSON Schemas are authoritative in MCP `tools/list`.

The server also exposes five MCP prompts:

- `login-and-verify`;
- `fill-form-safely`;
- `safe-web-task`;
- `wordpress-edit`;
- `browser-diagnostics`.

## Structured confirmation and elicitation

Missing authorization for an R2/R3 action returns
`CONFIRMATION_REQUIRED`, not a generic parameter error. `error.details`
contains:

- the action and risk level;
- whether the action is destructive;
- the exact `authorization` object shape;
- machine-readable retry guidance.

If the MCP client advertises the 2025-06-18 `elicitation` capability, the MCP
server may show a boolean approval UI and continue after an explicit accept.
Elicitation is used only for approval. Credentials, passwords, OTPs, payment
data, cookies, tokens, file contents, and other sensitive values must never be
requested through elicitation.

Clients without elicitation receive the structured error and must ask the user
normally. An advertised client that does not answer within 15 seconds also
receives structured `CONFIRMATION_REQUIRED` guidance instead of leaving the
browser tool blocked for two minutes. The timeout can be adjusted from 100 to
120000 ms with `INVICTUM_MCP_ELICITATION_TIMEOUT_MS`; keep the default unless a
known interactive MCP client needs longer. Agents must never synthesize
authorization.

## Dry run

Every non-read-only dedicated MCP action accepts:

```json
{
  "dryRun": true
}
```

The adapter returns a bounded, redacted preview with action, risk, target tab,
page context, and available form metadata. It does not execute the action.
Secrets, request bodies, source/code, credentials, authorization, and local
file paths are redacted. Run the same tool again without `dryRun` only after
review and required authorization.

Dry run is an agent-surface orchestration feature. The protocol action itself
remains strict and does not accept a `dryRun` key. MCP dedicated mutating tools,
SDK `enhancedCall()`, CLI `call`, and CLI batch steps expose the same behavior.

## Idempotency

Mutating MCP tools accept:

```json
{
  "idempotencyKey": "publish-post-187-v1"
}
```

The local control API scopes the key to session, action, and tab. For two
minutes it joins an in-flight duplicate or returns the same completed outcome.
Reusing the same key with different parameters fails closed. Use one stable key
for retries of one logical submit/publish/delete/upload/click operation; use a
new key for a different intended operation.

If an R0/R1 action first fails with a stale element and the MCP adapter safely
relocates exactly one replacement, the adapter uses a deterministic internal
derived key for that relocated retry. The caller continues to reuse only its
original logical-operation key. This preserves both stale-reference recovery
and exactly-once behavior without creating a false parameter-collision error.

The TypeScript SDK supports:

```ts
await client.enhancedCall("browser.submit_form", {
  ...parameters,
  idempotencyKey: "checkout-submit-1",
});
```

The CLI raw call supports:

```powershell
pnpm browser call browser.submit_form --stdin --idempotency-key checkout-submit-1
```

Do not interpret idempotency as permission. Policy and authorization still run
on the first execution.

## One-call post-action context

Non-read-only MCP actions, SDK `enhancedCall()`, CLI raw calls, and CLI batch
steps accept:

```json
{
  "postSnapshot": "outline",
  "domDelta": true,
  "verify": {
    "condition": { "type": "text", "value": "Saved", "match": "contains" },
    "timeoutMs": 10000
  }
}
```

- `postSnapshot` returns a fresh bounded `outline` or `interactive` snapshot in
  the same tool result.
- `domDelta` compares the fresh semantic representation with the most recent
  compatible snapshot. If the runner has no baseline, it first attempts one
  bounded pre-action snapshot automatically. The result always explains
  availability with `available: true`, or `available: false` plus a reason such
  as `no_baseline` or `tab_unavailable`. It reports bounded added, removed, and
  changed element IDs. Elements are paired across revision-specific IDs by
  frame plus stable CSS identity, so an unchanged page does not appear as a
  complete remove/add cycle. Pure viewport movement is excluded from the
  semantic signature.
- `verify` runs the normal `browser.wait_for` action after action success and
  before the final snapshot. The returned snapshot therefore represents the
  verified/stable state rather than an intermediate render. URL, title,
  selector, text, and DOM-stable conditions are supported.

For a delta-only request, the adapter automatically reuses the baseline
snapshot detail. If an explicit `postSnapshot` detail differs from the
baseline, it takes a second bounded snapshot at the baseline detail for an
apples-to-apples delta while still returning the requested post-snapshot.

The delta is semantic guidance, not proof that server-side data persisted. For
WordPress and other model-backed apps, re-read the authoritative typed model
after save.

Add `"timings": true` to receive compact `baselineMs`, `actionMs`, `verifyMs`,
`snapshotMs`, and `totalMs` diagnostics for the phases that ran. Timings are
opt-in so normal results stay small.

The shared runner bounds state to 64 tabs and 2,000 semantic references per tab
by default. A document change drops old references. `browser.unlock_tab`,
`browser.close_tab`, `closeSession()`, `invictum_end_session`, and the matching
CLI commands clear applicable state. This prevents a long-lived MCP/SDK process
from accumulating unbounded revision references.

CLI example:

```powershell
'{"tabId":42,"documentId":"doc","domRevision":7,"elementId":"save"}' |
  pnpm browser call browser.click --stdin `
    --post-snapshot outline `
    --dom-delta `
    --verify '{"condition":{"type":"text","value":"Saved"}}' `
    --timings
```

SDK example:

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
});
```

## Safe stale-reference recovery

The extension already supports fingerprint recovery for the immediately
previous revision. The shared MCP/CLI/SDK runner additionally caches semantic
references and may perform one strict recovery for an R0/R1 action:

1. take a fresh interactive snapshot;
2. search by exact frame, role, name, tag, and CSS fingerprint;
3. continue only when exactly one candidate exists;
4. retry once and return `automaticallyRelocated: true`.

R2 and R3 actions are never automatically relocated or retried. Ambiguous
matches fail and require a fresh user/agent decision.

## Set-of-marks screenshots

`invictum_screenshot`, SDK `enhancedCall("browser.screenshot", ...)`, and CLI
raw screenshot calls accept:

```json
{
  "tabId": 42,
  "mode": "viewport",
  "autoMarks": {
    "max": 12,
    "label": "number",
    "includeEditable": true
  }
}
```

The adapter takes a fresh interactive snapshot, chooses visible enabled
non-sensitive controls, adds numbered annotations with the existing screenshot
renderer, and returns a `marks` table mapping each number to `elementId`, role,
and name. Existing annotations and generated marks together remain capped at 20. Auto marks support viewport and full-page modes.

## Conditional batch

`invictum_batch` steps may include:

```json
{
  "id": "save",
  "action": "browser.submit_form",
  "parameters": {},
  "idempotencyKey": "save-42",
  "when": {
    "value": "$steps.check.shouldSave",
    "equals": true
  },
  "retry": {
    "attempts": 2,
    "delayMs": 200
  }
}
```

Retries are allowed only for actions marked idempotent or steps that supply an
`idempotencyKey`. Each step still passes through validation, reservation,
policy, and audit. Nested batches remain forbidden.

## Markdown page text

`invictum_get_page_text` and `browser.get_page_text` accept
`format: "text" | "markdown"`. Markdown preserves semantic headings and uses
lightweight formatting for labels and navigation blocks. It does not invent
links when the sanitized snapshot does not expose an `href`.

## Deliberate non-features

- There is no implicit global `tabId` for risky actions. Explicit tab targeting
  prevents one agent from mutating the wrong tab.
- Console capture is not always on. Chrome debugger attachment is shared and
  costly; use the bounded `start -> action -> read -> stop` diagnostic window or
  the `browser-diagnostics` prompt.
- MCP annotations do not bypass Chrome permissions, User Stop, site access,
  policy, or explicit authorization.
