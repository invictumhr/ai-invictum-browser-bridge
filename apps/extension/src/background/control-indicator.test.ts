import { afterEach, describe, expect, it, vi } from "vitest";

import { IBP_ERROR_CODES } from "@invictum/protocol";

import {
  CONTROL_CHANNEL,
  CONTROL_LEASE_MS,
  CONTROL_RELEASE_GRACE_MS,
  TabControlIndicator,
} from "./control-indicator.js";

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const stubChrome = (stored: Readonly<Record<string, unknown>> = {}) => {
  const setBadgeText = vi.fn().mockResolvedValue(undefined);
  const setBadgeBackgroundColor = vi.fn().mockResolvedValue(undefined);
  const setBadgeTextColor = vi.fn().mockResolvedValue(undefined);
  const setTitle = vi.fn().mockResolvedValue(undefined);
  const sendMessage = vi.fn().mockResolvedValue({ ok: true });
  const set = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal("chrome", {
    storage: {
      session: {
        get: vi.fn().mockResolvedValue(stored),
        set,
      },
    },
    action: { setBadgeText, setBadgeBackgroundColor, setBadgeTextColor, setTitle },
    tabs: { sendMessage },
  });
  return { setBadgeText, setBadgeBackgroundColor, setTitle, sendMessage, set };
};

describe("TabControlIndicator", () => {
  it("shows per-tab active/idle state around a successful operation", async () => {
    vi.useFakeTimers();
    const chromeMocks = stubChrome();
    const cleanupTab = vi.fn().mockResolvedValue(undefined);
    const indicator = new TabControlIndicator(cleanupTab);
    await indicator.setConnectionState("connected");

    await expect(indicator.run(17, async () => "done")).resolves.toBe("done");

    expect(chromeMocks.setBadgeText).toHaveBeenCalledWith({ tabId: 17, text: "AI" });
    expect(chromeMocks.setBadgeBackgroundColor).toHaveBeenCalledWith({
      tabId: 17,
      color: "#16a34a",
    });
    expect(chromeMocks.setBadgeBackgroundColor).toHaveBeenCalledWith({
      tabId: 17,
      color: "#16a34a",
    });
    expect(chromeMocks.sendMessage).toHaveBeenCalledWith(17, {
      channel: CONTROL_CHANNEL,
      command: "set_control_state",
      state: "idle",
    });
    expect(chromeMocks.set).toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(CONTROL_LEASE_MS);
    expect(cleanupTab).toHaveBeenCalledWith(17);
    expect(chromeMocks.setBadgeText).toHaveBeenCalledWith({ tabId: 17, text: null });
    expect(chromeMocks.sendMessage).toHaveBeenCalledWith(17, {
      channel: CONTROL_CHANNEL,
      command: "set_control_state",
      state: "stopped",
    });
  });

  it("persists a safe custom agent name across commands and release grace", async () => {
    vi.useFakeTimers();
    const chromeMocks = stubChrome();
    const indicator = new TabControlIndicator();
    await indicator.setConnectionState("connected");

    await indicator.identify(18, "Codex");
    await indicator.run(18, async () => "done");
    await indicator.unlock(18);

    expect(chromeMocks.sendMessage).toHaveBeenLastCalledWith(18, {
      channel: CONTROL_CHANNEL,
      command: "set_control_state",
      state: "idle",
      agentName: "Codex",
    });
    expect(chromeMocks.setTitle).toHaveBeenLastCalledWith({
      tabId: 18,
      title: "Invictum: Codex is using this tab",
    });
    expect(chromeMocks.set).toHaveBeenLastCalledWith({
      ibpControlledTabsV1: {
        "18": expect.objectContaining({ agentName: "Codex", releaseRequested: true }),
      },
    });
    await expect(indicator.getVisualState(18)).resolves.toEqual({
      state: "idle",
      agentName: "Codex",
    });
  });

  it("provides the current custom identity to a newly injected content script", async () => {
    vi.useFakeTimers();
    stubChrome();
    const indicator = new TabControlIndicator();

    await indicator.identify(19, "Claude");
    await expect(indicator.getVisualState(19)).resolves.toEqual({
      state: "disconnected",
      agentName: "Claude",
    });

    await indicator.setConnectionState("connected");
    await expect(indicator.getVisualState(19)).resolves.toEqual({
      state: "idle",
      agentName: "Claude",
    });
    await expect(indicator.getPopupState(19)).resolves.toEqual({
      state: "idle",
      reservation: "controlled",
      connectionState: "connected",
      agentName: "Claude",
    });
  });

  it("blocks commands after the user stops control until toolbar authorization", async () => {
    vi.useFakeTimers();
    const chromeMocks = stubChrome();
    const cleanupTab = vi.fn().mockResolvedValue(undefined);
    const indicator = new TabControlIndicator(cleanupTab);
    await indicator.setConnectionState("connected");
    await indicator.run(21, async () => "initial operation");
    await indicator.stop(21);
    expect(cleanupTab).toHaveBeenCalledWith(21);
    await expect(indicator.getPopupState(21)).resolves.toEqual({
      state: "stopped",
      reservation: "blocked",
      connectionState: "connected",
    });

    await expect(indicator.run(21, async () => "must not run")).rejects.toMatchObject({
      code: IBP_ERROR_CODES.POLICY_DENIED,
    });
    await expect(indicator.unlock(21)).rejects.toMatchObject({
      code: IBP_ERROR_CODES.POLICY_DENIED,
    });
    expect(chromeMocks.setTitle).toHaveBeenCalledWith({
      tabId: 21,
      title: "Invictum: AI control stopped; click to authorize this tab again",
    });

    await indicator.reauthorize(21);
    await expect(indicator.run(21, async () => "allowed")).resolves.toBe("allowed");
    await expect(indicator.unlock(21)).resolves.toBe(true);
  });

  it("renders controlled tabs as disconnected when the bridge drops", async () => {
    vi.useFakeTimers();
    const chromeMocks = stubChrome();
    const cleanupTab = vi.fn().mockResolvedValue(undefined);
    const indicator = new TabControlIndicator(cleanupTab);
    await indicator.run(33, async () => "controlled");
    await indicator.setConnectionState("error");

    expect(chromeMocks.setBadgeText).toHaveBeenCalledWith({ tabId: 33, text: "!" });
    expect(chromeMocks.sendMessage).toHaveBeenCalledWith(33, {
      channel: CONTROL_CHANNEL,
      command: "set_control_state",
      state: "disconnected",
    });
  });

  it("releases an agent reservation after a 20-second idempotent grace period", async () => {
    vi.useFakeTimers();
    const chromeMocks = stubChrome();
    const cleanupTab = vi.fn().mockResolvedValue(undefined);
    const indicator = new TabControlIndicator(cleanupTab);

    await indicator.run(44, async () => "controlled");

    await expect(indicator.unlock(44)).resolves.toBe(true);
    await expect(indicator.unlock(44)).resolves.toBe(false);
    expect(cleanupTab).not.toHaveBeenCalled();
    expect(chromeMocks.setBadgeText).not.toHaveBeenCalledWith({ tabId: 44, text: null });

    await vi.advanceTimersByTimeAsync(CONTROL_RELEASE_GRACE_MS - 1);
    expect(cleanupTab).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(cleanupTab).toHaveBeenCalledWith(44);
    expect(chromeMocks.setBadgeText).toHaveBeenCalledWith({ tabId: 44, text: null });
    expect(chromeMocks.sendMessage).toHaveBeenCalledWith(44, {
      channel: CONTROL_CHANNEL,
      command: "set_control_state",
      state: "stopped",
    });
  });

  it("cancels a pending release when a new command uses the tab", async () => {
    vi.useFakeTimers();
    stubChrome();
    const cleanupTab = vi.fn().mockResolvedValue(undefined);
    const indicator = new TabControlIndicator(cleanupTab);

    await indicator.run(45, async () => "first");
    await expect(indicator.unlock(45)).resolves.toBe(true);
    await vi.advanceTimersByTimeAsync(CONTROL_RELEASE_GRACE_MS / 2);

    await expect(indicator.run(45, async () => "second")).resolves.toBe("second");
    await vi.advanceTimersByTimeAsync(CONTROL_RELEASE_GRACE_MS / 2);
    expect(cleanupTab).not.toHaveBeenCalled();

    await expect(indicator.unlock(45)).resolves.toBe(true);
    await vi.advanceTimersByTimeAsync(CONTROL_RELEASE_GRACE_MS);
    expect(cleanupTab).toHaveBeenCalledTimes(1);
  });

  it("restores only the remaining part of a persisted release grace period", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-23T05:00:00.000Z"));
    const cleanupTab = vi.fn().mockResolvedValue(undefined);
    stubChrome({
      ibpControlledTabsV1: {
        "46": {
          state: "idle",
          updatedAt: "2026-07-23T04:59:55.000Z",
          releaseRequested: true,
        },
      },
    });
    const indicator = new TabControlIndicator(cleanupTab);

    await indicator.setConnectionState("connected");
    await vi.advanceTimersByTimeAsync(14_999);
    expect(cleanupTab).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(cleanupTab).toHaveBeenCalledWith(46);
  });

  it("waits for lease cleanup before starting the next tab command", async () => {
    vi.useFakeTimers();
    stubChrome();
    let finishCleanup: (() => void) | undefined;
    const cleanupTab = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishCleanup = resolve;
        }),
    );
    const indicator = new TabControlIndicator(cleanupTab);

    await indicator.run(48, async () => "first");
    await vi.advanceTimersByTimeAsync(CONTROL_LEASE_MS);

    const operation = vi.fn(async () => "second");
    const nextCommand = indicator.run(48, operation);
    await Promise.resolve();
    expect(operation).not.toHaveBeenCalled();

    finishCleanup?.();
    await expect(nextCommand).resolves.toBe("second");
    expect(operation).toHaveBeenCalledOnce();
  });

  it("cleans again after an in-flight command observes User Stop", async () => {
    vi.useFakeTimers();
    stubChrome();
    const cleanupTab = vi.fn().mockResolvedValue(undefined);
    const indicator = new TabControlIndicator(cleanupTab);
    let finishOperation: (() => void) | undefined;
    let signalOperationStarted: (() => void) | undefined;
    const operationStarted = new Promise<void>((resolve) => {
      signalOperationStarted = resolve;
    });
    const running = indicator.run(49, async () => {
      signalOperationStarted?.();
      await new Promise<void>((resolve) => {
        finishOperation = resolve;
      });
      return "finished";
    });

    await operationStarted;
    await indicator.stop(49);
    expect(cleanupTab).toHaveBeenCalledTimes(1);

    finishOperation?.();
    await expect(running).resolves.toBe("finished");
    expect(cleanupTab).toHaveBeenCalledTimes(2);
  });

  it("does not reserve a tab when toolbar authorization is granted", async () => {
    vi.useFakeTimers();
    const chromeMocks = stubChrome();
    const indicator = new TabControlIndicator();

    await indicator.reauthorize(55);

    expect(chromeMocks.setBadgeText).not.toHaveBeenCalledWith({ tabId: 55, text: "AI" });
    expect(chromeMocks.sendMessage).not.toHaveBeenCalledWith(
      55,
      expect.objectContaining({ state: "active" }),
    );
  });
});
