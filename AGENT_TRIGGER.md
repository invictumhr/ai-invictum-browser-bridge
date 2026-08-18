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
3. If MCP is unavailable, read
   `D:\laragon\www\invictum\invictum-browser-bridge\AGENT_USAGE.md` and use the
   documented CLI/control-API fallback. The CLI starts or repairs Desktop
   Authority automatically.
4. Use `invictum_open_tab` for a new page. Omit `active` unless the task
   genuinely requires showing or focusing the tab. Background work must not
   interrupt the user.
5. Optionally call `invictum_set_control_identity` once per controlled tab with
   `Codex`, `Cursor`, `Claude`, or the current agent name.
6. Prefer semantic snapshot/find/typed actions. Use bounded JavaScript only
   when authorized and necessary; use screenshots and coordinate clicks as the
   final fallback.
7. Respect User Stop, Bridge policy, restricted pages, credential rules, and
   explicit-authorization requirements.
8. Before navigating away from a dirty WordPress or other form, call
   `invictum_handle_beforeunload` with `navigateUrl` so the native handler is
   armed before Chrome opens “Leave site?”. Choose `stay` to preserve the page
   or `leave` to continue and potentially discard changes. Never guess `leave`;
   the user instruction must determine the choice. Recovery after a visible
   modal is already open is best effort only.
9. Close disposable agent-created test tabs with `invictum_close_tab` in
   `finally`. Never close an ordinary user tab without explicit authorization.
10. Always call `invictum_unlock_tab` in `finally`, or call
    `invictum_end_session` once at task completion.

For complete schemas, recovery, authentication, upload, WordPress tools,
screenshots, clean text, natural-language find, history navigation,
same-origin page API calls, batching, console/network/mobile diagnostics,
gestures, PDF export, DOM/CSS inspection, and testing, read
[AGENT_USAGE.md](AGENT_USAGE.md).
