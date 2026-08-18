# Policy configuration

The current engine classifies diagnostic actions separately; read-only discovery/snapshot/find/wait/auth-state/unlock as R0; open/navigate and reversible interactions as R1; and explicitly authorized submit/constrained JavaScript/HTTP Basic authentication/native JavaScript dialog handling as R2. Unknown actions fail closed as R3. Every browser action requires an explicitly authorized Desktop Authority session context.

Call `system.capabilities` to obtain the exact action/risk registry of the connected extension build. The protocol, Desktop Authority and extension each validate actions independently.

Chrome Site access and session authorization are separate gates. The extension requires `tabs`, `activeTab`, `scripting`, `webRequest`, `webRequestAuthProvider`, `debugger`, and all-HTTP(S) host patterns to avoid a manual permission gesture for every domain and support the two bounded native-dialog adapters, but Chrome's user/admin **On all sites** setting remains final. Restricted pages remain denied.

Native submit is available only through `browser.submit_form` with a genuine `explicit_user_instruction` reference and mandatory post-action verification. Sensitive text fields remain blocked. `browser.evaluate`, ordinary click and coordinate click cannot bypass those rules.

Prefilled credential fields may be submitted only when the user explicitly requested login; the agent sees only boolean `hasValue`. HTTP Basic credentials and JavaScript prompt text require the same genuine instruction reference, are never audited, and are discarded after the bounded action.

User-editable persistent domain policy, authenticated local-process pairing, persistent sessions/audit, production escalation and the full R0-R4 UI remain future work. Until those controls exist, do not use this development build for sensitive production, administrative, financial or irreversible workflows.
