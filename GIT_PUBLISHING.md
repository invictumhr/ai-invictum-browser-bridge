# Safe Git publishing

This repository controls a signed-in browser and must never treat a private Git
remote as a secret store. Credentials, browser data, local paths, audit output,
screenshots, and generated runtime files stay outside version control.

## One-time setup per clone

```powershell
git config core.hooksPath .githooks
pnpm security:secrets
```

The pre-commit hook scans the exact staged content. Findings contain only a
file, line, finding type, and short one-way digest. Secret values are never
printed by the scanner. This is a defense-in-depth check, not a replacement for
reviewing the staged diff.

## Before every commit

```powershell
pnpm security:secrets
git add -A
pnpm security:secrets:staged
git status --short
git diff --cached --stat
git diff --cached
```

Verify that the staged set contains source, tests, and intended documentation
only. It must not contain any of the following:

- `.env` files, API tokens, passwords, private keys, or credential-bearing URLs;
- Chrome profiles, cookies, storage, downloads, session state, or HTTP archives;
- local Native Host builds, generated manifests, logs, databases, or audit data;
- screenshots or recordings of signed-in pages;
- machine-specific `.cursor/mcp.json` or other personal agent configuration.

The checked-in `.cursor/mcp.json.example` contains a placeholder. Each clone
must create its own ignored `.cursor/mcp.json`, or use the documented global
agent-discovery installer.

## Required quality gate

```powershell
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## First private GitHub remote

Authenticate with GitHub CLI rather than embedding credentials in a remote URL:

```powershell
gh auth status
gh repo create invictum-browser-bridge --private --source . --remote origin
git push -u origin main
```

Inspect the repository settings after creation and enable GitHub secret
scanning and push protection when the selected plan supports them. Do not make
the repository public without a separate privacy, licensing, dependency, image,
and threat-model review.

## If a real secret is ever committed

Stop pushing. Revoke or rotate the credential first; deleting it in a later
commit is not sufficient. Then remove it from Git history, force-push the
rewritten branches and tags if appropriate, and tell every collaborator to
replace existing clones.
