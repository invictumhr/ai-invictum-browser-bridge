import {
  CancelWebMcpInvocationDataSchema,
  IBP_ERROR_CODES,
  InvokeWebMcpToolDataSchema,
  ListWebMcpToolsDataSchema,
  type CancelWebMcpInvocationData,
  type CancelWebMcpInvocationParameters,
  type InvokeWebMcpToolData,
  type InvokeWebMcpToolParameters,
  type JsonValue,
  type ListWebMcpToolsData,
  type ListWebMcpToolsParameters,
} from "@invictum/protocol";

import { ExtensionCommandError } from "./command-error.js";
import { debuggerSessions } from "./debugger-session.js";

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const sleep = async (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

const unsupported = (error: unknown): boolean =>
  /(?:wasn't found|method not found|unknown method|not supported)/i.test(
    error instanceof Error ? error.message : String(error),
  );

const boundedJson = (value: unknown, maxBytes = 100_000): JsonValue | undefined => {
  const visit = (input: unknown, depth: number): JsonValue | undefined => {
    if (input === null || typeof input === "boolean" || typeof input === "string") {
      return typeof input === "string" ? input.slice(0, 20_000) : input;
    }
    if (typeof input === "number") return Number.isFinite(input) ? input : null;
    if (depth >= 12) return "[TRUNCATED_DEPTH]";
    if (Array.isArray(input)) {
      return input.slice(0, 500).map((item) => visit(item, depth + 1) ?? null);
    }
    if (!isRecord(input)) return undefined;
    return Object.fromEntries(
      Object.entries(input)
        .slice(0, 500)
        .map(([key, item]) => [key.slice(0, 256), visit(item, depth + 1) ?? null]),
    );
  };
  const result = visit(value, 0);
  if (result === undefined) return undefined;
  const serialized = JSON.stringify(result);
  return new TextEncoder().encode(serialized).byteLength <= maxBytes
    ? result
    : { truncated: true, preview: serialized.slice(0, Math.floor(maxBytes / 2)) };
};

const annotations = (value: unknown): UnknownRecord => {
  if (!isRecord(value)) return {};
  const pick = (key: string): boolean | undefined =>
    typeof value[key] === "boolean" ? value[key] : undefined;
  return {
    ...(pick("readOnly") === undefined ? {} : { readOnly: pick("readOnly") }),
    ...(pick("untrustedContent") === undefined
      ? {}
      : { untrustedContent: pick("untrustedContent") }),
    ...(pick("consequential") === undefined ? {} : { consequential: pick("consequential") }),
    ...(pick("autosubmit") === undefined ? {} : { autosubmit: pick("autosubmit") }),
    ...(pick("readOnlyHint") === undefined ? {} : { readOnlyHint: pick("readOnlyHint") }),
    ...(pick("destructiveHint") === undefined ? {} : { destructiveHint: pick("destructiveHint") }),
    ...(pick("idempotentHint") === undefined ? {} : { idempotentHint: pick("idempotentHint") }),
    ...(pick("openWorldHint") === undefined ? {} : { openWorldHint: pick("openWorldHint") }),
  };
};

export class ChromeWebMcpAdapter {
  public async list(parameters: ListWebMcpToolsParameters): Promise<ListWebMcpToolsData> {
    const lease = await debuggerSessions.acquire(parameters.tabId);
    const tools = new Map<string, UnknownRecord>();
    const listener = (
      source: chrome.debugger.Debuggee,
      method: string,
      eventParameters?: object,
    ): void => {
      if (source.tabId !== parameters.tabId || method !== "WebMCP.toolsAdded") return;
      const payload = isRecord(eventParameters) ? eventParameters : {};
      for (const tool of Array.isArray(payload["tools"]) ? payload["tools"].filter(isRecord) : []) {
        const name = typeof tool["name"] === "string" ? tool["name"].slice(0, 256) : "";
        const frameId = typeof tool["frameId"] === "string" ? tool["frameId"].slice(0, 256) : "";
        if (name.length > 0 && frameId.length > 0) tools.set(`${frameId}\u0000${name}`, tool);
      }
    };
    chrome.debugger.onEvent.addListener(listener);
    try {
      try {
        await lease.sendCommand("WebMCP.enable");
      } catch (error) {
        if (unsupported(error)) {
          return ListWebMcpToolsDataSchema.parse({
            tabId: parameters.tabId,
            supported: false,
            tools: [],
            untrusted: true,
          });
        }
        throw error;
      }
      if (parameters.discoveryWaitMs > 0) await sleep(parameters.discoveryWaitMs);
      return ListWebMcpToolsDataSchema.parse({
        tabId: parameters.tabId,
        supported: true,
        tools: [...tools.values()].slice(0, 500).map((tool) => ({
          name: String(tool["name"]).slice(0, 256),
          description:
            typeof tool["description"] === "string" ? tool["description"].slice(0, 4_000) : "",
          frameId: String(tool["frameId"]).slice(0, 256),
          ...(tool["inputSchema"] === undefined
            ? {}
            : { inputSchema: boundedJson(tool["inputSchema"], 50_000) }),
          annotations: annotations(tool["annotations"]),
        })),
        untrusted: true,
      });
    } finally {
      chrome.debugger.onEvent.removeListener(listener);
      await lease.sendCommand("WebMCP.disable").catch(() => undefined);
      await lease.release();
    }
  }

  public async invoke(parameters: InvokeWebMcpToolParameters): Promise<InvokeWebMcpToolData> {
    const lease = await debuggerSessions.acquire(parameters.tabId);
    let invocationId: string | undefined;
    let settle: ((value: UnknownRecord) => void) | undefined;
    let fail: ((error: Error) => void) | undefined;
    const earlyResponses: UnknownRecord[] = [];
    const listener = (
      source: chrome.debugger.Debuggee,
      method: string,
      eventParameters?: object,
    ): void => {
      if (source.tabId !== parameters.tabId || method !== "WebMCP.toolResponded") return;
      const payload = isRecord(eventParameters) ? eventParameters : {};
      if (invocationId === undefined) {
        earlyResponses.push(payload);
      } else if (payload["invocationId"] === invocationId) {
        settle?.(payload);
      }
    };
    chrome.debugger.onEvent.addListener(listener);
    try {
      await lease.sendCommand("WebMCP.enable");
      const completedPromise = new Promise<UnknownRecord>((resolve, reject) => {
        settle = resolve;
        fail = reject;
      });
      const response = (await lease.sendCommand("WebMCP.invokeTool", {
        frameId: parameters.frameId,
        toolName: parameters.toolName,
        input: parameters.input,
      })) as UnknownRecord;
      invocationId =
        typeof response["invocationId"] === "string" ? response["invocationId"] : undefined;
      if (invocationId === undefined) {
        throw new ExtensionCommandError(
          IBP_ERROR_CODES.BROWSER_API_ERROR,
          "Chrome returned no WebMCP invocation identifier",
          false,
        );
      }
      const early = earlyResponses.find((payload) => payload["invocationId"] === invocationId);
      if (early !== undefined) settle?.(early);
      const timer = setTimeout(() => {
        fail?.(
          new ExtensionCommandError(
            IBP_ERROR_CODES.TIMEOUT,
            "WebMCP tool did not respond before the bounded timeout; it was cancelled and must not be retried automatically",
            false,
          ),
        );
      }, parameters.timeoutMs);
      const completed = await completedPromise
        .catch(async (error) => {
          await lease
            .sendCommand("WebMCP.cancelInvocation", { invocationId })
            .catch(() => undefined);
          throw error;
        })
        .finally(() => {
          clearTimeout(timer);
        });
      const status = ["Completed", "Canceled", "Error"].includes(String(completed["status"]))
        ? String(completed["status"])
        : "Error";
      return InvokeWebMcpToolDataSchema.parse({
        tabId: parameters.tabId,
        invocationId,
        status,
        ...(completed["output"] === undefined ? {} : { output: boundedJson(completed["output"]) }),
        ...(typeof completed["errorText"] === "string"
          ? { errorText: completed["errorText"].slice(0, 4_000) }
          : {}),
        untrusted: true,
      });
    } catch (error) {
      if (unsupported(error)) {
        throw new ExtensionCommandError(
          IBP_ERROR_CODES.UNSUPPORTED_BROWSER_FEATURE,
          "This Chrome build does not expose the experimental WebMCP protocol",
          false,
        );
      }
      throw error;
    } finally {
      chrome.debugger.onEvent.removeListener(listener);
      await lease.sendCommand("WebMCP.disable").catch(() => undefined);
      await lease.release();
    }
  }

  public async cancel(
    parameters: CancelWebMcpInvocationParameters,
  ): Promise<CancelWebMcpInvocationData> {
    const lease = await debuggerSessions.acquire(parameters.tabId);
    try {
      await lease.sendCommand("WebMCP.enable");
      await lease.sendCommand("WebMCP.cancelInvocation", { invocationId: parameters.invocationId });
      return CancelWebMcpInvocationDataSchema.parse({
        tabId: parameters.tabId,
        invocationId: parameters.invocationId,
        cancelled: true,
      });
    } finally {
      await lease.sendCommand("WebMCP.disable").catch(() => undefined);
      await lease.release();
    }
  }
}
