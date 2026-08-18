import {
  IBP_ERROR_CODES,
  InspectElementDataSchema,
  MutateDomDataSchema,
  ObserveEventsDataSchema,
  type InspectElementData,
  type InspectElementParameters,
  type MutateDomData,
  type MutateDomParameters,
  type ObserveEventsData,
  type ObserveEventsParameters,
} from "@invictum/protocol";

import { ExtensionCommandError } from "./command-error.js";
import { TOP_FRAME_ID } from "./frames.js";
import { debuggerSessions, type ChromeDebuggerLease } from "./debugger-session.js";
import { isChromePageAccessDenied, pageAccessDeniedMessage } from "./page-access.js";

const CONTENT_CHANNEL = "invictum.browser.snapshot.v1";
const TARGET_ATTRIBUTE = "data-invictum-inspect-target";

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const contentCommand = async (
  tabId: number,
  command:
    | "mutate_dom"
    | "observe_events"
    | "prepare_element_inspection"
    | "complete_element_inspection"
    | "cancel_element_inspection"
    | "cleanup_advanced_tools",
  parameters: unknown,
): Promise<unknown> => {
  const requestId = crypto.randomUUID();
  const raw = await chrome.tabs.sendMessage(
    tabId,
    {
      channel: CONTENT_CHANNEL,
      command,
      requestId,
      parameters,
    },
    { frameId: TOP_FRAME_ID },
  );
  if (!isRecord(raw) || raw["requestId"] !== requestId || typeof raw["ok"] !== "boolean") {
    throw new ExtensionCommandError(
      IBP_ERROR_CODES.INVALID_MESSAGE,
      "The content script returned an invalid advanced-tools response",
      false,
    );
  }
  if (raw["ok"] === true) return raw["result"];
  const error = raw["error"];
  throw new ExtensionCommandError(
    isRecord(error) && typeof error["code"] === "string"
      ? error["code"]
      : IBP_ERROR_CODES.CONTENT_SCRIPT_UNAVAILABLE,
    isRecord(error) && typeof error["message"] === "string"
      ? error["message"]
      : "The content script could not complete the advanced browser command",
    isRecord(error) && typeof error["retryable"] === "boolean" ? error["retryable"] : true,
  );
};

const normalPage = async (tabId: number, purpose: string): Promise<string> => {
  const permission = await chrome.permissions.contains({
    permissions: ["activeTab", "tabs", "scripting"],
  });
  if (!permission) {
    throw new ExtensionCommandError(
      IBP_ERROR_CODES.PERMISSION_DENIED,
      `${purpose} requires page access and the scripting permission`,
      false,
    );
  }
  const tab = await chrome.tabs.get(tabId);
  const url = tab.pendingUrl ?? tab.url;
  if (url === undefined || !/^https?:/iu.test(url)) {
    throw new ExtensionCommandError(
      IBP_ERROR_CODES.RESTRICTED_PAGE,
      `${purpose} is only available on normal HTTP(S) pages`,
      false,
    );
  }
  return url;
};

const findMarkedBackendNode = (value: unknown, token: string): number | undefined => {
  if (!isRecord(value)) return undefined;
  const attributes = value["attributes"];
  if (Array.isArray(attributes)) {
    for (let index = 0; index < attributes.length - 1; index += 2) {
      if (
        attributes[index] === TARGET_ATTRIBUTE &&
        attributes[index + 1] === token &&
        typeof value["backendNodeId"] === "number"
      ) {
        return value["backendNodeId"];
      }
    }
  }
  for (const key of ["children", "shadowRoots", "pseudoElements"]) {
    const children = value[key];
    if (!Array.isArray(children)) continue;
    for (const child of children) {
      const found = findMarkedBackendNode(child, token);
      if (found !== undefined) return found;
    }
  }
  for (const key of ["contentDocument", "templateContent", "importedDocument"]) {
    const found = findMarkedBackendNode(value[key], token);
    if (found !== undefined) return found;
  }
  return undefined;
};

interface PreparedInspection {
  token: string;
  base: Omit<InspectElementData, "eventListeners" | "listenersTruncated" | "debuggerUsed">;
}

const parsePreparedInspection = (value: unknown): PreparedInspection => {
  if (!isRecord(value) || typeof value["token"] !== "string" || !isRecord(value["base"])) {
    throw new ExtensionCommandError(
      IBP_ERROR_CODES.INVALID_MESSAGE,
      "The content script returned invalid element-inspection preparation data",
      false,
    );
  }
  const parsed = InspectElementDataSchema.parse({
    ...value["base"],
    eventListeners: [],
    listenersTruncated: false,
    debuggerUsed: false,
  });
  const base = { ...parsed } as Partial<InspectElementData>;
  delete base.eventListeners;
  delete base.listenersTruncated;
  delete base.debuggerUsed;
  return {
    token: value["token"],
    base: base as PreparedInspection["base"],
  };
};

const sanitizedUrl = (raw: string): string => {
  if (raw.length === 0) return "";
  try {
    const parsed = new URL(raw);
    parsed.username = "";
    parsed.password = "";
    for (const key of [...parsed.searchParams.keys()]) parsed.searchParams.set(key, "[REDACTED]");
    if (parsed.hash.length > 1) parsed.hash = "#[REDACTED]";
    return parsed.toString().slice(0, 4_096);
  } catch {
    return raw.slice(0, 4_096);
  }
};

const redactSource = (source: string): string =>
  source
    .replace(
      /\b(password|passwd|secret|token|apiKey|authorization|cookie)\b\s*[:=]\s*(["'`])[^"'`\r\n]*\2/giu,
      '$1 = "[REDACTED]"',
    )
    .replace(/\b[A-Za-z0-9_-]{48,}\b/gu, "[REDACTED_HIGH_ENTROPY]");

export const listenerSourceExcerpt = (
  source: string,
  lineNumber: number,
  maxChars: number,
  scriptStartLine = 0,
  handlerName = "",
): { excerpt: string; truncated: boolean } => {
  if (maxChars === 0) return { excerpt: "", truncated: false };
  const lines = source.split(/\r?\n/u);
  const relativeLineNumber = Math.max(
    0,
    lineNumber >= scriptStartLine ? lineNumber - scriptStartLine : lineNumber,
  );
  const searchableHandlerName = /^[A-Za-z_$][\w$]*$/u.test(handlerName) ? handlerName : "";
  const handlerLine =
    searchableHandlerName.length > 0
      ? lines.findIndex((line) => line.includes(searchableHandlerName))
      : -1;
  const locatedLine =
    relativeLineNumber < lines.length
      ? relativeLineNumber
      : handlerLine >= 0
        ? handlerLine
        : relativeLineNumber;
  const locationWindowContainsHandler =
    handlerLine >= 0 && Math.abs(handlerLine - locatedLine) <= 2;
  const excerptLine =
    handlerLine >= 0 && !locationWindowContainsHandler ? handlerLine : locatedLine;
  const start = Math.max(0, excerptLine - 2);
  const end = Math.min(lines.length, excerptLine + 3);
  const selected = lines
    .slice(start, end)
    .map((line, index) => `${scriptStartLine + start + index + 1}: ${line}`)
    .join("\n");
  const redacted = redactSource(selected);
  return { excerpt: redacted.slice(0, maxChars), truncated: redacted.length > maxChars };
};

interface ScriptMetadata {
  url: string;
  startLine: number;
}

interface RawListener {
  target: "element" | "subtree" | "document" | "window";
  type: string;
  useCapture: boolean;
  passive: boolean;
  once: boolean;
  scriptId: string;
  lineNumber: number;
  columnNumber: number;
  handlerName: string;
}

const parseListeners = (
  value: unknown,
  target: RawListener["target"],
  targetBackendNodeId?: number,
): RawListener[] => {
  if (!isRecord(value) || !Array.isArray(value["listeners"])) return [];
  const listeners: RawListener[] = [];
  for (const listener of value["listeners"]) {
    if (
      !isRecord(listener) ||
      typeof listener["type"] !== "string" ||
      typeof listener["useCapture"] !== "boolean" ||
      typeof listener["passive"] !== "boolean" ||
      typeof listener["once"] !== "boolean" ||
      typeof listener["scriptId"] !== "string" ||
      typeof listener["lineNumber"] !== "number" ||
      typeof listener["columnNumber"] !== "number"
    ) {
      continue;
    }
    const handler = listener["handler"];
    const description =
      isRecord(handler) && typeof handler["description"] === "string" ? handler["description"] : "";
    const firstLine = description.split(/\r?\n/u, 1)[0] ?? "";
    const guessedName = firstLine.match(/^(?:async\s+)?(?:function\s*)?([^\s(=]+)?/u)?.[1] ?? "";
    listeners.push({
      target:
        target === "element" &&
        targetBackendNodeId !== undefined &&
        typeof listener["backendNodeId"] === "number" &&
        listener["backendNodeId"] !== targetBackendNodeId
          ? "subtree"
          : target,
      type: listener["type"].slice(0, 256),
      useCapture: listener["useCapture"],
      passive: listener["passive"],
      once: listener["once"],
      scriptId: listener["scriptId"].slice(0, 256),
      lineNumber: Math.max(0, Math.trunc(listener["lineNumber"])),
      columnNumber: Math.max(0, Math.trunc(listener["columnNumber"])),
      handlerName: guessedName.slice(0, 256),
    });
  }
  return listeners;
};

export const evaluatedObjectId = (value: unknown): string | undefined => {
  if (!isRecord(value) || !isRecord(value["result"])) return undefined;
  return typeof value["result"]["objectId"] === "string" ? value["result"]["objectId"] : undefined;
};

export const resolvedNodeObjectId = (value: unknown): string | undefined => {
  if (!isRecord(value) || !isRecord(value["object"])) return undefined;
  return typeof value["object"]["objectId"] === "string" ? value["object"]["objectId"] : undefined;
};

export class ChromeAdvancedDomAdapter {
  readonly #inspectionQueues = new Map<number, Promise<void>>();

  public async mutate(parameters: MutateDomParameters): Promise<MutateDomData> {
    const tabUrl = await normalPage(parameters.tabId, "DOM mutation");
    try {
      await chrome.scripting.executeScript({
        target: { tabId: parameters.tabId, allFrames: true },
        files: ["content.js"],
      });
      return MutateDomDataSchema.parse(
        await contentCommand(parameters.tabId, "mutate_dom", parameters),
      );
    } catch (error) {
      if (error instanceof ExtensionCommandError) throw error;
      if (isChromePageAccessDenied(error)) {
        throw new ExtensionCommandError(
          IBP_ERROR_CODES.PERMISSION_DENIED,
          pageAccessDeniedMessage(parameters.tabId, tabUrl, "DOM mutation"),
          false,
        );
      }
      throw new ExtensionCommandError(
        IBP_ERROR_CODES.BROWSER_API_ERROR,
        "Chrome could not apply the requested typed DOM mutation",
        true,
        { cause: error },
      );
    }
  }

  public async observeEvents(parameters: ObserveEventsParameters): Promise<ObserveEventsData> {
    const tabUrl = await normalPage(parameters.tabId, "DOM event capture");
    try {
      await chrome.scripting.executeScript({
        target: { tabId: parameters.tabId, allFrames: true },
        files: ["content.js"],
      });
      return ObserveEventsDataSchema.parse(
        await contentCommand(parameters.tabId, "observe_events", parameters),
      );
    } catch (error) {
      if (error instanceof ExtensionCommandError) throw error;
      if (isChromePageAccessDenied(error)) {
        throw new ExtensionCommandError(
          IBP_ERROR_CODES.PERMISSION_DENIED,
          pageAccessDeniedMessage(parameters.tabId, tabUrl, "DOM event capture"),
          false,
        );
      }
      throw new ExtensionCommandError(
        IBP_ERROR_CODES.BROWSER_API_ERROR,
        "Chrome could not manage the bounded DOM event capture",
        true,
        { cause: error },
      );
    }
  }

  public async inspect(parameters: InspectElementParameters): Promise<InspectElementData> {
    const tabUrl = await normalPage(parameters.tabId, "element inspection");
    const debuggerPermission = await chrome.permissions.contains({ permissions: ["debugger"] });
    if (parameters.includeEventListeners && !debuggerPermission) {
      throw new ExtensionCommandError(
        IBP_ERROR_CODES.PERMISSION_DENIED,
        "Event-listener inspection requires the Chrome debugger permission",
        false,
      );
    }
    const previousInspection = this.#inspectionQueues.get(parameters.tabId) ?? Promise.resolve();
    let releaseQueue!: () => void;
    const queueGate = new Promise<void>((resolve) => {
      releaseQueue = resolve;
    });
    const queuedInspection = previousInspection.catch(() => undefined).then(() => queueGate);
    this.#inspectionQueues.set(parameters.tabId, queuedInspection);
    await previousInspection.catch(() => undefined);
    let prepared: PreparedInspection | undefined;
    let lease: ChromeDebuggerLease | undefined;
    const target: chrome.debugger.Debuggee = { tabId: parameters.tabId };
    const scriptMetadata = new Map<string, ScriptMetadata>();
    const debuggerListener: Parameters<typeof chrome.debugger.onEvent.addListener>[0] = (
      source,
      method,
      rawParameters,
    ) => {
      if (
        source.tabId !== parameters.tabId ||
        method !== "Debugger.scriptParsed" ||
        !isRecord(rawParameters) ||
        typeof rawParameters["scriptId"] !== "string" ||
        typeof rawParameters["url"] !== "string"
      ) {
        return;
      }
      scriptMetadata.set(rawParameters["scriptId"], {
        url: rawParameters["url"],
        startLine:
          typeof rawParameters["startLine"] === "number"
            ? Math.max(0, Math.trunc(rawParameters["startLine"]))
            : 0,
      });
    };
    try {
      await chrome.scripting.executeScript({
        target: { tabId: parameters.tabId, allFrames: true },
        files: ["content.js"],
      });
      prepared = parsePreparedInspection(
        await contentCommand(parameters.tabId, "prepare_element_inspection", parameters),
      );
      if (!parameters.includeEventListeners) {
        const base = prepared.base;
        await contentCommand(parameters.tabId, "complete_element_inspection", {
          token: prepared.token,
        });
        prepared = undefined;
        return InspectElementDataSchema.parse({
          ...base,
          eventListeners: [],
          listenersTruncated: false,
          debuggerUsed: false,
        });
      }

      const base = prepared.base;
      chrome.debugger.onEvent.addListener(debuggerListener);
      lease = await debuggerSessions.acquire(parameters.tabId);
      await chrome.debugger.sendCommand(target, "Runtime.enable");
      await chrome.debugger.sendCommand(target, "Debugger.enable");
      await chrome.debugger.sendCommand(target, "DOM.enable");
      const documentResult = await chrome.debugger.sendCommand(target, "DOM.getDocument", {
        depth: -1,
        pierce: true,
      });
      const root = isRecord(documentResult) ? documentResult["root"] : undefined;
      const backendNodeId = findMarkedBackendNode(root, prepared.token);
      if (backendNodeId === undefined) {
        throw new ExtensionCommandError(
          IBP_ERROR_CODES.STALE_ELEMENT_REFERENCE,
          "Chrome could not resolve the inspected element; fetch a fresh snapshot and retry",
          true,
        );
      }
      const resolved = await chrome.debugger.sendCommand(target, "DOM.resolveNode", {
        backendNodeId,
        objectGroup: "invictum-inspection",
      });
      const objectId = resolvedNodeObjectId(resolved);
      if (objectId === undefined) {
        throw new ExtensionCommandError(
          IBP_ERROR_CODES.BROWSER_API_ERROR,
          "Chrome could not resolve the inspected element into the page runtime",
          true,
        );
      }
      let listeners = parseListeners(
        await chrome.debugger.sendCommand(target, "DOMDebugger.getEventListeners", {
          objectId,
          depth: parameters.listenerDepth,
          pierce: true,
        }),
        "element",
        backendNodeId,
      );
      if (parameters.includeDocumentListeners) {
        for (const [expression, listenerTarget] of [
          ["document", "document"],
          ["window", "window"],
        ] as const) {
          const evaluated = await chrome.debugger.sendCommand(target, "Runtime.evaluate", {
            expression,
            objectGroup: "invictum-inspection",
            silent: true,
            returnByValue: false,
          });
          const delegatedObjectId = evaluatedObjectId(evaluated);
          if (delegatedObjectId === undefined) continue;
          listeners.push(
            ...parseListeners(
              await chrome.debugger.sendCommand(target, "DOMDebugger.getEventListeners", {
                objectId: delegatedObjectId,
                depth: 0,
                pierce: false,
              }),
              listenerTarget,
            ),
          );
        }
      }
      const listenersTruncated = listeners.length > parameters.maxListeners;
      listeners = listeners.slice(0, parameters.maxListeners);
      const sources = new Map<string, string>();
      if (parameters.sourceExcerptChars > 0) {
        for (const scriptId of [...new Set(listeners.map((listener) => listener.scriptId))]) {
          try {
            const source = await chrome.debugger.sendCommand(target, "Debugger.getScriptSource", {
              scriptId,
            });
            if (isRecord(source) && typeof source["scriptSource"] === "string") {
              sources.set(scriptId, source["scriptSource"]);
            }
          } catch {
            // Some internal/Wasm listeners have no readable JavaScript source.
          }
        }
      }
      const eventListeners = listeners.map((listener) => {
        const metadata = scriptMetadata.get(listener.scriptId);
        const excerpt = listenerSourceExcerpt(
          sources.get(listener.scriptId) ?? "",
          listener.lineNumber,
          parameters.sourceExcerptChars,
          metadata?.startLine ?? 0,
          listener.handlerName,
        );
        return {
          target: listener.target,
          type: listener.type,
          useCapture: listener.useCapture,
          passive: listener.passive,
          once: listener.once,
          handlerName: listener.handlerName,
          scriptId: listener.scriptId,
          sourceUrl: sanitizedUrl(metadata?.url ?? ""),
          lineNumber: listener.lineNumber,
          columnNumber: listener.columnNumber,
          sourceExcerpt: excerpt.excerpt,
          excerptTruncated: excerpt.truncated,
        };
      });
      await chrome.debugger
        .sendCommand(target, "Runtime.releaseObjectGroup", { objectGroup: "invictum-inspection" })
        .catch(() => undefined);
      await contentCommand(parameters.tabId, "complete_element_inspection", {
        token: prepared.token,
      });
      prepared = undefined;
      return InspectElementDataSchema.parse({
        ...base,
        eventListeners,
        listenersTruncated,
        debuggerUsed: true,
      });
    } catch (error) {
      if (error instanceof ExtensionCommandError) throw error;
      if (isChromePageAccessDenied(error)) {
        throw new ExtensionCommandError(
          IBP_ERROR_CODES.PERMISSION_DENIED,
          pageAccessDeniedMessage(parameters.tabId, tabUrl, "element inspection"),
          false,
        );
      }
      throw new ExtensionCommandError(
        IBP_ERROR_CODES.BROWSER_API_ERROR,
        "Chrome could not inspect the element; close DevTools for that tab and retry once",
        true,
        { cause: error },
      );
    } finally {
      chrome.debugger.onEvent.removeListener(debuggerListener);
      await lease?.release();
      if (prepared !== undefined) {
        await contentCommand(parameters.tabId, "cancel_element_inspection", {
          token: prepared.token,
        }).catch(() => undefined);
      }
      releaseQueue();
      if (this.#inspectionQueues.get(parameters.tabId) === queuedInspection) {
        this.#inspectionQueues.delete(parameters.tabId);
      }
    }
  }

  public async cleanup(tabId: number): Promise<void> {
    await contentCommand(tabId, "cleanup_advanced_tools", {}).catch(() => undefined);
  }
}
