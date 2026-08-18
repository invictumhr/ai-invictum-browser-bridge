import type {
  GetWordPressAdminData,
  GetWordPressAdminParameters,
  WordPressListTableActionParameters,
} from "@invictum/protocol";

type ListTable = NonNullable<GetWordPressAdminData["listTable"]>;
type ListRow = ListTable["rows"][number];
type ListAction = ListRow["actions"][number];

const ACTION_KEY_PATTERN = /^[A-Za-z0-9_.:-]+$/;
const DESTRUCTIVE_ACTIONS = new Set([
  "delete",
  "delete-selected",
  "trash",
  "spam",
  "remove",
  "force-delete",
]);

export class WordPressAdminContentError extends Error {
  public constructor(
    public readonly code:
      "ELEMENT_NOT_INTERACTABLE" | "INVALID_MESSAGE" | "POLICY_DENIED" | "STALE_ELEMENT_REFERENCE",
    message: string,
    public readonly retryable: boolean,
  ) {
    super(message);
    this.name = "WordPressAdminContentError";
  }
}

const cleanText = (value: string | null | undefined, max: number): string =>
  (value ?? "").replace(/\s+/gu, " ").trim().slice(0, max);

const queryValue = (name: string): string => {
  try {
    return new URL(location.href).searchParams.get(name)?.slice(0, 256) ?? "";
  } catch {
    return "";
  }
};

const columnKey = (element: Element, fallback: string): string => {
  if (element.id.length > 0) return element.id.slice(0, 128);
  for (const className of element.classList) {
    if (className.startsWith("column-")) return className.slice(7, 135);
  }
  return fallback;
};

const rowId = (row: HTMLTableRowElement, index: number): string => {
  if (row.id.length > 0) return row.id.slice(0, 512);
  const plugin = row.getAttribute("data-plugin");
  if (plugin !== null && plugin.length > 0) return `plugin:${plugin}`.slice(0, 512);
  const checkbox = row.querySelector<HTMLInputElement>('input[type="checkbox"]');
  if (checkbox?.value) return `value:${checkbox.value}`.slice(0, 512);
  return `row:${index}`;
};

const actionKey = (anchor: HTMLAnchorElement): string => {
  const container = anchor.closest<HTMLElement>(".row-actions > span");
  const classKey = [...(container?.classList ?? [])].find((value) =>
    ACTION_KEY_PATTERN.test(value),
  );
  if (classKey !== undefined) return classKey;
  const dataAction = anchor.dataset["action"];
  if (dataAction !== undefined && ACTION_KEY_PATTERN.test(dataAction)) return dataAction;
  try {
    const key = new URL(anchor.href, document.baseURI).searchParams.get("action");
    if (key !== null && ACTION_KEY_PATTERN.test(key)) return key;
  } catch {
    // The URL is validated again before it is followed.
  }
  const normalized = cleanText(anchor.textContent, 128)
    .toLocaleLowerCase()
    .replace(/\s+/gu, "-")
    .replace(/[^a-z0-9_.:-]/gu, "");
  return normalized.length > 0 ? normalized : "action";
};

const isDestructiveAction = (key: string): boolean => {
  const normalized = key.toLocaleLowerCase();
  return (
    DESTRUCTIVE_ACTIONS.has(normalized) ||
    /(?:^|[-_.:])(?:delete|trash|spam|remove|destroy|erase|reset)(?:$|[-_.:])/u.test(normalized)
  );
};

const publicAction = (key: string, label: string): ListAction => ({
  key,
  label: cleanText(label, 500),
  destructive: isDestructiveAction(key),
});

const rowActions = (row: HTMLTableRowElement): ListAction[] => {
  const actions: ListAction[] = [];
  const seen = new Set<string>();
  for (const anchor of row.querySelectorAll<HTMLAnchorElement>(".row-actions a")) {
    const key = actionKey(anchor);
    if (seen.has(key)) continue;
    seen.add(key);
    actions.push(publicAction(key, anchor.textContent ?? ""));
    if (actions.length >= 50) break;
  }
  return actions;
};

const bulkActions = (table: HTMLTableElement): ListAction[] => {
  const form = table.closest("form") ?? document;
  const select =
    form.querySelector<HTMLSelectElement>("#bulk-action-selector-top") ??
    form.querySelector<HTMLSelectElement>('select[name="action"]');
  if (select === null) return [];
  return [...select.options]
    .filter((option) => option.value.length > 0 && option.value !== "-1")
    .slice(0, 100)
    .map((option) => publicAction(option.value.slice(0, 128), option.textContent ?? ""));
};

const readListTable = (
  maxRows: number,
  maxCellText: number,
): GetWordPressAdminData["listTable"] => {
  const table = document.querySelector<HTMLTableElement>("table.wp-list-table");
  if (table === null) return null;
  const headerCells = [...table.querySelectorAll<HTMLTableCellElement>("thead tr:first-child th")];
  const columns = headerCells
    .filter((cell) => !cell.classList.contains("check-column"))
    .slice(0, 100)
    .map((cell, index) => ({
      key: columnKey(cell, `column-${index}`),
      label: cleanText(cell.textContent, 500),
    }));
  const sourceRows = [...table.querySelectorAll<HTMLTableRowElement>("tbody > tr")];
  const rows: ListRow[] = sourceRows.slice(0, maxRows).map((row, index) => {
    const cells = [...row.querySelectorAll<HTMLTableCellElement>("th,td")].filter(
      (cell) => !cell.classList.contains("check-column"),
    );
    const checkbox = row.querySelector<HTMLInputElement>('input[type="checkbox"]');
    const primary =
      row.querySelector<HTMLElement>(
        ".column-primary .row-title, .column-primary strong, .plugin-title strong, .row-title",
      ) ?? cells[0];
    return {
      rowId: rowId(row, index),
      primaryText: cleanText(primary?.textContent, 2_000),
      status: cleanText(row.querySelector(".post-state, .status")?.textContent, 256),
      selected: checkbox?.checked === true,
      columns: cells.slice(0, 100).map((cell, cellIndex) => ({
        key: columnKey(cell, columns[cellIndex]?.key ?? `column-${cellIndex}`),
        text: cleanText(cell.textContent, maxCellText),
      })),
      actions: rowActions(row),
    };
  });
  return {
    tableId: table.id.slice(0, 256),
    columns,
    rows,
    rowCount: sourceRows.length,
    truncated: sourceRows.length > maxRows,
    bulkActions: bulkActions(table),
  };
};

const noticeKind = (element: Element): "info" | "success" | "warning" | "error" => {
  if (element.classList.contains("notice-error") || element.classList.contains("error"))
    return "error";
  if (element.classList.contains("notice-warning") || element.classList.contains("update-nag"))
    return "warning";
  if (element.classList.contains("notice-success") || element.classList.contains("updated"))
    return "success";
  return "info";
};

const editorKind = (): "none" | "block" | "classic" => {
  if (
    document.body.classList.contains("block-editor-page") ||
    document.querySelector(".block-editor, .edit-post-layout, .editor-styles-wrapper") !== null
  )
    return "block";
  if (document.querySelector("form#post, #poststuff #title, textarea#content") !== null)
    return "classic";
  return "none";
};

export const inspectWordPressAdmin = (
  parameters: GetWordPressAdminParameters,
): Omit<GetWordPressAdminData, "page" | "documentId" | "domRevision"> => {
  if (
    !document.body.classList.contains("wp-admin") &&
    !location.pathname.toLocaleLowerCase().includes("/wp-admin/")
  ) {
    throw new WordPressAdminContentError(
      "ELEMENT_NOT_INTERACTABLE",
      "The current page is not a WordPress administration screen",
      false,
    );
  }
  const notices = [
    ...document.querySelectorAll<HTMLElement>(
      ".wrap > .notice, .wrap > .updated, .wrap > .error, .wrap > .update-nag, #wpbody-content > .notice",
    ),
  ]
    .slice(0, 100)
    .map((notice) => ({
      kind: noticeKind(notice),
      text: cleanText(notice.textContent, 4_000),
      dismissible:
        notice.classList.contains("is-dismissible") ||
        notice.querySelector(".notice-dismiss") !== null,
    }));
  return {
    screen: {
      pageTitle: cleanText(document.title, 1_000),
      heading: cleanText(
        document.querySelector<HTMLElement>("h1.wp-heading-inline, .wrap > h1")?.textContent,
        1_000,
      ),
      pageSlug: queryValue("page"),
      postType:
        document
          .querySelector<HTMLInputElement>("#post_type, input[name='post_type']")
          ?.value.slice(0, 128) ?? queryValue("post_type"),
      taxonomy: queryValue("taxonomy"),
      editorKind: editorKind(),
    },
    adminBar: {
      present: document.querySelector("#wpadminbar") !== null,
      siteName: cleanText(
        document.querySelector<HTMLElement>("#wp-admin-bar-site-name > a")?.textContent,
        1_000,
      ),
    },
    notices,
    listTable: readListTable(parameters.maxRows, parameters.maxCellText),
  };
};

const findRow = (id: string): HTMLTableRowElement => {
  const rows = [
    ...document.querySelectorAll<HTMLTableRowElement>("table.wp-list-table tbody > tr"),
  ];
  const match = rows.find((row, index) => rowId(row, index) === id);
  if (match === undefined) {
    throw new WordPressAdminContentError(
      "STALE_ELEMENT_REFERENCE",
      `WordPress list-table row ${id} is no longer available`,
      true,
    );
  }
  return match;
};

const setChecked = (input: HTMLInputElement, checked: boolean): void => {
  const owner = input.ownerDocument.defaultView ?? window;
  const setter = Object.getOwnPropertyDescriptor(owner.HTMLInputElement.prototype, "checked")?.set;
  if (setter === undefined) {
    throw new WordPressAdminContentError(
      "ELEMENT_NOT_INTERACTABLE",
      "WordPress list-table checkbox is not writable",
      false,
    );
  }
  setter.call(input, checked);
  input.dispatchEvent(new owner.Event("input", { bubbles: true }));
  input.dispatchEvent(new owner.Event("change", { bubbles: true }));
};

export interface WordPressListActionResult {
  operation: WordPressListTableActionParameters["operation"];
  rowIds: string[];
  actionKey: string;
  destructive: boolean;
}

export const performWordPressListTableAction = (
  parameters: WordPressListTableActionParameters,
): WordPressListActionResult => {
  if (parameters.operation === "open_row_action") {
    const row = findRow(parameters.rowId);
    const anchor = [...row.querySelectorAll<HTMLAnchorElement>(".row-actions a")].find(
      (candidate) => actionKey(candidate) === parameters.actionKey,
    );
    if (anchor === undefined) {
      throw new WordPressAdminContentError(
        "STALE_ELEMENT_REFERENCE",
        `WordPress row action ${parameters.actionKey} is no longer available`,
        true,
      );
    }
    let url: URL;
    try {
      url = new URL(anchor.href, document.baseURI);
    } catch {
      throw new WordPressAdminContentError(
        "POLICY_DENIED",
        "WordPress row actions require a normal HTTP(S) URL",
        false,
      );
    }
    if (!["http:", "https:"].includes(url.protocol)) {
      throw new WordPressAdminContentError(
        "POLICY_DENIED",
        "WordPress row actions cannot execute script or non-HTTP(S) URLs",
        false,
      );
    }
    if (url.origin !== location.origin) {
      throw new WordPressAdminContentError(
        "POLICY_DENIED",
        "WordPress row actions must remain on the current wp-admin origin",
        false,
      );
    }
    window.setTimeout(() => anchor.click(), 0);
    return {
      operation: parameters.operation,
      rowIds: [parameters.rowId],
      actionKey: parameters.actionKey,
      destructive: isDestructiveAction(parameters.actionKey),
    };
  }

  const table = document.querySelector<HTMLTableElement>("table.wp-list-table");
  const form = table?.closest<HTMLFormElement>("form");
  if (table === null || table === undefined || form === null || form === undefined) {
    throw new WordPressAdminContentError(
      "ELEMENT_NOT_INTERACTABLE",
      "The WordPress list table is not inside a bulk-action form",
      false,
    );
  }
  const select =
    form.querySelector<HTMLSelectElement>("#bulk-action-selector-top") ??
    form.querySelector<HTMLSelectElement>('select[name="action"]');
  const option = [...(select?.options ?? [])].find(
    (candidate) => candidate.value === parameters.actionKey,
  );
  if (select === null || option === undefined || option.value === "-1") {
    throw new WordPressAdminContentError(
      "STALE_ELEMENT_REFERENCE",
      `WordPress bulk action ${parameters.actionKey} is no longer available`,
      true,
    );
  }
  const requestedRows = parameters.rowIds.map(findRow);
  for (const row of [
    ...form.querySelectorAll<HTMLTableRowElement>("table.wp-list-table tbody > tr"),
  ]) {
    const checkbox = row.querySelector<HTMLInputElement>('input[type="checkbox"]');
    if (checkbox !== null) setChecked(checkbox, requestedRows.includes(row));
  }
  select.value = option.value;
  select.dispatchEvent(new Event("change", { bubbles: true }));
  const submitter =
    form.querySelector<HTMLButtonElement | HTMLInputElement>("#doaction") ??
    form.querySelector<HTMLButtonElement | HTMLInputElement>(
      'button[name="doaction"], input[name="doaction"]',
    );
  if (typeof form.requestSubmit !== "function") {
    throw new WordPressAdminContentError(
      "ELEMENT_NOT_INTERACTABLE",
      "The WordPress bulk-action form has no safe requestSubmit path",
      false,
    );
  }
  window.setTimeout(() => form.requestSubmit(submitter ?? undefined), 0);
  return {
    operation: parameters.operation,
    rowIds: parameters.rowIds,
    actionKey: parameters.actionKey,
    destructive: isDestructiveAction(parameters.actionKey),
  };
};
