import {
  IBP_ERROR_CODES,
  ManageCssDataSchema,
  type ManageCssData,
  type ManageCssParameters,
} from "@invictum/protocol";

import { ExtensionCommandError } from "./command-error.js";
import { isChromePageAccessDenied, pageAccessDeniedMessage } from "./page-access.js";
import { containsUnsafeCss } from "../safe-css.js";

const STORAGE_PREFIX = "invictum.injected-css.";

interface StoredCssInjection {
  tabId: number;
  css: string;
  origin: "AUTHOR" | "USER";
  allFrames: boolean;
}

const isStoredInjection = (value: unknown): value is StoredCssInjection => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Readonly<Record<string, unknown>>;
  return (
    typeof record["tabId"] === "number" &&
    typeof record["css"] === "string" &&
    (record["origin"] === "AUTHOR" || record["origin"] === "USER") &&
    typeof record["allFrames"] === "boolean"
  );
};

const assertSafeCss = (css: string): void => {
  if (containsUnsafeCss(css)) {
    throw new ExtensionCommandError(
      IBP_ERROR_CODES.SCRIPT_POLICY_DENIED,
      "Injected CSS cannot use escapes/comments, external resources, credential side channels, password-mask overrides, or executable legacy constructs",
      false,
    );
  }
};

const normalPage = async (tabId: number): Promise<string> => {
  const permission = await chrome.permissions.contains({
    permissions: ["activeTab", "tabs", "scripting", "storage"],
  });
  if (!permission) {
    throw new ExtensionCommandError(
      IBP_ERROR_CODES.PERMISSION_DENIED,
      "CSS injection requires page access, scripting, and storage permissions",
      false,
    );
  }
  const tab = await chrome.tabs.get(tabId);
  const url = tab.pendingUrl ?? tab.url;
  if (url === undefined || !/^https?:/iu.test(url)) {
    throw new ExtensionCommandError(
      IBP_ERROR_CODES.RESTRICTED_PAGE,
      "CSS injection is only available on normal HTTP(S) pages",
      false,
    );
  }
  return url;
};

const keyFor = (injectionId: string): string => `${STORAGE_PREFIX}${injectionId}`;

export class ChromeCssAdapter {
  public async manage(parameters: ManageCssParameters): Promise<ManageCssData> {
    const tabUrl = await normalPage(parameters.tabId);
    try {
      if (parameters.operation === "add") {
        assertSafeCss(parameters.css);
        const injectionId = crypto.randomUUID();
        const stored: StoredCssInjection = {
          tabId: parameters.tabId,
          css: parameters.css,
          origin: parameters.origin,
          allFrames: parameters.allFrames,
        };
        await chrome.scripting.insertCSS({
          target: { tabId: parameters.tabId, allFrames: parameters.allFrames },
          css: parameters.css,
          origin: parameters.origin,
        });
        try {
          await chrome.storage.session.set({ [keyFor(injectionId)]: stored });
        } catch (error) {
          await chrome.scripting
            .removeCSS({
              target: { tabId: parameters.tabId, allFrames: parameters.allFrames },
              css: parameters.css,
              origin: parameters.origin,
            })
            .catch(() => undefined);
          throw error;
        }
        return ManageCssDataSchema.parse({
          tabId: parameters.tabId,
          operation: "add",
          injectionId,
          applied: true,
          removed: false,
          origin: parameters.origin,
          allFrames: parameters.allFrames,
          cssBytes: new TextEncoder().encode(parameters.css).byteLength,
          cleanupOnUnlock: true,
          requiresNewSnapshot: true,
        });
      }

      const key = keyFor(parameters.injectionId);
      const storedValue = (await chrome.storage.session.get(key))[key];
      if (!isStoredInjection(storedValue) || storedValue.tabId !== parameters.tabId) {
        throw new ExtensionCommandError(
          IBP_ERROR_CODES.STALE_ELEMENT_REFERENCE,
          "The CSS injection does not exist for this tab or was already cleaned up",
          false,
        );
      }
      await chrome.scripting.removeCSS({
        target: { tabId: parameters.tabId, allFrames: storedValue.allFrames },
        css: storedValue.css,
        origin: storedValue.origin,
      });
      await chrome.storage.session.remove(key);
      return ManageCssDataSchema.parse({
        tabId: parameters.tabId,
        operation: "remove",
        injectionId: parameters.injectionId,
        applied: false,
        removed: true,
        origin: storedValue.origin,
        allFrames: storedValue.allFrames,
        cssBytes: new TextEncoder().encode(storedValue.css).byteLength,
        cleanupOnUnlock: true,
        requiresNewSnapshot: true,
      });
    } catch (error) {
      if (error instanceof ExtensionCommandError) throw error;
      if (isChromePageAccessDenied(error)) {
        throw new ExtensionCommandError(
          IBP_ERROR_CODES.PERMISSION_DENIED,
          pageAccessDeniedMessage(parameters.tabId, tabUrl, "CSS injection"),
          false,
        );
      }
      throw new ExtensionCommandError(
        IBP_ERROR_CODES.BROWSER_API_ERROR,
        "Chrome could not apply or remove the requested CSS injection",
        true,
        { cause: error },
      );
    }
  }

  public async clearTab(tabId: number): Promise<void> {
    const all = await chrome.storage.session.get(null).catch(() => ({}));
    for (const [key, value] of Object.entries(all)) {
      if (!key.startsWith(STORAGE_PREFIX) || !isStoredInjection(value) || value.tabId !== tabId) {
        continue;
      }
      await chrome.scripting
        .removeCSS({
          target: { tabId, allFrames: value.allFrames },
          css: value.css,
          origin: value.origin,
        })
        .catch(() => undefined);
      await chrome.storage.session.remove(key).catch(() => undefined);
    }
  }

  public async forgetTab(tabId: number): Promise<void> {
    const all = await chrome.storage.session.get(null).catch(() => ({}));
    const keys = Object.entries(all)
      .filter(
        ([key, value]) =>
          key.startsWith(STORAGE_PREFIX) && isStoredInjection(value) && value.tabId === tabId,
      )
      .map(([key]) => key);
    if (keys.length > 0) await chrome.storage.session.remove(keys).catch(() => undefined);
  }
}
