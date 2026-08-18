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
import { ChromeWordPressMenuAdapter } from "./wordpress-menu.js";
import { ChromeWordPressAdminAdapter } from "./wordpress-admin.js";
import { ChromeWordPressEditorAdapter } from "./wordpress-editor.js";
import { debuggerSessions } from "./debugger-session.js";
import { TabActivationSettings, type TabActivationMode } from "../tab-activation-settings.js";

const tabs = new ChromeTabsAdapter();
const snapshots = new ChromePageSnapshotAdapter();
const elements = new ChromeFindElementsAdapter();
const interactions = new ChromeInteractionsAdapter();
const javaScript = new ChromeJavaScriptAdapter();
const screenshot = new ChromeScreenshotAdapter();
const tabActivationSettings = new TabActivationSettings();
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
const wordpressMenu = new ChromeWordPressMenuAdapter();
const wordpressAdmin = new ChromeWordPressAdminAdapter();
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
    ])
      .then(([control, globalPageAccess, activationMode]) =>
        sendResponse({
          ok: true,
          state: {
            tabId: validRequestedTabId,
            activationMode,
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
