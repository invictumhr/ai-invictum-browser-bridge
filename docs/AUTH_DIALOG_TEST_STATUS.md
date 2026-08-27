# Auth/dialog test status

> Dated verification record. Use [../AGENT_USAGE.md](../AGENT_USAGE.md),
> [../AUTH_AND_DIALOGS.md](../AUTH_AND_DIALOGS.md), and runtime capabilities for
> current operating instructions.

Last updated: 2026-07-22 (Europe/Zagreb).

## Completed offline verification

- `pnpm typecheck`: 19/19 tasks passed.
- `pnpm test`: 105 unit tests and 11 integration tests passed.
- `pnpm lint`: 19/19 tasks plus repository formatting passed.
- `pnpm build`: 11/11 packages built; unpacked extension `dist` is current.
- MCP stdio handshake: 23 tools returned, including auth-state, authenticate, and JavaScript-dialog tools.
- Automated coverage includes one-attempt Basic Auth, no-challenge failure, native confirm/prompt handling, CDP detach cleanup, protocol/handler routing, R0/R2 policy, and audit exclusion for username/password/prompt text.

## Post-Reload verification — passed

The user reloaded **Invictum Browser Controller** and the live Chrome verification passed on 2026-07-22 at 17:10 Europe/Zagreb.

Live `system.capabilities` returned 21 actions and all three new feature flags:

- `prefilledCredentialPresence: true`;
- `httpBasicAuth: true`;
- `nativeJavaScriptDialogs: true`.

The full Desktop Authority → Native Host → reloaded extension round trip returned `pong`. The deterministic auth/dialog smoke then returned:

```json
{
  "authenticated": true,
  "credentialsRetained": false,
  "prefilledCredentialPresence": true,
  "passwordSensitive": true,
  "dialog": {
    "handled": true,
    "accepted": true,
    "type": "confirm",
    "triggerType": "click"
  },
  "finalTitle": "Invictum Phase 2 Form Fixture"
}
```

The persistent agent-control smoke also passed against the reloaded extension with 21 capabilities, `open_tab`, `wait_for`, semantic and scoped snapshots, `navigate`, DOM-stability waiting, automatic reservation, and automatic unlock.

The cached-credential rerun also passed: when Chrome satisfied the fixture reload from its own auth cache, the adapter accepted only the matching recently detected Basic challenge and the smoke still verified `#auth-success`, `credentialsRetained: false`, prefilled credential presence/redaction, the native confirm result and final unlock.

One earlier auth smoke attempt was a false negative because the local fixture process on port 47822 had exited. A direct request confirmed the restarted fixture returns HTTP 401 plus the expected `WWW-Authenticate: Basic` challenge; the unchanged extension then passed the full smoke.

## Repeating the verification

From the repository root:

```powershell
pnpm browser ping
pnpm browser capabilities
```

Capabilities must include all three flags and actions:

- `browser.get_http_auth_state`;
- `browser.authenticate_http`;
- `browser.handle_javascript_dialog`.

Then start the deterministic fixture if port 47822 is not already listening:

```powershell
node tests/fixtures/server.mjs
```

Open `http://127.0.0.1:47822/basic-form` as the active Chrome tab and run:

```powershell
pnpm --filter @invictum/integration-tests smoke:chrome:auth-dialog
```

Expected JSON:

```json
{
  "authenticated": true,
  "credentialsRetained": false,
  "prefilledCredentialPresence": true,
  "passwordSensitive": true,
  "dialog": {
    "handled": true,
    "accepted": true,
    "type": "confirm",
    "triggerType": "click"
  },
  "finalTitle": "Invictum Phase 2 Form Fixture"
}
```

The smoke uses local fixture credentials only and releases the reserved tab in `finally`.
