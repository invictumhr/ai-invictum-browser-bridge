# IBB / IBG agent trigger

This is the short discovery contract for Invictum Browser Bridge.

## Recognized phrases

Treat all of these as the same explicit request:

- `koristi IBB`
- `koristi IBG`
- `koristi Invictum Browser Bridge`
- `koristi Invictum Browser Gate`
- `use IBB` / `use IBG`
- `use Invictum Browser Bridge` / `use Invictum Browser Gate`

`IBB` is the canonical acronym. `IBG` and “Browser Gate” are supported
user-facing aliases.

## Required behavior

1. Use the `invictum_*` MCP tools. Do not silently substitute an unrelated
   browser, Playwright profile, or direct Chrome-debugging connection.
2. Start with `invictum_ping`, then `invictum_capabilities`. Installed runtime
   capabilities are the source of truth.
3. If MCP is unavailable, read [AGENT_USAGE.md](AGENT_USAGE.md) from this
   repository and use the documented CLI/control-API fallback. The CLI starts
   or repairs Desktop Authority automatically.
4. Use `invictum_open_tab` for a new page. Omit `active` unless the task
   genuinely requires showing or focusing the tab. Background work must not
   interrupt the user. Agent tabs open in the agent's own Chrome window, so they
   never replace the tab the user is looking at, and that window is never raised
   over the user's.
5. Some applications lazily initialize only after their tab becomes visible,
   including parts of Google Search Console, Cloudflare, and WHM/cPanel
   Terminal. First keep the tab in the background and wait up to 20 seconds for
   the task-specific page root or terminal to appear. Only after that readiness
   timeout may the agent call `invictum_activate_tab` once as a wake-up
   fallback, wait up to 20 seconds again, and then restore the previously active
   user tab if it still exists and the user has not selected another tab. Never
   use a focus loop, and do not treat authentication, consent, challenge, or
   error pages as lazy-render failures.
6. Optionally call `invictum_set_control_identity` once per controlled tab with
   `Codex`, `Cursor`, `Claude`, or the current agent name.
7. Prefer semantic snapshot/find/typed actions. Use bounded JavaScript only
   when authorized and necessary; use screenshots and coordinate clicks as the
   final fallback.
8. Respect User Stop, Bridge policy, restricted pages, credential rules, and
   explicit-authorization requirements.
9. For a Figma design file, use the typed Figma tools. Call
   `invictum_figma_healthcheck` first: it tells an unloaded file apart from a
   changed Figma UI. The layer panel is virtualised, so results are partial by
   design, and `figma_select` changes the live selection collaborators can see.
   See [docs/FIGMA.md](docs/FIGMA.md).
10. For WHM/cPanel or another canvas xterm, use the dedicated terminal tools.
    Detection does not read output; reads require R2 authorization and every
    text/key input requires exact R3 authorization. Inspect `draftVerification`
    and `deliveryVerification`. A text action with `submit:true` sends Enter only
    after the exact draft is proved in the terminal buffer or on exactly one
    scoped terminal WebSocket. `TERMINAL_DELIVERY_UNVERIFIED` means Enter was
    withheld. Inspect the error detail: current builds try `Ctrl+U` and state
    whether the staged line was cleared. If clearing was not proved, never
    retype or retry automatically; inspect the bounded terminal crop first.
11. Before navigating away from a dirty WordPress or other form, call
    `invictum_handle_beforeunload` with `navigateUrl` so the native handler is
    armed before Chrome opens “Leave site?”. Choose `stay` to preserve the page
    or `leave` to continue and potentially discard changes. Never guess `leave`;
    the user instruction must determine the choice. Recovery after a visible
    modal is already open is best effort only.
12. Close disposable agent-created test tabs with `invictum_close_tab` in
    `finally`. Never close an ordinary user tab without explicit authorization.
13. Always call `invictum_unlock_tab` in `finally`, or call
    `invictum_end_session` once at task completion.

For complete schemas, recovery, authentication, upload, WordPress tools,
screenshots, clean text, natural-language find, history navigation,
same-origin page API calls, Figma design files, batching,
console/network/mobile diagnostics,
gestures, PDF export, DOM/CSS inspection, and testing, read
[AGENT_USAGE.md](AGENT_USAGE.md).
