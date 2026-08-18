import {
  IBP_ERROR_CODES,
  NetworkCaptureDataSchema,
  type NetworkCaptureData,
  type NetworkCaptureParameters,
  type NetworkEntry,
} from "@invictum/protocol";

import { ExtensionCommandError } from "./command-error.js";
import { debuggerSessions, type ChromeDebuggerLease } from "./debugger-session.js";

interface NetworkCapture {
  captureId: string;
  startedAt: string;
  bufferSize: number;
  entries: NetworkEntry[];
  droppedEntries: number;
  nextSequence: number;
  active: boolean;
  lease?: ChromeDebuggerLease;
}

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const sanitizedUrl = (value: unknown): string => {
  if (typeof value !== "string" || value.length === 0) return "";
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
    return `${parsed.origin}${parsed.pathname}`.slice(0, 4_096);
  } catch {
    return "";
  }
};

const boundedString = (value: unknown, maxLength: number): string | undefined =>
  typeof value === "string" && value.length > 0 ? value.slice(0, maxLength) : undefined;

const statusCode = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isInteger(value) && value >= 100 && value <= 599
    ? value
    : undefined;

const nonNegative = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;

export class ChromeNetworkCaptureAdapter {
  readonly #captures = new Map<number, NetworkCapture>();
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

  public async manage(parameters: NetworkCaptureParameters): Promise<NetworkCaptureData> {
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
    await capture.lease?.sendCommand("Network.disable").catch(() => undefined);
    await capture.lease?.release();
    capture.lease = undefined;
    return this.#data(parameters.tabId, parameters.operation, capture, false, entries);
  }

  public async cleanup(tabId: number): Promise<void> {
    const capture = this.#captures.get(tabId);
    this.#captures.delete(tabId);
    await capture?.lease?.sendCommand("Network.disable").catch(() => undefined);
    await capture?.lease?.release();
  }

  async #start(
    parameters: Extract<NetworkCaptureParameters, { operation: "start" }>,
  ): Promise<NetworkCaptureData> {
    const permission = await chrome.permissions.contains({ permissions: ["debugger", "tabs"] });
    if (!permission) {
      throw new ExtensionCommandError(
        IBP_ERROR_CODES.PERMISSION_DENIED,
        "Network capture requires the Chrome debugger permission",
        false,
      );
    }
    const tab = await chrome.tabs.get(parameters.tabId);
    const url = tab.pendingUrl ?? tab.url;
    if (url === undefined || !/^https?:/iu.test(url)) {
      throw new ExtensionCommandError(
        IBP_ERROR_CODES.RESTRICTED_PAGE,
        "Network capture is only available on normal HTTP(S) pages",
        false,
      );
    }
    const existing = this.#captures.get(parameters.tabId);
    if (existing?.active === true) {
      existing.bufferSize = parameters.bufferSize;
      this.#trim(existing);
      return this.#data(parameters.tabId, "start", existing, false);
    }
    const lease = await debuggerSessions.acquire(parameters.tabId).catch((error: unknown) => {
      throw new ExtensionCommandError(
        IBP_ERROR_CODES.BROWSER_API_ERROR,
        "Chrome could not start network capture; close the visible DevTools window for this tab and retry",
        true,
        { cause: error },
      );
    });
    try {
      await lease.sendCommand("Network.enable", { maxPostDataSize: 0 });
      const capture: NetworkCapture = {
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
        "Chrome could not enable metadata-only network capture",
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
      const requestId = boundedString(parameters["requestId"], 256);
      if (requestId === undefined) return;
      const now = new Date().toISOString();
      if (method === "Network.requestWillBeSent") {
        const request = isRecord(parameters["request"]) ? parameters["request"] : {};
        this.#push(capture, {
          timestamp: now,
          phase: "request",
          requestId,
          url: sanitizedUrl(request["url"]),
          ...(boundedString(request["method"], 32) === undefined
            ? {}
            : { method: boundedString(request["method"], 32)! }),
          ...(boundedString(parameters["type"], 128) === undefined
            ? {}
            : { resourceType: boundedString(parameters["type"], 128)! }),
        });
      } else if (method === "Network.responseReceived") {
        const response = isRecord(parameters["response"]) ? parameters["response"] : {};
        this.#push(capture, {
          timestamp: now,
          phase: "response",
          requestId,
          url: sanitizedUrl(response["url"]),
          ...(boundedString(parameters["type"], 128) === undefined
            ? {}
            : { resourceType: boundedString(parameters["type"], 128)! }),
          ...(statusCode(response["status"]) === undefined
            ? {}
            : { status: statusCode(response["status"])! }),
          ...(boundedString(response["mimeType"], 256) === undefined
            ? {}
            : { mimeType: boundedString(response["mimeType"], 256)! }),
          ...(response["fromDiskCache"] === true ? { fromDiskCache: true } : {}),
          ...(response["fromServiceWorker"] === true ? { fromServiceWorker: true } : {}),
        });
      } else if (method === "Network.loadingFinished") {
        this.#push(capture, {
          timestamp: now,
          phase: "finished",
          requestId,
          url: "",
          ...(nonNegative(parameters["encodedDataLength"]) === undefined
            ? {}
            : { encodedDataLength: nonNegative(parameters["encodedDataLength"])! }),
        });
      } else if (method === "Network.loadingFailed") {
        this.#push(capture, {
          timestamp: now,
          phase: "failed",
          requestId,
          url: "",
          ...(boundedString(parameters["type"], 128) === undefined
            ? {}
            : { resourceType: boundedString(parameters["type"], 128)! }),
          ...(boundedString(parameters["errorText"], 1_000) === undefined
            ? {}
            : { errorText: boundedString(parameters["errorText"], 1_000)! }),
          ...(parameters["canceled"] === true ? { canceled: true } : {}),
          ...(boundedString(parameters["blockedReason"], 128) === undefined
            ? {}
            : { blockedReason: boundedString(parameters["blockedReason"], 128)! }),
        });
      }
    });
    this.#listening = true;
  }

  #push(capture: NetworkCapture, entry: Omit<NetworkEntry, "sequence">): void {
    capture.entries.push({ ...entry, sequence: capture.nextSequence++ });
    this.#trim(capture);
  }

  #trim(capture: NetworkCapture): void {
    while (capture.entries.length > capture.bufferSize) {
      capture.entries.shift();
      capture.droppedEntries += 1;
    }
  }

  #data(
    tabId: number,
    operation: NetworkCaptureParameters["operation"],
    capture: NetworkCapture | undefined,
    cleared: boolean,
    entries: NetworkEntry[] = capture?.entries ?? [],
  ): NetworkCaptureData {
    return NetworkCaptureDataSchema.parse({
      tabId,
      operation,
      active: capture?.active === true,
      captureId: capture?.captureId ?? null,
      startedAt: capture?.startedAt ?? null,
      entries,
      entryCount: entries.length,
      droppedEntries: capture?.droppedEntries ?? 0,
      cleared,
      bodiesCaptured: false,
      headersCaptured: false,
      queryStringsRedacted: true,
    });
  }
}
