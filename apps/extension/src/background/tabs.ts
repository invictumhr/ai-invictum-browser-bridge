import { IBP_ERROR_CODES, ListTabsDataSchema, type BrowserTab } from "@invictum/protocol";

import { ExtensionCommandError } from "./command-error.js";

const RESTRICTED_PROTOCOLS = new Set([
  "about:",
  "chrome:",
  "chrome-extension:",
  "devtools:",
  "edge:",
  "view-source:",
]);

interface SanitizedTabUrl {
  url: string;
  origin: string;
  restricted: boolean;
}

export const sanitizeTabUrl = (rawUrl: string): SanitizedTabUrl => {
  try {
    const parsed = new URL(rawUrl);
    const restricted = RESTRICTED_PROTOCOLS.has(parsed.protocol) || parsed.protocol === "file:";

    parsed.username = "";
    parsed.password = "";
    for (const key of [...parsed.searchParams.keys()]) {
      // Query values can carry sessions under application-specific names that
      // no key denylist can classify reliably. Tab discovery needs the path and
      // parameter names, not their values, so redact every value.
      parsed.searchParams.set(key, "[REDACTED]");
    }
    if (parsed.hash.length > 1) {
      parsed.hash = "#[REDACTED]";
    }

    if (parsed.protocol === "file:") {
      return { url: "file:///[LOCAL_FILE]", origin: "file://", restricted: true };
    }

    const origin =
      parsed.origin === "null" ? `${parsed.protocol}//${parsed.hostname}` : parsed.origin;
    return {
      url: parsed.toString().slice(0, 4_096),
      origin: origin.slice(0, 2_048),
      restricted,
    };
  } catch {
    return { url: "about:invalid", origin: "about://", restricted: true };
  }
};

export const mapChromeTab = (tab: chrome.tabs.Tab): BrowserTab => {
  if (tab.id === undefined) {
    throw new ExtensionCommandError(
      IBP_ERROR_CODES.BROWSER_API_ERROR,
      "Chrome returned a tab without an identifier",
      true,
    );
  }

  const location = sanitizeTabUrl(tab.pendingUrl ?? tab.url ?? "about:blank");
  const status = tab.status === "loading" || tab.status === "complete" ? tab.status : "unloaded";
  return {
    tabId: tab.id,
    windowId: tab.windowId,
    index: tab.index,
    active: tab.active,
    highlighted: tab.highlighted,
    pinned: tab.pinned,
    incognito: tab.incognito,
    audible: tab.audible ?? false,
    discarded: tab.discarded ?? false,
    status,
    title: (tab.title ?? "").slice(0, 512),
    url: location.url,
    origin: location.origin,
    restricted: location.restricted,
  };
};

export class ChromeTabsAdapter {
  public async hasPermission(): Promise<boolean> {
    return chrome.permissions.contains({ permissions: ["tabs"] });
  }

  public async hasGlobalPageAccess(): Promise<boolean> {
    return chrome.permissions.contains({
      permissions: ["tabs", "scripting"],
      origins: ["http://*/*", "https://*/*"],
    });
  }

  public async getTab(tabId: number): Promise<BrowserTab> {
    return mapChromeTab(await chrome.tabs.get(tabId));
  }

  public async listTabs(): Promise<ReturnType<typeof ListTabsDataSchema.parse>> {
    if (!(await this.hasPermission())) {
      throw new ExtensionCommandError(
        IBP_ERROR_CODES.PERMISSION_DENIED,
        "Tab metadata permission is unavailable; enable Invictum site access on all sites in Chrome extension details",
        false,
      );
    }

    try {
      const tabs = (await chrome.tabs.query({})).map(mapChromeTab);
      return ListTabsDataSchema.parse({ tabs, count: tabs.length, permission: "tabs" });
    } catch (error) {
      if (error instanceof ExtensionCommandError) {
        throw error;
      }
      throw new ExtensionCommandError(
        IBP_ERROR_CODES.BROWSER_API_ERROR,
        "Chrome could not enumerate tabs",
        true,
        { cause: error },
      );
    }
  }
}
