import type { EditWordPressMenuParameters, GetWordPressMenuData } from "@invictum/protocol";

const DIRTY_ATTRIBUTE = "data-invictum-wordpress-menu-dirty";
const ITEM_ID_PATTERN = /^-?\d+$/;
const DEPTH_CLASS_PATTERN = /^menu-item-depth-\d+$/;

type MenuOperation = EditWordPressMenuParameters["operations"][number];
type MenuDestination = Extract<MenuOperation, { type: "move" }>["destination"];
type MenuItemData = GetWordPressMenuData["items"][number];

export class WordPressMenuContentError extends Error {
  public constructor(
    public readonly code:
      "ELEMENT_NOT_INTERACTABLE" | "INVALID_MESSAGE" | "POLICY_DENIED" | "STALE_ELEMENT_REFERENCE",
    message: string,
    public readonly retryable: boolean,
  ) {
    super(message);
    this.name = "WordPressMenuContentError";
  }
}

interface MenuContext {
  form: HTMLFormElement;
  list: HTMLElement;
  menuId: string;
  menuNameInput?: HTMLInputElement;
}

interface MenuNode {
  itemId: string;
  element?: HTMLLIElement;
  parent?: MenuNode;
  children: MenuNode[];
  label: string;
  url?: string;
  titleAttribute: string;
  cssClasses: string;
  description: string;
  openInNewTab: boolean;
  type: string;
  object: string;
  added: boolean;
}

interface MenuTree {
  context: MenuContext;
  roots: MenuNode[];
  byId: Map<string, MenuNode>;
}

export interface WordPressMenuInspection {
  menuId: string;
  menuName: string;
  items: MenuItemData[];
  itemCount: number;
  truncated: boolean;
  dirty: boolean;
}

export interface WordPressMenuEditResult {
  menuId: string;
  menuName: string;
  operationTypes: Array<MenuOperation["type"]>;
  affectedItemIds: string[];
  items: MenuItemData[];
  itemCount: number;
  changed: boolean;
  submitted: boolean;
}

const inputValue = (root: ParentNode, selector: string): string =>
  root.querySelector<HTMLInputElement>(selector)?.value ?? "";

const findMenuContext = (): MenuContext => {
  const form = document.querySelector<HTMLFormElement>("form#update-nav-menu");
  const list = form?.querySelector<HTMLElement>("#menu-to-edit");
  if (form === null || list === null || list === undefined) {
    throw new WordPressMenuContentError(
      "ELEMENT_NOT_INTERACTABLE",
      "The current page is not the classic WordPress navigation-menu editor",
      false,
    );
  }
  const action = form.querySelector<HTMLInputElement>('input[name="action"]')?.value;
  if (action !== undefined && !["update", "update-nav-menu"].includes(action)) {
    throw new WordPressMenuContentError(
      "ELEMENT_NOT_INTERACTABLE",
      "The detected form is not a WordPress navigation-menu update form",
      false,
    );
  }
  const menuId =
    form.querySelector<HTMLInputElement>('input[name="menu"]')?.value ??
    form.querySelector<HTMLSelectElement>('select[name="menu"]')?.value ??
    "";
  if (menuId.length === 0 || menuId.length > 128) {
    throw new WordPressMenuContentError(
      "ELEMENT_NOT_INTERACTABLE",
      "The WordPress menu identifier is unavailable",
      true,
    );
  }
  return {
    form,
    list,
    menuId,
    menuNameInput:
      form.querySelector<HTMLInputElement>("#menu-name") ??
      form.querySelector<HTMLInputElement>('input[name="menu-name"]') ??
      undefined,
  };
};

const itemIdFromElement = (element: HTMLLIElement): string => {
  const fromId = element.id.match(/^menu-item-(-?\d+)$/)?.[1];
  if (fromId !== undefined) return fromId;
  for (const input of element.querySelectorAll<HTMLInputElement>('input[name*="["]')) {
    const key = input.name.match(/\[(-?\d+)\]$/)?.[1];
    if (key !== undefined) return key;
  }
  throw new WordPressMenuContentError(
    "ELEMENT_NOT_INTERACTABLE",
    "A WordPress menu item has no stable numeric identifier",
    true,
  );
};

const itemDepth = (element: HTMLLIElement): number => {
  for (const className of element.classList) {
    const match = className.match(/^menu-item-depth-(\d+)$/);
    if (match?.[1] !== undefined) return Number(match[1]);
  }
  return 0;
};

const directMenuItems = (list: HTMLElement): HTMLLIElement[] =>
  [...list.children].filter(
    (element): element is HTMLLIElement =>
      element instanceof HTMLLIElement && element.classList.contains("menu-item"),
  );

const buildTree = (): MenuTree => {
  const context = findMenuContext();
  const roots: MenuNode[] = [];
  const byId = new Map<string, MenuNode>();
  const stack: MenuNode[] = [];
  for (const element of directMenuItems(context.list)) {
    const itemId = itemIdFromElement(element);
    if (!ITEM_ID_PATTERN.test(itemId) || byId.has(itemId)) {
      throw new WordPressMenuContentError(
        "ELEMENT_NOT_INTERACTABLE",
        "WordPress menu item identifiers are invalid or duplicated",
        true,
      );
    }
    const depth = itemDepth(element);
    if (depth > stack.length) {
      throw new WordPressMenuContentError(
        "ELEMENT_NOT_INTERACTABLE",
        "The WordPress menu contains an invalid depth jump",
        true,
      );
    }
    const node: MenuNode = {
      itemId,
      element,
      children: [],
      label:
        inputValue(element, ".edit-menu-item-title") ||
        element.querySelector<HTMLElement>(".menu-item-title")?.innerText.trim() ||
        "",
      url: inputValue(element, ".edit-menu-item-url") || undefined,
      titleAttribute: inputValue(element, ".edit-menu-item-attr-title"),
      cssClasses: inputValue(element, ".edit-menu-item-classes"),
      description: inputValue(element, ".edit-menu-item-description"),
      openInNewTab:
        element.querySelector<HTMLInputElement>(".edit-menu-item-target")?.checked === true,
      type: inputValue(element, ".menu-item-data-type") || "unknown",
      object: inputValue(element, ".menu-item-data-object") || "unknown",
      added: false,
    };
    if (depth === 0) {
      roots.push(node);
    } else {
      const parent = stack[depth - 1];
      if (parent === undefined) {
        throw new WordPressMenuContentError(
          "ELEMENT_NOT_INTERACTABLE",
          "The WordPress menu item parent is unavailable",
          true,
        );
      }
      node.parent = parent;
      parent.children.push(node);
    }
    stack.length = depth;
    stack[depth] = node;
    byId.set(itemId, node);
  }
  return { context, roots, byId };
};

const flattenTree = (roots: readonly MenuNode[]): Array<{ node: MenuNode; depth: number }> => {
  const flat: Array<{ node: MenuNode; depth: number }> = [];
  const visit = (node: MenuNode, depth: number): void => {
    flat.push({ node, depth });
    for (const child of node.children) visit(child, depth + 1);
  };
  for (const root of roots) visit(root, 0);
  return flat;
};

const publicItems = (tree: MenuTree, maxItems: number): MenuItemData[] => {
  const flat = flattenTree(tree.roots);
  return flat.slice(0, maxItems).map(({ node, depth }, position) => ({
    itemId: node.itemId,
    parentItemId: node.parent?.itemId ?? null,
    depth,
    position,
    label: node.label.slice(0, 1_000),
    type: node.type.slice(0, 128),
    object: node.object.slice(0, 128),
    ...(node.url === undefined ? {} : { url: node.url.slice(0, 4_096) }),
    openInNewTab: node.openInNewTab,
    childCount: node.children.length,
  }));
};

export const inspectWordPressMenu = (maxItems: number): WordPressMenuInspection => {
  const tree = buildTree();
  const itemCount = tree.byId.size;
  return {
    menuId: tree.context.menuId,
    menuName: tree.context.menuNameInput?.value.slice(0, 1_000) ?? "",
    items: publicItems(tree, maxItems),
    itemCount,
    truncated: itemCount > maxItems,
    dirty: tree.context.form.getAttribute(DIRTY_ATTRIBUTE) === "true",
  };
};

const assertSafeMenuUrl = (rawUrl: string): void => {
  const trimmed = rawUrl.trim();
  if (trimmed.startsWith("#")) return;
  let parsed: URL;
  try {
    parsed = new URL(trimmed, document.baseURI);
  } catch {
    throw new WordPressMenuContentError(
      "POLICY_DENIED",
      "WordPress menu URLs must be valid relative, fragment, HTTP, or HTTPS URLs",
      false,
    );
  }
  if (
    !["http:", "https:"].includes(parsed.protocol) ||
    parsed.username.length > 0 ||
    parsed.password.length > 0
  ) {
    throw new WordPressMenuContentError(
      "POLICY_DENIED",
      "WordPress menu URLs must be credential-free HTTP(S), relative, or fragment URLs",
      false,
    );
  }
};

const rootCollection = (tree: MenuTree, node: MenuNode): MenuNode[] =>
  node.parent?.children ?? tree.roots;

const isDescendant = (possibleDescendant: MenuNode, node: MenuNode): boolean => {
  let current: MenuNode | undefined = possibleDescendant.parent;
  while (current !== undefined) {
    if (current === node) return true;
    current = current.parent;
  }
  return false;
};

const detachNode = (tree: MenuTree, node: MenuNode): void => {
  const collection = rootCollection(tree, node);
  const index = collection.indexOf(node);
  if (index < 0) {
    throw new WordPressMenuContentError(
      "STALE_ELEMENT_REFERENCE",
      `WordPress menu item ${node.itemId} is no longer in the menu tree`,
      true,
    );
  }
  collection.splice(index, 1);
  node.parent = undefined;
};

const insertAtDestination = (
  tree: MenuTree,
  node: MenuNode,
  destination: MenuDestination,
): void => {
  if (destination.placement === "root_start" || destination.placement === "root_end") {
    node.parent = undefined;
    if (destination.placement === "root_start") tree.roots.unshift(node);
    else tree.roots.push(node);
    return;
  }
  if (!("targetItemId" in destination)) {
    throw new WordPressMenuContentError(
      "INVALID_MESSAGE",
      "A nested WordPress menu destination requires a target item",
      false,
    );
  }
  const target = tree.byId.get(destination.targetItemId);
  if (target === undefined) {
    throw new WordPressMenuContentError(
      "STALE_ELEMENT_REFERENCE",
      `WordPress menu target ${destination.targetItemId} does not exist`,
      true,
    );
  }
  if (target === node || isDescendant(target, node)) {
    throw new WordPressMenuContentError(
      "ELEMENT_NOT_INTERACTABLE",
      "A WordPress menu item cannot be moved into itself or its descendant",
      false,
    );
  }
  if (destination.placement === "inside_start" || destination.placement === "inside_end") {
    node.parent = target;
    if (destination.placement === "inside_start") target.children.unshift(node);
    else target.children.push(node);
    return;
  }
  const collection = rootCollection(tree, target);
  const targetIndex = collection.indexOf(target);
  if (targetIndex < 0) {
    throw new WordPressMenuContentError(
      "STALE_ELEMENT_REFERENCE",
      `WordPress menu target ${target.itemId} is no longer in the menu tree`,
      true,
    );
  }
  node.parent = target.parent;
  collection.splice(targetIndex + (destination.placement === "after" ? 1 : 0), 0, node);
};

const nextTemporaryItemId = (tree: MenuTree): string => {
  let candidate = -1;
  while (tree.byId.has(String(candidate))) candidate -= 1;
  return String(candidate);
};

const collectSubtreeIds = (node: MenuNode): string[] => [
  node.itemId,
  ...node.children.flatMap(collectSubtreeIds),
];

const applyToModel = (
  tree: MenuTree,
  operation: MenuOperation,
): { affected: string[]; changed: boolean } => {
  if (operation.type === "add_custom") {
    assertSafeMenuUrl(operation.url);
    const itemId = nextTemporaryItemId(tree);
    const node: MenuNode = {
      itemId,
      children: [],
      label: operation.label,
      url: operation.url,
      titleAttribute: operation.titleAttribute,
      cssClasses: operation.cssClasses,
      description: operation.description,
      openInNewTab: operation.openInNewTab,
      type: "custom",
      object: "custom",
      added: true,
    };
    tree.byId.set(itemId, node);
    insertAtDestination(tree, node, operation.destination);
    return { affected: [itemId], changed: true };
  }
  const node = tree.byId.get(operation.itemId);
  if (node === undefined) {
    throw new WordPressMenuContentError(
      "STALE_ELEMENT_REFERENCE",
      `WordPress menu item ${operation.itemId} does not exist`,
      true,
    );
  }
  if (operation.type === "update") {
    const requiredControls: Array<[unknown, string]> = [
      [operation.label, ".edit-menu-item-title"],
      [operation.url, ".edit-menu-item-url"],
      [operation.titleAttribute, ".edit-menu-item-attr-title"],
      [operation.cssClasses, ".edit-menu-item-classes"],
      [operation.description, ".edit-menu-item-description"],
      [operation.openInNewTab, ".edit-menu-item-target"],
    ];
    for (const [value, selector] of requiredControls) {
      if (value !== undefined && node.element?.querySelector(selector) === null) {
        throw new WordPressMenuContentError(
          "ELEMENT_NOT_INTERACTABLE",
          `WordPress menu item ${node.itemId} does not expose the requested editable setting`,
          false,
        );
      }
    }
    if (operation.url !== undefined) {
      if (node.type !== "custom") {
        throw new WordPressMenuContentError(
          "ELEMENT_NOT_INTERACTABLE",
          "Only custom WordPress menu items expose an editable URL",
          false,
        );
      }
      assertSafeMenuUrl(operation.url);
    }
    let changed = false;
    const update = <K extends keyof MenuNode>(key: K, value: MenuNode[K] | undefined): void => {
      if (value !== undefined && node[key] !== value) {
        node[key] = value;
        changed = true;
      }
    };
    update("label", operation.label);
    update("url", operation.url);
    update("titleAttribute", operation.titleAttribute);
    update("cssClasses", operation.cssClasses);
    update("description", operation.description);
    update("openInNewTab", operation.openInNewTab);
    return { affected: [node.itemId], changed };
  }
  if (operation.type === "move") {
    detachNode(tree, node);
    insertAtDestination(tree, node, operation.destination);
    return { affected: collectSubtreeIds(node), changed: true };
  }
  const originalCollection = rootCollection(tree, node);
  const originalIndex = originalCollection.indexOf(node);
  const originalParent = node.parent;
  detachNode(tree, node);
  const affected = operation.includeChildren ? collectSubtreeIds(node) : [node.itemId];
  if (operation.includeChildren) {
    for (const itemId of affected) tree.byId.delete(itemId);
  } else {
    for (const child of node.children) child.parent = originalParent;
    originalCollection.splice(originalIndex, 0, ...node.children);
    tree.byId.delete(node.itemId);
  }
  return { affected, changed: true };
};

const setNativeInputValue = (
  input: HTMLInputElement | HTMLTextAreaElement,
  value: string,
): void => {
  const owner = input.ownerDocument.defaultView ?? window;
  const prototype =
    input instanceof owner.HTMLTextAreaElement
      ? owner.HTMLTextAreaElement.prototype
      : owner.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  if (setter === undefined) {
    throw new WordPressMenuContentError(
      "ELEMENT_NOT_INTERACTABLE",
      "A WordPress menu setting is not writable",
      false,
    );
  }
  setter.call(input, value);
  input.dispatchEvent(new owner.Event("input", { bubbles: true }));
  input.dispatchEvent(new owner.Event("change", { bubbles: true }));
};

const setNativeChecked = (input: HTMLInputElement, checked: boolean): void => {
  const owner = input.ownerDocument.defaultView ?? window;
  const setter = Object.getOwnPropertyDescriptor(owner.HTMLInputElement.prototype, "checked")?.set;
  if (setter === undefined) {
    throw new WordPressMenuContentError(
      "ELEMENT_NOT_INTERACTABLE",
      "A WordPress menu checkbox is not writable",
      false,
    );
  }
  setter.call(input, checked);
  input.dispatchEvent(new owner.Event("change", { bubbles: true }));
};

const hiddenInput = (
  ownerDocument: Document,
  className: string,
  name: string,
  value: string,
): HTMLInputElement => {
  const input = ownerDocument.createElement("input");
  input.type = "hidden";
  input.className = className;
  input.name = name;
  input.value = value;
  return input;
};

const labelledTextInput = (
  ownerDocument: Document,
  labelText: string,
  className: string,
  name: string,
  value: string,
): HTMLLabelElement => {
  const label = ownerDocument.createElement("label");
  label.textContent = labelText;
  const input = ownerDocument.createElement("input");
  input.type = "text";
  input.className = className;
  input.name = name;
  input.value = value;
  label.append(input);
  return label;
};

const createCustomMenuElement = (node: MenuNode, ownerDocument: Document): HTMLLIElement => {
  const itemId = node.itemId;
  const element = ownerDocument.createElement("li");
  element.id = `menu-item-${itemId}`;
  element.className = "menu-item menu-item-custom menu-item-edit-inactive menu-item-depth-0";

  const bar = ownerDocument.createElement("div");
  bar.className = "menu-item-bar";
  const handle = ownerDocument.createElement("div");
  handle.className = "menu-item-handle";
  const itemTitle = ownerDocument.createElement("span");
  itemTitle.className = "item-title";
  const title = ownerDocument.createElement("span");
  title.className = "menu-item-title";
  title.textContent = node.label;
  itemTitle.append(title);
  const itemType = ownerDocument.createElement("span");
  itemType.className = "item-controls";
  itemType.textContent = "Custom Link";
  handle.append(itemTitle, itemType);
  bar.append(handle);

  const settings = ownerDocument.createElement("div");
  settings.className = "menu-item-settings";
  settings.id = `menu-item-settings-${itemId}`;
  settings.append(
    labelledTextInput(
      ownerDocument,
      "Navigacijska oznaka",
      "widefat edit-menu-item-title",
      `menu-item-title[${itemId}]`,
      node.label,
    ),
    labelledTextInput(
      ownerDocument,
      "URL",
      "widefat code edit-menu-item-url",
      `menu-item-url[${itemId}]`,
      node.url ?? "",
    ),
    labelledTextInput(
      ownerDocument,
      "Atribut naslova",
      "widefat edit-menu-item-attr-title",
      `menu-item-attr-title[${itemId}]`,
      node.titleAttribute,
    ),
    labelledTextInput(
      ownerDocument,
      "CSS klase",
      "widefat code edit-menu-item-classes",
      `menu-item-classes[${itemId}]`,
      node.cssClasses,
    ),
  );
  const description = ownerDocument.createElement("textarea");
  description.className = "widefat edit-menu-item-description";
  description.name = `menu-item-description[${itemId}]`;
  description.value = node.description;
  settings.append(description);
  const targetLabel = ownerDocument.createElement("label");
  const target = ownerDocument.createElement("input");
  target.type = "checkbox";
  target.className = "edit-menu-item-target";
  target.name = `menu-item-target[${itemId}]`;
  target.value = "_blank";
  target.checked = node.openInNewTab;
  targetLabel.append(target, " Open link in a new tab");
  settings.append(targetLabel);

  settings.append(
    hiddenInput(ownerDocument, "menu-item-data-db-id", `menu-item-db-id[${itemId}]`, "0"),
    hiddenInput(ownerDocument, "menu-item-data-object-id", `menu-item-object-id[${itemId}]`, "0"),
    hiddenInput(ownerDocument, "menu-item-data-object", `menu-item-object[${itemId}]`, "custom"),
    hiddenInput(ownerDocument, "menu-item-data-parent-id", `menu-item-parent-id[${itemId}]`, "0"),
    hiddenInput(ownerDocument, "menu-item-data-position", `menu-item-position[${itemId}]`, "0"),
    hiddenInput(ownerDocument, "menu-item-data-type", `menu-item-type[${itemId}]`, "custom"),
  );
  element.append(bar, settings);
  return element;
};

const updateExistingElement = (node: MenuNode): void => {
  const element = node.element;
  if (element === undefined) return;
  const setText = (selector: string, value: string | undefined): void => {
    const input = element.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector);
    if (input !== null && value !== undefined && input.value !== value) {
      setNativeInputValue(input, value);
    }
  };
  setText(".edit-menu-item-title", node.label);
  setText(".edit-menu-item-url", node.url);
  setText(".edit-menu-item-attr-title", node.titleAttribute);
  setText(".edit-menu-item-classes", node.cssClasses);
  setText(".edit-menu-item-description", node.description);
  const target = element.querySelector<HTMLInputElement>(".edit-menu-item-target");
  if (target !== null && target.checked !== node.openInNewTab) {
    setNativeChecked(target, node.openInNewTab);
  }
  const visibleTitle = element.querySelector<HTMLElement>(".menu-item-title");
  if (visibleTitle !== null) visibleTitle.textContent = node.label;
};

export const serializeWordPressMenuPosition = (zeroBasedPosition: number): string => {
  if (!Number.isSafeInteger(zeroBasedPosition) || zeroBasedPosition < 0) {
    throw new WordPressMenuContentError(
      "INVALID_MESSAGE",
      "A WordPress menu position must be a non-negative integer",
      false,
    );
  }
  // WordPress treats position 0 as unspecified and appends that item. The
  // browser-facing tree remains zero-based, but the submitted form is 1-based.
  return String(zeroBasedPosition + 1);
};

const applyTreeToDom = (tree: MenuTree): void => {
  const flat = flattenTree(tree.roots);
  const surviving = new Set(flat.map(({ node }) => node));
  for (const element of directMenuItems(tree.context.list)) {
    const item = [...tree.byId.values()].find((node) => node.element === element);
    if (item === undefined || !surviving.has(item)) element.remove();
  }
  for (const [position, { node, depth }] of flat.entries()) {
    if (node.element === undefined) {
      node.element = createCustomMenuElement(node, tree.context.list.ownerDocument);
    }
    updateExistingElement(node);
    for (const className of [...node.element.classList]) {
      if (DEPTH_CLASS_PATTERN.test(className)) node.element.classList.remove(className);
    }
    node.element.classList.add(`menu-item-depth-${depth}`);
    const parentInput = node.element.querySelector<HTMLInputElement>(".menu-item-data-parent-id");
    if (parentInput !== null) parentInput.value = node.parent?.itemId ?? "0";
    const positionInput =
      node.element.querySelector<HTMLInputElement>(".menu-item-data-position") ??
      hiddenInput(
        node.element.ownerDocument,
        "menu-item-data-position",
        `menu-item-position[${node.itemId}]`,
        serializeWordPressMenuPosition(position),
      );
    positionInput.value = serializeWordPressMenuPosition(position);
    if (!positionInput.isConnected) node.element.append(positionInput);
    tree.context.list.append(node.element);
  }
  tree.context.list.dispatchEvent(new Event("sortupdate", { bubbles: true }));
  tree.context.form.setAttribute(DIRTY_ATTRIBUTE, "true");
  tree.context.form.dispatchEvent(new Event("change", { bubbles: true }));
};

export const editWordPressMenu = (
  parameters: EditWordPressMenuParameters,
  maxItems = 500,
): WordPressMenuEditResult => {
  const tree = buildTree();
  const affectedItemIds = new Set<string>();
  let changed = false;
  for (const operation of parameters.operations) {
    const result = applyToModel(tree, operation);
    for (const itemId of result.affected) affectedItemIds.add(itemId);
    changed ||= result.changed;
  }
  if (changed) applyTreeToDom(tree);
  const items = publicItems(tree, maxItems);
  const submitted = parameters.save;
  if (submitted) {
    const saveButton =
      tree.context.form.querySelector<HTMLButtonElement | HTMLInputElement>(
        '#save_menu_header, #save_menu_footer, input[name="save_menu"], button[name="save_menu"]',
      ) ?? undefined;
    if (typeof tree.context.form.requestSubmit !== "function") {
      throw new WordPressMenuContentError(
        "ELEMENT_NOT_INTERACTABLE",
        "The WordPress menu form does not expose a safe requestSubmit path",
        false,
      );
    }
    window.setTimeout(() => {
      tree.context.form.requestSubmit(saveButton);
    }, 0);
  }
  return {
    menuId: tree.context.menuId,
    menuName: tree.context.menuNameInput?.value.slice(0, 1_000) ?? "",
    operationTypes: parameters.operations.map((operation) => operation.type),
    affectedItemIds: [...affectedItemIds].slice(0, 500),
    items,
    itemCount: tree.byId.size,
    changed,
    submitted,
  };
};

export const WORDPRESS_MENU_INTERNAL_ATTRIBUTES = [DIRTY_ATTRIBUTE] as const;
