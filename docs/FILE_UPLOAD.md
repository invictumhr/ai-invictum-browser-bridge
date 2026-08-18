# Local file upload

Status: implemented and verified through the real Chrome/Native Messaging chain on 2026-07-23. The final post-Reload smoke proved missing-path denial, one local file on a single input, two local files on a `multiple` input, verified counts and native change-event observation, then completed the entire cross-feature suite and released the reserved tab.

## Agent action

Use `browser.set_file_input_files` or the dedicated MCP tool `invictum_set_file_input_files`. The action sets a native `<input type="file">`; it does not submit the form.

Required parameters:

```json
{
  "tabId": 123,
  "documentId": "document-...",
  "domRevision": 9,
  "elementId": "file-input-element-...",
  "filePaths": ["D:\\documents\\report.pdf"],
  "authorization": {
    "source": "explicit_user_instruction",
    "instructionId": "user-upload-report"
  }
}
```

- Paths must be absolute. Desktop Authority verifies that every path exists, is a readable regular file, and resolves it to its canonical path.
- One call accepts 1–20 files. More than one file requires an input with the HTML `multiple` attribute.
- Hidden upload-widget inputs are supported. Fetch a snapshot with `includeHidden: true`, then find the target with `visible: false` and preferably `inputType: "file"` plus a label, test ID or CSS selector.
- `accept` is returned as metadata but remains a page/browser hint. The agent must still choose an appropriate file type.
- The result includes count, `countVerified`, `multiple`, `accept`, new revision metadata and `verificationRequired`; it never returns paths or filenames. `countVerified: false` means CDP accepted the files but the page immediately navigated/reloaded before the content-side count check. Verify the destination and do not automatically repeat the upload.
- After setting files, verify the widget with a new snapshot or `wait_for`. Call `browser.submit_form` separately only if the user also authorized submission.

CLI shorthand:

```powershell
pnpm browser upload 123 el_document_9_4 "D:\documents\report.pdf" --instruction user-upload-report
```

The CLI needs a cached reference from `snapshot` or `find`. Prefer the MCP tool in a normal agent session.

## Safety and privacy

The action is R2 because `input`/`change` listeners can start an upload immediately. It therefore requires a stable reference to an explicit user instruction. Absolute paths necessarily exist briefly in the local control → Desktop Authority → Native Host → extension request and in the bounded CDP call. They are never persisted, returned, or written to audit. Audit retains only tab/revision/element, file count, policy result and authorization source/ID.

The extension validates the revision-bound target as an enabled native file input, adds a random short-lived marker, acquires the tab's shared CDP session, calls `DOM.setFileInputFiles`, verifies the resulting count, removes the marker and releases its session lease in `finally`. A persistent console or mobile-emulation lease may keep that shared attachment alive. Chrome permits one external debugger client per tab, so visible DevTools or another debugger must be closed before one careful retry.

Errors intentionally omit the path:

- `LOCAL_FILE_NOT_FOUND`: the indexed path does not exist;
- `LOCAL_FILE_ACCESS_DENIED`: the indexed file cannot be inspected/read;
- `INVALID_PARAMETERS`: relative path, directory, empty list or more than 20 files;
- `ELEMENT_NOT_INTERACTABLE`: wrong/disabled input or multiple files on a single-file input;
- `STALE_ELEMENT_REFERENCE`: refresh snapshot/find and retry once;
- `BROWSER_API_ERROR`: CDP could not attach/set the file; close DevTools and retry once.

## Implemented coverage

- strict protocol schema and readable parameter errors;
- R2 policy classification and explicit-user authorization;
- extension handler routing/result validation;
- unit proof that paths are sent to `DOM.setFileInputFiles`, not to the content command;
- debugger detach and content-marker cleanup paths;
- Desktop validation of a real local fixture file;
- emulated end-to-end transport and audit proof that `upload-one.txt` and its path are absent;
- MCP `tools/list`: 50 tools and `invictum_set_file_input_files` present in the current advanced build;
- deterministic fixture inputs for single and multiple `.txt` uploads;
- real-Chrome kitchen-sink proof for missing-path denial, 1-file attach, 2-file attach, native events, verified counts and unconditional unlock.

## One-step regression verification

After any future extension rebuild and user Reload at `chrome://extensions`, run:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\verify-after-reload.ps1
```

The script starts/repairs the normal authority through the CLI, verifies `46` runtime actions plus upload/WordPress/advanced/identity/productivity feature flags, ensures the current fixture is available, then runs the complete real-Chrome kitchen-sink smoke. The smoke requires its disposable agent-created tab to close in `finally`; cleanup failure fails the smoke instead of being hidden. A browser-native modal must be handled proactively because Chrome can block even `tabs.remove` after the modal is visible. If 47822 already serves an older fixture, the script leaves that process untouched, selects a free loopback port from 47822–47832, passes the exact URL through `INVICTUM_FIXTURE_URL`, and stops only the fixture process it started in `finally`. It does not reload the extension or bypass Chrome permissions.

The final 2026-07-23 run reached and passed every upload assertion and the complete cross-feature regression gate.
