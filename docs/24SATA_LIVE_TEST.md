# 24sata.hr live Bridge test

Date: 2026-07-22, Europe/Zagreb.

## Verified against the loaded Chrome extension

- Full Desktop Authority → Native Host → extension ping returned `pong`.
- `browser.open_tab` opened `https://www.24sata.hr/` without a per-domain permission click.
- `browser.wait_for` reached a stable DOM in about 0.9 seconds.
- The home-page semantic snapshot returned 82 elements, 18 headings, one frame and no truncation.
- `browser.find_elements` found the selected UTF-8 article link by its exact accessible name when the direct PowerShell client encoded the JSON request as UTF-8.
- `browser.click` navigated to the selected article.
- The article stabilized in about 0.9 seconds and returned 114 semantic elements, headings and article paragraphs. Dynamic page size caused the bounded snapshot to report `truncated: true` as designed.
- Query parameters were redacted from tab metadata and snapshot URLs.
- The tab reservation/indicator was released after each test phase.

The selected article was a local breaking-news video report about an incident in Primosten.

## Issue found and fixed

The original `browser.screenshot` path could fail when the target tab was active inside its Chrome window but that window was not the visible/focused Chrome window. This is a real multi-window case: `tabs.Tab.active` is scoped to a window, and multiple windows each have an active tab.

The extension now:

1. prefers `chrome.tabs.captureVisibleTab`;
2. falls back to a short-lived Chrome Debugger attachment and `Page.captureScreenshot` for an inactive/minimized window or a standard-capture failure;
3. captures only the requested reserved tab and visible viewport;
4. always detaches in `finally`;
5. applies the existing JPEG dimensions and 500 kB transport bound;
6. continues to exclude image data from audit.

The fallback has unit coverage for successful capture and detach-on-error. Full repository verification passed: typecheck 19/19, 94 unit tests, 10 integration tests, lint/format and build 11/11.

## Pending live check

The screenshot fallback is present in `apps/extension/dist` and requires one extension Reload before the final multi-window screenshot can be repeated in Chrome.
