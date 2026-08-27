# Policy configuration

The current engine classifies actions by effect, not by the MCP/CLI method used
to invoke them:

| Risk | Typical examples                                                                                                       |
| ---- | ---------------------------------------------------------------------------------------------------------------------- |
| R0   | capabilities, tab discovery, snapshots, find, waits, WordPress/Figma reads, terminal detection, bounded diagnostics    |
| R1   | open/navigate, reversible page interactions, Figma selection, mobile emulation, gestures                               |
| R2   | submit, file attachment, WordPress writes, terminal output readback, DOM/CSS mutation, HTTP Basic Auth, native dialogs |
| R3   | terminal text/keys and explicitly authorized raw page JavaScript                                                       |

Unknown actions fail closed as R3. Every browser action also requires an
explicitly authorized Desktop Authority session context.

Call `system.capabilities` to obtain the exact action/risk registry of the connected extension build. The protocol, Desktop Authority and extension each validate actions independently.

Chrome Site access and session authorization are separate gates. The extension requires `tabs`, `activeTab`, `scripting`, `webRequest`, `webRequestAuthProvider`, `debugger`, and all-HTTP(S) host patterns to avoid a manual permission gesture for every domain and support the two bounded native-dialog adapters, but Chrome's user/admin **On all sites** setting remains final. Restricted pages remain denied.

Native submit is available only through `browser.submit_form` with a genuine
`explicit_user_instruction` reference and mandatory post-action verification.
Typed WordPress writes, local file attachment, authentication/dialog handling,
and terminal operations have their own equally strict contracts. Sensitive text
fields remain blocked. `browser.evaluate`, ordinary click, batches, the MCP
escape hatch, and coordinate clicks cannot bypass those rules.

Prefilled credential fields may be submitted only when the user explicitly requested login; the agent sees only boolean `hasValue`. HTTP Basic credentials and JavaScript prompt text require the same genuine instruction reference, are never audited, and are discarded after the bounded action.

User-editable persistent domain policy, authenticated local-process pairing,
persistent sessions/audit, production escalation, and a complete policy UI
remain future work. Until those controls exist, treat the source build as a
developer tool and do not use it for sensitive production, financial, or
irreversible workflows without independent controls and human verification.

See [SECURITY.md](SECURITY.md) for invariants and the platform guides under
[docs/README.md](docs/README.md) for action-specific authorization rules.
