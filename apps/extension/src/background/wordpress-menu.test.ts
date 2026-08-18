import { afterEach, describe, expect, it, vi } from "vitest";
import { TOP_FRAME_ID } from "./frames.js";

import {
  EditWordPressMenuParametersSchema,
  GetWordPressMenuParametersSchema,
  IBP_ERROR_CODES,
} from "@invictum/protocol";

import { ChromeWordPressMenuAdapter } from "./wordpress-menu.js";

afterEach(() => vi.unstubAllGlobals());

const page = {
  url: "https://example.test/wp-admin/nav-menus.php?menu=151",
  origin: "https://example.test",
};

const item = {
  itemId: "101",
  parentItemId: null,
  depth: 0,
  position: 0,
  label: "Home",
  type: "custom",
  object: "custom",
  url: "https://example.test/",
  openInNewTab: false,
  childCount: 0,
};

describe("ChromeWordPressMenuAdapter", () => {
  it("injects the content script and validates typed menu inspection", async () => {
    const executeScript = vi.fn().mockResolvedValue([]);
    const sendMessage = vi
      .fn()
      .mockImplementation(async (_tabId: number, message: { requestId: string }) => ({
        requestId: message.requestId,
        ok: true,
        result: {
          page,
          documentId: "document-1",
          domRevision: 3,
          menuId: "151",
          menuName: "Primary",
          items: [item],
          itemCount: 1,
          truncated: false,
          dirty: false,
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

    await expect(
      new ChromeWordPressMenuAdapter().getMenu(
        GetWordPressMenuParametersSchema.parse({ tabId: 9 }),
      ),
    ).resolves.toMatchObject({ menuId: "151", items: [{ label: "Home" }] });
    expect(executeScript).toHaveBeenCalledWith({
      target: { tabId: 9, allFrames: true },
      files: ["content.js"],
    });
    expect(sendMessage).toHaveBeenCalledWith(
      9,
      expect.objectContaining({
        command: "get_wordpress_menu",
        parameters: { tabId: 9, maxItems: 250 },
      }),
      { frameId: TOP_FRAME_ID },
    );
  });

  it("preserves typed edit errors and fails closed without page permission", async () => {
    const authorization = {
      source: "explicit_user_instruction" as const,
      instructionId: "user-wordpress-menu",
    };
    const parameters = EditWordPressMenuParametersSchema.parse({
      tabId: 9,
      documentId: "document-1",
      domRevision: 3,
      operations: [{ type: "remove", itemId: "101" }],
      authorization,
    });
    vi.stubGlobal("chrome", {
      permissions: { contains: vi.fn().mockResolvedValue(false) },
    });
    await expect(new ChromeWordPressMenuAdapter().editMenu(parameters)).rejects.toMatchObject({
      code: IBP_ERROR_CODES.PERMISSION_DENIED,
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
              message: "WordPress menu item 101 does not exist",
              retryable: true,
            },
          })),
      },
      scripting: { executeScript: vi.fn().mockResolvedValue([]) },
    });
    await expect(new ChromeWordPressMenuAdapter().editMenu(parameters)).rejects.toMatchObject({
      code: IBP_ERROR_CODES.STALE_ELEMENT_REFERENCE,
      retryable: true,
    });
  });
});
