import {
  IBP_ERROR_CODES,
  PageSnapshotSchema,
  type GetPageSnapshotParameters,
  type PageSnapshot,
} from "@invictum/protocol";

import { ExtensionCommandError } from "./command-error.js";
import { isChromePageAccessDenied, pageAccessDeniedMessage } from "./page-access.js";

const SNAPSHOT_CHANNEL = "invictum.browser.snapshot.v1";
const RESTRICTED_PROTOCOLS = new Set([
  "about:",
  "chrome:",
  "chrome-extension:",
  "devtools:",
  "edge:",
  "view-source:",
]);

interface SnapshotResponse {
  ok: boolean;
  requestId: string;
  snapshot?: unknown;
  error?: {
    code: string;
    message: string;
    retryable: boolean;
  };
}

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const parseSnapshotResponse = (value: unknown, requestId: string): SnapshotResponse => {
  if (!isRecord(value) || value["requestId"] !== requestId || typeof value["ok"] !== "boolean") {
    throw new ExtensionCommandError(
      IBP_ERROR_CODES.INVALID_MESSAGE,
      "The content script returned an invalid response envelope",
      false,
    );
  }
  if (value["ok"] === true) {
    return { ok: true, requestId, snapshot: value["snapshot"] };
  }
  const error = value["error"];
  if (
    !isRecord(error) ||
    typeof error["code"] !== "string" ||
    typeof error["message"] !== "string" ||
    typeof error["retryable"] !== "boolean"
  ) {
    throw new ExtensionCommandError(
      IBP_ERROR_CODES.INVALID_MESSAGE,
      "The content script returned an invalid error envelope",
      false,
    );
  }
  return {
    ok: false,
    requestId,
    error: {
      code: error["code"],
      message: error["message"],
      retryable: error["retryable"],
    },
  };
};

const isRestrictedUrl = (rawUrl: string | undefined): boolean => {
  if (rawUrl === undefined) return true;
  try {
    return RESTRICTED_PROTOCOLS.has(new URL(rawUrl).protocol);
  } catch {
    return true;
  }
};

export class ChromePageSnapshotAdapter {
  public async getPageSnapshot(parameters: GetPageSnapshotParameters): Promise<PageSnapshot> {
    const permissionsGranted = await chrome.permissions.contains({
      permissions: ["activeTab", "scripting"],
    });
    if (!permissionsGranted) {
      throw new ExtensionCommandError(
        IBP_ERROR_CODES.PERMISSION_DENIED,
        "Page inspection permission is unavailable; set Invictum Site access to On all sites",
        false,
      );
    }

    const tab = await chrome.tabs.get(parameters.tabId);
    const tabUrl = tab.pendingUrl ?? tab.url;
    if (isRestrictedUrl(tabUrl)) {
      throw new ExtensionCommandError(
        IBP_ERROR_CODES.RESTRICTED_PAGE,
        "Chrome does not allow page snapshots for this browser-internal page",
        false,
      );
    }
    const requestId = crypto.randomUUID();
    try {
      await chrome.scripting.executeScript({
        target: { tabId: parameters.tabId },
        files: ["content.js"],
      });
      const rawResponse: unknown = await chrome.tabs.sendMessage(parameters.tabId, {
        channel: SNAPSHOT_CHANNEL,
        command: "get_page_snapshot",
        requestId,
        parameters,
      });
      const response = parseSnapshotResponse(rawResponse, requestId);
      if (!response.ok) {
        throw new ExtensionCommandError(
          response.error?.code ?? IBP_ERROR_CODES.CONTENT_SCRIPT_UNAVAILABLE,
          response.error?.message ?? "The content script could not generate a page snapshot",
          response.error?.retryable ?? true,
        );
      }
      return PageSnapshotSchema.parse(response.snapshot);
    } catch (error) {
      if (error instanceof ExtensionCommandError) throw error;
      if (isChromePageAccessDenied(error)) {
        throw new ExtensionCommandError(
          IBP_ERROR_CODES.PERMISSION_DENIED,
          pageAccessDeniedMessage(parameters.tabId, tabUrl, "page snapshot access"),
          false,
        );
      }
      throw new ExtensionCommandError(
        IBP_ERROR_CODES.CONTENT_SCRIPT_UNAVAILABLE,
        "The target page is not available to the Invictum content script",
        true,
        { cause: error },
      );
    }
  }
}
