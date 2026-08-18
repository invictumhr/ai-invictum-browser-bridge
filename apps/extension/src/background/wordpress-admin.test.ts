import { afterEach, describe, expect, it, vi } from "vitest";
import { TOP_FRAME_ID } from "./frames.js";

import {
  GetWordPressAdminParametersSchema,
  IBP_ERROR_CODES,
  WordPressListTableActionParametersSchema,
} from "@invictum/protocol";

import { ChromeWordPressAdminAdapter } from "./wordpress-admin.js";

afterEach(() => vi.unstubAllGlobals());

const page = {
  url: "https://example.test/wp-admin/edit.php?post_type=page",
  origin: "https://example.test",
};

const authorization = {
  source: "explicit_user_instruction" as const,
  instructionId: "user-wp-admin",
};

describe("ChromeWordPressAdminAdapter", () => {
  it("injects content support and validates a bounded list-table inspection", async () => {
    const executeScript = vi.fn().mockResolvedValue([]);
    const sendMessage = vi
      .fn()
      .mockImplementation(async (_tabId: number, message: { requestId: string }) => ({
        requestId: message.requestId,
        ok: true,
        result: {
          page,
          documentId: "document-wp-admin",
          domRevision: 8,
          screen: {
            pageTitle: "Pages",
            heading: "Pages",
            pageSlug: "edit.php",
            postType: "page",
            taxonomy: "",
            editorKind: "none",
          },
          adminBar: { present: true, siteName: "Example site" },
          notices: [{ kind: "success", text: "1 page updated.", dismissible: true }],
          listTable: {
            tableId: "posts-list",
            columns: [
              { key: "title", label: "Title" },
              { key: "date", label: "Date" },
            ],
            rows: [
              {
                rowId: "post-201",
                primaryText: "About",
                status: "Published",
                selected: false,
                columns: [
                  { key: "title", text: "About" },
                  { key: "date", text: "Published" },
                ],
                actions: [
                  { key: "edit", label: "Edit", destructive: false },
                  { key: "trash", label: "Trash", destructive: true },
                ],
              },
            ],
            rowCount: 1,
            truncated: false,
            bulkActions: [
              { key: "edit", label: "Edit", destructive: false },
              { key: "trash", label: "Move to Trash", destructive: true },
            ],
          },
        },
      }));
    vi.stubGlobal("chrome", {
      permissions: { contains: vi.fn().mockResolvedValue(true) },
      tabs: {
        get: vi.fn().mockResolvedValue({ url: page.url }),
        sendMessage,
      },
      scripting: { executeScript },
    });

    const result = await new ChromeWordPressAdminAdapter().inspect(
      GetWordPressAdminParametersSchema.parse({ tabId: 12 }),
    );
    expect(result.listTable?.rows[0]).toMatchObject({
      rowId: "post-201",
      primaryText: "About",
    });
    expect(executeScript).toHaveBeenCalledWith({
      target: { tabId: 12, allFrames: true },
      files: ["content.js"],
    });
    expect(sendMessage).toHaveBeenCalledWith(
      12,
      expect.objectContaining({
        command: "get_wordpress_admin",
        parameters: { tabId: 12, maxRows: 50, maxCellText: 500 },
      }),
      { frameId: TOP_FRAME_ID },
    );
  });

  it("preserves stale-reference errors for exact list-table actions", async () => {
    const parameters = WordPressListTableActionParametersSchema.parse({
      tabId: 12,
      documentId: "document-wp-admin",
      domRevision: 8,
      operation: "apply_bulk",
      rowIds: ["post-201"],
      actionKey: "edit",
      authorization,
    });
    vi.stubGlobal("chrome", {
      permissions: { contains: vi.fn().mockResolvedValue(true) },
      tabs: {
        get: vi.fn().mockResolvedValue({ url: page.url }),
        sendMessage: vi
          .fn()
          .mockImplementation(async (_tabId: number, message: { requestId: string }) => ({
            requestId: message.requestId,
            ok: false,
            error: {
              code: IBP_ERROR_CODES.STALE_ELEMENT_REFERENCE,
              message: "The WordPress list-table revision is stale",
              retryable: true,
            },
          })),
      },
      scripting: { executeScript: vi.fn().mockResolvedValue([]) },
    });

    await expect(new ChromeWordPressAdminAdapter().act(parameters)).rejects.toMatchObject({
      code: IBP_ERROR_CODES.STALE_ELEMENT_REFERENCE,
      retryable: true,
    });
  });
});
