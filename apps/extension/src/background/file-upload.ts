import {
  IBP_ERROR_CODES,
  SetFileInputFilesDataSchema,
  type SetFileInputFilesData,
  type SetFileInputFilesParameters,
} from "@invictum/protocol";

import { ExtensionCommandError } from "./command-error.js";
import { debuggerSessions, type ChromeDebuggerLease } from "./debugger-session.js";
import { isChromePageAccessDenied, pageAccessDeniedMessage } from "./page-access.js";

const CONTENT_CHANNEL = "invictum.browser.snapshot.v1";
const TARGET_ATTRIBUTE = "data-invictum-file-input-target";

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

interface PreparedFileInput {
  token: string;
  documentId: string;
  domRevisionBefore: number;
  elementId: string;
  multiple: boolean;
  accept: string;
}

const contentCommand = async (
  tabId: number,
  command: "prepare_file_input" | "complete_file_input" | "cancel_file_input",
  parameters: Record<string, unknown>,
): Promise<unknown> => {
  const requestId = crypto.randomUUID();
  const raw = await chrome.tabs.sendMessage(tabId, {
    channel: CONTENT_CHANNEL,
    command,
    requestId,
    parameters,
  });
  if (!isRecord(raw) || raw["requestId"] !== requestId || typeof raw["ok"] !== "boolean") {
    throw new ExtensionCommandError(
      IBP_ERROR_CODES.INVALID_MESSAGE,
      "The content script returned an invalid file-input response",
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
      : "The content script could not prepare the file input",
    isRecord(error) && typeof error["retryable"] === "boolean" ? error["retryable"] : true,
  );
};

const parsePrepared = (value: unknown): PreparedFileInput => {
  if (
    !isRecord(value) ||
    typeof value["token"] !== "string" ||
    typeof value["documentId"] !== "string" ||
    typeof value["domRevisionBefore"] !== "number" ||
    typeof value["elementId"] !== "string" ||
    typeof value["multiple"] !== "boolean" ||
    typeof value["accept"] !== "string"
  ) {
    throw new ExtensionCommandError(
      IBP_ERROR_CODES.INVALID_MESSAGE,
      "The content script returned invalid file-input preparation data",
      false,
    );
  }
  return value as unknown as PreparedFileInput;
};

const markerNode = (value: unknown, token: string): { backendNodeId: number } | undefined => {
  if (!isRecord(value) || !Array.isArray(value["nodes"])) return undefined;
  for (const rawNode of value["nodes"]) {
    if (!isRecord(rawNode) || !Array.isArray(rawNode["attributes"])) continue;
    const attributes = rawNode["attributes"];
    for (let index = 0; index < attributes.length - 1; index += 2) {
      if (
        attributes[index] === TARGET_ATTRIBUTE &&
        attributes[index + 1] === token &&
        typeof rawNode["backendNodeId"] === "number"
      ) {
        return { backendNodeId: rawNode["backendNodeId"] };
      }
    }
  }
  return undefined;
};

const sanitizedPage = (rawUrl: string): { url: string; origin: string } => {
  try {
    const parsed = new URL(rawUrl);
    parsed.username = "";
    parsed.password = "";
    for (const key of [...parsed.searchParams.keys()]) parsed.searchParams.set(key, "[REDACTED]");
    if (parsed.hash.length > 1) parsed.hash = "#[REDACTED]";
    return { url: parsed.toString().slice(0, 4_096), origin: parsed.origin.slice(0, 2_048) };
  } catch {
    return { url: "about:invalid", origin: "https://invalid.local" };
  }
};

export class ChromeFileUploadAdapter {
  readonly #activeTabs = new Set<number>();

  public async setFiles(parameters: SetFileInputFilesParameters): Promise<SetFileInputFilesData> {
    const permission = await chrome.permissions.contains({
      permissions: ["activeTab", "tabs", "scripting", "debugger"],
    });
    if (!permission) {
      throw new ExtensionCommandError(
        IBP_ERROR_CODES.PERMISSION_DENIED,
        "Local file upload requires page access and the Chrome debugger permission",
        false,
      );
    }
    if (this.#activeTabs.has(parameters.tabId)) {
      throw new ExtensionCommandError(
        IBP_ERROR_CODES.BROWSER_API_ERROR,
        `A file-input operation is already active for tab ${parameters.tabId}`,
        true,
      );
    }
    const tab = await chrome.tabs.get(parameters.tabId);
    const tabUrl = tab.pendingUrl ?? tab.url;
    if (tabUrl === undefined || !/^https?:/i.test(tabUrl)) {
      throw new ExtensionCommandError(
        IBP_ERROR_CODES.RESTRICTED_PAGE,
        "Local files can only be attached to a normal HTTP(S) page",
        false,
      );
    }

    this.#activeTabs.add(parameters.tabId);
    let prepared: PreparedFileInput | undefined;
    let lease: ChromeDebuggerLease | undefined;
    try {
      await chrome.scripting.executeScript({
        target: { tabId: parameters.tabId },
        files: ["content.js"],
      });
      prepared = parsePrepared(
        await contentCommand(parameters.tabId, "prepare_file_input", {
          tabId: parameters.tabId,
          documentId: parameters.documentId,
          domRevision: parameters.domRevision,
          elementId: parameters.elementId,
          fileCount: parameters.filePaths.length,
        }),
      );

      lease = await debuggerSessions.acquire(parameters.tabId);
      await lease.sendCommand("DOM.enable");
      const flattened = await lease.sendCommand("DOM.getFlattenedDocument", {
        depth: -1,
        pierce: true,
      });
      const node = markerNode(flattened, prepared.token);
      if (node === undefined) {
        throw new ExtensionCommandError(
          IBP_ERROR_CODES.STALE_ELEMENT_REFERENCE,
          "Chrome could not resolve the prepared file input; fetch a fresh snapshot and retry",
          true,
        );
      }
      await lease.sendCommand("DOM.setFileInputFiles", {
        files: parameters.filePaths,
        backendNodeId: node.backendNodeId,
      });
      try {
        const result = await contentCommand(parameters.tabId, "complete_file_input", {
          token: prepared.token,
          fileCount: parameters.filePaths.length,
        });
        prepared = undefined;
        return SetFileInputFilesDataSchema.parse(result);
      } catch (error) {
        const currentTab = await chrome.tabs.get(parameters.tabId).catch(() => undefined);
        const currentUrl = currentTab?.pendingUrl ?? currentTab?.url;
        const navigated =
          currentTab?.status === "loading" ||
          (typeof currentUrl === "string" && currentUrl !== tabUrl);
        if (!navigated) throw error;
        const completed = prepared;
        if (completed === undefined) throw error;
        prepared = undefined;
        return SetFileInputFilesDataSchema.parse({
          page: sanitizedPage(typeof currentUrl === "string" ? currentUrl : tabUrl),
          documentId: completed.documentId,
          domRevisionBefore: completed.domRevisionBefore,
          domRevisionAfter: completed.domRevisionBefore + 1,
          elementId: completed.elementId,
          fileCount: parameters.filePaths.length,
          countVerified: false,
          multiple: completed.multiple,
          accept: completed.accept,
          changed: true,
          requiresNewSnapshot: true,
          verificationRequired: true,
        });
      }
    } catch (error) {
      if (error instanceof ExtensionCommandError) throw error;
      if (isChromePageAccessDenied(error)) {
        throw new ExtensionCommandError(
          IBP_ERROR_CODES.PERMISSION_DENIED,
          pageAccessDeniedMessage(parameters.tabId, tabUrl, "local file upload"),
          false,
        );
      }
      throw new ExtensionCommandError(
        IBP_ERROR_CODES.BROWSER_API_ERROR,
        "Chrome could not attach the local file to the target input; close DevTools for that tab and retry",
        true,
        { cause: error },
      );
    } finally {
      await lease?.release();
      if (prepared !== undefined) {
        await contentCommand(parameters.tabId, "cancel_file_input", {
          token: prepared.token,
          fileCount: parameters.filePaths.length,
        }).catch(() => undefined);
      }
      this.#activeTabs.delete(parameters.tabId);
    }
  }
}
