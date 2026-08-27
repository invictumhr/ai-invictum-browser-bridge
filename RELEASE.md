# Release process

Invictum Browser Bridge is MIT-licensed open-source software in developer
preview. Releases currently publish source; there is no signed binary, Chrome
Web Store package, or production installer.

## Release gate

```powershell
pnpm security:secrets
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

After rebuilding extension code, Reload the unpacked extension and run:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\verify-after-reload.ps1
```

The release must also include:

- a reviewed staged diff and clean private-data/secret scan;
- updated README, capability, architecture, security, installation, and agent
  documentation;
- runtime `system.capabilities` matching the extension registry;
- MCP `tools/list` matching the documented/built tool surface;
- current unit, integration, and real-Chrome evidence;
- explicit known limitations and upgrade/reload notes;
- a version and changelog/tag appropriate to the published artifact.

## Production distribution requirements

A future production distribution additionally requires authenticated local
process pairing, persistent session/domain policy, security and dependency
review, signed artifacts, installer install/repair/upgrade/uninstall tests,
rollback instructions, and a supported update channel. Do not describe the
current source installation as production-safe merely because it passes the
developer gate.
