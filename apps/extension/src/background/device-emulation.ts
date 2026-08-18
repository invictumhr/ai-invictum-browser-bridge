import {
  DeviceEmulationDataSchema,
  IBP_ERROR_CODES,
  type DeviceEmulationData,
  type DeviceEmulationParameters,
  type DeviceEmulationProfile,
} from "@invictum/protocol";

import { ExtensionCommandError } from "./command-error.js";
import { debuggerSessions, type ChromeDebuggerLease } from "./debugger-session.js";

interface ActiveEmulation {
  profile: DeviceEmulationProfile;
  lease?: ChromeDebuggerLease;
}

const PRESETS = {
  mobile_small: { width: 320, height: 568, deviceScaleFactor: 2 },
  mobile_medium: { width: 390, height: 844, deviceScaleFactor: 3 },
  mobile_large: { width: 430, height: 932, deviceScaleFactor: 3 },
  tablet: { width: 768, height: 1_024, deviceScaleFactor: 2 },
} as const;

export class ChromeDeviceEmulationAdapter {
  readonly #active = new Map<number, ActiveEmulation>();

  public constructor() {
    debuggerSessions.onUnexpectedDetach((tabId) => {
      this.#active.delete(tabId);
    });
  }

  public async manage(parameters: DeviceEmulationParameters): Promise<DeviceEmulationData> {
    if (parameters.operation === "get") return this.#data(parameters.tabId, "get", false);
    if (parameters.operation === "reset") return this.#reset(parameters.tabId, "reset");
    return this.#set(parameters);
  }

  public state(tabId: number): DeviceEmulationProfile | undefined {
    return this.#active.get(tabId)?.profile;
  }

  public async cleanup(tabId: number): Promise<void> {
    await this.#reset(tabId, "reset").catch(() => undefined);
  }

  async #set(
    parameters: Extract<DeviceEmulationParameters, { operation: "set" }>,
  ): Promise<DeviceEmulationData> {
    const permission = await chrome.permissions.contains({ permissions: ["debugger", "tabs"] });
    if (!permission) {
      throw new ExtensionCommandError(
        IBP_ERROR_CODES.PERMISSION_DENIED,
        "Mobile preview requires the Chrome debugger permission",
        false,
      );
    }
    const tab = await chrome.tabs.get(parameters.tabId);
    const url = tab.pendingUrl ?? tab.url;
    if (url === undefined || !/^https?:/iu.test(url)) {
      throw new ExtensionCommandError(
        IBP_ERROR_CODES.RESTRICTED_PAGE,
        "Mobile preview is only available on normal HTTP(S) pages",
        false,
      );
    }
    const dimensions =
      parameters.preset === "custom"
        ? {
            width: parameters.width!,
            height: parameters.height!,
            deviceScaleFactor: parameters.deviceScaleFactor!,
          }
        : PRESETS[parameters.preset];
    const profile: DeviceEmulationProfile = {
      preset: parameters.preset,
      orientation: parameters.orientation,
      width: parameters.orientation === "portrait" ? dimensions.width : dimensions.height,
      height: parameters.orientation === "portrait" ? dimensions.height : dimensions.width,
      deviceScaleFactor: dimensions.deviceScaleFactor,
      mobile: true,
      touch: parameters.touch ?? true,
    };
    let active = this.#active.get(parameters.tabId);
    let lease = active?.lease;
    try {
      if (lease === undefined) {
        lease = await debuggerSessions.acquire(parameters.tabId);
        active = { profile, lease };
      }
      await lease.sendCommand("Emulation.setDeviceMetricsOverride", {
        width: profile.width,
        height: profile.height,
        deviceScaleFactor: profile.deviceScaleFactor,
        mobile: true,
        screenWidth: profile.width,
        screenHeight: profile.height,
        positionX: 0,
        positionY: 0,
        dontSetVisibleSize: false,
        screenOrientation: {
          type: profile.orientation === "portrait" ? "portraitPrimary" : "landscapePrimary",
          angle: profile.orientation === "portrait" ? 0 : 90,
        },
      });
      await lease.sendCommand("Emulation.setTouchEmulationEnabled", {
        enabled: profile.touch,
        maxTouchPoints: profile.touch ? 5 : 1,
      });
      this.#active.set(parameters.tabId, { profile, lease });
      return this.#data(parameters.tabId, "set", true);
    } catch (error) {
      // A later CDP command may fail after metrics were already changed. Never
      // leave an untracked partial emulation active, especially when another
      // feature keeps the shared debugger session attached.
      this.#active.delete(parameters.tabId);
      await lease?.sendCommand("Emulation.clearDeviceMetricsOverride").catch(() => undefined);
      await lease
        ?.sendCommand("Emulation.setTouchEmulationEnabled", {
          enabled: false,
          maxTouchPoints: 1,
        })
        .catch(() => undefined);
      await lease?.release();
      throw new ExtensionCommandError(
        IBP_ERROR_CODES.BROWSER_API_ERROR,
        "Chrome could not enable mobile preview; close the visible DevTools window for this tab and retry",
        true,
        { cause: error },
      );
    }
  }

  async #reset(tabId: number, operation: "reset"): Promise<DeviceEmulationData> {
    const active = this.#active.get(tabId);
    if (active === undefined) return this.#data(tabId, operation, false);
    this.#active.delete(tabId);
    try {
      await active.lease?.sendCommand("Emulation.clearDeviceMetricsOverride");
      await active.lease?.sendCommand("Emulation.setTouchEmulationEnabled", {
        enabled: false,
        maxTouchPoints: 1,
      });
    } finally {
      await active.lease?.release();
    }
    return this.#data(tabId, operation, true);
  }

  #data(
    tabId: number,
    operation: DeviceEmulationParameters["operation"],
    changed: boolean,
  ): DeviceEmulationData {
    const active = this.#active.get(tabId);
    return DeviceEmulationDataSchema.parse({
      tabId,
      operation,
      active: active !== undefined,
      profile: active?.profile ?? null,
      debuggerAttached: debuggerSessions.isAttached(tabId),
      requiresNewSnapshot: changed,
    });
  }
}
