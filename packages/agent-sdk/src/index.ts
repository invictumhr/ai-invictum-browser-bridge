import { randomUUID } from "node:crypto";
import type {
  GetTerminalsData,
  ReadTerminalInput,
  TerminalInputInput,
  TerminalInputData,
  TerminalReadData,
} from "@invictum/protocol";

import { EnhancedActionRunner, type EnhancedActionHooks } from "./enhanced-actions.js";

export * from "./enhanced-actions.js";

export interface InvictumAgentContext {
  sessionId: string;
  agentId: string;
  clientId: string;
  sessionAuthorized: boolean;
}

export interface InvictumControlClientOptions {
  baseUrl?: string;
  context?: Partial<InvictumAgentContext>;
  fetchImplementation?: typeof fetch;
}

export interface ScreenshotAnnotationInput {
  target:
    | { type: "element"; elementId: string; padding?: number }
    | {
        type: "region";
        region: {
          x: number;
          y: number;
          width: number;
          height: number;
          coordinateSpace?: "viewport" | "document";
        };
      };
  shape?: "rectangle" | "rounded_rectangle" | "ellipse" | "circle" | "highlight";
  stroke?: string;
  strokeWidth?: number;
  fill?: string;
  fillOpacity?: number;
  label?: {
    text: string;
    position?: "auto" | "top" | "bottom" | "left" | "right";
    color?: string;
    background?: string;
    fontSize?: number;
    arrow?: boolean;
  };
}

export interface CaptureScreenshotOptions {
  tabId: number;
  quality?: number;
  maxWidth?: number;
  maxHeight?: number;
  mode?: "viewport" | "element" | "region" | "full_page";
  documentId?: string;
  domRevision?: number;
  elementId?: string;
  padding?: number;
  region?: {
    x: number;
    y: number;
    width: number;
    height: number;
    coordinateSpace?: "viewport" | "document";
  };
  annotations?: ScreenshotAnnotationInput[];
}

export interface InvictumBatchStep {
  id: string;
  action: string;
  parameters?: Record<string, unknown>;
  idempotencyKey?: string;
  dryRun?: boolean;
  postSnapshot?: "outline" | "interactive";
  domDelta?: boolean;
  verify?: Record<string, unknown>;
  autoMarks?: Record<string, unknown>;
  timings?: boolean;
}

export interface InvictumBatchStepResult {
  id: string;
  action: string;
  success: boolean;
  data?: unknown;
  error?: { code: string; message: string; retryable: boolean };
}

export interface InvictumBatchResult {
  steps: InvictumBatchStepResult[];
  completed: number;
  failed: number;
  stoppedEarly: boolean;
}

interface ControlSuccess<T> {
  ok: true;
  data?: T;
  sessionId?: string;
  [key: string]: unknown;
}

interface ControlFailure {
  ok: false;
  error: { code: string; message: string; retryable: boolean; details?: unknown };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const readBatchPath = (value: unknown, path: string): unknown => {
  if (path.length === 0) return value;
  let current = value;
  for (const segment of path.split(".")) {
    if (Array.isArray(current) && /^\d+$/u.test(segment)) current = current[Number(segment)];
    else if (isRecord(current) && Object.hasOwn(current, segment)) current = current[segment];
    else throw new Error(`Batch placeholder path '${path}' does not exist`);
  }
  return current;
};

const resolveBatchValue = (
  value: unknown,
  completed: ReadonlyMap<string, unknown>,
  last: unknown,
  depth = 0,
): unknown => {
  if (depth > 32) throw new Error("Batch parameter nesting exceeds 32 levels");
  if (typeof value === "string") {
    const step = /^\$steps\.([A-Za-z][A-Za-z0-9_-]{0,63})(?:\.(.*))?$/u.exec(value);
    if (step !== null) {
      if (!completed.has(step[1]!)) {
        throw new Error(`Batch placeholder references unfinished step '${step[1]}'`);
      }
      return readBatchPath(completed.get(step[1]!), step[2] ?? "");
    }
    const latest = /^\$last(?:\.(.*))?$/u.exec(value);
    if (latest !== null) {
      if (last === undefined) throw new Error("Batch $last placeholder has no successful step");
      return readBatchPath(last, latest[1] ?? "");
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => resolveBatchValue(item, completed, last, depth + 1));
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        resolveBatchValue(item, completed, last, depth + 1),
      ]),
    );
  }
  return value;
};

export class InvictumControlError extends Error {
  public constructor(
    public readonly code: string,
    message: string,
    public readonly retryable: boolean,
    public readonly details?: unknown,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "InvictumControlError";
  }
}

export class InvictumControlClient {
  readonly #baseUrl: string;
  readonly #fetch: typeof fetch;
  readonly #context: InvictumAgentContext;
  readonly #enhancedActions: EnhancedActionRunner;

  public constructor(options: InvictumControlClientOptions = {}) {
    this.#baseUrl = (options.baseUrl ?? "http://127.0.0.1:47820").replace(/\/$/, "");
    this.#fetch = options.fetchImplementation ?? fetch;
    this.#context = {
      sessionId: options.context?.sessionId ?? randomUUID(),
      agentId: options.context?.agentId ?? "local-agent",
      clientId: options.context?.clientId ?? "invictum-agent-sdk",
      sessionAuthorized: options.context?.sessionAuthorized ?? true,
    };
    this.#enhancedActions = new EnhancedActionRunner(this);
  }

  public get context(): Readonly<InvictumAgentContext> {
    return this.#context;
  }

  public async health(): Promise<Record<string, unknown>> {
    const response = await this.#fetch(`${this.#baseUrl}/v1/health`);
    return this.#parse<Record<string, unknown>>(response);
  }

  public async call<T = unknown>(
    action: string,
    parameters: unknown = {},
    options: { idempotencyKey?: string } = {},
  ): Promise<T> {
    const response = await this.#fetch(`${this.#baseUrl}/v1/call`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action,
        parameters,
        context: this.#context,
        ...(options.idempotencyKey === undefined ? {} : { idempotencyKey: options.idempotencyKey }),
      }),
    });
    return this.#parse<T>(response);
  }

  public async closeSession(): Promise<{ sessionId: string; released: number[] }> {
    const response = await this.#fetch(`${this.#baseUrl}/v1/session/close`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ context: this.#context }),
    });
    const result = await this.#parse<{ sessionId: string; released: number[] }>(response);
    this.#enhancedActions.clear();
    return result;
  }

  /**
   * Runs an action with the same high-level ergonomics exposed through MCP:
   * dryRun, postSnapshot, domDelta, verify, autoMarks, timings, and safe
   * stale-reference relocation for R0/R1 element actions.
   */
  public async enhancedCall<T = unknown>(
    action: string,
    parameters: Record<string, unknown> = {},
    hooks: EnhancedActionHooks = {},
  ): Promise<T> {
    return this.#enhancedActions.run(action, parameters, {
      ...hooks,
      createError:
        hooks.createError ??
        ((code, message, retryable, details) =>
          new InvictumControlError(code, message, retryable, details)),
    }) as Promise<T>;
  }

  public clearEnhancedActionState(tabId?: number): void {
    if (tabId === undefined) this.#enhancedActions.clear();
    else this.#enhancedActions.clearTab(tabId);
  }

  public enhancedActionStateStats(): Readonly<{
    cachedTabs: number;
    cachedSnapshots: number;
    cachedElementReferences: number;
  }> {
    return this.#enhancedActions.stateStats();
  }

  public async identifyTab(
    tabId: number,
    agentName: string,
  ): Promise<{ tabId: number; agentName: string; label: string; identified: true }> {
    return this.call("browser.set_control_identity", { tabId, agentName });
  }

  public async goBack(tabId: number): Promise<Record<string, unknown>> {
    return this.call("browser.go_back", { tabId });
  }

  public async goForward(tabId: number): Promise<Record<string, unknown>> {
    return this.call("browser.go_forward", { tabId });
  }

  public async activateTab(tabId: number): Promise<Record<string, unknown>> {
    return this.call("browser.activate_tab", { tabId });
  }

  public async getPageText(
    tabId: number,
    options: {
      maxChars?: number;
      format?: "text" | "markdown";
      scope?: Record<string, unknown>;
    } = {},
  ): Promise<Record<string, unknown>> {
    return this.call("browser.get_page_text", { tabId, ...options });
  }

  public async findNaturalLanguage(
    tabId: number,
    query: string,
    options: { maxResults?: number; includeHidden?: boolean } = {},
  ): Promise<Record<string, unknown>> {
    return this.call("browser.find_natural_language", { tabId, query, ...options });
  }

  public async pageApiRequest(
    input: Record<string, unknown> & { tabId: number; url: string },
  ): Promise<Record<string, unknown>> {
    return this.call("browser.page_api_request", input);
  }

  public async getTerminals(tabId: number): Promise<GetTerminalsData> {
    return this.call("browser.get_terminals", { tabId });
  }

  public async readTerminal(input: ReadTerminalInput): Promise<TerminalReadData> {
    return this.call("browser.read_terminal", input);
  }

  public async terminalInput(input: TerminalInputInput): Promise<TerminalInputData> {
    return this.call("browser.terminal_input", input);
  }

  public async typeTerminal(
    reference: Omit<TerminalInputInput, "input">,
    text: string,
  ): Promise<TerminalInputData> {
    return this.terminalInput({ ...reference, input: { type: "text", text, submit: false } });
  }

  public async executeTerminal(
    reference: Omit<TerminalInputInput, "input">,
    command: string,
  ): Promise<TerminalInputData> {
    return this.terminalInput({
      ...reference,
      input: { type: "text", text: command, submit: true },
    });
  }

  public async batch(
    steps: readonly InvictumBatchStep[],
    options: { continueOnError?: boolean } = {},
  ): Promise<InvictumBatchResult> {
    if (steps.length < 1 || steps.length > 25) throw new Error("batch requires 1-25 steps");
    const completed = new Map<string, unknown>();
    const ids = new Set<string>();
    const results: InvictumBatchStepResult[] = [];
    let last: unknown;
    for (const step of steps) {
      if (!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/u.test(step.id)) {
        throw new Error(`Invalid batch step id '${step.id}'`);
      }
      if (ids.has(step.id)) throw new Error(`Duplicate batch step id '${step.id}'`);
      ids.add(step.id);
      if (step.action === "browser.batch") throw new Error("Nested batches are forbidden");
      try {
        const parameters = resolveBatchValue(step.parameters ?? {}, completed, last);
        const data = await this.enhancedCall(step.action, {
          ...(isRecord(parameters) ? parameters : { value: parameters }),
          ...(step.idempotencyKey === undefined ? {} : { idempotencyKey: step.idempotencyKey }),
          ...(step.dryRun === true ? { dryRun: true } : {}),
          ...(step.postSnapshot === undefined ? {} : { postSnapshot: step.postSnapshot }),
          ...(step.domDelta === true ? { domDelta: true } : {}),
          ...(step.verify === undefined ? {} : { verify: step.verify }),
          ...(step.autoMarks === undefined ? {} : { autoMarks: step.autoMarks }),
          ...(step.timings === true ? { timings: true } : {}),
        });
        completed.set(step.id, data);
        last = data;
        results.push({ id: step.id, action: step.action, success: true, data });
      } catch (error) {
        results.push({
          id: step.id,
          action: step.action,
          success: false,
          error: {
            code: error instanceof InvictumControlError ? error.code : "BATCH_STEP_ERROR",
            message: error instanceof Error ? error.message : String(error),
            retryable: error instanceof InvictumControlError ? error.retryable : false,
          },
        });
        if (options.continueOnError !== true) break;
      }
    }
    const failed = results.filter((result) => !result.success).length;
    return {
      steps: results,
      completed: results.length - failed,
      failed,
      stoppedEarly: results.length < steps.length,
    };
  }

  public async startConsole(tabId: number, bufferSize = 200): Promise<Record<string, unknown>> {
    return this.call("browser.console", { operation: "start", tabId, bufferSize });
  }

  public async readConsole(
    tabId: number,
    options: { limit?: number; clear?: boolean } = {},
  ): Promise<Record<string, unknown>> {
    return this.call("browser.console", { operation: "read", tabId, ...options });
  }

  public async stopConsole(tabId: number): Promise<Record<string, unknown>> {
    return this.call("browser.console", { operation: "stop", tabId });
  }

  public async setMobilePreview(
    tabId: number,
    options: {
      preset?: "mobile_small" | "mobile_medium" | "mobile_large" | "tablet" | "custom";
      orientation?: "portrait" | "landscape";
      width?: number;
      height?: number;
      deviceScaleFactor?: number;
      touch?: boolean;
    } = {},
  ): Promise<Record<string, unknown>> {
    return this.call("browser.emulate_device", { operation: "set", tabId, ...options });
  }

  public async resetDeviceEmulation(tabId: number): Promise<Record<string, unknown>> {
    return this.call("browser.emulate_device", { operation: "reset", tabId });
  }

  public async captureScreenshot(
    options: CaptureScreenshotOptions,
  ): Promise<Record<string, unknown>> {
    return this.call("browser.screenshot", options);
  }

  public async captureTutorialScreenshot(options: {
    tabId: number;
    documentId: string;
    domRevision: number;
    elementId: string;
    text: string;
    outputMode?: "element" | "viewport" | "full_page";
    shape?: "rectangle" | "rounded_rectangle" | "ellipse" | "circle" | "highlight";
    color?: string;
    padding?: number;
    quality?: number;
    maxWidth?: number;
    maxHeight?: number;
  }): Promise<Record<string, unknown>> {
    const color = options.color ?? "#ef4444";
    return this.captureScreenshot({
      tabId: options.tabId,
      documentId: options.documentId,
      domRevision: options.domRevision,
      mode: options.outputMode ?? "element",
      elementId:
        options.outputMode === "element" || options.outputMode === undefined
          ? options.elementId
          : undefined,
      padding: options.padding ?? 24,
      quality: options.quality,
      maxWidth: options.maxWidth,
      maxHeight: options.maxHeight,
      annotations: [
        {
          target: { type: "element", elementId: options.elementId, padding: 8 },
          shape: options.shape ?? "rounded_rectangle",
          stroke: color,
          strokeWidth: 4,
          label: { text: options.text, background: color, arrow: true },
        },
      ],
    });
  }

  public async withReservedTab<T>(
    tabId: number,
    operation: (client: this) => Promise<T>,
  ): Promise<T> {
    let outcome: { ok: true; value: T } | { ok: false; error: unknown };
    try {
      outcome = { ok: true, value: await operation(this) };
    } catch (error) {
      outcome = { ok: false, error };
    }
    let cleanupError: unknown;
    try {
      await this.call("browser.unlock_tab", { tabId });
      this.#enhancedActions.clearTab(tabId);
    } catch (error) {
      if (!(error instanceof InvictumControlError && error.code === "POLICY_DENIED")) {
        cleanupError = error;
      }
    }
    if (!outcome.ok) throw outcome.error;
    if (cleanupError !== undefined) throw cleanupError;
    return outcome.value;
  }

  async #parse<T>(response: Response): Promise<T> {
    let body: ControlSuccess<T> | ControlFailure;
    try {
      body = (await response.json()) as ControlSuccess<T> | ControlFailure;
    } catch (error) {
      throw new InvictumControlError(
        "INVALID_CONTROL_RESPONSE",
        `Invictum control API returned HTTP ${response.status} without valid JSON`,
        false,
        undefined,
        { cause: error },
      );
    }
    if (!body.ok) {
      throw new InvictumControlError(
        body.error.code,
        body.error.message,
        body.error.retryable,
        body.error.details,
      );
    }
    if (body.data !== undefined) return body.data;
    const topLevel = Object.fromEntries(Object.entries(body).filter(([key]) => key !== "ok"));
    return topLevel as T;
  }
}
