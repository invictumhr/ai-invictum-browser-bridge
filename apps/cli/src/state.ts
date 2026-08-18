import { createHash } from "node:crypto";
import { readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const STATE_VERSION = 1;
const STATE_TTL_MS = 10 * 60_000;

export interface CachedElementReference {
  elementId: string;
  frameId: string;
  role: string;
  name: string;
  tag: string;
  css?: string;
}

export interface CachedTabState {
  documentId: string;
  domRevision: number;
  updatedAt: string;
  elements: Record<string, CachedElementReference>;
}

interface CliState {
  version: typeof STATE_VERSION;
  updatedAt: string;
  tabs: Record<string, CachedTabState>;
}

const emptyState = (): CliState => ({
  version: STATE_VERSION,
  updatedAt: new Date().toISOString(),
  tabs: {},
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export class CliStateStore {
  readonly #path: string;

  public constructor(sessionId: string, baseUrl: string) {
    const key = createHash("sha256").update(`${sessionId}\0${baseUrl}`).digest("hex").slice(0, 24);
    this.#path = join(tmpdir(), `invictum-browser-cli-${key}.json`);
  }

  public async getTab(tabId: number): Promise<CachedTabState | undefined> {
    return (await this.#load()).tabs[String(tabId)];
  }

  public async setTab(tabId: number, tab: CachedTabState): Promise<void> {
    const state = await this.#load();
    state.tabs[String(tabId)] = tab;
    state.updatedAt = new Date().toISOString();
    await this.#save(state);
  }

  public async removeTab(tabId: number): Promise<void> {
    const state = await this.#load();
    delete state.tabs[String(tabId)];
    state.updatedAt = new Date().toISOString();
    await this.#save(state);
  }

  public async clear(): Promise<void> {
    await rm(this.#path, { force: true });
  }

  async #load(): Promise<CliState> {
    try {
      const parsed = JSON.parse(await readFile(this.#path, "utf8")) as unknown;
      if (!isRecord(parsed) || parsed["version"] !== STATE_VERSION || !isRecord(parsed["tabs"])) {
        return emptyState();
      }
      const updatedAt =
        typeof parsed["updatedAt"] === "string" ? Date.parse(parsed["updatedAt"]) : 0;
      if (!Number.isFinite(updatedAt) || Date.now() - updatedAt > STATE_TTL_MS) return emptyState();
      return parsed as unknown as CliState;
    } catch {
      return emptyState();
    }
  }

  async #save(state: CliState): Promise<void> {
    const temporary = `${this.#path}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(temporary, JSON.stringify(state), { encoding: "utf8", mode: 0o600 });
    await rename(temporary, this.#path);
  }
}
