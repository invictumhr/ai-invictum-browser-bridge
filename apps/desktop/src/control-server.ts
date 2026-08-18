import { createHash, randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

import {
  IBP_ERROR_CODES,
  IbpProtocolError,
  getActionMetadata,
  isZodError,
  parseActionParameters,
  resultValidationError,
  type CaptureScreenshotInput,
  type CloseTabInput,
  type ClickAtParameters,
  type ClickElementInput,
  type EvaluateJavaScriptInput,
  type MutateDomInput,
  type InspectElementInput,
  type ManageCssInput,
  type ObserveEventsInput,
  type ExecuteJavaScriptInput,
  type FindElementsInput,
  type FindNaturalLanguageInput,
  type GetPageSnapshotInput,
  type GetPageTextInput,
  type NavigateInput,
  type HistoryNavigationInput,
  type ActivateTabParameters,
  type OpenTabInput,
  type SelectOptionInput,
  type SetCheckedParameters,
  type SetControlIdentityParameters,
  type SubmitFormParameters,
  type GetWordPressMenuInput,
  type EditWordPressMenuInput,
  type GetWordPressAdminInput,
  type WordPressListTableActionInput,
  type GetWordPressEditorInput,
  type EditWordPressEditorInput,
  type TypeTextInput,
  type SetFileInputFilesInput,
  type UnlockTabParameters,
  type WaitForInput,
  type HttpAuthStateParameters,
  type AuthenticateHttpInput,
  type HandleJavaScriptDialogInput,
  type BrowserConsoleInput,
  type NetworkCaptureInput,
  type DeviceEmulationInput,
  type PerformGestureInput,
  type PrintToPdfInput,
  type PageApiRequestInput,
} from "@invictum/protocol";

import type { BrowserOperationContext, DesktopBridgeServer } from "./server.js";

const MAX_BODY_BYTES = 1024 * 1024;

export interface DesktopControlServerOptions {
  bridge: DesktopBridgeServer;
  host?: string;
  port?: number;
}

export interface DesktopControlAddress {
  host: string;
  port: number;
  url: string;
}

interface ControlContextInput {
  sessionId?: string;
  agentId?: string;
  clientId?: string;
  sessionAuthorized?: boolean;
}

interface ControlCallInput {
  action: string;
  parameters?: unknown;
  context?: ControlContextInput;
  idempotencyKey?: string;
}

interface IdempotencyEntry {
  readonly parameterHash: string;
  readonly promise: Promise<unknown>;
  readonly expiresAt: number;
}

const IDEMPOTENCY_TTL_MS = 2 * 60 * 1_000;
const MAX_IDEMPOTENCY_ENTRIES = 256;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalize(value[key])]),
  );
};

const parameterHash = (action: string, parameters: unknown): string =>
  createHash("sha256")
    .update(JSON.stringify(canonicalize({ action, parameters })))
    .digest("hex");

const hasExplicitAuthorization = (parameters: unknown): boolean => {
  if (!isRecord(parameters) || !isRecord(parameters["authorization"])) return false;
  const authorization = parameters["authorization"];
  return (
    authorization["source"] === "explicit_user_instruction" &&
    typeof authorization["instructionId"] === "string" &&
    authorization["instructionId"].length > 0
  );
};

const writeJson = (response: ServerResponse, status: number, body: unknown): void => {
  const serialized = JSON.stringify(body);
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(serialized),
    "cache-control": "no-store",
  });
  response.end(serialized);
};

const readJson = async (request: IncomingMessage): Promise<unknown> => {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > MAX_BODY_BYTES) {
      throw new IbpProtocolError(
        IBP_ERROR_CODES.MESSAGE_TOO_LARGE,
        "Control request exceeds 1 MiB",
        false,
      );
    }
    chunks.push(buffer);
  }
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch (error) {
    throw new IbpProtocolError(
      IBP_ERROR_CODES.INVALID_MESSAGE,
      "Control request is not valid JSON",
      false,
      { cause: error },
    );
  }
};

const contextFrom = (input: ControlContextInput | undefined): BrowserOperationContext => ({
  sessionId: input?.sessionId?.slice(0, 128) || randomUUID(),
  agentId: input?.agentId?.slice(0, 128) || "local-agent",
  clientId: input?.clientId?.slice(0, 128) || "invictum-control-api",
  sessionAuthorized: input?.sessionAuthorized ?? true,
});

export class DesktopControlServer {
  readonly #bridge: DesktopBridgeServer;
  readonly #host: string;
  readonly #requestedPort: number;
  readonly #controlledTabs = new Map<string, Set<number>>();
  readonly #idempotency = new Map<string, IdempotencyEntry>();
  #server: Server | undefined;
  #address: DesktopControlAddress | undefined;

  public constructor(options: DesktopControlServerOptions) {
    this.#bridge = options.bridge;
    this.#host = options.host ?? "127.0.0.1";
    if (this.#host !== "127.0.0.1" && this.#host !== "::1") {
      throw new Error("Desktop control API must bind to a loopback address");
    }
    this.#requestedPort = options.port ?? 47_820;
  }

  public async start(): Promise<DesktopControlAddress> {
    if (this.#server !== undefined) throw new Error("Desktop control server is already running");
    const server = createServer((request, response) => {
      void this.#handle(request, response);
    });
    this.#server = server;
    await new Promise<void>((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
      server.listen(this.#requestedPort, this.#host);
    });
    const address = server.address();
    if (address === null || typeof address === "string") {
      throw new Error("Desktop control API did not bind to a TCP port");
    }
    this.#address = {
      host: this.#host,
      port: address.port,
      url: `http://${this.#host}:${address.port}`,
    };
    return this.#address;
  }

  public async stop(): Promise<void> {
    const server = this.#server;
    this.#server = undefined;
    this.#address = undefined;
    if (server === undefined) return;
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error === undefined ? resolve() : reject(error)));
    });
  }

  async #handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    try {
      const requestHost = request.headers.host ?? "";
      if (!/^(?:127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(requestHost)) {
        throw new IbpProtocolError(
          IBP_ERROR_CODES.PERMISSION_DENIED,
          "Control API rejected a non-loopback Host header",
          false,
        );
      }
      if (request.method === "POST") {
        if (request.headers.origin !== undefined) {
          throw new IbpProtocolError(
            IBP_ERROR_CODES.PERMISSION_DENIED,
            "Browser-originated control requests are not allowed",
            false,
          );
        }
        if (!request.headers["content-type"]?.toLowerCase().startsWith("application/json")) {
          throw new IbpProtocolError(
            IBP_ERROR_CODES.INVALID_MESSAGE,
            "Control POST requests require application/json",
            false,
          );
        }
      }
      if (request.method === "GET" && request.url === "/v1/health") {
        writeJson(response, 200, {
          ok: true,
          component: "desktop-authority",
          nativeConnected: this.#bridge.connected,
          protocol: "ibp",
          protocolVersion: "1.0",
          nativeUrl: this.#bridge.address?.url,
          controlUrl: this.#address?.url,
        });
        return;
      }
      if (request.method === "POST" && request.url === "/v1/call") {
        const parsed = await readJson(request);
        if (!isRecord(parsed) || typeof parsed["action"] !== "string") {
          throw new IbpProtocolError(
            IBP_ERROR_CODES.INVALID_MESSAGE,
            "Control call requires an action string",
            false,
          );
        }
        const contextInput = isRecord(parsed["context"])
          ? (parsed["context"] as ControlContextInput)
          : undefined;
        const context = contextFrom(contextInput);
        const idempotencyKey =
          typeof parsed["idempotencyKey"] === "string" ? parsed["idempotencyKey"] : undefined;
        if (
          idempotencyKey !== undefined &&
          (idempotencyKey.length < 1 ||
            idempotencyKey.length > 128 ||
            !/^[A-Za-z0-9._:-]+$/.test(idempotencyKey))
        ) {
          throw new IbpProtocolError(
            IBP_ERROR_CODES.INVALID_PARAMETERS,
            "idempotencyKey must contain 1-128 letters, digits, dot, underscore, colon, or hyphen",
            false,
            {
              details: {
                stage: "control_preflight",
                field: "idempotencyKey",
                allowedPattern: "^[A-Za-z0-9._:-]+$",
              },
            },
          );
        }
        const callInput: ControlCallInput = {
          action: parsed["action"],
          parameters: parsed["parameters"] ?? {},
          context: contextInput,
          ...(idempotencyKey === undefined ? {} : { idempotencyKey }),
        };
        const data = await this.#dispatchIdempotently(callInput, context);
        writeJson(response, 200, { ok: true, data, sessionId: context.sessionId });
        return;
      }
      if (request.method === "POST" && request.url === "/v1/session/close") {
        const parsed = await readJson(request);
        const contextInput =
          isRecord(parsed) && isRecord(parsed["context"])
            ? (parsed["context"] as ControlContextInput)
            : isRecord(parsed)
              ? (parsed as ControlContextInput)
              : undefined;
        const context = contextFrom(contextInput);
        const released = await this.#releaseSession(context);
        writeJson(response, 200, { ok: true, data: { sessionId: context.sessionId, released } });
        return;
      }
      writeJson(response, 404, {
        ok: false,
        error: { code: "NOT_FOUND", message: "Unknown control endpoint", retryable: false },
      });
    } catch (error) {
      const protocolError =
        error instanceof IbpProtocolError
          ? error
          : isZodError(error)
            ? resultValidationError("control.response", error, "desktop_result")
            : new IbpProtocolError(
                IBP_ERROR_CODES.BROWSER_API_ERROR,
                error instanceof Error ? error.message : "Unknown control API error",
                false,
                { cause: error },
              );
      const validationFailure =
        protocolError.code === IBP_ERROR_CODES.INVALID_MESSAGE ||
        protocolError.code === IBP_ERROR_CODES.INVALID_PARAMETERS;
      writeJson(response, validationFailure ? 400 : 409, {
        ok: false,
        error: {
          code: protocolError.code,
          message: protocolError.message,
          retryable: protocolError.retryable,
          ...(protocolError.details === undefined ? {} : { details: protocolError.details }),
        },
      });
    }
  }

  async #dispatchIdempotently(
    input: ControlCallInput,
    context: BrowserOperationContext,
  ): Promise<unknown> {
    const idempotencyKey = input.idempotencyKey;
    if (idempotencyKey === undefined) return this.#dispatch(input, context);
    const metadata = getActionMetadata(input.action);
    // Do not consume a logical-operation key for a request that has not yet
    // passed local shape/authorization preflight. The user may add the exact
    // authorization object and safely reuse the intended operation key.
    if (
      metadata === undefined ||
      (metadata.requiresAuthorization && !hasExplicitAuthorization(input.parameters))
    ) {
      return this.#dispatch(input, context);
    }
    if (input.action !== "system.ping") {
      parseActionParameters(input.action, input.parameters ?? {});
    }

    this.#pruneIdempotencyEntries();
    const tabScope =
      isRecord(input.parameters) && typeof input.parameters["tabId"] === "number"
        ? String(input.parameters["tabId"])
        : "global";
    const registryKey = `${context.sessionId}\u0000${input.action}\u0000${tabScope}\u0000${idempotencyKey}`;
    const hash = parameterHash(input.action, input.parameters ?? {});
    const existing = this.#idempotency.get(registryKey);
    if (existing !== undefined) {
      if (existing.parameterHash !== hash) {
        throw new IbpProtocolError(
          IBP_ERROR_CODES.INVALID_PARAMETERS,
          "The idempotency key was already used with different parameters",
          false,
          {
            details: {
              stage: "idempotency",
              action: input.action,
              tabScope,
              idempotencyKey,
              recovery: "Generate a new idempotencyKey for a different logical operation.",
            },
          },
        );
      }
      return existing.promise;
    }

    const promise = this.#dispatch(input, context);
    this.#idempotency.set(registryKey, {
      parameterHash: hash,
      promise,
      expiresAt: Date.now() + IDEMPOTENCY_TTL_MS,
    });
    return promise;
  }

  #pruneIdempotencyEntries(): void {
    const now = Date.now();
    for (const [key, entry] of this.#idempotency) {
      if (entry.expiresAt <= now) this.#idempotency.delete(key);
    }
    while (this.#idempotency.size >= MAX_IDEMPOTENCY_ENTRIES) {
      const oldestKey = this.#idempotency.keys().next().value as string | undefined;
      if (oldestKey === undefined) break;
      this.#idempotency.delete(oldestKey);
    }
  }

  async #dispatch(input: ControlCallInput, context: BrowserOperationContext): Promise<unknown> {
    if (input.action === "system.ping") return this.#bridge.ping(context.sessionId);
    const metadata = getActionMetadata(input.action);
    if (metadata?.requiresAuthorization && !hasExplicitAuthorization(input.parameters)) {
      throw new IbpProtocolError(
        IBP_ERROR_CODES.CONFIRMATION_REQUIRED,
        `${input.action} requires explicit user authorization before it can run`,
        false,
        {
          details: {
            stage: "authorization_preflight",
            action: input.action,
            riskLevel: metadata.riskLevel,
            destructive: metadata.destructive,
            requiredAuthorization: {
              source: "explicit_user_instruction",
              instructionId: "user-approved-operation-id",
            },
            recovery: {
              retrySameAction: true,
              addParameter: "authorization",
              guidance:
                "Confirm the exact effect with the user, then retry with an explicit instructionId. Never synthesize approval.",
            },
          },
        },
      );
    }
    const parameters = parseActionParameters(input.action, input.parameters ?? {});
    let result: unknown;
    switch (input.action) {
      case "system.capabilities":
        return this.#bridge.capabilities(context.sessionId);
      case "browser.list_tabs":
        return this.#bridge.listTabs(context);
      case "browser.open_tab":
        result = await this.#bridge.openTab(context, parameters as OpenTabInput);
        break;
      case "browser.close_tab": {
        const closed = await this.#bridge.closeTab(context, parameters as CloseTabInput);
        this.#controlledTabs.get(context.sessionId)?.delete(closed.tabId);
        return closed;
      }
      case "browser.navigate":
        result = await this.#bridge.navigate(context, parameters as NavigateInput);
        break;
      case "browser.go_back":
        result = await this.#bridge.navigateHistory(
          context,
          "back",
          parameters as HistoryNavigationInput,
        );
        break;
      case "browser.go_forward":
        result = await this.#bridge.navigateHistory(
          context,
          "forward",
          parameters as HistoryNavigationInput,
        );
        break;
      case "browser.activate_tab":
        result = await this.#bridge.activateTab(context, parameters as ActivateTabParameters);
        break;
      case "browser.wait_for":
        result = await this.#bridge.waitFor(context, parameters as WaitForInput);
        break;
      case "browser.set_control_identity":
        result = await this.#bridge.setControlIdentity(
          context,
          parameters as SetControlIdentityParameters,
        );
        break;
      case "browser.get_page_snapshot":
        result = await this.#bridge.getPageSnapshot(context, parameters as GetPageSnapshotInput);
        break;
      case "browser.get_page_text":
        result = await this.#bridge.getPageText(context, parameters as GetPageTextInput);
        break;
      case "browser.find_elements":
        result = await this.#bridge.findElements(context, parameters as FindElementsInput);
        break;
      case "browser.find_natural_language":
        result = await this.#bridge.findNaturalLanguage(
          context,
          parameters as FindNaturalLanguageInput,
        );
        break;
      case "browser.click":
        result = await this.#bridge.click(context, parameters as ClickElementInput);
        break;
      case "browser.type_text":
        result = await this.#bridge.typeText(context, parameters as TypeTextInput);
        break;
      case "browser.set_file_input_files":
        result = await this.#bridge.setFileInputFiles(
          context,
          parameters as SetFileInputFilesInput,
        );
        break;
      case "browser.select_option":
        result = await this.#bridge.selectOption(context, parameters as SelectOptionInput);
        break;
      case "browser.check":
        result = await this.#bridge.check(context, parameters as SetCheckedParameters);
        break;
      case "browser.uncheck":
        result = await this.#bridge.uncheck(context, parameters as SetCheckedParameters);
        break;
      case "browser.submit_form":
        result = await this.#bridge.submitForm(context, parameters as SubmitFormParameters);
        break;
      case "browser.get_wordpress_menu":
        result = await this.#bridge.getWordPressMenu(context, parameters as GetWordPressMenuInput);
        break;
      case "browser.edit_wordpress_menu":
        result = await this.#bridge.editWordPressMenu(
          context,
          parameters as EditWordPressMenuInput,
        );
        break;
      case "browser.get_wordpress_admin":
        result = await this.#bridge.getWordPressAdmin(
          context,
          parameters as GetWordPressAdminInput,
        );
        break;
      case "browser.wordpress_list_table_action":
        result = await this.#bridge.wordpressListTableAction(
          context,
          parameters as WordPressListTableActionInput,
        );
        break;
      case "browser.get_wordpress_editor":
        result = await this.#bridge.getWordPressEditor(
          context,
          parameters as GetWordPressEditorInput,
        );
        break;
      case "browser.edit_wordpress_editor":
        result = await this.#bridge.editWordPressEditor(
          context,
          parameters as EditWordPressEditorInput,
        );
        break;
      case "browser.evaluate":
        result = await this.#bridge.evaluateJavaScript(
          context,
          parameters as EvaluateJavaScriptInput,
        );
        break;
      case "browser.mutate_dom":
        result = await this.#bridge.mutateDom(context, parameters as MutateDomInput);
        break;
      case "browser.inspect_element":
        result = await this.#bridge.inspectElement(context, parameters as InspectElementInput);
        break;
      case "browser.manage_css":
        result = await this.#bridge.manageCss(context, parameters as ManageCssInput);
        break;
      case "browser.observe_events":
        result = await this.#bridge.observeEvents(context, parameters as ObserveEventsInput);
        break;
      case "browser.execute_javascript":
        result = await this.#bridge.executeJavaScript(
          context,
          parameters as ExecuteJavaScriptInput,
        );
        break;
      case "browser.console":
        result = await this.#bridge.manageBrowserConsole(
          context,
          parameters as BrowserConsoleInput,
        );
        break;
      case "browser.network":
        result = await this.#bridge.manageNetworkCapture(
          context,
          parameters as NetworkCaptureInput,
        );
        break;
      case "browser.emulate_device":
        result = await this.#bridge.manageDeviceEmulation(
          context,
          parameters as DeviceEmulationInput,
        );
        break;
      case "browser.perform_gesture":
        result = await this.#bridge.performGesture(context, parameters as PerformGestureInput);
        break;
      case "browser.print_to_pdf":
        result = await this.#bridge.printToPdf(context, parameters as PrintToPdfInput);
        break;
      case "browser.page_api_request":
        result = await this.#bridge.pageApiRequest(context, parameters as PageApiRequestInput);
        break;
      case "browser.screenshot":
        result = await this.#bridge.captureScreenshot(
          context,
          parameters as CaptureScreenshotInput,
        );
        break;
      case "browser.click_at":
        result = await this.#bridge.clickAt(context, parameters as ClickAtParameters);
        break;
      case "browser.get_http_auth_state":
        result = await this.#bridge.getHttpAuthState(
          context,
          parameters as HttpAuthStateParameters,
        );
        break;
      case "browser.authenticate_http":
        result = await this.#bridge.authenticateHttp(context, parameters as AuthenticateHttpInput);
        break;
      case "browser.handle_javascript_dialog":
        result = await this.#bridge.handleJavaScriptDialog(
          context,
          parameters as HandleJavaScriptDialogInput,
        );
        break;
      case "browser.unlock_tab": {
        const unlock = await this.#bridge.unlockTab(context, parameters as UnlockTabParameters);
        this.#controlledTabs.get(context.sessionId)?.delete(unlock.tabId);
        return unlock;
      }
      default:
        throw new IbpProtocolError(
          IBP_ERROR_CODES.UNSUPPORTED_ACTION,
          `Unsupported control action: ${input.action}`,
          false,
        );
    }
    const tabId = this.#targetTabId(input.action, parameters, result);
    if (tabId !== undefined) {
      const tabs = this.#controlledTabs.get(context.sessionId) ?? new Set<number>();
      tabs.add(tabId);
      this.#controlledTabs.set(context.sessionId, tabs);
    }
    return result;
  }

  #targetTabId(action: string, parameters: unknown, result: unknown): number | undefined {
    if (
      action === "browser.open_tab" &&
      isRecord(result) &&
      isRecord(result["tab"]) &&
      typeof result["tab"]["tabId"] === "number"
    ) {
      return undefined;
    }
    return isRecord(parameters) && typeof parameters["tabId"] === "number"
      ? parameters["tabId"]
      : undefined;
  }

  async #releaseSession(context: BrowserOperationContext): Promise<number[]> {
    const tabIds = [...(this.#controlledTabs.get(context.sessionId) ?? [])];
    const released: number[] = [];
    for (const tabId of tabIds) {
      try {
        const result = await this.#bridge.unlockTab(context, { tabId });
        if (result.unlocked) released.push(tabId);
      } catch (error) {
        if (!(error instanceof IbpProtocolError && error.code === IBP_ERROR_CODES.POLICY_DENIED)) {
          throw error;
        }
      }
    }
    this.#controlledTabs.delete(context.sessionId);
    return released;
  }
}
