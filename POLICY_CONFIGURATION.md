# Policy configuration

The current engine classifies actions by effect, not by the MCP/CLI method used
to invoke them:

| Risk | Typical examples                                                                                                                                                                                |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R0   | capabilities, health, tab/frame/navigation discovery, snapshots, find, waits, WordPress/Figma reads, accessibility/performance, managed-download waits, terminal detection, bounded diagnostics |
| R1   | open/navigate, reversible page interactions, Figma selection, mobile emulation, gestures, WebMCP cancellation                                                                                   |
| R2   | submit, file attachment, managed-download start, WordPress writes, terminal output readback, DOM/CSS mutation, HTTP Basic Auth, native dialogs                                                  |
| R3   | terminal text/keys, explicitly authorized raw page JavaScript, and page WebMCP invocation                                                                                                       |

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

The toolbar popup stores a policy for the current hostname. **Observe only**
permits read-only actions. **Safe interaction** permits diagnostics plus R0/R1.
**Trusted admin** uses normal Bridge authorization but blocks terminal input.
**Block agent access** denies targeted control. **Allow with Bridge policy** is
the default and preserves existing behavior. Both the current and destination
URL are checked, and incognito tabs are always denied. These settings cannot
override Chrome Site access, a User Stop, restricted pages, or R2/R3
authorization.

Every local control POST requires the per-user bearer token. Mutations should
carry a stable idempotency key; completed or crash-uncertain keys are blocked
by the persistent operation journal. `invictum_transaction` adds orchestration
but does not alter the underlying action's policy classification.

Managed downloads require explicit R2 authorization, a credential-free HTTP(S)
URL and byte ceiling. Executable types, dangerous-file acceptance, traversal,
unmanaged IDs and path disclosure are denied. Page WebMCP tool definitions and
results are untrusted page content; invocation is R3 and never inherits trust
from discovery.

Remote control, multi-user/enterprise policy administration, encrypted relay,
signed packaging, and arbitrary OS-level input remain out of scope. Treat the
source build as a developer tool and do not use it for sensitive financial or
irreversible workflows without independent controls and human verification.

See [SECURITY.md](SECURITY.md) for invariants and the platform guides under
[docs/README.md](docs/README.md) for action-specific authorization rules.
