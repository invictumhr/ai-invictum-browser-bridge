export interface ChromeDebuggerLease {
  readonly tabId: number;
  readonly target: chrome.debugger.Debuggee;
  sendCommand: (
    method: string,
    commandParams?: Readonly<Record<string, unknown>>,
  ) => Promise<unknown>;
  release: () => Promise<void>;
}

interface SessionState {
  attached: boolean;
  references: number;
  attachPromise?: Promise<void>;
  detachPromise?: Promise<void>;
}

type DetachListener = (tabId: number, reason: string) => void;

/**
 * Chrome permits only one debugger attachment per target. Console capture and
 * device emulation intentionally keep that attachment alive, so every
 * short-lived CDP consumer must share this reference-counted session.
 */
export class ChromeDebuggerSessionManager {
  readonly #sessions = new Map<number, SessionState>();
  readonly #detachListeners = new Set<DetachListener>();
  #listening = false;

  public onUnexpectedDetach(listener: DetachListener): () => void {
    this.#detachListeners.add(listener);
    return () => this.#detachListeners.delete(listener);
  }

  public isAttached(tabId: number): boolean {
    return this.#sessions.get(tabId)?.attached === true;
  }

  public async acquire(tabId: number): Promise<ChromeDebuggerLease> {
    this.#ensureDetachListener();
    let state = this.#sessions.get(tabId);
    if (state?.detachPromise !== undefined) {
      await state.detachPromise.catch(() => undefined);
      return this.acquire(tabId);
    }
    if (state === undefined) {
      state = { attached: false, references: 0 };
      this.#sessions.set(tabId, state);
    }
    if (!state.attached) {
      state.attachPromise ??= chrome.debugger
        .attach({ tabId }, "1.3")
        .then(() => {
          state!.attached = true;
        })
        .catch((error: unknown) => {
          if (this.#sessions.get(tabId) === state) this.#sessions.delete(tabId);
          throw error;
        })
        .finally(() => {
          state!.attachPromise = undefined;
        });
      await state.attachPromise;
    }
    state.references += 1;
    let released = false;
    const target: chrome.debugger.Debuggee = { tabId };
    return {
      tabId,
      target,
      sendCommand: (method, commandParams) =>
        commandParams === undefined
          ? chrome.debugger.sendCommand(target, method)
          : chrome.debugger.sendCommand(target, method, commandParams),
      release: async () => {
        if (released) return;
        released = true;
        await this.#release(tabId, state!);
      },
    };
  }

  public async cleanup(tabId: number): Promise<void> {
    const state = this.#sessions.get(tabId);
    if (state === undefined) return;
    state.references = 0;
    await this.#detach(tabId, state);
  }

  async #release(tabId: number, state: SessionState): Promise<void> {
    if (this.#sessions.get(tabId) !== state) return;
    state.references = Math.max(0, state.references - 1);
    if (state.references > 0) return;
    await this.#detach(tabId, state);
  }

  async #detach(tabId: number, state: SessionState): Promise<void> {
    if (state.detachPromise !== undefined) {
      await state.detachPromise.catch(() => undefined);
      return;
    }
    if (!state.attached) {
      if (this.#sessions.get(tabId) === state) this.#sessions.delete(tabId);
      return;
    }
    state.attached = false;
    state.detachPromise = chrome.debugger
      .detach({ tabId })
      .catch(() => undefined)
      .finally(() => {
        if (this.#sessions.get(tabId) === state) this.#sessions.delete(tabId);
      });
    await state.detachPromise;
  }

  #ensureDetachListener(): void {
    if (this.#listening) return;
    if (chrome.debugger.onDetach?.addListener === undefined) return;
    chrome.debugger.onDetach.addListener((source, reason) => {
      if (source.tabId === undefined) return;
      const tabId = source.tabId;
      const existed = this.#sessions.delete(tabId);
      if (!existed) return;
      for (const listener of this.#detachListeners) listener(tabId, reason);
    });
    this.#listening = true;
  }
}

export const debuggerSessions = new ChromeDebuggerSessionManager();
