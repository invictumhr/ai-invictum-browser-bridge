import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

import { InvictumControlClient, InvictumControlError } from "@invictum/agent-sdk";
import type {
  AgentElement,
  CaptureScreenshotData,
  CloseTabData,
  ClickAtData,
  ClickElementData,
  EvaluateJavaScriptData,
  FindElementsData,
  FindNaturalLanguageData,
  FindElementsInput,
  OpenTabData,
  PageSnapshot,
  GetPageTextData,
  HistoryNavigationData,
  PageApiRequestData,
  SelectOptionData,
  SetFileInputFilesData,
  SetCheckedData,
  SubmitFormData,
  SystemCapabilitiesData,
  TypeTextData,
  WaitForData,
  MutateDomData,
  InspectElementData,
  ManageCssData,
  ObserveEventsData,
  ExecuteJavaScriptData,
  SetControlIdentityData,
  BrowserConsoleData,
  NetworkCaptureData,
  DeviceEmulationData,
  PerformGestureData,
  PrintToPdfData,
  GetWordPressMenuData,
  EditWordPressMenuData,
  GetWordPressAdminData,
  WordPressListTableActionData,
  GetWordPressEditorData,
  EditWordPressEditorData,
  HandleJavaScriptDialogData,
} from "@invictum/protocol";

const fixtureUrl = process.env.INVICTUM_FIXTURE_URL ?? "http://127.0.0.1:47822/kitchen-sink";
const sessionId = `integration-kitchen-${randomUUID()}`;
const authorization = {
  source: "explicit_user_instruction" as const,
  instructionId: "user-test-all-2026-07-22",
};
const uploadOne = fileURLToPath(new URL("../../fixtures/upload-one.txt", import.meta.url));
const uploadTwo = fileURLToPath(new URL("../../fixtures/upload-two.txt", import.meta.url));
type FindCriteria = Omit<FindElementsInput, "tabId" | "documentId" | "domRevision" | "maxResults">;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const expectCode = async (
  operation: Promise<unknown>,
  expected: string | string[],
  label: string,
): Promise<string> => {
  const expectedCodes = Array.isArray(expected) ? expected : [expected];
  try {
    await operation;
  } catch (error) {
    if (error instanceof InvictumControlError && expectedCodes.includes(error.code))
      return error.code;
    throw error;
  }
  throw new Error(`${label} unexpectedly succeeded; expected ${expectedCodes.join(" or ")}`);
};

const main = async (): Promise<void> => {
  const client = new InvictumControlClient({
    context: {
      sessionId,
      agentId: "integration-kitchen-sink",
      clientId: "chrome-kitchen-sink-smoke",
      sessionAuthorized: true,
    },
  });
  const results: Record<string, unknown> = {};
  let openedTabId: number | undefined;

  try {
    const capabilities = await client.call<SystemCapabilitiesData>("system.capabilities", {});
    const capabilityActions = new Set(capabilities.actions.map(({ action }) => action));
    const requiredActions = [
      "browser.open_tab",
      "browser.navigate",
      "browser.go_back",
      "browser.go_forward",
      "browser.activate_tab",
      "browser.close_tab",
      "browser.get_page_snapshot",
      "browser.get_page_text",
      "browser.find_elements",
      "browser.find_natural_language",
      "browser.type_text",
      "browser.set_file_input_files",
      "browser.get_wordpress_menu",
      "browser.edit_wordpress_menu",
      "browser.get_wordpress_admin",
      "browser.wordpress_list_table_action",
      "browser.get_wordpress_editor",
      "browser.edit_wordpress_editor",
      "browser.select_option",
      "browser.check",
      "browser.uncheck",
      "browser.click",
      "browser.evaluate",
      "browser.screenshot",
      "browser.click_at",
      "browser.submit_form",
      "browser.wait_for",
      "browser.set_control_identity",
      "browser.mutate_dom",
      "browser.inspect_element",
      "browser.manage_css",
      "browser.observe_events",
      "browser.execute_javascript",
      "browser.console",
      "browser.network",
      "browser.emulate_device",
      "browser.perform_gesture",
      "browser.print_to_pdf",
      "browser.page_api_request",
      "browser.unlock_tab",
    ];
    for (const action of requiredActions) {
      assert(capabilityActions.has(action), `Runtime is missing ${action}`);
    }
    for (const feature of [
      "compactSnapshots",
      "outlineSnapshots",
      "previousRevisionRelocation",
      "structuredParameterErrors",
      "elementInspection",
      "domMutation",
      "cssInjection",
      "eventCapture",
      "browserConsole",
      "networkCapture",
      "deviceEmulation",
      "advancedGestures",
      "pageText",
      "naturalLanguageFind",
      "historyNavigation",
      "explicitTabActivation",
      "sameOriginPageApi",
      "agentBatching",
      "pdfExport",
      "rawJavaScript",
      "customControlIdentity",
      "configurableTabActivation",
      "screenshotModes",
      "screenshotAnnotations",
      "wordpressMenuEditing",
      "wordpressAdminTools",
      "wordpressPostEditing",
    ] as const) {
      assert(capabilities.features[feature], `${feature} capability is false`);
    }

    const opened = await client.call<OpenTabData>("browser.open_tab", {
      url: fixtureUrl,
      active: false,
    });
    openedTabId = opened.tab.tabId;
    assert(opened.tab.active === false, "Explicit background tab opening was not preserved");
    results["tabActivation"] = "background operation without stealing the active tab";

    await client.withReservedTab(opened.tab.tabId, async (browser) => {
      const identity = await browser.call<SetControlIdentityData>("browser.set_control_identity", {
        tabId: opened.tab.tabId,
        agentName: "Codex",
      });
      assert(identity.label === "Codex is using this tab", "Custom agent identity was not applied");
      results["controlIdentity"] = identity.label;

      await browser.call<NetworkCaptureData>("browser.network", {
        operation: "start",
        tabId: opened.tab.tabId,
        bufferSize: 100,
      });
      let networkRead: NetworkCaptureData | undefined;
      try {
        await browser.call("browser.navigate", {
          tabId: opened.tab.tabId,
          url: fixtureUrl,
          active: false,
          waitUntil: "complete",
        });
        networkRead = await browser.call<NetworkCaptureData>("browser.network", {
          operation: "read",
          tabId: opened.tab.tabId,
        });
        assert(networkRead.entryCount > 0, "Network capture did not observe fixture navigation");
        assert(
          networkRead.entries.some(
            ({ phase, url }) => phase === "request" && url.includes("/kitchen-sink"),
          ),
          "Network capture did not return the sanitized fixture request",
        );
        assert(
          !networkRead.bodiesCaptured &&
            !networkRead.headersCaptured &&
            networkRead.queryStringsRedacted,
          "Network capture privacy invariants are invalid",
        );
      } finally {
        await browser.call<NetworkCaptureData>("browser.network", {
          operation: "stop",
          tabId: opened.tab.tabId,
        });
      }
      assert(networkRead, "Network capture result is missing");
      results["network"] = {
        entries: networkRead.entryCount,
        privacy: "no bodies, headers, or query strings",
      };

      const fixtureOrigin = new URL(fixtureUrl).origin;
      await browser.call("browser.navigate", {
        tabId: opened.tab.tabId,
        url: `${fixtureOrigin}/basic-form?history=1`,
        active: false,
      });
      const historyBack = await browser.call<HistoryNavigationData>("browser.go_back", {
        tabId: opened.tab.tabId,
      });
      assert(
        historyBack.direction === "back" && historyBack.tab.url.includes("/kitchen-sink"),
        "Back navigation did not restore the fixture",
      );
      const historyForward = await browser.call<HistoryNavigationData>("browser.go_forward", {
        tabId: opened.tab.tabId,
      });
      assert(
        historyForward.direction === "forward" && historyForward.tab.url.includes("/basic-form"),
        "Forward navigation did not restore the history entry",
      );
      await browser.call<HistoryNavigationData>("browser.go_back", {
        tabId: opened.tab.tabId,
      });
      results["historyNavigation"] = "back and forward without tab activation";

      const snapshot = async (
        detail: "outline" | "minimal" | "interactive" | "semantic" | "full" = "interactive",
        scope?: { documentId: string; domRevision: number; elementId: string },
      ): Promise<PageSnapshot> =>
        browser.call<PageSnapshot>("browser.get_page_snapshot", {
          tabId: opened.tab.tabId,
          detail,
          ...(scope ? { scope } : {}),
        });

      const find = async (
        page: PageSnapshot,
        criteria: FindCriteria,
        maxResults = 10,
      ): Promise<FindElementsData> =>
        browser.call<FindElementsData>("browser.find_elements", {
          tabId: opened.tab.tabId,
          documentId: page.metadata.documentId,
          domRevision: page.metadata.domRevision,
          ...criteria,
          maxResults,
        });

      const findOne = async (page: PageSnapshot, criteria: FindCriteria): Promise<AgentElement> => {
        const found = await find(page, criteria, 2);
        assert(found.matches.length === 1, `Expected one element for ${JSON.stringify(criteria)}`);
        return found.matches[0]!.element;
      };

      const typeInto = async (
        criteria: FindCriteria,
        text: string,
        mode: "replace" | "append" = "replace",
      ): Promise<TypeTextData> => {
        const page = await snapshot();
        const element = await findOne(page, criteria);
        return browser.call<TypeTextData>("browser.type_text", {
          tabId: opened.tab.tabId,
          elementId: element.elementId,
          documentId: page.metadata.documentId,
          domRevision: page.metadata.domRevision,
          text,
          mode,
          dispatchChange: true,
        });
      };

      const click = async (criteria: FindCriteria): Promise<ClickElementData> => {
        const page = await snapshot();
        const element = await findOne(page, criteria);
        return browser.call<ClickElementData>("browser.click", {
          tabId: opened.tab.tabId,
          elementId: element.elementId,
          documentId: page.metadata.documentId,
          domRevision: page.metadata.domRevision,
        });
      };

      const cleanText = await browser.call<GetPageTextData>("browser.get_page_text", {
        tabId: opened.tab.tabId,
        maxChars: 20_000,
      });
      assert(
        cleanText.text.includes("Browser bridge kitchen sink"),
        "Clean page text omitted the fixture heading",
      );
      const natural = await browser.call<FindNaturalLanguageData>("browser.find_natural_language", {
        tabId: opened.tab.tabId,
        query: "text input",
        maxResults: 5,
      });
      assert(
        natural.matches.some(({ element }) => element.elementId.length > 0),
        "Natural-language find did not return a semantic control",
      );
      results["agentReads"] = {
        textChars: cleanText.characterCount,
        naturalMatches: natural.count,
      };

      const pageApi = await browser.call<PageApiRequestData>("browser.page_api_request", {
        tabId: opened.tab.tabId,
        url: "/api/echo?token=must-not-return",
        method: "POST",
        body: { title: "Agent API test" },
        responseMode: "json",
        authorization,
      });
      assert(pageApi.ok && pageApi.status === 200, "Same-origin page API request failed");
      assert(pageApi.url.endsWith("?[redacted]"), "Page API result exposed query values");
      assert(
        JSON.stringify(pageApi.body).includes("[REDACTED]") &&
          !JSON.stringify(pageApi).includes("fixture-private-token"),
        "Page API response did not redact credential-like fields",
      );
      results["pageApi"] = {
        status: pageApi.status,
        urlSanitized: pageApi.url,
        verificationRequired: pageApi.verificationRequired,
      };

      await browser.call<WaitForData>("browser.wait_for", {
        tabId: opened.tab.tabId,
        condition: { type: "selector", value: "#input-form" },
        timeoutMs: 10_000,
      });
      await browser.call<WaitForData>("browser.wait_for", {
        tabId: opened.tab.tabId,
        condition: { type: "title", value: "Invictum Kitchen Sink Fixture", match: "exact" },
        timeoutMs: 5_000,
      });
      const gesturePage = await snapshot();
      const gestureTarget = await findOne(gesturePage, { css: "#text-input" });
      const gesture = await browser.call<PerformGestureData>("browser.perform_gesture", {
        tabId: opened.tab.tabId,
        operation: "focus",
        documentId: gesturePage.metadata.documentId,
        domRevision: gesturePage.metadata.domRevision,
        elementId: gestureTarget.elementId,
      });
      assert(
        gesture.performed && gesture.operation === "focus" && gesture.resolvedElementId,
        "Revision-bound focus gesture was not performed",
      );
      results["gesture"] = {
        operation: gesture.operation,
        relocated: gesture.resolvedElementId,
      };
      const gestureCapture = await browser.call<ObserveEventsData>("browser.observe_events", {
        operation: "start",
        tabId: opened.tab.tabId,
        eventTypes: ["dblclick", "contextmenu", "keydown"],
        maxEvents: 20,
      });
      try {
        let actionPage = await snapshot();
        let actionTarget = await findOne(actionPage, { css: "#ordinary-button" });
        await browser.call<PerformGestureData>("browser.perform_gesture", {
          tabId: opened.tab.tabId,
          operation: "double_click",
          documentId: actionPage.metadata.documentId,
          domRevision: actionPage.metadata.domRevision,
          elementId: actionTarget.elementId,
        });
        actionPage = await snapshot();
        actionTarget = await findOne(actionPage, { css: "#ordinary-button" });
        await browser.call<PerformGestureData>("browser.perform_gesture", {
          tabId: opened.tab.tabId,
          operation: "context_click",
          documentId: actionPage.metadata.documentId,
          domRevision: actionPage.metadata.domRevision,
          elementId: actionTarget.elementId,
        });
        actionPage = await snapshot();
        const textInput = await findOne(actionPage, { css: "#text-input" });
        await browser.call<PerformGestureData>("browser.perform_gesture", {
          tabId: opened.tab.tabId,
          operation: "press_key",
          documentId: actionPage.metadata.documentId,
          domRevision: actionPage.metadata.domRevision,
          elementId: textInput.elementId,
          key: "s",
          code: "KeyS",
          ctrl: true,
          shift: true,
        });
        const captured = await browser.call<ObserveEventsData>("browser.observe_events", {
          operation: "read",
          tabId: opened.tab.tabId,
          captureId: gestureCapture.captureId,
        });
        assert(
          captured.events.some(({ type }) => type === "dblclick") &&
            captured.events.some(({ type }) => type === "contextmenu") &&
            captured.events.some(
              ({ type, keyboard }) =>
                type === "keydown" &&
                keyboard?.ctrlKey &&
                keyboard.shiftKey &&
                keyboard.key === "s",
            ),
          "Advanced mouse or keyboard gesture events were not observed",
        );
      } finally {
        await browser.call<ObserveEventsData>("browser.observe_events", {
          operation: "stop",
          tabId: opened.tab.tabId,
          captureId: gestureCapture.captureId,
        });
      }
      const scrollPage = await snapshot("minimal");
      const scrollResult = await browser.call<PerformGestureData>("browser.perform_gesture", {
        tabId: opened.tab.tabId,
        operation: "scroll_to",
        documentId: scrollPage.metadata.documentId,
        domRevision: scrollPage.metadata.domRevision,
        x: 0,
        y: 500,
      });
      assert(
        scrollResult.scroll !== undefined && scrollResult.scroll.y >= 0,
        "Absolute scroll did not return the resulting scroll position",
      );
      results["advancedGestures"] = ["double_click", "context_click", "Ctrl+Shift+S", "scroll_to"];
      await browser.call<WaitForData>("browser.wait_for", {
        tabId: opened.tab.tabId,
        condition: { type: "url", value: "/kitchen-sink", match: "contains" },
        timeoutMs: 5_000,
      });
      await browser.call<WaitForData>("browser.wait_for", {
        tabId: opened.tab.tabId,
        condition: {
          type: "text",
          value: "Browser bridge kitchen sink",
          match: "contains",
          caseSensitive: false,
        },
        timeoutMs: 5_000,
      });
      await browser.call<WaitForData>("browser.wait_for", {
        tabId: opened.tab.tabId,
        condition: { type: "dom_stable", stableMs: 150 },
        timeoutMs: 5_000,
      });
      results.waitConditions = ["selector", "title", "url", "text", "dom_stable"];

      const details = ["outline", "minimal", "interactive", "semantic", "full"] as const;
      const snapshotSizes: Record<string, { elements: number; bytes: number }> = {};
      let fullSnapshot: PageSnapshot | undefined;
      for (const detail of details) {
        const page = await snapshot(detail);
        snapshotSizes[detail] = {
          elements: page.metadata.elementCount,
          bytes: Buffer.byteLength(JSON.stringify(page), "utf8"),
        };
        if (detail === "outline") assert(Array.isArray(page.outline), "Outline nodes missing");
        if (detail === "full") fullSnapshot = page;
      }
      assert(fullSnapshot, "Full snapshot missing");
      assert(snapshotSizes.outline!.bytes < snapshotSizes.full!.bytes, "Outline is not smaller");
      assert(
        snapshotSizes.interactive!.bytes < snapshotSizes.full!.bytes,
        "Interactive is not smaller",
      );
      const compactFull = JSON.stringify(fullSnapshot);
      assert(!compactFull.includes('"visible":true'), "Default visible:true was serialized");
      assert(!compactFull.includes('"enabled":true'), "Default enabled:true was serialized");
      assert(!compactFull.includes('"focused":false'), "Default focused:false was serialized");
      assert(!compactFull.includes("fixture-only-password"), "Password value leaked into snapshot");
      for (const selector of ["#readonly-input", "#file-input", "#color-input"]) {
        const element = fullSnapshot.elements.find(
          (candidate) => candidate.selectors.css === selector,
        );
        assert(element && element.editable !== true, `${selector} was incorrectly marked editable`);
      }
      const scopeMatch = await findOne(fullSnapshot, { css: "#input-form" });
      const scoped = await snapshot("interactive", {
        documentId: fullSnapshot.metadata.documentId,
        domRevision: fullSnapshot.metadata.domRevision,
        elementId: scopeMatch.elementId,
      });
      assert(
        scoped.metadata.elementCount < fullSnapshot.metadata.elementCount,
        "Scoped snapshot not smaller",
      );
      results.snapshots = { ...snapshotSizes, scopedElements: scoped.metadata.elementCount };

      const unique = await find(await snapshot(), { css: "#text-input" }, 1);
      assert(unique.matches.length === 1 && !unique.truncated, "Unique find incorrectly truncated");
      const manyTextboxes = await find(await snapshot(), { role: "textbox" }, 1);
      assert(manyTextboxes.matches.length === 1 && manyTextboxes.truncated, "Find not truncated");
      assert(manyTextboxes.matchesTruncated, "matchesTruncated is false");
      const regexButtons = await find(
        await snapshot(),
        { role: "button", regex: { pattern: "(Action|Choose|Shadow)", flags: "iu" } },
        20,
      );
      assert(regexButtons.matches.length >= 3, "Regex button search returned too few elements");
      const proCell = await find(
        await snapshot("semantic"),
        { role: "button", name: "Choose pro", table: { row: 3, column: 2 } },
        2,
      );
      assert(proCell.matches.length === 1, "Table-relative lookup failed");
      results.find = {
        uniqueTruncated: unique.truncated,
        manyTruncated: manyTextboxes.truncated,
        regexButtons: regexButtons.matches.length,
        tableRelative: proCell.matches.length,
      };

      const firstTextPage = await snapshot();
      const firstText = await findOne(firstTextPage, { css: "#text-input", inputType: "text" });
      const replaced = await browser.call<TypeTextData>("browser.type_text", {
        tabId: opened.tab.tabId,
        elementId: firstText.elementId,
        documentId: firstTextPage.metadata.documentId,
        domRevision: firstTextPage.metadata.domRevision,
        text: "alpha",
        mode: "replace",
        dispatchChange: true,
      });
      assert(replaced.resolvedElementId, "type_text did not return resolvedElementId");
      const appended = await browser.call<TypeTextData>("browser.type_text", {
        tabId: opened.tab.tabId,
        elementId: replaced.resolvedElementId ?? firstText.elementId,
        documentId: firstTextPage.metadata.documentId,
        domRevision: replaced.domRevisionAfter,
        text: " beta",
        mode: "append",
        dispatchChange: true,
      });
      assert(appended.characters === 5 && appended.changed, "Append typing did not report change");
      await typeInto({ css: "#search-input" }, "needle");
      await typeInto({ css: "#email-input" }, "agent@example.test");
      await typeInto({ css: "#number-input" }, "42");
      await typeInto({ css: "#date-input" }, "2026-07-22");
      await typeInto({ css: "#notes" }, "Line one\nLine two");
      await browser.call<WaitForData>("browser.wait_for", {
        tabId: opened.tab.tabId,
        condition: {
          type: "text",
          value: "notes change event observed",
          match: "contains",
        },
        timeoutMs: 5_000,
      });
      results.inputs = "text/search/email/number/date/textarea + native events";

      for (const [selector, expectedCode] of [
        ["#readonly-input", "ELEMENT_NOT_INTERACTABLE"],
        ["#disabled-input", "ELEMENT_NOT_INTERACTABLE"],
        ["#file-input", "ELEMENT_NOT_INTERACTABLE"],
        ["#color-input", "ELEMENT_NOT_INTERACTABLE"],
        ["#password-input", "POLICY_DENIED"],
      ] as const) {
        const page = await snapshot();
        const element = await findOne(page, { css: selector, visible: true });
        await expectCode(
          browser.call("browser.type_text", {
            tabId: opened.tab.tabId,
            elementId: element.elementId,
            documentId: page.metadata.documentId,
            domRevision: page.metadata.domRevision,
            text: "must-not-apply",
            mode: "replace",
          }),
          expectedCode,
          `typing into ${selector}`,
        );
      }
      results.inputPolicy = "readonly/disabled/file/color/password denied";

      const filePage = await snapshot();
      const fileInput = await findOne(filePage, { css: "#file-input", inputType: "file" });
      await expectCode(
        browser.call("browser.set_file_input_files", {
          tabId: opened.tab.tabId,
          elementId: fileInput.elementId,
          documentId: filePage.metadata.documentId,
          domRevision: filePage.metadata.domRevision,
          filePaths: [`${uploadOne}.missing`],
          authorization,
        }),
        "LOCAL_FILE_NOT_FOUND",
        "missing local upload file",
      );
      const oneFile = await browser.call<SetFileInputFilesData>("browser.set_file_input_files", {
        tabId: opened.tab.tabId,
        elementId: fileInput.elementId,
        documentId: filePage.metadata.documentId,
        domRevision: filePage.metadata.domRevision,
        filePaths: [uploadOne],
        authorization,
      });
      assert(
        oneFile.fileCount === 1 && oneFile.countVerified && !oneFile.multiple,
        "Single file input failed",
      );
      const multiFilePage = await snapshot();
      const multiFileInput = await findOne(multiFilePage, {
        css: "#multi-file-input",
        inputType: "file",
      });
      const twoFiles = await browser.call<SetFileInputFilesData>("browser.set_file_input_files", {
        tabId: opened.tab.tabId,
        elementId: multiFileInput.elementId,
        documentId: multiFilePage.metadata.documentId,
        domRevision: multiFilePage.metadata.domRevision,
        filePaths: [uploadOne, uploadTwo],
        authorization,
      });
      assert(
        twoFiles.fileCount === 2 && twoFiles.countVerified && twoFiles.multiple,
        "Multiple file input failed",
      );
      await browser.call<WaitForData>("browser.wait_for", {
        tabId: opened.tab.tabId,
        condition: { type: "text", value: "multi-file-input change: 2 file(s)", match: "contains" },
        timeoutMs: 5_000,
      });
      results.fileUpload = "single/multiple local files + events; missing path denied";

      const singlePage = await snapshot();
      const single = await findOne(singlePage, { css: "#single-select" });
      const selectedSingle = await browser.call<SelectOptionData>("browser.select_option", {
        tabId: opened.tab.tabId,
        elementId: single.elementId,
        documentId: singlePage.metadata.documentId,
        domRevision: singlePage.metadata.domRevision,
        selection: { values: ["beta"] },
      });
      assert(selectedSingle.selectedCount === 1 && selectedSingle.changed, "Single select failed");
      const multiPage = await snapshot();
      const multi = await findOne(multiPage, { css: "#multi-select" });
      const selectedMulti = await browser.call<SelectOptionData>("browser.select_option", {
        tabId: opened.tab.tabId,
        elementId: multi.elementId,
        documentId: multiPage.metadata.documentId,
        domRevision: multiPage.metadata.domRevision,
        selection: { values: ["one", "three"] },
      });
      assert(selectedMulti.selectedCount === 2, "Multi-select failed");

      const checkboxPage = await snapshot();
      const checkbox = await findOne(checkboxPage, { css: "#checkbox-input" });
      const checked = await browser.call<SetCheckedData>("browser.check", {
        tabId: opened.tab.tabId,
        elementId: checkbox.elementId,
        documentId: checkboxPage.metadata.documentId,
        domRevision: checkboxPage.metadata.domRevision,
      });
      assert(checked.checked, "Checkbox check failed");
      const unchecked = await browser.call<SetCheckedData>("browser.uncheck", {
        tabId: opened.tab.tabId,
        elementId: checked.resolvedElementId ?? checkbox.elementId,
        documentId: checkboxPage.metadata.documentId,
        domRevision: checked.domRevisionAfter,
      });
      assert(!unchecked.checked, "Checkbox uncheck failed");
      const radioPage = await snapshot();
      const radio = await findOne(radioPage, { css: "#radio-express" });
      const radioChecked = await browser.call<SetCheckedData>("browser.check", {
        tabId: opened.tab.tabId,
        elementId: radio.elementId,
        documentId: radioPage.metadata.documentId,
        domRevision: radioPage.metadata.domRevision,
      });
      assert(radioChecked.checked, "Radio check failed");
      await expectCode(
        browser.call("browser.uncheck", {
          tabId: opened.tab.tabId,
          elementId: radioChecked.resolvedElementId ?? radio.elementId,
          documentId: radioPage.metadata.documentId,
          domRevision: radioChecked.domRevisionAfter,
        }),
        "ELEMENT_NOT_INTERACTABLE",
        "unchecking radio",
      );
      results.choiceControls = "single/multi select, checkbox, radio";

      await typeInto({ css: "#plain-editor" }, "Plain editor value");
      await typeInto({ css: "#prosemirror-editor" }, "ProseMirror value");
      await typeInto({ css: "#ckeditor-editor" }, "CKEditor value");
      await browser.call<WaitForData>("browser.wait_for", {
        tabId: opened.tab.tabId,
        condition: {
          type: "text",
          value: "ckeditor-editor input event observed",
          match: "contains",
        },
        timeoutMs: 5_000,
      });
      await typeInto({ css: "#codemirror-editor" }, "<?php\nreturn 'synchronized';");
      const codeEditorFormPage = await snapshot();
      const codeEditorForm = await findOne(codeEditorFormPage, { css: "#code-editor-form" });
      const codeEditorSubmitted = await browser.call<SubmitFormData>("browser.submit_form", {
        tabId: opened.tab.tabId,
        elementId: codeEditorForm.elementId,
        documentId: codeEditorFormPage.metadata.documentId,
        domRevision: codeEditorFormPage.metadata.domRevision,
        authorization,
      });
      assert(codeEditorSubmitted.submitted, "CodeMirror form submission failed");
      await browser.call<WaitForData>("browser.wait_for", {
        tabId: opened.tab.tabId,
        condition: {
          type: "text",
          value: "Code editor submitted with synchronized model",
          match: "contains",
        },
        timeoutMs: 5_000,
      });
      results.editors =
        "contenteditable/ProseMirror/CKEditor-like + CodeMirror model persistence on submit";

      const wordpressMenu = await browser.call<GetWordPressMenuData>("browser.get_wordpress_menu", {
        tabId: opened.tab.tabId,
      });
      assert(
        wordpressMenu.menuId === "151" &&
          wordpressMenu.itemCount === 5 &&
          wordpressMenu.items.find(({ itemId }) => itemId === "103")?.parentItemId === "102",
        "WordPress menu tree inspection failed",
      );
      const wordpressEdit = await browser.call<EditWordPressMenuData>(
        "browser.edit_wordpress_menu",
        {
          tabId: opened.tab.tabId,
          documentId: wordpressMenu.documentId,
          domRevision: wordpressMenu.domRevision,
          operations: [
            { type: "update", itemId: "101", label: "Start", url: "/start/" },
            {
              type: "add_custom",
              label: "Contact",
              url: "/contact/",
              destination: { placement: "after", targetItemId: "101" },
            },
            {
              type: "move",
              itemId: "102",
              destination: { placement: "inside_end", targetItemId: "104" },
            },
            { type: "remove", itemId: "105", includeChildren: false },
          ],
          save: true,
          authorization,
        },
      );
      assert(
        wordpressEdit.changed &&
          wordpressEdit.submitted &&
          wordpressEdit.operationTypes.join(",") === "update,add_custom,move,remove",
        "WordPress menu edit batch did not complete",
      );
      await browser.call<WaitForData>("browser.wait_for", {
        tabId: opened.tab.tabId,
        condition: {
          type: "text",
          value: "WordPress menu submitted with synchronized tree",
          match: "contains",
        },
        timeoutMs: 5_000,
      });
      const wordpressVerified = await browser.call<GetWordPressMenuData>(
        "browser.get_wordpress_menu",
        {
          tabId: opened.tab.tabId,
        },
      );
      assert(
        wordpressVerified.itemCount === 5 &&
          wordpressVerified.dirty &&
          wordpressVerified.items.map(({ itemId }) => itemId).join(",") === "101,-1,104,102,103" &&
          wordpressVerified.items.find(({ itemId }) => itemId === "102")?.parentItemId === "104" &&
          wordpressVerified.items.find(({ itemId }) => itemId === "103")?.depth === 2,
        "WordPress menu tree was not synchronized after editing",
      );
      results.wordpressMenu =
        "typed read + update/add/remove/subtree move + requestSubmit + post-submit verification";

      const wordpressAdmin = await browser.call<GetWordPressAdminData>(
        "browser.get_wordpress_admin",
        {
          tabId: opened.tab.tabId,
        },
      );
      assert(
        wordpressAdmin.screen.heading === "Posts" &&
          wordpressAdmin.adminBar.siteName === "Invictum Fixture Site" &&
          wordpressAdmin.notices.some(({ text }) => text.includes("Fixture post list is ready")) &&
          wordpressAdmin.listTable?.rows.length === 2 &&
          wordpressAdmin.listTable.rows[0]?.rowId === "post-201" &&
          wordpressAdmin.listTable.rows[0]?.actions.some(({ key }) => key === "edit") &&
          wordpressAdmin.listTable.bulkActions.some(({ key }) => key === "trash"),
        "WordPress admin/list-table inspection failed",
      );
      const rowAction = await browser.call<WordPressListTableActionData>(
        "browser.wordpress_list_table_action",
        {
          tabId: opened.tab.tabId,
          documentId: wordpressAdmin.documentId,
          domRevision: wordpressAdmin.domRevision,
          operation: "open_row_action",
          rowId: "post-201",
          actionKey: "edit",
          authorization,
        },
      );
      assert(
        rowAction.triggered && !rowAction.destructive,
        "WordPress non-destructive row action failed",
      );
      await browser.call<WaitForData>("browser.wait_for", {
        tabId: opened.tab.tabId,
        condition: {
          type: "text",
          value: "WordPress row action edit opened for post-201",
          match: "contains",
        },
        timeoutMs: 5_000,
      });
      const adminAfterRowAction = await browser.call<GetWordPressAdminData>(
        "browser.get_wordpress_admin",
        {
          tabId: opened.tab.tabId,
        },
      );
      assert(adminAfterRowAction.listTable !== null, "WordPress list table disappeared");
      const bulkAction = await browser.call<WordPressListTableActionData>(
        "browser.wordpress_list_table_action",
        {
          tabId: opened.tab.tabId,
          documentId: adminAfterRowAction.documentId,
          domRevision: adminAfterRowAction.domRevision,
          operation: "apply_bulk",
          rowIds: ["post-201", "post-202"],
          actionKey: "edit",
          authorization,
        },
      );
      assert(
        bulkAction.triggered && bulkAction.rowIds.length === 2 && !bulkAction.destructive,
        "WordPress bulk edit action failed",
      );
      await browser.call<WaitForData>("browser.wait_for", {
        tabId: opened.tab.tabId,
        condition: {
          type: "text",
          value: "WordPress bulk action edit applied to post-201,post-202",
          match: "contains",
        },
        timeoutMs: 5_000,
      });
      results.wordpressAdmin =
        "bounded screen/notices/list-table read + stable row action + exact multi-row bulk action";

      const wordpressEditor = await browser.call<GetWordPressEditorData>(
        "browser.get_wordpress_editor",
        {
          tabId: opened.tab.tabId,
          maxContentChars: 100_000,
        },
      );
      assert(
        wordpressEditor.editorKind === "block" &&
          wordpressEditor.postId === "301" &&
          wordpressEditor.title === "Fixture Gutenberg post" &&
          wordpressEditor.categoryIds.join(",") === "4",
        "WordPress Gutenberg model inspection failed",
      );
      const editorNoOp = await browser.call<EditWordPressEditorData>(
        "browser.edit_wordpress_editor",
        {
          tabId: opened.tab.tabId,
          documentId: wordpressEditor.documentId,
          domRevision: wordpressEditor.domRevision,
          fields: {
            title: wordpressEditor.title,
            status: "draft",
            categoryIds: [4],
          },
          save: false,
          authorization,
        },
      );
      assert(!editorNoOp.changed, "WordPress editor incorrectly reported a no-op as changed");
      const editorAfterNoOp = await browser.call<GetWordPressEditorData>(
        "browser.get_wordpress_editor",
        {
          tabId: opened.tab.tabId,
        },
      );
      assert(!editorAfterNoOp.dirty, "WordPress editor no-op incorrectly dirtied the page");
      const editorChanged = await browser.call<EditWordPressEditorData>(
        "browser.edit_wordpress_editor",
        {
          tabId: opened.tab.tabId,
          documentId: editorAfterNoOp.documentId,
          domRevision: editorAfterNoOp.domRevision,
          fields: {
            title: "Updated Gutenberg fixture",
            content:
              "<!-- wp:paragraph --><p>Updated through the authoritative model.</p><!-- /wp:paragraph -->",
            excerpt: "Updated fixture excerpt.",
            slug: "updated-gutenberg-fixture",
            categoryIds: [4, 5],
            tagIds: [8, 9],
            featuredMediaId: 23,
            status: "draft",
          },
          save: false,
          authorization,
        },
      );
      assert(
        editorChanged.changed &&
          !editorChanged.saved &&
          editorChanged.fieldNames.includes("content"),
        "WordPress editor draft update failed",
      );
      const editorReview = await browser.call<GetWordPressEditorData>(
        "browser.get_wordpress_editor",
        {
          tabId: opened.tab.tabId,
        },
      );
      assert(
        editorReview.title === "Updated Gutenberg fixture" &&
          editorReview.content.includes("authoritative model") &&
          editorReview.categoryIds.join(",") === "4,5" &&
          editorReview.dirty,
        "WordPress editor review read did not reflect the authoritative model",
      );
      const editorSaved = await browser.call<EditWordPressEditorData>(
        "browser.edit_wordpress_editor",
        {
          tabId: opened.tab.tabId,
          documentId: editorReview.documentId,
          domRevision: editorReview.domRevision,
          fields: {},
          save: true,
          authorization,
        },
      );
      assert(
        editorSaved.saved && editorSaved.verificationRequired && !editorSaved.publishRequested,
        "WordPress editor save-only action failed",
      );
      await browser.call<WaitForData>("browser.wait_for", {
        tabId: opened.tab.tabId,
        condition: {
          type: "text",
          value: "WordPress editor saved draft: Updated Gutenberg fixture",
          match: "contains",
        },
        timeoutMs: 5_000,
      });
      const editorVerified = await browser.call<GetWordPressEditorData>(
        "browser.get_wordpress_editor",
        {
          tabId: opened.tab.tabId,
        },
      );
      assert(
        !editorVerified.dirty && editorVerified.lastSaveSucceeded === true,
        "WordPress editor save verification failed",
      );
      results.wordpressEditor =
        "Gutenberg model read + typed draft update + review + save-only + post-save verification";

      await typeInto({ css: "#shadow-input" }, "Shadow input value");
      await typeInto({ css: "#shadow-editor" }, "Shadow editor value");
      await click({ css: "#shadow-button", role: "button" });
      await browser.call<WaitForData>("browser.wait_for", {
        tabId: opened.tab.tabId,
        condition: { type: "text", value: "Shadow action completed", match: "contains" },
        timeoutMs: 5_000,
      });
      results.shadowDom = "input/editor/button";

      await click({ css: "#ordinary-button", role: "button" });
      await browser.call<WaitForData>("browser.wait_for", {
        tabId: opened.tab.tabId,
        condition: { type: "text", value: "Ordinary action completed", match: "contains" },
        timeoutMs: 5_000,
      });

      await click({ css: "#implicit-nonform-button", role: "button" });
      await browser.call<WaitForData>("browser.wait_for", {
        tabId: opened.tab.tabId,
        condition: {
          type: "text",
          value: "Implicit non-form button clicked",
          match: "contains",
        },
        timeoutMs: 5_000,
      });

      const stablePage = await snapshot();
      const stableTarget = await findOne(stablePage, { css: "#stable-target" });
      const unrelatedInput = await findOne(stablePage, { css: "#text-input" });
      await browser.call<TypeTextData>("browser.type_text", {
        tabId: opened.tab.tabId,
        elementId: unrelatedInput.elementId,
        documentId: stablePage.metadata.documentId,
        domRevision: stablePage.metadata.domRevision,
        text: "revision tick",
        mode: "replace",
        dispatchChange: true,
      });
      const relocated = await browser.call<ClickElementData>("browser.click", {
        tabId: opened.tab.tabId,
        elementId: stableTarget.elementId,
        documentId: stablePage.metadata.documentId,
        domRevision: stablePage.metadata.domRevision,
      });
      assert(relocated.resolvedElementId, "N-1 relocation did not return resolvedElementId");
      const identityPage = await snapshot();
      const identityTarget = await findOne(identityPage, { css: "#identity-target" });
      await browser.call<ClickElementData>("browser.click", {
        tabId: opened.tab.tabId,
        elementId: identityTarget.elementId,
        documentId: identityPage.metadata.documentId,
        domRevision: identityPage.metadata.domRevision,
      });
      const readEval = await browser.call<EvaluateJavaScriptData>("browser.evaluate", {
        tabId: opened.tab.tabId,
        expression: "document.title",
        mode: "read_only",
        authorization,
      });
      assert(readEval.value === "Invictum Kitchen Sink Fixture", "Positive read evaluate failed");
      const mutationEval = await browser.call<EvaluateJavaScriptData>("browser.evaluate", {
        tabId: opened.tab.tabId,
        expression:
          'document.querySelector("#unrelated-mutation")?.setAttribute("data-evaluated", "true")',
        mode: "page_mutation",
        authorization,
      });
      assert(mutationEval.value === null, "Mutation evaluate did not normalize undefined to null");
      await expectCode(
        browser.call("browser.click", {
          tabId: opened.tab.tabId,
          elementId: identityTarget.elementId,
          documentId: identityPage.metadata.documentId,
          domRevision: identityPage.metadata.domRevision,
        }),
        "STALE_ELEMENT_REFERENCE",
        "identity-changing stale reference",
      );
      results.staleReferences = "safe N-1 relocation + fingerprint rejection";

      await expectCode(
        browser.call("browser.evaluate", {
          tabId: opened.tab.tabId,
          expression: 'fetch("https://example.com/")',
          mode: "read_only",
          authorization,
        }),
        "SCRIPT_POLICY_DENIED",
        "network-capable custom JavaScript",
      );
      await expectCode(
        browser.call("browser.evaluate", {
          tabId: opened.tab.tabId,
          expression: 'eval("1 + 1")',
          mode: "read_only",
          authorization,
        }),
        "SCRIPT_POLICY_DENIED",
        "dynamic evaluation",
      );
      results.javascript = "read + authorized mutation; fetch/eval policy denied";

      const advancedPage = await snapshot("full");
      const advancedTarget = await findOne(advancedPage, { css: "#advanced-target" });
      await expectCode(
        browser.call("browser.mutate_dom", {
          tabId: opened.tab.tabId,
          documentId: advancedPage.metadata.documentId,
          domRevision: advancedPage.metadata.domRevision,
          elementId: advancedTarget.elementId,
          operations: [
            {
              type: "set_style",
              property: "background-image",
              value: 'image("https://tracker.test/pixel")',
            },
          ],
          authorization,
        }),
        "POLICY_DENIED",
        "network-capable inline CSS",
      );
      const mutation = await browser.call<MutateDomData>("browser.mutate_dom", {
        tabId: opened.tab.tabId,
        documentId: advancedPage.metadata.documentId,
        domRevision: advancedPage.metadata.domRevision,
        elementId: advancedTarget.elementId,
        operations: [
          { type: "set_text", text: "Advanced target changed by typed DOM mutation" },
          { type: "set_attribute", name: "data-agent-state", value: "mutated" },
          { type: "set_style", property: "color", value: "rgb(12 34 56)" },
          {
            type: "insert_html",
            position: "beforeend",
            html: '<strong id="sanitized-child"> safe child</strong><span id="sanitized-style" style="background:url(https://tracker.test/pixel)">clean style</span><a id="sanitized-link" href="javascript:alert(1)">clean link</a><style id="sanitized-sheet">@import "https://tracker.test/style.css";</style><script>window.fixtureLeak = true</script><iframe src="https://example.test"></iframe>',
          },
        ],
        authorization,
      });
      assert(
        mutation.operationsApplied === 4 && mutation.sanitizedHtml,
        "Typed DOM mutation failed",
      );
      const mutatedPage = await snapshot("full");
      assert(
        JSON.stringify(mutatedPage).includes("sanitized-child") &&
          !JSON.stringify(mutatedPage).includes("fixtureLeak"),
        "Inserted HTML was not sanitized",
      );
      const sanitizedStyle = await findOne(mutatedPage, { css: "#sanitized-style" });
      const sanitizedInspection = await browser.call<InspectElementData>(
        "browser.inspect_element",
        {
          tabId: opened.tab.tabId,
          documentId: mutatedPage.metadata.documentId,
          domRevision: mutatedPage.metadata.domRevision,
          elementId: sanitizedStyle.elementId,
          computedStyleProperties: ["background-image"],
          includeEventListeners: false,
        },
      );
      assert(
        sanitizedInspection.element.inlineStyle.length === 0,
        "Sanitized HTML retained an inline style",
      );
      const hiddenMutationPage = await browser.call<PageSnapshot>("browser.get_page_snapshot", {
        tabId: opened.tab.tabId,
        detail: "full",
        includeHidden: true,
      });
      const sanitizedSheets = await find(hiddenMutationPage, {
        css: "#sanitized-sheet",
        visible: false,
      });
      assert(sanitizedSheets.matches.length === 0, "Sanitized HTML retained a style element");

      const inspectedTarget = await findOne(mutatedPage, { css: "#advanced-target" });
      const inspected = await browser.call<InspectElementData>("browser.inspect_element", {
        tabId: opened.tab.tabId,
        documentId: mutatedPage.metadata.documentId,
        domRevision: mutatedPage.metadata.domRevision,
        elementId: inspectedTarget.elementId,
        computedStyleProperties: ["display", "color", "border-top-width"],
        includeEventListeners: false,
      });
      assert(
        inspected.element.attributes.some(
          ({ name, value }) => name === "data-agent-state" && value === "mutated",
        ),
        "Element inspection did not expose the safe custom attribute",
      );
      assert(
        inspected.element.inlineStyle.some(({ name }) => name === "color"),
        "Element inspection did not expose inline style",
      );

      const triggerPage = await snapshot();
      const trigger = await findOne(triggerPage, { css: "#custom-dropdown-trigger" });
      const listenerInspection = await browser.call<InspectElementData>("browser.inspect_element", {
        tabId: opened.tab.tabId,
        documentId: triggerPage.metadata.documentId,
        domRevision: triggerPage.metadata.domRevision,
        elementId: trigger.elementId,
        includeEventListeners: true,
        includeDocumentListeners: true,
        listenerDepth: 2,
        maxListeners: 80,
        sourceExcerptChars: 2_000,
      });
      assert(listenerInspection.debuggerUsed, "Listener inspection did not use debugger");
      assert(
        listenerInspection.eventListeners.some(
          ({ target, type }) => target === "document" && type === "click",
        ),
        "Delegated document click listener was not discovered",
      );
      assert(
        listenerInspection.eventListeners.some(({ sourceExcerpt }) =>
          sourceExcerpt.includes("handleFixtureDropdownClick"),
        ),
        "Listener source excerpt did not explain the generated dropdown",
      );

      const sectionPage = await snapshot();
      const section = await findOne(sectionPage, { css: "#advanced-laboratory" });
      const capture = await browser.call<ObserveEventsData>("browser.observe_events", {
        operation: "start",
        tabId: opened.tab.tabId,
        eventTypes: ["click", "keydown", "fixture:selection"],
        scope: {
          documentId: sectionPage.metadata.documentId,
          domRevision: sectionPage.metadata.domRevision,
          elementId: section.elementId,
        },
        maxEvents: 50,
      });
      await click({ css: "#custom-dropdown-trigger" });
      await click({ css: "#fixture-listbox [data-value='generated-beta']" });
      const captured = await browser.call<ObserveEventsData>("browser.observe_events", {
        operation: "read",
        tabId: opened.tab.tabId,
        captureId: capture.captureId,
      });
      assert(
        captured.events.some(({ type }) => type === "click"),
        "Click event was not captured",
      );
      assert(
        captured.events.some(({ type }) => type === "fixture:selection"),
        "Custom event was not captured",
      );
      assert(
        captured.events.every((event) => !("value" in event)),
        "Event capture unexpectedly included a control value",
      );
      const lastSequence = Math.max(...captured.events.map(({ sequence }) => sequence));
      await browser.call<ObserveEventsData>("browser.observe_events", {
        operation: "read",
        tabId: opened.tab.tabId,
        captureId: capture.captureId,
        clear: true,
      });
      await click({ css: "#custom-dropdown-trigger" });
      const afterClear = await browser.call<ObserveEventsData>("browser.observe_events", {
        operation: "read",
        tabId: opened.tab.tabId,
        captureId: capture.captureId,
      });
      assert(
        afterClear.events.length > 0 &&
          afterClear.events.every(({ sequence }) => sequence > lastSequence),
        "Event sequence restarted after clearing the capture buffer",
      );
      await browser.call<ObserveEventsData>("browser.observe_events", {
        operation: "stop",
        tabId: opened.tab.tabId,
        captureId: capture.captureId,
      });

      const injected = await browser.call<ManageCssData>("browser.manage_css", {
        operation: "add",
        tabId: opened.tab.tabId,
        css: "#advanced-target { border-width: 7px !important; outline: 3px solid rgb(0 120 255) !important; }",
        origin: "USER",
        authorization,
      });
      const styledPage = await snapshot();
      const styledTarget = await findOne(styledPage, { css: "#advanced-target" });
      const styledInspection = await browser.call<InspectElementData>("browser.inspect_element", {
        tabId: opened.tab.tabId,
        documentId: styledPage.metadata.documentId,
        domRevision: styledPage.metadata.domRevision,
        elementId: styledTarget.elementId,
        computedStyleProperties: ["border-top-width", "outline-width"],
        includeEventListeners: false,
      });
      assert(
        styledInspection.element.computedStyle.some(
          ({ name, value }) =>
            name === "border-top-width" && Math.abs(Number.parseFloat(value) - 7) <= 0.5,
        ),
        "Injected CSS did not change computed style within device-pixel rounding tolerance",
      );
      await browser.call<ManageCssData>("browser.manage_css", {
        operation: "remove",
        tabId: opened.tab.tabId,
        injectionId: injected.injectionId,
        authorization,
      });

      const rawRead = await browser.call<ExecuteJavaScriptData>("browser.execute_javascript", {
        tabId: opened.tab.tabId,
        source:
          "({ title: document.title, generatedOptions: document.querySelectorAll('#fixture-listbox [role=option]').length })",
        authorization,
      });
      assert(
        typeof rawRead.value === "object" && rawRead.value !== null,
        "Raw JavaScript did not return an object by value",
      );
      const rawMutation = await browser.call<ExecuteJavaScriptData>("browser.execute_javascript", {
        tabId: opened.tab.tabId,
        source:
          "const node = document.querySelector('#advanced-target'); node.dataset.rawExecution = 'complete'; return { changed: node.dataset.rawExecution };",
        sourceType: "function_body",
        authorization,
      });
      assert(
        typeof rawMutation.value === "object" && rawMutation.value !== null,
        "Raw function-body JavaScript did not complete",
      );
      await expectCode(
        browser.call("browser.execute_javascript", {
          tabId: opened.tab.tabId,
          source: "document.cookie",
          authorization,
        }),
        "SCRIPT_POLICY_DENIED",
        "protected raw JavaScript surface",
      );
      results.advancedTools = {
        typedDomMutation: mutation.operationTypes,
        listenerCount: listenerInspection.eventListeners.length,
        listenerSourceFound: true,
        capturedEvents: captured.eventCount,
        cssAddRemove: true,
        rawJavaScript: "by-value read + function body; protected surfaces denied",
      };

      await browser.call<BrowserConsoleData>("browser.console", {
        operation: "start",
        tabId: opened.tab.tabId,
        bufferSize: 50,
      });
      await browser.call<ExecuteJavaScriptData>("browser.execute_javascript", {
        tabId: opened.tab.tabId,
        source: "console.error('invictum fixture diagnostic'); return true;",
        sourceType: "function_body",
        authorization,
      });
      const consoleRead = await browser.call<BrowserConsoleData>("browser.console", {
        operation: "read",
        tabId: opened.tab.tabId,
      });
      assert(
        consoleRead.entries.some(({ text }) => text.includes("invictum fixture diagnostic")),
        "Programmatic console did not capture the fixture error",
      );
      await browser.call<BrowserConsoleData>("browser.console", {
        operation: "stop",
        tabId: opened.tab.tabId,
      });

      const mobile = await browser.call<DeviceEmulationData>("browser.emulate_device", {
        operation: "set",
        tabId: opened.tab.tabId,
        preset: "mobile_medium",
        orientation: "portrait",
      });
      assert(
        mobile.active && mobile.profile?.width === 390 && mobile.profile.height === 844,
        "Mobile emulation profile was not applied",
      );
      const mobileMetrics = await browser.call<ExecuteJavaScriptData>(
        "browser.execute_javascript",
        {
          tabId: opened.tab.tabId,
          source:
            "return { screenWidth: screen.width, screenHeight: screen.height, outerWidth, outerHeight, devicePixelRatio };",
          sourceType: "function_body",
          authorization,
        },
      );
      assert(isRecord(mobileMetrics.value), "Mobile runtime metrics were not returned");
      assert(
        mobileMetrics.value["screenWidth"] === 390 &&
          mobileMetrics.value["screenHeight"] === 844 &&
          mobileMetrics.value["outerWidth"] === 390 &&
          mobileMetrics.value["outerHeight"] === 844 &&
          mobileMetrics.value["devicePixelRatio"] === 3,
        "Chrome runtime did not expose the emulated device metrics",
      );
      const mobilePage = await snapshot("minimal");
      assert(
        mobilePage.page.viewport.deviceScaleFactor === 3 &&
          mobilePage.page.viewport.width < fullSnapshot.page.viewport.width,
        "The page did not switch to a narrower high-DPR layout viewport",
      );
      const mobileScreenshot = await browser.call<CaptureScreenshotData>("browser.screenshot", {
        tabId: opened.tab.tabId,
        quality: 60,
        maxWidth: 1_200,
        maxHeight: 1_200,
      });
      assert(
        Math.abs(mobileScreenshot.viewport.cssWidth - mobilePage.page.viewport.width) < 1 &&
          mobileScreenshot.viewport.deviceScaleFactor === 3,
        "Screenshot metadata did not match the emulated page viewport",
      );
      const desktopReset = await browser.call<DeviceEmulationData>("browser.emulate_device", {
        operation: "reset",
        tabId: opened.tab.tabId,
      });
      assert(!desktopReset.active, "Mobile emulation did not reset");
      const pdf = await browser.call<PrintToPdfData>("browser.print_to_pdf", {
        tabId: opened.tab.tabId,
        paperSize: "a4",
        printBackground: true,
      });
      assert(
        pdf.mediaType === "application/pdf" &&
          pdf.dataUrl.startsWith("data:application/pdf;base64,") &&
          pdf.byteLength > 100,
        "PDF export did not return a valid bounded document",
      );
      results.devtools = {
        consoleEntries: consoleRead.entryCount,
        mobileScreen: `${mobile.profile.width}x${mobile.profile.height}@${mobile.profile.deviceScaleFactor}`,
        mobileCssViewport: `${mobilePage.page.viewport.width}x${mobilePage.page.viewport.height}`,
        pdfBytes: pdf.byteLength,
        reset: true,
      };

      await click({ css: "#ordinary-button", role: "button" });
      const coordinatePage = await snapshot();
      const coordinateTarget = await findOne(coordinatePage, { css: "#ordinary-button" });
      assert(coordinateTarget.boundingBox, "Coordinate target has no bounding box");
      const screenshot = await browser.call<CaptureScreenshotData>("browser.screenshot", {
        tabId: opened.tab.tabId,
        quality: 70,
        maxWidth: 1_200,
        maxHeight: 900,
      });
      assert(screenshot.dataUrl.length > 100, "Screenshot payload is too small");
      assert(screenshot.width <= 1_200 && screenshot.height <= 900, "Screenshot bounds ignored");
      assert(
        screenshot.capture.mode === "viewport" &&
          !screenshot.capture.fullPage &&
          screenshot.capture.annotationsApplied === 0,
        "Viewport screenshot metadata is invalid",
      );
      const regionScreenshot = await browser.call<CaptureScreenshotData>("browser.screenshot", {
        tabId: opened.tab.tabId,
        mode: "region",
        region: {
          x: Math.max(0, coordinateTarget.boundingBox.x - 24),
          y: Math.max(0, coordinateTarget.boundingBox.y - 24),
          width: coordinateTarget.boundingBox.width + 48,
          height: coordinateTarget.boundingBox.height + 48,
          coordinateSpace: "viewport",
        },
        maxWidth: 1_200,
        maxHeight: 900,
      });
      assert(
        regionScreenshot.capture.mode === "region" &&
          regionScreenshot.capture.sourceCssRect.width > coordinateTarget.boundingBox.width,
        "Region screenshot did not preserve the requested crop",
      );
      const tutorialScreenshot = await browser.call<CaptureScreenshotData>("browser.screenshot", {
        tabId: opened.tab.tabId,
        mode: "element",
        documentId: coordinatePage.metadata.documentId,
        domRevision: coordinatePage.metadata.domRevision,
        elementId: coordinateTarget.elementId,
        padding: 96,
        maxWidth: 1_200,
        maxHeight: 900,
        annotations: [
          {
            target: {
              type: "element",
              elementId: coordinateTarget.elementId,
              padding: 8,
            },
            shape: "rounded_rectangle",
            stroke: "#ef4444",
            strokeWidth: 4,
            label: {
              text: "Click this button",
              position: "auto",
              background: "#ef4444",
              color: "#ffffff",
              fontSize: 18,
              arrow: true,
            },
          },
        ],
      });
      assert(
        tutorialScreenshot.capture.mode === "element" &&
          tutorialScreenshot.capture.annotationsApplied === 1 &&
          tutorialScreenshot.dataUrl.length > 100,
        "Revision-bound tutorial annotation was not rendered",
      );
      const fullPageScreenshot = await browser.call<CaptureScreenshotData>("browser.screenshot", {
        tabId: opened.tab.tabId,
        mode: "full_page",
        quality: 65,
        maxWidth: 1_200,
        maxHeight: 1_600,
      });
      assert(
        fullPageScreenshot.capture.mode === "full_page" &&
          fullPageScreenshot.capture.fullPage &&
          fullPageScreenshot.capture.sourceCssRect.height > fullPageScreenshot.viewport.cssHeight,
        "Full-page screenshot did not extend beyond the viewport",
      );
      await browser.call<ClickAtData>("browser.click_at", {
        tabId: opened.tab.tabId,
        documentId: screenshot.documentId,
        domRevision: screenshot.domRevision,
        x: coordinateTarget.boundingBox.x + coordinateTarget.boundingBox.width / 2,
        y: coordinateTarget.boundingBox.y + coordinateTarget.boundingBox.height / 2,
      });
      results.screenshotAndCoordinates = {
        format: screenshot.mediaType,
        viewport: `${screenshot.width}x${screenshot.height}`,
        region: `${regionScreenshot.width}x${regionScreenshot.height}`,
        tutorial: `${tutorialScreenshot.width}x${tutorialScreenshot.height}`,
        fullPage: `${fullPageScreenshot.width}x${fullPageScreenshot.height}`,
        tutorialAnnotations: tutorialScreenshot.capture.annotationsApplied,
        fullPageCssHeight: fullPageScreenshot.capture.sourceCssRect.height,
      };

      const submitPage = await snapshot();
      const submitButton = await findOne(submitPage, { css: "#submit-button", role: "button" });
      await expectCode(
        browser.call("browser.click", {
          tabId: opened.tab.tabId,
          elementId: submitButton.elementId,
          documentId: submitPage.metadata.documentId,
          domRevision: submitPage.metadata.domRevision,
        }),
        "POLICY_DENIED",
        "ordinary click on submit control",
      );
      const formPage = await snapshot();
      const form = await findOne(formPage, { css: "#input-form" });
      const submitted = await browser.call<SubmitFormData>("browser.submit_form", {
        tabId: opened.tab.tabId,
        elementId: form.elementId,
        documentId: formPage.metadata.documentId,
        domRevision: formPage.metadata.domRevision,
        authorization,
      });
      assert(submitted.submitted, "Authorized form submission failed");
      await browser.call<WaitForData>("browser.wait_for", {
        tabId: opened.tab.tabId,
        condition: { type: "text", value: "Kitchen form submitted", match: "contains" },
        timeoutMs: 5_000,
      });
      results.submission = "ordinary submit click denied; authorized submit succeeded";

      const beforeUnloadActivation = await browser.call<ExecuteJavaScriptData>(
        "browser.execute_javascript",
        {
          tabId: opened.tab.tabId,
          source:
            "window.addEventListener('beforeunload', (event) => { event.preventDefault(); event.returnValue = ''; }); return { armed: true, hasBeenActive: navigator.userActivation.hasBeenActive };",
          sourceType: "function_body",
          userGesture: true,
          authorization,
        },
      );
      assert(
        isRecord(beforeUnloadActivation.value) &&
          beforeUnloadActivation.value["armed"] === true &&
          beforeUnloadActivation.value["hasBeenActive"] === true,
        "Fixture did not acquire the user activation required for beforeunload",
      );
      const beforeUnload = await browser.call<HandleJavaScriptDialogData>(
        "browser.handle_javascript_dialog",
        {
          tabId: opened.tab.tabId,
          accept: true,
          trigger: {
            type: "navigate",
            url: new URL("/basic-form?from=armed-beforeunload", fixtureUrl).toString(),
          },
          timeoutMs: 10_000,
          authorization,
        },
      );
      const navigated = await browser.call<WaitForData>("browser.wait_for", {
        tabId: opened.tab.tabId,
        condition: { type: "url", value: "/basic-form", match: "contains" },
        timeoutMs: 10_000,
      });
      assert(beforeUnload.handled && beforeUnload.accepted, "Armed beforeunload was not accepted");
      assert(
        beforeUnload.type === "beforeunload",
        `Unexpected native dialog type: ${beforeUnload.type}`,
      );
      assert(
        navigated.tab.url.includes("/basic-form"),
        "Navigation did not continue after accepting beforeunload",
      );
      results.beforeUnload = {
        recovery: "armed-before-navigation",
        accepted: beforeUnload.accepted,
        type: beforeUnload.type,
        navigated: true,
      };
    });

    console.log(
      JSON.stringify(
        { ok: true, sessionId, tabId: opened.tab.tabId, fixtureUrl, results },
        null,
        2,
      ),
    );
  } finally {
    if (openedTabId !== undefined) {
      await client.call<CloseTabData>("browser.close_tab", {
        tabId: openedTabId,
        authorization,
      });
    }
    await client.closeSession().catch(() => undefined);
  }
};

await main();
