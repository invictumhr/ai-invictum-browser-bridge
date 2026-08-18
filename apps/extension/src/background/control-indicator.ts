import { AgentDisplayNameSchema, IBP_ERROR_CODES } from "@invictum/protocol";

import { ExtensionCommandError } from "./command-error.js";

export const CONTROL_CHANNEL = "invictum.browser.control.v1";

const STORAGE_KEY = "ibpControlledTabsV1";
export const CONTROL_LEASE_MS = 30_000;
export const CONTROL_RELEASE_GRACE_MS = 20_000;
const BADGE_COLORS = {
  active: "#16a34a",
  idle: "#16a34a",
  disconnected: "#dc2626",
} as const;

type TabControlState = "active" | "idle" | "blocked";
export type BridgeConnectionState = "connected" | "disconnected" | "error";

interface PersistedControlState {
  state: TabControlState;
  updatedAt: string;
  releaseRequested?: boolean;
  agentName?: string;
}

interface ControlOverlayMessage {
  channel: typeof CONTROL_CHANNEL;
  command: "set_control_state";
  state: "active" | "idle" | "disconnected" | "stopped";
  agentName?: string;
}

export interface TabControlVisualState {
  state: ControlOverlayMessage["state"];
  agentName?: string;
}

export interface TabControlPopupState extends TabControlVisualState {
  reservation: "unreserved" | "controlled" | "blocked";
  connectionState: BridgeConnectionState;
}

const isPersistedControlState = (value: unknown): value is PersistedControlState => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Readonly<Record<string, unknown>>;
  return (
    (record["state"] === "active" || record["state"] === "idle" || record["state"] === "blocked") &&
    typeof record["updatedAt"] === "string" &&
    (record["releaseRequested"] === undefined || typeof record["releaseRequested"] === "boolean") &&
    (record["agentName"] === undefined ||
      AgentDisplayNameSchema.safeParse(record["agentName"]).success)
  );
};

export class TabControlIndicator {
  readonly #states = new Map<number, PersistedControlState>();
  readonly #leaseTimers = new Map<number, number>();
  readonly #leaseReleases = new Map<number, Promise<void>>();
  readonly #ready: Promise<void>;
  #connectionState: BridgeConnectionState = "disconnected";

  public constructor(
    private readonly cleanupTab: (tabId: number) => Promise<void> = async () => undefined,
  ) {
    this.#ready = this.#restore();
  }

  public async run<T>(tabId: number, operation: () => Promise<T>): Promise<T> {
    await this.#ready;
    await this.#leaseReleases.get(tabId);
    this.#clearLeaseTimer(tabId);
    const previous = this.#states.get(tabId);
    if (previous?.state === "blocked") {
      throw new ExtensionCommandError(
        IBP_ERROR_CODES.POLICY_DENIED,
        "The user stopped AI control for this tab; click the Invictum toolbar icon to authorize it again",
        false,
      );
    }

    await this.#setState(tabId, "active");
    let succeeded = false;
    try {
      const result = await operation();
      succeeded = true;
      return result;
    } finally {
      const currentState = this.#states.get(tabId)?.state;
      if (currentState === "blocked") {
        await this.cleanupTab(tabId).catch(() => undefined);
      } else if (currentState === "active") {
        if (succeeded || previous !== undefined) {
          await this.#setState(tabId, "idle");
          this.#scheduleLeaseRelease(tabId);
        } else {
          this.#states.delete(tabId);
          await Promise.all([this.#persist(), this.#clearVisual(tabId)]);
        }
      }
    }
  }

  public async reauthorize(tabId: number): Promise<void> {
    await this.#ready;
    this.#clearLeaseTimer(tabId);
    await this.cleanupTab(tabId).catch(() => undefined);
    this.#states.delete(tabId);
    await Promise.all([this.#persist(), this.#clearVisual(tabId)]);
  }

  public async stop(tabId: number): Promise<void> {
    await this.#ready;
    this.#clearLeaseTimer(tabId);
    await this.#setState(tabId, "blocked");
    await this.cleanupTab(tabId).catch(() => undefined);
  }

  public async identify(tabId: number, agentName: string): Promise<void> {
    await this.#ready;
    await this.#leaseReleases.get(tabId);
    const parsedAgentName = AgentDisplayNameSchema.parse(agentName);
    const state = this.#states.get(tabId)?.state;
    if (state === "blocked") {
      throw new ExtensionCommandError(
        IBP_ERROR_CODES.POLICY_DENIED,
        "The user stopped AI control for this tab; click the Invictum toolbar icon to authorize it again",
        false,
      );
    }
    this.#clearLeaseTimer(tabId);
    await this.#setState(tabId, "idle", false, parsedAgentName);
    this.#scheduleLeaseRelease(tabId);
  }

  public async unlock(tabId: number): Promise<boolean> {
    await this.#ready;
    const state = this.#states.get(tabId)?.state;
    if (state === "blocked") {
      throw new ExtensionCommandError(
        IBP_ERROR_CODES.POLICY_DENIED,
        "The user-stopped tab cannot be released or reactivated by the agent",
        false,
      );
    }
    const current = this.#states.get(tabId);
    if (current === undefined || current.releaseRequested === true) return false;
    this.#clearLeaseTimer(tabId);
    await this.#setState(tabId, "idle", true);
    this.#scheduleLeaseRelease(tabId, CONTROL_RELEASE_GRACE_MS);
    return true;
  }

  public async remove(tabId: number): Promise<void> {
    await this.#ready;
    this.#clearLeaseTimer(tabId);
    this.#states.delete(tabId);
    await this.#persist();
  }

  public async refresh(tabId: number): Promise<void> {
    await this.#ready;
    const value = this.#states.get(tabId);
    if (value !== undefined) await this.#applyVisual(tabId, value.state, value.agentName);
  }

  public async getVisualState(tabId: number): Promise<TabControlVisualState> {
    await this.#ready;
    const value = this.#states.get(tabId);
    if (value === undefined || value.state === "blocked") return { state: "stopped" };
    return {
      state: this.#connectionState === "connected" ? value.state : "disconnected",
      ...(value.agentName === undefined ? {} : { agentName: value.agentName }),
    };
  }

  public async getPopupState(tabId: number): Promise<TabControlPopupState> {
    await this.#ready;
    const value = this.#states.get(tabId);
    if (value === undefined) {
      return {
        state: "stopped",
        reservation: "unreserved",
        connectionState: this.#connectionState,
      };
    }
    if (value.state === "blocked") {
      return {
        state: "stopped",
        reservation: "blocked",
        connectionState: this.#connectionState,
      };
    }
    return {
      state: this.#connectionState === "connected" ? value.state : "disconnected",
      reservation: "controlled",
      connectionState: this.#connectionState,
      ...(value.agentName === undefined ? {} : { agentName: value.agentName }),
    };
  }

  public async setConnectionState(state: BridgeConnectionState): Promise<void> {
    await this.#ready;
    this.#connectionState = state;
    await Promise.all(
      [...this.#states.entries()].map(([tabId, value]) =>
        this.#applyVisual(tabId, value.state, value.agentName),
      ),
    );
  }

  async #setState(
    tabId: number,
    state: TabControlState,
    releaseRequested = false,
    agentName = this.#states.get(tabId)?.agentName,
  ): Promise<void> {
    this.#states.set(tabId, {
      state,
      updatedAt: new Date().toISOString(),
      releaseRequested,
      ...(agentName === undefined ? {} : { agentName }),
    });
    await Promise.all([this.#persist(), this.#applyVisual(tabId, state, agentName)]);
  }

  async #restore(): Promise<void> {
    try {
      const stored = await chrome.storage.session.get(STORAGE_KEY);
      const raw = stored[STORAGE_KEY];
      if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return;
      for (const [rawTabId, value] of Object.entries(raw)) {
        const tabId = Number(rawTabId);
        if (!Number.isInteger(tabId) || tabId < 0 || !isPersistedControlState(value)) continue;
        this.#states.set(tabId, {
          ...value,
          state: value.state === "active" ? "idle" : value.state,
          releaseRequested: value.state === "blocked" ? false : value.releaseRequested === true,
        });
        if (value.state !== "blocked") {
          const elapsed = Date.now() - Date.parse(value.updatedAt);
          const releaseDelay =
            value.releaseRequested === true ? CONTROL_RELEASE_GRACE_MS : CONTROL_LEASE_MS;
          this.#scheduleLeaseRelease(tabId, Math.max(0, releaseDelay - elapsed));
        }
      }
    } catch {
      // Indicator persistence must never make browser commands unavailable.
    }
  }

  async #persist(): Promise<void> {
    try {
      await chrome.storage.session.set({
        [STORAGE_KEY]: Object.fromEntries(this.#states),
      });
    } catch {
      // The in-memory state still enforces an explicit user stop.
    }
  }

  async #applyVisual(tabId: number, state: TabControlState, agentName?: string): Promise<void> {
    if (state === "blocked") {
      await Promise.allSettled([
        chrome.action.setBadgeText({ tabId, text: "" }),
        chrome.action.setBadgeBackgroundColor({ tabId, color: BADGE_COLORS.disconnected }),
        chrome.action.setTitle({
          tabId,
          title: "Invictum: AI control stopped; click to authorize this tab again",
        }),
        this.#sendOverlay(tabId, "stopped"),
      ]);
      return;
    }

    const disconnected = this.#connectionState !== "connected";
    const visualState = disconnected ? "disconnected" : state;
    const messageState: ControlOverlayMessage["state"] = disconnected ? "disconnected" : state;
    await Promise.allSettled([
      chrome.action.setBadgeText({ tabId, text: disconnected ? "!" : "AI" }),
      chrome.action.setBadgeBackgroundColor({ tabId, color: BADGE_COLORS[visualState] }),
      chrome.action.setBadgeTextColor({ tabId, color: "#ffffff" }),
      chrome.action.setTitle({
        tabId,
        title: disconnected
          ? "Invictum: AI bridge disconnected"
          : `Invictum: ${agentName ?? "AI agent"} is using this tab`,
      }),
      this.#sendOverlay(tabId, messageState, agentName),
    ]);
  }

  async #clearVisual(tabId: number): Promise<void> {
    await Promise.allSettled([
      chrome.action.setBadgeText({
        tabId,
        text: null,
      } as unknown as chrome.action.BadgeTextDetails),
      chrome.action.setTitle({ tabId, title: "" }),
      this.#sendOverlay(tabId, "stopped"),
    ]);
  }

  #scheduleLeaseRelease(tabId: number, delayMs = CONTROL_LEASE_MS): void {
    this.#clearLeaseTimer(tabId);
    const expectedUpdatedAt = this.#states.get(tabId)?.updatedAt;
    const timer = globalThis.setTimeout(() => {
      this.#leaseTimers.delete(tabId);
      const release = this.#releaseLease(tabId, expectedUpdatedAt).finally(() => {
        if (this.#leaseReleases.get(tabId) === release) this.#leaseReleases.delete(tabId);
      });
      this.#leaseReleases.set(tabId, release);
      void release;
    }, delayMs) as unknown as number;
    this.#leaseTimers.set(tabId, timer);
  }

  async #releaseLease(tabId: number, expectedUpdatedAt: string | undefined): Promise<void> {
    const state = this.#states.get(tabId);
    if (state?.state !== "idle" || state.updatedAt !== expectedUpdatedAt) return;
    await this.cleanupTab(tabId).catch(() => undefined);
    const current = this.#states.get(tabId);
    if (current?.state !== "idle" || current.updatedAt !== expectedUpdatedAt) return;
    this.#states.delete(tabId);
    await Promise.all([this.#persist(), this.#clearVisual(tabId)]);
  }

  #clearLeaseTimer(tabId: number): void {
    const timer = this.#leaseTimers.get(tabId);
    if (timer !== undefined) {
      clearTimeout(timer);
      this.#leaseTimers.delete(tabId);
    }
  }

  async #sendOverlay(
    tabId: number,
    state: ControlOverlayMessage["state"],
    agentName?: string,
  ): Promise<void> {
    const message: ControlOverlayMessage = {
      channel: CONTROL_CHANNEL,
      command: "set_control_state",
      state,
      ...(agentName === undefined ? {} : { agentName }),
    };
    try {
      await chrome.tabs.sendMessage(tabId, message);
    } catch {
      // The on-demand content script may not be installed yet.
    }
  }
}
