import {
  FigmaHealthcheckDataSchema,
  FigmaSelectDataSchema,
  GetFigmaDocumentDataSchema,
  GetFigmaLayersDataSchema,
  GetFigmaPropertiesDataSchema,
  IBP_ERROR_CODES,
  type FigmaHealthcheckData,
  type FigmaHealthcheckParameters,
  type FigmaSelectData,
  type FigmaSelectParameters,
  type GetFigmaDocumentData,
  type GetFigmaDocumentParameters,
  type GetFigmaLayersData,
  type GetFigmaLayersParameters,
  type GetFigmaPropertiesData,
  type GetFigmaPropertiesParameters,
} from "@invictum/protocol";

import { ExtensionCommandError } from "./command-error.js";
import { debuggerSessions } from "./debugger-session.js";
import { TOP_FRAME_ID } from "./frames.js";
import { isChromePageAccessDenied, pageAccessDeniedMessage } from "./page-access.js";

const CONTENT_CHANNEL = "invictum.browser.snapshot.v1";

type FigmaCommand =
  | "get_figma_document"
  | "get_figma_layers"
  | "get_figma_properties"
  | "figma_select"
  | "figma_locate"
  | "figma_healthcheck";

/** Figma repaints on its own schedule; give it a frame before reading back. */
const settle = async (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 250));

interface TargetLocation {
  found: boolean;
  x: number;
  y: number;
}

const TargetLocationSchema = {
  parse: (value: unknown): TargetLocation => {
    if (
      !isRecord(value) ||
      typeof value["found"] !== "boolean" ||
      typeof value["x"] !== "number" ||
      typeof value["y"] !== "number"
    ) {
      throw new ExtensionCommandError(
        IBP_ERROR_CODES.INVALID_MESSAGE,
        "The content script returned an invalid Figma target location",
        false,
      );
    }
    return { found: value["found"], x: value["x"], y: value["y"] };
  },
};

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const contentCommand = async (
  tabId: number,
  command: FigmaCommand,
  parameters: unknown,
): Promise<unknown> => {
  const requestId = crypto.randomUUID();
  const raw = await chrome.tabs.sendMessage(
    tabId,
    {
      channel: CONTENT_CHANNEL,
      command,
      requestId,
      parameters,
    },
    { frameId: TOP_FRAME_ID },
  );
  if (!isRecord(raw) || raw["requestId"] !== requestId || typeof raw["ok"] !== "boolean") {
    throw new ExtensionCommandError(
      IBP_ERROR_CODES.INVALID_MESSAGE,
      "The content script returned an invalid Figma response",
      false,
    );
  }
  if (raw["ok"] === true) return raw["result"];
  const error = raw["error"];
  throw new ExtensionCommandError(
    isRecord(error) && typeof error["code"] === "string"
      ? error["code"]
      : IBP_ERROR_CODES.CONTENT_SCRIPT_UNAVAILABLE,
    isRecord(error) && typeof error["message"] === "string"
      ? error["message"]
      : "The content script could not read the Figma design file",
    isRecord(error) && typeof error["retryable"] === "boolean" ? error["retryable"] : true,
  );
};

const figmaPage = async (tabId: number): Promise<string> => {
  const permission = await chrome.permissions.contains({
    permissions: ["activeTab", "tabs", "scripting"],
  });
  if (!permission) {
    throw new ExtensionCommandError(
      IBP_ERROR_CODES.PERMISSION_DENIED,
      "Figma tools require page access and the scripting permission",
      false,
    );
  }
  const tab = await chrome.tabs.get(tabId);
  const url = tab.pendingUrl ?? tab.url;
  if (url === undefined || !/^https?:/iu.test(url)) {
    throw new ExtensionCommandError(
      IBP_ERROR_CODES.RESTRICTED_PAGE,
      "Figma tools are only available on normal HTTP(S) pages",
      false,
    );
  }
  return url;
};

/**
 * Reads the DOM chrome of an open Figma design file. The content script is
 * injected into the top frame only: Figma runs a `plugin-sandbox` iframe that
 * would otherwise race the real page and answer first.
 */
export class ChromeFigmaAdapter {
  public async getDocument(parameters: GetFigmaDocumentParameters): Promise<GetFigmaDocumentData> {
    return this.#run(
      parameters.tabId,
      "get_figma_document",
      parameters,
      GetFigmaDocumentDataSchema,
      "read the Figma document",
    );
  }

  public async getLayers(parameters: GetFigmaLayersParameters): Promise<GetFigmaLayersData> {
    return this.#run(
      parameters.tabId,
      "get_figma_layers",
      parameters,
      GetFigmaLayersDataSchema,
      "read the Figma layer tree",
    );
  }

  public async getProperties(
    parameters: GetFigmaPropertiesParameters,
  ): Promise<GetFigmaPropertiesData> {
    return this.#run(
      parameters.tabId,
      "get_figma_properties",
      parameters,
      GetFigmaPropertiesDataSchema,
      "read the Figma selection properties",
    );
  }

  /**
   * Page and mode rows respond to the content script's own activation. The layer
   * tree does not: Figma ignores synthetic events there, so the row is located
   * first and then clicked with Chrome's trusted input through CDP.
   *
   * Figma repaints asynchronously, so the resulting state is read back after a
   * short settle rather than in the same turn as the click, which would still
   * describe the previous selection.
   */
  public async select(parameters: FigmaSelectParameters): Promise<FigmaSelectData> {
    if (parameters.target.type === "layer") {
      await this.#clickLayerWithTrustedInput(parameters);
    } else {
      await this.#run(
        parameters.tabId,
        "figma_select",
        parameters,
        FigmaSelectDataSchema,
        "change the Figma page or mode",
      );
    }
    await settle();
    const document = await this.getDocument({ tabId: parameters.tabId });
    return {
      selected: true,
      mode: document.mode,
      selection: document.selection,
      currentPage: document.pages.find((page) => page.current)?.name ?? "",
    };
  }

  async #clickLayerWithTrustedInput(parameters: FigmaSelectParameters): Promise<void> {
    const located = await this.#run(
      parameters.tabId,
      "figma_locate",
      parameters,
      TargetLocationSchema,
      "locate the Figma layer row",
    );
    if (!located.found) {
      throw new ExtensionCommandError(
        IBP_ERROR_CODES.ELEMENT_NOT_INTERACTABLE,
        "The layer row is not currently rendered; the layer panel is virtualised",
        true,
      );
    }
    const lease = await debuggerSessions.acquire(parameters.tabId);
    try {
      const point = { x: Math.round(located.x), y: Math.round(located.y) };
      await lease.sendCommand("Input.dispatchMouseEvent", {
        type: "mouseMoved",
        ...point,
        button: "none",
        clickCount: 0,
      });
      await lease.sendCommand("Input.dispatchMouseEvent", {
        type: "mousePressed",
        ...point,
        button: "left",
        clickCount: 1,
      });
      await lease.sendCommand("Input.dispatchMouseEvent", {
        type: "mouseReleased",
        ...point,
        button: "left",
        clickCount: 1,
      });
    } catch (error) {
      throw new ExtensionCommandError(
        IBP_ERROR_CODES.BROWSER_API_ERROR,
        "Chrome could not deliver trusted input to the Figma layer tree",
        true,
        { cause: error },
      );
    } finally {
      await lease.release();
    }
  }

  public async healthcheck(parameters: FigmaHealthcheckParameters): Promise<FigmaHealthcheckData> {
    return this.#run(
      parameters.tabId,
      "figma_healthcheck",
      parameters,
      FigmaHealthcheckDataSchema,
      "verify the Figma UI anchors",
    );
  }

  async #run<T>(
    tabId: number,
    command: FigmaCommand,
    parameters: unknown,
    schema: { parse: (value: unknown) => T },
    purpose: string,
  ): Promise<T> {
    const tabUrl = await figmaPage(tabId);
    try {
      await chrome.scripting.executeScript({
        target: { tabId, frameIds: [TOP_FRAME_ID] },
        files: ["content.js"],
      });
      return schema.parse(await contentCommand(tabId, command, parameters));
    } catch (error) {
      if (error instanceof ExtensionCommandError) throw error;
      if (isChromePageAccessDenied(error)) {
        throw new ExtensionCommandError(
          IBP_ERROR_CODES.PERMISSION_DENIED,
          pageAccessDeniedMessage(tabId, tabUrl, purpose),
          false,
        );
      }
      throw new ExtensionCommandError(
        IBP_ERROR_CODES.BROWSER_API_ERROR,
        `Chrome could not ${purpose}`,
        true,
        { cause: error },
      );
    }
  }
}
