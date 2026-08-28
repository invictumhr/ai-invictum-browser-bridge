# Social launch kit

Use these drafts after the public repository, release, demo, and social preview
have been verified. Always disclose that you built the project. Adapt the post
to the community instead of publishing identical copy everywhere.

## Canonical links

- Repository: https://github.com/invictumhr/ai-invictum-browser-bridge
- Demo: https://www.youtube.com/watch?v=QVO7exRn_24
- Release: https://github.com/invictumhr/ai-invictum-browser-bridge/releases/tag/v0.1.0
- Show HN copy: [SHOW_HN_LAUNCH.md](SHOW_HN_LAUNCH.md)

## LinkedIn

```text
We open-sourced Invictum Browser Bridge (IBB): a local, security-first bridge
that lets AI agents work in your existing Chrome profile.

The goal is practical browser automation for developer workflows that already
live in a signed-in browser — WordPress, cPanel/WHM, browser terminals, Figma,
dashboards, and local web applications — without exporting cookies, passwords,
or browser profiles.

IBB provides:

• MCP, CLI, TypeScript SDK, and a loopback control API
• Semantic page snapshots and revision-bound element references
• Visible per-tab agent identity, User Stop, policy checks, and cleanup
• Typed WordPress, xterm terminal, and Figma browser adapters
• Reliable forms, editors, uploads, screenshots, annotations, console/network
  diagnostics, mobile emulation, and same-origin API calls
• Explicit authorization for consequential actions and redacted audit metadata

It is an MIT-licensed Windows developer preview, not a claim that arbitrary
production browser automation is risk-free. The security model and current
limitations are documented in the repository.

Demo: https://www.youtube.com/watch?v=QVO7exRn_24
GitHub: https://github.com/invictumhr/ai-invictum-browser-bridge

Feedback on the authority architecture, MCP ergonomics, and useful typed
browser workflows is very welcome.

#OpenSource #AIAgents #MCP #BrowserAutomation #ChromeExtension #WordPress
#DeveloperTools
```

## X / Twitter thread

**Post 1**

```text
We open-sourced Invictum Browser Bridge (IBB): local, visible Chrome control for AI agents through MCP/CLI. It uses your existing profile without exporting cookies or passwords, with per-tab identity, User Stop, policy checks, and cleanup.

https://github.com/invictumhr/ai-invictum-browser-bridge
```

**Post 2**

```text
IBB includes semantic snapshots, forms and model-backed editors, uploads,
screenshots/annotations, console and network diagnostics, mobile emulation,
same-origin API calls, plus typed WordPress, WHM/cPanel terminal, and Figma
browser adapters.
```

**Post 3**

```text
It is MIT licensed and currently a Windows developer preview. The repo documents
the trust boundaries and limitations instead of pretending browser automation
is risk-free. Demo: https://www.youtube.com/watch?v=QVO7exRn_24

Technical feedback is welcome.
```

## DEV Community article

**Title**

```text
Why I built a local, visible Chrome bridge for AI agents
```

**Tags**

```text
opensource, ai, webdev, typescript
```

**Body**

````markdown
Browser agents are useful until a real workflow depends on the browser profile
you already use.

Developer and administration work often lives inside signed-in web applications:
WordPress, cPanel and WHM, browser terminals, Figma, dashboards, and local
development tools. Starting a clean automation browser loses that context.
Exporting cookies or profiles is not an acceptable substitute.

That is why I built **Invictum Browser Bridge (IBB)**, an MIT-licensed bridge
that lets an authorized AI agent work in the user's existing Chrome profile
through a local, visible, policy-aware control path.

## Architecture

```text
AI client
  -> MCP / CLI / TypeScript SDK
  -> Desktop Authority on loopback
  -> Chrome Native Messaging
  -> Manifest V3 extension
  -> authorized tab
```
````

Desktop Authority is the policy, validation, audit, reservation, and cleanup
boundary. Agents do not connect directly to the extension or Native Host port.

## Why the tab is visibly reserved

When an agent starts working, the tab shows the agent identity and a **Stop**
control. Every targeted action uses the same reservation lifecycle, and the tab
is released in `finally` or by the inactivity lease. User Stop blocks further
targeted actions immediately.

Agent-created tabs live in a separate, unfocused Chrome window. Normal reading,
interaction, screenshots, diagnostics, mobile emulation, and PDF export do not
need to interrupt the user's active tab.

## Typed workflows before generic automation

IBB starts with semantic page snapshots and revision-bound element references.
It includes typed actions for forms, model-backed editors, uploads, dialogs,
screenshots, annotations, console/network diagnostics, mobile emulation, and
same-origin page APIs.

Purpose-built adapters handle workflows that generic DOM automation often gets
wrong:

- WordPress admin, Gutenberg, Classic Editor, list tables, and classic menus
- xterm-based browser terminals such as WHM/cPanel Terminal
- Figma's browser UI, virtualized layer tree, and inspector properties

Raw JavaScript and coordinate clicks exist as bounded fallbacks, not the default
control model.

## Security boundaries

The Bridge does not expose cookies, stored passwords, browser-profile files,
authorization headers, or unrestricted browser storage. Sensitive controls are
redacted. Consequential actions use explicit authorization assertions and
post-action verification. Audit metadata excludes uploads, terminal commands,
credentials, prompt text, and response bodies.

This is still a developer preview. The control surfaces bind only to loopback,
but local-process pairing/authentication is future hardening. The repository's
security guide documents that limitation and the current action-level guarantees.

## Try it

The current release targets Windows 11, Chrome 120+, Node.js 22+, and pnpm 11.
Installation is source-based and the Chrome extension is loaded unpacked.

- [GitHub repository](https://github.com/invictumhr/ai-invictum-browser-bridge)
- [Video demo](https://www.youtube.com/watch?v=QVO7exRn_24)
- [Windows installation guide](https://github.com/invictumhr/ai-invictum-browser-bridge#install-with-an-ai-agent-on-windows)

I would value feedback on the authority and policy architecture, MCP ergonomics,
and which typed browser workflows should come next.

````

## Reddit

Before posting, read the current rules and use the community's required flair or
megathread. Do not cross-post the same submission to several communities at
once. Do not ask for votes.

### r/opensource candidate

```text
Title: I open-sourced a local, policy-aware Chrome bridge for AI agents

I built Invictum Browser Bridge because browser agents often need the signed-in
Chrome profile a developer already uses, while exporting cookies or handing an
agent generic browser control creates obvious risks.

IBB keeps the chain local: MCP/CLI -> Desktop Authority -> Native Messaging ->
Chrome extension. Tabs are visibly reserved, users get an immediate Stop
control, actions have strict schemas/risk levels, and audit metadata is redacted.

It also includes typed adapters for WordPress administration, xterm browser
terminals, and Figma's browser UI, plus semantic snapshots, editors, uploads,
screenshots, and diagnostics.

It is MIT licensed and currently a Windows developer preview. I am especially
interested in feedback on the trust boundaries and whether the typed-action
approach is useful compared with generic browser automation.

Repo: https://github.com/invictumhr/ai-invictum-browser-bridge
Demo: https://www.youtube.com/watch?v=QVO7exRn_24
````

### r/webdev candidate

Post only when current community rules permit project self-promotion. Lead with
the technical problem rather than a product announcement.

```text
Title: How I made AI browser control use an existing Chrome profile without exporting cookies

I have been working on an open-source bridge for a problem I kept hitting in
developer workflows: an agent needs to operate a signed-in web application, but
a clean automation browser has no session and exporting the profile is the wrong
security model.

The design uses a loopback Desktop Authority, Native Messaging, and an MV3
extension. The authority validates typed actions, reserves the target tab,
requires explicit authorization for consequential effects, and guarantees
cleanup. The page layer returns semantic references tied to document and DOM
revisions instead of relying on screen coordinates.

The implementation and security trade-offs are here:
https://github.com/invictumhr/ai-invictum-browser-bridge

I would appreciate criticism of the architecture, especially the local trust
boundary and the decision to expose narrow typed adapters before raw JavaScript.
```

### r/WordPress

Do not submit a generic promotional post. IBB is not a WordPress plugin. Only
share a technical WordPress-specific write-up after moderator confirmation or
in a thread explicitly asking about browser-agent administration. Disclose the
author relationship and link directly to the typed WordPress documentation.

### r/github self-promotion megathread

```text
Invictum Browser Bridge is an MIT-licensed TypeScript/MV3 bridge that lets AI
agents control an existing Chrome profile locally through MCP or CLI. It focuses
on visible per-tab control, User Stop, typed policy-checked actions, redacted
audit data, and specialized WordPress, browser-terminal, and Figma workflows.

Repo: https://github.com/invictumhr/ai-invictum-browser-bridge
Demo: https://www.youtube.com/watch?v=QVO7exRn_24

Feedback and focused contributions are welcome, especially around MCP ergonomics
and new typed platform adapters.
```

## Product Hunt — later launch

Do this only after the first external installs and feedback have improved the
onboarding flow.

**Tagline**

```text
Safe, local Chrome control for AI agents
```

**Short description**

```text
Invictum Browser Bridge connects AI agents to your existing Chrome profile
through MCP, with visible tab control, typed actions, policy checks, User Stop,
and specialized WordPress, terminal, and Figma workflows.
```

**Maker comment opening**

```text
I built IBB after repeatedly hitting the gap between clean automation browsers
and the signed-in Chrome profile where real developer work happens. The project
keeps control local and visible, documents its current security limits, and is
open source under MIT. I would love feedback from developers building practical
agent workflows.
```

Prepare at least three gallery assets before launch: the architecture and visible
tab reservation, a semantic/typed workflow, and an annotated screenshot result.
Invite people to try it and comment; never ask directly for upvotes.

## Posting order

1. Show HN after a clean public-install check.
2. Respond to technical feedback and create issues for reproducible findings.
3. Publish LinkedIn and the X thread the following day.
4. Publish the DEV article after incorporating the strongest early feedback.
5. Use one rules-compliant Reddit destination at a time.
6. Prepare Product Hunt only after onboarding has been tested by external users.
