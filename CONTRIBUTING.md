# Contributing

Use Node.js 22+ and the pnpm version declared in the root `package.json`.

Before submitting a change, run:

```powershell
pnpm security:secrets
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:integration
pnpm build
```

For every new browser operation, add TypeScript contracts, Zod validation, timeout/error mapping, policy and audit integration, unit tests, integration tests, and documentation. Do not add raw `any`, suppress TypeScript errors, weaken lint rules to make a build pass, log sensitive values, or put browser logic in MCP adapters.

Keep changes inside the active implementation phase. Security and user control take precedence over demo breadth.

Enable the repository-owned pre-commit hook once per clone:

```powershell
git config core.hooksPath .githooks
```

The hook scans the exact staged content and reports only the file, line, and
finding type. It never prints a detected credential. See
[GIT_PUBLISHING.md](GIT_PUBLISHING.md) before creating or changing a remote.
