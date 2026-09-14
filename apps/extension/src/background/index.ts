import { NativeConnectionManager } from "./native-connection.js";
import { ChromeTabsAdapter } from "./tabs.js";
import { ChromePageSnapshotAdapter } from "./snapshot.js";
import { ChromeFindElementsAdapter } from "./elements.js";
import { ChromeInteractionsAdapter } from "./interactions.js";
import { CONTROL_CHANNEL, TabControlIndicator } from "./control-indicator.js";
import { ChromeJavaScriptAdapter } from "./javascript.js";
import { ChromeScreenshotAdapter } from "./screenshot.js";
import { getExtensionCapabilities } from "./capabilities.js";
import { ChromeNavigationAdapter } from "./navigation.js";
import { ChromeHttpAuthAdapter } from "./http-auth.js";
import { ChromeJavaScriptDialogAdapter } from "./dialogs.js";
import { ChromeFileUploadAdapter } from "./file-upload.js";
import { ChromeAdvancedDomAdapter } from "./advanced-dom.js";
import { ChromeCssAdapter } from "./css.js";
import { ChromeRawJavaScriptAdapter } from "./raw-javascript.js";
import { ChromeBrowserConsoleAdapter } from "./console.js";
import { ChromeDeviceEmulationAdapter } from "./device-emulation.js";
import { ChromeNetworkCaptureAdapter } from "./network.js";
import { ChromePdfAdapter } from "./pdf.js";
import { ChromePageToolsAdapter } from "./page-tools.js";
import { ChromePageApiAdapter } from "./page-api.js";
import { ChromeFigmaAdapter } from "./figma.js";
import { ChromeWordPressMenuAdapter } from "./wordpress-menu.js";
import { ChromeWordPressAdminAdapter } from "./wordpress-admin.js";
import { ChromeWordPressEditorAdapter } from "./wordpress-editor.js";
import { ChromeTerminalAdapter } from "./terminal.js";
import { debuggerSessions } from "./debugger-session.js";
import { ChromeDiagnosticsAdapter } from "./diagnostics.js";
import { ChromeDownloadAdapter } from "./downloads.js";
import { ChromeWebMcpAdapter } from "./webmcp.js";
import { TabActivationSettings, type TabActivationMode } from "../tab-activation-settings.js";
import { DomainPolicySettings, type DomainPolicyMode } from "../domain-policy-settings.js";
import {
  BROWSER_CANCEL_WEBMCP_INVOCATION_ACTION,
  BROWSER_COMPARE_SCREENSHOT_ACTION,
  BROWSER_DOWNLOAD_ACTION,
  BROWSER_GET_ACCESSIBILITY_TREE_ACTION,
  BROWSER_GET_NAVIGATION_STATE_ACTION,
  BROWSER_GET_PERFORMANCE_METRICS_ACTION,
  BROWSER_INVOKE_WEBMCP_TOOL_ACTION,
  BROWSER_LIST_FRAMES_ACTION,
  BROWSER_LIST_WEBMCP_TOOLS_ACTION,
  BROWSER_WAIT_FOR_DOWNLOAD_ACTION,
  IBP_ERROR_CODES,
  type CancelWebMcpInvocationParameters,
  type CompareScreenshotParameters,
  type GetAccessibilityTreeParameters,
  type GetNavigationStateParameters,
  type GetPerformanceMetricsParameters,
  type InvokeWebMcpToolParameters,
  type ListFramesParameters,
  type ListWebMcpToolsParameters,
  type StartDownloadParameters,
  type WaitForDownloadParameters,
} from "@invictum/protocol";
import { ExtensionCommandError } from "./command-error.js";

const tabs = new ChromeTabsAdapter();
const snapshots = new ChromePageSnapshotAdapter();
const elements = new ChromeFindElementsAdapter();
const interactions = new ChromeInteractionsAdapter();
const javaScript = new ChromeJavaScriptAdapter();
const screenshot = new ChromeScreenshotAdapter();
const tabActivationSettings = new TabActivationSettings();
const domainPolicySettings = new DomainPolicySettings();
const navigation = new ChromeNavigationAdapter(tabActivationSettings);
const httpAuth = new ChromeHttpAuthAdapter();
const dialogs = new ChromeJavaScriptDialogAdapter();
const fileUpload = new ChromeFileUploadAdapter();
const advancedDom = new ChromeAdvancedDomAdapter();
const css = new ChromeCssAdapter();
const rawJavaScript = new ChromeRawJavaScriptAdapter();
const browserConsole = new ChromeBrowserConsoleAdapter();
const deviceEmulation = new ChromeDeviceEmulationAdapter();
const networkCapture = new ChromeNetworkCaptureAdapter();
const pdf = new ChromePdfAdapter();
const pageTools = new ChromePageToolsAdapter((parameters) => snapshots.getPageSnapshot(parameters));
const pageApi = new ChromePageApiAdapter();
const figma = new ChromeFigmaAdapter();
const wordpressMenu = new ChromeWordPressMenuAdapter();
const wordpressAdmin = new ChromeWordPressAdminAdapter();
const terminal = new ChromeTerminalAdapter();
const diagnostics = new ChromeDiagnosticsAdapter();
const downloads = new ChromeDownloadAdapter();
const webMcp = new ChromeWebMcpAdapter();
const wordpressEditor = new ChromeWordPressEditorAdapter((tabId) =>
  snapshots.getPageSnapshot({
    tabId,
    detail: "minimal",
    includeHidden: false,
    maxElements: 100,
    maxDepth: 16,
    maxTextLength: 5_000,
  }),
);
const cleanupAdvancedTab = async (tabId: number): Promise<void> => {
  await Promise.all([
    advancedDom.cleanup(tabId),
    css.clearTab(tabId).catch(() => undefined),
    browserConsole.cleanup(tabId),
    networkCapture.cleanup(tabId),
    deviceEmulation.cleanup(tabId),
  ]);
  await debuggerSessions.cleanup(tabId);
};
const indicator = new TabControlIndicator(cleanupAdvancedTab);
const connection = new NativeConnectionManager(
  {
    authorizeAction: (action, parameters) => domainPolicySettings.authorize(action, parameters),
    getCapabilities: () => getExtensionCapabilities(),
    listTabs: () => tabs.listTabs(),
    openTab: (parameters) => navigation.openTab(parameters),
    closeTab: async (parameters) => {
      await cleanupAdvancedTab(parameters.tabId);
      return navigation.closeTab(parameters);
    },
    navigate: (parameters) =>
      indicator.run(parameters.tabId, () => navigation.navigate(parameters)),
    navigateHistory: (direction, parameters) =>
      indicator.run(parameters.tabId, () => navigation.navigateHistory(direction, parameters)),
    activateTab: (parameters) =>
      indicator.run(parameters.tabId, () => navigation.activateTab(parameters)),
    waitFor: (parameters) =>
      indicator.run(parameters.tabId, () =>
        navigation.waitFor(parameters, () =>
          snapshots.getPageSnapshot({
            tabId: parameters.tabId,
            detail: "minimal",
            includeHidden: false,
            maxElements: 100,
            maxDepth: 16,
            maxTextLength: 5_000,
          }),
        ),
      ),
    setControlIdentity: async (parameters) => {
      await indicator.identify(parameters.tabId, parameters.agentName);
      return {
        tabId: parameters.tabId,
        agentName: parameters.agentName,
        label: `${parameters.agentName} is using this tab`,
        identified: true as const,
      };
    },
    unlockTab: async (parameters) => ({
      tabId: parameters.tabId,
      unlocked: await indicator.unlock(parameters.tabId),
    }),
    getPageSnapshot: (parameters) =>
      indicator.run(parameters.tabId, () => snapshots.getPageSnapshot(parameters)),
    getPageText: (parameters) =>
      indicator.run(parameters.tabId, () => pageTools.getPageText(parameters)),
    findElements: (parameters) =>
      indicator.run(parameters.tabId, () => elements.findElements(parameters)),
    findNaturalLanguage: (parameters) =>
      indicator.run(parameters.tabId, () => pageTools.findNaturalLanguage(parameters)),
    click: (parameters) => indicator.run(parameters.tabId, () => interactions.click(parameters)),
    typeText: (parameters) =>
      indicator.run(parameters.tabId, () => interactions.typeText(parameters)),
    setFileInputFiles: (parameters) =>
      indicator.run(parameters.tabId, () => fileUpload.setFiles(parameters)),
    selectOption: (parameters) =>
      indicator.run(parameters.tabId, () => interactions.selectOption(parameters)),
    setChecked: (parameters, checked) =>
      indicator.run(parameters.tabId, () => interactions.setChecked(parameters, checked)),
    submitForm: (parameters) =>
      indicator.run(parameters.tabId, () => interactions.submitForm(parameters)),
    getFigmaDocument: (parameters) =>
      indicator.run(parameters.tabId, () => figma.getDocument(parameters)),
    getFigmaLayers: (parameters) =>
      indicator.run(parameters.tabId, () => figma.getLayers(parameters)),
    getFigmaProperties: (parameters) =>
      indicator.run(parameters.tabId, () => figma.getProperties(parameters)),
    figmaSelect: (parameters) => indicator.run(parameters.tabId, () => figma.select(parameters)),
    figmaHealthcheck: (parameters) =>
      indicator.run(parameters.tabId, () => figma.healthcheck(parameters)),
    getWordPressMenu: (parameters) =>
      indicator.run(parameters.tabId, () => wordpressMenu.getMenu(parameters)),
    editWordPressMenu: (parameters) =>
      indicator.run(parameters.tabId, () => wordpressMenu.editMenu(parameters)),
    getWordPressAdmin: (parameters) =>
      indicator.run(parameters.tabId, () => wordpressAdmin.inspect(parameters)),
    wordpressListTableAction: (parameters) =>
      indicator.run(parameters.tabId, () => wordpressAdmin.act(parameters)),
    getWordPressEditor: (parameters) =>
      indicator.run(parameters.tabId, () => wordpressEditor.getEditor(parameters)),
    editWordPressEditor: (parameters) =>
      indicator.run(parameters.tabId, () => wordpressEditor.editEditor(parameters)),
    evaluateJavaScript: (parameters) =>
      indicator.run(parameters.tabId, () => javaScript.evaluate(parameters)),
    mutateDom: (parameters) =>
      indicator.run(parameters.tabId, () => advancedDom.mutate(parameters)),
    inspectElement: (parameters) =>
      indicator.run(parameters.tabId, () => advancedDom.inspect(parameters)),
    manageCss: (parameters) => indicator.run(parameters.tabId, () => css.manage(parameters)),
    observeEvents: (parameters) =>
      indicator.run(parameters.tabId, () => advancedDom.observeEvents(parameters)),
    executeJavaScript: (parameters) =>
      indicator.run(parameters.tabId, () => rawJavaScript.execute(parameters)),
    manageBrowserConsole: (parameters) =>
      indicator.run(parameters.tabId, () => browserConsole.manage(parameters)),
    manageDeviceEmulation: (parameters) =>
      indicator.run(parameters.tabId, () => deviceEmulation.manage(parameters)),
    captureScreenshot: (parameters) =>
      indicator.run(parameters.tabId, async () => {
        const snapshot = await snapshots.getPageSnapshot({
          tabId: parameters.tabId,
          detail: "minimal",
          includeHidden: false,
          maxElements: 100,
          maxDepth: 16,
          maxTextLength: 5_000,
        });
        const requestedElementIds = new Set<string>();
        if (parameters.mode === "element" && parameters.elementId !== undefined) {
          requestedElementIds.add(parameters.elementId);
        }
        for (const annotation of parameters.annotations) {
          if (annotation.target.type === "element") {
            requestedElementIds.add(annotation.target.elementId);
          }
        }
        const elementRects: Record<
          string,
          { x: number; y: number; width: number; height: number }
        > = {};
        for (const elementId of requestedElementIds) {
          const scopedSnapshot = await snapshots.getPageSnapshot({
            tabId: parameters.tabId,
            detail: "minimal",
            includeHidden: true,
            maxElements: 50,
            maxDepth: 4,
            maxTextLength: 2_000,
            scope: {
              documentId: parameters.documentId!,
              domRevision: parameters.domRevision!,
              elementId,
            },
          });
          const target =
            scopedSnapshot.elements.find((element) => element.elementId === elementId) ??
            scopedSnapshot.elements[0];
          if (target !== undefined) {
            elementRects[elementId] = {
              x: target.boundingBox.x + scopedSnapshot.page.scroll.x,
              y: target.boundingBox.y + scopedSnapshot.page.scroll.y,
              width: target.boundingBox.width,
              height: target.boundingBox.height,
            };
          }
        }
        return screenshot.capture(parameters, {
          documentId: snapshot.metadata.documentId,
          domRevision: snapshot.metadata.domRevision,
          viewport: snapshot.page.viewport,
          scroll: { x: snapshot.page.scroll.x, y: snapshot.page.scroll.y },
          elementRects,
        });
      }),
    clickAt: (parameters) =>
      indicator.run(parameters.tabId, () => interactions.clickAt(parameters)),
    performGesture: (parameters) =>
      indicator.run(parameters.tabId, () => interactions.performGesture(parameters)),
    getTerminals: (parameters) =>
      indicator.run(parameters.tabId, () => terminal.getTerminals(parameters)),
    readTerminal: (parameters) =>
      indicator.run(parameters.tabId, () => terminal.readTerminal(parameters)),
    terminalInput: (parameters) =>
      indicator.run(parameters.tabId, () => terminal.input(parameters)),
    manageNetworkCapture: (parameters) =>
      indicator.run(parameters.tabId, () => networkCapture.manage(parameters)),
    printToPdf: (parameters) => indicator.run(parameters.tabId, () => pdf.print(parameters)),
    pageApiRequest: (parameters) =>
      indicator.run(parameters.tabId, () => pageApi.request(parameters)),
    getHttpAuthState: (parameters) =>
      indicator.run(parameters.tabId, () => httpAuth.getState(parameters)),
    authenticateHttp: (parameters) =>
      indicator.run(parameters.tabId, () => httpAuth.authenticate(parameters)),
    handleJavaScriptDialog: (parameters) =>
      indicator.run(parameters.tabId, () =>
        dialogs.handle(parameters, async (trigger) => {
          if (trigger.type === "click") {
            return interactions.click({
              tabId: parameters.tabId,
              documentId: trigger.documentId,
              domRevision: trigger.domRevision,
              elementId: trigger.elementId,
              scrollIntoView: trigger.scrollIntoView,
            });
          }
          if (trigger.type === "navigate") {
            return navigation.navigate({
              tabId: parameters.tabId,
              url: trigger.url,
              waitUntil: "none",
              timeoutMs: parameters.timeoutMs,
            });
          }
          return undefined;
        }),
      ),
    advancedAction: (action, parameters) => {
      const tabId =
        typeof parameters === "object" &&
        parameters !== null &&
        typeof (parameters as Record<string, unknown>)["tabId"] === "number"
          ? ((parameters as Record<string, unknown>)["tabId"] as number)
          : undefined;
      if (tabId === undefined) {
        return Promise.reject(
          new ExtensionCommandError(
            IBP_ERROR_CODES.INVALID_PARAMETERS,
            `${action} requires tabId`,
            false,
          ),
        );
      }
      return indicator.run(tabId, async () => {
        switch (action) {
          case BROWSER_LIST_FRAMES_ACTION:
            return diagnostics.listFrames(parameters as ListFramesParameters);
          case BROWSER_GET_NAVIGATION_STATE_ACTION:
            return diagnostics.navigationState(parameters as GetNavigationStateParameters);
          case BROWSER_GET_PERFORMANCE_METRICS_ACTION:
            return diagnostics.performanceMetrics(parameters as GetPerformanceMetricsParameters);
          case BROWSER_GET_ACCESSIBILITY_TREE_ACTION:
            return diagnostics.accessibilityTree(parameters as GetAccessibilityTreeParameters);
          case BROWSER_COMPARE_SCREENSHOT_ACTION:
            return diagnostics.compareScreenshot(parameters as CompareScreenshotParameters);
          case BROWSER_DOWNLOAD_ACTION:
            return downloads.start(parameters as StartDownloadParameters);
          case BROWSER_WAIT_FOR_DOWNLOAD_ACTION:
            return downloads.wait(parameters as WaitForDownloadParameters);
          case BROWSER_LIST_WEBMCP_TOOLS_ACTION:
            return webMcp.list(parameters as ListWebMcpToolsParameters);
          case BROWSER_INVOKE_WEBMCP_TOOL_ACTION:
            return webMcp.invoke(parameters as InvokeWebMcpToolParameters);
          case BROWSER_CANCEL_WEBMCP_INVOCATION_ACTION:
            return webMcp.cancel(parameters as CancelWebMcpInvocationParameters);
          default:
            throw new ExtensionCommandError(
              IBP_ERROR_CODES.UNSUPPORTED_ACTION,
              `Unsupported advanced browser action: ${action}`,
              false,
            );
        }
      });
    },
  },
  (state) => indicator.setConnectionState(state),
);

void connection.initialize();

chrome.runtime.onStartup.addListener(() => {
  connection.connect();
});

chrome.runtime.onInstalled.addListener(() => {
  connection.connect();
});

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  const record =
    typeof message === "object" && message !== null
      ? (message as Readonly<Record<string, unknown>>)
      : undefined;
  if (record?.["channel"] !== CONTROL_CHANNEL || sender.id !== chrome.runtime.id) {
    return undefined;
  }

  const requestedTabId = record["tabId"];
  const validRequestedTabId =
    typeof requestedTabId === "number" && Number.isInteger(requestedTabId) && requestedTabId >= 0
      ? requestedTabId
      : undefined;

  if (record["command"] === "popup_get_state" && validRequestedTabId !== undefined) {
    void Promise.all([
      indicator.getPopupState(validRequestedTabId),
      tabs.hasGlobalPageAccess(),
      tabActivationSettings.getMode(),
      chrome.tabs
        .get(validRequestedTabId)
        .then((tab) => domainPolicySettings.getForUrl(tab.url ?? "")),
    ])
      .then(([control, globalPageAccess, activationMode, domainPolicy]) =>
        sendResponse({
          ok: true,
          state: {
            tabId: validRequestedTabId,
            activationMode,
            domainPolicy,
            globalPageAccess,
            control,
            console: browserConsole.state(validRequestedTabId),
            deviceEmulation: deviceEmulation.state(validRequestedTabId) ?? null,
          },
        }),
      )
      .catch(() => sendResponse({ ok: false }));
    return true;
  }

  if (
    record["command"] === "popup_set_domain_policy" &&
    typeof record["hostname"] === "string" &&
    ["allow_all", "observe_only", "safe_interaction", "trusted_admin", "block"].includes(
      String(record["mode"]),
    )
  ) {
    void domainPolicySettings
      .set(record["hostname"], record["mode"] as DomainPolicyMode)
      .then((domainPolicy) => sendResponse({ ok: true, domainPolicy }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }

  if (
    record["command"] === "popup_set_activation_mode" &&
    (record["mode"] === "background" || record["mode"] === "foreground")
  ) {
    const mode = record["mode"] as TabActivationMode;
    void tabActivationSettings
      .setMode(mode)
      .then(() => sendResponse({ ok: true, mode }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }

  if (record["command"] === "popup_reauthorize_tab" && validRequestedTabId !== undefined) {
    void tabs
      .hasGlobalPageAccess()
      .then(async (granted) => {
        if (!granted) return sendResponse({ ok: false });
        await indicator.reauthorize(validRequestedTabId);
        return sendResponse({ ok: true });
      })
      .catch(() => sendResponse({ ok: false }));
    return true;
  }

  if (record["command"] === "popup_toggle_console" && validRequestedTabId !== undefined) {
    const operation = browserConsole.state(validRequestedTabId).active ? "stop" : "start";
    void browserConsole
      .manage(
        operation === "start"
          ? { operation, tabId: validRequestedTabId, bufferSize: 200 }
          : { operation, tabId: validRequestedTabId },
      )
      .then((data) => sendResponse({ ok: true, data }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }

  if (record["command"] === "popup_toggle_mobile" && validRequestedTabId !== undefined) {
    const enabled = deviceEmulation.state(validRequestedTabId) !== undefined;
    void deviceEmulation
      .manage(
        enabled
          ? { operation: "reset", tabId: validRequestedTabId }
          : {
              operation: "set",
              tabId: validRequestedTabId,
              preset: "mobile_medium",
              orientation: "portrait",
            },
      )
      .then((data) => sendResponse({ ok: true, data }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }

  if (sender.tab?.id === undefined) return undefined;

  if (record["command"] === "get_control_state") {
    void indicator
      .getVisualState(sender.tab.id)
      .then((control) => sendResponse({ ok: true, control }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }

  if (record["command"] === "stop_control") {
    void indicator
      .stop(sender.tab.id)
      .then(() => sendResponse({ ok: true }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }

  return undefined;
});

chrome.tabs.onRemoved.addListener((tabId) => {
  void indicator.remove(tabId);
  httpAuth.remove(tabId);
  void css.forgetTab(tabId);
  void browserConsole.cleanup(tabId);
  void networkCapture.cleanup(tabId);
  void deviceEmulation.cleanup(tabId);
  void debuggerSessions.cleanup(tabId);
});
