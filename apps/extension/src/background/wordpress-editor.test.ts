import { afterEach, describe, expect, it, vi } from "vitest";

import {
  EditWordPressEditorParametersSchema,
  GetWordPressEditorParametersSchema,
  IBP_ERROR_CODES,
  PageSnapshotSchema,
} from "@invictum/protocol";

import { ChromeWordPressEditorAdapter } from "./wordpress-editor.js";

afterEach(() => vi.unstubAllGlobals());

const pageUrl = "https://example.test/wp-admin/post.php?post=301&action=edit";
const snapshot = PageSnapshotSchema.parse({
  page: {
    url: pageUrl,
    title: "Edit post",
    origin: "https://example.test",
    viewport: { width: 1280, height: 720, deviceScaleFactor: 1 },
    scroll: { x: 0, y: 0, maxX: 0, maxY: 500 },
    loadingState: "complete",
  },
  frames: [],
  elements: [],
  forms: [],
  dialogs: [],
  alerts: [],
  textBlocks: [],
  metadata: {
    generatedAt: "2026-07-23T10:00:00.000Z",
    documentId: "document-editor",
    domRevision: 14,
    elementCount: 0,
    textLength: 0,
    truncated: false,
    truncationReasons: [],
    detail: "minimal",
  },
});

const authorization = {
  source: "explicit_user_instruction" as const,
  instructionId: "user-edit-post",
};

const baseChrome = (executeScript: ReturnType<typeof vi.fn>) => ({
  permissions: { contains: vi.fn().mockResolvedValue(true) },
  tabs: {
    get: vi.fn().mockResolvedValue({ url: pageUrl }),
  },
  scripting: { executeScript },
});

describe("ChromeWordPressEditorAdapter", () => {
  it("reads the authoritative Gutenberg model and bounds large content", async () => {
    const executeScript = vi.fn().mockResolvedValue([
      {
        result: {
          ok: true,
          editorKind: "block",
          postId: "301",
          postType: "post",
          title: "Fixture post",
          content: "x".repeat(2_000),
          excerpt: "Summary",
          slug: "fixture-post",
          status: "draft",
          categoryIds: [4],
          tagIds: [8],
          featuredMediaId: 22,
          authorId: 1,
          parentId: 0,
          menuOrder: 0,
          commentStatus: "open",
          pingStatus: "closed",
          permalink: "https://example.test/?p=301&_wpnonce=secret",
          dirty: false,
          saving: false,
          lastSaveSucceeded: true,
        },
      },
    ]);
    vi.stubGlobal("chrome", baseChrome(executeScript));

    const result = await new ChromeWordPressEditorAdapter(async () => snapshot).getEditor(
      GetWordPressEditorParametersSchema.parse({ tabId: 18, maxContentChars: 1_000 }),
    );
    expect(result).toMatchObject({
      editorKind: "block",
      postId: "301",
      contentTruncated: true,
      categoryIds: [4],
    });
    expect(result.content).toHaveLength(1_000);
    expect(result.permalink).toContain("_wpnonce=%5BREDACTED%5D");
    expect(executeScript).toHaveBeenCalledWith(
      expect.objectContaining({ target: { tabId: 18 }, world: "MAIN" }),
    );
  });

  it("updates typed editor fields without exposing their values in the result", async () => {
    const executeScript = vi.fn().mockResolvedValue([
      {
        result: {
          ok: true,
          editorKind: "block",
          postId: "301",
          postType: "post",
          status: "draft",
          changed: true,
          saved: false,
          publishRequested: false,
        },
      },
    ]);
    vi.stubGlobal("chrome", baseChrome(executeScript));
    const parameters = EditWordPressEditorParametersSchema.parse({
      tabId: 18,
      documentId: "document-editor",
      domRevision: 14,
      fields: {
        title: "Updated fixture",
        content: "<!-- wp:paragraph --><p>Updated body</p><!-- /wp:paragraph -->",
        categoryIds: [4, 5],
      },
      save: false,
      authorization,
    });
    const result = await new ChromeWordPressEditorAdapter(async () => snapshot).editEditor(
      parameters,
    );

    expect(result).toMatchObject({
      fieldNames: ["title", "content", "categoryIds"],
      changed: true,
      saved: false,
      verificationRequired: false,
    });
    expect(result).not.toHaveProperty("content");
    expect(executeScript).toHaveBeenCalledWith(
      expect.objectContaining({
        target: { tabId: 18 },
        world: "MAIN",
        args: [parameters.fields, false],
      }),
    );
  });

  it("preserves a no-op result instead of reporting the editor as changed", async () => {
    const executeScript = vi.fn().mockResolvedValue([
      {
        result: {
          ok: true,
          editorKind: "classic",
          postId: "301",
          postType: "post",
          status: "draft",
          changed: false,
          saved: false,
          publishRequested: false,
        },
      },
    ]);
    vi.stubGlobal("chrome", baseChrome(executeScript));
    const parameters = EditWordPressEditorParametersSchema.parse({
      tabId: 18,
      documentId: "document-editor",
      domRevision: 14,
      fields: { title: "Fixture post" },
      save: false,
      authorization,
    });

    await expect(
      new ChromeWordPressEditorAdapter(async () => snapshot).editEditor(parameters),
    ).resolves.toMatchObject({
      fieldNames: ["title"],
      changed: false,
      saved: false,
      verificationRequired: false,
    });
  });

  it("fails closed before MAIN-world execution when the revision is stale", async () => {
    const executeScript = vi.fn();
    vi.stubGlobal("chrome", baseChrome(executeScript));
    const parameters = EditWordPressEditorParametersSchema.parse({
      tabId: 18,
      documentId: "document-editor",
      domRevision: 13,
      fields: { title: "Should not run" },
      authorization,
    });

    await expect(
      new ChromeWordPressEditorAdapter(async () => snapshot).editEditor(parameters),
    ).rejects.toMatchObject({ code: IBP_ERROR_CODES.STALE_ELEMENT_REFERENCE });
    expect(executeScript).not.toHaveBeenCalled();
  });
});
