import {
  GetWordPressAdminDataSchema,
  IBP_ERROR_CODES,
  WordPressListTableActionDataSchema,
  type GetWordPressAdminData,
  type GetWordPressAdminParameters,
  type WordPressListTableActionData,
  type WordPressListTableActionParameters,
} from "@invictum/protocol";

import { ExtensionCommandError } from "./command-error.js";
import { TOP_FRAME_ID } from "./frames.js";
import { isChromePageAccessDenied, pageAccessDeniedMessage } from "./page-access.js";

const CONTENT_CHANNEL = "invictum.browser.snapshot.v1";

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const contentCommand = async (
  tabId: number,
  command: "get_wordpress_admin" | "wordpress_list_table_action",
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
      "The content script returned an invalid WordPress-admin response",
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
      : "The content script could not operate the WordPress admin screen",
    isRecord(error) && typeof error["retryable"] === "boolean" ? error["retryable"] : true,
  );
};

const normalPage = async (tabId: number): Promise<string> => {
  const permission = await chrome.permissions.contains({
    permissions: ["activeTab", "tabs", "scripting"],
  });
  if (!permission) {
    throw new ExtensionCommandError(
      IBP_ERROR_CODES.PERMISSION_DENIED,
      "WordPress admin tools require page access and the scripting permission",
      false,
    );
  }
  const tab = await chrome.tabs.get(tabId);
  const url = tab.pendingUrl ?? tab.url;
  if (url === undefined || !/^https?:/iu.test(url)) {
    throw new ExtensionCommandError(
      IBP_ERROR_CODES.RESTRICTED_PAGE,
      "WordPress admin tools are only available on normal HTTP(S) pages",
      false,
    );
  }
  return url;
};

export class ChromeWordPressAdminAdapter {
  public async inspect(parameters: GetWordPressAdminParameters): Promise<GetWordPressAdminData> {
    return this.#run(
      parameters.tabId,
      "get_wordpress_admin",
      parameters,
      GetWordPressAdminDataSchema,
      "read the WordPress admin screen",
    );
  }

  public async act(
    parameters: WordPressListTableActionParameters,
  ): Promise<WordPressListTableActionData> {
    return this.#run(
      parameters.tabId,
      "wordpress_list_table_action",
      parameters,
      WordPressListTableActionDataSchema,
      "run the WordPress list-table action",
    );
  }

  async #run<T>(
    tabId: number,
    command: "get_wordpress_admin" | "wordpress_list_table_action",
    parameters: unknown,
    schema: { parse: (value: unknown) => T },
    purpose: string,
  ): Promise<T> {
    const tabUrl = await normalPage(tabId);
    try {
      await chrome.scripting.executeScript({
        target: { tabId, allFrames: true },
        files: ["content.js"],
      });
      return schema.parse(await contentCommand(tabId, command, parameters));
    } catch (error) {
      if (error instanceof ExtensionCommandError) throw error;
      if (isChromePageAccessDenied(error)) {
        throw new ExtensionCommandError(
          IBP_ERROR_CODES.PERMISSION_DENIED,
          pageAccessDeniedMessage(tabId, tabUrl, purpose),
          false,
        );
      }
      throw new ExtensionCommandError(
        IBP_ERROR_CODES.BROWSER_API_ERROR,
        `Chrome could not ${purpose}`,
        true,
        { cause: error },
      );
    }
  }
}
