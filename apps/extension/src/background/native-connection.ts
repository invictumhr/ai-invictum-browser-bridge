import { createHeartbeatEvent } from "@invictum/protocol";

import { handleProtocolMessage } from "./handler.js";
import type { ExtensionCommandDependencies } from "./handler.js";
import type { BridgeConnectionState } from "./control-indicator.js";

const NATIVE_HOST_NAME = "com.invictum.browser_bridge";
const RECONNECT_ALARM = "invictum-native-reconnect";
const HEARTBEAT_ALARM = "invictum-native-heartbeat";
const SESSION_STORAGE_KEY = "ibpExtensionSessionId";

const BADGE_COLORS = {
  disconnected: "#6b7280",
  connected: "#16a34a",
  error: "#dc2626",
} as const;

export class NativeConnectionManager {
  #port: chrome.runtime.Port | undefined;
  #reconnectAttempt = 0;
  #sessionId: string | undefined;

  public constructor(
    private readonly commandDependencies?: ExtensionCommandDependencies,
    private readonly onConnectionState?: (state: BridgeConnectionState) => Promise<void>,
  ) {}

  public async initialize(): Promise<void> {
    this.#sessionId = await this.#loadSessionId();
    chrome.alarms.onAlarm.addListener((alarm) => {
      if (alarm.name === RECONNECT_ALARM) {
        this.connect();
      }
      if (alarm.name === HEARTBEAT_ALARM) {
        this.#heartbeat();
      }
    });
    await chrome.alarms.create(HEARTBEAT_ALARM, { periodInMinutes: 0.5 });
    this.connect();
  }

  public connect(): void {
    if (this.#port !== undefined) {
      return;
    }

    try {
      const port = chrome.runtime.connectNative(NATIVE_HOST_NAME);
      this.#port = port;
      port.onMessage.addListener((message: unknown) => {
        void this.#handleNativeMessage(port, message);
      });
      port.onDisconnect.addListener(() => {
        if (this.#port !== port) {
          return;
        }
        const lastError = chrome.runtime.lastError;
        if (lastError !== undefined) {
          console.warn("Invictum Native Messaging connection closed", lastError.message);
        }
        this.#port = undefined;
        void this.#setBadge("disconnected");
        this.#scheduleReconnect();
      });
      void chrome.alarms.clear(RECONNECT_ALARM);
      void this.#setBadge("connected");
    } catch (error) {
      console.error("Invictum Native Messaging host is unavailable", error);
      this.#port = undefined;
      void this.#setBadge("error");
      this.#scheduleReconnect();
    }
  }

  async #handleNativeMessage(port: chrome.runtime.Port, message: unknown): Promise<void> {
    try {
      this.#reconnectAttempt = 0;
      void this.#setBadge("connected");
      const response = await handleProtocolMessage(message, this.commandDependencies);
      if (response !== undefined) {
        port.postMessage(response);
      }
    } catch {
      console.error("Invictum rejected an invalid native message");
    }
  }

  #heartbeat(): void {
    if (this.#port === undefined || this.#sessionId === undefined) {
      this.connect();
      return;
    }
    try {
      this.#port.postMessage(createHeartbeatEvent(this.#sessionId, "extension"));
    } catch (error) {
      console.error("Invictum heartbeat could not reach the native host", error);
      this.#port = undefined;
      void this.#setBadge("error");
      this.#scheduleReconnect();
    }
  }

  #scheduleReconnect(): void {
    const delayMs = Math.min(500 * 2 ** this.#reconnectAttempt, 30_000);
    this.#reconnectAttempt += 1;
    void chrome.alarms.create(RECONNECT_ALARM, { when: Date.now() + delayMs });
  }

  async #loadSessionId(): Promise<string> {
    const stored = await chrome.storage.local.get(SESSION_STORAGE_KEY);
    const existing = stored[SESSION_STORAGE_KEY];
    if (typeof existing === "string" && existing.length > 0) {
      return existing;
    }

    const created = crypto.randomUUID();
    await chrome.storage.local.set({ [SESSION_STORAGE_KEY]: created });
    return created;
  }

  async #setBadge(state: keyof typeof BADGE_COLORS): Promise<void> {
    await chrome.action.setBadgeBackgroundColor({ color: BADGE_COLORS[state] });
    await chrome.action.setBadgeText({ text: state === "connected" ? "ON" : "" });
    await chrome.action.setTitle({
      title: `Invictum Browser Controller: ${state}`,
    });
    await this.onConnectionState?.(state);
  }
}
