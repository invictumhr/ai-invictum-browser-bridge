# Browser console and mobile preview

Invictum exposes two tab-scoped Chrome DevTools Protocol capabilities without activating the tab:

- `browser.console` / `invictum_console` captures browser console messages, uncaught exceptions, and Chrome log entries;
- `browser.emulate_device` / `invictum_emulate_device` sets, reads, or resets a mobile viewport and touch profile.

Both tools use the extension's shared, reference-counted `chrome.debugger` session. Existing debugger-backed actions such as screenshots, file upload, JavaScript, listener inspection, and native-dialog handling reuse that same attachment. One tool therefore cannot accidentally detach another tool's session.

These are programmatic equivalents for agents. They do **not** open the visible DevTools panel. Chrome permits only one debugger client per target, so a user-opened DevTools window and the extension debugger can conflict. If Chrome reports an attach error, close DevTools on that tab and retry once. The extension never simulates `Ctrl+Shift+J` or `Ctrl+Shift+M`.

## Console capture

Start capture **before** the action being diagnosed:

```json
{
  "action": "browser.console",
  "parameters": {
    "operation": "start",
    "tabId": 123,
    "bufferSize": 200
  }
}
```

Then perform the page action and read:

```json
{
  "action": "browser.console",
  "parameters": {
    "operation": "read",
    "tabId": 123,
    "limit": 200,
    "clear": false
  }
}
```

Finish in `finally`:

```json
{
  "action": "browser.console",
  "parameters": {
    "operation": "stop",
    "tabId": 123
  }
}
```

Operations:

| Operation | Effect                                                                                                 |
| --------- | ------------------------------------------------------------------------------------------------------ |
| `start`   | Creates or idempotently reuses a capture. `bufferSize` is 10–500, default 200.                         |
| `read`    | Returns the newest `limit` entries. `clear: true` clears the local buffer after building the response. |
| `clear`   | Clears entries and the dropped-entry counter while preserving capture state.                           |
| `stop`    | Returns the retained entries, stops capture, and releases its debugger reference.                      |

Each entry contains a monotonic sequence, ISO timestamp, source (`console`, `exception`, or `log`), level, bounded text, sanitized source URL, line, and column. Object arguments are represented only by a shallow type/description marker; Bridge never expands remote object properties.

Console output is page-controlled and may contain secrets. Bridge applies bounded best-effort redaction for password/token/authorization/cookie/session/OTP-like assignments, Basic/Bearer values, and credential-like query values. It also removes URL query strings/fragments. This reduces exposure but is not a proof that arbitrary application logs are secret-free. Do not intentionally log credentials, and do not use console capture on a sensitive page unless the task requires it.

MCP:

```text
invictum_console { operation: "start", tabId: 123 }
...perform the action...
invictum_console { operation: "read", tabId: 123 }
invictum_console { operation: "stop", tabId: 123 }
```

CLI:

```powershell
pnpm browser console 123 start
pnpm browser console 123 read
pnpm browser console 123 read --clear
pnpm browser console 123 stop
```

SDK:

```ts
await browser.startConsole(tabId);
try {
  // action under test
  const result = await browser.readConsole(tabId, { limit: 100 });
} finally {
  await browser.stopConsole(tabId);
}
```

## Mobile preview

Set a profile:

```json
{
  "action": "browser.emulate_device",
  "parameters": {
    "operation": "set",
    "tabId": 123,
    "preset": "mobile_medium",
    "orientation": "portrait"
  }
}
```

Built-in portrait baselines:

| Preset          | CSS viewport | DPR | Touch |
| --------------- | -----------: | --: | ----- |
| `mobile_small`  |    320 × 568 |   2 | on    |
| `mobile_medium` |    390 × 844 |   3 | on    |
| `mobile_large`  |    430 × 932 |   3 | on    |
| `tablet`        |   768 × 1024 |   2 | on    |

These dimensions are emulated device/screen metrics. The page's actual CSS layout viewport can be wider than the nominal screen when Chrome applies viewport-meta, shrink-to-fit, zoom, or a page's minimum-content constraints. This is real responsive behavior, not a failed profile. Verify `screen.width`, `screen.height`, DPR, the fresh snapshot viewport, and the resulting screenshot together; do not require `window.innerWidth` to equal the preset width on every page.

`orientation: "landscape"` swaps the preset dimensions and sets Chrome's screen orientation. `touch` defaults to `true`.

For `preset: "custom"`, provide all three values:

```json
{
  "operation": "set",
  "tabId": 123,
  "preset": "custom",
  "orientation": "portrait",
  "width": 360,
  "height": 800,
  "deviceScaleFactor": 2,
  "touch": true
}
```

Bounds are width/height 240–2560 and DPR 1–4. Custom width/height are treated as the portrait baseline and are swapped for landscape.

Read state with `operation: "get"`. Always reset after testing:

```json
{
  "action": "browser.emulate_device",
  "parameters": {
    "operation": "reset",
    "tabId": 123
  }
}
```

MCP:

```text
invictum_emulate_device {
  operation: "set",
  tabId: 123,
  preset: "mobile_medium",
  orientation: "portrait"
}
invictum_screenshot { tabId: 123 }
invictum_emulate_device { operation: "reset", tabId: 123 }
```

CLI:

```powershell
pnpm browser mobile 123 mobile_medium portrait
pnpm browser screenshot 123 .\mobile.jpg
pnpm browser desktop 123
```

SDK:

```ts
await browser.setMobilePreview(tabId, {
  preset: "mobile_medium",
  orientation: "portrait",
});
try {
  // semantic interactions and screenshot work without activating the tab
} finally {
  await browser.resetDeviceEmulation(tabId);
}
```

Mobile preview changes viewport metrics, DPR, orientation, and touch-event support. It intentionally does not spoof a named phone, User-Agent Client Hints, geolocation, CPU, or network speed. It is therefore a responsive-layout approximation, like Chrome Device Mode, not proof of behavior on a physical device. Fetch a new snapshot after `set` or `reset`; both can change media-query layout and invalidate element references.

## Toolbar controls and cleanup

The extension toolbar popup shows the current tab's console and mobile-preview state. The user can toggle console capture and the default 390 × 844 portrait preview directly. These buttons are a convenience and never reserve or activate a tab.

Agents should use the dedicated protocol/MCP tools because they return structured state. Explicit `browser.unlock_tab`, the 30-second abandoned lease, User **Stop**, toolbar reauthorization, tab close, extension reload, or unexpected debugger detach stops console capture and resets mobile emulation. Console and emulation are also released when normal agent `finally` cleanup completes after the 20-second reservation grace.

## Verification

Offline:

```powershell
pnpm typecheck
pnpm test
pnpm lint
pnpm build
```

After reloading `apps/extension/dist` once:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\verify-after-reload.ps1
```

The post-Reload gate expects 46 extension actions and 50 MCP tools. Its real-Chrome kitchen-sink test starts console capture, generates and reads an error, applies a 390 × 844 touch viewport, captures a mobile screenshot, resets to desktop, and then continues normal semantic/visual and WordPress admin/editor interaction tests. Its disposable tab is explicitly closed in `finally`.

Official API references:

- [Chrome Debugger extension API](https://developer.chrome.com/docs/extensions/reference/api/debugger)
- [Chrome Device Mode](https://developer.chrome.com/docs/devtools/device-mode)
- [CDP Runtime domain](https://chromedevtools.github.io/devtools-protocol/tot/Runtime/)
- [CDP Log domain](https://chromedevtools.github.io/devtools-protocol/tot/Log/)
- [CDP Emulation domain](https://chromedevtools.github.io/devtools-protocol/tot/Emulation/)
