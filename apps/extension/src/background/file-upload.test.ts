import { afterEach, describe, expect, it, vi } from "vitest";

import { SetFileInputFilesParametersSchema } from "@invictum/protocol";

import { ChromeFileUploadAdapter } from "./file-upload.js";

afterEach(() => vi.unstubAllGlobals());

describe("ChromeFileUploadAdapter", () => {
  it("sets absolute files through a short-lived debugger attachment without sending paths to content", async () => {
    const sendMessage = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        requestId: "request-prepare",
        result: {
          token: "upload-token",
          documentId: "document-1",
          domRevisionBefore: 4,
          elementId: "file-element",
          multiple: true,
          accept: ".txt",
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        requestId: "request-complete",
        result: {
          page: { url: "https://example.test/upload", origin: "https://example.test" },
          documentId: "document-1",
          domRevisionBefore: 4,
          domRevisionAfter: 5,
          elementId: "file-element",
          resolvedElementId: "file-element-next",
          fileCount: 2,
          countVerified: true,
          multiple: true,
          accept: ".txt",
          changed: true,
          requiresNewSnapshot: true,
          verificationRequired: true,
        },
      });
    const sendCommand = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({
        nodes: [
          {
            backendNodeId: 77,
            attributes: ["type", "file", "data-invictum-file-input-target", "upload-token"],
          },
        ],
      })
      .mockResolvedValueOnce(undefined);
    vi.stubGlobal("crypto", {
      ...crypto,
      randomUUID: vi
        .fn()
        .mockReturnValueOnce("request-prepare")
        .mockReturnValueOnce("request-complete"),
    });
    vi.stubGlobal("chrome", {
      permissions: { contains: vi.fn().mockResolvedValue(true) },
      tabs: {
        get: vi.fn().mockResolvedValue({ url: "https://example.test/upload" }),
        sendMessage,
      },
      scripting: { executeScript: vi.fn().mockResolvedValue([]) },
      debugger: {
        attach: vi.fn().mockResolvedValue(undefined),
        sendCommand,
        detach: vi.fn().mockResolvedValue(undefined),
      },
    });

    const parameters = SetFileInputFilesParametersSchema.parse({
      tabId: 9,
      documentId: "document-1",
      domRevision: 4,
      elementId: "file-element",
      filePaths: ["C:\\upload\\one.txt", "C:\\upload\\two.txt"],
      authorization: {
        source: "explicit_user_instruction",
        instructionId: "user-upload-test",
      },
    });
    await expect(new ChromeFileUploadAdapter().setFiles(parameters)).resolves.toMatchObject({
      fileCount: 2,
      countVerified: true,
      resolvedElementId: "file-element-next",
    });

    expect(sendMessage.mock.calls[0]?.[1]).not.toHaveProperty("parameters.filePaths");
    expect(sendCommand).toHaveBeenNthCalledWith(3, { tabId: 9 }, "DOM.setFileInputFiles", {
      files: ["C:\\upload\\one.txt", "C:\\upload\\two.txt"],
      backendNodeId: 77,
    });
    expect(chrome.debugger.detach).toHaveBeenCalledWith({ tabId: 9 });
  });

  it("returns an unverified success instead of encouraging a duplicate retry after navigation", async () => {
    const sendMessage = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        requestId: "request-prepare",
        result: {
          token: "upload-token",
          documentId: "document-1",
          domRevisionBefore: 4,
          elementId: "file-element",
          multiple: false,
          accept: ".txt",
        },
      })
      .mockRejectedValueOnce(new Error("The frame was removed"));
    vi.stubGlobal("crypto", {
      ...crypto,
      randomUUID: vi
        .fn()
        .mockReturnValueOnce("request-prepare")
        .mockReturnValueOnce("request-complete"),
    });
    vi.stubGlobal("chrome", {
      permissions: { contains: vi.fn().mockResolvedValue(true) },
      tabs: {
        get: vi
          .fn()
          .mockResolvedValueOnce({ url: "https://example.test/upload", status: "complete" })
          .mockResolvedValueOnce({
            url: "https://example.test/uploaded?receipt=private",
            status: "loading",
          }),
        sendMessage,
      },
      scripting: { executeScript: vi.fn().mockResolvedValue([]) },
      debugger: {
        attach: vi.fn().mockResolvedValue(undefined),
        sendCommand: vi
          .fn()
          .mockResolvedValueOnce(undefined)
          .mockResolvedValueOnce({
            nodes: [
              {
                backendNodeId: 77,
                attributes: ["data-invictum-file-input-target", "upload-token"],
              },
            ],
          })
          .mockResolvedValueOnce(undefined),
        detach: vi.fn().mockResolvedValue(undefined),
      },
    });
    const result = await new ChromeFileUploadAdapter().setFiles(
      SetFileInputFilesParametersSchema.parse({
        tabId: 9,
        documentId: "document-1",
        domRevision: 4,
        elementId: "file-element",
        filePaths: ["C:\\upload\\one.txt"],
        authorization: {
          source: "explicit_user_instruction",
          instructionId: "user-upload-test",
        },
      }),
    );
    expect(result).toMatchObject({
      fileCount: 1,
      countVerified: false,
      verificationRequired: true,
      page: { url: "https://example.test/uploaded?receipt=%5BREDACTED%5D" },
    });
  });
});
