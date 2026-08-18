import { createHash, randomUUID } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import { access, realpath, stat } from "node:fs/promises";
import { isAbsolute } from "node:path";

import { InMemoryAuditLog, type AuditLog, type AuditResult } from "@invictum/audit-log";
import {
  DefaultPolicyEngine,
  type PolicyDecision,
  type PolicyEngine,
  analyzeJavaScriptExpression,
} from "@invictum/policy-engine";
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
  createClickRequest,
  createFindElementsRequest,
  createFindNaturalLanguageRequest,
  createTypeTextRequest,
  createSetFileInputFilesRequest,
  createListTabsRequest,
  createUnlockTabRequest,
  createPageSnapshotRequest,
  createPageTextRequest,
  createSelectOptionRequest,
  createSetCheckedRequest,
  createSubmitFormRequest,
  createGetWordPressMenuRequest,
  createEditWordPressMenuRequest,
  createGetWordPressAdminRequest,
  createWordPressListTableActionRequest,
  createGetWordPressEditorRequest,
  createEditWordPressEditorRequest,
  createEvaluateJavaScriptRequest,
  createMutateDomRequest,
  createInspectElementRequest,
  createManageCssRequest,
  createObserveEventsRequest,
  createExecuteJavaScriptRequest,
  createScreenshotRequest,
  createClickAtRequest,
  createHttpAuthStateRequest,
  createAuthenticateHttpRequest,
  createHandleJavaScriptDialogRequest,
  createBrowserConsoleRequest,
  createNetworkCaptureRequest,
  createDeviceEmulationRequest,
  createPerformGestureRequest,
  createPrintToPdfRequest,
  createPageApiRequest,
  createPingRequest,
  createCapabilitiesRequest,
  createOpenTabRequest,
  createCloseTabRequest,
  createNavigateRequest,
  createHistoryNavigationRequest,
  createActivateTabRequest,
  createWaitForRequest,
  createSetControlIdentityRequest,
  IBP_ERROR_CODES,
  IbpProtocolError,
  ListTabsDataSchema,
  UnlockTabDataSchema,
  UnlockTabParametersSchema,
  FindElementsDataSchema,
  FindElementsParametersSchema,
  FindNaturalLanguageDataSchema,
  FindNaturalLanguageParametersSchema,
  GetPageSnapshotParametersSchema,
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
  parseIbpEnvelope,
  PendingRequestRegistry,
  SystemPongDataSchema,
  SystemCapabilitiesDataSchema,
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
  type ListTabsData,
  type UnlockTabData,
  type UnlockTabParameters,
  type FindElementsData,
  type FindElementsInput,
  type FindElementsParameters,
  type FindNaturalLanguageData,
  type FindNaturalLanguageInput,
  type ClickElementData,
  type ClickElementInput,
  type ClickElementParameters,
  type GetPageSnapshotInput,
  type GetPageSnapshotParameters,
  type PageSnapshot,
  type GetPageTextData,
  type GetPageTextInput,
  type SystemPongData,
  type SystemCapabilitiesData,
  type OpenTabData,
  type OpenTabInput,
  type OpenTabParameters,
  type CloseTabData,
  type CloseTabInput,
  type NavigateData,
  type NavigateInput,
  type NavigateParameters,
  type HistoryNavigationData,
  type HistoryNavigationInput,
  type ActivateTabData,
  type ActivateTabParameters,
  type WaitForData,
  type WaitForInput,
  type WaitForParameters,
  type SetControlIdentityData,
  type SetControlIdentityParameters,
  type TypeTextData,
  type TypeTextInput,
  type TypeTextParameters,
  type SetFileInputFilesData,
  type SetFileInputFilesInput,
  type SetFileInputFilesParameters,
  type SelectOptionData,
  type SelectOptionInput,
  type SelectOptionParameters,
  type SetCheckedData,
  type SetCheckedParameters,
  type SubmitFormData,
  type SubmitFormParameters,
  type GetWordPressMenuData,
  type GetWordPressMenuInput,
  type EditWordPressMenuData,
  type EditWordPressMenuInput,
  type GetWordPressAdminData,
  type GetWordPressAdminInput,
  type WordPressListTableActionData,
  type WordPressListTableActionInput,
  type GetWordPressEditorData,
  type GetWordPressEditorInput,
  type EditWordPressEditorData,
  type EditWordPressEditorInput,
  type EvaluateJavaScriptData,
  type EvaluateJavaScriptInput,
  type EvaluateJavaScriptParameters,
  type MutateDomData,
  type MutateDomInput,
  type InspectElementData,
  type InspectElementInput,
  type ManageCssData,
  type ManageCssInput,
  type ObserveEventsData,
  type ObserveEventsInput,
  type ExecuteJavaScriptData,
  type ExecuteJavaScriptInput,
  type CaptureScreenshotData,
  type CaptureScreenshotInput,
  type CaptureScreenshotParameters,
  type ClickAtData,
  type ClickAtParameters,
  type HttpAuthStateData,
  type HttpAuthStateParameters,
  type AuthenticateHttpData,
  type AuthenticateHttpInput,
  type HandleJavaScriptDialogData,
  type HandleJavaScriptDialogInput,
  type BrowserConsoleData,
  type BrowserConsoleInput,
  type NetworkCaptureData,
  type NetworkCaptureInput,
  type DeviceEmulationData,
  type DeviceEmulationInput,
  type PerformGestureData,
  type PerformGestureInput,
  type PrintToPdfData,
  type PrintToPdfInput,
  type PageApiRequestData,
  type PageApiRequestInput,
  type JsonValue,
} from "@invictum/protocol";
import WebSocket, { WebSocketServer } from "ws";

export interface DesktopBridgeServerOptions {
  host?: string;
  port?: number;
  path?: string;
  requestTimeoutMs?: number;
  policyEngine?: PolicyEngine;
  auditLog?: AuditLog;
}

export interface BrowserOperationContext {
  sessionId: string;
  agentId: string;
  clientId: string;
  sessionAuthorized: boolean;
}

export interface DesktopBridgeAddress {
  host: string;
  port: number;
  path: string;
  url: string;
}

const FIND_ELEMENTS_CRITERIA = [
  "text",
  "regex",
  "role",
  "name",
  "label",
  "placeholder",
  "title",
  "alt",
  "css",
  "xpath",
  "testId",
  "tag",
  "inputType",
  "visible",
  "enabled",
  "frameId",
  "proximity",
  "table",
  "parent",
] as const;

const auditDomainFor = (url: string, fallback: string): string => {
  try {
    return new URL(url).hostname || fallback;
  } catch {
    return fallback;
  }
};

const sanitizeNavigationUrl = (rawUrl: string): string => {
  const parsed = new URL(rawUrl);
  parsed.username = "";
  parsed.password = "";
  for (const key of [...parsed.searchParams.keys()]) {
    parsed.searchParams.set(key, "[REDACTED]");
  }
  parsed.hash = "";
  return parsed.toString().slice(0, 4_096);
};

export class DesktopBridgeServer {
  readonly #host: string;
  readonly #requestedPort: number;
  readonly #path: string;
  readonly #requestTimeoutMs: number;
  readonly #policyEngine: PolicyEngine;
  readonly #auditLog: AuditLog;
  readonly #pending = new PendingRequestRegistry<ProtocolResponseEnvelope>();
  readonly #connectionWaiters = new Set<{
    resolve: () => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }>();
  #server: WebSocketServer | undefined;
  #socket: WebSocket | undefined;
  #address: DesktopBridgeAddress | undefined;

  public constructor(options: DesktopBridgeServerOptions = {}) {
    this.#host = options.host ?? "127.0.0.1";
    this.#requestedPort = options.port ?? 47_821;
    this.#path = options.path ?? "/native";
    this.#requestTimeoutMs = options.requestTimeoutMs ?? 5_000;
    this.#policyEngine = options.policyEngine ?? new DefaultPolicyEngine();
    this.#auditLog = options.auditLog ?? new InMemoryAuditLog();
  }

  public async start(): Promise<DesktopBridgeAddress> {
    if (this.#server !== undefined) {
      throw new Error("Desktop bridge server is already running");
    }

    const server = new WebSocketServer({
      host: this.#host,
      port: this.#requestedPort,
      maxPayload: 1024 * 1024,
    });
    this.#server = server;

    server.on("connection", (socket, request) => {
      if (request.url !== this.#path) {
        socket.close(1008, "Invalid bridge path");
        return;
      }
      if (this.#socket !== undefined && this.#socket.readyState === WebSocket.OPEN) {
        this.#socket.close(4000, "Replaced by a newer native host connection");
      }
      this.#socket = socket;
      this.#resolveConnectionWaiters();

      socket.on("message", (data, isBinary) => {
        if (isBinary) {
          socket.close(1003, "Binary IBP messages are not supported");
          return;
        }
        this.#handleMessage(data.toString());
      });
      socket.once("close", () => {
        if (this.#socket === socket) {
          this.#socket = undefined;
        }
      });
    });

    await new Promise<void>((resolve, reject) => {
      const handleListening = (): void => {
        server.off("error", handleError);
        resolve();
      };
      const handleError = (error: Error): void => {
        server.off("listening", handleListening);
        reject(error);
      };
      server.once("listening", handleListening);
      server.once("error", handleError);
    });

    const address = server.address();
    if (address === null || typeof address === "string") {
      throw new Error("Desktop bridge did not bind to a TCP port");
    }
    this.#address = {
      host: this.#host,
      port: address.port,
      path: this.#path,
      url: `ws://${this.#host}:${address.port}${this.#path}`,
    };
    return this.#address;
  }

  public async stop(): Promise<void> {
    const server = this.#server;
    this.#server = undefined;
    this.#address = undefined;
    const socket = this.#socket;
    this.#socket = undefined;
    socket?.close(1001, "Desktop bridge shutting down");

    this.#pending.rejectAll(
      new IbpProtocolError(
        IBP_ERROR_CODES.NATIVE_HOST_UNAVAILABLE,
        "Desktop bridge stopped before the response arrived",
        true,
      ),
    );
    this.#rejectConnectionWaiters(new Error("Desktop bridge stopped"));

    if (server !== undefined) {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error !== undefined) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    }
  }

  public async waitForConnection(timeoutMs = 5_000): Promise<void> {
    if (this.connected) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      const waiter = {
        resolve,
        reject,
        timer: setTimeout(() => {
          this.#connectionWaiters.delete(waiter);
          reject(new Error(`Native host did not connect within ${timeoutMs} ms`));
        }, timeoutMs),
      };
      this.#connectionWaiters.add(waiter);
    });
  }

  public async ping(sessionId: string = randomUUID()): Promise<SystemPongData> {
    const response = await this.#request(createPingRequest(sessionId));
    if (!response.payload.success) {
      throw new IbpProtocolError(
        IBP_ERROR_CODES.INVALID_MESSAGE,
        response.payload.error?.message ?? "Ping failed without a structured error",
        response.payload.error?.retryable ?? false,
      );
    }
    return SystemPongDataSchema.parse(response.payload.data);
  }

  public async capabilities(sessionId: string = randomUUID()): Promise<SystemCapabilitiesData> {
    const response = await this.#request(createCapabilitiesRequest(sessionId));
    if (!response.payload.success) {
      throw new IbpProtocolError(
        response.payload.error?.code ?? IBP_ERROR_CODES.INVALID_MESSAGE,
        response.payload.error?.message ?? "Capability discovery failed without a structured error",
        response.payload.error?.retryable ?? false,
      );
    }
    return SystemCapabilitiesDataSchema.parse(response.payload.data);
  }

  public async listTabs(context: BrowserOperationContext): Promise<ListTabsData> {
    const startedAt = Date.now();
    const policyDecision = this.#policyEngine.evaluate({
      action: BROWSER_LIST_TABS_ACTION,
      sessionAuthorized: context.sessionAuthorized,
    });

    if (policyDecision.outcome !== "allow") {
      this.#recordListTabsAudit(context, policyDecision, "denied", startedAt);
      throw new IbpProtocolError(
        policyDecision.errorCode ?? IBP_ERROR_CODES.POLICY_DENIED,
        policyDecision.reason,
        false,
      );
    }

    try {
      const response = await this.#request(createListTabsRequest(context.sessionId));
      if (!response.payload.success) {
        throw new IbpProtocolError(
          response.payload.error?.code ?? IBP_ERROR_CODES.BROWSER_API_ERROR,
          response.payload.error?.message ?? "Chrome tab enumeration failed",
          response.payload.error?.retryable ?? false,
        );
      }
      const data = ListTabsDataSchema.parse(response.payload.data);
      this.#recordListTabsAudit(context, policyDecision, "success", startedAt);
      return data;
    } catch (error) {
      const result: AuditResult =
        error instanceof IbpProtocolError &&
        (error.code === IBP_ERROR_CODES.PERMISSION_DENIED ||
          error.code === IBP_ERROR_CODES.POLICY_DENIED ||
          error.code === IBP_ERROR_CODES.SESSION_UNAUTHORIZED)
          ? "denied"
          : error instanceof IbpProtocolError && error.code === IBP_ERROR_CODES.CANCELLED
            ? "cancelled"
            : "failure";
      this.#recordListTabsAudit(context, policyDecision, result, startedAt);
      throw error;
    }
  }

  public async openTab(
    context: BrowserOperationContext,
    input: OpenTabInput,
  ): Promise<OpenTabData> {
    const parameters = OpenTabParametersSchema.parse(input);
    const startedAt = Date.now();
    const policyDecision = this.#policyEngine.evaluate({
      action: BROWSER_OPEN_TAB_ACTION,
      sessionAuthorized: context.sessionAuthorized,
    });
    if (policyDecision.outcome !== "allow") {
      this.#recordNavigationAudit(
        context,
        BROWSER_OPEN_TAB_ACTION,
        parameters,
        policyDecision,
        "denied",
        startedAt,
      );
      throw new IbpProtocolError(
        policyDecision.errorCode ?? IBP_ERROR_CODES.POLICY_DENIED,
        policyDecision.reason,
        false,
      );
    }
    try {
      const response = await this.#request(createOpenTabRequest(context.sessionId, parameters));
      if (!response.payload.success) {
        throw new IbpProtocolError(
          response.payload.error?.code ?? IBP_ERROR_CODES.BROWSER_API_ERROR,
          response.payload.error?.message ?? "Chrome tab opening failed",
          response.payload.error?.retryable ?? false,
        );
      }
      const data = OpenTabDataSchema.parse(response.payload.data);
      this.#recordNavigationAudit(
        context,
        BROWSER_OPEN_TAB_ACTION,
        parameters,
        policyDecision,
        "success",
        startedAt,
        data.tab.tabId,
        data.tab.url,
        data.tab.origin,
      );
      return data;
    } catch (error) {
      this.#recordNavigationAudit(
        context,
        BROWSER_OPEN_TAB_ACTION,
        parameters,
        policyDecision,
        this.#auditResultForError(error),
        startedAt,
      );
      throw error;
    }
  }

  public async closeTab(
    context: BrowserOperationContext,
    input: CloseTabInput,
  ): Promise<CloseTabData> {
    const parameters = CloseTabParametersSchema.parse(input);
    return this.#runAdvancedAction(
      context,
      BROWSER_CLOSE_TAB_ACTION,
      createCloseTabRequest(context.sessionId, parameters),
      (value) => CloseTabDataSchema.parse(value),
      {
        tabId: parameters.tabId,
        authorizationSource: parameters.authorization.source,
      },
      parameters.authorization.instructionId,
    );
  }

  public async navigate(
    context: BrowserOperationContext,
    input: NavigateInput,
  ): Promise<NavigateData> {
    const parameters = NavigateParametersSchema.parse(input);
    const startedAt = Date.now();
    const policyDecision = this.#policyEngine.evaluate({
      action: BROWSER_NAVIGATE_ACTION,
      sessionAuthorized: context.sessionAuthorized,
    });
    if (policyDecision.outcome !== "allow") {
      this.#recordNavigationAudit(
        context,
        BROWSER_NAVIGATE_ACTION,
        parameters,
        policyDecision,
        "denied",
        startedAt,
        parameters.tabId,
      );
      throw new IbpProtocolError(
        policyDecision.errorCode ?? IBP_ERROR_CODES.POLICY_DENIED,
        policyDecision.reason,
        false,
      );
    }
    try {
      const response = await this.#request(createNavigateRequest(context.sessionId, parameters));
      if (!response.payload.success) {
        throw new IbpProtocolError(
          response.payload.error?.code ?? IBP_ERROR_CODES.BROWSER_API_ERROR,
          response.payload.error?.message ?? "Chrome tab navigation failed",
          response.payload.error?.retryable ?? false,
        );
      }
      const data = NavigateDataSchema.parse(response.payload.data);
      this.#recordNavigationAudit(
        context,
        BROWSER_NAVIGATE_ACTION,
        parameters,
        policyDecision,
        "success",
        startedAt,
        data.tab.tabId,
        data.tab.url,
        data.tab.origin,
      );
      return data;
    } catch (error) {
      this.#recordNavigationAudit(
        context,
        BROWSER_NAVIGATE_ACTION,
        parameters,
        policyDecision,
        this.#auditResultForError(error),
        startedAt,
        parameters.tabId,
      );
      throw error;
    }
  }

  public async navigateHistory(
    context: BrowserOperationContext,
    direction: "back" | "forward",
    input: HistoryNavigationInput,
  ): Promise<HistoryNavigationData> {
    const parameters = HistoryNavigationParametersSchema.parse(input);
    const action = direction === "back" ? BROWSER_GO_BACK_ACTION : BROWSER_GO_FORWARD_ACTION;
    return this.#runAdvancedAction(
      context,
      action,
      createHistoryNavigationRequest(context.sessionId, direction, parameters),
      (value) => HistoryNavigationDataSchema.parse(value),
      {
        tabId: parameters.tabId,
        direction,
        waitUntil: parameters.waitUntil,
        timeoutMs: parameters.timeoutMs,
      },
    );
  }

  public async activateTab(
    context: BrowserOperationContext,
    input: ActivateTabParameters,
  ): Promise<ActivateTabData> {
    const parameters = ActivateTabParametersSchema.parse(input);
    return this.#runAdvancedAction(
      context,
      BROWSER_ACTIVATE_TAB_ACTION,
      createActivateTabRequest(context.sessionId, parameters),
      (value) => ActivateTabDataSchema.parse(value),
      { tabId: parameters.tabId },
    );
  }

  public async waitFor(
    context: BrowserOperationContext,
    input: WaitForInput,
  ): Promise<WaitForData> {
    const parameters = WaitForParametersSchema.parse(input);
    const startedAt = Date.now();
    const policyDecision = this.#policyEngine.evaluate({
      action: BROWSER_WAIT_FOR_ACTION,
      sessionAuthorized: context.sessionAuthorized,
    });
    if (policyDecision.outcome !== "allow") {
      this.#recordWaitForAudit(context, parameters, policyDecision, "denied", startedAt);
      throw new IbpProtocolError(
        policyDecision.errorCode ?? IBP_ERROR_CODES.POLICY_DENIED,
        policyDecision.reason,
        false,
      );
    }
    try {
      const response = await this.#request(createWaitForRequest(context.sessionId, parameters));
      if (!response.payload.success) {
        throw new IbpProtocolError(
          response.payload.error?.code ?? IBP_ERROR_CODES.BROWSER_API_ERROR,
          response.payload.error?.message ?? "Browser wait condition failed",
          response.payload.error?.retryable ?? false,
        );
      }
      const data = WaitForDataSchema.parse(response.payload.data);
      this.#recordWaitForAudit(context, parameters, policyDecision, "success", startedAt, data);
      return data;
    } catch (error) {
      this.#recordWaitForAudit(
        context,
        parameters,
        policyDecision,
        this.#auditResultForError(error),
        startedAt,
      );
      throw error;
    }
  }

  public async unlockTab(
    context: BrowserOperationContext,
    input: UnlockTabParameters,
  ): Promise<UnlockTabData> {
    const parameters = UnlockTabParametersSchema.parse(input);
    const startedAt = Date.now();
    const policyDecision = this.#policyEngine.evaluate({
      action: BROWSER_UNLOCK_TAB_ACTION,
      sessionAuthorized: context.sessionAuthorized,
    });
    if (policyDecision.outcome !== "allow") {
      this.#recordUnlockTabAudit(context, parameters, policyDecision, "denied", startedAt);
      throw new IbpProtocolError(
        policyDecision.errorCode ?? IBP_ERROR_CODES.POLICY_DENIED,
        policyDecision.reason,
        false,
      );
    }

    try {
      const response = await this.#request(createUnlockTabRequest(context.sessionId, parameters));
      if (!response.payload.success) {
        throw new IbpProtocolError(
          response.payload.error?.code ?? IBP_ERROR_CODES.BROWSER_API_ERROR,
          response.payload.error?.message ?? "Browser tab release failed",
          response.payload.error?.retryable ?? false,
        );
      }
      const data = UnlockTabDataSchema.parse(response.payload.data);
      this.#recordUnlockTabAudit(context, parameters, policyDecision, "success", startedAt);
      return data;
    } catch (error) {
      this.#recordUnlockTabAudit(
        context,
        parameters,
        policyDecision,
        this.#auditResultForError(error),
        startedAt,
      );
      throw error;
    }
  }

  public async setControlIdentity(
    context: BrowserOperationContext,
    input: SetControlIdentityParameters,
  ): Promise<SetControlIdentityData> {
    const parameters = SetControlIdentityParametersSchema.parse(input);
    const startedAt = Date.now();
    const policyDecision = this.#policyEngine.evaluate({
      action: BROWSER_SET_CONTROL_IDENTITY_ACTION,
      sessionAuthorized: context.sessionAuthorized,
    });
    if (policyDecision.outcome !== "allow") {
      this.#recordControlIdentityAudit(context, parameters, policyDecision, "denied", startedAt);
      throw new IbpProtocolError(
        policyDecision.errorCode ?? IBP_ERROR_CODES.POLICY_DENIED,
        policyDecision.reason,
        false,
      );
    }

    try {
      const response = await this.#request(
        createSetControlIdentityRequest(context.sessionId, parameters),
      );
      if (!response.payload.success) {
        throw new IbpProtocolError(
          response.payload.error?.code ?? IBP_ERROR_CODES.BROWSER_API_ERROR,
          response.payload.error?.message ?? "Browser tab identity update failed",
          response.payload.error?.retryable ?? false,
        );
      }
      const data = SetControlIdentityDataSchema.parse(response.payload.data);
      this.#recordControlIdentityAudit(context, parameters, policyDecision, "success", startedAt);
      return data;
    } catch (error) {
      this.#recordControlIdentityAudit(
        context,
        parameters,
        policyDecision,
        this.#auditResultForError(error),
        startedAt,
      );
      throw error;
    }
  }

  public async getPageSnapshot(
    context: BrowserOperationContext,
    input: GetPageSnapshotInput,
  ): Promise<PageSnapshot> {
    const parameters = GetPageSnapshotParametersSchema.parse(input);
    const startedAt = Date.now();
    const policyDecision = this.#policyEngine.evaluate({
      action: BROWSER_GET_PAGE_SNAPSHOT_ACTION,
      sessionAuthorized: context.sessionAuthorized,
    });

    if (policyDecision.outcome !== "allow") {
      this.#recordPageSnapshotAudit(context, parameters, policyDecision, "denied", startedAt);
      throw new IbpProtocolError(
        policyDecision.errorCode ?? IBP_ERROR_CODES.POLICY_DENIED,
        policyDecision.reason,
        false,
      );
    }

    try {
      const response = await this.#request(
        createPageSnapshotRequest(context.sessionId, parameters),
      );
      if (!response.payload.success) {
        throw new IbpProtocolError(
          response.payload.error?.code ?? IBP_ERROR_CODES.BROWSER_API_ERROR,
          response.payload.error?.message ?? "Page snapshot failed",
          response.payload.error?.retryable ?? false,
        );
      }
      const snapshot = PageSnapshotSchema.parse(response.payload.data);
      this.#recordPageSnapshotAudit(
        context,
        parameters,
        policyDecision,
        "success",
        startedAt,
        snapshot,
      );
      return snapshot;
    } catch (error) {
      const result: AuditResult =
        error instanceof IbpProtocolError &&
        (error.code === IBP_ERROR_CODES.PERMISSION_DENIED ||
          error.code === IBP_ERROR_CODES.POLICY_DENIED ||
          error.code === IBP_ERROR_CODES.RESTRICTED_PAGE ||
          error.code === IBP_ERROR_CODES.SESSION_UNAUTHORIZED)
          ? "denied"
          : error instanceof IbpProtocolError && error.code === IBP_ERROR_CODES.CANCELLED
            ? "cancelled"
            : "failure";
      this.#recordPageSnapshotAudit(context, parameters, policyDecision, result, startedAt);
      throw error;
    }
  }

  public async getPageText(
    context: BrowserOperationContext,
    input: GetPageTextInput,
  ): Promise<GetPageTextData> {
    const parameters = GetPageTextParametersSchema.parse(input);
    return this.#runAdvancedAction(
      context,
      BROWSER_GET_PAGE_TEXT_ACTION,
      createPageTextRequest(context.sessionId, parameters),
      (value) => GetPageTextDataSchema.parse(value),
      {
        tabId: parameters.tabId,
        maxChars: parameters.maxChars,
        scoped: parameters.scope !== undefined,
        ...(parameters.scope === undefined
          ? {}
          : {
              documentId: parameters.scope.documentId,
              domRevision: parameters.scope.domRevision,
              elementId: parameters.scope.elementId,
            }),
      },
    );
  }

  public async findElements(
    context: BrowserOperationContext,
    input: FindElementsInput,
  ): Promise<FindElementsData> {
    const parameters = FindElementsParametersSchema.parse(input);
    const startedAt = Date.now();
    const policyDecision = this.#policyEngine.evaluate({
      action: BROWSER_FIND_ELEMENTS_ACTION,
      sessionAuthorized: context.sessionAuthorized,
    });

    if (policyDecision.outcome !== "allow") {
      this.#recordFindElementsAudit(context, parameters, policyDecision, "denied", startedAt);
      throw new IbpProtocolError(
        policyDecision.errorCode ?? IBP_ERROR_CODES.POLICY_DENIED,
        policyDecision.reason,
        false,
      );
    }

    try {
      const response = await this.#request(
        createFindElementsRequest(context.sessionId, parameters),
      );
      if (!response.payload.success) {
        throw new IbpProtocolError(
          response.payload.error?.code ?? IBP_ERROR_CODES.BROWSER_API_ERROR,
          response.payload.error?.message ?? "Element search failed",
          response.payload.error?.retryable ?? false,
        );
      }
      const result = FindElementsDataSchema.parse(response.payload.data);
      this.#recordFindElementsAudit(
        context,
        parameters,
        policyDecision,
        "success",
        startedAt,
        result,
      );
      return result;
    } catch (error) {
      const auditResult: AuditResult =
        error instanceof IbpProtocolError &&
        (error.code === IBP_ERROR_CODES.PERMISSION_DENIED ||
          error.code === IBP_ERROR_CODES.POLICY_DENIED ||
          error.code === IBP_ERROR_CODES.RESTRICTED_PAGE ||
          error.code === IBP_ERROR_CODES.SESSION_UNAUTHORIZED)
          ? "denied"
          : error instanceof IbpProtocolError && error.code === IBP_ERROR_CODES.CANCELLED
            ? "cancelled"
            : "failure";
      this.#recordFindElementsAudit(context, parameters, policyDecision, auditResult, startedAt);
      throw error;
    }
  }

  public async findNaturalLanguage(
    context: BrowserOperationContext,
    input: FindNaturalLanguageInput,
  ): Promise<FindNaturalLanguageData> {
    const parameters = FindNaturalLanguageParametersSchema.parse(input);
    return this.#runAdvancedAction(
      context,
      BROWSER_FIND_NATURAL_LANGUAGE_ACTION,
      createFindNaturalLanguageRequest(context.sessionId, parameters),
      (value) => FindNaturalLanguageDataSchema.parse(value),
      {
        tabId: parameters.tabId,
        querySha256: createHash("sha256").update(parameters.query).digest("hex"),
        queryLength: parameters.query.length,
        maxResults: parameters.maxResults,
        includeHidden: parameters.includeHidden,
      },
    );
  }

  public async click(
    context: BrowserOperationContext,
    input: ClickElementInput,
  ): Promise<ClickElementData> {
    const parameters = ClickElementParametersSchema.parse(input);
    const startedAt = Date.now();
    const policyDecision = this.#policyEngine.evaluate({
      action: BROWSER_CLICK_ACTION,
      sessionAuthorized: context.sessionAuthorized,
    });
    if (policyDecision.outcome !== "allow") {
      this.#recordClickAudit(context, parameters, policyDecision, "denied", startedAt);
      throw new IbpProtocolError(
        policyDecision.errorCode ?? IBP_ERROR_CODES.POLICY_DENIED,
        policyDecision.reason,
        false,
      );
    }

    try {
      const response = await this.#request(createClickRequest(context.sessionId, parameters));
      if (!response.payload.success) {
        throw new IbpProtocolError(
          response.payload.error?.code ?? IBP_ERROR_CODES.BROWSER_API_ERROR,
          response.payload.error?.message ?? "Browser click failed",
          response.payload.error?.retryable ?? false,
        );
      }
      const data = ClickElementDataSchema.parse(response.payload.data);
      this.#recordClickAudit(context, parameters, policyDecision, "success", startedAt, data);
      return data;
    } catch (error) {
      this.#recordClickAudit(
        context,
        parameters,
        policyDecision,
        this.#auditResultForError(error),
        startedAt,
      );
      throw error;
    }
  }

  public async typeText(
    context: BrowserOperationContext,
    input: TypeTextInput,
  ): Promise<TypeTextData> {
    const parameters = TypeTextParametersSchema.parse(input);
    const startedAt = Date.now();
    const policyDecision = this.#policyEngine.evaluate({
      action: BROWSER_TYPE_TEXT_ACTION,
      sessionAuthorized: context.sessionAuthorized,
    });
    if (policyDecision.outcome !== "allow") {
      this.#recordTypeTextAudit(context, parameters, policyDecision, "denied", startedAt);
      throw new IbpProtocolError(
        policyDecision.errorCode ?? IBP_ERROR_CODES.POLICY_DENIED,
        policyDecision.reason,
        false,
      );
    }

    try {
      const response = await this.#request(createTypeTextRequest(context.sessionId, parameters));
      if (!response.payload.success) {
        throw new IbpProtocolError(
          response.payload.error?.code ?? IBP_ERROR_CODES.BROWSER_API_ERROR,
          response.payload.error?.message ?? "Browser text input failed",
          response.payload.error?.retryable ?? false,
        );
      }
      const data = TypeTextDataSchema.parse(response.payload.data);
      this.#recordTypeTextAudit(context, parameters, policyDecision, "success", startedAt, data);
      return data;
    } catch (error) {
      this.#recordTypeTextAudit(
        context,
        parameters,
        policyDecision,
        this.#auditResultForError(error),
        startedAt,
      );
      throw error;
    }
  }

  public async setFileInputFiles(
    context: BrowserOperationContext,
    input: SetFileInputFilesInput,
  ): Promise<SetFileInputFilesData> {
    const parameters = SetFileInputFilesParametersSchema.parse(input);
    const startedAt = Date.now();
    const policyDecision = this.#policyEngine.evaluate({
      action: BROWSER_SET_FILE_INPUT_FILES_ACTION,
      sessionAuthorized: context.sessionAuthorized,
      explicitUserAuthorization: true,
    });
    if (policyDecision.outcome !== "allow") {
      this.#recordFileUploadAudit(context, parameters, policyDecision, "denied", startedAt);
      throw new IbpProtocolError(
        policyDecision.errorCode ?? IBP_ERROR_CODES.POLICY_DENIED,
        policyDecision.reason,
        false,
      );
    }

    try {
      const verifiedPaths: string[] = [];
      for (const [index, filePath] of parameters.filePaths.entries()) {
        if (!isAbsolute(filePath)) {
          throw new IbpProtocolError(
            IBP_ERROR_CODES.INVALID_PARAMETERS,
            `Local file path at index ${index} must be absolute`,
            false,
          );
        }
        let metadata;
        try {
          metadata = await stat(filePath);
        } catch (error) {
          const code =
            typeof error === "object" && error !== null && "code" in error
              ? (error as { code?: unknown }).code
              : undefined;
          throw new IbpProtocolError(
            code === "ENOENT"
              ? IBP_ERROR_CODES.LOCAL_FILE_NOT_FOUND
              : IBP_ERROR_CODES.LOCAL_FILE_ACCESS_DENIED,
            code === "ENOENT"
              ? `Local file at index ${index} does not exist`
              : `Local file at index ${index} cannot be inspected`,
            false,
          );
        }
        if (!metadata.isFile()) {
          throw new IbpProtocolError(
            IBP_ERROR_CODES.INVALID_PARAMETERS,
            `Local path at index ${index} is not a regular file`,
            false,
          );
        }
        try {
          await access(filePath, fsConstants.R_OK);
          verifiedPaths.push(await realpath(filePath));
        } catch {
          throw new IbpProtocolError(
            IBP_ERROR_CODES.LOCAL_FILE_ACCESS_DENIED,
            `Local file at index ${index} is not readable`,
            false,
          );
        }
      }
      const verifiedParameters = { ...parameters, filePaths: verifiedPaths };
      const response = await this.#request(
        createSetFileInputFilesRequest(context.sessionId, verifiedParameters),
      );
      if (!response.payload.success) {
        throw new IbpProtocolError(
          response.payload.error?.code ?? IBP_ERROR_CODES.BROWSER_API_ERROR,
          response.payload.error?.message ?? "Browser local file upload failed",
          response.payload.error?.retryable ?? false,
        );
      }
      const data = SetFileInputFilesDataSchema.parse(response.payload.data);
      this.#recordFileUploadAudit(context, parameters, policyDecision, "success", startedAt, data);
      return data;
    } catch (error) {
      this.#recordFileUploadAudit(
        context,
        parameters,
        policyDecision,
        this.#auditResultForError(error),
        startedAt,
      );
      throw error;
    }
  }

  public async selectOption(
    context: BrowserOperationContext,
    input: SelectOptionInput,
  ): Promise<SelectOptionData> {
    const parameters = SelectOptionParametersSchema.parse(input);
    const startedAt = Date.now();
    const policyDecision = this.#policyEngine.evaluate({
      action: BROWSER_SELECT_OPTION_ACTION,
      sessionAuthorized: context.sessionAuthorized,
    });
    if (policyDecision.outcome !== "allow") {
      this.#recordSelectOptionAudit(context, parameters, policyDecision, "denied", startedAt);
      throw new IbpProtocolError(
        policyDecision.errorCode ?? IBP_ERROR_CODES.POLICY_DENIED,
        policyDecision.reason,
        false,
      );
    }
    try {
      const response = await this.#request(
        createSelectOptionRequest(context.sessionId, parameters),
      );
      if (!response.payload.success) {
        throw new IbpProtocolError(
          response.payload.error?.code ?? IBP_ERROR_CODES.BROWSER_API_ERROR,
          response.payload.error?.message ?? "Browser option selection failed",
          response.payload.error?.retryable ?? false,
        );
      }
      const data = SelectOptionDataSchema.parse(response.payload.data);
      this.#recordSelectOptionAudit(
        context,
        parameters,
        policyDecision,
        "success",
        startedAt,
        data,
      );
      return data;
    } catch (error) {
      this.#recordSelectOptionAudit(
        context,
        parameters,
        policyDecision,
        this.#auditResultForError(error),
        startedAt,
      );
      throw error;
    }
  }

  public async check(
    context: BrowserOperationContext,
    input: SetCheckedParameters,
  ): Promise<SetCheckedData> {
    return this.#setChecked(context, input, true);
  }

  public async uncheck(
    context: BrowserOperationContext,
    input: SetCheckedParameters,
  ): Promise<SetCheckedData> {
    return this.#setChecked(context, input, false);
  }

  async #setChecked(
    context: BrowserOperationContext,
    input: SetCheckedParameters,
    checked: boolean,
  ): Promise<SetCheckedData> {
    const parameters = SetCheckedParametersSchema.parse(input);
    const action = checked ? BROWSER_CHECK_ACTION : BROWSER_UNCHECK_ACTION;
    const startedAt = Date.now();
    const policyDecision = this.#policyEngine.evaluate({
      action,
      sessionAuthorized: context.sessionAuthorized,
    });
    if (policyDecision.outcome !== "allow") {
      this.#recordSetCheckedAudit(
        context,
        parameters,
        checked,
        policyDecision,
        "denied",
        startedAt,
      );
      throw new IbpProtocolError(
        policyDecision.errorCode ?? IBP_ERROR_CODES.POLICY_DENIED,
        policyDecision.reason,
        false,
      );
    }
    try {
      const response = await this.#request(
        createSetCheckedRequest(context.sessionId, checked, parameters),
      );
      if (!response.payload.success) {
        throw new IbpProtocolError(
          response.payload.error?.code ?? IBP_ERROR_CODES.BROWSER_API_ERROR,
          response.payload.error?.message ?? "Browser checked-state change failed",
          response.payload.error?.retryable ?? false,
        );
      }
      const data = SetCheckedDataSchema.parse(response.payload.data);
      this.#recordSetCheckedAudit(
        context,
        parameters,
        checked,
        policyDecision,
        "success",
        startedAt,
        data,
      );
      return data;
    } catch (error) {
      this.#recordSetCheckedAudit(
        context,
        parameters,
        checked,
        policyDecision,
        this.#auditResultForError(error),
        startedAt,
      );
      throw error;
    }
  }

  public async submitForm(
    context: BrowserOperationContext,
    input: SubmitFormParameters,
  ): Promise<SubmitFormData> {
    const parameters = SubmitFormParametersSchema.parse(input);
    const startedAt = Date.now();
    const policyDecision = this.#policyEngine.evaluate({
      action: BROWSER_SUBMIT_FORM_ACTION,
      sessionAuthorized: context.sessionAuthorized,
      explicitUserAuthorization: true,
    });
    if (policyDecision.outcome !== "allow") {
      this.#recordSubmitAudit(context, parameters, policyDecision, "denied", startedAt);
      throw new IbpProtocolError(
        policyDecision.errorCode ?? IBP_ERROR_CODES.POLICY_DENIED,
        policyDecision.reason,
        false,
      );
    }
    try {
      const response = await this.#request(createSubmitFormRequest(context.sessionId, parameters));
      if (!response.payload.success) {
        throw new IbpProtocolError(
          response.payload.error?.code ?? IBP_ERROR_CODES.BROWSER_API_ERROR,
          response.payload.error?.message ?? "Browser form submission failed",
          response.payload.error?.retryable ?? false,
        );
      }
      const data = SubmitFormDataSchema.parse(response.payload.data);
      this.#recordSubmitAudit(context, parameters, policyDecision, "success", startedAt, data);
      return data;
    } catch (error) {
      this.#recordSubmitAudit(
        context,
        parameters,
        policyDecision,
        this.#auditResultForError(error),
        startedAt,
      );
      throw error;
    }
  }

  public async getWordPressMenu(
    context: BrowserOperationContext,
    input: GetWordPressMenuInput,
  ): Promise<GetWordPressMenuData> {
    const parameters = GetWordPressMenuParametersSchema.parse(input);
    return this.#runAdvancedAction(
      context,
      BROWSER_GET_WORDPRESS_MENU_ACTION,
      createGetWordPressMenuRequest(context.sessionId, parameters),
      (value) => GetWordPressMenuDataSchema.parse(value),
      {
        tabId: parameters.tabId,
        maxItems: parameters.maxItems,
      },
    );
  }

  public async editWordPressMenu(
    context: BrowserOperationContext,
    input: EditWordPressMenuInput,
  ): Promise<EditWordPressMenuData> {
    const parameters = EditWordPressMenuParametersSchema.parse(input);
    return this.#runAdvancedAction(
      context,
      BROWSER_EDIT_WORDPRESS_MENU_ACTION,
      createEditWordPressMenuRequest(context.sessionId, parameters),
      (value) => EditWordPressMenuDataSchema.parse(value),
      {
        tabId: parameters.tabId,
        documentId: parameters.documentId,
        domRevision: parameters.domRevision,
        operationTypes: parameters.operations.map((operation) => operation.type),
        operationCount: parameters.operations.length,
        referencedItemIds: parameters.operations.flatMap((operation) => {
          const ids: string[] = [];
          if ("itemId" in operation) ids.push(operation.itemId);
          if ("destination" in operation && "targetItemId" in operation.destination) {
            ids.push(operation.destination.targetItemId);
          }
          return ids;
        }),
        save: parameters.save,
        authorizationSource: parameters.authorization.source,
      },
      parameters.authorization.instructionId,
    );
  }

  public async getWordPressAdmin(
    context: BrowserOperationContext,
    input: GetWordPressAdminInput,
  ): Promise<GetWordPressAdminData> {
    const parameters = GetWordPressAdminParametersSchema.parse(input);
    return this.#runAdvancedAction(
      context,
      BROWSER_GET_WORDPRESS_ADMIN_ACTION,
      createGetWordPressAdminRequest(context.sessionId, parameters),
      (value) => GetWordPressAdminDataSchema.parse(value),
      {
        tabId: parameters.tabId,
        maxRows: parameters.maxRows,
        maxCellText: parameters.maxCellText,
      },
    );
  }

  public async wordpressListTableAction(
    context: BrowserOperationContext,
    input: WordPressListTableActionInput,
  ): Promise<WordPressListTableActionData> {
    const parameters = WordPressListTableActionParametersSchema.parse(input);
    const rowIds = parameters.operation === "apply_bulk" ? parameters.rowIds : [parameters.rowId];
    return this.#runAdvancedAction(
      context,
      BROWSER_WORDPRESS_LIST_TABLE_ACTION,
      createWordPressListTableActionRequest(context.sessionId, parameters),
      (value) => WordPressListTableActionDataSchema.parse(value),
      {
        tabId: parameters.tabId,
        documentId: parameters.documentId,
        domRevision: parameters.domRevision,
        operation: parameters.operation,
        rowIds,
        rowCount: rowIds.length,
        actionKey: parameters.actionKey,
        authorizationSource: parameters.authorization.source,
      },
      parameters.authorization.instructionId,
    );
  }

  public async getWordPressEditor(
    context: BrowserOperationContext,
    input: GetWordPressEditorInput,
  ): Promise<GetWordPressEditorData> {
    const parameters = GetWordPressEditorParametersSchema.parse(input);
    return this.#runAdvancedAction(
      context,
      BROWSER_GET_WORDPRESS_EDITOR_ACTION,
      createGetWordPressEditorRequest(context.sessionId, parameters),
      (value) => GetWordPressEditorDataSchema.parse(value),
      {
        tabId: parameters.tabId,
        maxContentChars: parameters.maxContentChars,
      },
    );
  }

  public async editWordPressEditor(
    context: BrowserOperationContext,
    input: EditWordPressEditorInput,
  ): Promise<EditWordPressEditorData> {
    const parameters = EditWordPressEditorParametersSchema.parse(input);
    const fieldNames = Object.keys(parameters.fields);
    return this.#runAdvancedAction(
      context,
      BROWSER_EDIT_WORDPRESS_EDITOR_ACTION,
      createEditWordPressEditorRequest(context.sessionId, parameters),
      (value) => EditWordPressEditorDataSchema.parse(value),
      {
        tabId: parameters.tabId,
        documentId: parameters.documentId,
        domRevision: parameters.domRevision,
        fieldNames,
        fieldCount: fieldNames.length,
        save: parameters.save,
        publishRequested: parameters.fields.status === "publish" && parameters.save,
        authorizationSource: parameters.authorization.source,
      },
      parameters.authorization.instructionId,
    );
  }

  public async getHttpAuthState(
    context: BrowserOperationContext,
    input: HttpAuthStateParameters,
  ): Promise<HttpAuthStateData> {
    const parameters = HttpAuthStateParametersSchema.parse(input);
    const startedAt = Date.now();
    const policyDecision = this.#policyEngine.evaluate({
      action: BROWSER_GET_HTTP_AUTH_STATE_ACTION,
      sessionAuthorized: context.sessionAuthorized,
    });
    if (policyDecision.outcome !== "allow") {
      this.#recordAuthDialogAudit(
        context,
        BROWSER_GET_HTTP_AUTH_STATE_ACTION,
        parameters.tabId,
        policyDecision,
        "denied",
        startedAt,
        {},
      );
      throw new IbpProtocolError(
        policyDecision.errorCode ?? IBP_ERROR_CODES.POLICY_DENIED,
        policyDecision.reason,
        false,
      );
    }
    try {
      const response = await this.#request(
        createHttpAuthStateRequest(context.sessionId, parameters),
      );
      if (!response.payload.success) {
        throw new IbpProtocolError(
          response.payload.error?.code ?? IBP_ERROR_CODES.BROWSER_API_ERROR,
          response.payload.error?.message ?? "HTTP authentication state read failed",
          response.payload.error?.retryable ?? false,
        );
      }
      const data = HttpAuthStateDataSchema.parse(response.payload.data);
      this.#recordAuthDialogAudit(
        context,
        BROWSER_GET_HTTP_AUTH_STATE_ACTION,
        parameters.tabId,
        policyDecision,
        "success",
        startedAt,
        { challengeDetected: data.challengeDetected, scheme: data.scheme, origin: data.origin },
      );
      return data;
    } catch (error) {
      this.#recordAuthDialogAudit(
        context,
        BROWSER_GET_HTTP_AUTH_STATE_ACTION,
        parameters.tabId,
        policyDecision,
        this.#auditResultForError(error),
        startedAt,
        {},
      );
      throw error;
    }
  }

  public async authenticateHttp(
    context: BrowserOperationContext,
    input: AuthenticateHttpInput,
  ): Promise<AuthenticateHttpData> {
    const parameters = AuthenticateHttpParametersSchema.parse(input);
    const startedAt = Date.now();
    const policyDecision = this.#policyEngine.evaluate({
      action: BROWSER_AUTHENTICATE_HTTP_ACTION,
      sessionAuthorized: context.sessionAuthorized,
      explicitUserAuthorization: true,
    });
    const safeAudit = {
      timeoutMs: parameters.timeoutMs,
      authorizationSource: parameters.authorization.source,
    };
    if (policyDecision.outcome !== "allow") {
      this.#recordAuthDialogAudit(
        context,
        BROWSER_AUTHENTICATE_HTTP_ACTION,
        parameters.tabId,
        policyDecision,
        "denied",
        startedAt,
        safeAudit,
        parameters.authorization.instructionId,
      );
      throw new IbpProtocolError(
        policyDecision.errorCode ?? IBP_ERROR_CODES.POLICY_DENIED,
        policyDecision.reason,
        false,
      );
    }
    try {
      const response = await this.#request(
        createAuthenticateHttpRequest(context.sessionId, parameters),
      );
      if (!response.payload.success) {
        throw new IbpProtocolError(
          response.payload.error?.code ?? IBP_ERROR_CODES.AUTHENTICATION_FAILED,
          response.payload.error?.message ?? "HTTP Basic authentication failed",
          response.payload.error?.retryable ?? false,
        );
      }
      const data = AuthenticateHttpDataSchema.parse(response.payload.data);
      this.#recordAuthDialogAudit(
        context,
        BROWSER_AUTHENTICATE_HTTP_ACTION,
        parameters.tabId,
        policyDecision,
        "success",
        startedAt,
        { ...safeAudit, origin: data.origin, challengeHandled: data.challengeHandled },
        parameters.authorization.instructionId,
      );
      return data;
    } catch (error) {
      this.#recordAuthDialogAudit(
        context,
        BROWSER_AUTHENTICATE_HTTP_ACTION,
        parameters.tabId,
        policyDecision,
        this.#auditResultForError(error),
        startedAt,
        safeAudit,
        parameters.authorization.instructionId,
      );
      throw error;
    }
  }

  public async handleJavaScriptDialog(
    context: BrowserOperationContext,
    input: HandleJavaScriptDialogInput,
  ): Promise<HandleJavaScriptDialogData> {
    const parameters = HandleJavaScriptDialogParametersSchema.parse(input);
    const startedAt = Date.now();
    const policyDecision = this.#policyEngine.evaluate({
      action: BROWSER_HANDLE_JAVASCRIPT_DIALOG_ACTION,
      sessionAuthorized: context.sessionAuthorized,
      explicitUserAuthorization: true,
    });
    const safeAudit = {
      accept: parameters.accept,
      triggerType: parameters.trigger.type,
      promptTextSupplied: parameters.promptText !== undefined,
      timeoutMs: parameters.timeoutMs,
      authorizationSource: parameters.authorization.source,
    };
    if (policyDecision.outcome !== "allow") {
      this.#recordAuthDialogAudit(
        context,
        BROWSER_HANDLE_JAVASCRIPT_DIALOG_ACTION,
        parameters.tabId,
        policyDecision,
        "denied",
        startedAt,
        safeAudit,
        parameters.authorization.instructionId,
      );
      throw new IbpProtocolError(
        policyDecision.errorCode ?? IBP_ERROR_CODES.POLICY_DENIED,
        policyDecision.reason,
        false,
      );
    }
    try {
      const response = await this.#request(
        createHandleJavaScriptDialogRequest(context.sessionId, parameters),
      );
      if (!response.payload.success) {
        throw new IbpProtocolError(
          response.payload.error?.code ?? IBP_ERROR_CODES.BROWSER_API_ERROR,
          response.payload.error?.message ?? "Native JavaScript dialog handling failed",
          response.payload.error?.retryable ?? false,
        );
      }
      const data = HandleJavaScriptDialogDataSchema.parse(response.payload.data);
      this.#recordAuthDialogAudit(
        context,
        BROWSER_HANDLE_JAVASCRIPT_DIALOG_ACTION,
        parameters.tabId,
        policyDecision,
        "success",
        startedAt,
        {
          ...safeAudit,
          origin: data.origin,
          dialogType: data.type,
          messageSha256: createHash("sha256").update(data.message).digest("hex"),
          messageLength: data.message.length,
        },
        parameters.authorization.instructionId,
      );
      return data;
    } catch (error) {
      this.#recordAuthDialogAudit(
        context,
        BROWSER_HANDLE_JAVASCRIPT_DIALOG_ACTION,
        parameters.tabId,
        policyDecision,
        this.#auditResultForError(error),
        startedAt,
        safeAudit,
        parameters.authorization.instructionId,
      );
      throw error;
    }
  }

  public async evaluateJavaScript(
    context: BrowserOperationContext,
    input: EvaluateJavaScriptInput,
  ): Promise<EvaluateJavaScriptData> {
    const parameters = EvaluateJavaScriptParametersSchema.parse(input);
    const startedAt = Date.now();
    const analysis = analyzeJavaScriptExpression(parameters.expression, parameters.mode);
    const policyDecision = this.#policyEngine.evaluate({
      action: BROWSER_EVALUATE_ACTION,
      sessionAuthorized: context.sessionAuthorized,
      explicitUserAuthorization: true,
    });
    if (policyDecision.outcome !== "allow" || !analysis.allowed) {
      const effectiveDecision: PolicyDecision = analysis.allowed
        ? policyDecision
        : {
            action: BROWSER_EVALUATE_ACTION,
            outcome: "deny",
            riskLevel: "R2",
            reason: analysis.reason,
            errorCode: IBP_ERROR_CODES.SCRIPT_POLICY_DENIED,
          };
      this.#recordEvaluateAudit(context, parameters, effectiveDecision, "denied", startedAt);
      throw new IbpProtocolError(
        effectiveDecision.errorCode ?? IBP_ERROR_CODES.SCRIPT_POLICY_DENIED,
        effectiveDecision.reason,
        false,
      );
    }
    try {
      const response = await this.#request(
        createEvaluateJavaScriptRequest(context.sessionId, parameters),
      );
      if (!response.payload.success) {
        throw new IbpProtocolError(
          response.payload.error?.code ?? IBP_ERROR_CODES.SCRIPT_EXECUTION_FAILED,
          response.payload.error?.message ?? "Browser JavaScript evaluation failed",
          response.payload.error?.retryable ?? false,
        );
      }
      const data = EvaluateJavaScriptDataSchema.parse(response.payload.data);
      this.#recordEvaluateAudit(context, parameters, policyDecision, "success", startedAt, data);
      return data;
    } catch (error) {
      this.#recordEvaluateAudit(
        context,
        parameters,
        policyDecision,
        this.#auditResultForError(error),
        startedAt,
      );
      throw error;
    }
  }

  public async mutateDom(
    context: BrowserOperationContext,
    input: MutateDomInput,
  ): Promise<MutateDomData> {
    const parameters = MutateDomParametersSchema.parse(input);
    return this.#runAdvancedAction(
      context,
      BROWSER_MUTATE_DOM_ACTION,
      createMutateDomRequest(context.sessionId, parameters),
      (value) => MutateDomDataSchema.parse(value),
      {
        tabId: parameters.tabId,
        documentId: parameters.documentId,
        domRevision: parameters.domRevision,
        elementId: parameters.elementId,
        operationTypes: parameters.operations.map((operation) => operation.type),
        operationCount: parameters.operations.length,
        authorizationSource: parameters.authorization.source,
      },
      parameters.authorization.instructionId,
    );
  }

  public async inspectElement(
    context: BrowserOperationContext,
    input: InspectElementInput,
  ): Promise<InspectElementData> {
    const parameters = InspectElementParametersSchema.parse(input);
    return this.#runAdvancedAction(
      context,
      BROWSER_INSPECT_ELEMENT_ACTION,
      createInspectElementRequest(context.sessionId, parameters),
      (value) => InspectElementDataSchema.parse(value),
      {
        tabId: parameters.tabId,
        documentId: parameters.documentId,
        domRevision: parameters.domRevision,
        elementId: parameters.elementId,
        computedStyleProperties: parameters.computedStyleProperties,
        includeEventListeners: parameters.includeEventListeners,
        includeDocumentListeners: parameters.includeDocumentListeners,
        listenerDepth: parameters.listenerDepth,
        maxListeners: parameters.maxListeners,
        sourceExcerptChars: parameters.sourceExcerptChars,
      },
    );
  }

  public async manageCss(
    context: BrowserOperationContext,
    input: ManageCssInput,
  ): Promise<ManageCssData> {
    const parameters = ManageCssParametersSchema.parse(input);
    const auditParameters: Record<string, JsonValue> =
      parameters.operation === "add"
        ? {
            tabId: parameters.tabId,
            operation: parameters.operation,
            cssSha256: createHash("sha256").update(parameters.css).digest("hex"),
            cssLength: parameters.css.length,
            origin: parameters.origin,
            allFrames: parameters.allFrames,
            authorizationSource: parameters.authorization.source,
          }
        : {
            tabId: parameters.tabId,
            operation: parameters.operation,
            injectionId: parameters.injectionId,
            authorizationSource: parameters.authorization.source,
          };
    return this.#runAdvancedAction(
      context,
      BROWSER_MANAGE_CSS_ACTION,
      createManageCssRequest(context.sessionId, parameters),
      (value) => ManageCssDataSchema.parse(value),
      auditParameters,
      parameters.authorization.instructionId,
    );
  }

  public async observeEvents(
    context: BrowserOperationContext,
    input: ObserveEventsInput,
  ): Promise<ObserveEventsData> {
    const parameters = ObserveEventsParametersSchema.parse(input);
    const auditParameters: Record<string, JsonValue> =
      parameters.operation === "start"
        ? {
            tabId: parameters.tabId,
            operation: parameters.operation,
            eventTypes: parameters.eventTypes,
            maxEvents: parameters.maxEvents,
            scoped: parameters.scope !== undefined,
          }
        : {
            tabId: parameters.tabId,
            operation: parameters.operation,
            captureId: parameters.captureId,
            ...(parameters.operation === "read" ? { clear: parameters.clear } : {}),
          };
    return this.#runAdvancedAction(
      context,
      BROWSER_OBSERVE_EVENTS_ACTION,
      createObserveEventsRequest(context.sessionId, parameters),
      (value) => ObserveEventsDataSchema.parse(value),
      auditParameters,
    );
  }

  public async executeJavaScript(
    context: BrowserOperationContext,
    input: ExecuteJavaScriptInput,
  ): Promise<ExecuteJavaScriptData> {
    const parameters = ExecuteJavaScriptParametersSchema.parse(input);
    return this.#runAdvancedAction(
      context,
      BROWSER_EXECUTE_JAVASCRIPT_ACTION,
      createExecuteJavaScriptRequest(context.sessionId, parameters),
      (value) => ExecuteJavaScriptDataSchema.parse(value),
      {
        tabId: parameters.tabId,
        sourceSha256: createHash("sha256").update(parameters.source).digest("hex"),
        sourceLength: parameters.source.length,
        sourceType: parameters.sourceType,
        awaitPromise: parameters.awaitPromise,
        userGesture: parameters.userGesture,
        timeoutMs: parameters.timeoutMs,
        authorizationSource: parameters.authorization.source,
      },
      parameters.authorization.instructionId,
    );
  }

  public async manageBrowserConsole(
    context: BrowserOperationContext,
    input: BrowserConsoleInput,
  ): Promise<BrowserConsoleData> {
    const parameters = BrowserConsoleParametersSchema.parse(input);
    return this.#runAdvancedAction(
      context,
      BROWSER_CONSOLE_ACTION,
      createBrowserConsoleRequest(context.sessionId, parameters),
      (value) => BrowserConsoleDataSchema.parse(value),
      {
        tabId: parameters.tabId,
        operation: parameters.operation,
        ...("bufferSize" in parameters ? { bufferSize: parameters.bufferSize } : {}),
        ...("limit" in parameters ? { limit: parameters.limit, clear: parameters.clear } : {}),
      },
    );
  }

  public async manageNetworkCapture(
    context: BrowserOperationContext,
    input: NetworkCaptureInput,
  ): Promise<NetworkCaptureData> {
    const parameters = NetworkCaptureParametersSchema.parse(input);
    return this.#runAdvancedAction(
      context,
      BROWSER_NETWORK_ACTION,
      createNetworkCaptureRequest(context.sessionId, parameters),
      (value) => NetworkCaptureDataSchema.parse(value),
      {
        tabId: parameters.tabId,
        operation: parameters.operation,
        ...("bufferSize" in parameters ? { bufferSize: parameters.bufferSize } : {}),
        ...("limit" in parameters ? { limit: parameters.limit, clear: parameters.clear } : {}),
      },
    );
  }

  public async manageDeviceEmulation(
    context: BrowserOperationContext,
    input: DeviceEmulationInput,
  ): Promise<DeviceEmulationData> {
    const parameters = DeviceEmulationParametersSchema.parse(input);
    return this.#runAdvancedAction(
      context,
      BROWSER_EMULATE_DEVICE_ACTION,
      createDeviceEmulationRequest(context.sessionId, parameters),
      (value) => DeviceEmulationDataSchema.parse(value),
      {
        tabId: parameters.tabId,
        operation: parameters.operation,
        ...("preset" in parameters
          ? {
              preset: parameters.preset,
              orientation: parameters.orientation,
              width: parameters.width ?? null,
              height: parameters.height ?? null,
              deviceScaleFactor: parameters.deviceScaleFactor ?? null,
              touch: parameters.touch ?? null,
            }
          : {}),
      },
    );
  }

  public async performGesture(
    context: BrowserOperationContext,
    input: PerformGestureInput,
  ): Promise<PerformGestureData> {
    const parameters = PerformGestureParametersSchema.parse(input);
    return this.#runAdvancedAction(
      context,
      BROWSER_PERFORM_GESTURE_ACTION,
      createPerformGestureRequest(context.sessionId, parameters),
      (value) => PerformGestureDataSchema.parse(value),
      {
        tabId: parameters.tabId,
        operation: parameters.operation,
        ...("elementId" in parameters ? { elementId: parameters.elementId } : {}),
        ...("targetElementId" in parameters ? { targetElementId: parameters.targetElementId } : {}),
        ...("key" in parameters
          ? {
              key: parameters.key,
              code: parameters.code ?? null,
              ctrl: parameters.ctrl,
              alt: parameters.alt,
              meta: parameters.meta,
              shift: parameters.shift,
            }
          : {}),
        ...("deltaX" in parameters ? { deltaX: parameters.deltaX, deltaY: parameters.deltaY } : {}),
        ...("x" in parameters ? { x: parameters.x, y: parameters.y } : {}),
        ...("steps" in parameters ? { steps: parameters.steps } : {}),
      },
    );
  }

  public async printToPdf(
    context: BrowserOperationContext,
    input: PrintToPdfInput,
  ): Promise<PrintToPdfData> {
    const parameters = PrintToPdfParametersSchema.parse(input);
    return this.#runAdvancedAction(
      context,
      BROWSER_PRINT_TO_PDF_ACTION,
      createPrintToPdfRequest(context.sessionId, parameters),
      (value) => PrintToPdfDataSchema.parse(value),
      {
        tabId: parameters.tabId,
        landscape: parameters.landscape,
        printBackground: parameters.printBackground,
        scale: parameters.scale,
        paperSize: parameters.paperSize,
        pageRanges: parameters.pageRanges,
        preferCssPageSize: parameters.preferCssPageSize,
      },
    );
  }

  public async pageApiRequest(
    context: BrowserOperationContext,
    input: PageApiRequestInput,
  ): Promise<PageApiRequestData> {
    const parameters = PageApiRequestParametersSchema.parse(input);
    const serializedBody =
      parameters.body === undefined
        ? undefined
        : typeof parameters.body === "string"
          ? parameters.body
          : JSON.stringify(parameters.body);
    return this.#runAdvancedAction(
      context,
      BROWSER_PAGE_API_REQUEST_ACTION,
      createPageApiRequest(context.sessionId, parameters),
      (value) => PageApiRequestDataSchema.parse(value),
      {
        tabId: parameters.tabId,
        method: parameters.method,
        urlSha256: createHash("sha256").update(parameters.url).digest("hex"),
        urlLength: parameters.url.length,
        headerNames: Object.entries(parameters.headers)
          .filter(([, value]) => value !== undefined)
          .map(([key]) => key),
        bodyLength: serializedBody?.length ?? 0,
        ...(serializedBody === undefined
          ? {}
          : { bodySha256: createHash("sha256").update(serializedBody).digest("hex") }),
        responseMode: parameters.responseMode,
        maxResponseChars: parameters.maxResponseChars,
        useWordPressNonce: parameters.useWordPressNonce,
        authorizationSource: parameters.authorization.source,
      },
      parameters.authorization.instructionId,
    );
  }

  public async captureScreenshot(
    context: BrowserOperationContext,
    input: CaptureScreenshotInput,
  ): Promise<CaptureScreenshotData> {
    const parameters = CaptureScreenshotParametersSchema.parse(input);
    const startedAt = Date.now();
    const policyDecision = this.#policyEngine.evaluate({
      action: BROWSER_SCREENSHOT_ACTION,
      sessionAuthorized: context.sessionAuthorized,
    });
    if (policyDecision.outcome !== "allow") {
      this.#recordScreenshotAudit(context, parameters, policyDecision, "denied", startedAt);
      throw new IbpProtocolError(
        policyDecision.errorCode ?? IBP_ERROR_CODES.POLICY_DENIED,
        policyDecision.reason,
        false,
      );
    }
    try {
      const response = await this.#request(
        createScreenshotRequest(context.sessionId, parameters, { timeoutMs: 30_000 }),
      );
      if (!response.payload.success) {
        throw new IbpProtocolError(
          response.payload.error?.code ?? IBP_ERROR_CODES.BROWSER_API_ERROR,
          response.payload.error?.message ?? "Browser screenshot capture failed",
          response.payload.error?.retryable ?? false,
        );
      }
      const data = CaptureScreenshotDataSchema.parse(response.payload.data);
      this.#recordScreenshotAudit(context, parameters, policyDecision, "success", startedAt, data);
      return data;
    } catch (error) {
      this.#recordScreenshotAudit(
        context,
        parameters,
        policyDecision,
        this.#auditResultForError(error),
        startedAt,
      );
      throw error;
    }
  }

  public async clickAt(
    context: BrowserOperationContext,
    input: ClickAtParameters,
  ): Promise<ClickAtData> {
    const parameters = ClickAtParametersSchema.parse(input);
    const startedAt = Date.now();
    const policyDecision = this.#policyEngine.evaluate({
      action: BROWSER_CLICK_AT_ACTION,
      sessionAuthorized: context.sessionAuthorized,
    });
    if (policyDecision.outcome !== "allow") {
      this.#recordClickAtAudit(context, parameters, policyDecision, "denied", startedAt);
      throw new IbpProtocolError(
        policyDecision.errorCode ?? IBP_ERROR_CODES.POLICY_DENIED,
        policyDecision.reason,
        false,
      );
    }
    try {
      const response = await this.#request(createClickAtRequest(context.sessionId, parameters));
      if (!response.payload.success) {
        throw new IbpProtocolError(
          response.payload.error?.code ?? IBP_ERROR_CODES.BROWSER_API_ERROR,
          response.payload.error?.message ?? "Browser coordinate click failed",
          response.payload.error?.retryable ?? false,
        );
      }
      const data = ClickAtDataSchema.parse(response.payload.data);
      this.#recordClickAtAudit(context, parameters, policyDecision, "success", startedAt, data);
      return data;
    } catch (error) {
      this.#recordClickAtAudit(
        context,
        parameters,
        policyDecision,
        this.#auditResultForError(error),
        startedAt,
      );
      throw error;
    }
  }

  async #runAdvancedAction<T>(
    context: BrowserOperationContext,
    action: string,
    request: ProtocolRequestEnvelope,
    parseData: (value: unknown) => T,
    auditParameters: Record<string, JsonValue>,
    confirmationId?: string,
  ): Promise<T> {
    const startedAt = Date.now();
    const policyDecision = this.#policyEngine.evaluate({
      action,
      sessionAuthorized: context.sessionAuthorized,
      explicitUserAuthorization: confirmationId !== undefined,
    });
    if (policyDecision.outcome !== "allow") {
      this.#recordAdvancedAudit(
        context,
        action,
        auditParameters,
        policyDecision,
        "denied",
        startedAt,
        confirmationId,
      );
      throw new IbpProtocolError(
        policyDecision.errorCode ?? IBP_ERROR_CODES.POLICY_DENIED,
        policyDecision.reason,
        false,
      );
    }
    try {
      const response = await this.#request(request);
      if (!response.payload.success) {
        throw new IbpProtocolError(
          response.payload.error?.code ?? IBP_ERROR_CODES.BROWSER_API_ERROR,
          response.payload.error?.message ?? `Browser action ${action} failed`,
          response.payload.error?.retryable ?? false,
          response.payload.error?.details === undefined
            ? undefined
            : { details: response.payload.error.details as JsonValue },
        );
      }
      const data = parseData(response.payload.data);
      this.#recordAdvancedAudit(
        context,
        action,
        auditParameters,
        policyDecision,
        "success",
        startedAt,
        confirmationId,
      );
      return data;
    } catch (error) {
      this.#recordAdvancedAudit(
        context,
        action,
        auditParameters,
        policyDecision,
        this.#auditResultForError(error),
        startedAt,
        confirmationId,
      );
      throw error;
    }
  }

  #recordAdvancedAudit(
    context: BrowserOperationContext,
    action: string,
    parameters: Record<string, JsonValue>,
    policyDecision: PolicyDecision,
    result: AuditResult,
    startedAt: number,
    confirmationId?: string,
  ): void {
    const tabId = typeof parameters["tabId"] === "number" ? parameters["tabId"] : undefined;
    this.#auditLog.record({
      sessionId: context.sessionId,
      agentId: context.agentId,
      clientId: context.clientId,
      domain: "browser://tab",
      url: tabId === undefined ? "browser://tab" : `browser://tab/${tabId}`,
      tabId,
      tool: action,
      parameters,
      policyDecision: `${policyDecision.outcome}: ${policyDecision.reason}`,
      riskLevel: policyDecision.riskLevel,
      confirmationId,
      result,
      durationMs: Math.max(0, Date.now() - startedAt),
    });
  }

  async #request(request: ProtocolRequestEnvelope): Promise<ProtocolResponseEnvelope> {
    const socket = this.#socket;
    if (socket?.readyState !== WebSocket.OPEN) {
      throw new IbpProtocolError(
        IBP_ERROR_CODES.NATIVE_HOST_UNAVAILABLE,
        "Native host is not connected",
        true,
      );
    }

    const timeoutMs = request.payload.timeoutMs ?? this.#requestTimeoutMs;
    const handle = this.#pending.register(request.messageId, timeoutMs);
    socket.send(JSON.stringify(request), (error) => {
      // Node's writable callback can provide null on success even though the
      // ws declaration exposes only Error | undefined.
      if (error instanceof Error) {
        this.#pending.reject(
          request.messageId,
          new IbpProtocolError(
            IBP_ERROR_CODES.NATIVE_HOST_UNAVAILABLE,
            "Failed to send request to the native host",
            true,
            { cause: error },
          ),
        );
      }
    });
    return handle.promise;
  }

  #recordNavigationAudit(
    context: BrowserOperationContext,
    action: typeof BROWSER_OPEN_TAB_ACTION | typeof BROWSER_NAVIGATE_ACTION,
    parameters: OpenTabParameters | NavigateParameters,
    policyDecision: PolicyDecision,
    result: AuditResult,
    startedAt: number,
    tabId?: number,
    resultUrl?: string,
    resultOrigin?: string,
  ): void {
    const sanitizedInputUrl = sanitizeNavigationUrl(parameters.url);
    const url = resultUrl ?? sanitizedInputUrl;
    const origin = resultOrigin ?? new URL(parameters.url).origin;
    this.#auditLog.record({
      sessionId: context.sessionId,
      agentId: context.agentId,
      clientId: context.clientId,
      domain: auditDomainFor(url, origin),
      url,
      tabId: tabId ?? ("tabId" in parameters ? parameters.tabId : undefined),
      tool: action,
      parameters: {
        url: sanitizedInputUrl,
        active: parameters.active ?? "user-default",
        waitUntil: "waitUntil" in parameters ? parameters.waitUntil : "complete",
      },
      policyDecision: `${policyDecision.outcome}: ${policyDecision.reason}`,
      riskLevel: policyDecision.riskLevel,
      result,
      durationMs: Math.max(0, Date.now() - startedAt),
    });
  }

  #recordWaitForAudit(
    context: BrowserOperationContext,
    parameters: WaitForParameters,
    policyDecision: PolicyDecision,
    result: AuditResult,
    startedAt: number,
    data?: WaitForData,
  ): void {
    const condition = parameters.condition;
    this.#auditLog.record({
      sessionId: context.sessionId,
      agentId: context.agentId,
      clientId: context.clientId,
      domain: data === undefined ? "browser://tab" : auditDomainFor(data.tab.url, data.tab.origin),
      url: data?.tab.url ?? `browser://tab/${parameters.tabId}`,
      tabId: parameters.tabId,
      tool: BROWSER_WAIT_FOR_ACTION,
      parameters: {
        conditionType: condition.type,
        conditionSha256:
          "value" in condition
            ? createHash("sha256").update(condition.value).digest("hex")
            : undefined,
        conditionLength: "value" in condition ? condition.value.length : undefined,
        stableMs: "stableMs" in condition ? condition.stableMs : undefined,
        timeoutMs: parameters.timeoutMs,
        matched: data?.matched,
        elapsedMs: data?.elapsedMs,
      },
      policyDecision: `${policyDecision.outcome}: ${policyDecision.reason}`,
      riskLevel: policyDecision.riskLevel,
      result,
      durationMs: Math.max(0, Date.now() - startedAt),
    });
  }

  #recordListTabsAudit(
    context: BrowserOperationContext,
    policyDecision: PolicyDecision,
    result: AuditResult,
    startedAt: number,
  ): void {
    this.#auditLog.record({
      sessionId: context.sessionId,
      agentId: context.agentId,
      clientId: context.clientId,
      domain: "browser://tabs",
      url: "browser://tabs",
      tool: BROWSER_LIST_TABS_ACTION,
      parameters: {},
      policyDecision: `${policyDecision.outcome}: ${policyDecision.reason}`,
      riskLevel: policyDecision.riskLevel,
      result,
      durationMs: Math.max(0, Date.now() - startedAt),
    });
  }

  #recordUnlockTabAudit(
    context: BrowserOperationContext,
    parameters: UnlockTabParameters,
    policyDecision: PolicyDecision,
    result: AuditResult,
    startedAt: number,
  ): void {
    this.#auditLog.record({
      sessionId: context.sessionId,
      agentId: context.agentId,
      clientId: context.clientId,
      domain: "browser://tab",
      url: `browser://tab/${parameters.tabId}`,
      tabId: parameters.tabId,
      tool: BROWSER_UNLOCK_TAB_ACTION,
      parameters,
      policyDecision: `${policyDecision.outcome}: ${policyDecision.reason}`,
      riskLevel: policyDecision.riskLevel,
      result,
      durationMs: Math.max(0, Date.now() - startedAt),
    });
  }

  #recordControlIdentityAudit(
    context: BrowserOperationContext,
    parameters: SetControlIdentityParameters,
    policyDecision: PolicyDecision,
    result: AuditResult,
    startedAt: number,
  ): void {
    this.#auditLog.record({
      sessionId: context.sessionId,
      agentId: context.agentId,
      clientId: context.clientId,
      domain: "browser://tab",
      url: `browser://tab/${parameters.tabId}`,
      tabId: parameters.tabId,
      tool: BROWSER_SET_CONTROL_IDENTITY_ACTION,
      parameters,
      policyDecision: `${policyDecision.outcome}: ${policyDecision.reason}`,
      riskLevel: policyDecision.riskLevel,
      result,
      durationMs: Math.max(0, Date.now() - startedAt),
    });
  }

  #recordPageSnapshotAudit(
    context: BrowserOperationContext,
    parameters: GetPageSnapshotParameters,
    policyDecision: PolicyDecision,
    result: AuditResult,
    startedAt: number,
    snapshot?: PageSnapshot,
  ): void {
    const url = snapshot?.page.url ?? `browser://tab/${parameters.tabId}`;
    let domain = "browser://tab";
    if (snapshot !== undefined) {
      try {
        domain = new URL(snapshot.page.url).hostname || snapshot.page.origin;
      } catch {
        domain = snapshot.page.origin;
      }
    }
    this.#auditLog.record({
      sessionId: context.sessionId,
      agentId: context.agentId,
      clientId: context.clientId,
      domain,
      url,
      tabId: parameters.tabId,
      tool: BROWSER_GET_PAGE_SNAPSHOT_ACTION,
      parameters,
      policyDecision: `${policyDecision.outcome}: ${policyDecision.reason}`,
      riskLevel: policyDecision.riskLevel,
      result,
      durationMs: Math.max(0, Date.now() - startedAt),
    });
  }

  #recordFindElementsAudit(
    context: BrowserOperationContext,
    parameters: FindElementsParameters,
    policyDecision: PolicyDecision,
    result: AuditResult,
    startedAt: number,
    data?: FindElementsData,
  ): void {
    const url = data?.page.url ?? `browser://tab/${parameters.tabId}`;
    let domain = "browser://tab";
    if (data !== undefined) {
      try {
        domain = new URL(data.page.url).hostname || data.page.origin;
      } catch {
        domain = data.page.origin;
      }
    }
    const criteria = FIND_ELEMENTS_CRITERIA.filter(
      (criterion) => parameters[criterion] !== undefined,
    );
    this.#auditLog.record({
      sessionId: context.sessionId,
      agentId: context.agentId,
      clientId: context.clientId,
      domain,
      url,
      tabId: parameters.tabId,
      tool: BROWSER_FIND_ELEMENTS_ACTION,
      parameters: {
        tabId: parameters.tabId,
        domRevision: parameters.domRevision,
        criteria,
        matchMode: parameters.matchMode,
        maxResults: parameters.maxResults,
      },
      policyDecision: `${policyDecision.outcome}: ${policyDecision.reason}`,
      riskLevel: policyDecision.riskLevel,
      result,
      durationMs: Math.max(0, Date.now() - startedAt),
    });
  }

  #recordClickAudit(
    context: BrowserOperationContext,
    parameters: ClickElementParameters,
    policyDecision: PolicyDecision,
    result: AuditResult,
    startedAt: number,
    data?: ClickElementData,
  ): void {
    const url = data?.page.urlAfter ?? `browser://tab/${parameters.tabId}`;
    this.#auditLog.record({
      sessionId: context.sessionId,
      agentId: context.agentId,
      clientId: context.clientId,
      domain:
        data === undefined ? "browser://tab" : auditDomainFor(data.page.urlAfter, data.page.origin),
      url,
      tabId: parameters.tabId,
      tool: BROWSER_CLICK_ACTION,
      parameters: {
        tabId: parameters.tabId,
        domRevision: parameters.domRevision,
        elementId: parameters.elementId,
        scrollIntoView: parameters.scrollIntoView,
      },
      policyDecision: `${policyDecision.outcome}: ${policyDecision.reason}`,
      riskLevel: policyDecision.riskLevel,
      result,
      durationMs: Math.max(0, Date.now() - startedAt),
    });
  }

  #recordTypeTextAudit(
    context: BrowserOperationContext,
    parameters: TypeTextParameters,
    policyDecision: PolicyDecision,
    result: AuditResult,
    startedAt: number,
    data?: TypeTextData,
  ): void {
    this.#auditLog.record({
      sessionId: context.sessionId,
      agentId: context.agentId,
      clientId: context.clientId,
      domain:
        data === undefined ? "browser://tab" : auditDomainFor(data.page.url, data.page.origin),
      url: data?.page.url ?? `browser://tab/${parameters.tabId}`,
      tabId: parameters.tabId,
      tool: BROWSER_TYPE_TEXT_ACTION,
      parameters: {
        tabId: parameters.tabId,
        domRevision: parameters.domRevision,
        elementId: parameters.elementId,
        mode: parameters.mode,
        characters: parameters.text.length,
        dispatchChange: parameters.dispatchChange,
      },
      policyDecision: `${policyDecision.outcome}: ${policyDecision.reason}`,
      riskLevel: policyDecision.riskLevel,
      result,
      durationMs: Math.max(0, Date.now() - startedAt),
    });
  }

  #recordFileUploadAudit(
    context: BrowserOperationContext,
    parameters: SetFileInputFilesParameters,
    policyDecision: PolicyDecision,
    result: AuditResult,
    startedAt: number,
    data?: SetFileInputFilesData,
  ): void {
    this.#auditLog.record({
      sessionId: context.sessionId,
      agentId: context.agentId,
      clientId: context.clientId,
      domain:
        data === undefined ? "browser://tab" : auditDomainFor(data.page.url, data.page.origin),
      url: data?.page.url ?? `browser://tab/${parameters.tabId}`,
      tabId: parameters.tabId,
      tool: BROWSER_SET_FILE_INPUT_FILES_ACTION,
      parameters: {
        tabId: parameters.tabId,
        domRevision: parameters.domRevision,
        elementId: parameters.elementId,
        fileCount: parameters.filePaths.length,
        authorizationSource: parameters.authorization.source,
      },
      policyDecision: `${policyDecision.outcome}: ${policyDecision.reason}`,
      riskLevel: policyDecision.riskLevel,
      confirmationId: parameters.authorization.instructionId,
      result,
      durationMs: Math.max(0, Date.now() - startedAt),
    });
  }

  #recordSelectOptionAudit(
    context: BrowserOperationContext,
    parameters: SelectOptionParameters,
    policyDecision: PolicyDecision,
    result: AuditResult,
    startedAt: number,
    data?: SelectOptionData,
  ): void {
    const [selectionKind, optionCount] =
      "values" in parameters.selection
        ? (["values", parameters.selection.values.length] as const)
        : "labels" in parameters.selection
          ? (["labels", parameters.selection.labels.length] as const)
          : (["indices", parameters.selection.indices.length] as const);
    this.#auditLog.record({
      sessionId: context.sessionId,
      agentId: context.agentId,
      clientId: context.clientId,
      domain:
        data === undefined ? "browser://tab" : auditDomainFor(data.page.url, data.page.origin),
      url: data?.page.url ?? `browser://tab/${parameters.tabId}`,
      tabId: parameters.tabId,
      tool: BROWSER_SELECT_OPTION_ACTION,
      parameters: {
        tabId: parameters.tabId,
        domRevision: parameters.domRevision,
        elementId: parameters.elementId,
        selectionKind,
        optionCount,
        dispatchChange: parameters.dispatchChange,
      },
      policyDecision: `${policyDecision.outcome}: ${policyDecision.reason}`,
      riskLevel: policyDecision.riskLevel,
      result,
      durationMs: Math.max(0, Date.now() - startedAt),
    });
  }

  #recordSetCheckedAudit(
    context: BrowserOperationContext,
    parameters: SetCheckedParameters,
    checked: boolean,
    policyDecision: PolicyDecision,
    result: AuditResult,
    startedAt: number,
    data?: SetCheckedData,
  ): void {
    this.#auditLog.record({
      sessionId: context.sessionId,
      agentId: context.agentId,
      clientId: context.clientId,
      domain:
        data === undefined ? "browser://tab" : auditDomainFor(data.page.url, data.page.origin),
      url: data?.page.url ?? `browser://tab/${parameters.tabId}`,
      tabId: parameters.tabId,
      tool: checked ? BROWSER_CHECK_ACTION : BROWSER_UNCHECK_ACTION,
      parameters: {
        tabId: parameters.tabId,
        domRevision: parameters.domRevision,
        elementId: parameters.elementId,
        checked,
      },
      policyDecision: `${policyDecision.outcome}: ${policyDecision.reason}`,
      riskLevel: policyDecision.riskLevel,
      result,
      durationMs: Math.max(0, Date.now() - startedAt),
    });
  }

  #recordSubmitAudit(
    context: BrowserOperationContext,
    parameters: SubmitFormParameters,
    policyDecision: PolicyDecision,
    result: AuditResult,
    startedAt: number,
    data?: SubmitFormData,
  ): void {
    this.#auditLog.record({
      sessionId: context.sessionId,
      agentId: context.agentId,
      clientId: context.clientId,
      domain:
        data === undefined
          ? "browser://tab"
          : auditDomainFor(data.page.urlBefore, data.page.origin),
      url: data?.page.urlBefore ?? `browser://tab/${parameters.tabId}`,
      tabId: parameters.tabId,
      tool: BROWSER_SUBMIT_FORM_ACTION,
      parameters: {
        tabId: parameters.tabId,
        domRevision: parameters.domRevision,
        elementId: parameters.elementId,
        authorizationSource: parameters.authorization.source,
      },
      policyDecision: `${policyDecision.outcome}: ${policyDecision.reason}`,
      riskLevel: policyDecision.riskLevel,
      confirmationId: parameters.authorization.instructionId,
      result,
      durationMs: Math.max(0, Date.now() - startedAt),
    });
  }

  #recordAuthDialogAudit(
    context: BrowserOperationContext,
    action:
      | typeof BROWSER_GET_HTTP_AUTH_STATE_ACTION
      | typeof BROWSER_AUTHENTICATE_HTTP_ACTION
      | typeof BROWSER_HANDLE_JAVASCRIPT_DIALOG_ACTION,
    tabId: number,
    policyDecision: PolicyDecision,
    result: AuditResult,
    startedAt: number,
    parameters: Record<string, string | number | boolean | undefined>,
    confirmationId?: string,
  ): void {
    const origin = parameters["origin"];
    const safeOrigin = typeof origin === "string" ? origin : undefined;
    this.#auditLog.record({
      sessionId: context.sessionId,
      agentId: context.agentId,
      clientId: context.clientId,
      domain: safeOrigin === undefined ? "browser://tab" : auditDomainFor(safeOrigin, safeOrigin),
      url: safeOrigin ?? `browser://tab/${tabId}`,
      tabId,
      tool: action,
      parameters: { tabId, ...parameters },
      policyDecision: `${policyDecision.outcome}: ${policyDecision.reason}`,
      riskLevel: policyDecision.riskLevel,
      confirmationId,
      result,
      durationMs: Math.max(0, Date.now() - startedAt),
    });
  }

  #recordEvaluateAudit(
    context: BrowserOperationContext,
    parameters: EvaluateJavaScriptParameters,
    policyDecision: PolicyDecision,
    result: AuditResult,
    startedAt: number,
    data?: EvaluateJavaScriptData,
  ): void {
    this.#auditLog.record({
      sessionId: context.sessionId,
      agentId: context.agentId,
      clientId: context.clientId,
      domain: "browser://tab",
      url: `browser://tab/${parameters.tabId}`,
      tabId: parameters.tabId,
      tool: BROWSER_EVALUATE_ACTION,
      parameters: {
        tabId: parameters.tabId,
        expressionSha256: createHash("sha256").update(parameters.expression).digest("hex"),
        expressionLength: parameters.expression.length,
        mode: parameters.mode,
        world: parameters.world,
        valueType: data?.valueType,
        truncated: data?.truncated,
        authorizationSource: parameters.authorization.source,
      },
      policyDecision: `${policyDecision.outcome}: ${policyDecision.reason}`,
      riskLevel: policyDecision.riskLevel,
      confirmationId: parameters.authorization.instructionId,
      result,
      durationMs: Math.max(0, Date.now() - startedAt),
    });
  }

  #recordScreenshotAudit(
    context: BrowserOperationContext,
    parameters: CaptureScreenshotParameters,
    policyDecision: PolicyDecision,
    result: AuditResult,
    startedAt: number,
    data?: CaptureScreenshotData,
  ): void {
    this.#auditLog.record({
      sessionId: context.sessionId,
      agentId: context.agentId,
      clientId: context.clientId,
      domain: "browser://tab",
      url: `browser://tab/${parameters.tabId}`,
      tabId: parameters.tabId,
      tool: BROWSER_SCREENSHOT_ACTION,
      parameters: {
        tabId: parameters.tabId,
        quality: parameters.quality,
        maxWidth: parameters.maxWidth,
        maxHeight: parameters.maxHeight,
        mode: parameters.mode,
        annotationCount: parameters.annotations.length,
        screenshotId: data?.screenshotId,
        width: data?.width,
        height: data?.height,
        byteLength: data?.byteLength,
        documentId: data?.documentId,
        domRevision: data?.domRevision,
        sourceCssRect: data?.capture.sourceCssRect,
      },
      policyDecision: `${policyDecision.outcome}: ${policyDecision.reason}`,
      riskLevel: policyDecision.riskLevel,
      result,
      durationMs: Math.max(0, Date.now() - startedAt),
    });
  }

  #recordClickAtAudit(
    context: BrowserOperationContext,
    parameters: ClickAtParameters,
    policyDecision: PolicyDecision,
    result: AuditResult,
    startedAt: number,
    data?: ClickAtData,
  ): void {
    this.#auditLog.record({
      sessionId: context.sessionId,
      agentId: context.agentId,
      clientId: context.clientId,
      domain:
        data === undefined ? "browser://tab" : auditDomainFor(data.page.urlAfter, data.page.origin),
      url: data?.page.urlAfter ?? `browser://tab/${parameters.tabId}`,
      tabId: parameters.tabId,
      tool: BROWSER_CLICK_AT_ACTION,
      parameters: {
        tabId: parameters.tabId,
        documentId: parameters.documentId,
        domRevision: parameters.domRevision,
        x: parameters.x,
        y: parameters.y,
      },
      policyDecision: `${policyDecision.outcome}: ${policyDecision.reason}`,
      riskLevel: policyDecision.riskLevel,
      result,
      durationMs: Math.max(0, Date.now() - startedAt),
    });
  }

  #auditResultForError(error: unknown): AuditResult {
    if (
      error instanceof IbpProtocolError &&
      (error.code === IBP_ERROR_CODES.PERMISSION_DENIED ||
        error.code === IBP_ERROR_CODES.POLICY_DENIED ||
        error.code === IBP_ERROR_CODES.RESTRICTED_PAGE ||
        error.code === IBP_ERROR_CODES.CONFIRMATION_REQUIRED ||
        error.code === IBP_ERROR_CODES.SCRIPT_POLICY_DENIED ||
        error.code === IBP_ERROR_CODES.SESSION_UNAUTHORIZED)
    ) {
      return "denied";
    }
    if (error instanceof IbpProtocolError && error.code === IBP_ERROR_CODES.CANCELLED) {
      return "cancelled";
    }
    return "failure";
  }

  public get connected(): boolean {
    return this.#socket?.readyState === WebSocket.OPEN;
  }

  public get address(): DesktopBridgeAddress | undefined {
    return this.#address;
  }

  #handleMessage(serialized: string): void {
    try {
      const envelope = parseIbpEnvelope(JSON.parse(serialized) as unknown);
      if (envelope.direction === "response") {
        this.#pending.resolve(envelope.correlationId, envelope);
      }
    } catch {
      // Phase 1 deliberately drops invalid or unsolicited messages. The Tauri
      // desktop will surface sanitized diagnostics in its audit UI.
    }
  }

  #resolveConnectionWaiters(): void {
    for (const waiter of this.#connectionWaiters) {
      clearTimeout(waiter.timer);
      waiter.resolve();
    }
    this.#connectionWaiters.clear();
  }

  #rejectConnectionWaiters(error: Error): void {
    for (const waiter of this.#connectionWaiters) {
      clearTimeout(waiter.timer);
      waiter.reject(error);
    }
    this.#connectionWaiters.clear();
  }
}
