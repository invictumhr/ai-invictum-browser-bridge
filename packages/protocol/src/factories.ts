import {
  IBP_ERROR_CODES,
  IBP_PROTOCOL,
  IBP_VERSION,
  type IbpErrorCode,
  type ProtocolError,
  type ProtocolEventEnvelope,
  type ProtocolRequestEnvelope,
  type ProtocolResponseEnvelope,
} from "@invictum/shared-types";

import type {
  ListTabsData,
  ListTabsParameters,
  UnlockTabData,
  UnlockTabParameters,
  FindElementsData,
  FindElementsParameters,
  FindNaturalLanguageData,
  FindNaturalLanguageParameters,
  ClickElementData,
  ClickElementParameters,
  GetPageSnapshotParameters,
  PageSnapshot,
  GetPageTextData,
  GetPageTextParameters,
  SystemPingParameters,
  SystemPongData,
  SystemCapabilitiesData,
  SystemCapabilitiesParameters,
  OpenTabData,
  OpenTabParameters,
  CloseTabData,
  CloseTabParameters,
  NavigateData,
  NavigateParameters,
  HistoryNavigationData,
  HistoryNavigationParameters,
  ActivateTabData,
  ActivateTabParameters,
  WaitForData,
  WaitForParameters,
  SetControlIdentityData,
  SetControlIdentityParameters,
  TypeTextData,
  TypeTextParameters,
  SetFileInputFilesData,
  SetFileInputFilesParameters,
  SelectOptionData,
  SelectOptionParameters,
  SetCheckedData,
  SetCheckedParameters,
  SubmitFormData,
  SubmitFormParameters,
  GetWordPressMenuData,
  GetWordPressMenuParameters,
  EditWordPressMenuData,
  EditWordPressMenuParameters,
  GetWordPressAdminData,
  GetWordPressAdminParameters,
  WordPressListTableActionData,
  WordPressListTableActionParameters,
  GetWordPressEditorData,
  GetWordPressEditorParameters,
  EditWordPressEditorData,
  EditWordPressEditorParameters,
  EvaluateJavaScriptData,
  EvaluateJavaScriptParameters,
  MutateDomData,
  MutateDomParameters,
  InspectElementData,
  InspectElementParameters,
  ManageCssData,
  ManageCssParameters,
  ObserveEventsData,
  ObserveEventsParameters,
  ExecuteJavaScriptData,
  ExecuteJavaScriptParameters,
  CaptureScreenshotData,
  CaptureScreenshotParameters,
  ClickAtData,
  ClickAtParameters,
  HttpAuthStateData,
  HttpAuthStateParameters,
  AuthenticateHttpData,
  AuthenticateHttpParameters,
  HandleJavaScriptDialogData,
  HandleJavaScriptDialogParameters,
  BrowserConsoleData,
  BrowserConsoleParameters,
  NetworkCaptureData,
  NetworkCaptureParameters,
  DeviceEmulationData,
  DeviceEmulationParameters,
  PerformGestureData,
  PerformGestureParameters,
  GetTerminalsData,
  GetTerminalsParameters,
  TerminalReadData,
  ReadTerminalParameters,
  TerminalInputData,
  TerminalInputParameters,
  PrintToPdfData,
  PrintToPdfParameters,
  PageApiRequestData,
  PageApiRequestParameters,
  GetFigmaDocumentParameters,
  GetFigmaDocumentData,
  GetFigmaLayersParameters,
  GetFigmaLayersData,
  GetFigmaPropertiesParameters,
  GetFigmaPropertiesData,
  FigmaSelectParameters,
  FigmaSelectData,
  FigmaHealthcheckParameters,
  FigmaHealthcheckData,
} from "./schemas.js";

export const SYSTEM_PING_ACTION = "system.ping";
export const SYSTEM_CAPABILITIES_ACTION = "system.capabilities";
export const SYSTEM_HEARTBEAT_EVENT = "system.heartbeat";
export const BROWSER_LIST_TABS_ACTION = "browser.list_tabs";
export const BROWSER_OPEN_TAB_ACTION = "browser.open_tab";
export const BROWSER_CLOSE_TAB_ACTION = "browser.close_tab";
export const BROWSER_NAVIGATE_ACTION = "browser.navigate";
export const BROWSER_GO_BACK_ACTION = "browser.go_back";
export const BROWSER_GO_FORWARD_ACTION = "browser.go_forward";
export const BROWSER_ACTIVATE_TAB_ACTION = "browser.activate_tab";
export const BROWSER_WAIT_FOR_ACTION = "browser.wait_for";
export const BROWSER_SET_CONTROL_IDENTITY_ACTION = "browser.set_control_identity";
export const BROWSER_UNLOCK_TAB_ACTION = "browser.unlock_tab";
export const BROWSER_GET_PAGE_SNAPSHOT_ACTION = "browser.get_page_snapshot";
export const BROWSER_GET_PAGE_TEXT_ACTION = "browser.get_page_text";
export const BROWSER_FIND_ELEMENTS_ACTION = "browser.find_elements";
export const BROWSER_FIND_NATURAL_LANGUAGE_ACTION = "browser.find_natural_language";
export const BROWSER_CLICK_ACTION = "browser.click";
export const BROWSER_TYPE_TEXT_ACTION = "browser.type_text";
export const BROWSER_SET_FILE_INPUT_FILES_ACTION = "browser.set_file_input_files";
export const BROWSER_SELECT_OPTION_ACTION = "browser.select_option";
export const BROWSER_CHECK_ACTION = "browser.check";
export const BROWSER_UNCHECK_ACTION = "browser.uncheck";
export const BROWSER_SUBMIT_FORM_ACTION = "browser.submit_form";
export const BROWSER_GET_WORDPRESS_MENU_ACTION = "browser.get_wordpress_menu";
export const BROWSER_EDIT_WORDPRESS_MENU_ACTION = "browser.edit_wordpress_menu";
export const BROWSER_GET_WORDPRESS_ADMIN_ACTION = "browser.get_wordpress_admin";
export const BROWSER_WORDPRESS_LIST_TABLE_ACTION = "browser.wordpress_list_table_action";
export const BROWSER_GET_WORDPRESS_EDITOR_ACTION = "browser.get_wordpress_editor";
export const BROWSER_EDIT_WORDPRESS_EDITOR_ACTION = "browser.edit_wordpress_editor";
export const BROWSER_GET_FIGMA_DOCUMENT_ACTION = "browser.get_figma_document";
export const BROWSER_GET_FIGMA_LAYERS_ACTION = "browser.get_figma_layers";
export const BROWSER_GET_FIGMA_PROPERTIES_ACTION = "browser.get_figma_properties";
export const BROWSER_FIGMA_SELECT_ACTION = "browser.figma_select";
export const BROWSER_FIGMA_HEALTHCHECK_ACTION = "browser.figma_healthcheck";
export const BROWSER_EVALUATE_ACTION = "browser.evaluate";
export const BROWSER_MUTATE_DOM_ACTION = "browser.mutate_dom";
export const BROWSER_INSPECT_ELEMENT_ACTION = "browser.inspect_element";
export const BROWSER_MANAGE_CSS_ACTION = "browser.manage_css";
export const BROWSER_OBSERVE_EVENTS_ACTION = "browser.observe_events";
export const BROWSER_EXECUTE_JAVASCRIPT_ACTION = "browser.execute_javascript";
export const BROWSER_SCREENSHOT_ACTION = "browser.screenshot";
export const BROWSER_CLICK_AT_ACTION = "browser.click_at";
export const BROWSER_GET_HTTP_AUTH_STATE_ACTION = "browser.get_http_auth_state";
export const BROWSER_AUTHENTICATE_HTTP_ACTION = "browser.authenticate_http";
export const BROWSER_HANDLE_JAVASCRIPT_DIALOG_ACTION = "browser.handle_javascript_dialog";
export const BROWSER_CONSOLE_ACTION = "browser.console";
export const BROWSER_NETWORK_ACTION = "browser.network";
export const BROWSER_EMULATE_DEVICE_ACTION = "browser.emulate_device";
export const BROWSER_PERFORM_GESTURE_ACTION = "browser.perform_gesture";
export const BROWSER_GET_TERMINALS_ACTION = "browser.get_terminals";
export const BROWSER_READ_TERMINAL_ACTION = "browser.read_terminal";
export const BROWSER_TERMINAL_INPUT_ACTION = "browser.terminal_input";
export const BROWSER_PRINT_TO_PDF_ACTION = "browser.print_to_pdf";
export const BROWSER_PAGE_API_REQUEST_ACTION = "browser.page_api_request";

export interface MessageFactoryOptions {
  messageId?: string;
  now?: Date;
}

function timestamp(options?: MessageFactoryOptions): string {
  return (options?.now ?? new Date()).toISOString();
}

function messageId(options?: MessageFactoryOptions): string {
  return options?.messageId ?? globalThis.crypto.randomUUID();
}

export function createPingRequest(
  sessionId: string,
  options?: MessageFactoryOptions & { nonce?: string; timeoutMs?: number },
): ProtocolRequestEnvelope<SystemPingParameters> {
  const sentAt = timestamp(options);

  return {
    protocol: IBP_PROTOCOL,
    version: IBP_VERSION,
    messageId: messageId(options),
    sessionId,
    timestamp: sentAt,
    direction: "request",
    type: "ibp.request",
    payload: {
      action: SYSTEM_PING_ACTION,
      parameters: {
        sentAt,
        nonce: options?.nonce ?? globalThis.crypto.randomUUID(),
      },
      timeoutMs: options?.timeoutMs ?? 5_000,
    },
  };
}

export function createPongResponse(
  request: ProtocolRequestEnvelope<SystemPingParameters>,
  options?: MessageFactoryOptions,
): ProtocolResponseEnvelope<SystemPongData> {
  const receivedAt = timestamp(options);

  return {
    protocol: IBP_PROTOCOL,
    version: IBP_VERSION,
    messageId: messageId(options),
    sessionId: request.sessionId,
    timestamp: receivedAt,
    direction: "response",
    type: "ibp.response",
    correlationId: request.messageId,
    payload: {
      success: true,
      data: {
        reply: "pong",
        nonce: request.payload.parameters.nonce,
        receivedAt,
        component: "extension",
      },
    },
  };
}

export function createCapabilitiesRequest(
  sessionId: string,
  options?: MessageFactoryOptions & { timeoutMs?: number },
): ProtocolRequestEnvelope<SystemCapabilitiesParameters> {
  return {
    protocol: IBP_PROTOCOL,
    version: IBP_VERSION,
    messageId: messageId(options),
    sessionId,
    timestamp: timestamp(options),
    direction: "request",
    type: "ibp.request",
    payload: {
      action: SYSTEM_CAPABILITIES_ACTION,
      parameters: {},
      timeoutMs: options?.timeoutMs ?? 5_000,
      riskContext: {
        expectedEffect: "Read the exact capabilities of the connected browser extension",
        destructive: false,
        irreversible: false,
      },
    },
  };
}

export function createCapabilitiesResponse(
  request: ProtocolRequestEnvelope<SystemCapabilitiesParameters>,
  data: SystemCapabilitiesData,
  options?: MessageFactoryOptions & { startedAt?: Date },
): ProtocolResponseEnvelope<SystemCapabilitiesData> {
  return createTimedSuccessResponse(request, data, options);
}

export function createListTabsRequest(
  sessionId: string,
  options?: MessageFactoryOptions & { timeoutMs?: number },
): ProtocolRequestEnvelope<ListTabsParameters> {
  return {
    protocol: IBP_PROTOCOL,
    version: IBP_VERSION,
    messageId: messageId(options),
    sessionId,
    timestamp: timestamp(options),
    direction: "request",
    type: "ibp.request",
    payload: {
      action: BROWSER_LIST_TABS_ACTION,
      parameters: {},
      timeoutMs: options?.timeoutMs ?? 5_000,
      riskContext: {
        expectedEffect: "Read metadata for currently open Chrome tabs",
        destructive: false,
        irreversible: false,
      },
    },
  };
}

export function createListTabsResponse(
  request: ProtocolRequestEnvelope<ListTabsParameters>,
  data: ListTabsData,
  options?: MessageFactoryOptions & { startedAt?: Date },
): ProtocolResponseEnvelope<ListTabsData> {
  const completedAt = options?.now ?? new Date();
  const startedAt = options?.startedAt ?? completedAt;
  return {
    protocol: IBP_PROTOCOL,
    version: IBP_VERSION,
    messageId: messageId(options),
    sessionId: request.sessionId,
    timestamp: completedAt.toISOString(),
    direction: "response",
    type: "ibp.response",
    correlationId: request.messageId,
    payload: {
      success: true,
      data,
      timing: {
        startedAt: startedAt.toISOString(),
        completedAt: completedAt.toISOString(),
        durationMs: Math.max(0, completedAt.getTime() - startedAt.getTime()),
      },
    },
  };
}

export function createOpenTabRequest(
  sessionId: string,
  parameters: OpenTabParameters,
  options?: MessageFactoryOptions & { timeoutMs?: number },
): ProtocolRequestEnvelope<OpenTabParameters> {
  return createBrowserInteractionRequest(
    sessionId,
    BROWSER_OPEN_TAB_ACTION,
    parameters,
    "Open one validated HTTP(S) URL in a Chrome tab",
    options,
  );
}

export function createOpenTabResponse(
  request: ProtocolRequestEnvelope<OpenTabParameters>,
  data: OpenTabData,
  options?: MessageFactoryOptions & { startedAt?: Date },
): ProtocolResponseEnvelope<OpenTabData> {
  return createTimedSuccessResponse(request, data, options);
}

export function createCloseTabRequest(
  sessionId: string,
  parameters: CloseTabParameters,
  options?: MessageFactoryOptions & { timeoutMs?: number },
): ProtocolRequestEnvelope<CloseTabParameters> {
  return createBrowserInteractionRequest(
    sessionId,
    BROWSER_CLOSE_TAB_ACTION,
    parameters,
    "Close one explicitly authorized Chrome tab, including a blocked test tab",
    options,
  );
}

export function createCloseTabResponse(
  request: ProtocolRequestEnvelope<CloseTabParameters>,
  data: CloseTabData,
  options?: MessageFactoryOptions & { startedAt?: Date },
): ProtocolResponseEnvelope<CloseTabData> {
  return createTimedSuccessResponse(request, data, options);
}

export function createNavigateRequest(
  sessionId: string,
  parameters: NavigateParameters,
  options?: MessageFactoryOptions & { timeoutMs?: number },
): ProtocolRequestEnvelope<NavigateParameters> {
  return createBrowserInteractionRequest(
    sessionId,
    BROWSER_NAVIGATE_ACTION,
    parameters,
    "Navigate one reserved Chrome tab to a validated HTTP(S) URL",
    { ...options, timeoutMs: options?.timeoutMs ?? parameters.timeoutMs + 2_000 },
  );
}

export function createNavigateResponse(
  request: ProtocolRequestEnvelope<NavigateParameters>,
  data: NavigateData,
  options?: MessageFactoryOptions & { startedAt?: Date },
): ProtocolResponseEnvelope<NavigateData> {
  return createTimedSuccessResponse(request, data, options);
}

export function createHistoryNavigationRequest(
  sessionId: string,
  direction: "back" | "forward",
  parameters: HistoryNavigationParameters,
  options?: MessageFactoryOptions & { timeoutMs?: number },
): ProtocolRequestEnvelope<HistoryNavigationParameters> {
  return createBrowserInteractionRequest(
    sessionId,
    direction === "back" ? BROWSER_GO_BACK_ACTION : BROWSER_GO_FORWARD_ACTION,
    parameters,
    `Navigate one reserved Chrome tab ${direction} in its history`,
    { ...options, timeoutMs: options?.timeoutMs ?? parameters.timeoutMs + 2_000 },
  );
}

export function createHistoryNavigationResponse(
  request: ProtocolRequestEnvelope<HistoryNavigationParameters>,
  data: HistoryNavigationData,
  options?: MessageFactoryOptions & { startedAt?: Date },
): ProtocolResponseEnvelope<HistoryNavigationData> {
  return createTimedSuccessResponse(request, data, options);
}

export function createActivateTabRequest(
  sessionId: string,
  parameters: ActivateTabParameters,
  options?: MessageFactoryOptions & { timeoutMs?: number },
): ProtocolRequestEnvelope<ActivateTabParameters> {
  return createBrowserInteractionRequest(
    sessionId,
    BROWSER_ACTIVATE_TAB_ACTION,
    parameters,
    "Explicitly activate one existing Chrome tab",
    options,
  );
}

export function createActivateTabResponse(
  request: ProtocolRequestEnvelope<ActivateTabParameters>,
  data: ActivateTabData,
  options?: MessageFactoryOptions & { startedAt?: Date },
): ProtocolResponseEnvelope<ActivateTabData> {
  return createTimedSuccessResponse(request, data, options);
}

export function createWaitForRequest(
  sessionId: string,
  parameters: WaitForParameters,
  options?: MessageFactoryOptions & { timeoutMs?: number },
): ProtocolRequestEnvelope<WaitForParameters> {
  return createBrowserInteractionRequest(
    sessionId,
    BROWSER_WAIT_FOR_ACTION,
    parameters,
    `Wait for a bounded ${parameters.condition.type} page condition`,
    { ...options, timeoutMs: options?.timeoutMs ?? parameters.timeoutMs + 2_000 },
  );
}

export function createWaitForResponse(
  request: ProtocolRequestEnvelope<WaitForParameters>,
  data: WaitForData,
  options?: MessageFactoryOptions & { startedAt?: Date },
): ProtocolResponseEnvelope<WaitForData> {
  return createTimedSuccessResponse(request, data, options);
}

export function createSetControlIdentityRequest(
  sessionId: string,
  parameters: SetControlIdentityParameters,
  options?: MessageFactoryOptions & { timeoutMs?: number },
): ProtocolRequestEnvelope<SetControlIdentityParameters> {
  return createBrowserInteractionRequest(
    sessionId,
    BROWSER_SET_CONTROL_IDENTITY_ACTION,
    parameters,
    `Identify the agent controlling tab ${parameters.tabId}`,
    options,
  );
}

export function createSetControlIdentityResponse(
  request: ProtocolRequestEnvelope<SetControlIdentityParameters>,
  data: SetControlIdentityData,
  options?: MessageFactoryOptions & { startedAt?: Date },
): ProtocolResponseEnvelope<SetControlIdentityData> {
  return createTimedSuccessResponse(request, data, options);
}

export function createUnlockTabRequest(
  sessionId: string,
  parameters: UnlockTabParameters,
  options?: MessageFactoryOptions & { timeoutMs?: number },
): ProtocolRequestEnvelope<UnlockTabParameters> {
  return {
    protocol: IBP_PROTOCOL,
    version: IBP_VERSION,
    messageId: messageId(options),
    sessionId,
    timestamp: timestamp(options),
    direction: "request",
    type: "ibp.request",
    payload: {
      action: BROWSER_UNLOCK_TAB_ACTION,
      parameters,
      timeoutMs: options?.timeoutMs ?? 5_000,
      riskContext: {
        expectedEffect: "Release the AI control reservation for one browser tab",
        destructive: false,
        irreversible: false,
      },
    },
  };
}

export function createUnlockTabResponse(
  request: ProtocolRequestEnvelope<UnlockTabParameters>,
  data: UnlockTabData,
  options?: MessageFactoryOptions & { startedAt?: Date },
): ProtocolResponseEnvelope<UnlockTabData> {
  return createTimedSuccessResponse(request, data, options);
}

export function createPageSnapshotRequest(
  sessionId: string,
  parameters: GetPageSnapshotParameters,
  options?: MessageFactoryOptions & { timeoutMs?: number },
): ProtocolRequestEnvelope<GetPageSnapshotParameters> {
  return {
    protocol: IBP_PROTOCOL,
    version: IBP_VERSION,
    messageId: messageId(options),
    sessionId,
    timestamp: timestamp(options),
    direction: "request",
    type: "ibp.request",
    payload: {
      action: BROWSER_GET_PAGE_SNAPSHOT_ACTION,
      parameters,
      timeoutMs: options?.timeoutMs ?? 5_000,
      riskContext: {
        expectedEffect: "Read a redacted semantic snapshot of one authorized browser tab",
        destructive: false,
        irreversible: false,
      },
    },
  };
}

export function createPageSnapshotResponse(
  request: ProtocolRequestEnvelope<GetPageSnapshotParameters>,
  data: PageSnapshot,
  options?: MessageFactoryOptions & { startedAt?: Date },
): ProtocolResponseEnvelope<PageSnapshot> {
  const completedAt = options?.now ?? new Date();
  const startedAt = options?.startedAt ?? completedAt;
  return {
    protocol: IBP_PROTOCOL,
    version: IBP_VERSION,
    messageId: messageId(options),
    sessionId: request.sessionId,
    timestamp: completedAt.toISOString(),
    direction: "response",
    type: "ibp.response",
    correlationId: request.messageId,
    payload: {
      success: true,
      data,
      timing: {
        startedAt: startedAt.toISOString(),
        completedAt: completedAt.toISOString(),
        durationMs: Math.max(0, completedAt.getTime() - startedAt.getTime()),
      },
    },
  };
}

export function createPageTextRequest(
  sessionId: string,
  parameters: GetPageTextParameters,
  options?: MessageFactoryOptions & { timeoutMs?: number },
): ProtocolRequestEnvelope<GetPageTextParameters> {
  return createBrowserInteractionRequest(
    sessionId,
    BROWSER_GET_PAGE_TEXT_ACTION,
    parameters,
    "Read bounded redacted page text from one authorized browser tab",
    options,
  );
}

export function createPageTextResponse(
  request: ProtocolRequestEnvelope<GetPageTextParameters>,
  data: GetPageTextData,
  options?: MessageFactoryOptions & { startedAt?: Date },
): ProtocolResponseEnvelope<GetPageTextData> {
  return createTimedSuccessResponse(request, data, options);
}

export function createFindElementsRequest(
  sessionId: string,
  parameters: FindElementsParameters,
  options?: MessageFactoryOptions & { timeoutMs?: number },
): ProtocolRequestEnvelope<FindElementsParameters> {
  return {
    protocol: IBP_PROTOCOL,
    version: IBP_VERSION,
    messageId: messageId(options),
    sessionId,
    timestamp: timestamp(options),
    direction: "request",
    type: "ibp.request",
    payload: {
      action: BROWSER_FIND_ELEMENTS_ACTION,
      parameters,
      timeoutMs: options?.timeoutMs ?? 5_000,
      riskContext: {
        expectedEffect: "Find matching elements in one authorized browser document revision",
        destructive: false,
        irreversible: false,
      },
    },
  };
}

export function createFindElementsResponse(
  request: ProtocolRequestEnvelope<FindElementsParameters>,
  data: FindElementsData,
  options?: MessageFactoryOptions & { startedAt?: Date },
): ProtocolResponseEnvelope<FindElementsData> {
  const completedAt = options?.now ?? new Date();
  const startedAt = options?.startedAt ?? completedAt;
  return {
    protocol: IBP_PROTOCOL,
    version: IBP_VERSION,
    messageId: messageId(options),
    sessionId: request.sessionId,
    timestamp: completedAt.toISOString(),
    direction: "response",
    type: "ibp.response",
    correlationId: request.messageId,
    payload: {
      success: true,
      data,
      timing: {
        startedAt: startedAt.toISOString(),
        completedAt: completedAt.toISOString(),
        durationMs: Math.max(0, completedAt.getTime() - startedAt.getTime()),
      },
    },
  };
}

export function createFindNaturalLanguageRequest(
  sessionId: string,
  parameters: FindNaturalLanguageParameters,
  options?: MessageFactoryOptions & { timeoutMs?: number },
): ProtocolRequestEnvelope<FindNaturalLanguageParameters> {
  return createBrowserInteractionRequest(
    sessionId,
    BROWSER_FIND_NATURAL_LANGUAGE_ACTION,
    parameters,
    "Find semantic elements using a bounded deterministic natural-language query",
    options,
  );
}

export function createFindNaturalLanguageResponse(
  request: ProtocolRequestEnvelope<FindNaturalLanguageParameters>,
  data: FindNaturalLanguageData,
  options?: MessageFactoryOptions & { startedAt?: Date },
): ProtocolResponseEnvelope<FindNaturalLanguageData> {
  return createTimedSuccessResponse(request, data, options);
}

export function createClickRequest(
  sessionId: string,
  parameters: ClickElementParameters,
  options?: MessageFactoryOptions & { timeoutMs?: number },
): ProtocolRequestEnvelope<ClickElementParameters> {
  return {
    protocol: IBP_PROTOCOL,
    version: IBP_VERSION,
    messageId: messageId(options),
    sessionId,
    timestamp: timestamp(options),
    direction: "request",
    type: "ibp.request",
    payload: {
      action: BROWSER_CLICK_ACTION,
      parameters,
      timeoutMs: options?.timeoutMs ?? 5_000,
      riskContext: {
        expectedEffect: "Activate one revision-bound non-submit browser element",
        destructive: false,
        irreversible: false,
      },
    },
  };
}

export function createClickResponse(
  request: ProtocolRequestEnvelope<ClickElementParameters>,
  data: ClickElementData,
  options?: MessageFactoryOptions & { startedAt?: Date },
): ProtocolResponseEnvelope<ClickElementData> {
  return createTimedSuccessResponse(request, data, options);
}

export function createTypeTextRequest(
  sessionId: string,
  parameters: TypeTextParameters,
  options?: MessageFactoryOptions & { timeoutMs?: number },
): ProtocolRequestEnvelope<TypeTextParameters> {
  return {
    protocol: IBP_PROTOCOL,
    version: IBP_VERSION,
    messageId: messageId(options),
    sessionId,
    timestamp: timestamp(options),
    direction: "request",
    type: "ibp.request",
    payload: {
      action: BROWSER_TYPE_TEXT_ACTION,
      parameters,
      timeoutMs: options?.timeoutMs ?? 5_000,
      riskContext: {
        expectedEffect: "Type text into one revision-bound non-sensitive browser field",
        destructive: false,
        irreversible: false,
      },
    },
  };
}

export function createTypeTextResponse(
  request: ProtocolRequestEnvelope<TypeTextParameters>,
  data: TypeTextData,
  options?: MessageFactoryOptions & { startedAt?: Date },
): ProtocolResponseEnvelope<TypeTextData> {
  return createTimedSuccessResponse(request, data, options);
}

export function createSetFileInputFilesRequest(
  sessionId: string,
  parameters: SetFileInputFilesParameters,
  options?: MessageFactoryOptions & { timeoutMs?: number },
): ProtocolRequestEnvelope<SetFileInputFilesParameters> {
  return createBrowserInteractionRequest(
    sessionId,
    BROWSER_SET_FILE_INPUT_FILES_ACTION,
    parameters,
    "Attach explicitly authorized local files to one revision-bound file input",
    { ...options, timeoutMs: options?.timeoutMs ?? 30_000 },
  );
}

export function createSetFileInputFilesResponse(
  request: ProtocolRequestEnvelope<SetFileInputFilesParameters>,
  data: SetFileInputFilesData,
  options?: MessageFactoryOptions & { startedAt?: Date },
): ProtocolResponseEnvelope<SetFileInputFilesData> {
  return createTimedSuccessResponse(request, data, options);
}

function createBrowserInteractionRequest<T>(
  sessionId: string,
  action: string,
  parameters: T,
  expectedEffect: string,
  options?: MessageFactoryOptions & { timeoutMs?: number },
): ProtocolRequestEnvelope<T> {
  return {
    protocol: IBP_PROTOCOL,
    version: IBP_VERSION,
    messageId: messageId(options),
    sessionId,
    timestamp: timestamp(options),
    direction: "request",
    type: "ibp.request",
    payload: {
      action,
      parameters,
      timeoutMs: options?.timeoutMs ?? 5_000,
      riskContext: {
        expectedEffect,
        destructive: false,
        irreversible: false,
      },
    },
  };
}

export function createSelectOptionRequest(
  sessionId: string,
  parameters: SelectOptionParameters,
  options?: MessageFactoryOptions & { timeoutMs?: number },
): ProtocolRequestEnvelope<SelectOptionParameters> {
  return createBrowserInteractionRequest(
    sessionId,
    BROWSER_SELECT_OPTION_ACTION,
    parameters,
    "Select options in one revision-bound browser field",
    options,
  );
}

export function createSelectOptionResponse(
  request: ProtocolRequestEnvelope<SelectOptionParameters>,
  data: SelectOptionData,
  options?: MessageFactoryOptions & { startedAt?: Date },
): ProtocolResponseEnvelope<SelectOptionData> {
  return createTimedSuccessResponse(request, data, options);
}

export function createSetCheckedRequest(
  sessionId: string,
  checked: boolean,
  parameters: SetCheckedParameters,
  options?: MessageFactoryOptions & { timeoutMs?: number },
): ProtocolRequestEnvelope<SetCheckedParameters> {
  return createBrowserInteractionRequest(
    sessionId,
    checked ? BROWSER_CHECK_ACTION : BROWSER_UNCHECK_ACTION,
    parameters,
    `${checked ? "Check" : "Uncheck"} one revision-bound browser control`,
    options,
  );
}

export function createSetCheckedResponse(
  request: ProtocolRequestEnvelope<SetCheckedParameters>,
  data: SetCheckedData,
  options?: MessageFactoryOptions & { startedAt?: Date },
): ProtocolResponseEnvelope<SetCheckedData> {
  return createTimedSuccessResponse(request, data, options);
}

export function createSubmitFormRequest(
  sessionId: string,
  parameters: SubmitFormParameters,
  options?: MessageFactoryOptions & { timeoutMs?: number },
): ProtocolRequestEnvelope<SubmitFormParameters> {
  return createBrowserInteractionRequest(
    sessionId,
    BROWSER_SUBMIT_FORM_ACTION,
    parameters,
    "Submit one revision-bound form after an explicit user instruction",
    options,
  );
}

export function createSubmitFormResponse(
  request: ProtocolRequestEnvelope<SubmitFormParameters>,
  data: SubmitFormData,
  options?: MessageFactoryOptions & { startedAt?: Date },
): ProtocolResponseEnvelope<SubmitFormData> {
  return createTimedSuccessResponse(request, data, options);
}

export function createGetWordPressMenuRequest(
  sessionId: string,
  parameters: GetWordPressMenuParameters,
  options?: MessageFactoryOptions & { timeoutMs?: number },
): ProtocolRequestEnvelope<GetWordPressMenuParameters> {
  return createBrowserInteractionRequest(
    sessionId,
    BROWSER_GET_WORDPRESS_MENU_ACTION,
    parameters,
    "Read the bounded structure of the current classic WordPress navigation menu editor",
    options,
  );
}

export function createGetWordPressMenuResponse(
  request: ProtocolRequestEnvelope<GetWordPressMenuParameters>,
  data: GetWordPressMenuData,
  options?: MessageFactoryOptions & { startedAt?: Date },
): ProtocolResponseEnvelope<GetWordPressMenuData> {
  return createTimedSuccessResponse(request, data, options);
}

export function createEditWordPressMenuRequest(
  sessionId: string,
  parameters: EditWordPressMenuParameters,
  options?: MessageFactoryOptions & { timeoutMs?: number },
): ProtocolRequestEnvelope<EditWordPressMenuParameters> {
  return createBrowserInteractionRequest(
    sessionId,
    BROWSER_EDIT_WORDPRESS_MENU_ACTION,
    parameters,
    parameters.save
      ? "Apply explicitly authorized WordPress menu edits and submit the menu form"
      : "Apply explicitly authorized WordPress menu edits without saving",
    options,
  );
}

export function createEditWordPressMenuResponse(
  request: ProtocolRequestEnvelope<EditWordPressMenuParameters>,
  data: EditWordPressMenuData,
  options?: MessageFactoryOptions & { startedAt?: Date },
): ProtocolResponseEnvelope<EditWordPressMenuData> {
  return createTimedSuccessResponse(request, data, options);
}

export function createGetWordPressAdminRequest(
  sessionId: string,
  parameters: GetWordPressAdminParameters,
  options?: MessageFactoryOptions & { timeoutMs?: number },
): ProtocolRequestEnvelope<GetWordPressAdminParameters> {
  return createBrowserInteractionRequest(
    sessionId,
    BROWSER_GET_WORDPRESS_ADMIN_ACTION,
    parameters,
    "Read bounded WordPress admin context, notices, and the current list table",
    options,
  );
}

export function createGetWordPressAdminResponse(
  request: ProtocolRequestEnvelope<GetWordPressAdminParameters>,
  data: GetWordPressAdminData,
  options?: MessageFactoryOptions & { startedAt?: Date },
): ProtocolResponseEnvelope<GetWordPressAdminData> {
  return createTimedSuccessResponse(request, data, options);
}

export function createWordPressListTableActionRequest(
  sessionId: string,
  parameters: WordPressListTableActionParameters,
  options?: MessageFactoryOptions & { timeoutMs?: number },
): ProtocolRequestEnvelope<WordPressListTableActionParameters> {
  return createBrowserInteractionRequest(
    sessionId,
    BROWSER_WORDPRESS_LIST_TABLE_ACTION,
    parameters,
    `Run explicitly authorized WordPress list-table ${parameters.operation}`,
    options,
  );
}

export function createWordPressListTableActionResponse(
  request: ProtocolRequestEnvelope<WordPressListTableActionParameters>,
  data: WordPressListTableActionData,
  options?: MessageFactoryOptions & { startedAt?: Date },
): ProtocolResponseEnvelope<WordPressListTableActionData> {
  return createTimedSuccessResponse(request, data, options);
}

export function createGetWordPressEditorRequest(
  sessionId: string,
  parameters: GetWordPressEditorParameters,
  options?: MessageFactoryOptions & { timeoutMs?: number },
): ProtocolRequestEnvelope<GetWordPressEditorParameters> {
  return createBrowserInteractionRequest(
    sessionId,
    BROWSER_GET_WORDPRESS_EDITOR_ACTION,
    parameters,
    "Read the current WordPress block or classic post editor model",
    options,
  );
}

export function createGetWordPressEditorResponse(
  request: ProtocolRequestEnvelope<GetWordPressEditorParameters>,
  data: GetWordPressEditorData,
  options?: MessageFactoryOptions & { startedAt?: Date },
): ProtocolResponseEnvelope<GetWordPressEditorData> {
  return createTimedSuccessResponse(request, data, options);
}

export function createEditWordPressEditorRequest(
  sessionId: string,
  parameters: EditWordPressEditorParameters,
  options?: MessageFactoryOptions & { timeoutMs?: number },
): ProtocolRequestEnvelope<EditWordPressEditorParameters> {
  return createBrowserInteractionRequest(
    sessionId,
    BROWSER_EDIT_WORDPRESS_EDITOR_ACTION,
    parameters,
    parameters.save
      ? "Update and save the explicitly authorized WordPress editor model"
      : "Update the explicitly authorized WordPress editor model without saving",
    options,
  );
}

export function createEditWordPressEditorResponse(
  request: ProtocolRequestEnvelope<EditWordPressEditorParameters>,
  data: EditWordPressEditorData,
  options?: MessageFactoryOptions & { startedAt?: Date },
): ProtocolResponseEnvelope<EditWordPressEditorData> {
  return createTimedSuccessResponse(request, data, options);
}

export function createEvaluateJavaScriptRequest(
  sessionId: string,
  parameters: EvaluateJavaScriptParameters,
  options?: MessageFactoryOptions & { timeoutMs?: number },
): ProtocolRequestEnvelope<EvaluateJavaScriptParameters> {
  return createBrowserInteractionRequest(
    sessionId,
    BROWSER_EVALUATE_ACTION,
    parameters,
    `Execute policy-constrained ${parameters.mode} JavaScript after an explicit user instruction`,
    options,
  );
}

export function createEvaluateJavaScriptResponse(
  request: ProtocolRequestEnvelope<EvaluateJavaScriptParameters>,
  data: EvaluateJavaScriptData,
  options?: MessageFactoryOptions & { startedAt?: Date },
): ProtocolResponseEnvelope<EvaluateJavaScriptData> {
  return createTimedSuccessResponse(request, data, options);
}

export function createMutateDomRequest(
  sessionId: string,
  parameters: MutateDomParameters,
  options?: MessageFactoryOptions & { timeoutMs?: number },
): ProtocolRequestEnvelope<MutateDomParameters> {
  return createBrowserInteractionRequest(
    sessionId,
    BROWSER_MUTATE_DOM_ACTION,
    parameters,
    "Apply explicitly authorized, revision-bound DOM and inline-style mutations",
    options,
  );
}

export function createMutateDomResponse(
  request: ProtocolRequestEnvelope<MutateDomParameters>,
  data: MutateDomData,
  options?: MessageFactoryOptions & { startedAt?: Date },
): ProtocolResponseEnvelope<MutateDomData> {
  return createTimedSuccessResponse(request, data, options);
}

export function createInspectElementRequest(
  sessionId: string,
  parameters: InspectElementParameters,
  options?: MessageFactoryOptions & { timeoutMs?: number },
): ProtocolRequestEnvelope<InspectElementParameters> {
  return createBrowserInteractionRequest(
    sessionId,
    BROWSER_INSPECT_ELEMENT_ACTION,
    parameters,
    "Inspect element state, styles, event listeners, and bounded listener source excerpts",
    options,
  );
}

export function createInspectElementResponse(
  request: ProtocolRequestEnvelope<InspectElementParameters>,
  data: InspectElementData,
  options?: MessageFactoryOptions & { startedAt?: Date },
): ProtocolResponseEnvelope<InspectElementData> {
  return createTimedSuccessResponse(request, data, options);
}

export function createManageCssRequest(
  sessionId: string,
  parameters: ManageCssParameters,
  options?: MessageFactoryOptions & { timeoutMs?: number },
): ProtocolRequestEnvelope<ManageCssParameters> {
  return createBrowserInteractionRequest(
    sessionId,
    BROWSER_MANAGE_CSS_ACTION,
    parameters,
    `${parameters.operation === "add" ? "Inject" : "Remove"} explicitly authorized CSS`,
    options,
  );
}

export function createManageCssResponse(
  request: ProtocolRequestEnvelope<ManageCssParameters>,
  data: ManageCssData,
  options?: MessageFactoryOptions & { startedAt?: Date },
): ProtocolResponseEnvelope<ManageCssData> {
  return createTimedSuccessResponse(request, data, options);
}

export function createObserveEventsRequest(
  sessionId: string,
  parameters: ObserveEventsParameters,
  options?: MessageFactoryOptions & { timeoutMs?: number },
): ProtocolRequestEnvelope<ObserveEventsParameters> {
  return createBrowserInteractionRequest(
    sessionId,
    BROWSER_OBSERVE_EVENTS_ACTION,
    parameters,
    `${parameters.operation} a bounded, value-redacted DOM event capture`,
    options,
  );
}

export function createObserveEventsResponse(
  request: ProtocolRequestEnvelope<ObserveEventsParameters>,
  data: ObserveEventsData,
  options?: MessageFactoryOptions & { startedAt?: Date },
): ProtocolResponseEnvelope<ObserveEventsData> {
  return createTimedSuccessResponse(request, data, options);
}

export function createExecuteJavaScriptRequest(
  sessionId: string,
  parameters: ExecuteJavaScriptParameters,
  options?: MessageFactoryOptions & { timeoutMs?: number },
): ProtocolRequestEnvelope<ExecuteJavaScriptParameters> {
  return createBrowserInteractionRequest(
    sessionId,
    BROWSER_EXECUTE_JAVASCRIPT_ACTION,
    parameters,
    "Execute explicitly authorized raw JavaScript through a short-lived debugger session",
    { ...options, timeoutMs: options?.timeoutMs ?? parameters.timeoutMs + 2_000 },
  );
}

export function createExecuteJavaScriptResponse(
  request: ProtocolRequestEnvelope<ExecuteJavaScriptParameters>,
  data: ExecuteJavaScriptData,
  options?: MessageFactoryOptions & { startedAt?: Date },
): ProtocolResponseEnvelope<ExecuteJavaScriptData> {
  return createTimedSuccessResponse(request, data, options);
}

export function createBrowserConsoleRequest(
  sessionId: string,
  parameters: BrowserConsoleParameters,
  options?: MessageFactoryOptions & { timeoutMs?: number },
): ProtocolRequestEnvelope<BrowserConsoleParameters> {
  return createBrowserInteractionRequest(
    sessionId,
    BROWSER_CONSOLE_ACTION,
    parameters,
    `${parameters.operation} bounded, redacted browser-console capture`,
    options,
  );
}

export function createBrowserConsoleResponse(
  request: ProtocolRequestEnvelope<BrowserConsoleParameters>,
  data: BrowserConsoleData,
  options?: MessageFactoryOptions & { startedAt?: Date },
): ProtocolResponseEnvelope<BrowserConsoleData> {
  return createTimedSuccessResponse(request, data, options);
}

export function createNetworkCaptureRequest(
  sessionId: string,
  parameters: NetworkCaptureParameters,
  options?: MessageFactoryOptions & { timeoutMs?: number },
): ProtocolRequestEnvelope<NetworkCaptureParameters> {
  return createBrowserInteractionRequest(
    sessionId,
    BROWSER_NETWORK_ACTION,
    parameters,
    `${parameters.operation} bounded metadata-only network capture`,
    options,
  );
}

export function createNetworkCaptureResponse(
  request: ProtocolRequestEnvelope<NetworkCaptureParameters>,
  data: NetworkCaptureData,
  options?: MessageFactoryOptions & { startedAt?: Date },
): ProtocolResponseEnvelope<NetworkCaptureData> {
  return createTimedSuccessResponse(request, data, options);
}

export function createDeviceEmulationRequest(
  sessionId: string,
  parameters: DeviceEmulationParameters,
  options?: MessageFactoryOptions & { timeoutMs?: number },
): ProtocolRequestEnvelope<DeviceEmulationParameters> {
  return createBrowserInteractionRequest(
    sessionId,
    BROWSER_EMULATE_DEVICE_ACTION,
    parameters,
    `${parameters.operation} reversible mobile viewport and touch emulation`,
    options,
  );
}

export function createDeviceEmulationResponse(
  request: ProtocolRequestEnvelope<DeviceEmulationParameters>,
  data: DeviceEmulationData,
  options?: MessageFactoryOptions & { startedAt?: Date },
): ProtocolResponseEnvelope<DeviceEmulationData> {
  return createTimedSuccessResponse(request, data, options);
}

export function createScreenshotRequest(
  sessionId: string,
  parameters: CaptureScreenshotParameters,
  options?: MessageFactoryOptions & { timeoutMs?: number },
): ProtocolRequestEnvelope<CaptureScreenshotParameters> {
  return createBrowserInteractionRequest(
    sessionId,
    BROWSER_SCREENSHOT_ACTION,
    parameters,
    "Capture a bounded JPEG of a viewport, element, region, or full page with optional annotations",
    options,
  );
}

export function createScreenshotResponse(
  request: ProtocolRequestEnvelope<CaptureScreenshotParameters>,
  data: CaptureScreenshotData,
  options?: MessageFactoryOptions & { startedAt?: Date },
): ProtocolResponseEnvelope<CaptureScreenshotData> {
  return createTimedSuccessResponse(request, data, options);
}

export function createClickAtRequest(
  sessionId: string,
  parameters: ClickAtParameters,
  options?: MessageFactoryOptions & { timeoutMs?: number },
): ProtocolRequestEnvelope<ClickAtParameters> {
  return createBrowserInteractionRequest(
    sessionId,
    BROWSER_CLICK_AT_ACTION,
    parameters,
    "Dispatch a guarded synthetic pointer click at revision-bound viewport coordinates",
    options,
  );
}

export function createClickAtResponse(
  request: ProtocolRequestEnvelope<ClickAtParameters>,
  data: ClickAtData,
  options?: MessageFactoryOptions & { startedAt?: Date },
): ProtocolResponseEnvelope<ClickAtData> {
  return createTimedSuccessResponse(request, data, options);
}

export function createPerformGestureRequest(
  sessionId: string,
  parameters: PerformGestureParameters,
  options?: MessageFactoryOptions & { timeoutMs?: number },
): ProtocolRequestEnvelope<PerformGestureParameters> {
  return createBrowserInteractionRequest(
    sessionId,
    BROWSER_PERFORM_GESTURE_ACTION,
    parameters,
    `Perform revision-bound ${parameters.operation} gesture`,
    options,
  );
}

export function createPerformGestureResponse(
  request: ProtocolRequestEnvelope<PerformGestureParameters>,
  data: PerformGestureData,
  options?: MessageFactoryOptions & { startedAt?: Date },
): ProtocolResponseEnvelope<PerformGestureData> {
  return createTimedSuccessResponse(request, data, options);
}

export function createGetTerminalsRequest(
  sessionId: string,
  parameters: GetTerminalsParameters,
  options?: MessageFactoryOptions & { timeoutMs?: number },
): ProtocolRequestEnvelope<GetTerminalsParameters> {
  return createBrowserInteractionRequest(
    sessionId,
    BROWSER_GET_TERMINALS_ACTION,
    parameters,
    "Detect supported terminal widgets without reading terminal output",
    options,
  );
}

export function createGetTerminalsResponse(
  request: ProtocolRequestEnvelope<GetTerminalsParameters>,
  data: GetTerminalsData,
  options?: MessageFactoryOptions & { startedAt?: Date },
): ProtocolResponseEnvelope<GetTerminalsData> {
  return createTimedSuccessResponse(request, data, options);
}

export function createReadTerminalRequest(
  sessionId: string,
  parameters: ReadTerminalParameters,
  options?: MessageFactoryOptions & { timeoutMs?: number },
): ProtocolRequestEnvelope<ReadTerminalParameters> {
  return createBrowserInteractionRequest(
    sessionId,
    BROWSER_READ_TERMINAL_ACTION,
    parameters,
    "Read explicitly authorized, bounded, redacted terminal output",
    { ...options, timeoutMs: options?.timeoutMs ?? parameters.timeoutMs + 5_000 },
  );
}

export function createReadTerminalResponse(
  request: ProtocolRequestEnvelope<ReadTerminalParameters>,
  data: TerminalReadData,
  options?: MessageFactoryOptions & { startedAt?: Date },
): ProtocolResponseEnvelope<TerminalReadData> {
  return createTimedSuccessResponse(request, data, options);
}

export function createTerminalInputRequest(
  sessionId: string,
  parameters: TerminalInputParameters,
  options?: MessageFactoryOptions & { timeoutMs?: number },
): ProtocolRequestEnvelope<TerminalInputParameters> {
  return createBrowserInteractionRequest(
    sessionId,
    BROWSER_TERMINAL_INPUT_ACTION,
    parameters,
    "Send explicitly authorized trusted keyboard input to one revision-bound terminal",
    { ...options, timeoutMs: options?.timeoutMs ?? parameters.timeoutMs + 5_000 },
  );
}

export function createTerminalInputResponse(
  request: ProtocolRequestEnvelope<TerminalInputParameters>,
  data: TerminalInputData,
  options?: MessageFactoryOptions & { startedAt?: Date },
): ProtocolResponseEnvelope<TerminalInputData> {
  return createTimedSuccessResponse(request, data, options);
}

export function createPrintToPdfRequest(
  sessionId: string,
  parameters: PrintToPdfParameters,
  options?: MessageFactoryOptions & { timeoutMs?: number },
): ProtocolRequestEnvelope<PrintToPdfParameters> {
  return createBrowserInteractionRequest(
    sessionId,
    BROWSER_PRINT_TO_PDF_ACTION,
    parameters,
    "Export the current page as a bounded PDF document",
    { ...options, timeoutMs: options?.timeoutMs ?? 30_000 },
  );
}

export function createPrintToPdfResponse(
  request: ProtocolRequestEnvelope<PrintToPdfParameters>,
  data: PrintToPdfData,
  options?: MessageFactoryOptions & { startedAt?: Date },
): ProtocolResponseEnvelope<PrintToPdfData> {
  return createTimedSuccessResponse(request, data, options);
}

export function createPageApiRequest(
  sessionId: string,
  parameters: PageApiRequestParameters,
  options?: MessageFactoryOptions & { timeoutMs?: number },
): ProtocolRequestEnvelope<PageApiRequestParameters> {
  return createBrowserInteractionRequest(
    sessionId,
    BROWSER_PAGE_API_REQUEST_ACTION,
    parameters,
    "Perform one explicitly authorized same-origin page API request without exposing credentials",
    { ...options, timeoutMs: options?.timeoutMs ?? 30_000 },
  );
}

export function createPageApiResponse(
  request: ProtocolRequestEnvelope<PageApiRequestParameters>,
  data: PageApiRequestData,
  options?: MessageFactoryOptions & { startedAt?: Date },
): ProtocolResponseEnvelope<PageApiRequestData> {
  return createTimedSuccessResponse(request, data, options);
}

export function createHttpAuthStateRequest(
  sessionId: string,
  parameters: HttpAuthStateParameters,
  options?: MessageFactoryOptions & { timeoutMs?: number },
): ProtocolRequestEnvelope<HttpAuthStateParameters> {
  return createBrowserInteractionRequest(
    sessionId,
    BROWSER_GET_HTTP_AUTH_STATE_ACTION,
    parameters,
    "Inspect sanitized HTTP authentication challenge state",
    options,
  );
}

export function createHttpAuthStateResponse(
  request: ProtocolRequestEnvelope<HttpAuthStateParameters>,
  data: HttpAuthStateData,
  options?: MessageFactoryOptions & { startedAt?: Date },
): ProtocolResponseEnvelope<HttpAuthStateData> {
  return createTimedSuccessResponse(request, data, options);
}

export function createAuthenticateHttpRequest(
  sessionId: string,
  parameters: AuthenticateHttpParameters,
  options?: MessageFactoryOptions & { timeoutMs?: number },
): ProtocolRequestEnvelope<AuthenticateHttpParameters> {
  return createBrowserInteractionRequest(
    sessionId,
    BROWSER_AUTHENTICATE_HTTP_ACTION,
    parameters,
    "Use one ephemeral credential pair for one Basic HTTP authentication challenge",
    { ...options, timeoutMs: options?.timeoutMs ?? parameters.timeoutMs + 2_000 },
  );
}

export function createAuthenticateHttpResponse(
  request: ProtocolRequestEnvelope<AuthenticateHttpParameters>,
  data: AuthenticateHttpData,
  options?: MessageFactoryOptions & { startedAt?: Date },
): ProtocolResponseEnvelope<AuthenticateHttpData> {
  return createTimedSuccessResponse(request, data, options);
}

export function createHandleJavaScriptDialogRequest(
  sessionId: string,
  parameters: HandleJavaScriptDialogParameters,
  options?: MessageFactoryOptions & { timeoutMs?: number },
): ProtocolRequestEnvelope<HandleJavaScriptDialogParameters> {
  return createBrowserInteractionRequest(
    sessionId,
    BROWSER_HANDLE_JAVASCRIPT_DIALOG_ACTION,
    parameters,
    `${parameters.accept ? "Accept" : "Dismiss"} one native JavaScript dialog`,
    { ...options, timeoutMs: options?.timeoutMs ?? parameters.timeoutMs + 2_000 },
  );
}

export function createHandleJavaScriptDialogResponse(
  request: ProtocolRequestEnvelope<HandleJavaScriptDialogParameters>,
  data: HandleJavaScriptDialogData,
  options?: MessageFactoryOptions & { startedAt?: Date },
): ProtocolResponseEnvelope<HandleJavaScriptDialogData> {
  return createTimedSuccessResponse(request, data, options);
}

function createTimedSuccessResponse<T>(
  request: ProtocolRequestEnvelope,
  data: T,
  options?: MessageFactoryOptions & { startedAt?: Date },
): ProtocolResponseEnvelope<T> {
  const completedAt = options?.now ?? new Date();
  const startedAt = options?.startedAt ?? completedAt;
  return {
    protocol: IBP_PROTOCOL,
    version: IBP_VERSION,
    messageId: messageId(options),
    sessionId: request.sessionId,
    timestamp: completedAt.toISOString(),
    direction: "response",
    type: "ibp.response",
    correlationId: request.messageId,
    payload: {
      success: true,
      data,
      timing: {
        startedAt: startedAt.toISOString(),
        completedAt: completedAt.toISOString(),
        durationMs: Math.max(0, completedAt.getTime() - startedAt.getTime()),
      },
    },
  };
}

export function createErrorResponse(
  request: ProtocolRequestEnvelope,
  error: Omit<ProtocolError, "code"> & { code: IbpErrorCode | string },
  options?: MessageFactoryOptions,
): ProtocolResponseEnvelope {
  return {
    protocol: IBP_PROTOCOL,
    version: IBP_VERSION,
    messageId: messageId(options),
    sessionId: request.sessionId,
    timestamp: timestamp(options),
    direction: "response",
    type: "ibp.response",
    correlationId: request.messageId,
    payload: {
      success: false,
      error,
    },
  };
}

export function createUnsupportedActionResponse(
  request: ProtocolRequestEnvelope,
  options?: MessageFactoryOptions,
): ProtocolResponseEnvelope {
  return createErrorResponse(
    request,
    {
      code: IBP_ERROR_CODES.UNSUPPORTED_ACTION,
      message: `Unsupported action: ${request.payload.action}`,
      retryable: false,
    },
    options,
  );
}

export function createHeartbeatEvent(
  sessionId: string,
  component: "extension" | "native-host" | "desktop",
  options?: MessageFactoryOptions,
): ProtocolEventEnvelope<{ component: typeof component; status: "alive" }> {
  return {
    protocol: IBP_PROTOCOL,
    version: IBP_VERSION,
    messageId: messageId(options),
    sessionId,
    timestamp: timestamp(options),
    direction: "event",
    type: "ibp.event",
    payload: {
      event: SYSTEM_HEARTBEAT_EVENT,
      data: { component, status: "alive" },
    },
  };
}

export function createGetFigmaDocumentRequest(
  sessionId: string,
  parameters: GetFigmaDocumentParameters,
  options?: MessageFactoryOptions & { timeoutMs?: number },
): ProtocolRequestEnvelope<GetFigmaDocumentParameters> {
  return createBrowserInteractionRequest(
    sessionId,
    BROWSER_GET_FIGMA_DOCUMENT_ACTION,
    parameters,
    "Read the page list, mode, and current selection of an open Figma design file",
    options,
  );
}

export function createGetFigmaDocumentResponse(
  request: ProtocolRequestEnvelope<GetFigmaDocumentParameters>,
  data: GetFigmaDocumentData,
  options?: MessageFactoryOptions & { startedAt?: Date },
): ProtocolResponseEnvelope<GetFigmaDocumentData> {
  return createTimedSuccessResponse(request, data, options);
}

export function createGetFigmaLayersRequest(
  sessionId: string,
  parameters: GetFigmaLayersParameters,
  options?: MessageFactoryOptions & { timeoutMs?: number },
): ProtocolRequestEnvelope<GetFigmaLayersParameters> {
  return createBrowserInteractionRequest(
    sessionId,
    BROWSER_GET_FIGMA_LAYERS_ACTION,
    parameters,
    "Read the rendered rows of the Figma layer tree for the current page",
    options,
  );
}

export function createGetFigmaLayersResponse(
  request: ProtocolRequestEnvelope<GetFigmaLayersParameters>,
  data: GetFigmaLayersData,
  options?: MessageFactoryOptions & { startedAt?: Date },
): ProtocolResponseEnvelope<GetFigmaLayersData> {
  return createTimedSuccessResponse(request, data, options);
}

export function createGetFigmaPropertiesRequest(
  sessionId: string,
  parameters: GetFigmaPropertiesParameters,
  options?: MessageFactoryOptions & { timeoutMs?: number },
): ProtocolRequestEnvelope<GetFigmaPropertiesParameters> {
  return createBrowserInteractionRequest(
    sessionId,
    BROWSER_GET_FIGMA_PROPERTIES_ACTION,
    parameters,
    "Read the properties of the current Figma selection, preferring Dev Mode CSS",
    options,
  );
}

export function createGetFigmaPropertiesResponse(
  request: ProtocolRequestEnvelope<GetFigmaPropertiesParameters>,
  data: GetFigmaPropertiesData,
  options?: MessageFactoryOptions & { startedAt?: Date },
): ProtocolResponseEnvelope<GetFigmaPropertiesData> {
  return createTimedSuccessResponse(request, data, options);
}

export function createFigmaSelectRequest(
  sessionId: string,
  parameters: FigmaSelectParameters,
  options?: MessageFactoryOptions & { timeoutMs?: number },
): ProtocolRequestEnvelope<FigmaSelectParameters> {
  return createBrowserInteractionRequest(
    sessionId,
    BROWSER_FIGMA_SELECT_ACTION,
    parameters,
    "Switch the Figma page, mode, or selected layer through its own controls",
    options,
  );
}

export function createFigmaSelectResponse(
  request: ProtocolRequestEnvelope<FigmaSelectParameters>,
  data: FigmaSelectData,
  options?: MessageFactoryOptions & { startedAt?: Date },
): ProtocolResponseEnvelope<FigmaSelectData> {
  return createTimedSuccessResponse(request, data, options);
}

export function createFigmaHealthcheckRequest(
  sessionId: string,
  parameters: FigmaHealthcheckParameters,
  options?: MessageFactoryOptions & { timeoutMs?: number },
): ProtocolRequestEnvelope<FigmaHealthcheckParameters> {
  return createBrowserInteractionRequest(
    sessionId,
    BROWSER_FIGMA_HEALTHCHECK_ACTION,
    parameters,
    "Verify that every Figma UI anchor the adapter depends on still resolves",
    options,
  );
}

export function createFigmaHealthcheckResponse(
  request: ProtocolRequestEnvelope<FigmaHealthcheckParameters>,
  data: FigmaHealthcheckData,
  options?: MessageFactoryOptions & { startedAt?: Date },
): ProtocolResponseEnvelope<FigmaHealthcheckData> {
  return createTimedSuccessResponse(request, data, options);
}
