import {
  BROWSER_LIST_TABS_ACTION,
  BROWSER_OPEN_TAB_ACTION,
  BROWSER_CLOSE_TAB_ACTION,
  BROWSER_NAVIGATE_ACTION,
  BROWSER_GO_BACK_ACTION,
  BROWSER_GO_FORWARD_ACTION,
  BROWSER_ACTIVATE_TAB_ACTION,
  BROWSER_WAIT_FOR_ACTION,
  BROWSER_SET_CONTROL_IDENTITY_ACTION,
  BROWSER_UNLOCK_TAB_ACTION,
  BROWSER_GET_PAGE_SNAPSHOT_ACTION,
  BROWSER_GET_PAGE_TEXT_ACTION,
  BROWSER_FIND_ELEMENTS_ACTION,
  BROWSER_FIND_NATURAL_LANGUAGE_ACTION,
  BROWSER_CLICK_ACTION,
  BROWSER_TYPE_TEXT_ACTION,
  BROWSER_SET_FILE_INPUT_FILES_ACTION,
  BROWSER_SELECT_OPTION_ACTION,
  BROWSER_CHECK_ACTION,
  BROWSER_UNCHECK_ACTION,
  BROWSER_SUBMIT_FORM_ACTION,
  BROWSER_GET_WORDPRESS_MENU_ACTION,
  BROWSER_EDIT_WORDPRESS_MENU_ACTION,
  BROWSER_GET_WORDPRESS_ADMIN_ACTION,
  BROWSER_WORDPRESS_LIST_TABLE_ACTION,
  BROWSER_GET_WORDPRESS_EDITOR_ACTION,
  BROWSER_EDIT_WORDPRESS_EDITOR_ACTION,
  BROWSER_EVALUATE_ACTION,
  BROWSER_MUTATE_DOM_ACTION,
  BROWSER_INSPECT_ELEMENT_ACTION,
  BROWSER_MANAGE_CSS_ACTION,
  BROWSER_OBSERVE_EVENTS_ACTION,
  BROWSER_EXECUTE_JAVASCRIPT_ACTION,
  BROWSER_SCREENSHOT_ACTION,
  BROWSER_CLICK_AT_ACTION,
  BROWSER_GET_HTTP_AUTH_STATE_ACTION,
  BROWSER_AUTHENTICATE_HTTP_ACTION,
  BROWSER_HANDLE_JAVASCRIPT_DIALOG_ACTION,
  BROWSER_CONSOLE_ACTION,
  BROWSER_NETWORK_ACTION,
  BROWSER_EMULATE_DEVICE_ACTION,
  BROWSER_PERFORM_GESTURE_ACTION,
  BROWSER_PRINT_TO_PDF_ACTION,
  BROWSER_PAGE_API_REQUEST_ACTION,
  ClickElementDataSchema,
  ClickElementParametersSchema,
  createClickResponse,
  createErrorResponse,
  createFindElementsResponse,
  createFindNaturalLanguageResponse,
  createListTabsResponse,
  createCloseTabResponse,
  createUnlockTabResponse,
  createPageSnapshotResponse,
  createPageTextResponse,
  createTypeTextResponse,
  createSetFileInputFilesResponse,
  createSelectOptionResponse,
  createSetCheckedResponse,
  createSubmitFormResponse,
  createGetWordPressMenuResponse,
  createEditWordPressMenuResponse,
  createGetWordPressAdminResponse,
  createWordPressListTableActionResponse,
  createGetWordPressEditorResponse,
  createEditWordPressEditorResponse,
  createEvaluateJavaScriptResponse,
  createMutateDomResponse,
  createInspectElementResponse,
  createManageCssResponse,
  createObserveEventsResponse,
  createExecuteJavaScriptResponse,
  createScreenshotResponse,
  createClickAtResponse,
  createHttpAuthStateResponse,
  createAuthenticateHttpResponse,
  createHandleJavaScriptDialogResponse,
  createBrowserConsoleResponse,
  createNetworkCaptureResponse,
  createDeviceEmulationResponse,
  createPerformGestureResponse,
  createPrintToPdfResponse,
  createPageApiResponse,
  createPongResponse,
  createCapabilitiesResponse,
  createOpenTabResponse,
  createNavigateResponse,
  createHistoryNavigationResponse,
  createActivateTabResponse,
  createWaitForResponse,
  createSetControlIdentityResponse,
  createUnsupportedActionResponse,
  IBP_ERROR_CODES,
  IbpProtocolError,
  isZodError,
  ListTabsDataSchema,
  ListTabsParametersSchema,
  UnlockTabDataSchema,
  UnlockTabParametersSchema,
  GetPageSnapshotParametersSchema,
  FindElementsDataSchema,
  FindElementsParametersSchema,
  FindNaturalLanguageDataSchema,
  FindNaturalLanguageParametersSchema,
  PageSnapshotSchema,
  GetPageTextDataSchema,
  GetPageTextParametersSchema,
  TypeTextDataSchema,
  TypeTextParametersSchema,
  SetFileInputFilesDataSchema,
  SetFileInputFilesParametersSchema,
  SelectOptionDataSchema,
  SelectOptionParametersSchema,
  SetCheckedDataSchema,
  SetCheckedParametersSchema,
  SubmitFormDataSchema,
  SubmitFormParametersSchema,
  GetWordPressMenuDataSchema,
  GetWordPressMenuParametersSchema,
  EditWordPressMenuDataSchema,
  EditWordPressMenuParametersSchema,
  GetWordPressAdminDataSchema,
  GetWordPressAdminParametersSchema,
  WordPressListTableActionDataSchema,
  WordPressListTableActionParametersSchema,
  GetWordPressEditorDataSchema,
  GetWordPressEditorParametersSchema,
  EditWordPressEditorDataSchema,
  EditWordPressEditorParametersSchema,
  EvaluateJavaScriptDataSchema,
  EvaluateJavaScriptParametersSchema,
  MutateDomDataSchema,
  MutateDomParametersSchema,
  InspectElementDataSchema,
  InspectElementParametersSchema,
  ManageCssDataSchema,
  ManageCssParametersSchema,
  ObserveEventsDataSchema,
  ObserveEventsParametersSchema,
  ExecuteJavaScriptDataSchema,
  ExecuteJavaScriptParametersSchema,
  CaptureScreenshotDataSchema,
  CaptureScreenshotParametersSchema,
  ClickAtDataSchema,
  ClickAtParametersSchema,
  HttpAuthStateDataSchema,
  HttpAuthStateParametersSchema,
  AuthenticateHttpDataSchema,
  AuthenticateHttpParametersSchema,
  HandleJavaScriptDialogDataSchema,
  HandleJavaScriptDialogParametersSchema,
  BrowserConsoleDataSchema,
  BrowserConsoleParametersSchema,
  NetworkCaptureDataSchema,
  NetworkCaptureParametersSchema,
  DeviceEmulationDataSchema,
  DeviceEmulationParametersSchema,
  PerformGestureDataSchema,
  PerformGestureParametersSchema,
  PrintToPdfDataSchema,
  PrintToPdfParametersSchema,
  PageApiRequestDataSchema,
  PageApiRequestParametersSchema,
  parseActionParameters,
  parseIbpEnvelope,
  resultValidationError,
  SYSTEM_PING_ACTION,
  SYSTEM_CAPABILITIES_ACTION,
  SystemPingParametersSchema,
  SystemCapabilitiesDataSchema,
  SystemCapabilitiesParametersSchema,
  OpenTabDataSchema,
  OpenTabParametersSchema,
  CloseTabDataSchema,
  CloseTabParametersSchema,
  NavigateDataSchema,
  NavigateParametersSchema,
  HistoryNavigationDataSchema,
  HistoryNavigationParametersSchema,
  ActivateTabDataSchema,
  ActivateTabParametersSchema,
  WaitForDataSchema,
  WaitForParametersSchema,
  SetControlIdentityDataSchema,
  SetControlIdentityParametersSchema,
  type ProtocolRequestEnvelope,
  type ProtocolResponseEnvelope,
  type GetPageSnapshotParameters,
  type UnlockTabParameters,
  type FindElementsParameters,
  type ClickElementParameters,
  type TypeTextParameters,
  type SetFileInputFilesParameters,
  type SelectOptionParameters,
  type SetCheckedParameters,
  type SubmitFormParameters,
  type GetWordPressMenuParameters,
  type EditWordPressMenuParameters,
  type GetWordPressAdminParameters,
  type WordPressListTableActionParameters,
  type GetWordPressEditorParameters,
  type EditWordPressEditorParameters,
  type EvaluateJavaScriptParameters,
  type MutateDomParameters,
  type InspectElementParameters,
  type ManageCssParameters,
  type ObserveEventsParameters,
  type ExecuteJavaScriptParameters,
  type CaptureScreenshotParameters,
  type ClickAtParameters,
  type OpenTabParameters,
  type CloseTabParameters,
  type NavigateParameters,
  type HistoryNavigationParameters,
  type ActivateTabParameters,
  type GetPageTextParameters,
  type FindNaturalLanguageParameters,
  type WaitForParameters,
  type SetControlIdentityParameters,
  type HttpAuthStateParameters,
  type AuthenticateHttpParameters,
  type HandleJavaScriptDialogParameters,
  type BrowserConsoleParameters,
  type NetworkCaptureParameters,
  type DeviceEmulationParameters,
  type PerformGestureParameters,
  type PrintToPdfParameters,
  type PageApiRequestParameters,
} from "@invictum/protocol";

import { ExtensionCommandError } from "./command-error.js";

export interface ExtensionCommandDependencies {
  getCapabilities: () => Promise<unknown> | unknown;
  listTabs: () => Promise<unknown>;
  openTab: (parameters: OpenTabParameters) => Promise<unknown>;
  closeTab: (parameters: CloseTabParameters) => Promise<unknown>;
  navigate: (parameters: NavigateParameters) => Promise<unknown>;
  navigateHistory: (
    direction: "back" | "forward",
    parameters: HistoryNavigationParameters,
  ) => Promise<unknown>;
  activateTab: (parameters: ActivateTabParameters) => Promise<unknown>;
  waitFor: (parameters: WaitForParameters) => Promise<unknown>;
  setControlIdentity: (parameters: SetControlIdentityParameters) => Promise<unknown>;
  unlockTab: (parameters: UnlockTabParameters) => Promise<unknown>;
  getPageSnapshot: (parameters: GetPageSnapshotParameters) => Promise<unknown>;
  getPageText: (parameters: GetPageTextParameters) => Promise<unknown>;
  findElements: (parameters: FindElementsParameters) => Promise<unknown>;
  findNaturalLanguage: (parameters: FindNaturalLanguageParameters) => Promise<unknown>;
  click: (parameters: ClickElementParameters) => Promise<unknown>;
  typeText: (parameters: TypeTextParameters) => Promise<unknown>;
  setFileInputFiles: (parameters: SetFileInputFilesParameters) => Promise<unknown>;
  selectOption: (parameters: SelectOptionParameters) => Promise<unknown>;
  setChecked: (parameters: SetCheckedParameters, checked: boolean) => Promise<unknown>;
  submitForm: (parameters: SubmitFormParameters) => Promise<unknown>;
  getWordPressMenu: (parameters: GetWordPressMenuParameters) => Promise<unknown>;
  editWordPressMenu: (parameters: EditWordPressMenuParameters) => Promise<unknown>;
  getWordPressAdmin: (parameters: GetWordPressAdminParameters) => Promise<unknown>;
  wordpressListTableAction: (parameters: WordPressListTableActionParameters) => Promise<unknown>;
  getWordPressEditor: (parameters: GetWordPressEditorParameters) => Promise<unknown>;
  editWordPressEditor: (parameters: EditWordPressEditorParameters) => Promise<unknown>;
  evaluateJavaScript: (parameters: EvaluateJavaScriptParameters) => Promise<unknown>;
  mutateDom: (parameters: MutateDomParameters) => Promise<unknown>;
  inspectElement: (parameters: InspectElementParameters) => Promise<unknown>;
  manageCss: (parameters: ManageCssParameters) => Promise<unknown>;
  observeEvents: (parameters: ObserveEventsParameters) => Promise<unknown>;
  executeJavaScript: (parameters: ExecuteJavaScriptParameters) => Promise<unknown>;
  captureScreenshot: (parameters: CaptureScreenshotParameters) => Promise<unknown>;
  clickAt: (parameters: ClickAtParameters) => Promise<unknown>;
  getHttpAuthState: (parameters: HttpAuthStateParameters) => Promise<unknown>;
  authenticateHttp: (parameters: AuthenticateHttpParameters) => Promise<unknown>;
  handleJavaScriptDialog: (parameters: HandleJavaScriptDialogParameters) => Promise<unknown>;
  manageBrowserConsole: (parameters: BrowserConsoleParameters) => Promise<unknown>;
  manageNetworkCapture: (parameters: NetworkCaptureParameters) => Promise<unknown>;
  manageDeviceEmulation: (parameters: DeviceEmulationParameters) => Promise<unknown>;
  performGesture: (parameters: PerformGestureParameters) => Promise<unknown>;
  printToPdf: (parameters: PrintToPdfParameters) => Promise<unknown>;
  pageApiRequest: (parameters: PageApiRequestParameters) => Promise<unknown>;
}

const unavailableBrowserCommands: ExtensionCommandDependencies = {
  getCapabilities: () =>
    Promise.reject(
      new ExtensionCommandError(
        IBP_ERROR_CODES.BROWSER_API_ERROR,
        "Browser capabilities are not configured",
      ),
    ),
  listTabs: () =>
    Promise.reject(
      new ExtensionCommandError(
        IBP_ERROR_CODES.PERMISSION_DENIED,
        "Browser tab access is not configured",
      ),
    ),
  openTab: () =>
    Promise.reject(
      new ExtensionCommandError(
        IBP_ERROR_CODES.PERMISSION_DENIED,
        "Browser tab opening is not configured",
      ),
    ),
  closeTab: () =>
    Promise.reject(
      new ExtensionCommandError(
        IBP_ERROR_CODES.PERMISSION_DENIED,
        "Browser tab closing is not configured",
      ),
    ),
  navigate: () =>
    Promise.reject(
      new ExtensionCommandError(
        IBP_ERROR_CODES.PERMISSION_DENIED,
        "Browser navigation is not configured",
      ),
    ),
  navigateHistory: () =>
    Promise.reject(
      new ExtensionCommandError(
        IBP_ERROR_CODES.PERMISSION_DENIED,
        "Browser history navigation is not configured",
      ),
    ),
  activateTab: () =>
    Promise.reject(
      new ExtensionCommandError(
        IBP_ERROR_CODES.PERMISSION_DENIED,
        "Explicit browser tab activation is not configured",
      ),
    ),
  waitFor: () =>
    Promise.reject(
      new ExtensionCommandError(
        IBP_ERROR_CODES.PERMISSION_DENIED,
        "Browser condition waiting is not configured",
      ),
    ),
  setControlIdentity: () =>
    Promise.reject(
      new ExtensionCommandError(
        IBP_ERROR_CODES.PERMISSION_DENIED,
        "Browser tab control identity is not configured",
      ),
    ),
  unlockTab: () =>
    Promise.reject(
      new ExtensionCommandError(
        IBP_ERROR_CODES.PERMISSION_DENIED,
        "Browser tab control release is not configured",
      ),
    ),
  getPageSnapshot: () =>
    Promise.reject(
      new ExtensionCommandError(
        IBP_ERROR_CODES.PERMISSION_DENIED,
        "Browser page access is not configured",
      ),
    ),
  getPageText: () =>
    Promise.reject(
      new ExtensionCommandError(
        IBP_ERROR_CODES.PERMISSION_DENIED,
        "Browser page text access is not configured",
      ),
    ),
  findElements: () =>
    Promise.reject(
      new ExtensionCommandError(
        IBP_ERROR_CODES.PERMISSION_DENIED,
        "Browser element search is not configured",
      ),
    ),
  findNaturalLanguage: () =>
    Promise.reject(
      new ExtensionCommandError(
        IBP_ERROR_CODES.PERMISSION_DENIED,
        "Natural-language browser element search is not configured",
      ),
    ),
  click: () =>
    Promise.reject(
      new ExtensionCommandError(
        IBP_ERROR_CODES.PERMISSION_DENIED,
        "Browser click is not configured",
      ),
    ),
  typeText: () =>
    Promise.reject(
      new ExtensionCommandError(
        IBP_ERROR_CODES.PERMISSION_DENIED,
        "Browser text input is not configured",
      ),
    ),
  setFileInputFiles: () =>
    Promise.reject(
      new ExtensionCommandError(
        IBP_ERROR_CODES.PERMISSION_DENIED,
        "Browser local file upload is not configured",
      ),
    ),
  selectOption: () =>
    Promise.reject(
      new ExtensionCommandError(
        IBP_ERROR_CODES.PERMISSION_DENIED,
        "Browser select interaction is not configured",
      ),
    ),
  setChecked: () =>
    Promise.reject(
      new ExtensionCommandError(
        IBP_ERROR_CODES.PERMISSION_DENIED,
        "Browser checked-state interaction is not configured",
      ),
    ),
  submitForm: () =>
    Promise.reject(
      new ExtensionCommandError(
        IBP_ERROR_CODES.PERMISSION_DENIED,
        "Browser form submission is not configured",
      ),
    ),
  getWordPressMenu: () =>
    Promise.reject(
      new ExtensionCommandError(
        IBP_ERROR_CODES.PERMISSION_DENIED,
        "WordPress menu inspection is not configured",
      ),
    ),
  editWordPressMenu: () =>
    Promise.reject(
      new ExtensionCommandError(
        IBP_ERROR_CODES.PERMISSION_DENIED,
        "WordPress menu editing is not configured",
      ),
    ),
  getWordPressAdmin: () =>
    Promise.reject(
      new ExtensionCommandError(
        IBP_ERROR_CODES.PERMISSION_DENIED,
        "WordPress admin inspection is not configured",
      ),
    ),
  wordpressListTableAction: () =>
    Promise.reject(
      new ExtensionCommandError(
        IBP_ERROR_CODES.PERMISSION_DENIED,
        "WordPress list-table actions are not configured",
      ),
    ),
  getWordPressEditor: () =>
    Promise.reject(
      new ExtensionCommandError(
        IBP_ERROR_CODES.PERMISSION_DENIED,
        "WordPress editor inspection is not configured",
      ),
    ),
  editWordPressEditor: () =>
    Promise.reject(
      new ExtensionCommandError(
        IBP_ERROR_CODES.PERMISSION_DENIED,
        "WordPress editor actions are not configured",
      ),
    ),
  evaluateJavaScript: () =>
    Promise.reject(
      new ExtensionCommandError(
        IBP_ERROR_CODES.PERMISSION_DENIED,
        "Browser JavaScript evaluation is not configured",
      ),
    ),
  mutateDom: () =>
    Promise.reject(
      new ExtensionCommandError(
        IBP_ERROR_CODES.PERMISSION_DENIED,
        "Browser DOM mutation is not configured",
      ),
    ),
  inspectElement: () =>
    Promise.reject(
      new ExtensionCommandError(
        IBP_ERROR_CODES.PERMISSION_DENIED,
        "Browser element inspection is not configured",
      ),
    ),
  manageCss: () =>
    Promise.reject(
      new ExtensionCommandError(
        IBP_ERROR_CODES.PERMISSION_DENIED,
        "Browser CSS injection is not configured",
      ),
    ),
  observeEvents: () =>
    Promise.reject(
      new ExtensionCommandError(
        IBP_ERROR_CODES.PERMISSION_DENIED,
        "Browser event capture is not configured",
      ),
    ),
  executeJavaScript: () =>
    Promise.reject(
      new ExtensionCommandError(
        IBP_ERROR_CODES.PERMISSION_DENIED,
        "Raw browser JavaScript execution is not configured",
      ),
    ),
  captureScreenshot: () =>
    Promise.reject(
      new ExtensionCommandError(
        IBP_ERROR_CODES.PERMISSION_DENIED,
        "Browser screenshot capture is not configured",
      ),
    ),
  clickAt: () =>
    Promise.reject(
      new ExtensionCommandError(
        IBP_ERROR_CODES.PERMISSION_DENIED,
        "Browser coordinate click is not configured",
      ),
    ),
  getHttpAuthState: () =>
    Promise.reject(
      new ExtensionCommandError(
        IBP_ERROR_CODES.PERMISSION_DENIED,
        "HTTP authentication detection is not configured",
      ),
    ),
  authenticateHttp: () =>
    Promise.reject(
      new ExtensionCommandError(
        IBP_ERROR_CODES.PERMISSION_DENIED,
        "HTTP authentication is not configured",
      ),
    ),
  handleJavaScriptDialog: () =>
    Promise.reject(
      new ExtensionCommandError(
        IBP_ERROR_CODES.PERMISSION_DENIED,
        "Native JavaScript dialog handling is not configured",
      ),
    ),
  manageBrowserConsole: () =>
    Promise.reject(
      new ExtensionCommandError(
        IBP_ERROR_CODES.PERMISSION_DENIED,
        "Browser console capture is not configured",
      ),
    ),
  manageNetworkCapture: () =>
    Promise.reject(
      new ExtensionCommandError(
        IBP_ERROR_CODES.BROWSER_API_ERROR,
        "Browser network capture is not configured",
      ),
    ),
  manageDeviceEmulation: () =>
    Promise.reject(
      new ExtensionCommandError(
        IBP_ERROR_CODES.PERMISSION_DENIED,
        "Browser device emulation is not configured",
      ),
    ),
  performGesture: () =>
    Promise.reject(
      new ExtensionCommandError(
        IBP_ERROR_CODES.BROWSER_API_ERROR,
        "Advanced browser gestures are not configured",
      ),
    ),
  printToPdf: () =>
    Promise.reject(
      new ExtensionCommandError(IBP_ERROR_CODES.BROWSER_API_ERROR, "PDF export is not configured"),
    ),
  pageApiRequest: () =>
    Promise.reject(
      new ExtensionCommandError(
        IBP_ERROR_CODES.PERMISSION_DENIED,
        "Same-origin page API access is not configured",
      ),
    ),
};

export async function handleProtocolMessage(
  message: unknown,
  dependencies: Partial<ExtensionCommandDependencies> = unavailableBrowserCommands,
): Promise<ProtocolResponseEnvelope | undefined> {
  const envelope = parseIbpEnvelope(message);
  if (envelope.direction !== "request") {
    return undefined;
  }

  try {
    parseActionParameters(envelope.payload.action, envelope.payload.parameters);
  } catch (error) {
    if (error instanceof IbpProtocolError) {
      return createErrorResponse(envelope, {
        code: error.code,
        message: error.message,
        retryable: error.retryable,
        ...(error.details === undefined ? {} : { details: error.details }),
      });
    }
    throw error;
  }

  try {
    if (envelope.payload.action === SYSTEM_PING_ACTION) {
      const parameters = SystemPingParametersSchema.parse(envelope.payload.parameters);
      const pingRequest: ProtocolRequestEnvelope<typeof parameters> = {
        ...envelope,
        payload: {
          ...envelope.payload,
          parameters,
        },
      };
      return createPongResponse(pingRequest);
    }

    if (envelope.payload.action === SYSTEM_CAPABILITIES_ACTION) {
      const startedAt = new Date();
      const parameters = SystemCapabilitiesParametersSchema.parse(envelope.payload.parameters);
      const request: ProtocolRequestEnvelope<typeof parameters> = {
        ...envelope,
        payload: { ...envelope.payload, parameters },
      };
      const data = SystemCapabilitiesDataSchema.parse(
        await (dependencies.getCapabilities ?? unavailableBrowserCommands.getCapabilities)(),
      );
      return createCapabilitiesResponse(request, data, { startedAt });
    }

    if (envelope.payload.action === BROWSER_LIST_TABS_ACTION) {
      const startedAt = new Date();
      const parameters = ListTabsParametersSchema.parse(envelope.payload.parameters);
      const request: ProtocolRequestEnvelope<typeof parameters> = {
        ...envelope,
        payload: { ...envelope.payload, parameters },
      };
      const data = ListTabsDataSchema.parse(
        await (dependencies.listTabs ?? unavailableBrowserCommands.listTabs)(),
      );
      return createListTabsResponse(request, data, { startedAt });
    }

    if (envelope.payload.action === BROWSER_OPEN_TAB_ACTION) {
      const startedAt = new Date();
      const parameters = OpenTabParametersSchema.parse(envelope.payload.parameters);
      const request: ProtocolRequestEnvelope<typeof parameters> = {
        ...envelope,
        payload: { ...envelope.payload, parameters },
      };
      const data = OpenTabDataSchema.parse(
        await (dependencies.openTab ?? unavailableBrowserCommands.openTab)(parameters),
      );
      return createOpenTabResponse(request, data, { startedAt });
    }

    if (envelope.payload.action === BROWSER_CLOSE_TAB_ACTION) {
      const startedAt = new Date();
      const parameters = CloseTabParametersSchema.parse(envelope.payload.parameters);
      const request: ProtocolRequestEnvelope<typeof parameters> = {
        ...envelope,
        payload: { ...envelope.payload, parameters },
      };
      const data = CloseTabDataSchema.parse(
        await (dependencies.closeTab ?? unavailableBrowserCommands.closeTab)(parameters),
      );
      return createCloseTabResponse(request, data, { startedAt });
    }

    if (envelope.payload.action === BROWSER_NAVIGATE_ACTION) {
      const startedAt = new Date();
      const parameters = NavigateParametersSchema.parse(envelope.payload.parameters);
      const request: ProtocolRequestEnvelope<typeof parameters> = {
        ...envelope,
        payload: { ...envelope.payload, parameters },
      };
      const data = NavigateDataSchema.parse(
        await (dependencies.navigate ?? unavailableBrowserCommands.navigate)(parameters),
      );
      return createNavigateResponse(request, data, { startedAt });
    }

    if (
      envelope.payload.action === BROWSER_GO_BACK_ACTION ||
      envelope.payload.action === BROWSER_GO_FORWARD_ACTION
    ) {
      const startedAt = new Date();
      const parameters = HistoryNavigationParametersSchema.parse(envelope.payload.parameters);
      const request: ProtocolRequestEnvelope<typeof parameters> = {
        ...envelope,
        payload: { ...envelope.payload, parameters },
      };
      const data = HistoryNavigationDataSchema.parse(
        await (dependencies.navigateHistory ?? unavailableBrowserCommands.navigateHistory)(
          envelope.payload.action === BROWSER_GO_BACK_ACTION ? "back" : "forward",
          parameters,
        ),
      );
      return createHistoryNavigationResponse(request, data, { startedAt });
    }

    if (envelope.payload.action === BROWSER_ACTIVATE_TAB_ACTION) {
      const startedAt = new Date();
      const parameters = ActivateTabParametersSchema.parse(envelope.payload.parameters);
      const request: ProtocolRequestEnvelope<typeof parameters> = {
        ...envelope,
        payload: { ...envelope.payload, parameters },
      };
      const data = ActivateTabDataSchema.parse(
        await (dependencies.activateTab ?? unavailableBrowserCommands.activateTab)(parameters),
      );
      return createActivateTabResponse(request, data, { startedAt });
    }

    if (envelope.payload.action === BROWSER_WAIT_FOR_ACTION) {
      const startedAt = new Date();
      const parameters = WaitForParametersSchema.parse(envelope.payload.parameters);
      const request: ProtocolRequestEnvelope<typeof parameters> = {
        ...envelope,
        payload: { ...envelope.payload, parameters },
      };
      const data = WaitForDataSchema.parse(
        await (dependencies.waitFor ?? unavailableBrowserCommands.waitFor)(parameters),
      );
      return createWaitForResponse(request, data, { startedAt });
    }

    if (envelope.payload.action === BROWSER_SET_CONTROL_IDENTITY_ACTION) {
      const startedAt = new Date();
      const parameters = SetControlIdentityParametersSchema.parse(envelope.payload.parameters);
      const request: ProtocolRequestEnvelope<typeof parameters> = {
        ...envelope,
        payload: { ...envelope.payload, parameters },
      };
      const data = SetControlIdentityDataSchema.parse(
        await (dependencies.setControlIdentity ?? unavailableBrowserCommands.setControlIdentity)(
          parameters,
        ),
      );
      return createSetControlIdentityResponse(request, data, { startedAt });
    }

    if (envelope.payload.action === BROWSER_UNLOCK_TAB_ACTION) {
      const startedAt = new Date();
      const parameters = UnlockTabParametersSchema.parse(envelope.payload.parameters);
      const request: ProtocolRequestEnvelope<typeof parameters> = {
        ...envelope,
        payload: { ...envelope.payload, parameters },
      };
      const data = UnlockTabDataSchema.parse(
        await (dependencies.unlockTab ?? unavailableBrowserCommands.unlockTab)(parameters),
      );
      return createUnlockTabResponse(request, data, { startedAt });
    }

    if (envelope.payload.action === BROWSER_GET_PAGE_SNAPSHOT_ACTION) {
      const startedAt = new Date();
      const parameters = GetPageSnapshotParametersSchema.parse(envelope.payload.parameters);
      const request: ProtocolRequestEnvelope<typeof parameters> = {
        ...envelope,
        payload: { ...envelope.payload, parameters },
      };
      const data = PageSnapshotSchema.parse(
        await (dependencies.getPageSnapshot ?? unavailableBrowserCommands.getPageSnapshot)(
          parameters,
        ),
      );
      return createPageSnapshotResponse(request, data, { startedAt });
    }

    if (envelope.payload.action === BROWSER_GET_PAGE_TEXT_ACTION) {
      const startedAt = new Date();
      const parameters = GetPageTextParametersSchema.parse(envelope.payload.parameters);
      const request: ProtocolRequestEnvelope<typeof parameters> = {
        ...envelope,
        payload: { ...envelope.payload, parameters },
      };
      const data = GetPageTextDataSchema.parse(
        await (dependencies.getPageText ?? unavailableBrowserCommands.getPageText)(parameters),
      );
      return createPageTextResponse(request, data, { startedAt });
    }

    if (envelope.payload.action === BROWSER_FIND_ELEMENTS_ACTION) {
      const startedAt = new Date();
      const parameters = FindElementsParametersSchema.parse(envelope.payload.parameters);
      const request: ProtocolRequestEnvelope<typeof parameters> = {
        ...envelope,
        payload: { ...envelope.payload, parameters },
      };
      const data = FindElementsDataSchema.parse(
        await (dependencies.findElements ?? unavailableBrowserCommands.findElements)(parameters),
      );
      return createFindElementsResponse(request, data, { startedAt });
    }

    if (envelope.payload.action === BROWSER_FIND_NATURAL_LANGUAGE_ACTION) {
      const startedAt = new Date();
      const parameters = FindNaturalLanguageParametersSchema.parse(envelope.payload.parameters);
      const request: ProtocolRequestEnvelope<typeof parameters> = {
        ...envelope,
        payload: { ...envelope.payload, parameters },
      };
      const data = FindNaturalLanguageDataSchema.parse(
        await (dependencies.findNaturalLanguage ?? unavailableBrowserCommands.findNaturalLanguage)(
          parameters,
        ),
      );
      return createFindNaturalLanguageResponse(request, data, { startedAt });
    }

    if (envelope.payload.action === BROWSER_CLICK_ACTION) {
      const startedAt = new Date();
      const parameters = ClickElementParametersSchema.parse(envelope.payload.parameters);
      const request: ProtocolRequestEnvelope<typeof parameters> = {
        ...envelope,
        payload: { ...envelope.payload, parameters },
      };
      const data = ClickElementDataSchema.parse(
        await (dependencies.click ?? unavailableBrowserCommands.click)(parameters),
      );
      return createClickResponse(request, data, { startedAt });
    }

    if (envelope.payload.action === BROWSER_TYPE_TEXT_ACTION) {
      const startedAt = new Date();
      const parameters = TypeTextParametersSchema.parse(envelope.payload.parameters);
      const request: ProtocolRequestEnvelope<typeof parameters> = {
        ...envelope,
        payload: { ...envelope.payload, parameters },
      };
      const data = TypeTextDataSchema.parse(
        await (dependencies.typeText ?? unavailableBrowserCommands.typeText)(parameters),
      );
      return createTypeTextResponse(request, data, { startedAt });
    }

    if (envelope.payload.action === BROWSER_SET_FILE_INPUT_FILES_ACTION) {
      const startedAt = new Date();
      const parameters = SetFileInputFilesParametersSchema.parse(envelope.payload.parameters);
      const request: ProtocolRequestEnvelope<typeof parameters> = {
        ...envelope,
        payload: { ...envelope.payload, parameters },
      };
      const data = SetFileInputFilesDataSchema.parse(
        await (dependencies.setFileInputFiles ?? unavailableBrowserCommands.setFileInputFiles)(
          parameters,
        ),
      );
      return createSetFileInputFilesResponse(request, data, { startedAt });
    }

    if (envelope.payload.action === BROWSER_SELECT_OPTION_ACTION) {
      const startedAt = new Date();
      const parameters = SelectOptionParametersSchema.parse(envelope.payload.parameters);
      const request: ProtocolRequestEnvelope<typeof parameters> = {
        ...envelope,
        payload: { ...envelope.payload, parameters },
      };
      const data = SelectOptionDataSchema.parse(
        await (dependencies.selectOption ?? unavailableBrowserCommands.selectOption)(parameters),
      );
      return createSelectOptionResponse(request, data, { startedAt });
    }

    if (
      envelope.payload.action === BROWSER_CHECK_ACTION ||
      envelope.payload.action === BROWSER_UNCHECK_ACTION
    ) {
      const startedAt = new Date();
      const parameters = SetCheckedParametersSchema.parse(envelope.payload.parameters);
      const request: ProtocolRequestEnvelope<typeof parameters> = {
        ...envelope,
        payload: { ...envelope.payload, parameters },
      };
      const checked = envelope.payload.action === BROWSER_CHECK_ACTION;
      const data = SetCheckedDataSchema.parse(
        await (dependencies.setChecked ?? unavailableBrowserCommands.setChecked)(
          parameters,
          checked,
        ),
      );
      return createSetCheckedResponse(request, data, { startedAt });
    }

    if (envelope.payload.action === BROWSER_SUBMIT_FORM_ACTION) {
      const startedAt = new Date();
      const parameters = SubmitFormParametersSchema.parse(envelope.payload.parameters);
      const request: ProtocolRequestEnvelope<typeof parameters> = {
        ...envelope,
        payload: { ...envelope.payload, parameters },
      };
      const data = SubmitFormDataSchema.parse(
        await (dependencies.submitForm ?? unavailableBrowserCommands.submitForm)(parameters),
      );
      return createSubmitFormResponse(request, data, { startedAt });
    }

    if (envelope.payload.action === BROWSER_GET_WORDPRESS_MENU_ACTION) {
      const startedAt = new Date();
      const parameters = GetWordPressMenuParametersSchema.parse(envelope.payload.parameters);
      const request: ProtocolRequestEnvelope<typeof parameters> = {
        ...envelope,
        payload: { ...envelope.payload, parameters },
      };
      const data = GetWordPressMenuDataSchema.parse(
        await (dependencies.getWordPressMenu ?? unavailableBrowserCommands.getWordPressMenu)(
          parameters,
        ),
      );
      return createGetWordPressMenuResponse(request, data, { startedAt });
    }

    if (envelope.payload.action === BROWSER_EDIT_WORDPRESS_MENU_ACTION) {
      const startedAt = new Date();
      const parameters = EditWordPressMenuParametersSchema.parse(envelope.payload.parameters);
      const request: ProtocolRequestEnvelope<typeof parameters> = {
        ...envelope,
        payload: { ...envelope.payload, parameters },
      };
      const data = EditWordPressMenuDataSchema.parse(
        await (dependencies.editWordPressMenu ?? unavailableBrowserCommands.editWordPressMenu)(
          parameters,
        ),
      );
      return createEditWordPressMenuResponse(request, data, { startedAt });
    }

    if (envelope.payload.action === BROWSER_GET_WORDPRESS_ADMIN_ACTION) {
      const startedAt = new Date();
      const parameters = GetWordPressAdminParametersSchema.parse(envelope.payload.parameters);
      const request: ProtocolRequestEnvelope<typeof parameters> = {
        ...envelope,
        payload: { ...envelope.payload, parameters },
      };
      const data = GetWordPressAdminDataSchema.parse(
        await (dependencies.getWordPressAdmin ?? unavailableBrowserCommands.getWordPressAdmin)(
          parameters,
        ),
      );
      return createGetWordPressAdminResponse(request, data, { startedAt });
    }

    if (envelope.payload.action === BROWSER_WORDPRESS_LIST_TABLE_ACTION) {
      const startedAt = new Date();
      const parameters = WordPressListTableActionParametersSchema.parse(
        envelope.payload.parameters,
      );
      const request: ProtocolRequestEnvelope<typeof parameters> = {
        ...envelope,
        payload: { ...envelope.payload, parameters },
      };
      const data = WordPressListTableActionDataSchema.parse(
        await (
          dependencies.wordpressListTableAction ??
          unavailableBrowserCommands.wordpressListTableAction
        )(parameters),
      );
      return createWordPressListTableActionResponse(request, data, { startedAt });
    }

    if (envelope.payload.action === BROWSER_GET_WORDPRESS_EDITOR_ACTION) {
      const startedAt = new Date();
      const parameters = GetWordPressEditorParametersSchema.parse(envelope.payload.parameters);
      const request: ProtocolRequestEnvelope<typeof parameters> = {
        ...envelope,
        payload: { ...envelope.payload, parameters },
      };
      const data = GetWordPressEditorDataSchema.parse(
        await (dependencies.getWordPressEditor ?? unavailableBrowserCommands.getWordPressEditor)(
          parameters,
        ),
      );
      return createGetWordPressEditorResponse(request, data, { startedAt });
    }

    if (envelope.payload.action === BROWSER_EDIT_WORDPRESS_EDITOR_ACTION) {
      const startedAt = new Date();
      const parameters = EditWordPressEditorParametersSchema.parse(envelope.payload.parameters);
      const request: ProtocolRequestEnvelope<typeof parameters> = {
        ...envelope,
        payload: { ...envelope.payload, parameters },
      };
      const data = EditWordPressEditorDataSchema.parse(
        await (dependencies.editWordPressEditor ?? unavailableBrowserCommands.editWordPressEditor)(
          parameters,
        ),
      );
      return createEditWordPressEditorResponse(request, data, { startedAt });
    }

    if (envelope.payload.action === BROWSER_EVALUATE_ACTION) {
      const startedAt = new Date();
      const parameters = EvaluateJavaScriptParametersSchema.parse(envelope.payload.parameters);
      const request: ProtocolRequestEnvelope<typeof parameters> = {
        ...envelope,
        payload: { ...envelope.payload, parameters },
      };
      const data = EvaluateJavaScriptDataSchema.parse(
        await (dependencies.evaluateJavaScript ?? unavailableBrowserCommands.evaluateJavaScript)(
          parameters,
        ),
      );
      return createEvaluateJavaScriptResponse(request, data, { startedAt });
    }

    if (envelope.payload.action === BROWSER_MUTATE_DOM_ACTION) {
      const startedAt = new Date();
      const parameters = MutateDomParametersSchema.parse(envelope.payload.parameters);
      const request: ProtocolRequestEnvelope<typeof parameters> = {
        ...envelope,
        payload: { ...envelope.payload, parameters },
      };
      const data = MutateDomDataSchema.parse(
        await (dependencies.mutateDom ?? unavailableBrowserCommands.mutateDom)(parameters),
      );
      return createMutateDomResponse(request, data, { startedAt });
    }

    if (envelope.payload.action === BROWSER_INSPECT_ELEMENT_ACTION) {
      const startedAt = new Date();
      const parameters = InspectElementParametersSchema.parse(envelope.payload.parameters);
      const request: ProtocolRequestEnvelope<typeof parameters> = {
        ...envelope,
        payload: { ...envelope.payload, parameters },
      };
      const data = InspectElementDataSchema.parse(
        await (dependencies.inspectElement ?? unavailableBrowserCommands.inspectElement)(
          parameters,
        ),
      );
      return createInspectElementResponse(request, data, { startedAt });
    }

    if (envelope.payload.action === BROWSER_MANAGE_CSS_ACTION) {
      const startedAt = new Date();
      const parameters = ManageCssParametersSchema.parse(envelope.payload.parameters);
      const request: ProtocolRequestEnvelope<typeof parameters> = {
        ...envelope,
        payload: { ...envelope.payload, parameters },
      };
      const data = ManageCssDataSchema.parse(
        await (dependencies.manageCss ?? unavailableBrowserCommands.manageCss)(parameters),
      );
      return createManageCssResponse(request, data, { startedAt });
    }

    if (envelope.payload.action === BROWSER_OBSERVE_EVENTS_ACTION) {
      const startedAt = new Date();
      const parameters = ObserveEventsParametersSchema.parse(envelope.payload.parameters);
      const request: ProtocolRequestEnvelope<typeof parameters> = {
        ...envelope,
        payload: { ...envelope.payload, parameters },
      };
      const data = ObserveEventsDataSchema.parse(
        await (dependencies.observeEvents ?? unavailableBrowserCommands.observeEvents)(parameters),
      );
      return createObserveEventsResponse(request, data, { startedAt });
    }

    if (envelope.payload.action === BROWSER_EXECUTE_JAVASCRIPT_ACTION) {
      const startedAt = new Date();
      const parameters = ExecuteJavaScriptParametersSchema.parse(envelope.payload.parameters);
      const request: ProtocolRequestEnvelope<typeof parameters> = {
        ...envelope,
        payload: { ...envelope.payload, parameters },
      };
      const data = ExecuteJavaScriptDataSchema.parse(
        await (dependencies.executeJavaScript ?? unavailableBrowserCommands.executeJavaScript)(
          parameters,
        ),
      );
      return createExecuteJavaScriptResponse(request, data, { startedAt });
    }

    if (envelope.payload.action === BROWSER_SCREENSHOT_ACTION) {
      const startedAt = new Date();
      const parameters = CaptureScreenshotParametersSchema.parse(envelope.payload.parameters);
      const request: ProtocolRequestEnvelope<typeof parameters> = {
        ...envelope,
        payload: { ...envelope.payload, parameters },
      };
      const data = CaptureScreenshotDataSchema.parse(
        await (dependencies.captureScreenshot ?? unavailableBrowserCommands.captureScreenshot)(
          parameters,
        ),
      );
      return createScreenshotResponse(request, data, { startedAt });
    }

    if (envelope.payload.action === BROWSER_PRINT_TO_PDF_ACTION) {
      const startedAt = new Date();
      const parameters = PrintToPdfParametersSchema.parse(envelope.payload.parameters);
      const request: ProtocolRequestEnvelope<typeof parameters> = {
        ...envelope,
        payload: { ...envelope.payload, parameters },
      };
      const data = PrintToPdfDataSchema.parse(
        await (dependencies.printToPdf ?? unavailableBrowserCommands.printToPdf)(parameters),
      );
      return createPrintToPdfResponse(request, data, { startedAt });
    }

    if (envelope.payload.action === BROWSER_PAGE_API_REQUEST_ACTION) {
      const startedAt = new Date();
      const parameters = PageApiRequestParametersSchema.parse(envelope.payload.parameters);
      const request: ProtocolRequestEnvelope<typeof parameters> = {
        ...envelope,
        payload: { ...envelope.payload, parameters },
      };
      const data = PageApiRequestDataSchema.parse(
        await (dependencies.pageApiRequest ?? unavailableBrowserCommands.pageApiRequest)(
          parameters,
        ),
      );
      return createPageApiResponse(request, data, { startedAt });
    }

    if (envelope.payload.action === BROWSER_CLICK_AT_ACTION) {
      const startedAt = new Date();
      const parameters = ClickAtParametersSchema.parse(envelope.payload.parameters);
      const request: ProtocolRequestEnvelope<typeof parameters> = {
        ...envelope,
        payload: { ...envelope.payload, parameters },
      };
      const data = ClickAtDataSchema.parse(
        await (dependencies.clickAt ?? unavailableBrowserCommands.clickAt)(parameters),
      );
      return createClickAtResponse(request, data, { startedAt });
    }

    if (envelope.payload.action === BROWSER_PERFORM_GESTURE_ACTION) {
      const startedAt = new Date();
      const parameters = PerformGestureParametersSchema.parse(envelope.payload.parameters);
      const request: ProtocolRequestEnvelope<typeof parameters> = {
        ...envelope,
        payload: { ...envelope.payload, parameters },
      };
      const data = PerformGestureDataSchema.parse(
        await (dependencies.performGesture ?? unavailableBrowserCommands.performGesture)(
          parameters,
        ),
      );
      return createPerformGestureResponse(request, data, { startedAt });
    }

    if (envelope.payload.action === BROWSER_GET_HTTP_AUTH_STATE_ACTION) {
      const startedAt = new Date();
      const parameters = HttpAuthStateParametersSchema.parse(envelope.payload.parameters);
      const request: ProtocolRequestEnvelope<typeof parameters> = {
        ...envelope,
        payload: { ...envelope.payload, parameters },
      };
      const data = HttpAuthStateDataSchema.parse(
        await (dependencies.getHttpAuthState ?? unavailableBrowserCommands.getHttpAuthState)(
          parameters,
        ),
      );
      return createHttpAuthStateResponse(request, data, { startedAt });
    }

    if (envelope.payload.action === BROWSER_AUTHENTICATE_HTTP_ACTION) {
      const startedAt = new Date();
      const parameters = AuthenticateHttpParametersSchema.parse(envelope.payload.parameters);
      const request: ProtocolRequestEnvelope<typeof parameters> = {
        ...envelope,
        payload: { ...envelope.payload, parameters },
      };
      const data = AuthenticateHttpDataSchema.parse(
        await (dependencies.authenticateHttp ?? unavailableBrowserCommands.authenticateHttp)(
          parameters,
        ),
      );
      return createAuthenticateHttpResponse(request, data, { startedAt });
    }

    if (envelope.payload.action === BROWSER_HANDLE_JAVASCRIPT_DIALOG_ACTION) {
      const startedAt = new Date();
      const parameters = HandleJavaScriptDialogParametersSchema.parse(envelope.payload.parameters);
      const request: ProtocolRequestEnvelope<typeof parameters> = {
        ...envelope,
        payload: { ...envelope.payload, parameters },
      };
      const data = HandleJavaScriptDialogDataSchema.parse(
        await (
          dependencies.handleJavaScriptDialog ?? unavailableBrowserCommands.handleJavaScriptDialog
        )(parameters),
      );
      return createHandleJavaScriptDialogResponse(request, data, { startedAt });
    }

    if (envelope.payload.action === BROWSER_CONSOLE_ACTION) {
      const startedAt = new Date();
      const parameters = BrowserConsoleParametersSchema.parse(envelope.payload.parameters);
      const request: ProtocolRequestEnvelope<typeof parameters> = {
        ...envelope,
        payload: { ...envelope.payload, parameters },
      };
      const data = BrowserConsoleDataSchema.parse(
        await (
          dependencies.manageBrowserConsole ?? unavailableBrowserCommands.manageBrowserConsole
        )(parameters),
      );
      return createBrowserConsoleResponse(request, data, { startedAt });
    }

    if (envelope.payload.action === BROWSER_NETWORK_ACTION) {
      const startedAt = new Date();
      const parameters = NetworkCaptureParametersSchema.parse(envelope.payload.parameters);
      const request: ProtocolRequestEnvelope<typeof parameters> = {
        ...envelope,
        payload: { ...envelope.payload, parameters },
      };
      const data = NetworkCaptureDataSchema.parse(
        await (
          dependencies.manageNetworkCapture ?? unavailableBrowserCommands.manageNetworkCapture
        )(parameters),
      );
      return createNetworkCaptureResponse(request, data, { startedAt });
    }

    if (envelope.payload.action === BROWSER_EMULATE_DEVICE_ACTION) {
      const startedAt = new Date();
      const parameters = DeviceEmulationParametersSchema.parse(envelope.payload.parameters);
      const request: ProtocolRequestEnvelope<typeof parameters> = {
        ...envelope,
        payload: { ...envelope.payload, parameters },
      };
      const data = DeviceEmulationDataSchema.parse(
        await (
          dependencies.manageDeviceEmulation ?? unavailableBrowserCommands.manageDeviceEmulation
        )(parameters),
      );
      return createDeviceEmulationResponse(request, data, { startedAt });
    }
  } catch (error) {
    if (error instanceof ExtensionCommandError) {
      return createErrorResponse(envelope, {
        code: error.code,
        message: error.message,
        retryable: error.retryable,
      });
    }
    if (isZodError(error)) {
      const validation = resultValidationError(envelope.payload.action, error, "extension_result");
      return createErrorResponse(envelope, {
        code: validation.code,
        message: validation.message,
        retryable: validation.retryable,
        ...(validation.details === undefined ? {} : { details: validation.details }),
      });
    }
    return createErrorResponse(envelope, {
      code: IBP_ERROR_CODES.INVALID_MESSAGE,
      message: "The browser command or its result failed schema validation",
      retryable: false,
    });
  }

  return createUnsupportedActionResponse(envelope);
}
