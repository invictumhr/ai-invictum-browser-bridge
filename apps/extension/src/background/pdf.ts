import {
  IBP_ERROR_CODES,
  PrintToPdfDataSchema,
  type PrintToPdfData,
  type PrintToPdfParameters,
} from "@invictum/protocol";

import { ExtensionCommandError } from "./command-error.js";
import { debuggerSessions } from "./debugger-session.js";

const PAPER_SIZES = {
  a4: { paperWidth: 8.27, paperHeight: 11.69 },
  letter: { paperWidth: 8.5, paperHeight: 11 },
  legal: { paperWidth: 8.5, paperHeight: 14 },
} as const;

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export class ChromePdfAdapter {
  public async print(parameters: PrintToPdfParameters): Promise<PrintToPdfData> {
    const permission = await chrome.permissions.contains({ permissions: ["debugger", "tabs"] });
    if (!permission) {
      throw new ExtensionCommandError(
        IBP_ERROR_CODES.PERMISSION_DENIED,
        "PDF export requires the Chrome debugger permission",
        false,
      );
    }
    const tab = await chrome.tabs.get(parameters.tabId);
    const url = tab.pendingUrl ?? tab.url;
    if (url === undefined || !/^https?:/iu.test(url)) {
      throw new ExtensionCommandError(
        IBP_ERROR_CODES.RESTRICTED_PAGE,
        "PDF export is only available on normal HTTP(S) pages",
        false,
      );
    }
    const lease = await debuggerSessions.acquire(parameters.tabId).catch((error: unknown) => {
      throw new ExtensionCommandError(
        IBP_ERROR_CODES.BROWSER_API_ERROR,
        "Chrome could not start PDF export; close the visible DevTools window for this tab and retry",
        true,
        { cause: error },
      );
    });
    try {
      const paper = PAPER_SIZES[parameters.paperSize];
      const raw = await lease.sendCommand("Page.printToPDF", {
        landscape: parameters.landscape,
        printBackground: parameters.printBackground,
        scale: parameters.scale,
        ...paper,
        marginTop: parameters.marginTop,
        marginBottom: parameters.marginBottom,
        marginLeft: parameters.marginLeft,
        marginRight: parameters.marginRight,
        pageRanges: parameters.pageRanges,
        preferCSSPageSize: parameters.preferCssPageSize,
        transferMode: "ReturnAsBase64",
      });
      if (!isRecord(raw) || typeof raw["data"] !== "string" || raw["data"].length === 0) {
        throw new ExtensionCommandError(
          IBP_ERROR_CODES.INVALID_MESSAGE,
          "Chrome returned an invalid PDF payload",
          false,
        );
      }
      const byteLength = Math.floor((raw["data"].length * 3) / 4);
      if (byteLength > 10_000_000) {
        throw new ExtensionCommandError(
          IBP_ERROR_CODES.MESSAGE_TOO_LARGE,
          "The generated PDF exceeds the 10 MB Bridge limit",
          false,
        );
      }
      return PrintToPdfDataSchema.parse({
        pdfId: crypto.randomUUID(),
        tabId: parameters.tabId,
        capturedAt: new Date().toISOString(),
        mediaType: "application/pdf",
        byteLength,
        dataUrl: `data:application/pdf;base64,${raw["data"]}`,
        landscape: parameters.landscape,
        printBackground: parameters.printBackground,
        paperSize: parameters.paperSize,
        pageRanges: parameters.pageRanges,
      });
    } catch (error) {
      if (error instanceof ExtensionCommandError) throw error;
      throw new ExtensionCommandError(
        IBP_ERROR_CODES.BROWSER_API_ERROR,
        "Chrome could not export the page as PDF",
        true,
        { cause: error },
      );
    } finally {
      await lease.release();
    }
  }
}
