import {
  HandleJavaScriptDialogDataSchema,
  IBP_ERROR_CODES,
  type HandleJavaScriptDialogData,
  type HandleJavaScriptDialogParameters,
} from "@invictum/protocol";

import { ExtensionCommandError } from "./command-error.js";
import { debuggerSessions, type ChromeDebuggerLease } from "./debugger-session.js";

type DialogTrigger = HandleJavaScriptDialogParameters["trigger"];

const originFor = (rawUrl: unknown): string => {
  try {
    return new URL(typeof rawUrl === "string" ? rawUrl : "").origin;
  } catch {
    return "unknown://dialog";
  }
};

const asDialogType = (
  value: unknown,
): "alert" | "confirm" | "prompt" | "beforeunload" | "unknown" =>
  value === "alert" || value === "confirm" || value === "prompt" || value === "beforeunload"
    ? value
    : "unknown";

export class ChromeJavaScriptDialogAdapter {
  readonly #activeTabs = new Set<number>();

  public async handle(
    parameters: HandleJavaScriptDialogParameters,
    trigger: (trigger: DialogTrigger) => Promise<unknown>,
  ): Promise<HandleJavaScriptDialogData> {
    const permission = await chrome.permissions.contains({ permissions: ["debugger", "tabs"] });
    if (!permission) {
      throw new ExtensionCommandError(
        IBP_ERROR_CODES.PERMISSION_DENIED,
        "Native JavaScript dialog handling requires the Chrome debugger permission",
        false,
      );
    }
    if (this.#activeTabs.has(parameters.tabId)) {
      throw new ExtensionCommandError(
        IBP_ERROR_CODES.BROWSER_API_ERROR,
        `A native dialog handler is already active for tab ${parameters.tabId}`,
        true,
      );
    }
    const tab = await chrome.tabs.get(parameters.tabId);
    const initialOrigin = originFor(tab.url);
    if (!initialOrigin.startsWith("http://") && !initialOrigin.startsWith("https://")) {
      throw new ExtensionCommandError(
        IBP_ERROR_CODES.RESTRICTED_PAGE,
        `Native dialog handling requires a normal HTTP(S) tab ${parameters.tabId}`,
        false,
      );
    }

    const target: chrome.debugger.Debuggee = { tabId: parameters.tabId };
    this.#activeTabs.add(parameters.tabId);
    let lease: ChromeDebuggerLease | undefined;
    let resolveDialog!: (data: HandleJavaScriptDialogData) => void;
    let rejectDialog!: (error: unknown) => void;
    const dialog = new Promise<HandleJavaScriptDialogData>((resolve, reject) => {
      resolveDialog = resolve;
      rejectDialog = reject;
    });
    let handled = false;
    const onEvent = (
      source: chrome.debugger.DebuggerSession,
      method: string,
      rawParameters?: object,
    ): void => {
      if (source.tabId !== parameters.tabId || method !== "Page.javascriptDialogOpening" || handled)
        return;
      handled = true;
      const event = (rawParameters ?? {}) as Record<string, unknown>;
      void chrome.debugger
        .sendCommand(target, "Page.handleJavaScriptDialog", {
          accept: parameters.accept,
          ...(parameters.accept && parameters.promptText !== undefined
            ? { promptText: parameters.promptText }
            : {}),
        })
        .then(() =>
          resolveDialog(
            HandleJavaScriptDialogDataSchema.parse({
              tabId: parameters.tabId,
              detected: true,
              handled: true,
              accepted: parameters.accept,
              type: asDialogType(event["type"]),
              message: typeof event["message"] === "string" ? event["message"].slice(0, 2_000) : "",
              origin: originFor(event["url"] ?? tab.url),
              triggerType: parameters.trigger.type,
              promptTextSupplied: parameters.promptText !== undefined,
              requiresNewSnapshot: true,
            }),
          ),
        )
        .catch(rejectDialog);
    };
    const onDetach = (source: chrome.debugger.Debuggee): void => {
      if (source.tabId === parameters.tabId && !handled) {
        rejectDialog(
          new ExtensionCommandError(
            IBP_ERROR_CODES.BROWSER_API_ERROR,
            `Chrome detached the native dialog handler for tab ${parameters.tabId}`,
            true,
          ),
        );
      }
    };
    chrome.debugger.onEvent.addListener(onEvent);
    chrome.debugger.onDetach.addListener(onDetach);
    const timer = setTimeout(
      () =>
        rejectDialog(
          new ExtensionCommandError(
            IBP_ERROR_CODES.TIMEOUT,
            parameters.trigger.type === "none"
              ? `No currently open native JavaScript dialog was found on tab ${parameters.tabId} within ${parameters.timeoutMs} ms`
              : `No native JavaScript dialog appeared within ${parameters.timeoutMs} ms`,
            true,
          ),
        ),
      parameters.timeoutMs,
    );

    try {
      lease = await debuggerSessions.acquire(parameters.tabId);

      if (parameters.trigger.type === "none") {
        try {
          // If Chrome permits a late debugger attachment, try the recovery
          // command before Page.enable. Browser-native modals can block the
          // attachment itself, so callers must arm click/navigation triggers
          // proactively whenever the choice is known in advance.
          await lease.sendCommand("Page.handleJavaScriptDialog", {
            accept: parameters.accept,
            ...(parameters.accept && parameters.promptText !== undefined
              ? { promptText: parameters.promptText }
              : {}),
          });
          handled = true;
          resolveDialog(
            HandleJavaScriptDialogDataSchema.parse({
              tabId: parameters.tabId,
              detected: true,
              handled: true,
              accepted: parameters.accept,
              type: "unknown",
              message: "",
              origin: initialOrigin,
              triggerType: "none",
              promptTextSupplied: parameters.promptText !== undefined,
              requiresNewSnapshot: true,
            }),
          );
        } catch {
          await lease.sendCommand("Page.enable");
          // No current dialog. Keep the Page domain armed for a dialog that
          // appears during the bounded timeout.
        }
      } else {
        await lease.sendCommand("Page.enable");
      }

      const triggerPromise =
        parameters.trigger.type === "none" ? Promise.resolve() : trigger(parameters.trigger);
      const triggerFailure = triggerPromise.then(
        () => new Promise<never>(() => undefined),
        (error: unknown) => Promise.reject(error),
      );
      const result = await Promise.race([dialog, triggerFailure]);
      await triggerPromise;
      return result;
    } catch (error) {
      if (error instanceof ExtensionCommandError) throw error;
      throw new ExtensionCommandError(
        IBP_ERROR_CODES.BROWSER_API_ERROR,
        "Chrome could not attach or handle the native JavaScript dialog; close DevTools on the target tab and retry",
        true,
        { cause: error },
      );
    } finally {
      clearTimeout(timer);
      chrome.debugger.onEvent.removeListener(onEvent);
      chrome.debugger.onDetach.removeListener(onDetach);
      await lease?.release();
      this.#activeTabs.delete(parameters.tabId);
    }
  }
}
