import {
  ExecuteJavaScriptDataSchema,
  IBP_ERROR_CODES,
  type ExecuteJavaScriptData,
  type ExecuteJavaScriptParameters,
  type JsonValue,
} from "@invictum/protocol";

import { ExtensionCommandError } from "./command-error.js";
import { debuggerSessions, type ChromeDebuggerLease } from "./debugger-session.js";
import { isChromePageAccessDenied, pageAccessDeniedMessage } from "./page-access.js";

const PROTECTED_SOURCE = new RegExp(
  [
    String.raw`document\s*\.\s*cookie`,
    String.raw`\b(?:localStorage|sessionStorage|indexedDB|PasswordCredential|CredentialsContainer|FormData)\b`,
    String.raw`\b(?:password|passwd|secret|token|otp|cvv|credit.?card|recovery.?code)\b`,
    String.raw`\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon)\b`,
    String.raw`\b(?:eval|Function|importScripts)\b|\bimport\s*\(`,
    String.raw`\b(?:location|history)\s*\.|\bwindow\s*\.\s*open\b`,
    String.raw`\.\s*(?:click|submit|requestSubmit)\s*\(`,
    String.raw`\.\s*value\b|\.\s*(?:innerHTML|outerHTML)\b|getAttribute\s*\(\s*["']value["']`,
    String.raw`\bchrome\s*\.`,
  ].join("|"),
  "iu",
);

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const normalizeValue = (value: unknown): { value: JsonValue; truncated: boolean } => {
  let truncated = false;
  const seen = new WeakSet<object>();
  const visit = (input: unknown, depth: number, key?: string): JsonValue => {
    if (
      key !== undefined &&
      /(?:password|passwd|secret|token|otp|cvv|credential|cookie)/iu.test(key)
    ) {
      return "[REDACTED]";
    }
    if (input === null || typeof input === "boolean") return input;
    if (typeof input === "number") return Number.isFinite(input) ? input : String(input);
    if (typeof input === "string") {
      if (input.length > 20_000) truncated = true;
      return input.slice(0, 20_000);
    }
    if (typeof input === "bigint") return input.toString();
    if (typeof input === "undefined") return null;
    if (typeof input === "function" || typeof input === "symbol") return String(input);
    if (depth >= 6 || seen.has(input)) {
      truncated = true;
      return "[TRUNCATED]";
    }
    seen.add(input);
    if (Array.isArray(input)) {
      if (input.length > 100) truncated = true;
      return input.slice(0, 100).map((item) => visit(item, depth + 1));
    }
    const output: Record<string, JsonValue> = {};
    const entries = Object.entries(input).slice(0, 100);
    if (Object.keys(input).length > entries.length) truncated = true;
    for (const [entryKey, entryValue] of entries) {
      output[entryKey.slice(0, 256)] = visit(entryValue, depth + 1, entryKey);
    }
    return output;
  };
  return { value: visit(value, 0), truncated };
};

const exceptionMessage = (value: unknown): string => {
  if (!isRecord(value)) return "The page JavaScript threw an exception";
  const details = value["exceptionDetails"];
  if (!isRecord(details)) return "The page JavaScript threw an exception";
  const exception = details["exception"];
  const raw =
    isRecord(exception) && typeof exception["description"] === "string"
      ? exception["description"]
      : typeof details["text"] === "string"
        ? details["text"]
        : "The page JavaScript threw an exception";
  return raw
    .replace(/https?:\/\/[^\s)]+/giu, (url) => {
      try {
        const parsed = new URL(url);
        return `${parsed.origin}${parsed.pathname}`;
      } catch {
        return "[URL]";
      }
    })
    .slice(0, 2_000);
};

export class ChromeRawJavaScriptAdapter {
  readonly #activeTabs = new Set<number>();

  public async execute(parameters: ExecuteJavaScriptParameters): Promise<ExecuteJavaScriptData> {
    if (PROTECTED_SOURCE.test(parameters.source)) {
      throw new ExtensionCommandError(
        IBP_ERROR_CODES.SCRIPT_POLICY_DENIED,
        "Raw JavaScript cannot directly access values, credentials, cookies/storage, network, navigation, submit/click, dynamic-code, payment, OTP, or extension surfaces",
        false,
      );
    }
    const permission = await chrome.permissions.contains({
      permissions: ["activeTab", "tabs", "debugger"],
    });
    if (!permission) {
      throw new ExtensionCommandError(
        IBP_ERROR_CODES.PERMISSION_DENIED,
        "Raw JavaScript execution requires page access and the Chrome debugger permission",
        false,
      );
    }
    if (this.#activeTabs.has(parameters.tabId)) {
      throw new ExtensionCommandError(
        IBP_ERROR_CODES.BROWSER_API_ERROR,
        `Raw JavaScript execution is already active for tab ${parameters.tabId}`,
        true,
      );
    }
    const tab = await chrome.tabs.get(parameters.tabId);
    const tabUrl = tab.pendingUrl ?? tab.url;
    if (tabUrl === undefined || !/^https?:/iu.test(tabUrl)) {
      throw new ExtensionCommandError(
        IBP_ERROR_CODES.RESTRICTED_PAGE,
        "Raw JavaScript execution is only available on normal HTTP(S) pages",
        false,
      );
    }
    const expression =
      parameters.sourceType === "expression"
        ? `(${parameters.source}\n)`
        : `(async () => {\n${parameters.source}\n})()`;
    this.#activeTabs.add(parameters.tabId);
    let lease: ChromeDebuggerLease | undefined;
    try {
      lease = await debuggerSessions.acquire(parameters.tabId);
      await lease.sendCommand("Runtime.enable");
      const evaluated = await lease.sendCommand("Runtime.evaluate", {
        expression,
        objectGroup: "invictum-raw-javascript",
        includeCommandLineAPI: false,
        silent: true,
        returnByValue: true,
        awaitPromise: parameters.awaitPromise,
        userGesture: parameters.userGesture,
        timeout: parameters.timeoutMs,
        disableBreaks: true,
        allowUnsafeEvalBlockedByCSP: false,
      });
      if (isRecord(evaluated) && evaluated["exceptionDetails"] !== undefined) {
        throw new ExtensionCommandError(
          IBP_ERROR_CODES.SCRIPT_EXECUTION_FAILED,
          exceptionMessage(evaluated),
          false,
        );
      }
      if (!isRecord(evaluated) || !isRecord(evaluated["result"])) {
        throw new ExtensionCommandError(
          IBP_ERROR_CODES.SCRIPT_EXECUTION_FAILED,
          "Chrome returned an invalid raw JavaScript result",
          false,
        );
      }
      const remote = evaluated["result"];
      const rawValue =
        "value" in remote
          ? remote["value"]
          : typeof remote["unserializableValue"] === "string"
            ? remote["unserializableValue"]
            : null;
      const normalized = normalizeValue(rawValue);
      await lease
        .sendCommand("Runtime.releaseObjectGroup", {
          objectGroup: "invictum-raw-javascript",
        })
        .catch(() => undefined);
      return ExecuteJavaScriptDataSchema.parse({
        tabId: parameters.tabId,
        sourceType: parameters.sourceType,
        value: normalized.value,
        valueType:
          typeof remote["subtype"] === "string"
            ? remote["subtype"]
            : typeof remote["type"] === "string"
              ? remote["type"]
              : "unknown",
        description:
          typeof remote["description"] === "string" ? remote["description"].slice(0, 2_000) : "",
        truncated: normalized.truncated,
        awaitPromise: parameters.awaitPromise,
        userGesture: parameters.userGesture,
        debuggerUsed: true,
        requiresNewSnapshot: true,
      });
    } catch (error) {
      if (error instanceof ExtensionCommandError) throw error;
      if (isChromePageAccessDenied(error)) {
        throw new ExtensionCommandError(
          IBP_ERROR_CODES.PERMISSION_DENIED,
          pageAccessDeniedMessage(parameters.tabId, tabUrl, "raw JavaScript execution"),
          false,
        );
      }
      throw new ExtensionCommandError(
        IBP_ERROR_CODES.SCRIPT_EXECUTION_FAILED,
        "Chrome could not execute raw JavaScript; close DevTools for that tab and retry once",
        true,
        { cause: error },
      );
    } finally {
      await lease?.release();
      this.#activeTabs.delete(parameters.tabId);
    }
  }
}
