# Production hardening and advanced diagnostics

This guide covers the reliability, state-boundary, trace, and diagnostics
features added for long-running local agent workflows. Runtime
`system.capabilities` remains authoritative. The current source contains 64
extension actions, one Desktop Authority action, and 74 MCP tools.

## Start every session with health and capabilities

Preferred MCP sequence:

```text
invictum_ping
invictum_health_details
invictum_capabilities
```

`invictum_health_details` reports the Native Host connection, authenticated
control status, controlled-session count, durable-journal status, uncertain
operation count, and persistent-audit status. `GET /v1/health` remains a public,
content-free loopback liveness probe. Every POST requires a bearer token.

The Desktop Authority creates a 256-bit token on first start at:

```text
%LOCALAPPDATA%\InvictumBrowserBridge\control-token
```

MCP, CLI, and the TypeScript SDK read it automatically. Custom clients must
send `Authorization: Bearer <token>`. `INVICTUM_CONTROL_TOKEN` can supply a
valid token for a deliberately managed installation. Never copy the token into
source control, prompts, logs, screenshots, shell history, or remote services.

## Crash-safe idempotency

Use a stable `idempotencyKey` for every logical mutation. Desktop Authority
stores only hashes and lifecycle metadata in:

```text
%LOCALAPPDATA%\InvictumBrowserBridge\operation-journal.jsonl
```

The journal records pending, completed, failed, and unknown outcomes without
parameters or results. A pending entry found after restart becomes `unknown`.
Completed, failed, pending, and unknown replays fail closed with
`IDEMPOTENCY_REPLAY_BLOCKED`; the Bridge never guesses that a click, post,
download, or terminal command should be repeated. Inspect current page/server
state first, then create a new logical operation with a new key only when the
desired effect is provably absent.

`invictum_transaction` is the recommended single-action wrapper. It accepts an
action plus parameters and can add `dryRun`, verification, post-snapshot,
semantic DOM delta, timings, and a privacy-preserving visual trace. A
non-idempotent action requires an idempotency key.

## Persistent audit

Sanitized audit entries are appended to:

```text
%LOCALAPPDATA%\InvictumBrowserBridge\audit.jsonl
```

The file is bounded to 20 MiB with one `.1` rotation. Audit stores action,
policy, outcome, safe structural metadata, and hashes where applicable. It does
not store credentials, raw typed text, terminal commands/output, upload paths,
download paths, page API bodies, JavaScript source/results, screenshot pixels,
WebMCP arguments/results, or raw page content. The operating-system user
boundary remains important: another process running as the same user may read
local application files.

## Per-domain boundaries

Open the extension toolbar popup while the target hostname is active and choose:

| Mode                     | Allowed work                                  |
| ------------------------ | --------------------------------------------- |
| Allow with Bridge policy | Existing R0-R3 policy and authorization rules |
| Observe only             | Read-only actions only                        |
| Safe interaction         | Diagnostics plus R0/R1 actions                |
| Trusted admin            | Normal Bridge policy except terminal input    |
| Block agent access       | No targeted agent control                     |

The extension checks both the current tab URL and a requested destination URL.
The default preserves existing behavior. Incognito tabs are always denied.
Chrome Site access, User Stop, explicit R2/R3 authorization, and restricted-page
rules remain independent gates and cannot be weakened by a domain mode.

## Advanced read-only diagnostics

| MCP tool                       | Purpose                                                                                          |
| ------------------------------ | ------------------------------------------------------------------------------------------------ |
| `invictum_list_frames`         | Sanitized main-frame/iframe topology                                                             |
| `invictum_navigation_state`    | Readiness, visibility, bounded sanitized history, and navigation timing                          |
| `invictum_performance_metrics` | Aggregate CDP metrics, resource totals, and available Web Vitals without resource URLs or bodies |
| `invictum_accessibility_tree`  | Bounded value-redacted accessibility tree and SHA-256 fingerprint                                |
| `invictum_accessibility_diff`  | Best-effort diff against this MCP process's prior per-tab tree                                   |
| `invictum_compare_screenshot`  | Current viewport versus a bounded JPEG baseline, with statistics and a red/grayscale visual diff |

Accessibility-diff baselines are intentionally process-local and best effort;
they disappear when the MCP process restarts. Screenshot comparison requires
equal dimensions. Use semantic DOM/AX diffs for meaning and screenshot diffs
for rendering regressions.

For a mutation, set `visualTrace: true` through MCP, CLI, or SDK enhancements
to receive only pre/post SHA-256 screenshot fingerprints, dimensions, byte
lengths, and a changed flag. Request explicit screenshots only when pixels are
actually needed.

## Managed downloads

Use `invictum_download`, then `invictum_wait_for_download`. The start is R2 and
requires an explicit user-instruction authorization. The adapter accepts only
credential-free HTTP(S) URLs, applies a caller-supplied byte ceiling, blocks
path traversal and executable extensions, refuses dangerous-file acceptance,
removes a managed file that finishes past those boundaries before cancellation,
and waits only on an ID created by IBB for the same tab. Results expose a
basename and sanitized URL, never an absolute local path. IBB does not open or
execute a downloaded file.

## Experimental page WebMCP

`invictum_list_webmcp_tools` feature-detects Chrome's experimental page WebMCP
surface. Unsupported Chrome builds or pages return `supported: false` rather
than falling back to arbitrary JavaScript. Tool names, descriptions, schemas,
and all invocation results are page-controlled and therefore marked
`untrusted: true`.

At the time of writing the surface requires Chrome 149+ with the WebMCP testing
flag enabled, or an eligible origin trial. IBB does not change Chrome flags and
does not treat feature absence as an installation failure.

Invoke a discovered tool only with `invictum_invoke_webmcp_tool`, explicit R3
authorization, an exact `frameId`/tool name, bounded arguments, and a timeout.
Timed-out work is cancelled and must not be retried automatically. Use
`invictum_cancel_webmcp_invocation` for a known invocation. WebMCP never
bypasses domain policy, tab reservation, User Stop, or Desktop Authority.

## Resilience after restart, sleep, and browser updates

CLI and MCP already start Desktop Authority when the control API is absent.
The Chrome-launched Native Host now performs the same bounded health probe and
starts the exact built Desktop Authority in a hidden process when necessary.
Set `IBP_NATIVE_HOST_AUTOSTART=false` only for controlled debugging.

Native Messaging and the private WebSocket retain their existing reconnect and
heartbeat behavior. The operation journal prevents an interrupted mutation
from being blindly replayed. Validate a long-running installation with:

```powershell
pnpm build
pnpm test:soak -- 100
```

The soak command performs read-only full-round-trip pings and reports min,
median, p95, and maximum latency. Run it before and after sleep, Windows login,
Chrome restart, browser update, and Desktop Authority termination. It does not
mutate a page.

## CLI shortcuts

```powershell
pnpm browser health-details
pnpm browser frames <tabId>
pnpm browser navigation-state <tabId>
pnpm browser performance <tabId>
pnpm browser accessibility <tabId>
pnpm browser download <tabId> <https-url> --instruction <authorization-id>
pnpm browser download-wait <tabId> <downloadId> [timeoutMs]
pnpm browser webmcp-list <tabId>
pnpm browser webmcp-invoke <tabId> <frameId> <toolName> --stdin --instruction <authorization-id>
pnpm browser compare-screenshot <tabId> <baseline.jpg> [diff.jpg]
pnpm browser transaction <action> --stdin
```

Add `--visual-trace` to an enhanced mutating command when compact visual
evidence is useful. Keep secrets and page-controlled payloads on stdin, never
in argv.

## Reload and release gate

Changes to the manifest, background worker, popup, or content script require
one Reload of `apps/extension/dist` at `chrome://extensions`. Then run:

```powershell
pnpm browser ping
pnpm browser health-details
powershell -ExecutionPolicy Bypass -File .\scripts\verify-after-reload.ps1
```

The current source gate expects 65 full-system actions (64 from the extension
plus `system.health_details`) and 74 MCP tools. Always prefer the live
capability response over hard-coded counts in an agent workflow.
