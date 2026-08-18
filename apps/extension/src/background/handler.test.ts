import { describe, expect, it } from "vitest";

import {
  createListTabsRequest,
  createUnlockTabRequest,
  createSetControlIdentityRequest,
  createFindElementsRequest,
  createClickRequest,
  createPageSnapshotRequest,
  createPingRequest,
  createTypeTextRequest,
  createSetFileInputFilesRequest,
  IBP_ERROR_CODES,
  ListTabsDataSchema,
  UnlockTabDataSchema,
  SetControlIdentityDataSchema,
  GetPageSnapshotParametersSchema,
  FindElementsDataSchema,
  FindElementsParametersSchema,
  ClickElementDataSchema,
  ClickElementParametersSchema,
  PageSnapshotSchema,
  parseIbpEnvelope,
  SystemPongDataSchema,
  TypeTextDataSchema,
  TypeTextParametersSchema,
  SetFileInputFilesDataSchema,
  SetFileInputFilesParametersSchema,
  SelectOptionDataSchema,
  SelectOptionParametersSchema,
  SubmitFormDataSchema,
  SubmitFormParametersSchema,
  EvaluateJavaScriptDataSchema,
  EvaluateJavaScriptParametersSchema,
  createSelectOptionRequest,
  createSubmitFormRequest,
  createEvaluateJavaScriptRequest,
  CaptureScreenshotDataSchema,
  CaptureScreenshotParametersSchema,
  ClickAtDataSchema,
  ClickAtParametersSchema,
  createScreenshotRequest,
  createClickAtRequest,
  createCapabilitiesRequest,
  createOpenTabRequest,
  createNavigateRequest,
  createWaitForRequest,
  SystemCapabilitiesDataSchema,
  OpenTabDataSchema,
  OpenTabParametersSchema,
  NavigateDataSchema,
  NavigateParametersSchema,
  WaitForDataSchema,
  WaitForParametersSchema,
  HttpAuthStateDataSchema,
  HttpAuthStateParametersSchema,
  AuthenticateHttpDataSchema,
  AuthenticateHttpParametersSchema,
  HandleJavaScriptDialogDataSchema,
  HandleJavaScriptDialogParametersSchema,
  createHttpAuthStateRequest,
  createAuthenticateHttpRequest,
  createHandleJavaScriptDialogRequest,
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
  BrowserConsoleDataSchema,
  BrowserConsoleParametersSchema,
  DeviceEmulationDataSchema,
  DeviceEmulationParametersSchema,
  createBrowserConsoleRequest,
  createDeviceEmulationRequest,
  NetworkCaptureDataSchema,
  NetworkCaptureParametersSchema,
  PerformGestureDataSchema,
  PerformGestureParametersSchema,
  PrintToPdfDataSchema,
  PrintToPdfParametersSchema,
  createNetworkCaptureRequest,
  createPerformGestureRequest,
  createPrintToPdfRequest,
  GetWordPressMenuDataSchema,
  GetWordPressMenuParametersSchema,
  EditWordPressMenuDataSchema,
  EditWordPressMenuParametersSchema,
  createGetWordPressMenuRequest,
  createEditWordPressMenuRequest,
  GetWordPressAdminDataSchema,
  GetWordPressAdminParametersSchema,
  WordPressListTableActionDataSchema,
  WordPressListTableActionParametersSchema,
  GetWordPressEditorDataSchema,
  GetWordPressEditorParametersSchema,
  EditWordPressEditorDataSchema,
  EditWordPressEditorParametersSchema,
  createGetWordPressAdminRequest,
  createWordPressListTableActionRequest,
  createGetWordPressEditorRequest,
  createEditWordPressEditorRequest,
} from "@invictum/protocol";

import { ExtensionCommandError } from "./command-error.js";
import { handleProtocolMessage } from "./handler.js";

describe("extension protocol handler", () => {
  it("returns a correlated pong that echoes the nonce", async () => {
    const request = createPingRequest("extension-session", {
      messageId: "ping-1",
      nonce: "1234567890abcdef",
    });
    const rawResponse = await handleProtocolMessage(request);
    const response = parseIbpEnvelope(rawResponse);

    expect(response.direction).toBe("response");
    if (response.direction !== "response") {
      throw new Error("Expected a response envelope");
    }
    expect(response.correlationId).toBe("ping-1");
    expect(SystemPongDataSchema.parse(response.payload.data)).toMatchObject({
      reply: "pong",
      nonce: "1234567890abcdef",
      component: "extension",
    });
  });

  it("routes capabilities, open, navigation, and wait commands", async () => {
    const capabilityData = SystemCapabilitiesDataSchema.parse({
      protocol: "ibp",
      protocolVersion: "1.0",
      component: "extension",
      extensionVersion: "0.1.0",
      actions: [
        { action: "browser.open_tab", riskLevel: "R1", targeted: false, description: "Open tab" },
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
    const capabilities = parseIbpEnvelope(
      await handleProtocolMessage(createCapabilitiesRequest("session"), {
        getCapabilities: () => capabilityData,
      }),
    );
    if (capabilities.direction !== "response") throw new Error("Expected response envelope");
    expect(SystemCapabilitiesDataSchema.parse(capabilities.payload.data).extensionVersion).toBe(
      "0.1.0",
    );

    const tab = {
      tabId: 15,
      windowId: 1,
      index: 0,
      active: true,
      highlighted: true,
      pinned: false,
      incognito: false,
      audible: false,
      discarded: false,
      status: "complete" as const,
      title: "Example",
      url: "https://example.test/",
      origin: "https://example.test",
      restricted: false,
    };
    const openParameters = OpenTabParametersSchema.parse({ url: "https://example.test/" });
    const opened = parseIbpEnvelope(
      await handleProtocolMessage(createOpenTabRequest("session", openParameters), {
        openTab: async () => OpenTabDataSchema.parse({ tab, created: true }),
      }),
    );
    if (opened.direction !== "response") throw new Error("Expected response envelope");
    expect(OpenTabDataSchema.parse(opened.payload.data).tab.tabId).toBe(15);

    const navigateParameters = NavigateParametersSchema.parse({
      tabId: 15,
      url: "https://example.test/next",
    });
    const navigated = parseIbpEnvelope(
      await handleProtocolMessage(createNavigateRequest("session", navigateParameters), {
        navigate: async () =>
          NavigateDataSchema.parse({
            tab: { ...tab, url: "https://example.test/next" },
            navigated: true,
            previousOrigin: "https://example.test",
            originChanged: false,
          }),
      }),
    );
    if (navigated.direction !== "response") throw new Error("Expected response envelope");
    expect(NavigateDataSchema.parse(navigated.payload.data).navigated).toBe(true);

    const waitParameters = WaitForParametersSchema.parse({
      tabId: 15,
      condition: { type: "selector", value: "#ready" },
    });
    const waited = parseIbpEnvelope(
      await handleProtocolMessage(createWaitForRequest("session", waitParameters), {
        waitFor: async () =>
          WaitForDataSchema.parse({
            tabId: 15,
            matched: true,
            conditionType: "selector",
            elapsedMs: 10,
            tab,
            documentId: "document-1",
            domRevision: 1,
          }),
      }),
    );
    if (waited.direction !== "response") throw new Error("Expected response envelope");
    expect(WaitForDataSchema.parse(waited.payload.data).matched).toBe(true);
  });

  it("returns a structured error for unsupported actions", async () => {
    const request = createPingRequest("extension-session");
    request.payload.action = "browser.unknown";
    const response = parseIbpEnvelope(await handleProtocolMessage(request));

    expect(response.payload).toMatchObject({
      success: false,
      error: { code: "UNSUPPORTED_ACTION", retryable: false },
    });
  });

  it("lists validated Chrome tab metadata", async () => {
    const request = createListTabsRequest("extension-session", { messageId: "tabs-1" });
    const rawResponse = await handleProtocolMessage(request, {
      listTabs: async () => ({
        tabs: [
          {
            tabId: 3,
            windowId: 1,
            index: 0,
            active: true,
            highlighted: true,
            pinned: false,
            incognito: false,
            audible: false,
            discarded: false,
            status: "complete",
            title: "Dashboard",
            url: "https://example.test/dashboard",
            origin: "https://example.test",
            restricted: false,
          },
        ],
        count: 1,
        permission: "tabs",
      }),
    });
    const response = parseIbpEnvelope(rawResponse);

    expect(response.direction).toBe("response");
    if (response.direction !== "response") {
      throw new Error("Expected a response envelope");
    }
    expect(response.correlationId).toBe("tabs-1");
    expect(ListTabsDataSchema.parse(response.payload.data)).toMatchObject({ count: 1 });
  });

  it("releases an agent tab reservation", async () => {
    const request = createUnlockTabRequest(
      "extension-session",
      { tabId: 9 },
      {
        messageId: "release-1",
      },
    );
    const response = parseIbpEnvelope(
      await handleProtocolMessage(request, {
        unlockTab: async (parameters) => ({ tabId: parameters.tabId, unlocked: true }),
      }),
    );

    expect(response.direction).toBe("response");
    if (response.direction !== "response") {
      throw new Error("Expected a response envelope");
    }
    expect(response.correlationId).toBe("release-1");
    expect(UnlockTabDataSchema.parse(response.payload.data)).toEqual({
      tabId: 9,
      unlocked: true,
    });
  });

  it("routes a safe custom control identity", async () => {
    const request = createSetControlIdentityRequest(
      "extension-session",
      { tabId: 9, agentName: "Cursor" },
      { messageId: "identity-1" },
    );
    const response = parseIbpEnvelope(
      await handleProtocolMessage(request, {
        setControlIdentity: async (parameters) => ({
          ...parameters,
          label: `${parameters.agentName} is using this tab`,
          identified: true,
        }),
      }),
    );

    expect(response.direction).toBe("response");
    if (response.direction !== "response") throw new Error("Expected a response envelope");
    expect(response.correlationId).toBe("identity-1");
    expect(SetControlIdentityDataSchema.parse(response.payload.data)).toEqual({
      tabId: 9,
      agentName: "Cursor",
      label: "Cursor is using this tab",
      identified: true,
    });
  });

  it("maps missing tabs permission to a structured error", async () => {
    const request = createListTabsRequest("extension-session");
    const response = parseIbpEnvelope(
      await handleProtocolMessage(request, {
        listTabs: () =>
          Promise.reject(
            new ExtensionCommandError(
              IBP_ERROR_CODES.PERMISSION_DENIED,
              "Tab metadata permission is not granted",
            ),
          ),
      }),
    );

    expect(response.payload).toMatchObject({
      success: false,
      error: { code: IBP_ERROR_CODES.PERMISSION_DENIED, retryable: false },
    });
  });

  it("returns a validated semantic page snapshot", async () => {
    const parameters = GetPageSnapshotParametersSchema.parse({ tabId: 11 });
    const request = createPageSnapshotRequest("extension-session", parameters, {
      messageId: "snapshot-1",
    });
    const snapshot = PageSnapshotSchema.parse({
      page: {
        url: "https://example.test/form",
        title: "Form",
        origin: "https://example.test",
        viewport: { width: 1280, height: 720, deviceScaleFactor: 1 },
        scroll: { x: 0, y: 0, maxX: 0, maxY: 0 },
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
        generatedAt: new Date().toISOString(),
        documentId: "document-1",
        domRevision: 0,
        elementCount: 0,
        textLength: 0,
        truncated: false,
        detail: "interactive",
      },
    });
    const response = parseIbpEnvelope(
      await handleProtocolMessage(request, {
        getPageSnapshot: async () => snapshot,
      }),
    );

    expect(response.direction).toBe("response");
    if (response.direction !== "response") throw new Error("Expected response envelope");
    expect(response.correlationId).toBe("snapshot-1");
    expect(PageSnapshotSchema.parse(response.payload.data).page.title).toBe("Form");
  });

  it("maps an invalid snapshot result to INVALID_MESSAGE", async () => {
    const parameters = GetPageSnapshotParametersSchema.parse({ tabId: 11 });
    const request = createPageSnapshotRequest("extension-session", parameters);
    const response = parseIbpEnvelope(
      await handleProtocolMessage(request, {
        getPageSnapshot: async () => ({ page: { title: "incomplete" } }),
      }),
    );

    expect(response.payload).toMatchObject({
      success: false,
      error: { code: IBP_ERROR_CODES.INVALID_MESSAGE, retryable: false },
    });
  });

  it("rejects unknown action parameters before invoking browser dependencies", async () => {
    const request = createTypeTextRequest(
      "extension-session",
      TypeTextParametersSchema.parse({
        tabId: 11,
        documentId: "document-1",
        domRevision: 0,
        elementId: "el-1",
        text: "hello",
      }),
    );
    const malformed = structuredClone(request) as unknown as {
      payload: { parameters: Record<string, unknown> };
    };
    malformed.payload.parameters["clear"] = true;
    let invoked = false;
    const response = parseIbpEnvelope(
      await handleProtocolMessage(malformed, {
        typeText: async () => {
          invoked = true;
          return {};
        },
      }),
    );

    expect(invoked).toBe(false);
    expect(response.payload).toMatchObject({
      success: false,
      error: {
        code: IBP_ERROR_CODES.INVALID_PARAMETERS,
        message: expect.stringContaining("unknown key 'clear'. Allowed keys:"),
        details: {
          stage: "parameters",
          action: "browser.type_text",
          allowedKeys: expect.arrayContaining(["text", "mode"]),
          issues: expect.any(Array),
        },
      },
    });
  });

  it("returns validated semantic find-elements matches", async () => {
    const parameters = FindElementsParametersSchema.parse({
      tabId: 11,
      documentId: "document-1",
      domRevision: 0,
      role: "button",
      name: "Save",
    });
    const request = createFindElementsRequest("extension-session", parameters, {
      messageId: "find-1",
    });
    const result = FindElementsDataSchema.parse({
      page: { url: "https://example.test/form", origin: "https://example.test" },
      documentId: "document-1",
      domRevision: 0,
      matches: [],
      count: 0,
      truncated: false,
    });
    const response = parseIbpEnvelope(
      await handleProtocolMessage(request, { findElements: async () => result }),
    );

    expect(response.direction).toBe("response");
    if (response.direction !== "response") throw new Error("Expected response envelope");
    expect(response.correlationId).toBe("find-1");
    expect(FindElementsDataSchema.parse(response.payload.data)).toMatchObject({ count: 0 });
  });

  it("preserves a stale-element error from find_elements", async () => {
    const parameters = FindElementsParametersSchema.parse({
      tabId: 11,
      documentId: "old-document",
      domRevision: 0,
      role: "button",
    });
    const request = createFindElementsRequest("extension-session", parameters);
    const response = parseIbpEnvelope(
      await handleProtocolMessage(request, {
        findElements: () =>
          Promise.reject(
            new ExtensionCommandError(
              IBP_ERROR_CODES.STALE_ELEMENT_REFERENCE,
              "Snapshot is stale",
              true,
            ),
          ),
      }),
    );

    expect(response.payload).toMatchObject({
      success: false,
      error: { code: IBP_ERROR_CODES.STALE_ELEMENT_REFERENCE, retryable: true },
    });
  });

  it("returns validated click and type_text interaction results", async () => {
    const clickParameters = ClickElementParametersSchema.parse({
      tabId: 11,
      documentId: "document-1",
      domRevision: 0,
      elementId: "el-1",
    });
    const clickRequest = createClickRequest("extension-session", clickParameters, {
      messageId: "click-1",
    });
    const clickResult = ClickElementDataSchema.parse({
      page: {
        urlBefore: "https://example.test/form",
        urlAfter: "https://example.test/form",
        origin: "https://example.test",
      },
      documentId: "document-1",
      domRevisionBefore: 0,
      domRevisionAfter: 1,
      elementId: "el-1",
      target: { role: "button", name: "Preview", sensitive: false },
      clicked: true,
      domChanged: true,
      urlChanged: false,
      requiresNewSnapshot: true,
    });
    const clickResponse = parseIbpEnvelope(
      await handleProtocolMessage(clickRequest, { click: async () => clickResult }),
    );
    expect(clickResponse.correlationId).toBe("click-1");

    const typeParameters = TypeTextParametersSchema.parse({
      tabId: 11,
      documentId: "document-1",
      domRevision: 1,
      elementId: "el-2",
      text: "safe text",
    });
    const typeRequest = createTypeTextRequest("extension-session", typeParameters, {
      messageId: "type-1",
    });
    const typeResult = TypeTextDataSchema.parse({
      page: { url: "https://example.test/form", origin: "https://example.test" },
      documentId: "document-1",
      domRevisionBefore: 1,
      domRevisionAfter: 2,
      elementId: "el-2",
      target: { role: "textbox", name: "Email", sensitive: false },
      mode: "replace",
      characters: 9,
      changed: true,
      requiresNewSnapshot: true,
    });
    const typeResponse = parseIbpEnvelope(
      await handleProtocolMessage(typeRequest, { typeText: async () => typeResult }),
    );
    if (typeResponse.direction !== "response") throw new Error("Expected response envelope");
    expect(TypeTextDataSchema.parse(typeResponse.payload.data)).toMatchObject({ characters: 9 });
  });

  it("preserves interaction policy denial errors", async () => {
    const parameters = TypeTextParametersSchema.parse({
      tabId: 11,
      documentId: "document-1",
      domRevision: 0,
      elementId: "password",
      text: "not-logged",
    });
    const request = createTypeTextRequest("extension-session", parameters);
    const response = parseIbpEnvelope(
      await handleProtocolMessage(request, {
        typeText: () =>
          Promise.reject(
            new ExtensionCommandError(
              IBP_ERROR_CODES.POLICY_DENIED,
              "Sensitive field is blocked",
              false,
            ),
          ),
      }),
    );
    expect(response.payload).toMatchObject({
      success: false,
      error: { code: IBP_ERROR_CODES.POLICY_DENIED, retryable: false },
    });
  });

  it("routes explicitly authorized local file input changes", async () => {
    const parameters = SetFileInputFilesParametersSchema.parse({
      tabId: 11,
      documentId: "document-1",
      domRevision: 2,
      elementId: "file-input",
      filePaths: ["C:\\upload\\report.pdf"],
      authorization: {
        source: "explicit_user_instruction",
        instructionId: "user-upload-report",
      },
    });
    const result = SetFileInputFilesDataSchema.parse({
      page: { url: "https://example.test/upload", origin: "https://example.test" },
      documentId: "document-1",
      domRevisionBefore: 2,
      domRevisionAfter: 3,
      elementId: "file-input",
      fileCount: 1,
      countVerified: true,
      multiple: false,
      accept: ".pdf",
      changed: true,
      requiresNewSnapshot: true,
      verificationRequired: true,
    });
    const response = parseIbpEnvelope(
      await handleProtocolMessage(createSetFileInputFilesRequest("session", parameters), {
        setFileInputFiles: async () => result,
      }),
    );
    if (response.direction !== "response") throw new Error("Expected response envelope");
    expect(SetFileInputFilesDataSchema.parse(response.payload.data).fileCount).toBe(1);
  });

  it("routes typed WordPress menu inspection and editing", async () => {
    const page = {
      url: "https://example.test/wp-admin/nav-menus.php?menu=151",
      origin: "https://example.test",
    };
    const item = {
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
    };
    const getParameters = GetWordPressMenuParametersSchema.parse({ tabId: 11 });
    const getResult = GetWordPressMenuDataSchema.parse({
      page,
      documentId: "document-1",
      domRevision: 3,
      menuId: "151",
      menuName: "Primary",
      items: [item],
      itemCount: 1,
      truncated: false,
      dirty: false,
    });
    const inspected = parseIbpEnvelope(
      await handleProtocolMessage(createGetWordPressMenuRequest("session", getParameters), {
        getWordPressMenu: async () => getResult,
      }),
    );
    if (inspected.direction !== "response") throw new Error("Expected response envelope");
    expect(GetWordPressMenuDataSchema.parse(inspected.payload.data)).toMatchObject({
      menuId: "151",
      itemCount: 1,
    });

    const editParameters = EditWordPressMenuParametersSchema.parse({
      tabId: 11,
      documentId: "document-1",
      domRevision: 3,
      operations: [
        {
          type: "add_custom",
          label: "Contact",
          url: "/contact/",
          destination: { placement: "after", targetItemId: "101" },
        },
      ],
      save: false,
      authorization: {
        source: "explicit_user_instruction",
        instructionId: "user-wordpress-menu",
      },
    });
    const editResult = EditWordPressMenuDataSchema.parse({
      page,
      documentId: "document-1",
      domRevisionBefore: 3,
      domRevisionAfter: 4,
      menuId: "151",
      menuName: "Primary",
      operationTypes: ["add_custom"],
      affectedItemIds: ["-1"],
      items: [
        item,
        {
          ...item,
          itemId: "-1",
          position: 1,
          label: "Contact",
          url: "/contact/",
        },
      ],
      itemCount: 2,
      changed: true,
      submitted: false,
      verificationRequired: false,
      requiresNewSnapshot: true,
    });
    const edited = parseIbpEnvelope(
      await handleProtocolMessage(createEditWordPressMenuRequest("session", editParameters), {
        editWordPressMenu: async () => editResult,
      }),
    );
    if (edited.direction !== "response") throw new Error("Expected response envelope");
    expect(EditWordPressMenuDataSchema.parse(edited.payload.data)).toMatchObject({
      operationTypes: ["add_custom"],
      changed: true,
      submitted: false,
    });
  });

  it("routes typed WordPress admin and editor actions", async () => {
    const authorization = {
      source: "explicit_user_instruction" as const,
      instructionId: "user-wordpress-admin",
    };
    const adminParameters = GetWordPressAdminParametersSchema.parse({ tabId: 11 });
    const adminResult = GetWordPressAdminDataSchema.parse({
      page: { url: "https://example.test/wp-admin/edit.php", origin: "https://example.test" },
      documentId: "document-admin",
      domRevision: 5,
      screen: {
        pageTitle: "Posts",
        heading: "Posts",
        pageSlug: "",
        postType: "post",
        taxonomy: "",
        editorKind: "none",
      },
      adminBar: { present: true, siteName: "Example" },
      notices: [],
      listTable: {
        tableId: "posts-list",
        columns: [{ key: "title", label: "Title" }],
        rows: [
          {
            rowId: "post-201",
            primaryText: "Post",
            status: "Draft",
            selected: false,
            columns: [{ key: "title", text: "Post" }],
            actions: [{ key: "edit", label: "Edit", destructive: false }],
          },
        ],
        rowCount: 1,
        truncated: false,
        bulkActions: [{ key: "edit", label: "Edit", destructive: false }],
      },
    });
    const inspectedAdmin = parseIbpEnvelope(
      await handleProtocolMessage(createGetWordPressAdminRequest("session", adminParameters), {
        getWordPressAdmin: async () => adminResult,
      }),
    );
    if (inspectedAdmin.direction !== "response") throw new Error("Expected response envelope");
    expect(GetWordPressAdminDataSchema.parse(inspectedAdmin.payload.data)).toMatchObject({
      screen: { heading: "Posts" },
    });

    const listParameters = WordPressListTableActionParametersSchema.parse({
      tabId: 11,
      documentId: "document-admin",
      domRevision: 5,
      operation: "apply_bulk",
      rowIds: ["post-201"],
      actionKey: "edit",
      authorization,
    });
    const listResult = WordPressListTableActionDataSchema.parse({
      page: {
        urlBefore: "https://example.test/wp-admin/edit.php",
        urlAfter: "https://example.test/wp-admin/edit.php",
        origin: "https://example.test",
      },
      documentId: "document-admin",
      domRevisionBefore: 5,
      domRevisionAfter: 6,
      operation: "apply_bulk",
      rowIds: ["post-201"],
      actionKey: "edit",
      destructive: false,
      triggered: true,
      verificationRequired: true,
      requiresNewSnapshot: true,
    });
    const acted = parseIbpEnvelope(
      await handleProtocolMessage(
        createWordPressListTableActionRequest("session", listParameters),
        {
          wordpressListTableAction: async () => listResult,
        },
      ),
    );
    if (acted.direction !== "response") throw new Error("Expected response envelope");
    expect(WordPressListTableActionDataSchema.parse(acted.payload.data).triggered).toBe(true);

    const editorParameters = GetWordPressEditorParametersSchema.parse({ tabId: 11 });
    const editorResult = GetWordPressEditorDataSchema.parse({
      page: {
        url: "https://example.test/wp-admin/post.php?post=301&action=edit",
        origin: "https://example.test",
      },
      documentId: "document-editor",
      domRevision: 7,
      editorKind: "block",
      postId: "301",
      postType: "post",
      title: "Fixture",
      content: "Body",
      contentTruncated: false,
      excerpt: "",
      slug: "fixture",
      status: "draft",
      categoryIds: [],
      tagIds: [],
      featuredMediaId: null,
      authorId: 1,
      parentId: 0,
      menuOrder: 0,
      dirty: false,
      saving: false,
      lastSaveSucceeded: null,
    });
    const inspectedEditor = parseIbpEnvelope(
      await handleProtocolMessage(createGetWordPressEditorRequest("session", editorParameters), {
        getWordPressEditor: async () => editorResult,
      }),
    );
    if (inspectedEditor.direction !== "response") throw new Error("Expected response envelope");
    expect(GetWordPressEditorDataSchema.parse(inspectedEditor.payload.data).postId).toBe("301");

    const editParameters = EditWordPressEditorParametersSchema.parse({
      tabId: 11,
      documentId: "document-editor",
      domRevision: 7,
      fields: { title: "Updated" },
      save: false,
      authorization,
    });
    const editResult = EditWordPressEditorDataSchema.parse({
      page: {
        urlBefore: editorResult.page.url,
        urlAfter: editorResult.page.url,
        origin: editorResult.page.origin,
      },
      documentId: "document-editor",
      domRevisionBefore: 7,
      domRevisionAfter: 8,
      editorKind: "block",
      postId: "301",
      postType: "post",
      fieldNames: ["title"],
      status: "draft",
      changed: true,
      saved: false,
      publishRequested: false,
      verificationRequired: false,
      requiresNewSnapshot: true,
    });
    const edited = parseIbpEnvelope(
      await handleProtocolMessage(createEditWordPressEditorRequest("session", editParameters), {
        editWordPressEditor: async () => editResult,
      }),
    );
    if (edited.direction !== "response") throw new Error("Expected response envelope");
    expect(EditWordPressEditorDataSchema.parse(edited.payload.data)).toMatchObject({
      fieldNames: ["title"],
      changed: true,
    });
  });

  it("routes select, explicitly authorized submit, and constrained JavaScript", async () => {
    const selectParameters = SelectOptionParametersSchema.parse({
      tabId: 11,
      documentId: "document-1",
      domRevision: 2,
      elementId: "country",
      selection: { values: ["hr"] },
    });
    const selectResult = SelectOptionDataSchema.parse({
      page: { url: "https://example.test/form", origin: "https://example.test" },
      documentId: "document-1",
      domRevisionBefore: 2,
      domRevisionAfter: 3,
      elementId: "country",
      selectedCount: 1,
      selectedIndices: [1],
      changed: true,
      requiresNewSnapshot: true,
    });
    const selected = parseIbpEnvelope(
      await handleProtocolMessage(createSelectOptionRequest("session", selectParameters), {
        selectOption: async () => selectResult,
      }),
    );
    if (selected.direction !== "response") throw new Error("Expected response envelope");
    expect(SelectOptionDataSchema.parse(selected.payload.data).selectedIndices).toEqual([1]);

    const authorization = {
      source: "explicit_user_instruction" as const,
      instructionId: "user-turn-submit",
    };
    const submitParameters = SubmitFormParametersSchema.parse({
      tabId: 11,
      documentId: "document-1",
      domRevision: 3,
      elementId: "form-1",
      authorization,
    });
    const submitResult = SubmitFormDataSchema.parse({
      page: { urlBefore: "https://example.test/form", origin: "https://example.test" },
      documentId: "document-1",
      domRevisionBefore: 3,
      elementId: "form-1",
      submitted: true,
      verificationRequired: true,
    });
    const submitted = parseIbpEnvelope(
      await handleProtocolMessage(createSubmitFormRequest("session", submitParameters), {
        submitForm: async () => submitResult,
      }),
    );
    if (submitted.direction !== "response") throw new Error("Expected response envelope");
    expect(SubmitFormDataSchema.parse(submitted.payload.data).submitted).toBe(true);

    const evaluateParameters = EvaluateJavaScriptParametersSchema.parse({
      tabId: 11,
      expression: "document.title",
      authorization,
    });
    const evaluateResult = EvaluateJavaScriptDataSchema.parse({
      tabId: 11,
      mode: "read_only",
      world: "ISOLATED",
      value: "Form",
      valueType: "string",
      truncated: false,
    });
    const evaluated = parseIbpEnvelope(
      await handleProtocolMessage(createEvaluateJavaScriptRequest("session", evaluateParameters), {
        evaluateJavaScript: async () => evaluateResult,
      }),
    );
    if (evaluated.direction !== "response") throw new Error("Expected response envelope");
    expect(EvaluateJavaScriptDataSchema.parse(evaluated.payload.data).value).toBe("Form");
  });

  it("routes all advanced browser commands through strict parameter validation", async () => {
    const calls: string[] = [];
    const fail = (name: string) => async (): Promise<never> => {
      calls.push(name);
      throw new ExtensionCommandError(IBP_ERROR_CODES.BROWSER_API_ERROR, `${name} routed`, false);
    };
    const authorization = {
      source: "explicit_user_instruction" as const,
      instructionId: "user-advanced-handler",
    };
    const revision = {
      tabId: 11,
      documentId: "document-1",
      domRevision: 4,
      elementId: "element-1",
    };
    const requests = [
      [
        createMutateDomRequest(
          "session",
          MutateDomParametersSchema.parse({
            ...revision,
            operations: [{ type: "set_text", text: "updated" }],
            authorization,
          }),
        ),
        { mutateDom: fail("mutate") },
      ],
      [
        createInspectElementRequest(
          "session",
          InspectElementParametersSchema.parse({
            ...revision,
            includeEventListeners: false,
          }),
        ),
        { inspectElement: fail("inspect") },
      ],
      [
        createManageCssRequest(
          "session",
          ManageCssParametersSchema.parse({
            operation: "add",
            tabId: 11,
            css: "#fixture { outline: 2px solid red; }",
            authorization,
          }),
        ),
        { manageCss: fail("css") },
      ],
      [
        createObserveEventsRequest(
          "session",
          ObserveEventsParametersSchema.parse({ operation: "start", tabId: 11 }),
        ),
        { observeEvents: fail("events") },
      ],
      [
        createExecuteJavaScriptRequest(
          "session",
          ExecuteJavaScriptParametersSchema.parse({
            tabId: 11,
            source: "document.title",
            authorization,
          }),
        ),
        { executeJavaScript: fail("javascript") },
      ],
    ] as const;

    for (const [request, dependencies] of requests) {
      const response = parseIbpEnvelope(await handleProtocolMessage(request, dependencies));
      expect(response.payload).toMatchObject({
        success: false,
        error: { code: IBP_ERROR_CODES.BROWSER_API_ERROR },
      });
    }
    expect(calls).toEqual(["mutate", "inspect", "css", "events", "javascript"]);
  });

  it("routes bounded screenshots and revision-bound coordinate clicks", async () => {
    const screenshotParameters = CaptureScreenshotParametersSchema.parse({ tabId: 11 });
    const screenshotResult = CaptureScreenshotDataSchema.parse({
      screenshotId: "112d1030-f123-4b81-bb20-416335c830fe",
      tabId: 11,
      documentId: "document-1",
      domRevision: 4,
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
    });
    const screenshot = parseIbpEnvelope(
      await handleProtocolMessage(createScreenshotRequest("session", screenshotParameters), {
        captureScreenshot: async () => screenshotResult,
      }),
    );
    if (screenshot.direction !== "response") throw new Error("Expected response envelope");
    expect(CaptureScreenshotDataSchema.parse(screenshot.payload.data).width).toBe(800);

    const clickParameters = ClickAtParametersSchema.parse({
      tabId: 11,
      documentId: "document-1",
      domRevision: 4,
      x: 400,
      y: 300,
    });
    const clickResult = ClickAtDataSchema.parse({
      page: {
        urlBefore: "https://example.test/form",
        urlAfter: "https://example.test/form",
        origin: "https://example.test",
      },
      documentId: "document-1",
      domRevisionBefore: 4,
      domRevisionAfter: 5,
      coordinates: { x: 400, y: 300 },
      target: { role: "button", name: "Fallback", sensitive: false },
      clicked: true,
      domChanged: true,
      urlChanged: false,
      requiresNewSnapshot: true,
    });
    const clicked = parseIbpEnvelope(
      await handleProtocolMessage(createClickAtRequest("session", clickParameters), {
        clickAt: async () => clickResult,
      }),
    );
    if (clicked.direction !== "response") throw new Error("Expected response envelope");
    expect(ClickAtDataSchema.parse(clicked.payload.data).coordinates).toEqual({ x: 400, y: 300 });
  });

  it("routes browser console and mobile emulation commands", async () => {
    const consoleParameters = BrowserConsoleParametersSchema.parse({
      operation: "start",
      tabId: 15,
    });
    const consoleResponse = await handleProtocolMessage(
      createBrowserConsoleRequest("session", consoleParameters),
      {
        manageBrowserConsole: async () => ({
          tabId: 15,
          operation: "start",
          active: true,
          captureId: "87adb39e-52b0-4415-a36d-6a5f39a71ace",
          startedAt: "2026-07-23T08:00:00.000Z",
          entries: [],
          entryCount: 0,
          droppedEntries: 0,
          cleared: false,
        }),
      },
    );
    expect(
      BrowserConsoleDataSchema.parse(
        consoleResponse?.direction === "response" ? consoleResponse.payload.data : undefined,
      ),
    ).toMatchObject({ tabId: 15, active: true });

    const mobileParameters = DeviceEmulationParametersSchema.parse({
      operation: "set",
      tabId: 15,
      preset: "mobile_small",
    });
    const mobileResponse = await handleProtocolMessage(
      createDeviceEmulationRequest("session", mobileParameters),
      {
        manageDeviceEmulation: async () => ({
          tabId: 15,
          operation: "set",
          active: true,
          profile: {
            preset: "mobile_small",
            orientation: "portrait",
            width: 320,
            height: 568,
            deviceScaleFactor: 2,
            mobile: true,
            touch: true,
          },
          debuggerAttached: true,
          requiresNewSnapshot: true,
        }),
      },
    );
    expect(
      DeviceEmulationDataSchema.parse(
        mobileResponse?.direction === "response" ? mobileResponse.payload.data : undefined,
      ).profile,
    ).toMatchObject({ width: 320, height: 568 });
  });

  it("routes metadata-only network capture, gestures, and PDF export", async () => {
    const networkParameters = NetworkCaptureParametersSchema.parse({
      operation: "start",
      tabId: 15,
    });
    const networkResponse = await handleProtocolMessage(
      createNetworkCaptureRequest("session", networkParameters),
      {
        manageNetworkCapture: async () => ({
          tabId: 15,
          operation: "start",
          active: true,
          captureId: "87adb39e-52b0-4415-a36d-6a5f39a71acf",
          startedAt: "2026-07-23T08:00:00.000Z",
          entries: [],
          entryCount: 0,
          droppedEntries: 0,
          cleared: false,
          bodiesCaptured: false,
          headersCaptured: false,
          queryStringsRedacted: true,
        }),
      },
    );
    expect(
      NetworkCaptureDataSchema.parse(
        networkResponse?.direction === "response" ? networkResponse.payload.data : undefined,
      ),
    ).toMatchObject({ active: true, headersCaptured: false });

    const gestureParameters = PerformGestureParametersSchema.parse({
      operation: "hover",
      tabId: 15,
      documentId: "document-1",
      domRevision: 4,
      elementId: "element-1",
    });
    const gestureResponse = await handleProtocolMessage(
      createPerformGestureRequest("session", gestureParameters),
      {
        performGesture: async () => ({
          page: { url: "https://example.test/", origin: "https://example.test" },
          documentId: "document-1",
          domRevisionBefore: 4,
          domRevisionAfter: 5,
          operation: "hover",
          elementId: "element-1",
          resolvedElementId: "element-2",
          performed: true,
          domChanged: false,
          requiresNewSnapshot: true,
        }),
      },
    );
    expect(
      PerformGestureDataSchema.parse(
        gestureResponse?.direction === "response" ? gestureResponse.payload.data : undefined,
      ).resolvedElementId,
    ).toBe("element-2");

    const pdfParameters = PrintToPdfParametersSchema.parse({ tabId: 15 });
    const pdfResponse = await handleProtocolMessage(
      createPrintToPdfRequest("session", pdfParameters),
      {
        printToPdf: async () => ({
          pdfId: "87adb39e-52b0-4415-a36d-6a5f39a71ad0",
          tabId: 15,
          capturedAt: "2026-07-23T08:00:00.000Z",
          mediaType: "application/pdf",
          byteLength: 12,
          dataUrl: "data:application/pdf;base64,JVBERi0xLjcK",
          landscape: false,
          printBackground: true,
          paperSize: "a4",
          pageRanges: "",
        }),
      },
    );
    expect(
      PrintToPdfDataSchema.parse(
        pdfResponse?.direction === "response" ? pdfResponse.payload.data : undefined,
      ).mediaType,
    ).toBe("application/pdf");
  });

  it("routes HTTP auth detection/authentication and native JavaScript dialogs", async () => {
    const authorization = {
      source: "explicit_user_instruction" as const,
      instructionId: "user-auth-dialog",
    };
    const stateParameters = HttpAuthStateParametersSchema.parse({ tabId: 11 });
    const stateResult = HttpAuthStateDataSchema.parse({
      tabId: 11,
      challengeDetected: true,
      origin: "https://protected.test",
      scheme: "basic",
      realm: "robots",
      isProxy: false,
      detectedAt: "2026-07-22T12:00:00.000Z",
    });
    const state = parseIbpEnvelope(
      await handleProtocolMessage(createHttpAuthStateRequest("session", stateParameters), {
        getHttpAuthState: async () => stateResult,
      }),
    );
    if (state.direction !== "response") throw new Error("Expected response envelope");
    expect(HttpAuthStateDataSchema.parse(state.payload.data).challengeDetected).toBe(true);

    const authParameters = AuthenticateHttpParametersSchema.parse({
      tabId: 11,
      username: "fixture-user",
      password: "fixture-password",
      authorization,
    });
    const authResult = AuthenticateHttpDataSchema.parse({
      tabId: 11,
      origin: "https://protected.test",
      authenticated: true,
      challengeHandled: true,
      scheme: "basic",
      credentialsRetained: false,
      verificationRequired: true,
    });
    const authenticated = parseIbpEnvelope(
      await handleProtocolMessage(createAuthenticateHttpRequest("session", authParameters), {
        authenticateHttp: async () => authResult,
      }),
    );
    if (authenticated.direction !== "response") throw new Error("Expected response envelope");
    expect(AuthenticateHttpDataSchema.parse(authenticated.payload.data).credentialsRetained).toBe(
      false,
    );

    const dialogParameters = HandleJavaScriptDialogParametersSchema.parse({
      tabId: 11,
      accept: false,
      authorization,
    });
    const dialogResult = HandleJavaScriptDialogDataSchema.parse({
      tabId: 11,
      detected: true,
      handled: true,
      accepted: false,
      type: "confirm",
      message: "Continue?",
      origin: "https://protected.test",
      triggerType: "none",
      promptTextSupplied: false,
      requiresNewSnapshot: true,
    });
    const handled = parseIbpEnvelope(
      await handleProtocolMessage(
        createHandleJavaScriptDialogRequest("session", dialogParameters),
        { handleJavaScriptDialog: async () => dialogResult },
      ),
    );
    if (handled.direction !== "response") throw new Error("Expected response envelope");
    expect(HandleJavaScriptDialogDataSchema.parse(handled.payload.data)).toMatchObject({
      handled: true,
      accepted: false,
    });
  });

  it("ignores valid events rather than responding to them", async () => {
    const request = createPingRequest("extension-session");
    const event = {
      ...request,
      direction: "event",
      type: "ibp.event",
      payload: { event: "system.heartbeat", data: { status: "alive" } },
    };

    await expect(handleProtocolMessage(event)).resolves.toBeUndefined();
  });
});
