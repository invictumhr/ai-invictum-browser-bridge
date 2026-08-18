import {
  EvaluateJavaScriptDataSchema,
  IBP_ERROR_CODES,
  type EvaluateJavaScriptData,
  type EvaluateJavaScriptParameters,
} from "@invictum/protocol";
import { analyzeJavaScriptExpression } from "@invictum/policy-engine";

import { ExtensionCommandError } from "./command-error.js";
import { debuggerSessions, type ChromeDebuggerLease } from "./debugger-session.js";
import { isChromePageAccessDenied, pageAccessDeniedMessage } from "./page-access.js";

const RESTRICTED_PROTOCOLS = new Set([
  "about:",
  "chrome:",
  "chrome-extension:",
  "devtools:",
  "edge:",
  "view-source:",
]);
const isRestrictedUrl = (rawUrl: string | undefined): boolean => {
  if (rawUrl === undefined) return true;
  try {
    return RESTRICTED_PROTOCOLS.has(new URL(rawUrl).protocol);
  } catch {
    return true;
  }
};

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/*
 * Runtime.evaluate compiles this complete expression directly. Do not reintroduce
 * eval()/Function(): MV3 blocks dynamic evaluation in extension isolated worlds.
 * The policy engine approves the embedded expression before this source is built.
 */
const buildApprovedEvaluationSource = (expression: string): string => `(() => {
  const rawValue = (${expression});
  let truncated = false;
  const seen = new WeakSet();
  const normalize = (value, depth) => {
    if (value === null || typeof value === "boolean") return value;
    if (typeof value === "number") return Number.isFinite(value) ? value : String(value);
    if (typeof value === "string") {
      if (value.length > 20000) truncated = true;
      return value.slice(0, 20000);
    }
    if (typeof value === "bigint") return value.toString();
    if (typeof value === "undefined") return null;
    if (typeof value === "function" || typeof value === "symbol") return String(value);
    if (depth >= 6 || seen.has(value)) {
      truncated = true;
      return "[TRUNCATED]";
    }
    seen.add(value);
    if (typeof Element !== "undefined" && value instanceof Element) {
      return {
        kind: "element",
        tag: value.tagName.toLowerCase(),
        id: value.id.slice(0, 128),
        role: (value.getAttribute("role") || "").slice(0, 128)
      };
    }
    if (Array.isArray(value)) {
      if (value.length > 100) truncated = true;
      return value.slice(0, 100).map((item) => normalize(item, depth + 1));
    }
    const output = {};
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const entries = Object.entries(descriptors).slice(0, 100);
    if (Object.keys(descriptors).length > entries.length) truncated = true;
    for (const [key, descriptor] of entries) {
      output[key.slice(0, 256)] =
        Object.prototype.hasOwnProperty.call(descriptor, "value")
          ? normalize(descriptor.value, depth + 1)
          : "[ACCESSOR]";
    }
    return output;
  };
  const value = normalize(rawValue, 0);
  const valueType =
    value === null ? "null" :
    Array.isArray(value) ? "array" :
    typeof value === "object" ? "object" :
    typeof value;
  return JSON.stringify({ value, valueType, truncated });
})()`;

const rootFrameId = (value: unknown): string | undefined => {
  if (!isRecord(value)) return undefined;
  const frameTree = value["frameTree"];
  if (!isRecord(frameTree)) return undefined;
  const frame = frameTree["frame"];
  return isRecord(frame) && typeof frame["id"] === "string" ? frame["id"] : undefined;
};

const executionContextId = (value: unknown): number | undefined =>
  isRecord(value) && typeof value["executionContextId"] === "number"
    ? value["executionContextId"]
    : undefined;

const serializedRuntimeValue = (value: unknown): string | undefined => {
  if (!isRecord(value) || !isRecord(value["result"])) return undefined;
  const remote = value["result"];
  return typeof remote["value"] === "string" ? remote["value"] : undefined;
};

export class ChromeJavaScriptAdapter {
  readonly #activeTabs = new Set<number>();

  public async evaluate(parameters: EvaluateJavaScriptParameters): Promise<EvaluateJavaScriptData> {
    const analysis = analyzeJavaScriptExpression(parameters.expression, parameters.mode);
    if (!analysis.allowed) {
      throw new ExtensionCommandError(IBP_ERROR_CODES.SCRIPT_POLICY_DENIED, analysis.reason, false);
    }
    const permissionsGranted = await chrome.permissions.contains({
      permissions: ["activeTab", "tabs", "debugger"],
    });
    if (!permissionsGranted) {
      throw new ExtensionCommandError(
        IBP_ERROR_CODES.PERMISSION_DENIED,
        "JavaScript evaluation requires page access and the Chrome debugger permission",
        false,
      );
    }
    if (this.#activeTabs.has(parameters.tabId)) {
      throw new ExtensionCommandError(
        IBP_ERROR_CODES.BROWSER_API_ERROR,
        `JavaScript evaluation is already active for tab ${parameters.tabId}`,
        true,
      );
    }
    const tab = await chrome.tabs.get(parameters.tabId);
    const tabUrl = tab.pendingUrl ?? tab.url;
    if (isRestrictedUrl(tabUrl)) {
      throw new ExtensionCommandError(
        IBP_ERROR_CODES.RESTRICTED_PAGE,
        "Chrome does not allow JavaScript evaluation on this browser-internal page",
        false,
      );
    }

    const objectGroup = "invictum-policy-javascript";
    this.#activeTabs.add(parameters.tabId);
    let lease: ChromeDebuggerLease | undefined;
    try {
      lease = await debuggerSessions.acquire(parameters.tabId);
      await lease.sendCommand("Runtime.enable");

      let contextId: number | undefined;
      if (parameters.world === "ISOLATED") {
        await lease.sendCommand("Page.enable");
        const frameTree = await lease.sendCommand("Page.getFrameTree");
        const frameId = rootFrameId(frameTree);
        if (frameId === undefined) {
          throw new ExtensionCommandError(
            IBP_ERROR_CODES.SCRIPT_EXECUTION_FAILED,
            "Chrome did not expose the target page frame",
            true,
          );
        }
        const isolatedWorld = await lease.sendCommand("Page.createIsolatedWorld", {
          frameId,
          worldName: "invictum-policy-javascript",
          grantUniveralAccess: false,
        });
        contextId = executionContextId(isolatedWorld);
        if (contextId === undefined) {
          throw new ExtensionCommandError(
            IBP_ERROR_CODES.SCRIPT_EXECUTION_FAILED,
            "Chrome did not create the isolated evaluation world",
            true,
          );
        }
      }

      const evaluated = await lease.sendCommand("Runtime.evaluate", {
        expression: buildApprovedEvaluationSource(parameters.expression),
        ...(contextId === undefined ? {} : { contextId }),
        objectGroup,
        includeCommandLineAPI: false,
        silent: true,
        returnByValue: true,
        awaitPromise: false,
        userGesture: false,
        timeout: 10_000,
        disableBreaks: true,
        allowUnsafeEvalBlockedByCSP: false,
      });
      if (isRecord(evaluated) && evaluated["exceptionDetails"] !== undefined) {
        throw new ExtensionCommandError(
          IBP_ERROR_CODES.SCRIPT_EXECUTION_FAILED,
          "The policy-approved JavaScript expression failed in the target tab",
          false,
        );
      }

      const serialized = serializedRuntimeValue(evaluated);
      let first: unknown;
      try {
        first = serialized === undefined ? undefined : JSON.parse(serialized);
      } catch {
        first = undefined;
      }
      if (
        typeof first !== "object" ||
        first === null ||
        !("value" in first) ||
        !("valueType" in first) ||
        !("truncated" in first) ||
        typeof first.valueType !== "string" ||
        typeof first.truncated !== "boolean"
      ) {
        throw new ExtensionCommandError(
          IBP_ERROR_CODES.SCRIPT_EXECUTION_FAILED,
          "The JavaScript result could not be serialized safely",
          false,
        );
      }
      return EvaluateJavaScriptDataSchema.parse({
        tabId: parameters.tabId,
        mode: parameters.mode,
        world: parameters.world,
        value: first.value,
        valueType: first.valueType,
        truncated: first.truncated,
      });
    } catch (error) {
      if (error instanceof ExtensionCommandError) throw error;
      if (isChromePageAccessDenied(error)) {
        throw new ExtensionCommandError(
          IBP_ERROR_CODES.PERMISSION_DENIED,
          pageAccessDeniedMessage(parameters.tabId, tabUrl, "policy-constrained JavaScript"),
          false,
        );
      }
      throw new ExtensionCommandError(
        IBP_ERROR_CODES.SCRIPT_EXECUTION_FAILED,
        "Chrome could not evaluate JavaScript; close DevTools for that tab and retry once",
        true,
        { cause: error },
      );
    } finally {
      if (lease !== undefined) {
        await lease
          .sendCommand("Runtime.releaseObjectGroup", { objectGroup })
          .catch(() => undefined);
        await lease.release();
      }
      this.#activeTabs.delete(parameters.tabId);
    }
  }
}
