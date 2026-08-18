import "./popup.css";

import type { TabActivationMode } from "../tab-activation-settings.js";

const CONTROL_CHANNEL = "invictum.browser.control.v1";

interface PopupState {
  tabId: number;
  activationMode: TabActivationMode;
  globalPageAccess: boolean;
  control: {
    state: "active" | "idle" | "disconnected" | "stopped";
    reservation: "unreserved" | "controlled" | "blocked";
    connectionState: "connected" | "disconnected" | "error";
    agentName?: string;
  };
  console: {
    active: boolean;
    entryCount: number;
  };
  deviceEmulation: {
    preset: string;
    orientation: "portrait" | "landscape";
    width: number;
    height: number;
  } | null;
}

interface PopupResponse {
  ok: boolean;
  state?: PopupState;
  mode?: TabActivationMode;
}

const requiredElement = <T extends Element>(selector: string): T => {
  const element = document.querySelector<T>(selector);
  if (element === null) throw new Error(`Popup element is missing: ${selector}`);
  return element;
};

const connectionStatus = requiredElement<HTMLParagraphElement>("#connection-status");
const tabStatus = requiredElement<HTMLSpanElement>("#tab-status");
const tabStatusDot = requiredElement<HTMLSpanElement>("#tab-status-dot");
const siteAccessWarning = requiredElement<HTMLParagraphElement>("#site-access-warning");
const saveStatus = requiredElement<HTMLParagraphElement>("#save-status");
const reauthorizeButton = requiredElement<HTMLButtonElement>("#reauthorize-tab");
const modeInputs = [
  ...document.querySelectorAll<HTMLInputElement>('input[name="activation-mode"]'),
];
const consoleStatus = requiredElement<HTMLElement>("#console-status");
const mobileStatus = requiredElement<HTMLElement>("#mobile-status");
const toggleConsoleButton = requiredElement<HTMLButtonElement>("#toggle-console");
const toggleMobileButton = requiredElement<HTMLButtonElement>("#toggle-mobile");

let activeTabId: number | undefined;
let saveStatusTimer: number | undefined;

const sendPopupMessage = async (message: Record<string, unknown>): Promise<PopupResponse> =>
  chrome.runtime.sendMessage({ channel: CONTROL_CHANNEL, ...message }) as Promise<PopupResponse>;

const showSaveStatus = (message: string, error = false): void => {
  saveStatus.textContent = message;
  saveStatus.style.color = error ? "#fca5a5" : "#86efac";
  if (saveStatusTimer !== undefined) window.clearTimeout(saveStatusTimer);
  saveStatusTimer = window.setTimeout(() => {
    saveStatus.textContent = "";
    saveStatusTimer = undefined;
  }, 2_000);
};

const render = (state: PopupState): void => {
  activeTabId = state.tabId;
  for (const input of modeInputs) input.checked = input.value === state.activationMode;

  const connected = state.control.connectionState === "connected";
  connectionStatus.textContent = connected ? "Bridge connected" : "Bridge disconnected";
  connectionStatus.className = `connection ${connected ? "connected" : "disconnected"}`;

  tabStatusDot.className = "status-dot";
  if (state.control.reservation === "controlled") {
    tabStatusDot.classList.add(connected ? "controlled" : "disconnected");
    tabStatus.textContent = `${state.control.agentName ?? "AI agent"} is using this tab`;
  } else if (state.control.reservation === "blocked") {
    tabStatusDot.classList.add("blocked");
    tabStatus.textContent = "AI control of this tab is stopped";
  } else {
    tabStatus.textContent = "This tab is not currently reserved";
  }

  siteAccessWarning.hidden = state.globalPageAccess;
  reauthorizeButton.hidden = state.control.reservation !== "blocked";
  reauthorizeButton.disabled = !state.globalPageAccess;

  consoleStatus.textContent = state.console.active
    ? `On · ${state.console.entryCount} entries`
    : "Off";
  toggleConsoleButton.textContent = state.console.active ? "Turn off" : "Turn on";
  mobileStatus.textContent =
    state.deviceEmulation === null
      ? "Off"
      : `${state.deviceEmulation.width} × ${state.deviceEmulation.height} · ${
          state.deviceEmulation.orientation === "portrait" ? "portrait" : "landscape"
        }`;
  toggleMobileButton.textContent = state.deviceEmulation === null ? "Turn on" : "Turn off";
};

const refresh = async (): Promise<void> => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id === undefined) throw new Error("The active tab is unavailable");
  const response = await sendPopupMessage({ command: "popup_get_state", tabId: tab.id });
  if (!response.ok || response.state === undefined) throw new Error("Status is unavailable");
  render(response.state);
};

for (const input of modeInputs) {
  input.addEventListener("change", () => {
    if (!input.checked) return;
    const mode = input.value as TabActivationMode;
    for (const candidate of modeInputs) candidate.disabled = true;
    void sendPopupMessage({ command: "popup_set_activation_mode", mode })
      .then((response) => {
        if (!response.ok || response.mode !== mode) throw new Error("Could not save the setting");
        showSaveStatus("Setting saved.");
      })
      .catch(() => showSaveStatus("Setting was not saved.", true))
      .finally(() => {
        for (const candidate of modeInputs) candidate.disabled = false;
      });
  });
}

reauthorizeButton.addEventListener("click", () => {
  if (activeTabId === undefined) return;
  reauthorizeButton.disabled = true;
  void sendPopupMessage({ command: "popup_reauthorize_tab", tabId: activeTabId })
    .then((response) => {
      if (!response.ok) throw new Error("Could not reauthorize the tab");
      return refresh();
    })
    .catch(() => showSaveStatus("The tab was not reauthorized.", true))
    .finally(() => {
      reauthorizeButton.disabled = false;
    });
});

const toggleTool = (
  button: HTMLButtonElement,
  command: "popup_toggle_console" | "popup_toggle_mobile",
): void => {
  if (activeTabId === undefined) return;
  button.disabled = true;
  void sendPopupMessage({ command, tabId: activeTabId })
    .then((response) => {
      if (!response.ok) throw new Error("Could not change the tool state");
      return refresh();
    })
    .catch(() =>
      showSaveStatus("The tool cannot be enabled. Close DevTools on this tab and try again.", true),
    )
    .finally(() => {
      button.disabled = false;
    });
};

toggleConsoleButton.addEventListener("click", () =>
  toggleTool(toggleConsoleButton, "popup_toggle_console"),
);
toggleMobileButton.addEventListener("click", () =>
  toggleTool(toggleMobileButton, "popup_toggle_mobile"),
);

void refresh().catch(() => {
  connectionStatus.textContent = "Settings are currently unavailable";
  connectionStatus.className = "connection disconnected";
  tabStatus.textContent = "Could not retrieve the tab status";
});
