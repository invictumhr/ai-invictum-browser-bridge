import {
  IBP_ERROR_CODES,
  ManagedDownloadDataSchema,
  type ManagedDownloadData,
  type StartDownloadParameters,
  type WaitForDownloadParameters,
} from "@invictum/protocol";

import { ExtensionCommandError } from "./command-error.js";

const SESSION_KEY = "invictum.browser.managedDownloads.v1";
const POLL_INTERVAL_MS = 150;
const FORBIDDEN_EXTENSIONS = new Set([
  "app",
  "bat",
  "cmd",
  "com",
  "cpl",
  "dll",
  "exe",
  "hta",
  "jar",
  "js",
  "jse",
  "lnk",
  "msi",
  "msp",
  "pif",
  "ps1",
  "reg",
  "scr",
  "vbe",
  "vbs",
  "wsf",
]);

interface ManagedRecord {
  tabId: number;
  maxBytes: number;
  createdAt: number;
}

type ManagedState = Record<string, ManagedRecord>;

const safeUrl = (raw: string): string => {
  const url = new URL(raw);
  url.username = "";
  url.password = "";
  url.search = "";
  url.hash = "";
  return url.toString().slice(0, 4_096);
};

const safeFilename = (value: string | undefined): string | undefined => {
  if (value === undefined) return undefined;
  const normalized = value.replaceAll("\\", "/").replace(/^\/+/, "");
  if (
    normalized.length === 0 ||
    normalized.includes("..") ||
    normalized.split("/").some((part) => part.length === 0 || part === ".")
  ) {
    throw new ExtensionCommandError(
      IBP_ERROR_CODES.INVALID_PARAMETERS,
      "Download filename must be a relative path without traversal segments",
      false,
    );
  }
  const extension = normalized.split(".").at(-1)?.toLowerCase() ?? "";
  if (FORBIDDEN_EXTENSIONS.has(extension)) {
    throw new ExtensionCommandError(
      IBP_ERROR_CODES.POLICY_DENIED,
      `Executable download type .${extension} is blocked`,
      false,
    );
  }
  return normalized;
};

const basename = (path: string): string => path.replaceAll("\\", "/").split("/").at(-1) ?? "";

const hasForbiddenExtension = (path: string): boolean => {
  const extension = basename(path).split(".").at(-1)?.toLowerCase() ?? "";
  return FORBIDDEN_EXTENSIONS.has(extension);
};

const decodedPath = (path: string): string => {
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
};

const delay = async (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

export class ChromeDownloadAdapter {
  public constructor() {
    if (chrome.downloads.onChanged !== undefined) {
      chrome.downloads.onChanged.addListener((delta) => {
        void this.#enforceBoundaries(delta.id).catch(() => undefined);
      });
    }
  }

  public async start(parameters: StartDownloadParameters): Promise<ManagedDownloadData> {
    const url = new URL(parameters.url);
    if (url.username.length > 0 || url.password.length > 0) {
      throw new ExtensionCommandError(
        IBP_ERROR_CODES.INVALID_PARAMETERS,
        "Credentials are forbidden in download URLs",
        false,
      );
    }
    if (hasForbiddenExtension(decodedPath(url.pathname))) {
      throw new ExtensionCommandError(
        IBP_ERROR_CODES.POLICY_DENIED,
        "Executable download URLs are blocked",
        false,
      );
    }
    const filename = safeFilename(parameters.filename);
    const downloadId = await chrome.downloads.download({
      url: url.toString(),
      ...(filename === undefined ? {} : { filename }),
      conflictAction: "uniquify",
      saveAs: false,
    });
    const state = await this.#load();
    state[String(downloadId)] = {
      tabId: parameters.tabId,
      maxBytes: parameters.maxBytes,
      createdAt: Date.now(),
    };
    await this.#save(state);
    return this.#read(parameters.tabId, downloadId, state[String(downloadId)]!);
  }

  public async wait(parameters: WaitForDownloadParameters): Promise<ManagedDownloadData> {
    const state = await this.#load();
    const record = state[String(parameters.downloadId)];
    if (record === undefined || record.tabId !== parameters.tabId) {
      throw new ExtensionCommandError(
        IBP_ERROR_CODES.POLICY_DENIED,
        "Only downloads initiated by this Bridge session and tab can be inspected",
        false,
      );
    }
    const deadline = Date.now() + parameters.timeoutMs;
    while (true) {
      const result = await this.#read(parameters.tabId, parameters.downloadId, record);
      if (result.state !== "in_progress" || Date.now() >= deadline) return result;
      await delay(Math.min(POLL_INTERVAL_MS, Math.max(1, deadline - Date.now())));
    }
  }

  async #read(
    tabId: number,
    downloadId: number,
    record: ManagedRecord,
  ): Promise<ManagedDownloadData> {
    const [item] = await chrome.downloads.search({ id: downloadId });
    if (item === undefined) {
      throw new ExtensionCommandError(
        IBP_ERROR_CODES.BROWSER_API_ERROR,
        "Managed download is no longer available in Chrome",
        false,
      );
    }
    const exceededLimit =
      item.bytesReceived > record.maxBytes ||
      (item.totalBytes > 0 && item.totalBytes > record.maxBytes);
    const unsafe = item.danger !== "safe" && item.danger !== "accepted";
    const forbiddenType = hasForbiddenExtension(item.filename) || hasForbiddenExtension(item.url);
    if (exceededLimit || unsafe || forbiddenType) {
      if (item.state === "in_progress") {
        await chrome.downloads.cancel(downloadId).catch(() => undefined);
      } else if (item.state === "complete") {
        await chrome.downloads.removeFile(downloadId).catch(() => undefined);
      }
    }
    return ManagedDownloadDataSchema.parse({
      tabId,
      downloadId,
      state: exceededLimit || unsafe || forbiddenType ? "interrupted" : item.state,
      danger: item.danger,
      bytesReceived: item.bytesReceived,
      totalBytes: item.totalBytes,
      fileName: basename(item.filename).slice(0, 512),
      url: safeUrl(item.url),
      ...(item.error === undefined ? {} : { error: item.error.slice(0, 256) }),
      exceededLimit,
      managed: true,
    });
  }

  async #load(): Promise<ManagedState> {
    const stored = await chrome.storage.session.get(SESSION_KEY);
    const raw = stored[SESSION_KEY];
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};
    const cutoff = Date.now() - 24 * 60 * 60 * 1_000;
    return Object.fromEntries(
      Object.entries(raw as Record<string, unknown>).filter(
        (entry): entry is [string, ManagedRecord] => {
          const value = entry[1] as Partial<ManagedRecord>;
          return (
            typeof value === "object" &&
            value !== null &&
            typeof value.tabId === "number" &&
            typeof value.maxBytes === "number" &&
            typeof value.createdAt === "number" &&
            value.createdAt >= cutoff
          );
        },
      ),
    );
  }

  async #save(state: ManagedState): Promise<void> {
    await chrome.storage.session.set({ [SESSION_KEY]: state });
  }

  async #enforceBoundaries(downloadId: number): Promise<void> {
    const state = await this.#load();
    const record = state[String(downloadId)];
    if (record === undefined) return;
    const [item] = await chrome.downloads.search({ id: downloadId });
    if (item === undefined) return;
    const exceededLimit =
      item.bytesReceived > record.maxBytes ||
      (item.totalBytes > 0 && item.totalBytes > record.maxBytes);
    const unsafe = item.danger !== "safe" && item.danger !== "accepted";
    const forbiddenType = hasForbiddenExtension(item.filename) || hasForbiddenExtension(item.url);
    if (exceededLimit || unsafe || forbiddenType) {
      if (item.state === "in_progress") {
        await chrome.downloads.cancel(downloadId).catch(() => undefined);
      } else if (item.state === "complete") {
        await chrome.downloads.removeFile(downloadId).catch(() => undefined);
      }
    }
  }
}
