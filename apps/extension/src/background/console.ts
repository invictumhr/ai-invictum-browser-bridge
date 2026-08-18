import {
  BrowserConsoleDataSchema,
  IBP_ERROR_CODES,
  type BrowserConsoleData,
  type BrowserConsoleParameters,
  type ConsoleEntry,
} from "@invictum/protocol";

import { ExtensionCommandError } from "./command-error.js";
import { debuggerSessions, type ChromeDebuggerLease } from "./debugger-session.js";

interface ConsoleCapture {
  captureId: string;
  startedAt: string;
  bufferSize: number;
  entries: ConsoleEntry[];
  droppedEntries: number;
  nextSequence: number;
  active: boolean;
  lease?: ChromeDebuggerLease;
}

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const SENSITIVE_PAIR =
  /\b(password|passwd|pwd|secret|token|access[_-]?token|refresh[_-]?token|authorization|cookie|session|otp|cvv)\b(\s*[:=]\s*)([^\s,;]+)/giu;
const BEARER = /\b(Bearer|Basic)\s+[A-Za-z0-9+/._~=-]{8,}/giu;
const QUERY_SECRET = /([?&](?:token|access_token|auth|key|secret|password)=)[^&#\s]+/giu;

const redact = (value: string): string =>
  value
    .replace(SENSITIVE_PAIR, "$1$2[REDACTED]")
    .replace(BEARER, "$1 [REDACTED]")
    .replace(QUERY_SECRET, "$1[REDACTED]")
    .slice(0, 2_000);

const sanitizedUrl = (value: unknown): string => {
  if (typeof value !== "string" || value.length === 0) return "";
  try {
    const parsed = new URL(value);
    return `${parsed.origin}${parsed.pathname}`.slice(0, 4_096);
  } catch {
    return "";
  }
};

const timestamp = (value: unknown): string => {
  const milliseconds = typeof value === "number" && Number.isFinite(value) ? value : Date.now();
  const date = new Date(milliseconds);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
};

const consoleLevel = (value: unknown): ConsoleEntry["level"] => {
  if (value === "debug") return "debug";
  if (value === "info") return "info";
  if (value === "warning" || value === "warn") return "warning";
  if (value === "error" || value === "assert") return "error";
  return "log";
};

const remoteText = (value: unknown): string => {
  if (!isRecord(value)) return "";
  if (typeof value["value"] === "string") return redact(value["value"]);
  if (
    typeof value["value"] === "number" ||
    typeof value["value"] === "boolean" ||
    value["value"] === null
  ) {
    return String(value["value"]);
  }
  if (typeof value["unserializableValue"] === "string") return value["unserializableValue"];
  const type = typeof value["type"] === "string" ? value["type"] : "object";
  const subtype = typeof value["subtype"] === "string" ? ` ${value["subtype"]}` : "";
  const description =
    typeof value["description"] === "string"
      ? `: ${redact(value["description"].split("\n", 1)[0] ?? "")}`
      : "";
  return `[${type}${subtype}${description}]`;
};

const numericLocation = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;

export class ChromeBrowserConsoleAdapter {
  readonly #captures = new Map<number, ConsoleCapture>();
  #listening = false;

  public constructor() {
    debuggerSessions.onUnexpectedDetach((tabId) => {
      const capture = this.#captures.get(tabId);
      if (capture !== undefined) {
        capture.active = false;
        capture.lease = undefined;
      }
    });
  }

  public async manage(parameters: BrowserConsoleParameters): Promise<BrowserConsoleData> {
    this.#ensureListener();
    if (parameters.operation === "start") return this.#start(parameters);
    const capture = this.#captures.get(parameters.tabId);
    if (capture === undefined) {
      return this.#data(parameters.tabId, parameters.operation, undefined, false);
    }
    if (parameters.operation === "read") {
      const entries = capture.entries.slice(-parameters.limit);
      const result = this.#data(
        parameters.tabId,
        parameters.operation,
        capture,
        parameters.clear,
        entries,
      );
      if (parameters.clear) {
        capture.entries.length = 0;
        capture.droppedEntries = 0;
      }
      return result;
    }
    if (parameters.operation === "clear") {
      capture.entries.length = 0;
      capture.droppedEntries = 0;
      return this.#data(parameters.tabId, parameters.operation, capture, true);
    }
    capture.active = false;
    const entries = [...capture.entries];
    await capture.lease?.release();
    capture.lease = undefined;
    return this.#data(parameters.tabId, parameters.operation, capture, false, entries);
  }

  public state(tabId: number): { active: boolean; entryCount: number } {
    const capture = this.#captures.get(tabId);
    return { active: capture?.active === true, entryCount: capture?.entries.length ?? 0 };
  }

  public async cleanup(tabId: number): Promise<void> {
    const capture = this.#captures.get(tabId);
    this.#captures.delete(tabId);
    await capture?.lease?.release();
  }

  async #start(
    parameters: Extract<BrowserConsoleParameters, { operation: "start" }>,
  ): Promise<BrowserConsoleData> {
    const permission = await chrome.permissions.contains({ permissions: ["debugger", "tabs"] });
    if (!permission) {
      throw new ExtensionCommandError(
        IBP_ERROR_CODES.PERMISSION_DENIED,
        "Browser console capture requires the Chrome debugger permission",
        false,
      );
    }
    const tab = await chrome.tabs.get(parameters.tabId);
    const url = tab.pendingUrl ?? tab.url;
    if (url === undefined || !/^https?:/iu.test(url)) {
      throw new ExtensionCommandError(
        IBP_ERROR_CODES.RESTRICTED_PAGE,
        "Browser console capture is only available on normal HTTP(S) pages",
        false,
      );
    }
    const existing = this.#captures.get(parameters.tabId);
    if (existing?.active === true) {
      existing.bufferSize = parameters.bufferSize;
      if (existing.entries.length > parameters.bufferSize) {
        existing.droppedEntries += existing.entries.length - parameters.bufferSize;
        existing.entries.splice(0, existing.entries.length - parameters.bufferSize);
      }
      return this.#data(parameters.tabId, "start", existing, false);
    }
    const lease = await debuggerSessions.acquire(parameters.tabId).catch((error: unknown) => {
      throw new ExtensionCommandError(
        IBP_ERROR_CODES.BROWSER_API_ERROR,
        "Chrome could not start console capture; close the visible DevTools window for this tab and retry",
        true,
        { cause: error },
      );
    });
    try {
      await lease.sendCommand("Runtime.enable");
      await lease.sendCommand("Log.enable");
      const capture: ConsoleCapture = {
        captureId: crypto.randomUUID(),
        startedAt: new Date().toISOString(),
        bufferSize: parameters.bufferSize,
        entries: [],
        droppedEntries: 0,
        nextSequence: 0,
        active: true,
        lease,
      };
      this.#captures.set(parameters.tabId, capture);
      return this.#data(parameters.tabId, "start", capture, false);
    } catch (error) {
      await lease.release();
      throw new ExtensionCommandError(
        IBP_ERROR_CODES.BROWSER_API_ERROR,
        "Chrome could not enable the Runtime and Log domains for console capture",
        true,
        { cause: error },
      );
    }
  }

  #ensureListener(): void {
    if (this.#listening) return;
    chrome.debugger.onEvent.addListener((source, method, rawParameters) => {
      if (source.tabId === undefined) return;
      const capture = this.#captures.get(source.tabId);
      if (capture?.active !== true) return;
      const parameters = isRecord(rawParameters) ? rawParameters : {};
      if (method === "Runtime.consoleAPICalled") {
        const args = Array.isArray(parameters["args"]) ? parameters["args"] : [];
        const stackTrace = isRecord(parameters["stackTrace"])
          ? parameters["stackTrace"]
          : undefined;
        const frames = Array.isArray(stackTrace?.["callFrames"]) ? stackTrace["callFrames"] : [];
        const frame = isRecord(frames[0]) ? frames[0] : {};
        this.#push(capture, {
          source: "console",
          level: consoleLevel(parameters["type"]),
          text: redact(args.map(remoteText).filter(Boolean).join(" ")),
          timestamp: timestamp(parameters["timestamp"]),
          url: sanitizedUrl(frame["url"]),
          lineNumber: numericLocation(frame["lineNumber"]),
          columnNumber: numericLocation(frame["columnNumber"]),
        });
      } else if (method === "Runtime.exceptionThrown") {
        const details = isRecord(parameters["exceptionDetails"])
          ? parameters["exceptionDetails"]
          : {};
        const exception = isRecord(details["exception"]) ? details["exception"] : {};
        this.#push(capture, {
          source: "exception",
          level: "error",
          text: redact(
            typeof exception["description"] === "string"
              ? exception["description"]
              : typeof details["text"] === "string"
                ? details["text"]
                : "Uncaught exception",
          ),
          timestamp: timestamp(parameters["timestamp"]),
          url: sanitizedUrl(details["url"]),
          lineNumber: numericLocation(details["lineNumber"]),
          columnNumber: numericLocation(details["columnNumber"]),
        });
      } else if (method === "Log.entryAdded") {
        const entry = isRecord(parameters["entry"]) ? parameters["entry"] : {};
        this.#push(capture, {
          source: "log",
          level: consoleLevel(entry["level"]),
          text: redact(typeof entry["text"] === "string" ? entry["text"] : ""),
          timestamp: timestamp(entry["timestamp"]),
          url: sanitizedUrl(entry["url"]),
          lineNumber: numericLocation(entry["lineNumber"]),
          columnNumber: 0,
        });
      }
    });
    this.#listening = true;
  }

  #push(capture: ConsoleCapture, entry: Omit<ConsoleEntry, "sequence">): void {
    capture.entries.push({ ...entry, sequence: capture.nextSequence++ });
    while (capture.entries.length > capture.bufferSize) {
      capture.entries.shift();
      capture.droppedEntries += 1;
    }
  }

  #data(
    tabId: number,
    operation: BrowserConsoleParameters["operation"],
    capture: ConsoleCapture | undefined,
    cleared: boolean,
    entries: ConsoleEntry[] = capture?.entries ?? [],
  ): BrowserConsoleData {
    return BrowserConsoleDataSchema.parse({
      tabId,
      operation,
      active: capture?.active === true,
      captureId: capture?.captureId ?? null,
      startedAt: capture?.startedAt ?? null,
      entries,
      entryCount: entries.length,
      droppedEntries: capture?.droppedEntries ?? 0,
      cleared,
    });
  }
}
