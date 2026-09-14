import { getActionMetadata, IBP_ERROR_CODES } from "@invictum/protocol";

import { ExtensionCommandError } from "./background/command-error.js";

const STORAGE_KEY = "invictum.browser.domainPolicies.v1";

export type DomainPolicyMode =
  "allow_all" | "observe_only" | "safe_interaction" | "trusted_admin" | "block";

export interface DomainPolicyState {
  hostname: string;
  mode: DomainPolicyMode;
}

const modes = new Set<DomainPolicyMode>([
  "allow_all",
  "observe_only",
  "safe_interaction",
  "trusted_admin",
  "block",
]);

const hostnameFrom = (raw: string): string => {
  try {
    return new URL(raw).hostname
      .toLowerCase()
      .replace(/^\.+|\.+$/g, "")
      .slice(0, 253);
  } catch {
    return raw
      .toLowerCase()
      .replace(/^\.+|\.+$/g, "")
      .slice(0, 253);
  }
};

export class DomainPolicySettings {
  public async getForUrl(url: string): Promise<DomainPolicyState> {
    const hostname = hostnameFrom(url);
    const policies = await this.#load();
    return { hostname, mode: policies[hostname] ?? "allow_all" };
  }

  public async set(hostnameOrUrl: string, mode: DomainPolicyMode): Promise<DomainPolicyState> {
    if (!modes.has(mode)) throw new Error("Unsupported domain policy mode");
    const hostname = hostnameFrom(hostnameOrUrl);
    if (hostname.length === 0) throw new Error("A valid HTTP(S) hostname is required");
    const policies = await this.#load();
    if (mode === "allow_all") delete policies[hostname];
    else policies[hostname] = mode;
    await chrome.storage.local.set({ [STORAGE_KEY]: policies });
    return { hostname, mode };
  }

  public async authorize(action: string, parameters: unknown): Promise<void> {
    if (
      action.startsWith("system.") ||
      action === "browser.list_tabs" ||
      action === "browser.unlock_tab"
    ) {
      return;
    }
    const record =
      typeof parameters === "object" && parameters !== null
        ? (parameters as Record<string, unknown>)
        : {};
    const urls = new Set<string>();
    if (typeof record["url"] === "string") urls.add(record["url"]);
    if (typeof record["tabId"] === "number") {
      const tab = await chrome.tabs.get(record["tabId"]);
      if (tab.incognito) {
        throw new ExtensionCommandError(
          IBP_ERROR_CODES.POLICY_DENIED,
          "IBB does not control incognito-profile tabs",
          false,
        );
      }
      const current = tab.url;
      if (current !== undefined) urls.add(current);
    }
    const metadata = getActionMetadata(action);
    for (const url of urls) {
      if (!/^https?:/i.test(url)) continue;
      const { hostname, mode } = await this.getForUrl(url);
      const allowed =
        mode === "allow_all" ||
        (mode === "observe_only" && metadata?.readOnly === true) ||
        (mode === "safe_interaction" &&
          (metadata?.riskLevel === "diagnostic" ||
            metadata?.riskLevel === "R0" ||
            metadata?.riskLevel === "R1")) ||
        (mode === "trusted_admin" && action !== "browser.terminal_input");
      if (!allowed) {
        throw new ExtensionCommandError(
          IBP_ERROR_CODES.POLICY_DENIED,
          `Domain policy '${mode}' blocks ${action} on ${hostname}`,
          false,
        );
      }
    }
  }

  async #load(): Promise<Record<string, DomainPolicyMode>> {
    const stored = await chrome.storage.local.get(STORAGE_KEY);
    const raw = stored[STORAGE_KEY];
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};
    return Object.fromEntries(
      Object.entries(raw as Record<string, unknown>).filter(
        (entry): entry is [string, DomainPolicyMode] =>
          entry[0].length > 0 && modes.has(entry[1] as DomainPolicyMode),
      ),
    );
  }
}
