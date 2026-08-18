import {
  EditWordPressEditorDataSchema,
  GetWordPressEditorDataSchema,
  IBP_ERROR_CODES,
  type EditWordPressEditorData,
  type EditWordPressEditorParameters,
  type GetWordPressEditorData,
  type GetWordPressEditorParameters,
  type PageSnapshot,
} from "@invictum/protocol";

import { ExtensionCommandError } from "./command-error.js";
import { isChromePageAccessDenied, pageAccessDeniedMessage } from "./page-access.js";

type SnapshotReader = (tabId: number) => Promise<PageSnapshot>;

interface MainEditorRead {
  ok: boolean;
  error?: string;
  editorKind?: "block" | "classic";
  postId?: string;
  postType?: string;
  title?: string;
  content?: string;
  excerpt?: string;
  slug?: string;
  status?: string;
  categoryIds?: number[];
  tagIds?: number[];
  featuredMediaId?: number | null;
  authorId?: number | null;
  parentId?: number | null;
  menuOrder?: number | null;
  commentStatus?: "open" | "closed" | "";
  pingStatus?: "open" | "closed" | "";
  permalink?: string;
  dirty?: boolean;
  saving?: boolean;
  lastSaveSucceeded?: boolean | null;
}

interface MainEditorEdit {
  ok: boolean;
  error?: string;
  editorKind?: "block" | "classic";
  postId?: string;
  postType?: string;
  status?: string;
  changed?: boolean;
  saved?: boolean;
  publishRequested?: boolean;
}

const sanitizeUrl = (value: string): string => {
  try {
    const url = new URL(value);
    url.username = "";
    url.password = "";
    for (const key of [...url.searchParams.keys()]) url.searchParams.set(key, "[REDACTED]");
    if (url.hash.length > 1) url.hash = "#[REDACTED]";
    return url.toString().slice(0, 4_096);
  } catch {
    return value.slice(0, 4_096);
  }
};

const normalPage = async (tabId: number): Promise<string> => {
  const permission = await chrome.permissions.contains({
    permissions: ["activeTab", "tabs", "scripting"],
  });
  if (!permission) {
    throw new ExtensionCommandError(
      IBP_ERROR_CODES.PERMISSION_DENIED,
      "WordPress editor tools require page access and the scripting permission",
      false,
    );
  }
  const tab = await chrome.tabs.get(tabId);
  const url = tab.pendingUrl ?? tab.url;
  if (url === undefined || !/^https?:/iu.test(url)) {
    throw new ExtensionCommandError(
      IBP_ERROR_CODES.RESTRICTED_PAGE,
      "WordPress editor tools are only available on normal HTTP(S) pages",
      false,
    );
  }
  return url;
};

const inspectWordPressEditorMain = (): MainEditorRead => {
  const root = globalThis as unknown as {
    wp?: {
      data?: {
        select?: (store: string) => Record<string, (...args: unknown[]) => unknown>;
      };
    };
    tinymce?: {
      get?: (id: string) => { getContent?: () => string };
    };
  };
  const asString = (value: unknown): string =>
    typeof value === "string" ? value : value == null ? "" : String(value);
  const asNumber = (value: unknown): number | null => {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
  };
  const asInteger = (value: unknown): number | null => {
    const parsed = Number(value);
    return Number.isInteger(parsed) ? parsed : null;
  };
  const asIds = (value: unknown): number[] =>
    Array.isArray(value)
      ? value
          .map((item) => Number(item))
          .filter((item) => Number.isInteger(item) && item >= 0)
          .slice(0, 500)
      : [];
  try {
    const select = root.wp?.data?.select?.("core/editor");
    if (
      select !== undefined &&
      typeof select["getEditedPostAttribute"] === "function" &&
      typeof select["getCurrentPostId"] === "function"
    ) {
      const attribute = (name: string): unknown => select["getEditedPostAttribute"]!(name);
      const content =
        typeof select["getEditedPostContent"] === "function"
          ? select["getEditedPostContent"]!()
          : attribute("content");
      const permalink =
        typeof select["getPermalink"] === "function" ? select["getPermalink"]!() : "";
      const saveSucceeded =
        typeof select["didPostSaveRequestSucceed"] === "function"
          ? Boolean(select["didPostSaveRequestSucceed"]!())
          : null;
      const saveFailed =
        typeof select["didPostSaveRequestFail"] === "function"
          ? Boolean(select["didPostSaveRequestFail"]!())
          : false;
      return {
        ok: true,
        editorKind: "block",
        postId: asString(select["getCurrentPostId"]!()),
        postType:
          typeof select["getCurrentPostType"] === "function"
            ? asString(select["getCurrentPostType"]!())
            : asString(attribute("type")),
        title: asString(attribute("title")),
        content: asString(content),
        excerpt: asString(attribute("excerpt")),
        slug: asString(attribute("slug")),
        status: asString(attribute("status")),
        categoryIds: asIds(attribute("categories")),
        tagIds: asIds(attribute("tags")),
        featuredMediaId: asNumber(attribute("featured_media")),
        authorId: asNumber(attribute("author")),
        parentId: asNumber(attribute("parent")),
        menuOrder: asInteger(attribute("menu_order")),
        commentStatus: asString(attribute("comment_status")) as "open" | "closed" | "",
        pingStatus: asString(attribute("ping_status")) as "open" | "closed" | "",
        permalink: asString(permalink),
        dirty:
          typeof select["isEditedPostDirty"] === "function"
            ? Boolean(select["isEditedPostDirty"]!())
            : false,
        saving:
          typeof select["isSavingPost"] === "function" ? Boolean(select["isSavingPost"]!()) : false,
        lastSaveSucceeded: saveFailed ? false : saveSucceeded,
      };
    }

    const form = document.querySelector<HTMLFormElement>("form#post");
    const title = document.querySelector<HTMLInputElement>("#title");
    const content = document.querySelector<HTMLTextAreaElement>("textarea#content");
    if (form === null || title === null || content === null) {
      return { ok: false, error: "The current page has no supported WordPress post editor" };
    }
    const tinyContent = root.tinymce?.get?.("content")?.getContent?.();
    const checkedIds = (selector: string): number[] =>
      [...document.querySelectorAll<HTMLInputElement>(selector)]
        .filter((input) => input.checked)
        .map((input) => Number(input.value))
        .filter((value) => Number.isInteger(value) && value >= 0)
        .slice(0, 500);
    const inputValue = (selector: string): string =>
      document.querySelector<HTMLInputElement | HTMLSelectElement>(selector)?.value ?? "";
    return {
      ok: true,
      editorKind: "classic",
      postId: inputValue("#post_ID, input[name='post_ID']"),
      postType: inputValue("#post_type, input[name='post_type']") || "post",
      title: title.value,
      content: typeof tinyContent === "string" ? tinyContent : content.value,
      excerpt: document.querySelector<HTMLTextAreaElement>("#excerpt")?.value ?? "",
      slug: inputValue("#post_name, #new-post-slug"),
      status: inputValue("#post_status") || "draft",
      categoryIds: checkedIds("#categorychecklist input[type='checkbox']"),
      tagIds: [],
      featuredMediaId: asNumber(inputValue("#_thumbnail_id")),
      authorId: asNumber(inputValue("#post_author_override, #post_author")),
      parentId: asNumber(inputValue("#parent_id")),
      menuOrder: asInteger(inputValue("#menu_order")),
      commentStatus:
        document.querySelector<HTMLInputElement>("#comment_status")?.checked === true
          ? "open"
          : "closed",
      pingStatus:
        document.querySelector<HTMLInputElement>("#ping_status")?.checked === true
          ? "open"
          : "closed",
      permalink:
        document.querySelector<HTMLAnchorElement>("#sample-permalink a")?.href ??
        document.querySelector<HTMLAnchorElement>("#view-post-btn a")?.href ??
        "",
      dirty: form.getAttribute("data-invictum-wordpress-editor-dirty") === "true",
      saving: false,
      lastSaveSucceeded: null,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "WordPress editor inspection failed",
    };
  }
};

const editWordPressEditorMain = async (
  fields: EditWordPressEditorParameters["fields"],
  save: boolean,
): Promise<MainEditorEdit> => {
  const root = globalThis as unknown as {
    wp?: {
      data?: {
        select?: (store: string) => Record<string, (...args: unknown[]) => unknown>;
        dispatch?: (store: string) => Record<string, (...args: unknown[]) => unknown>;
      };
    };
    tinymce?: {
      get?: (id: string) => {
        getContent?: () => string;
        setContent?: (value: string) => void;
        save?: () => void;
      };
    };
  };
  const fieldEntries = Object.entries(fields);
  const valuesEqual = (current: unknown, requested: unknown): boolean => {
    if (Array.isArray(current) && Array.isArray(requested)) {
      return (
        current.length === requested.length &&
        current.every((value, index) => value === requested[index])
      );
    }
    return current === requested;
  };
  try {
    const select = root.wp?.data?.select?.("core/editor");
    const dispatch = root.wp?.data?.dispatch?.("core/editor");
    if (
      select !== undefined &&
      dispatch !== undefined &&
      typeof select["getCurrentPostId"] === "function" &&
      typeof dispatch["editPost"] === "function"
    ) {
      const patch: Record<string, unknown> = {};
      const mapping: Readonly<Record<string, string>> = {
        categoryIds: "categories",
        tagIds: "tags",
        featuredMediaId: "featured_media",
        authorId: "author",
        parentId: "parent",
        menuOrder: "menu_order",
        commentStatus: "comment_status",
        pingStatus: "ping_status",
      };
      const attribute =
        typeof select["getEditedPostAttribute"] === "function"
          ? (name: string): unknown => select["getEditedPostAttribute"]!(name)
          : (): unknown => "";
      for (const [key, value] of fieldEntries) {
        const mappedKey = mapping[key] ?? key;
        const current =
          key === "content" && typeof select["getEditedPostContent"] === "function"
            ? select["getEditedPostContent"]!()
            : attribute(mappedKey);
        if (!valuesEqual(current, value)) patch[mappedKey] = value;
      }
      const changed = Object.keys(patch).length > 0;
      if (changed) dispatch["editPost"]!(patch);
      if (save) {
        if (typeof dispatch["savePost"] !== "function") {
          return { ok: false, error: "The WordPress block editor cannot save this post" };
        }
        await dispatch["savePost"]!();
      }
      return {
        ok: true,
        editorKind: "block",
        postId: String(select["getCurrentPostId"]!()),
        postType:
          typeof select["getCurrentPostType"] === "function"
            ? String(select["getCurrentPostType"]!())
            : "post",
        status: String(attribute("status") ?? ""),
        changed,
        saved: save,
        publishRequested: fields.status === "publish",
      };
    }

    const form = document.querySelector<HTMLFormElement>("form#post");
    if (form === null) {
      return { ok: false, error: "The current page has no supported WordPress post editor" };
    }
    let changed = false;
    const setValue = (
      selector: string,
      value: string | number,
      required = true,
    ): HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null => {
      const element = document.querySelector<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >(selector);
      if (element === null) {
        if (required) throw new Error(`The WordPress editor field ${selector} is unavailable`);
        return null;
      }
      const requested = String(value);
      if (element.value === requested) return element;
      element.value = requested;
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
      changed = true;
      return element;
    };
    if (fields.title !== undefined) setValue("#title", fields.title);
    if (fields.content !== undefined) {
      const tiny = root.tinymce?.get?.("content");
      if (tiny?.setContent !== undefined) {
        const current =
          tiny.getContent?.() ??
          document.querySelector<HTMLTextAreaElement>("textarea#content")?.value ??
          "";
        if (current !== fields.content) {
          tiny.setContent(fields.content);
          tiny.save?.();
          changed = true;
        }
      } else {
        setValue("textarea#content", fields.content);
      }
    }
    if (fields.excerpt !== undefined) setValue("#excerpt", fields.excerpt);
    if (fields.slug !== undefined) setValue("#post_name, #new-post-slug", fields.slug);
    if (fields.status !== undefined) setValue("#post_status", fields.status);
    if (fields.categoryIds !== undefined) {
      const requested = new Set(fields.categoryIds.map(String));
      const checkboxes = [
        ...document.querySelectorAll<HTMLInputElement>("#categorychecklist input[type='checkbox']"),
      ];
      if (checkboxes.length === 0) throw new Error("Classic editor categories are unavailable");
      for (const checkbox of checkboxes) {
        const shouldBeChecked = requested.has(checkbox.value);
        if (checkbox.checked === shouldBeChecked) continue;
        checkbox.checked = shouldBeChecked;
        checkbox.dispatchEvent(new Event("change", { bubbles: true }));
        changed = true;
      }
    }
    if (fields.tagIds !== undefined) {
      throw new Error("Classic editor tag IDs are unavailable; use the normal tag-name control");
    }
    if (fields.featuredMediaId !== undefined)
      setValue("#_thumbnail_id", fields.featuredMediaId ?? -1);
    if (fields.authorId !== undefined)
      setValue("#post_author_override, #post_author", fields.authorId);
    if (fields.parentId !== undefined) setValue("#parent_id", fields.parentId);
    if (fields.menuOrder !== undefined) setValue("#menu_order", fields.menuOrder);
    const setOpenCheckbox = (selector: string, value: "open" | "closed"): void => {
      const input = document.querySelector<HTMLInputElement>(selector);
      if (input === null) throw new Error(`The WordPress editor field ${selector} is unavailable`);
      const shouldBeChecked = value === "open";
      if (input.checked === shouldBeChecked) return;
      input.checked = shouldBeChecked;
      input.dispatchEvent(new Event("change", { bubbles: true }));
      changed = true;
    };
    if (fields.commentStatus !== undefined)
      setOpenCheckbox("#comment_status", fields.commentStatus);
    if (fields.pingStatus !== undefined) setOpenCheckbox("#ping_status", fields.pingStatus);
    if (changed) form.setAttribute("data-invictum-wordpress-editor-dirty", "true");
    if (save) {
      if (typeof form.requestSubmit !== "function") {
        return { ok: false, error: "The classic WordPress editor has no safe requestSubmit path" };
      }
      const publish = fields.status === "publish";
      const button =
        document.querySelector<HTMLButtonElement | HTMLInputElement>(
          publish ? "#publish" : "#save-post, #publish",
        ) ?? undefined;
      window.setTimeout(() => form.requestSubmit(button), 0);
    }
    return {
      ok: true,
      editorKind: "classic",
      postId:
        document.querySelector<HTMLInputElement>("#post_ID, input[name='post_ID']")?.value ?? "0",
      postType:
        document.querySelector<HTMLInputElement>("#post_type, input[name='post_type']")?.value ??
        "post",
      status:
        document.querySelector<HTMLSelectElement>("#post_status")?.value ??
        fields.status ??
        "draft",
      changed,
      saved: save,
      publishRequested: fields.status === "publish",
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "WordPress editor update failed",
    };
  }
};

const parseMainRead = (
  value: MainEditorRead | undefined,
): Required<Pick<MainEditorRead, "editorKind" | "postId" | "postType">> & MainEditorRead => {
  if (value?.ok !== true || value.editorKind === undefined || !value.postId || !value.postType) {
    throw new ExtensionCommandError(
      IBP_ERROR_CODES.ELEMENT_NOT_INTERACTABLE,
      value?.error ?? "The page did not expose a supported WordPress editor",
      false,
    );
  }
  return value as Required<Pick<MainEditorRead, "editorKind" | "postId" | "postType">> &
    MainEditorRead;
};

const parseMainEdit = (
  value: MainEditorEdit | undefined,
): Required<
  Pick<
    MainEditorEdit,
    "editorKind" | "postId" | "postType" | "status" | "changed" | "saved" | "publishRequested"
  >
> => {
  if (
    value?.ok !== true ||
    value.editorKind === undefined ||
    !value.postId ||
    !value.postType ||
    value.status === undefined ||
    value.changed === undefined ||
    value.saved === undefined ||
    value.publishRequested === undefined
  ) {
    throw new ExtensionCommandError(
      IBP_ERROR_CODES.ELEMENT_NOT_INTERACTABLE,
      value?.error ?? "The page did not expose a writable WordPress editor",
      false,
    );
  }
  return value as Required<
    Pick<
      MainEditorEdit,
      "editorKind" | "postId" | "postType" | "status" | "changed" | "saved" | "publishRequested"
    >
  >;
};

export class ChromeWordPressEditorAdapter {
  public constructor(private readonly getSnapshot: SnapshotReader) {}

  public async getEditor(
    parameters: GetWordPressEditorParameters,
  ): Promise<GetWordPressEditorData> {
    const tabUrl = await normalPage(parameters.tabId);
    try {
      const snapshot = await this.getSnapshot(parameters.tabId);
      const raw = (
        await chrome.scripting.executeScript({
          target: { tabId: parameters.tabId },
          world: "MAIN",
          func: inspectWordPressEditorMain,
        })
      )[0]?.result as MainEditorRead | undefined;
      const editor = parseMainRead(raw);
      const originalContent = editor.content ?? "";
      const content = originalContent.slice(0, parameters.maxContentChars);
      return GetWordPressEditorDataSchema.parse({
        page: {
          url: snapshot.page.url,
          origin: snapshot.page.origin,
        },
        documentId: snapshot.metadata.documentId,
        domRevision: snapshot.metadata.domRevision,
        editorKind: editor.editorKind,
        postId: editor.postId,
        postType: editor.postType,
        title: editor.title ?? "",
        content,
        contentTruncated: originalContent.length > content.length,
        excerpt: editor.excerpt ?? "",
        slug: editor.slug ?? "",
        status: editor.status ?? "",
        categoryIds: editor.categoryIds ?? [],
        tagIds: editor.tagIds ?? [],
        featuredMediaId: editor.featuredMediaId ?? null,
        authorId: editor.authorId ?? null,
        parentId: editor.parentId ?? null,
        menuOrder: editor.menuOrder ?? null,
        commentStatus: editor.commentStatus,
        pingStatus: editor.pingStatus,
        ...(editor.permalink ? { permalink: sanitizeUrl(editor.permalink) } : {}),
        dirty: editor.dirty ?? false,
        saving: editor.saving ?? false,
        lastSaveSucceeded: editor.lastSaveSucceeded ?? null,
      });
    } catch (error) {
      if (error instanceof ExtensionCommandError) throw error;
      if (isChromePageAccessDenied(error)) {
        throw new ExtensionCommandError(
          IBP_ERROR_CODES.PERMISSION_DENIED,
          pageAccessDeniedMessage(parameters.tabId, tabUrl, "read the WordPress editor"),
          false,
        );
      }
      throw new ExtensionCommandError(
        IBP_ERROR_CODES.BROWSER_API_ERROR,
        "Chrome could not read the WordPress editor model",
        true,
        { cause: error },
      );
    }
  }

  public async editEditor(
    parameters: EditWordPressEditorParameters,
  ): Promise<EditWordPressEditorData> {
    const tabUrl = await normalPage(parameters.tabId);
    const before = await this.getSnapshot(parameters.tabId);
    if (
      before.metadata.documentId !== parameters.documentId ||
      before.metadata.domRevision !== parameters.domRevision
    ) {
      throw new ExtensionCommandError(
        IBP_ERROR_CODES.STALE_ELEMENT_REFERENCE,
        "The requested WordPress editor revision is stale; read the editor again",
        true,
      );
    }
    try {
      const raw = (
        await chrome.scripting.executeScript({
          target: { tabId: parameters.tabId },
          world: "MAIN",
          func: editWordPressEditorMain,
          args: [parameters.fields, parameters.save],
        })
      )[0]?.result as MainEditorEdit | undefined;
      const edited = parseMainEdit(raw);
      await Promise.resolve();
      let after: PageSnapshot | undefined;
      try {
        after = await this.getSnapshot(parameters.tabId);
      } catch {
        if (!parameters.save) throw new Error("The page disappeared before edit verification");
      }
      const tab = await chrome.tabs.get(parameters.tabId).catch(() => undefined);
      const urlAfter = sanitizeUrl(tab?.pendingUrl ?? tab?.url ?? before.page.url);
      return EditWordPressEditorDataSchema.parse({
        page: {
          urlBefore: before.page.url,
          urlAfter,
          origin: before.page.origin,
        },
        documentId: before.metadata.documentId,
        domRevisionBefore: before.metadata.domRevision,
        domRevisionAfter:
          after?.metadata.domRevision ??
          Math.min(Number.MAX_SAFE_INTEGER, before.metadata.domRevision + 1),
        editorKind: edited.editorKind,
        postId: edited.postId,
        postType: edited.postType,
        fieldNames: Object.keys(parameters.fields),
        status: edited.status,
        changed: edited.changed,
        saved: edited.saved,
        publishRequested: edited.publishRequested,
        verificationRequired: edited.saved,
        requiresNewSnapshot: true,
      });
    } catch (error) {
      if (error instanceof ExtensionCommandError) throw error;
      if (isChromePageAccessDenied(error)) {
        throw new ExtensionCommandError(
          IBP_ERROR_CODES.PERMISSION_DENIED,
          pageAccessDeniedMessage(parameters.tabId, tabUrl, "edit the WordPress editor"),
          false,
        );
      }
      throw new ExtensionCommandError(
        IBP_ERROR_CODES.BROWSER_API_ERROR,
        "Chrome could not update the WordPress editor model",
        true,
        { cause: error },
      );
    }
  }
}
