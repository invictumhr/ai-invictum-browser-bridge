# Chrome extension development installation

1. Build the repository:

   ```powershell
   $env:CI='true'
   pnpm install --frozen-lockfile
   pnpm build
   ```

2. Open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select:

   ```text
   D:\laragon\www\invictum\invictum-browser-bridge\apps\extension\dist
   ```

3. Copy the extension ID shown by Chrome.
4. Register the development Native Host from an ordinary PowerShell window:

   ```powershell
   .\scripts\register-native-host-dev.ps1 -ExtensionId "PASTE_EXTENSION_ID"
   ```

5. Start the bridge with `pnpm browser ping`. The CLI automatically starts Desktop Authority if needed.
6. Reload **Invictum Browser Controller** once on `chrome://extensions`.
7. Open extension **Details** and verify **Site access / Pristup web-lokaciji** is **On all sites / Na svim web-lokacijama**.

The extension requires `tabs`, `activeTab`, `scripting`, `webRequest`, `webRequestAuthProvider`, `debugger`, and HTTP/HTTPS host access. HTTP(S) host access deliberately removes the per-domain toolbar approval that made every newly opened site require manual user involvement. `webRequestAuthProvider` is used only for explicitly authorized, one-attempt HTTP Basic authentication. `debugger` is used only by bounded, short-lived, tab-scoped adapters for native JavaScript dialogs, inactive-tab screenshots, explicitly authorized `DOM.setFileInputFiles`, event-listener/source inspection and explicitly authorized R3 raw JavaScript; Chrome can show its normal debugging warning/banner during those actions. Chrome's user/admin setting remains authoritative and can restrict access. Browser-internal, extension, DevTools, Web Store, file, and other restricted pages remain unavailable.

The toolbar badge shows `ON` after the Native Messaging round trip is connected. A left click opens the settings popup. **Work in the background** is the initial default and prevents omitted-`active` `open_tab`/`navigate` calls from switching the user's current tab; **Activate the agent tab** restores foreground behavior. Agents can explicitly override either default per call. The popup also shows Bridge/current-tab state and exposes **Reauthorize AI control of this tab** only after the user has pressed the in-page **Stop** button.

The first targeted agent action automatically changes the target tab to an `AI` badge and adds the in-page control indicator. `browser.unlock_tab` starts the cancellable 20-second release grace; a 30-second lease is crash fallback. Opening the popup or changing its default never reserves a tab.

After rebuilding extension code, reload it once on `chrome://extensions`; existing web tabs may also need refresh. Desktop, CLI, SDK, MCP, or Native Host-only changes do not require an extension reload.

After the Reload for the local-upload build, an agent can run the complete prepared verification without another user step:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\verify-after-reload.ps1
```

To remove the development registration:

```powershell
.\scripts\unregister-native-host-dev.ps1
```

Registration is per-user under `HKCU`; administrator rights are not required.
