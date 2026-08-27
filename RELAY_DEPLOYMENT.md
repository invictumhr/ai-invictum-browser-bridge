# Relay deployment

Remote relay support is intentionally **not implemented**. Invictum Browser
Bridge is currently local-only; both control endpoints bind to `127.0.0.1` and
must never be exposed through port forwarding or a public listener.

Any future relay design must use outbound WSS from Desktop Authority,
short-lived tokens, device key pairs, explicit pairing and revocation, one
active control session by default, and end-to-end encryption where feasible.
The relay must not retain browser content, credentials, terminal output, file
paths, or audit payloads and must not require inbound router ports.

Implementing a relay requires a separate threat model, protocol review,
production authorization UI, abuse controls, security testing, and deployment
documentation. No current command in this repository deploys one.
