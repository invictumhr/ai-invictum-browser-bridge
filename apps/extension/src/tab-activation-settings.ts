export const TAB_ACTIVATION_STORAGE_KEY = "ibpTabActivationModeV1";
export const DEFAULT_TAB_ACTIVATION_MODE = "background";

export type TabActivationMode = "background" | "foreground";

const isTabActivationMode = (value: unknown): value is TabActivationMode =>
  value === "background" || value === "foreground";

export class TabActivationSettings {
  public async getMode(): Promise<TabActivationMode> {
    try {
      const stored = await chrome.storage.local.get(TAB_ACTIVATION_STORAGE_KEY);
      const mode = stored[TAB_ACTIVATION_STORAGE_KEY];
      return isTabActivationMode(mode) ? mode : DEFAULT_TAB_ACTIVATION_MODE;
    } catch {
      return DEFAULT_TAB_ACTIVATION_MODE;
    }
  }

  public async setMode(mode: TabActivationMode): Promise<void> {
    if (!isTabActivationMode(mode)) throw new Error("Invalid tab activation mode");
    await chrome.storage.local.set({ [TAB_ACTIVATION_STORAGE_KEY]: mode });
  }

  public async resolve(explicitActive: boolean | undefined): Promise<boolean> {
    if (explicitActive !== undefined) return explicitActive;
    return (await this.getMode()) === "foreground";
  }
}
