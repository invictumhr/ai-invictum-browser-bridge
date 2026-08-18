import {
  IBP_ERROR_CODES,
  ActivateTabDataSchema,
  CloseTabDataSchema,
  HistoryNavigationDataSchema,
  NavigateDataSchema,
  OpenTabDataSchema,
  WaitForDataSchema,
  type CloseTabData,
  type CloseTabParameters,
  type ActivateTabData,
  type ActivateTabParameters,
  type HistoryNavigationData,
  type HistoryNavigationParameters,
  type NavigateData,
  type NavigateParameters,
  type OpenTabData,
  type OpenTabParameters,
  type PageSnapshot,
  type WaitForData,
  type WaitForParameters,
} from "@invictum/protocol";

import { AgentWindow } from "./agent-window.js";
import { ExtensionCommandError } from "./command-error.js";
import { debuggerSessions } from "./debugger-session.js";
import { isChromePageAccessDenied } from "./page-access.js";
import { mapChromeTab } from "./tabs.js";
import { TabActivationSettings } from "../tab-activation-settings.js";

const delay = async (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

const navigateToAdjacentHistoryEntry = async (
  tabId: number,
  direction: "back" | "forward",
  originalError: unknown,
): Promise<void> => {
  const lease = await debuggerSessions.acquire(tabId).catch(() => undefined);
  if (lease === undefined) throw originalError;
  try {
    const rawHistory = await lease.sendCommand("Page.getNavigationHistory");
    if (typeof rawHistory !== "object" || rawHistory === null) throw originalError;
    const history = rawHistory as Record<string, unknown>;
    const currentIndex = history["currentIndex"];
    const entries = history["entries"];
    if (!Number.isInteger(currentIndex) || !Array.isArray(entries)) throw originalError;
    const targetIndex = (currentIndex as number) + (direction === "back" ? -1 : 1);
    const targetEntry = entries[targetIndex];
    if (typeof targetEntry !== "object" || targetEntry === null) throw originalError;
    const entryId = (targetEntry as Record<string, unknown>)["id"];
    if (!Number.isInteger(entryId)) throw originalError;
    await lease.sendCommand("Page.navigateToHistoryEntry", { entryId });
  } catch {
    throw originalError;
  } finally {
    await lease.release();
  }
};

type TextWaitCondition = {
  type: "url" | "title" | "selector" | "text";
  value: string;
  match: "exact" | "contains";
  caseSensitive: boolean;
};

const waitUntilComplete = async (tabId: number, timeoutMs: number): Promise<void> => {
  const current = await chrome.tabs.get(tabId);
  if (current.status === "complete") return;
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (error?: unknown): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(listener);
      if (error === undefined) resolve();
      else reject(error);
    };
    const timer = setTimeout(() => {
      finish(
        new ExtensionCommandError(
          IBP_ERROR_CODES.TIMEOUT,
          `Tab ${tabId} did not finish loading within ${timeoutMs} ms. For a native Leave site / unsaved-changes dialog, retry by arming browser.handle_javascript_dialog with a typed navigate trigger before navigation`,
          true,
        ),
      );
    }, timeoutMs);
    const listener = (updatedTabId: number, changeInfo: chrome.tabs.TabChangeInfo): void => {
      if (updatedTabId !== tabId || changeInfo.status !== "complete") return;
      finish();
    };
    chrome.tabs.onUpdated.addListener(listener);
    // Close the narrow race where the page completes between the first status
    // read and listener registration.
    void chrome.tabs.get(tabId).then(
      (latest) => {
        if (latest.status === "complete") finish();
      },
      (error: unknown) => finish(error),
    );
  });
};

const triggerAndWaitForNavigation = async (
  tabId: number,
  timeoutMs: number,
  previousUrl: string | undefined,
  trigger: () => Promise<unknown>,
): Promise<void> =>
  new Promise<void>((resolve, reject) => {
    let settled = false;
    let navigationObserved = false;
    const finish = (error?: unknown): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(listener);
      if (error === undefined) resolve();
      else reject(error);
    };
    const timer = setTimeout(() => {
      finish(
        new ExtensionCommandError(
          IBP_ERROR_CODES.TIMEOUT,
          `Tab ${tabId} did not finish the triggered navigation within ${timeoutMs} ms`,
          true,
        ),
      );
    }, timeoutMs);
    const listener = (
      updatedTabId: number,
      changeInfo: chrome.tabs.TabChangeInfo,
      updatedTab: chrome.tabs.Tab,
    ): void => {
      if (updatedTabId !== tabId) return;
      if (
        changeInfo.status === "loading" ||
        changeInfo.url !== undefined ||
        updatedTab.pendingUrl !== undefined
      ) {
        navigationObserved = true;
      }
      if (changeInfo.status === "complete" && navigationObserved) finish();
    };
    chrome.tabs.onUpdated.addListener(listener);
    void trigger().then(
      async () => {
        try {
          const latest = await chrome.tabs.get(tabId);
          const latestUrl = latest.pendingUrl ?? latest.url;
          if (
            latest.status === "loading" ||
            latest.pendingUrl !== undefined ||
            (latestUrl !== undefined && latestUrl !== previousUrl)
          ) {
            navigationObserved = true;
          }
          if (latest.status === "complete" && navigationObserved) finish();
        } catch (error) {
          finish(error);
        }
      },
      (error: unknown) => finish(error),
    );
  });

const evaluatePageCondition = (
  condition: TextWaitCondition,
): { matched: boolean; invalidSelector: boolean } => {
  if (condition.type === "selector") {
    try {
      return { matched: document.querySelector(condition.value) !== null, invalidSelector: false };
    } catch {
      return { matched: false, invalidSelector: true };
    }
  }
  const actual = document.body?.innerText ?? "";
  const [candidate, query] = condition.caseSensitive
    ? [actual, condition.value]
    : [actual.toLocaleLowerCase(), condition.value.toLocaleLowerCase()];
  return {
    matched:
      condition.match === "exact" ? candidate.trim() === query.trim() : candidate.includes(query),
    invalidSelector: false,
  };
};

const textMatches = (actual: string, condition: TextWaitCondition): boolean => {
  const [candidate, query] = condition.caseSensitive
    ? [actual, condition.value]
    : [actual.toLocaleLowerCase(), condition.value.toLocaleLowerCase()];
  return condition.match === "exact" ? candidate === query : candidate.includes(query);
};

export class ChromeNavigationAdapter {
  public constructor(
    private readonly activationSettings: TabActivationSettings = new TabActivationSettings(),
    private readonly agentWindow: AgentWindow = new AgentWindow(),
  ) {}

  public async openTab(parameters: OpenTabParameters): Promise<OpenTabData> {
    try {
      const active = await this.activationSettings.resolve(parameters.active);
      // Agent tabs live in the agent's own window so they never replace the tab
      // the user is looking at.
      const tab = await this.agentWindow.openTab(parameters.url, active);
      if (tab.id === undefined) {
        throw new ExtensionCommandError(
          IBP_ERROR_CODES.BROWSER_API_ERROR,
          "Chrome created a tab without an identifier",
          true,
        );
      }
      if (parameters.waitUntil === "complete") {
        await waitUntilComplete(tab.id, parameters.timeoutMs);
      }
      return OpenTabDataSchema.parse({
        tab: mapChromeTab(await chrome.tabs.get(tab.id)),
        created: true,
      });
    } catch (error) {
      if (error instanceof ExtensionCommandError) throw error;
      throw new ExtensionCommandError(
        IBP_ERROR_CODES.BROWSER_API_ERROR,
        "Chrome could not open the requested HTTP(S) tab",
        true,
        { cause: error },
      );
    }
  }

  public async navigate(parameters: NavigateParameters): Promise<NavigateData> {
    try {
      const beforeTab = await chrome.tabs.get(parameters.tabId);
      const before = mapChromeTab(beforeTab);
      const active = await this.activationSettings.resolve(parameters.active);
      await chrome.tabs.update(parameters.tabId, { active });
      if (parameters.waitUntil === "complete") {
        await triggerAndWaitForNavigation(
          parameters.tabId,
          parameters.timeoutMs,
          beforeTab.pendingUrl ?? beforeTab.url,
          () => chrome.tabs.update(parameters.tabId, { url: parameters.url }),
        );
      } else {
        await chrome.tabs.update(parameters.tabId, { url: parameters.url });
      }
      const after = mapChromeTab(await chrome.tabs.get(parameters.tabId));
      return NavigateDataSchema.parse({
        tab: after,
        navigated: true,
        previousOrigin: before.origin,
        originChanged: before.origin !== after.origin,
      });
    } catch (error) {
      if (error instanceof ExtensionCommandError) throw error;
      throw new ExtensionCommandError(
        IBP_ERROR_CODES.BROWSER_API_ERROR,
        `Chrome could not navigate tab ${parameters.tabId}. For a native Leave site / unsaved-changes dialog, retry by arming browser.handle_javascript_dialog with a typed navigate trigger before navigation`,
        true,
        { cause: error },
      );
    }
  }

  public async navigateHistory(
    direction: "back" | "forward",
    parameters: HistoryNavigationParameters,
  ): Promise<HistoryNavigationData> {
    try {
      const beforeTab = await chrome.tabs.get(parameters.tabId);
      const before = mapChromeTab(beforeTab);
      const trigger = (): Promise<unknown> =>
        (direction === "back"
          ? chrome.tabs.goBack(parameters.tabId)
          : chrome.tabs.goForward(parameters.tabId)
        ).catch((error: unknown) =>
          navigateToAdjacentHistoryEntry(parameters.tabId, direction, error),
        );
      if (parameters.waitUntil === "complete") {
        await triggerAndWaitForNavigation(
          parameters.tabId,
          parameters.timeoutMs,
          beforeTab.pendingUrl ?? beforeTab.url,
          trigger,
        );
      } else {
        await trigger();
      }
      const after = mapChromeTab(await chrome.tabs.get(parameters.tabId));
      return HistoryNavigationDataSchema.parse({
        tab: after,
        direction,
        navigated: true,
        previousUrl: before.url,
        previousOrigin: before.origin,
        originChanged: before.origin !== after.origin,
      });
    } catch (error) {
      if (error instanceof ExtensionCommandError) throw error;
      throw new ExtensionCommandError(
        IBP_ERROR_CODES.BROWSER_API_ERROR,
        `Chrome could not navigate tab ${parameters.tabId} ${direction} in history. If unsaved changes may exist, arm browser.handle_javascript_dialog before navigation`,
        true,
        { cause: error },
      );
    }
  }

  public async activateTab(parameters: ActivateTabParameters): Promise<ActivateTabData> {
    try {
      await chrome.tabs.update(parameters.tabId, { active: true });
      return ActivateTabDataSchema.parse({
        tab: mapChromeTab(await chrome.tabs.get(parameters.tabId)),
        activated: true,
      });
    } catch (error) {
      if (error instanceof ExtensionCommandError) throw error;
      throw new ExtensionCommandError(
        IBP_ERROR_CODES.BROWSER_API_ERROR,
        `Chrome could not activate tab ${parameters.tabId}`,
        true,
        { cause: error },
      );
    }
  }

  public async closeTab(parameters: CloseTabParameters): Promise<CloseTabData> {
    try {
      await chrome.tabs.get(parameters.tabId);
      await chrome.tabs.remove(parameters.tabId);
      return CloseTabDataSchema.parse({
        tabId: parameters.tabId,
        closed: true,
      });
    } catch (error) {
      if (error instanceof ExtensionCommandError) throw error;
      throw new ExtensionCommandError(
        IBP_ERROR_CODES.BROWSER_API_ERROR,
        `Chrome could not close tab ${parameters.tabId}`,
        true,
        { cause: error },
      );
    }
  }

  public async waitFor(
    parameters: WaitForParameters,
    snapshot: () => Promise<PageSnapshot>,
  ): Promise<WaitForData> {
    const startedAt = Date.now();
    const deadline = startedAt + parameters.timeoutMs;
    let stableRevision: number | undefined;
    let stableSince = startedAt;
    try {
      while (Date.now() <= deadline) {
        const condition = parameters.condition;
        let matched = false;
        let currentSnapshot: PageSnapshot | undefined;
        if (condition.type === "url" || condition.type === "title") {
          const tab = mapChromeTab(await chrome.tabs.get(parameters.tabId));
          matched = textMatches(
            condition.type === "url" ? tab.url : tab.title,
            condition as TextWaitCondition,
          );
        } else if (condition.type === "selector" || condition.type === "text") {
          const result = await chrome.scripting.executeScript({
            target: { tabId: parameters.tabId },
            world: "ISOLATED",
            func: evaluatePageCondition,
            args: [condition as TextWaitCondition],
          });
          const evaluation = result[0]?.result;
          if (evaluation?.invalidSelector === true) {
            throw new ExtensionCommandError(
              IBP_ERROR_CODES.INVALID_MESSAGE,
              "browser.wait_for received an invalid CSS selector",
              false,
            );
          }
          matched = evaluation?.matched === true;
        } else {
          const stableCondition = condition as { type: "dom_stable"; stableMs: number };
          currentSnapshot = await snapshot();
          if (stableRevision !== currentSnapshot.metadata.domRevision) {
            stableRevision = currentSnapshot.metadata.domRevision;
            stableSince = Date.now();
          }
          matched = Date.now() - stableSince >= stableCondition.stableMs;
        }
        if (matched) {
          currentSnapshot ??= await snapshot();
          return WaitForDataSchema.parse({
            tabId: parameters.tabId,
            matched: true,
            conditionType: condition.type,
            elapsedMs: Date.now() - startedAt,
            tab: mapChromeTab(await chrome.tabs.get(parameters.tabId)),
            documentId: currentSnapshot.metadata.documentId,
            domRevision: currentSnapshot.metadata.domRevision,
          });
        }
        await delay(Math.min(parameters.pollIntervalMs, Math.max(1, deadline - Date.now())));
      }
      throw new ExtensionCommandError(
        IBP_ERROR_CODES.TIMEOUT,
        `browser.wait_for did not match ${parameters.condition.type} within ${parameters.timeoutMs} ms. Check whether a native dialog is blocking the tab; reliable Leave site handling must be armed with a typed click or navigate trigger before the action`,
        true,
      );
    } catch (error) {
      if (error instanceof ExtensionCommandError) throw error;
      if (isChromePageAccessDenied(error)) {
        throw new ExtensionCommandError(
          IBP_ERROR_CODES.PERMISSION_DENIED,
          `Chrome site access is disabled for tab ${parameters.tabId}; set Invictum site access to On all sites`,
          false,
        );
      }
      throw error;
    }
  }
}
