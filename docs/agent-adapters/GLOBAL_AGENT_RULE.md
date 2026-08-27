## Invictum Browser — IBB / IBG

When the user says `koristi IBB`, `koristi IBG`, `koristi Invictum Browser
Bridge`, `koristi Invictum Browser Gate`, or the English equivalents, treat the
phrases as an explicit request to use Invictum Browser Bridge.

Before the first browser action, read:

`{{REPOSITORY_ROOT}}\AGENT_TRIGGER.md`

Prefer the `invictum_*` MCP tools. If they are unavailable, follow the documented
CLI fallback instead of silently switching to another browser automation
surface. Start with ping and capabilities, omit `active` unless focus is truly
needed, identify the current agent per tab, and always unlock/end the session in
`finally`.
