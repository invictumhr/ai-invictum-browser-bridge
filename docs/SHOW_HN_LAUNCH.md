# Show HN launch package

This document is a copy-ready launch draft. Review the current README, release,
and installation flow before posting. Do not ask anyone to upvote or seed
comments.

## Submission

**Title**

```text
Show HN: Invictum Browser Bridge – Local Chrome control for AI agents
```

**URL**

```text
https://github.com/invictumhr/ai-invictum-browser-bridge
```

## Maker's first comment

```text
Hi HN,

I built Invictum Browser Bridge (IBB), an open-source bridge that lets AI agents
work in your existing Chrome profile instead of launching a separate automation
browser.

The problem I wanted to solve was practical: browser agents are useful, but
many real developer workflows live in an already signed-in browser — WordPress,
cPanel/WHM, browser terminals, Figma, dashboards, and local development tools.
Giving an agent generic browser access is also too easy to get wrong.

IBB keeps the control path local:

AI client -> MCP/CLI -> Desktop Authority -> Native Messaging -> Chrome extension

The controlled tab is visibly reserved, identifies the active agent, exposes a
user Stop button, and is automatically released. The authority applies strict
schemas, risk levels, explicit authorization for consequential actions,
redacted audit metadata, stale-element protection, and post-action verification.

The project includes semantic snapshots and element references, forms and
model-backed editors, uploads, screenshots and annotations, console/network
diagnostics, mobile emulation, same-origin API requests, and typed adapters for
WordPress administration, xterm-based browser terminals, and Figma's browser UI.
Raw JavaScript and coordinate clicks exist only as bounded fallbacks.

It currently targets Windows, Chrome, Node.js 22+, and pnpm. It is a developer
preview, not a claim that arbitrary production browser automation is risk-free.
The local control API is loopback-only, but local-process pairing/authentication
is still future hardening, so the README and security guide describe the current
boundaries clearly.

Demo: https://www.youtube.com/watch?v=ziU3yIbnUUI
Repo and installation instructions:
https://github.com/invictumhr/ai-invictum-browser-bridge

I would especially value feedback on the authority/policy architecture, MCP
ergonomics, and which typed browser workflows would be most useful next.
```

## Short answers for likely questions

### Why use an extension instead of Playwright?

Playwright is excellent for isolated, reproducible browser automation. IBB is
aimed at tasks that intentionally need the user's visible, existing Chrome
profile and a policy/audit boundary between the agent and browser. It is a
complementary tool, not a Playwright replacement.

### Can it read passwords or cookies?

No. Snapshots expose only whether ordinary controls have a value and redact
sensitive fields. The Bridge does not read cookies, authorization headers,
stored credentials, or browser-profile files. See `SECURITY.md` for the exact
current invariants and limitations.

### Why support raw JavaScript at all?

Some development interfaces have no stable semantic control surface. IBB first
prefers typed actions, then constrained inspection/mutation tools. Raw JavaScript
is an explicitly authorized, audited R3 fallback with additional policy checks;
it is not treated as a sandbox or a universal solution.

### Does it steal focus from the user?

Agent-created tabs live in a separate unfocused Chrome window. Normal semantic
actions, screenshots, diagnostics, mobile emulation, and PDF export work there.
Foreground activation is an explicit bounded exception for genuinely
focus-gated applications.

### What is the status?

The repository is an MIT-licensed Windows developer preview. It has strict
TypeScript contracts, unit/integration coverage, real-Chrome verification, a
source installer, and documented limitations. Feedback and focused pull
requests are welcome.

## Preflight checklist

- [ ] Clone and install from the public repository on a clean Windows user or VM.
- [ ] Confirm the README reaches `health`, `ping`, and `capabilities` without undocumented steps.
- [ ] Confirm the current release and demo links work while signed out of GitHub.
- [ ] Confirm the social preview and repository About text render correctly.
- [ ] Review open issues and be ready to answer installation questions.
- [ ] Post while a maintainer can participate in the discussion for several hours.
- [ ] Do not ask for upvotes or arrange comments.
- [ ] Record installation friction as issues instead of hiding it from the thread.

## Success criteria

Treat useful technical feedback, reproducible bug reports, first-time installs,
and contributors as the primary outcomes. Traffic and stars are secondary.
