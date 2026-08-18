const STORAGE_KEY = "invictum.agent.window";

/**
 * Keeps agent-created tabs out of the window the user is working in.
 *
 * `chrome.tabs.create` without a window puts the tab in whichever window Chrome
 * focused last - normally the user's - so an agent opening pages would keep
 * stealing the visible tab. The agent instead gets a window of its own, created
 * on first use and remembered in session storage so it survives service-worker
 * suspension. Inside that window the agent may switch tabs freely; the window is
 * never raised, so it cannot jump in front of the user's work.
 */
export class AgentWindow {
  async #stored(): Promise<number | undefined> {
    try {
      const stored = await chrome.storage.session.get(STORAGE_KEY);
      const value = stored[STORAGE_KEY];
      return typeof value === "number" ? value : undefined;
    } catch {
      return undefined;
    }
  }

  async #remember(windowId: number): Promise<void> {
    try {
      await chrome.storage.session.set({ [STORAGE_KEY]: windowId });
    } catch {
      // A missing session store only costs the binding, not the operation.
    }
  }

  /** The remembered window, or undefined when it was never created or has been closed. */
  public async current(): Promise<number | undefined> {
    const windowId = await this.#stored();
    if (windowId === undefined) return undefined;
    try {
      await chrome.windows.get(windowId);
      return windowId;
    } catch {
      await chrome.storage.session.remove(STORAGE_KEY).catch(() => undefined);
      return undefined;
    }
  }

  /**
   * Opens `url` in the agent's window, creating that window on first use. The
   * new window is created unfocused so it never takes over the user's screen.
   */
  public async openTab(url: string, active: boolean): Promise<chrome.tabs.Tab> {
    const windowId = await this.current();
    if (windowId !== undefined) {
      return chrome.tabs.create({ url, active, windowId });
    }
    const created = await chrome.windows.create({ url, focused: false });
    const tab = created?.tabs?.[0];
    if (created?.id === undefined || tab === undefined) {
      // Chrome refused a new window (for example in a locked-down profile);
      // fall back to the ordinary behaviour rather than failing the call.
      return chrome.tabs.create({ url, active });
    }
    await this.#remember(created.id);
    return tab;
  }
}
