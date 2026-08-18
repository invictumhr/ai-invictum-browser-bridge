import { describe, expect, it, vi } from "vitest";

import {
  BROWSER_LIST_TABS_ACTION,
  BROWSER_UNLOCK_TAB_ACTION,
  BROWSER_SET_CONTROL_IDENTITY_ACTION,
  createListTabsRequest,
  createListTabsResponse,
  createUnlockTabRequest,
  createUnlockTabResponse,
  createSetControlIdentityRequest,
  createSetControlIdentityResponse,
  createFindElementsRequest,
  createFindElementsResponse,
  createClickRequest,
  createClickResponse,
  createPageSnapshotRequest,
  createPageSnapshotResponse,
  createPingRequest,
  createPongResponse,
  createTypeTextRequest,
  createTypeTextResponse,
  ListTabsDataSchema,
  ListTabsParametersSchema,
  UnlockTabDataSchema,
  UnlockTabParametersSchema,
  SetControlIdentityDataSchema,
  SetControlIdentityParametersSchema,
  GetPageSnapshotParametersSchema,
  FindElementsDataSchema,
  FindElementsParametersSchema,
  ClickElementDataSchema,
  ClickElementParametersSchema,
  PageSnapshotSchema,
  parseIbpEnvelope,
  PendingRequestRegistry,
  ProtocolResponseSchema,
  SystemPongDataSchema,
  TypeTextDataSchema,
  TypeTextParametersSchema,
  SelectOptionParametersSchema,
  SubmitFormParametersSchema,
  EvaluateJavaScriptParametersSchema,
  createSelectOptionRequest,
  createSubmitFormRequest,
  createEvaluateJavaScriptRequest,
  BROWSER_SELECT_OPTION_ACTION,
  BROWSER_SUBMIT_FORM_ACTION,
  BROWSER_EVALUATE_ACTION,
  CaptureScreenshotParametersSchema,
  CaptureScreenshotDataSchema,
  ClickAtParametersSchema,
  ClickAtDataSchema,
  createScreenshotRequest,
  createClickAtRequest,
  BROWSER_SCREENSHOT_ACTION,
  BROWSER_CLICK_AT_ACTION,
  SYSTEM_CAPABILITIES_ACTION,
  BROWSER_OPEN_TAB_ACTION,
  BROWSER_NAVIGATE_ACTION,
  BROWSER_WAIT_FOR_ACTION,
  SystemCapabilitiesDataSchema,
  OpenTabParametersSchema,
  CloseTabParametersSchema,
  NavigateParametersSchema,
  HistoryNavigationParametersSchema,
  ActivateTabParametersSchema,
  GetPageTextParametersSchema,
  FindNaturalLanguageParametersSchema,
  PageApiRequestParametersSchema,
  WaitForParametersSchema,
  createCapabilitiesRequest,
  createOpenTabRequest,
  createNavigateRequest,
  createWaitForRequest,
  parseActionParameters,
  IBP_ERROR_CODES,
  MutateDomParametersSchema,
  InspectElementParametersSchema,
  ManageCssParametersSchema,
  ObserveEventsParametersSchema,
  ExecuteJavaScriptParametersSchema,
  createMutateDomRequest,
  createInspectElementRequest,
  createManageCssRequest,
  createObserveEventsRequest,
  createExecuteJavaScriptRequest,
  BROWSER_MUTATE_DOM_ACTION,
  BROWSER_INSPECT_ELEMENT_ACTION,
  BROWSER_MANAGE_CSS_ACTION,
  BROWSER_OBSERVE_EVENTS_ACTION,
  BROWSER_EXECUTE_JAVASCRIPT_ACTION,
  BrowserConsoleParametersSchema,
  BrowserConsoleDataSchema,
  DeviceEmulationParametersSchema,
  DeviceEmulationDataSchema,
  createBrowserConsoleRequest,
  createDeviceEmulationRequest,
  BROWSER_CONSOLE_ACTION,
  BROWSER_EMULATE_DEVICE_ACTION,
  BROWSER_NETWORK_ACTION,
  BROWSER_PERFORM_GESTURE_ACTION,
  BROWSER_PRINT_TO_PDF_ACTION,
  NetworkCaptureParametersSchema,
  NetworkCaptureDataSchema,
  PerformGestureParametersSchema,
  PerformGestureDataSchema,
  PrintToPdfParametersSchema,
  PrintToPdfDataSchema,
  createNetworkCaptureRequest,
  createPerformGestureRequest,
  createPrintToPdfRequest,
  BROWSER_GET_WORDPRESS_MENU_ACTION,
  BROWSER_EDIT_WORDPRESS_MENU_ACTION,
  GetWordPressMenuParametersSchema,
  GetWordPressMenuDataSchema,
  EditWordPressMenuParametersSchema,
  EditWordPressMenuDataSchema,
  createGetWordPressMenuRequest,
  createGetWordPressMenuResponse,
  createEditWordPressMenuRequest,
  createEditWordPressMenuResponse,
  BROWSER_GET_WORDPRESS_ADMIN_ACTION,
  BROWSER_WORDPRESS_LIST_TABLE_ACTION,
  BROWSER_GET_WORDPRESS_EDITOR_ACTION,
  BROWSER_EDIT_WORDPRESS_EDITOR_ACTION,
  GetWordPressAdminParametersSchema,
  WordPressListTableActionParametersSchema,
  GetWordPressEditorParametersSchema,
  EditWordPressEditorParametersSchema,
  createGetWordPressAdminRequest,
  createWordPressListTableActionRequest,
  createGetWordPressEditorRequest,
  createEditWordPressEditorRequest,
} from "./index.js";
import type { IbpProtocolError } from "./index.js";

describe("IBP protocol validation", () => {
  it("validates a ping request and correlated pong response", () => {
    const request = createPingRequest("session-1", {
      messageId: "request-1",
      nonce: "1234567890abcdef",
      now: new Date("2026-07-22T12:00:00.000Z"),
    });
    const parsedRequest = parseIbpEnvelope(request);

    expect(parsedRequest.direction).toBe("request");

    const response = createPongResponse(request, {
      messageId: "response-1",
      now: new Date("2026-07-22T12:00:00.100Z"),
    });
    const parsedResponse = parseIbpEnvelope(response);

    expect(parsedResponse.correlationId).toBe(request.messageId);
    expect(SystemPongDataSchema.parse(parsedResponse.payload.data)).toMatchObject({
      reply: "pong",
      nonce: "1234567890abcdef",
      component: "extension",
    });
  });

  it("validates runtime capabilities, navigation, waits, and scoped snapshots", () => {
    const capabilities = SystemCapabilitiesDataSchema.parse({
      protocol: "ibp",
      protocolVersion: "1.0",
      component: "extension",
      extensionVersion: "0.1.0",
      actions: [
        {
          action: "browser.open_tab",
          riskLevel: "R1",
          targeted: false,
          description: "Open a web tab",
        },
      ],
      features: {
        persistentHttpHostAccess: true,
        semanticSnapshots: true,
        scopedSnapshots: true,
        compactSnapshots: true,
        outlineSnapshots: true,
        previousRevisionRelocation: true,
        structuredParameterErrors: true,
        screenshots: true,
        screenshotModes: true,
        screenshotAnnotations: true,
        coordinateFallback: true,
        prefilledCredentialPresence: true,
        httpBasicAuth: true,
        nativeJavaScriptDialogs: true,
        localFileUpload: true,
        wordpressMenuEditing: true,
        wordpressAdminTools: true,
        wordpressPostEditing: true,
        elementInspection: true,
        domMutation: true,
        cssInjection: true,
        eventCapture: true,
        browserConsole: true,
        networkCapture: true,
        deviceEmulation: true,
        advancedGestures: true,
        pageText: true,
        naturalLanguageFind: true,
        historyNavigation: true,
        explicitTabActivation: true,
        sameOriginPageApi: true,
        agentBatching: true,
        pdfExport: true,
        rawJavaScript: true,
        customControlIdentity: true,
        configurableTabActivation: true,
        userStop: true,
      },
    });
    expect(capabilities.actions).toHaveLength(1);
    expect(createCapabilitiesRequest("session").payload.action).toBe(SYSTEM_CAPABILITIES_ACTION);

    const open = OpenTabParametersSchema.parse({ url: "https://example.test/path" });
    expect(open.active).toBeUndefined();
    expect(
      OpenTabParametersSchema.parse({ url: "https://example.test/path", active: false }).active,
    ).toBe(false);
    expect(createOpenTabRequest("session", open).payload.action).toBe(BROWSER_OPEN_TAB_ACTION);
    expect(
      CloseTabParametersSchema.parse({
        tabId: 7,
        authorization: {
          source: "explicit_user_instruction",
          instructionId: "user-close-test-tab",
        },
      }).tabId,
    ).toBe(7);
    expect(() =>
      OpenTabParametersSchema.parse({ url: "https://user:pass@example.test/" }),
    ).toThrow();
    expect(() => OpenTabParametersSchema.parse({ url: "file:///private.txt" })).toThrow();

    const navigate = NavigateParametersSchema.parse({ tabId: 2, url: "https://example.test/next" });
    expect(navigate.active).toBeUndefined();
    expect(createNavigateRequest("session", navigate).payload.action).toBe(BROWSER_NAVIGATE_ACTION);
    const wait = WaitForParametersSchema.parse({
      tabId: 2,
      condition: { type: "selector", value: "#ready" },
    });
    expect(createWaitForRequest("session", wait).payload.action).toBe(BROWSER_WAIT_FOR_ACTION);
    expect(wait).toMatchObject({ timeoutMs: 10_000, pollIntervalMs: 200 });

    const scoped = GetPageSnapshotParametersSchema.parse({
      tabId: 2,
      scope: { documentId: "document-1", domRevision: 4, elementId: "element-8" },
    });
    expect(scoped.scope?.elementId).toBe("element-8");
  });

  it("rejects unknown envelope fields", () => {
    const request = { ...createPingRequest("session-1"), unexpected: true };

    expect(() => parseIbpEnvelope(request)).toThrow();
  });

  it("allows clearing text fields but requires explicit authorization for submit and JS", () => {
    expect(
      TypeTextParametersSchema.parse({
        tabId: 7,
        documentId: "document-1",
        domRevision: 1,
        elementId: "field-1",
        text: "",
      }).text,
    ).toBe("");
    expect(() =>
      SubmitFormParametersSchema.parse({
        tabId: 7,
        documentId: "document-1",
        domRevision: 1,
        elementId: "form-1",
      }),
    ).toThrow();
    expect(() =>
      EvaluateJavaScriptParametersSchema.parse({
        tabId: 7,
        expression: "document.title",
      }),
    ).toThrow();
  });

  it("creates validated select, submit, and constrained-JS requests", () => {
    const select = SelectOptionParametersSchema.parse({
      tabId: 7,
      documentId: "document-1",
      domRevision: 1,
      elementId: "select-1",
      selection: { labels: ["Croatia"] },
    });
    expect(createSelectOptionRequest("session", select).payload.action).toBe(
      BROWSER_SELECT_OPTION_ACTION,
    );
    const authorization = {
      source: "explicit_user_instruction" as const,
      instructionId: "user-turn-42",
    };
    const submit = SubmitFormParametersSchema.parse({
      tabId: 7,
      documentId: "document-1",
      domRevision: 1,
      elementId: "form-1",
      authorization,
    });
    expect(createSubmitFormRequest("session", submit).payload.action).toBe(
      BROWSER_SUBMIT_FORM_ACTION,
    );
    const evaluate = EvaluateJavaScriptParametersSchema.parse({
      tabId: 7,
      expression: "document.title",
      authorization,
    });
    expect(createEvaluateJavaScriptRequest("session", evaluate).payload.action).toBe(
      BROWSER_EVALUATE_ACTION,
    );
  });

  it("validates typed WordPress menu inspection and batched editing", () => {
    const getParameters = GetWordPressMenuParametersSchema.parse({ tabId: 7 });
    expect(getParameters.maxItems).toBe(250);
    const getRequest = createGetWordPressMenuRequest("session", getParameters);
    expect(getRequest.payload.action).toBe(BROWSER_GET_WORDPRESS_MENU_ACTION);
    const menuData = GetWordPressMenuDataSchema.parse({
      page: { url: "https://example.test/wp-admin/nav-menus.php", origin: "https://example.test" },
      documentId: "document-1",
      domRevision: 4,
      menuId: "151",
      menuName: "Primary",
      items: [
        {
          itemId: "101",
          parentItemId: null,
          depth: 0,
          position: 0,
          label: "Home",
          type: "custom",
          object: "custom",
          url: "https://example.test/",
          openInNewTab: false,
          childCount: 0,
        },
      ],
      itemCount: 1,
      truncated: false,
      dirty: false,
    });
    expect(
      GetWordPressMenuDataSchema.parse(
        createGetWordPressMenuResponse(getRequest, menuData).payload.data,
      ).items[0]?.label,
    ).toBe("Home");

    const authorization = {
      source: "explicit_user_instruction" as const,
      instructionId: "user-turn-wordpress-menu",
    };
    const editParameters = EditWordPressMenuParametersSchema.parse({
      tabId: 7,
      documentId: "document-1",
      domRevision: 4,
      operations: [
        { type: "update", itemId: "101", label: "Start" },
        {
          type: "add_custom",
          label: "Contact",
          url: "/contact/",
          destination: { placement: "after", targetItemId: "101" },
        },
        {
          type: "move",
          itemId: "103",
          destination: { placement: "inside_end", targetItemId: "101" },
        },
        { type: "remove", itemId: "104" },
      ],
      save: true,
      authorization,
    });
    expect(editParameters.operations[1]).toMatchObject({
      type: "add_custom",
      openInNewTab: false,
    });
    const editRequest = createEditWordPressMenuRequest("session", editParameters);
    expect(editRequest.payload.action).toBe(BROWSER_EDIT_WORDPRESS_MENU_ACTION);
    const editData = EditWordPressMenuDataSchema.parse({
      page: menuData.page,
      documentId: "document-1",
      domRevisionBefore: 4,
      domRevisionAfter: 5,
      menuId: "151",
      menuName: "Primary",
      operationTypes: ["update", "add_custom", "move", "remove"],
      affectedItemIds: ["101", "-1", "103", "104"],
      items: menuData.items,
      itemCount: 1,
      changed: true,
      submitted: true,
      verificationRequired: true,
      requiresNewSnapshot: true,
    });
    expect(
      EditWordPressMenuDataSchema.parse(
        createEditWordPressMenuResponse(editRequest, editData).payload.data,
      ),
    ).toMatchObject({ menuId: "151", submitted: true });
    expect(() =>
      EditWordPressMenuParametersSchema.parse({
        tabId: 7,
        documentId: "document-1",
        domRevision: 4,
        operations: [{ type: "update", itemId: "101" }],
        authorization,
      }),
    ).toThrow();
    expect(
      EditWordPressMenuParametersSchema.parse({
        tabId: 7,
        documentId: "document-1",
        domRevision: 5,
        operations: [],
        save: true,
        authorization,
      }),
    ).toMatchObject({ operations: [], save: true });
    expect(() =>
      EditWordPressMenuParametersSchema.parse({
        tabId: 7,
        documentId: "document-1",
        domRevision: 5,
        operations: [],
        authorization,
      }),
    ).toThrow();
  });

  it("validates WordPress admin, list-table, and authoritative editor parameters", () => {
    const authorization = {
      source: "explicit_user_instruction" as const,
      instructionId: "user-turn-wordpress-admin",
    };
    const admin = GetWordPressAdminParametersSchema.parse({ tabId: 7 });
    expect(createGetWordPressAdminRequest("session", admin).payload.action).toBe(
      BROWSER_GET_WORDPRESS_ADMIN_ACTION,
    );
    const listAction = WordPressListTableActionParametersSchema.parse({
      tabId: 7,
      documentId: "document-admin",
      domRevision: 4,
      operation: "apply_bulk",
      rowIds: ["post-201"],
      actionKey: "edit",
      authorization,
    });
    expect(createWordPressListTableActionRequest("session", listAction).payload.action).toBe(
      BROWSER_WORDPRESS_LIST_TABLE_ACTION,
    );
    const editor = GetWordPressEditorParametersSchema.parse({ tabId: 7 });
    expect(createGetWordPressEditorRequest("session", editor).payload.action).toBe(
      BROWSER_GET_WORDPRESS_EDITOR_ACTION,
    );
    const editorEdit = EditWordPressEditorParametersSchema.parse({
      tabId: 7,
      documentId: "document-editor",
      domRevision: 5,
      fields: { title: "Updated" },
      authorization,
    });
    expect(createEditWordPressEditorRequest("session", editorEdit).payload.action).toBe(
      BROWSER_EDIT_WORDPRESS_EDITOR_ACTION,
    );
    expect(() =>
      EditWordPressEditorParametersSchema.parse({
        tabId: 7,
        documentId: "document-editor",
        domRevision: 5,
        fields: { status: "publish" },
        save: false,
        authorization,
      }),
    ).toThrow();
    expect(
      EditWordPressEditorParametersSchema.parse({
        tabId: 7,
        documentId: "document-editor",
        domRevision: 5,
        fields: { status: "publish" },
        save: true,
        authorization,
      }),
    ).toMatchObject({ save: true, fields: { status: "publish" } });
  });

  it("validates advanced DOM, CSS, event, inspection, and raw-JavaScript commands", () => {
    const authorization = {
      source: "explicit_user_instruction" as const,
      instructionId: "user-turn-advanced-tools",
    };
    const revision = {
      tabId: 7,
      documentId: "document-1",
      domRevision: 4,
      elementId: "element-1",
    };
    const mutation = MutateDomParametersSchema.parse({
      ...revision,
      operations: [
        { type: "set_text", text: "Updated" },
        { type: "set_style", property: "outline", value: "2px solid red" },
      ],
      authorization,
    });
    expect(createMutateDomRequest("session", mutation).payload.action).toBe(
      BROWSER_MUTATE_DOM_ACTION,
    );

    const inspection = InspectElementParametersSchema.parse(revision);
    expect(inspection.includeEventListeners).toBe(true);
    expect(createInspectElementRequest("session", inspection).payload.action).toBe(
      BROWSER_INSPECT_ELEMENT_ACTION,
    );

    const css = ManageCssParametersSchema.parse({
      operation: "add",
      tabId: 7,
      css: "#panel { outline: 2px solid red; }",
      authorization,
    });
    expect(createManageCssRequest("session", css).payload.action).toBe(BROWSER_MANAGE_CSS_ACTION);

    const events = ObserveEventsParametersSchema.parse({ operation: "start", tabId: 7 });
    expect(events.eventTypes).toContain("click");
    expect(createObserveEventsRequest("session", events).payload.action).toBe(
      BROWSER_OBSERVE_EVENTS_ACTION,
    );

    const raw = ExecuteJavaScriptParametersSchema.parse({
      tabId: 7,
      source: "document.title",
      authorization,
    });
    expect(raw).toMatchObject({ sourceType: "expression", timeoutMs: 5_000 });
    expect(createExecuteJavaScriptRequest("session", raw).payload.action).toBe(
      BROWSER_EXECUTE_JAVASCRIPT_ACTION,
    );
  });

  it("rejects unsafe or ambiguous advanced command parameters", () => {
    const authorization = {
      source: "explicit_user_instruction" as const,
      instructionId: "user-turn-advanced-tools",
    };
    expect(() =>
      MutateDomParametersSchema.parse({
        tabId: 7,
        documentId: "document-1",
        domRevision: 4,
        elementId: "element-1",
        operations: [{ type: "set_style", property: "color", value: "red", extra: true }],
        authorization,
      }),
    ).toThrow();
    expect(() =>
      ExecuteJavaScriptParametersSchema.parse({ tabId: 7, source: "document.title" }),
    ).toThrow();
    expect(() =>
      ManageCssParametersSchema.parse({ operation: "remove", tabId: 7, authorization }),
    ).toThrow();
  });

  it("validates bounded screenshots and revision-bound coordinate clicks", () => {
    const screenshotParameters = CaptureScreenshotParametersSchema.parse({ tabId: 7 });
    expect(screenshotParameters).toMatchObject({
      quality: 70,
      maxWidth: 1_920,
      maxHeight: 1_080,
    });
    expect(createScreenshotRequest("session", screenshotParameters).payload.action).toBe(
      BROWSER_SCREENSHOT_ACTION,
    );
    expect(() =>
      CaptureScreenshotParametersSchema.parse({
        tabId: 7,
        mode: "element",
        elementId: "button-save",
      }),
    ).toThrow();
    expect(
      CaptureScreenshotParametersSchema.parse({
        tabId: 7,
        mode: "element",
        documentId: "document-1",
        domRevision: 2,
        elementId: "button-save",
        annotations: [
          {
            target: { type: "element", elementId: "button-save" },
            shape: "ellipse",
            label: { text: "Click here" },
          },
        ],
      }).annotations[0],
    ).toMatchObject({
      shape: "ellipse",
      stroke: "#ef4444",
      label: { text: "Click here", arrow: true },
    });
    expect(
      CaptureScreenshotDataSchema.parse({
        screenshotId: "112d1030-f123-4b81-bb20-416335c830fe",
        tabId: 7,
        documentId: "document-1",
        domRevision: 2,
        capturedAt: "2026-07-22T12:00:00.000Z",
        mediaType: "image/jpeg",
        width: 800,
        height: 600,
        viewport: { cssWidth: 1_600, cssHeight: 900, deviceScaleFactor: 1 },
        capture: {
          mode: "viewport",
          sourceCssRect: { x: 0, y: 0, width: 1_600, height: 900 },
          fullPage: false,
          annotationsApplied: 0,
        },
        byteLength: 12,
        dataUrl: "data:image/jpeg;base64,ZmFrZS1qcGVnLWJ5dGVz",
      }).byteLength,
    ).toBe(12);
    const clickAt = ClickAtParametersSchema.parse({
      tabId: 7,
      documentId: "document-1",
      domRevision: 2,
      x: 120.5,
      y: 240.5,
    });
    expect(createClickAtRequest("session", clickAt).payload.action).toBe(BROWSER_CLICK_AT_ACTION);
    expect(
      ClickAtDataSchema.parse({
        page: {
          urlBefore: "https://example.test/",
          urlAfter: "https://example.test/",
          origin: "https://example.test",
        },
        documentId: "document-1",
        domRevisionBefore: 2,
        domRevisionAfter: 3,
        coordinates: { x: 120.5, y: 240.5 },
        target: { role: "button", name: "Fallback", sensitive: false },
        clicked: true,
        domChanged: true,
        urlChanged: false,
        requiresNewSnapshot: true,
      }).clicked,
    ).toBe(true);
  });

  it("validates bounded console capture and reversible mobile emulation", () => {
    const consoleParameters = BrowserConsoleParametersSchema.parse({
      operation: "start",
      tabId: 8,
    });
    expect(consoleParameters.bufferSize).toBe(200);
    expect(createBrowserConsoleRequest("session", consoleParameters).payload.action).toBe(
      BROWSER_CONSOLE_ACTION,
    );
    expect(
      BrowserConsoleDataSchema.parse({
        tabId: 8,
        operation: "read",
        active: true,
        captureId: "34ee6f13-10ce-4bf2-9e8d-3e7f48972d07",
        startedAt: "2026-07-23T08:00:00.000Z",
        entries: [
          {
            sequence: 0,
            timestamp: "2026-07-23T08:00:01.000Z",
            source: "console",
            level: "error",
            text: "Request failed",
            url: "https://example.test/app",
            lineNumber: 4,
            columnNumber: 2,
          },
        ],
        entryCount: 1,
        droppedEntries: 0,
        cleared: false,
      }).entryCount,
    ).toBe(1);

    const mobile = DeviceEmulationParametersSchema.parse({
      operation: "set",
      tabId: 8,
      preset: "mobile_medium",
    });
    expect(createDeviceEmulationRequest("session", mobile).payload.action).toBe(
      BROWSER_EMULATE_DEVICE_ACTION,
    );
    expect(
      DeviceEmulationDataSchema.parse({
        tabId: 8,
        operation: "set",
        active: true,
        profile: {
          preset: "mobile_medium",
          orientation: "portrait",
          width: 390,
          height: 844,
          deviceScaleFactor: 3,
          mobile: true,
          touch: true,
        },
        debuggerAttached: true,
        requiresNewSnapshot: true,
      }).profile?.width,
    ).toBe(390);
    expect(() =>
      DeviceEmulationParametersSchema.parse({
        operation: "set",
        tabId: 8,
        preset: "custom",
        width: 360,
      }),
    ).toThrow();
  });

  it("validates metadata-only network capture, gestures, and PDF export", () => {
    const network = NetworkCaptureParametersSchema.parse({
      operation: "start",
      tabId: 8,
      bufferSize: 100,
    });
    expect(createNetworkCaptureRequest("session", network).payload.action).toBe(
      BROWSER_NETWORK_ACTION,
    );
    expect(
      NetworkCaptureDataSchema.parse({
        tabId: 8,
        operation: "read",
        active: true,
        captureId: "34ee6f13-10ce-4bf2-9e8d-3e7f48972d08",
        startedAt: "2026-07-23T08:00:00.000Z",
        entries: [
          {
            sequence: 0,
            timestamp: "2026-07-23T08:00:01.000Z",
            phase: "response",
            requestId: "request-1",
            url: "https://example.test/api/items",
            status: 200,
            mimeType: "application/json",
          },
        ],
        entryCount: 1,
        droppedEntries: 0,
        cleared: false,
        bodiesCaptured: false,
        headersCaptured: false,
        queryStringsRedacted: true,
      }).entries[0]?.url,
    ).toBe("https://example.test/api/items");

    const gesture = PerformGestureParametersSchema.parse({
      operation: "drag_and_drop",
      tabId: 8,
      documentId: "document-1",
      domRevision: 4,
      elementId: "source",
      targetElementId: "destination",
    });
    expect(createPerformGestureRequest("session", gesture).payload.action).toBe(
      BROWSER_PERFORM_GESTURE_ACTION,
    );
    expect(gesture.steps).toBe(10);
    expect(() =>
      PerformGestureParametersSchema.parse({
        operation: "scroll_by",
        tabId: 8,
        documentId: "document-1",
        domRevision: 4,
      }),
    ).toThrow();

    const pdf = PrintToPdfParametersSchema.parse({ tabId: 8 });
    expect(createPrintToPdfRequest("session", pdf).payload.action).toBe(
      BROWSER_PRINT_TO_PDF_ACTION,
    );
    expect(
      PrintToPdfDataSchema.parse({
        pdfId: "34ee6f13-10ce-4bf2-9e8d-3e7f48972d09",
        tabId: 8,
        capturedAt: "2026-07-23T08:00:00.000Z",
        mediaType: "application/pdf",
        byteLength: 12,
        dataUrl: "data:application/pdf;base64,JVBERi0xLjcK",
        landscape: false,
        printBackground: true,
        paperSize: "a4",
        pageRanges: "",
      }).paperSize,
    ).toBe("a4");
  });

  it("rejects non-JSON values at any payload depth", () => {
    const validRequest = createPingRequest("session-1");
    const request = {
      ...validRequest,
      payload: {
        ...validRequest.payload,
        parameters: {
          ...validRequest.payload.parameters,
          nested: { value: undefined },
        },
      },
    };

    expect(() => parseIbpEnvelope(request)).toThrow();
  });

  it("requires an error object when success is false", () => {
    expect(() => ProtocolResponseSchema.parse({ success: false })).toThrow();
  });

  it("rejects mismatched direction and message type", () => {
    const request = createPingRequest("session-1");

    expect(() => parseIbpEnvelope({ ...request, type: "ibp.event" })).toThrow();
  });

  it("validates a correlated browser.list_tabs request and response", () => {
    const request = createListTabsRequest("session-tabs", {
      messageId: "list-tabs-1",
      now: new Date("2026-07-22T12:00:00.000Z"),
    });

    expect(request.payload.action).toBe(BROWSER_LIST_TABS_ACTION);
    expect(ListTabsParametersSchema.parse(request.payload.parameters)).toEqual({});

    const response = createListTabsResponse(
      request,
      {
        tabs: [
          {
            tabId: 7,
            windowId: 1,
            index: 0,
            active: true,
            highlighted: true,
            pinned: false,
            incognito: false,
            audible: false,
            discarded: false,
            status: "complete",
            title: "Invictum",
            url: "https://example.test/admin",
            origin: "https://example.test",
            restricted: false,
          },
        ],
        count: 1,
        permission: "tabs",
      },
      {
        messageId: "list-tabs-response-1",
        startedAt: new Date("2026-07-22T12:00:00.010Z"),
        now: new Date("2026-07-22T12:00:00.020Z"),
      },
    );

    const parsed = parseIbpEnvelope(response);
    expect(parsed.correlationId).toBe(request.messageId);
    expect(ListTabsDataSchema.parse(parsed.payload.data)).toMatchObject({ count: 1 });
  });

  it("rejects list_tabs responses whose count does not match the tab array", () => {
    expect(() => ListTabsDataSchema.parse({ tabs: [], count: 1, permission: "tabs" })).toThrow();
  });

  it("validates an idempotent browser.unlock_tab request and response", () => {
    const parameters = UnlockTabParametersSchema.parse({ tabId: 7 });
    const request = createUnlockTabRequest("unlock-session", parameters, {
      messageId: "release-request-1",
    });
    expect(request.payload.action).toBe(BROWSER_UNLOCK_TAB_ACTION);

    const response = createUnlockTabResponse(request, { tabId: 7, unlocked: true });
    expect(UnlockTabDataSchema.parse(parseIbpEnvelope(response).payload.data)).toEqual({
      tabId: 7,
      unlocked: true,
    });
  });

  it("validates a safe per-tab agent identity and rejects markup", () => {
    const parameters = SetControlIdentityParametersSchema.parse({
      tabId: 7,
      agentName: "Codex",
    });
    const request = createSetControlIdentityRequest("identity-session", parameters, {
      messageId: "identity-request-1",
    });
    expect(request.payload.action).toBe(BROWSER_SET_CONTROL_IDENTITY_ACTION);

    const response = createSetControlIdentityResponse(request, {
      tabId: 7,
      agentName: "Codex",
      label: "Codex is using this tab",
      identified: true,
    });
    expect(SetControlIdentityDataSchema.parse(parseIbpEnvelope(response).payload.data)).toEqual({
      tabId: 7,
      agentName: "Codex",
      label: "Codex is using this tab",
      identified: true,
    });
    expect(() =>
      SetControlIdentityParametersSchema.parse({ tabId: 7, agentName: "<b>Codex</b>" }),
    ).toThrow();
  });

  it("applies safe snapshot defaults and validates a correlated response", () => {
    const parameters = GetPageSnapshotParametersSchema.parse({ tabId: 7 });
    expect(parameters).toMatchObject({
      detail: "interactive",
      includeHidden: false,
      maxElements: 1_000,
      maxDepth: 32,
      maxTextLength: 50_000,
    });
    const request = createPageSnapshotRequest("snapshot-session", parameters, {
      messageId: "snapshot-request-1",
      now: new Date("2026-07-22T12:00:00.000Z"),
    });
    const snapshot = PageSnapshotSchema.parse({
      page: {
        url: "https://example.test/form",
        title: "Form",
        origin: "https://example.test",
        viewport: { width: 1280, height: 720, deviceScaleFactor: 1 },
        scroll: { x: 0, y: 0, maxX: 0, maxY: 300 },
        loadingState: "complete",
      },
      frames: [
        {
          frameId: "top",
          parentFrameId: null,
          url: "https://example.test/form",
          title: "Form",
          name: "top",
          accessible: true,
        },
      ],
      elements: [],
      forms: [],
      dialogs: [],
      alerts: [],
      textBlocks: [],
      metadata: {
        generatedAt: "2026-07-22T12:00:00.010Z",
        documentId: "document-1",
        domRevision: 0,
        elementCount: 0,
        textLength: 0,
        truncated: false,
        detail: "interactive",
      },
    });
    const response = createPageSnapshotResponse(request, snapshot, {
      messageId: "snapshot-response-1",
      startedAt: new Date("2026-07-22T12:00:00.005Z"),
      now: new Date("2026-07-22T12:00:00.010Z"),
    });

    const parsed = parseIbpEnvelope(response);
    expect(parsed.correlationId).toBe(request.messageId);
    expect(PageSnapshotSchema.parse(parsed.payload.data).metadata.detail).toBe("interactive");
  });

  it("rejects snapshot metadata whose elementCount is inconsistent", () => {
    expect(() =>
      PageSnapshotSchema.parse({
        page: {
          url: "https://example.test/",
          title: "Example",
          origin: "https://example.test",
          viewport: { width: 1, height: 1, deviceScaleFactor: 1 },
          scroll: { x: 0, y: 0, maxX: 0, maxY: 0 },
          loadingState: "complete",
        },
        frames: [],
        elements: [],
        forms: [],
        dialogs: [],
        alerts: [],
        textBlocks: [],
        metadata: {
          generatedAt: "2026-07-22T12:00:00.000Z",
          documentId: "document-1",
          domRevision: 0,
          elementCount: 1,
          textLength: 0,
          truncated: false,
          detail: "interactive",
        },
      }),
    ).toThrow();
  });

  it("validates compact outline snapshots against their own element count", () => {
    const snapshot = PageSnapshotSchema.parse({
      page: {
        url: "https://example.test/",
        title: "Example",
        origin: "https://example.test",
        viewport: { width: 1280, height: 720, deviceScaleFactor: 1 },
        scroll: { x: 0, y: 0, maxX: 0, maxY: 0 },
        loadingState: "complete",
      },
      frames: [],
      elements: [],
      outline: [
        {
          elementId: "el_document_0_1",
          frameId: "top",
          tag: "button",
          role: "button",
          name: "Save",
          clickable: true,
          css: "#save",
        },
      ],
      forms: [],
      dialogs: [],
      alerts: [],
      textBlocks: [],
      metadata: {
        generatedAt: "2026-07-22T12:00:00.000Z",
        documentId: "document-1",
        domRevision: 0,
        elementCount: 1,
        textLength: 4,
        truncated: true,
        truncationReasons: ["field_text_limit"],
        detail: "outline",
      },
    });

    expect(snapshot).toMatchObject({
      elements: [],
      outline: [{ name: "Save", clickable: true }],
      metadata: { elementCount: 1, truncationReasons: ["field_text_limit"] },
    });
  });

  it("validates a revision-bound find-elements request and correlated result", () => {
    const parameters = FindElementsParametersSchema.parse({
      tabId: 7,
      documentId: "document-1",
      domRevision: 3,
      role: "button",
      name: "Save",
    });
    expect(parameters).toMatchObject({
      visible: true,
      matchMode: "contains",
      caseSensitive: false,
      maxResults: 50,
    });
    const request = createFindElementsRequest("find-session", parameters, {
      messageId: "find-request-1",
      now: new Date("2026-07-22T12:00:00.000Z"),
    });
    const data = FindElementsDataSchema.parse({
      page: { url: "https://example.test/form", origin: "https://example.test" },
      documentId: "document-1",
      domRevision: 3,
      matches: [],
      count: 0,
      truncated: false,
    });
    const response = createFindElementsResponse(request, data, {
      messageId: "find-response-1",
      now: new Date("2026-07-22T12:00:00.010Z"),
    });

    const parsed = parseIbpEnvelope(response);
    expect(parsed.correlationId).toBe(request.messageId);
    expect(FindElementsDataSchema.parse(parsed.payload.data)).toMatchObject({
      documentId: "document-1",
      domRevision: 3,
      count: 0,
      truncated: false,
      matchesTruncated: false,
      scanTruncated: false,
    });
  });

  it("separates truncated matches from an incomplete page scan", () => {
    const data = FindElementsDataSchema.parse({
      page: { url: "https://example.test/", origin: "https://example.test" },
      documentId: "document-1",
      domRevision: 3,
      matches: [],
      count: 0,
      truncated: false,
      matchesTruncated: false,
      scanTruncated: true,
      truncationReasons: ["max_elements"],
    });

    expect(data).toMatchObject({
      count: 0,
      truncated: false,
      matchesTruncated: false,
      scanTruncated: true,
      truncationReasons: ["max_elements"],
    });
  });

  it("rejects unsafe find-elements parameter shapes and inconsistent counts", () => {
    expect(() =>
      FindElementsParametersSchema.parse({
        tabId: 7,
        documentId: "document-1",
        domRevision: 0,
        regex: { pattern: "save", flags: "gg" },
      }),
    ).toThrow();
    expect(() =>
      FindElementsDataSchema.parse({
        page: { url: "https://example.test/", origin: "https://example.test" },
        documentId: "document-1",
        domRevision: 0,
        matches: [],
        count: 1,
        truncated: false,
      }),
    ).toThrow();
  });

  it("validates revision-bound click and type_text request/response pairs", () => {
    const clickParameters = ClickElementParametersSchema.parse({
      tabId: 7,
      documentId: "document-1",
      domRevision: 3,
      elementId: "el_document_3_1",
    });
    const clickRequest = createClickRequest("interaction-session", clickParameters, {
      messageId: "click-request-1",
    });
    const clickData = ClickElementDataSchema.parse({
      page: {
        urlBefore: "https://example.test/form",
        urlAfter: "https://example.test/form",
        origin: "https://example.test",
      },
      documentId: "document-1",
      domRevisionBefore: 3,
      domRevisionAfter: 4,
      elementId: "el_document_3_1",
      target: { role: "button", name: "Preview", sensitive: false },
      clicked: true,
      domChanged: true,
      urlChanged: false,
      requiresNewSnapshot: true,
    });
    expect(parseIbpEnvelope(createClickResponse(clickRequest, clickData)).correlationId).toBe(
      clickRequest.messageId,
    );

    const typeParameters = TypeTextParametersSchema.parse({
      tabId: 7,
      documentId: "document-1",
      domRevision: 4,
      elementId: "el_document_4_2",
      text: "safe fixture text",
    });
    const typeRequest = createTypeTextRequest("interaction-session", typeParameters, {
      messageId: "type-request-1",
    });
    const typeData = TypeTextDataSchema.parse({
      page: { url: "https://example.test/form", origin: "https://example.test" },
      documentId: "document-1",
      domRevisionBefore: 4,
      domRevisionAfter: 5,
      elementId: "el_document_4_2",
      target: { role: "textbox", name: "Email", sensitive: false },
      mode: "replace",
      characters: 17,
      changed: true,
      requiresNewSnapshot: true,
    });
    expect(
      TypeTextDataSchema.parse(
        parseIbpEnvelope(createTypeTextResponse(typeRequest, typeData)).payload.data,
      ),
    ).toMatchObject({ characters: 17, requiresNewSnapshot: true });
  });

  it("validates advanced navigation, clean text, natural find, gestures, and same-origin API inputs", () => {
    expect(HistoryNavigationParametersSchema.parse({ tabId: 7 }).waitUntil).toBe("complete");
    expect(ActivateTabParametersSchema.parse({ tabId: 7 })).toEqual({ tabId: 7 });
    expect(GetPageTextParametersSchema.parse({ tabId: 7 }).maxChars).toBe(50_000);
    expect(
      FindNaturalLanguageParametersSchema.parse({ tabId: 7, query: "Update button" }).maxResults,
    ).toBe(10);
    expect(
      PerformGestureParametersSchema.parse({
        operation: "press_key",
        tabId: 7,
        documentId: "doc",
        domRevision: 2,
        elementId: "editor",
        key: "s",
        ctrl: true,
      }),
    ).toMatchObject({ key: "s", ctrl: true, alt: false, meta: false, shift: false });
    expect(
      PerformGestureDataSchema.parse({
        page: { url: "https://example.test/", origin: "https://example.test" },
        documentId: "doc",
        domRevisionBefore: 2,
        domRevisionAfter: 2,
        operation: "scroll_to",
        scroll: { x: 0, y: 900 },
        performed: true,
        domChanged: false,
        requiresNewSnapshot: true,
      }).scroll,
    ).toEqual({ x: 0, y: 900 });
    expect(() =>
      PageApiRequestParametersSchema.parse({
        tabId: 7,
        url: "/api/read",
        method: "GET",
        body: { unsafe: true },
        authorization: {
          source: "explicit_user_instruction",
          instructionId: "user-api",
        },
      }),
    ).toThrow("GET page API requests cannot include a body");
    expect(
      PageApiRequestParametersSchema.parse({
        tabId: 7,
        url: "/api/write",
        method: "POST",
        body: { title: "Safe" },
        useWordPressNonce: true,
        authorization: {
          source: "explicit_user_instruction",
          instructionId: "user-api",
        },
      }),
    ).toMatchObject({ method: "POST", responseMode: "json", useWordPressNonce: true });
  });

  it("bounds type_text input and rejects unknown interaction parameters", () => {
    expect(() =>
      TypeTextParametersSchema.parse({
        tabId: 1,
        documentId: "document-1",
        domRevision: 0,
        elementId: "el-1",
        text: "x".repeat(10_001),
      }),
    ).toThrow();
    expect(() =>
      ClickElementParametersSchema.parse({
        tabId: 1,
        documentId: "document-1",
        domRevision: 0,
        elementId: "el-1",
        unsafe: true,
      }),
    ).toThrow();
  });

  it("returns concise structured errors for unknown action parameters", () => {
    expect(() =>
      parseActionParameters("browser.type_text", {
        tabId: 1,
        documentId: "document-1",
        domRevision: 0,
        elementId: "el-1",
        text: "hello",
        clear: true,
      }),
    ).toThrowError(
      expect.objectContaining({
        code: IBP_ERROR_CODES.INVALID_PARAMETERS,
        message: expect.stringContaining("unknown key 'clear'. Allowed keys:"),
        details: expect.objectContaining({
          stage: "parameters",
          action: "browser.type_text",
          allowedKeys: expect.arrayContaining(["text", "mode"]),
        }),
      }),
    );
  });
});

describe("PendingRequestRegistry", () => {
  it("resolves a correlated request and clears its timer", async () => {
    const registry = new PendingRequestRegistry<string>();
    const handle = registry.register("message-1", 1_000);

    expect(registry.resolve("message-1", "done")).toBe(true);
    await expect(handle.promise).resolves.toBe("done");
    expect(registry.size).toBe(0);
  });

  it("times out and removes stale requests", async () => {
    vi.useFakeTimers();
    const registry = new PendingRequestRegistry<string>();
    const handle = registry.register("message-2", 50);
    const assertion = expect(handle.promise).rejects.toMatchObject<IbpProtocolError>({
      code: "TIMEOUT",
      retryable: true,
    });

    await vi.advanceTimersByTimeAsync(50);
    await assertion;
    expect(registry.size).toBe(0);
    vi.useRealTimers();
  });

  it("supports explicit cancellation", async () => {
    const registry = new PendingRequestRegistry<string>();
    const handle = registry.register("message-3", 1_000);

    expect(handle.cancel()).toBe(true);
    await expect(handle.promise).rejects.toMatchObject({ code: "CANCELLED" });
  });
});
