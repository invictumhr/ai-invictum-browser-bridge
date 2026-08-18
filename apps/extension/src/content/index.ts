import {
  performFigmaLocate,
  type FigmaTargetLocation,
  performFigmaHealthcheck,
  performFigmaSelect,
  performGetFigmaDocument,
  performGetFigmaLayers,
  performGetFigmaProperties,
} from "./figma.js";
import { classifyTextBlock, isRenderedBox, suppressesSubtree } from "./visibility";
import type {
  FigmaHealthcheckData,
  FigmaSelectData,
  GetFigmaDocumentData,
  GetFigmaLayersData,
  GetFigmaPropertiesData,
  AgentAlert,
  AgentDialog,
  AgentElement,
  OutlineElement,
  AgentForm,
  ClickElementData,
  ClickElementParameters,
  FindElementCriterion,
  FindElementMatch,
  FindElementsData,
  FindElementsParameters,
  FrameSnapshot,
  GetPageSnapshotParameters,
  PageSnapshot,
  TextBlock,
  TruncationReason,
  TypeTextData,
  TypeTextParameters,
  SetFileInputFilesData,
  SelectOptionData,
  SelectOptionParameters,
  SetCheckedData,
  SetCheckedParameters,
  SubmitFormData,
  SubmitFormParameters,
  GetWordPressMenuData,
  GetWordPressMenuParameters,
  EditWordPressMenuData,
  EditWordPressMenuParameters,
  GetWordPressAdminData,
  GetWordPressAdminParameters,
  WordPressListTableActionData,
  WordPressListTableActionParameters,
  MutateDomData,
  MutateDomParameters,
  InspectElementData,
  InspectElementParameters,
  ObserveEventsData,
  ObserveEventsParameters,
  ClickAtData,
  ClickAtParameters,
  PerformGestureData,
  PerformGestureParameters,
} from "@invictum/protocol";

import { limitFindMatches, relevantFindTruncationReasons } from "./find-limit.js";
import { createContentId } from "./random-id.js";
import { containsUnsafeCss } from "../safe-css.js";
import {
  editWordPressMenu,
  inspectWordPressMenu,
  WordPressMenuContentError,
  WORDPRESS_MENU_INTERNAL_ATTRIBUTES,
} from "./wordpress-menu.js";
import {
  inspectWordPressAdmin,
  performWordPressListTableAction,
  WordPressAdminContentError,
} from "./wordpress-admin.js";

const SNAPSHOT_CHANNEL = "invictum.browser.snapshot.v1";
const CONTROL_CHANNEL = "invictum.browser.control.v1";
const CONTROL_UI_ATTRIBUTE = "data-invictum-control-ui";
const FILE_INPUT_TARGET_ATTRIBUTE = "data-invictum-file-input-target";
const INSPECT_TARGET_ATTRIBUTE = "data-invictum-inspect-target";
const TYPE_TEXT_TARGET_ATTRIBUTE = "data-invictum-type-text-target";
const INTERNAL_MUTATION_ATTRIBUTES = new Set([
  CONTROL_UI_ATTRIBUTE,
  FILE_INPUT_TARGET_ATTRIBUTE,
  INSPECT_TARGET_ATTRIBUTE,
  TYPE_TEXT_TARGET_ATTRIBUTE,
  ...WORDPRESS_MENU_INTERNAL_ATTRIBUTES,
]);
const RUNTIME_KEY = "__invictumSnapshotRuntimeV2";
const REDACTED = "[REDACTED]";
const SENSITIVE_FIELD =
  /(?:card|cc-|credit|csrf|cvv|iban|mfa|oib|one.?time|otp|pass(?:word|code|phrase)?|private|recovery|secret|token)/i;
const CLICKABLE_ROLES = new Set([
  "button",
  "checkbox",
  "combobox",
  "link",
  "menuitem",
  "option",
  "radio",
  "slider",
  "switch",
  "tab",
  "treeitem",
]);
const SEMANTIC_TAGS = new Set([
  "article",
  "aside",
  "details",
  "dialog",
  "form",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "header",
  "label",
  "li",
  "main",
  "nav",
  "p",
  "section",
  "summary",
  "table",
  "td",
  "th",
]);

interface SnapshotRequestMessage {
  channel: typeof SNAPSHOT_CHANNEL;
  command: "get_page_snapshot";
  requestId: string;
  parameters: GetPageSnapshotParameters;
}

interface FindElementsRequestMessage {
  channel: typeof SNAPSHOT_CHANNEL;
  command: "find_elements";
  requestId: string;
  parameters: FindElementsParameters;
}

interface ClickRequestMessage {
  channel: typeof SNAPSHOT_CHANNEL;
  command: "click";
  requestId: string;
  parameters: ClickElementParameters;
}

interface TypeTextRequestMessage {
  channel: typeof SNAPSHOT_CHANNEL;
  command: "type_text";
  requestId: string;
  parameters: TypeTextParameters;
}

interface PrepareFileInputRequestMessage {
  channel: typeof SNAPSHOT_CHANNEL;
  command: "prepare_file_input";
  requestId: string;
  parameters: {
    tabId: number;
    documentId: string;
    domRevision: number;
    elementId: string;
    fileCount: number;
  };
}

interface CompleteFileInputRequestMessage {
  channel: typeof SNAPSHOT_CHANNEL;
  command: "complete_file_input" | "cancel_file_input";
  requestId: string;
  parameters: { token: string; fileCount: number };
}

interface MutateDomRequestMessage {
  channel: typeof SNAPSHOT_CHANNEL;
  command: "mutate_dom";
  requestId: string;
  parameters: MutateDomParameters;
}

interface PrepareElementInspectionRequestMessage {
  channel: typeof SNAPSHOT_CHANNEL;
  command: "prepare_element_inspection";
  requestId: string;
  parameters: InspectElementParameters;
}

interface CompleteElementInspectionRequestMessage {
  channel: typeof SNAPSHOT_CHANNEL;
  command: "complete_element_inspection" | "cancel_element_inspection";
  requestId: string;
  parameters: { token: string };
}

interface ObserveEventsRequestMessage {
  channel: typeof SNAPSHOT_CHANNEL;
  command: "observe_events";
  requestId: string;
  parameters: ObserveEventsParameters;
}

interface CleanupAdvancedToolsRequestMessage {
  channel: typeof SNAPSHOT_CHANNEL;
  command: "cleanup_advanced_tools";
  requestId: string;
  parameters: Record<string, never>;
}

interface PreparedFileInputData {
  token: string;
  documentId: string;
  domRevisionBefore: number;
  elementId: string;
  multiple: boolean;
  accept: string;
}

interface PendingFileInput {
  element: HTMLInputElement;
  documentId: string;
  domRevisionBefore: number;
  elementId: string;
}

interface PendingElementInspection {
  element: Element;
}

interface PreparedElementInspectionData {
  token: string;
  base: Omit<InspectElementData, "eventListeners" | "listenersTruncated" | "debuggerUsed">;
}

interface CapturedEventState {
  captureId: string;
  startedAt: string;
  startedAtMs: number;
  eventTypes: string[];
  maxEvents: number;
  scopeElement?: Element;
  events: ObserveEventsData["events"];
  droppedEvents: number;
  nextSequence: number;
  listeners: Array<{ document: Document; type: string; listener: EventListener }>;
}

interface SelectOptionRequestMessage {
  channel: typeof SNAPSHOT_CHANNEL;
  command: "select_option";
  requestId: string;
  parameters: SelectOptionParameters;
}

interface SetCheckedRequestMessage {
  channel: typeof SNAPSHOT_CHANNEL;
  command: "check" | "uncheck";
  requestId: string;
  parameters: SetCheckedParameters;
}

interface SubmitFormRequestMessage {
  channel: typeof SNAPSHOT_CHANNEL;
  command: "submit_form";
  requestId: string;
  parameters: SubmitFormParameters;
}

interface FigmaRequestMessage {
  channel: typeof SNAPSHOT_CHANNEL;
  command:
    | "get_figma_document"
    | "get_figma_layers"
    | "get_figma_properties"
    | "figma_select"
    | "figma_locate"
    | "figma_healthcheck";
  requestId: string;
  parameters: Record<string, unknown> & { tabId: number };
}

interface GetWordPressMenuRequestMessage {
  channel: typeof SNAPSHOT_CHANNEL;
  command: "get_wordpress_menu";
  requestId: string;
  parameters: GetWordPressMenuParameters;
}

interface EditWordPressMenuRequestMessage {
  channel: typeof SNAPSHOT_CHANNEL;
  command: "edit_wordpress_menu";
  requestId: string;
  parameters: EditWordPressMenuParameters;
}

interface GetWordPressAdminRequestMessage {
  channel: typeof SNAPSHOT_CHANNEL;
  command: "get_wordpress_admin";
  requestId: string;
  parameters: GetWordPressAdminParameters;
}

interface WordPressListTableActionRequestMessage {
  channel: typeof SNAPSHOT_CHANNEL;
  command: "wordpress_list_table_action";
  requestId: string;
  parameters: WordPressListTableActionParameters;
}

interface ClickAtRequestMessage {
  channel: typeof SNAPSHOT_CHANNEL;
  command: "click_at";
  requestId: string;
  parameters: ClickAtParameters;
}

interface PerformGestureRequestMessage {
  channel: typeof SNAPSHOT_CHANNEL;
  command: "perform_gesture";
  requestId: string;
  parameters: PerformGestureParameters;
}

type ControlOverlayState = "active" | "idle" | "disconnected" | "stopped";

interface ControlStateMessage {
  channel: typeof CONTROL_CHANNEL;
  command: "set_control_state";
  state: ControlOverlayState;
  agentName?: string;
}

interface ControlStateResponse {
  ok: true;
  control: {
    state: ControlOverlayState;
    agentName?: string;
  };
}

interface SnapshotSuccessMessage {
  ok: true;
  requestId: string;
  snapshot: PageSnapshot;
}

interface SnapshotFailureMessage {
  ok: false;
  requestId: string;
  error: {
    code:
      | "CONTENT_SCRIPT_UNAVAILABLE"
      | "ELEMENT_NOT_INTERACTABLE"
      | "INVALID_MESSAGE"
      | "POLICY_DENIED"
      | "SENSITIVE_INPUT_BLOCKED"
      | "STALE_ELEMENT_REFERENCE";
    message: string;
    retryable: boolean;
  };
}

interface FindElementsSuccessMessage {
  ok: true;
  requestId: string;
  result: FindElementsData;
}

interface InteractionSuccessMessage {
  ok: true;
  requestId: string;
  modelEditorExpected?: boolean;
  result:
    | ClickElementData
    | TypeTextData
    | SetFileInputFilesData
    | SelectOptionData
    | SetCheckedData
    | SubmitFormData
    | GetWordPressMenuData
    | EditWordPressMenuData
    | GetWordPressAdminData
    | WordPressListTableActionData
    | MutateDomData
    | ObserveEventsData
    | ClickAtData
    | PerformGestureData
    | GetFigmaDocumentData
    | GetFigmaLayersData
    | GetFigmaPropertiesData
    | FigmaSelectData
    | FigmaHealthcheckData
    | FigmaTargetLocation;
}

interface FileInputPreparationSuccessMessage {
  ok: true;
  requestId: string;
  result: PreparedFileInputData;
}

interface ElementReference {
  revision: number;
  id: string;
}

type RuntimeMessageListener = Parameters<typeof chrome.runtime.onMessage.addListener>[0];

interface ControlOverlay {
  host: HTMLDivElement;
  dot: HTMLSpanElement;
  label: HTMLSpanElement;
  stopButton: HTMLButtonElement;
  removalTimer?: number;
}

interface SnapshotRuntimeState {
  documentId: string;
  domRevision: number;
  nextElementNumber: number;
  elementIds: WeakMap<Element, ElementReference>;
  elementReferences: Map<string, Element>;
  elementFingerprints: Map<string, string>;
  previousElementReferences: Map<string, Element>;
  previousElementFingerprints: Map<string, string>;
  previousRevision?: number;
  revisionBumpScheduled: boolean;
  observers: MutationObserver[];
  observedDocuments: WeakSet<Document>;
  listener?: RuntimeMessageListener;
  controlOverlay?: ControlOverlay;
  pendingFileInputs: Map<string, PendingFileInput>;
  pendingElementInspections: Map<string, PendingElementInspection>;
  eventCapture?: CapturedEventState;
}

interface SnapshotCollector {
  parameters: GetPageSnapshotParameters;
  elements: AgentElement[];
  forms: AgentForm[];
  dialogs: AgentDialog[];
  alerts: AgentAlert[];
  textBlocks: TextBlock[];
  frames: FrameSnapshot[];
  textLength: number;
  truncated: boolean;
  truncationReasons: Set<TruncationReason>;
  hiddenSubtreesSkipped: number;
  nextFrameNumber: number;
}

type InvictumContentGlobal = typeof globalThis & {
  [RUNTIME_KEY]?: SnapshotRuntimeState;
};

const contentGlobal = globalThis as InvictumContentGlobal;

const isControlUiNode = (node: Node): boolean => {
  const root = node.getRootNode();
  if (root instanceof ShadowRoot && root.host.hasAttribute(CONTROL_UI_ATTRIBUTE)) return true;
  const element = node instanceof Element ? node : node.parentElement;
  return (
    element !== null &&
    element !== undefined &&
    element.closest(`[${CONTROL_UI_ATTRIBUTE}]`) !== null
  );
};

const isControlOnlyMutation = (mutation: MutationRecord): boolean => {
  if (isControlUiNode(mutation.target)) return true;
  if (
    mutation.type === "attributes" &&
    mutation.attributeName !== null &&
    INTERNAL_MUTATION_ATTRIBUTES.has(mutation.attributeName)
  ) {
    return true;
  }
  if (mutation.type !== "childList") return false;
  const changedNodes = [...mutation.addedNodes, ...mutation.removedNodes];
  return changedNodes.length > 0 && changedNodes.every(isControlUiNode);
};

const hasPageMutation = (mutations: readonly MutationRecord[]): boolean =>
  mutations.some((mutation) => !isControlOnlyMutation(mutation));

const advanceRuntimeRevision = (state: SnapshotRuntimeState): void => {
  state.previousRevision = state.domRevision;
  state.previousElementReferences = state.elementReferences;
  state.previousElementFingerprints = state.elementFingerprints;
  state.domRevision += 1;
  state.elementReferences = new Map<string, Element>();
  state.elementFingerprints = new Map<string, string>();
  state.revisionBumpScheduled = false;
};

const scheduleRevisionBump = (state: SnapshotRuntimeState): void => {
  if (state.revisionBumpScheduled) return;
  state.revisionBumpScheduled = true;
  queueMicrotask(() => {
    if (state.revisionBumpScheduled) advanceRuntimeRevision(state);
  });
};

const createRuntimeState = (): SnapshotRuntimeState => {
  const observedDocuments = new WeakSet<Document>();
  const observers: MutationObserver[] = [];
  const state: SnapshotRuntimeState = {
    documentId: createContentId(),
    domRevision: 0,
    nextElementNumber: 1,
    elementIds: new WeakMap<Element, ElementReference>(),
    elementReferences: new Map<string, Element>(),
    elementFingerprints: new Map<string, string>(),
    previousElementReferences: new Map<string, Element>(),
    previousElementFingerprints: new Map<string, string>(),
    revisionBumpScheduled: false,
    observers,
    observedDocuments,
    pendingFileInputs: new Map<string, PendingFileInput>(),
    pendingElementInspections: new Map<string, PendingElementInspection>(),
  };
  const observer = new MutationObserver((mutations) => {
    if (hasPageMutation(mutations)) {
      scheduleRevisionBump(state);
    }
  });
  observer.observe(document.documentElement, {
    attributes: true,
    characterData: true,
    childList: true,
    subtree: true,
  });
  observers.push(observer);
  observedDocuments.add(document);
  return state;
};

const isFindElementsRequest = (value: unknown): value is FindElementsRequestMessage => {
  if (!isRecord(value) || !isRecord(value["parameters"])) return false;
  const parameters = value["parameters"];
  return (
    value["channel"] === SNAPSHOT_CHANNEL &&
    value["command"] === "find_elements" &&
    typeof value["requestId"] === "string" &&
    typeof parameters["tabId"] === "number" &&
    typeof parameters["documentId"] === "string" &&
    typeof parameters["domRevision"] === "number" &&
    typeof parameters["visible"] === "boolean" &&
    typeof parameters["matchMode"] === "string" &&
    typeof parameters["caseSensitive"] === "boolean" &&
    typeof parameters["maxResults"] === "number"
  );
};

const isClickRequest = (value: unknown): value is ClickRequestMessage => {
  if (!isRecord(value) || !isRecord(value["parameters"])) return false;
  const parameters = value["parameters"];
  return (
    value["channel"] === SNAPSHOT_CHANNEL &&
    value["command"] === "click" &&
    typeof value["requestId"] === "string" &&
    typeof parameters["tabId"] === "number" &&
    typeof parameters["documentId"] === "string" &&
    typeof parameters["domRevision"] === "number" &&
    typeof parameters["elementId"] === "string" &&
    typeof parameters["scrollIntoView"] === "boolean"
  );
};

const isTypeTextRequest = (value: unknown): value is TypeTextRequestMessage => {
  if (!isRecord(value) || !isRecord(value["parameters"])) return false;
  const parameters = value["parameters"];
  return (
    value["channel"] === SNAPSHOT_CHANNEL &&
    value["command"] === "type_text" &&
    typeof value["requestId"] === "string" &&
    typeof parameters["tabId"] === "number" &&
    typeof parameters["documentId"] === "string" &&
    typeof parameters["domRevision"] === "number" &&
    typeof parameters["elementId"] === "string" &&
    typeof parameters["text"] === "string" &&
    typeof parameters["mode"] === "string" &&
    typeof parameters["dispatchChange"] === "boolean"
  );
};

const isPrepareFileInputRequest = (value: unknown): value is PrepareFileInputRequestMessage => {
  if (!isRecord(value) || !isRecord(value["parameters"])) return false;
  const parameters = value["parameters"];
  return (
    value["channel"] === SNAPSHOT_CHANNEL &&
    value["command"] === "prepare_file_input" &&
    typeof value["requestId"] === "string" &&
    hasRevisionBoundParameters(parameters) &&
    typeof parameters["fileCount"] === "number"
  );
};

const isCompleteFileInputRequest = (value: unknown): value is CompleteFileInputRequestMessage => {
  if (!isRecord(value) || !isRecord(value["parameters"])) return false;
  return (
    value["channel"] === SNAPSHOT_CHANNEL &&
    (value["command"] === "complete_file_input" || value["command"] === "cancel_file_input") &&
    typeof value["requestId"] === "string" &&
    typeof value["parameters"]["token"] === "string" &&
    typeof value["parameters"]["fileCount"] === "number"
  );
};

const isMutateDomRequest = (value: unknown): value is MutateDomRequestMessage =>
  isRecord(value) &&
  isRecord(value["parameters"]) &&
  value["channel"] === SNAPSHOT_CHANNEL &&
  value["command"] === "mutate_dom" &&
  typeof value["requestId"] === "string" &&
  hasRevisionBoundParameters(value["parameters"]) &&
  Array.isArray(value["parameters"]["operations"]);

const isPrepareElementInspectionRequest = (
  value: unknown,
): value is PrepareElementInspectionRequestMessage =>
  isRecord(value) &&
  isRecord(value["parameters"]) &&
  value["channel"] === SNAPSHOT_CHANNEL &&
  value["command"] === "prepare_element_inspection" &&
  typeof value["requestId"] === "string" &&
  hasRevisionBoundParameters(value["parameters"]);

const isCompleteElementInspectionRequest = (
  value: unknown,
): value is CompleteElementInspectionRequestMessage =>
  isRecord(value) &&
  isRecord(value["parameters"]) &&
  value["channel"] === SNAPSHOT_CHANNEL &&
  (value["command"] === "complete_element_inspection" ||
    value["command"] === "cancel_element_inspection") &&
  typeof value["requestId"] === "string" &&
  typeof value["parameters"]["token"] === "string";

const isObserveEventsRequest = (value: unknown): value is ObserveEventsRequestMessage =>
  isRecord(value) &&
  isRecord(value["parameters"]) &&
  value["channel"] === SNAPSHOT_CHANNEL &&
  value["command"] === "observe_events" &&
  typeof value["requestId"] === "string" &&
  typeof value["parameters"]["tabId"] === "number" &&
  typeof value["parameters"]["operation"] === "string";

const isCleanupAdvancedToolsRequest = (
  value: unknown,
): value is CleanupAdvancedToolsRequestMessage =>
  isRecord(value) &&
  isRecord(value["parameters"]) &&
  value["channel"] === SNAPSHOT_CHANNEL &&
  value["command"] === "cleanup_advanced_tools" &&
  typeof value["requestId"] === "string";

const hasRevisionBoundParameters = (parameters: Readonly<Record<string, unknown>>): boolean =>
  typeof parameters["tabId"] === "number" &&
  typeof parameters["documentId"] === "string" &&
  typeof parameters["domRevision"] === "number" &&
  typeof parameters["elementId"] === "string";

const isSelectOptionRequest = (value: unknown): value is SelectOptionRequestMessage => {
  if (!isRecord(value) || !isRecord(value["parameters"])) return false;
  return (
    value["channel"] === SNAPSHOT_CHANNEL &&
    value["command"] === "select_option" &&
    typeof value["requestId"] === "string" &&
    hasRevisionBoundParameters(value["parameters"]) &&
    isRecord(value["parameters"]["selection"]) &&
    typeof value["parameters"]["dispatchChange"] === "boolean"
  );
};

const isSetCheckedRequest = (value: unknown): value is SetCheckedRequestMessage => {
  if (!isRecord(value) || !isRecord(value["parameters"])) return false;
  return (
    value["channel"] === SNAPSHOT_CHANNEL &&
    (value["command"] === "check" || value["command"] === "uncheck") &&
    typeof value["requestId"] === "string" &&
    hasRevisionBoundParameters(value["parameters"])
  );
};

const isSubmitFormRequest = (value: unknown): value is SubmitFormRequestMessage => {
  if (!isRecord(value) || !isRecord(value["parameters"])) return false;
  const authorization = value["parameters"]["authorization"];
  return (
    value["channel"] === SNAPSHOT_CHANNEL &&
    value["command"] === "submit_form" &&
    typeof value["requestId"] === "string" &&
    hasRevisionBoundParameters(value["parameters"]) &&
    isRecord(authorization) &&
    authorization["source"] === "explicit_user_instruction" &&
    typeof authorization["instructionId"] === "string"
  );
};

const FIGMA_COMMANDS = new Set([
  "get_figma_document",
  "get_figma_layers",
  "get_figma_properties",
  "figma_select",
  "figma_locate",
  "figma_healthcheck",
]);

const isFigmaRequest = (value: unknown): value is FigmaRequestMessage =>
  isRecord(value) &&
  isRecord(value["parameters"]) &&
  value["channel"] === SNAPSHOT_CHANNEL &&
  typeof value["command"] === "string" &&
  FIGMA_COMMANDS.has(value["command"]) &&
  typeof value["requestId"] === "string" &&
  typeof value["parameters"]["tabId"] === "number";

const isGetWordPressMenuRequest = (value: unknown): value is GetWordPressMenuRequestMessage =>
  isRecord(value) &&
  isRecord(value["parameters"]) &&
  value["channel"] === SNAPSHOT_CHANNEL &&
  value["command"] === "get_wordpress_menu" &&
  typeof value["requestId"] === "string" &&
  typeof value["parameters"]["tabId"] === "number" &&
  typeof value["parameters"]["maxItems"] === "number";

const isEditWordPressMenuRequest = (value: unknown): value is EditWordPressMenuRequestMessage => {
  if (!isRecord(value) || !isRecord(value["parameters"])) return false;
  const parameters = value["parameters"];
  const authorization = parameters["authorization"];
  return (
    value["channel"] === SNAPSHOT_CHANNEL &&
    value["command"] === "edit_wordpress_menu" &&
    typeof value["requestId"] === "string" &&
    typeof parameters["tabId"] === "number" &&
    typeof parameters["documentId"] === "string" &&
    typeof parameters["domRevision"] === "number" &&
    Array.isArray(parameters["operations"]) &&
    typeof parameters["save"] === "boolean" &&
    isRecord(authorization) &&
    authorization["source"] === "explicit_user_instruction" &&
    typeof authorization["instructionId"] === "string"
  );
};

const isGetWordPressAdminRequest = (value: unknown): value is GetWordPressAdminRequestMessage =>
  isRecord(value) &&
  isRecord(value["parameters"]) &&
  value["channel"] === SNAPSHOT_CHANNEL &&
  value["command"] === "get_wordpress_admin" &&
  typeof value["requestId"] === "string" &&
  typeof value["parameters"]["tabId"] === "number" &&
  typeof value["parameters"]["maxRows"] === "number" &&
  typeof value["parameters"]["maxCellText"] === "number";

const isWordPressListTableActionRequest = (
  value: unknown,
): value is WordPressListTableActionRequestMessage => {
  if (!isRecord(value) || !isRecord(value["parameters"])) return false;
  const parameters = value["parameters"];
  const authorization = parameters["authorization"];
  return (
    value["channel"] === SNAPSHOT_CHANNEL &&
    value["command"] === "wordpress_list_table_action" &&
    typeof value["requestId"] === "string" &&
    typeof parameters["tabId"] === "number" &&
    typeof parameters["documentId"] === "string" &&
    typeof parameters["domRevision"] === "number" &&
    (parameters["operation"] === "open_row_action" || parameters["operation"] === "apply_bulk") &&
    typeof parameters["actionKey"] === "string" &&
    isRecord(authorization) &&
    authorization["source"] === "explicit_user_instruction" &&
    typeof authorization["instructionId"] === "string"
  );
};

const isClickAtRequest = (value: unknown): value is ClickAtRequestMessage => {
  if (!isRecord(value) || !isRecord(value["parameters"])) return false;
  const parameters = value["parameters"];
  return (
    value["channel"] === SNAPSHOT_CHANNEL &&
    value["command"] === "click_at" &&
    typeof value["requestId"] === "string" &&
    typeof parameters["tabId"] === "number" &&
    typeof parameters["documentId"] === "string" &&
    typeof parameters["domRevision"] === "number" &&
    typeof parameters["x"] === "number" &&
    typeof parameters["y"] === "number"
  );
};

const isPerformGestureRequest = (value: unknown): value is PerformGestureRequestMessage => {
  if (!isRecord(value) || !isRecord(value["parameters"])) return false;
  const parameters = value["parameters"];
  return (
    value["channel"] === SNAPSHOT_CHANNEL &&
    value["command"] === "perform_gesture" &&
    typeof value["requestId"] === "string" &&
    typeof parameters["tabId"] === "number" &&
    typeof parameters["documentId"] === "string" &&
    typeof parameters["domRevision"] === "number" &&
    typeof parameters["operation"] === "string"
  );
};

const isControlStateMessage = (value: unknown): value is ControlStateMessage => {
  if (!isRecord(value)) return false;
  return (
    value["channel"] === CONTROL_CHANNEL &&
    value["command"] === "set_control_state" &&
    (value["state"] === "active" ||
      value["state"] === "idle" ||
      value["state"] === "disconnected" ||
      value["state"] === "stopped") &&
    (value["agentName"] === undefined ||
      (typeof value["agentName"] === "string" && value["agentName"].length <= 40))
  );
};

class ContentCommandError extends Error {
  public constructor(
    public readonly code: SnapshotFailureMessage["error"]["code"],
    message: string,
    public readonly retryable: boolean,
  ) {
    super(message);
    this.name = "ContentCommandError";
  }
}

const runtime = contentGlobal[RUNTIME_KEY] ?? createRuntimeState();
contentGlobal[RUNTIME_KEY] = runtime;

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isSnapshotRequest = (value: unknown): value is SnapshotRequestMessage => {
  if (!isRecord(value) || !isRecord(value["parameters"])) {
    return false;
  }
  const parameters = value["parameters"];
  return (
    value["channel"] === SNAPSHOT_CHANNEL &&
    value["command"] === "get_page_snapshot" &&
    typeof value["requestId"] === "string" &&
    typeof parameters["tabId"] === "number" &&
    typeof parameters["detail"] === "string" &&
    typeof parameters["includeHidden"] === "boolean" &&
    typeof parameters["maxElements"] === "number" &&
    typeof parameters["maxDepth"] === "number" &&
    typeof parameters["maxTextLength"] === "number"
  );
};

const normalizeText = (value: string): string => value.replace(/\s+/g, " ").trim();

const HTML_NAMESPACE = "http://www.w3.org/1999/xhtml";
const isDomElement = (value: unknown): value is Element =>
  typeof value === "object" &&
  value !== null &&
  (value as Readonly<{ nodeType?: unknown }>).nodeType === Node.ELEMENT_NODE;
const isTag = <T extends Element>(element: Element, tag: string): element is T =>
  element.namespaceURI === HTML_NAMESPACE && element.tagName.toLowerCase() === tag;
const isHtmlElement = (element: Element): element is HTMLElement =>
  element.namespaceURI === HTML_NAMESPACE;
const isInputElement = (element: Element): element is HTMLInputElement =>
  isTag<HTMLInputElement>(element, "input");
const isTextAreaElement = (element: Element): element is HTMLTextAreaElement =>
  isTag<HTMLTextAreaElement>(element, "textarea");
const isSelectElement = (element: Element): element is HTMLSelectElement =>
  isTag<HTMLSelectElement>(element, "select");
const isOptionElement = (element: Element): element is HTMLOptionElement =>
  isTag<HTMLOptionElement>(element, "option");
const isFormElement = (element: Element): element is HTMLFormElement =>
  isTag<HTMLFormElement>(element, "form");
const isButtonElement = (element: Element): element is HTMLButtonElement =>
  isTag<HTMLButtonElement>(element, "button");
const isIFrameElement = (element: Element): element is HTMLIFrameElement =>
  isTag<HTMLIFrameElement>(element, "iframe");
const isContentEditableElement = (element: Element): element is HTMLElement =>
  isHtmlElement(element) && element.isContentEditable;
const ownerWindow = (element: Element): Window & typeof globalThis =>
  (element.ownerDocument.defaultView ?? window) as Window & typeof globalThis;
const createEvent = (element: Element, type: string): Event => {
  const EventConstructor = ownerWindow(element).Event;
  return new EventConstructor(type, { bubbles: true, composed: true });
};
const createInputEvent = (
  element: Element,
  type: "beforeinput" | "input",
  data: string,
  inputType: string,
  cancelable = false,
): InputEvent => {
  const InputEventConstructor = ownerWindow(element).InputEvent;
  return new InputEventConstructor(type, {
    bubbles: true,
    cancelable,
    composed: true,
    data,
    inputType,
  });
};

const sanitizeUrl = (rawUrl: string): string => {
  try {
    const parsed = new URL(rawUrl, document.baseURI);
    parsed.username = "";
    parsed.password = "";
    for (const key of [...parsed.searchParams.keys()]) {
      parsed.searchParams.set(key, REDACTED);
    }
    if (parsed.hash.length > 1) {
      parsed.hash = `#${REDACTED}`;
    }
    if (parsed.protocol === "file:") {
      return "file:///[LOCAL_FILE]";
    }
    return parsed.toString().slice(0, 4_096);
  } catch {
    return "about:invalid";
  }
};

const markTruncated = (collector: SnapshotCollector, reason: TruncationReason): void => {
  collector.truncated = true;
  collector.truncationReasons.add(reason);
};

const consumeText = (collector: SnapshotCollector, value: string, maximum: number): string => {
  if (collector.textLength >= collector.parameters.maxTextLength) {
    markTruncated(collector, "max_text_length");
    return "";
  }
  const normalized = normalizeText(value);
  const remaining = collector.parameters.maxTextLength - collector.textLength;
  const allowed = Math.min(maximum, remaining);
  const result = normalized.slice(0, allowed);
  collector.textLength += result.length;
  if (result.length < normalized.length) {
    if (normalized.length > maximum) markTruncated(collector, "field_text_limit");
    if (remaining < Math.min(maximum, normalized.length)) {
      markTruncated(collector, "max_text_length");
    }
  }
  return result;
};

const getBoundingBox = (element: Element) => {
  const rect = element.getBoundingClientRect();
  return {
    x: rect.x,
    y: rect.y,
    width: Math.max(0, rect.width),
    height: Math.max(0, rect.height),
  };
};

const isVisible = (element: Element): boolean =>
  isRenderedBox(
    ownerWindow(element).getComputedStyle(element),
    element.getBoundingClientRect(),
    isHtmlElement(element) && element.hidden,
  );

const suppressesElementSubtree = (element: Element): boolean => {
  const style = ownerWindow(element).getComputedStyle(element);
  return suppressesSubtree(
    style,
    element.getBoundingClientRect(),
    isHtmlElement(element) && element.hidden,
    style.getPropertyValue("content-visibility"),
  );
};

const implicitRole = (element: Element): string => {
  const tag = element.tagName.toLowerCase();
  if (tag === "a" && element.hasAttribute("href")) return "link";
  if (tag === "button") return "button";
  if (tag === "form") return "form";
  if (tag === "img") return "img";
  if (tag === "nav") return "navigation";
  if (tag === "main") return "main";
  if (tag === "select") return "combobox";
  if (tag === "textarea") return "textbox";
  if (/^h[1-6]$/.test(tag)) return "heading";
  if (tag === "input" && isInputElement(element)) {
    if (element.type === "checkbox") return "checkbox";
    if (element.type === "radio") return "radio";
    if (element.type === "button" || element.type === "submit" || element.type === "reset") {
      return "button";
    }
    if (element.type === "range") return "slider";
    return "textbox";
  }
  return "generic";
};

const getRole = (element: Element): string =>
  normalizeText(element.getAttribute("role") ?? "") || implicitRole(element);

const labelText = (element: Element): string => {
  const labelledBy = element.getAttribute("aria-labelledby");
  if (labelledBy !== null) {
    const documentForElement = element.ownerDocument;
    const text = labelledBy
      .split(/\s+/)
      .map((id) => documentForElement.getElementById(id)?.textContent ?? "")
      .join(" ");
    if (normalizeText(text).length > 0) return text;
  }
  if (isInputElement(element) || isSelectElement(element) || isTextAreaElement(element)) {
    const labels = element.labels;
    if (labels !== null && labels.length > 0) {
      return [...labels].map((label) => label.textContent ?? "").join(" ");
    }
  }
  return "";
};

const accessibleName = (element: Element): string => {
  const ariaLabel = element.getAttribute("aria-label");
  if (ariaLabel !== null && normalizeText(ariaLabel).length > 0) return ariaLabel;
  const label = labelText(element);
  if (normalizeText(label).length > 0) return label;
  for (const attribute of ["alt", "title", "placeholder"] as const) {
    const value = element.getAttribute(attribute);
    if (value !== null && normalizeText(value).length > 0) return value;
  }
  if (isInputElement(element) && ["button", "submit", "reset"].includes(element.type)) {
    return element.value;
  }
  return isHtmlElement(element) ? element.innerText : (element.textContent ?? "");
};

const isSensitive = (element: Element): boolean => {
  if (isInputElement(element) && element.type === "password") return true;
  const identifyingText = [
    element.getAttribute("autocomplete") ?? "",
    element.getAttribute("name") ?? "",
    element.id,
    element.getAttribute("aria-label") ?? "",
    element.getAttribute("placeholder") ?? "",
    element.getAttribute("data-testid") ?? "",
  ].join(" ");
  return SENSITIVE_FIELD.test(identifyingText);
};

const isDisabled = (element: Element): boolean => {
  if (
    ["button", "input", "select", "textarea", "optgroup", "option", "fieldset"].includes(
      element.tagName.toLowerCase(),
    )
  ) {
    return (element as Element & { disabled: boolean }).disabled;
  }
  return element.getAttribute("aria-disabled") === "true";
};

const NON_TEXT_INPUT_TYPES = new Set([
  "button",
  "checkbox",
  "color",
  "file",
  "hidden",
  "image",
  "radio",
  "reset",
  "submit",
]);

const isEditable = (element: Element): boolean =>
  !isDisabled(element) &&
  ((isInputElement(element) && !element.readOnly && !NON_TEXT_INPUT_TYPES.has(element.type)) ||
    (isTextAreaElement(element) && !element.readOnly) ||
    isSelectElement(element) ||
    isContentEditableElement(element));

const isClickable = (element: Element, role: string): boolean => {
  const tag = element.tagName.toLowerCase();
  return (
    CLICKABLE_ROLES.has(role) ||
    tag === "button" ||
    tag === "summary" ||
    (tag === "a" && element.hasAttribute("href")) ||
    (isInputElement(element) &&
      ["button", "checkbox", "file", "radio", "reset", "submit"].includes(element.type)) ||
    (isHtmlElement(element) && element.tabIndex >= 0)
  );
};

const getBooleanState = (element: Element, attribute: "aria-checked" | "aria-selected") => {
  const value = element.getAttribute(attribute);
  return value === "true" ? true : value === "false" ? false : null;
};

const getChecked = (element: Element): boolean | null => {
  if (isInputElement(element) && ["checkbox", "radio"].includes(element.type)) {
    return element.checked;
  }
  return getBooleanState(element, "aria-checked");
};

const getSelected = (element: Element): boolean | null => {
  if (isOptionElement(element)) return element.selected;
  return getBooleanState(element, "aria-selected");
};

const isRequired = (element: Element): boolean => {
  if (isInputElement(element) || isSelectElement(element) || isTextAreaElement(element)) {
    return element.required;
  }
  return element.getAttribute("aria-required") === "true";
};

const safeCssSelector = (element: Element): string => {
  if (element.id.length > 0 && element.id.length <= 64 && !SENSITIVE_FIELD.test(element.id)) {
    return `#${CSS.escape(element.id)}`;
  }
  const parts: string[] = [];
  let current: Element | null = element;
  while (current !== null && parts.length < 4) {
    const tag = current.tagName.toLowerCase();
    const parent: Element | null = current.parentElement;
    if (parent === null) {
      parts.unshift(tag);
      break;
    }
    const sameTag = [...parent.children].filter(
      (candidate) => candidate.tagName === current?.tagName,
    );
    const position = sameTag.indexOf(current) + 1;
    parts.unshift(`${tag}:nth-of-type(${Math.max(1, position)})`);
    current = parent;
  }
  return parts.join(" > ").slice(0, 1_024);
};

const elementFingerprint = (element: Element): string => {
  const role = getRole(element);
  const controlType =
    isInputElement(element) || isButtonElement(element) ? element.type.toLowerCase() : "";
  return JSON.stringify([
    element.tagName.toLowerCase(),
    role,
    normalizeText(accessibleName(element)).slice(0, 1_000),
    isSensitive(element),
    isEditable(element),
    isClickable(element, role),
    controlType,
  ]);
};

const getElementId = (element: Element): string => {
  const existing = runtime.elementIds.get(element);
  if (existing?.revision === runtime.domRevision) {
    return existing.id;
  }
  const id = `el_${runtime.documentId.slice(0, 8)}_${runtime.domRevision}_${runtime.nextElementNumber}`;
  runtime.nextElementNumber += 1;
  runtime.elementIds.set(element, { revision: runtime.domRevision, id });
  runtime.elementReferences.set(id, element);
  runtime.elementFingerprints.set(id, elementFingerprint(element));
  return id;
};

const synchronizeDomRevision = (): void => {
  const pendingMutations = runtime.observers.flatMap((observer) => observer.takeRecords());
  if (hasPageMutation(pendingMutations) || runtime.revisionBumpScheduled) {
    advanceRuntimeRevision(runtime);
  }
};

const observeDocument = (documentToObserve: Document): void => {
  if (
    runtime.observedDocuments.has(documentToObserve) ||
    documentToObserve.documentElement === null
  ) {
    return;
  }
  const MutationObserverConstructor =
    documentToObserve.defaultView?.MutationObserver ?? MutationObserver;
  const observer = new MutationObserverConstructor((mutations) => {
    if (hasPageMutation(mutations)) {
      scheduleRevisionBump(runtime);
    }
  });
  observer.observe(documentToObserve.documentElement, {
    attributes: true,
    characterData: true,
    childList: true,
    subtree: true,
  });
  runtime.observers.push(observer);
  runtime.observedDocuments.add(documentToObserve);
};

const shouldIncludeElement = (
  element: Element,
  role: string,
  clickable: boolean,
  editable: boolean,
  detail: GetPageSnapshotParameters["detail"],
): boolean => {
  const tag = element.tagName.toLowerCase();
  const interactive =
    clickable ||
    editable ||
    tag === "form" ||
    role === "alert" ||
    role === "alertdialog" ||
    role === "dialog";
  if (detail === "outline") return interactive;
  if (detail === "minimal") return interactive || role === "heading";
  if (detail === "interactive") return interactive || SEMANTIC_TAGS.has(tag);
  if (detail === "semantic") return interactive || SEMANTIC_TAGS.has(tag) || role !== "generic";
  return true;
};

const pushTextBlock = (
  collector: SnapshotCollector,
  element: Element,
  elementId: string,
  frameId: string,
  sensitive: boolean,
): void => {
  const classified = classifyTextBlock(
    element.tagName,
    element.getAttribute("role"),
    element.getAttribute("aria-level"),
  );
  if (classified === undefined) return;
  const { kind, level } = classified;
  const rawText = sensitive ? REDACTED : (element.textContent ?? "");
  const text = consumeText(collector, rawText, 2_000);
  if (text.length === 0) return;
  collector.textBlocks.push({
    elementId,
    frameId,
    kind,
    text,
    level,
    boundingBox: getBoundingBox(element),
  });
};

const pushElement = (
  collector: SnapshotCollector,
  element: Element,
  frameId: string,
): AgentElement | undefined => {
  if (collector.elements.length >= collector.parameters.maxElements) {
    markTruncated(collector, "max_elements");
    return undefined;
  }
  const visible = isVisible(element);
  if (!visible && !collector.parameters.includeHidden) return undefined;
  const role = getRole(element);
  const editable = isEditable(element);
  const clickable = isClickable(element, role);
  if (!shouldIncludeElement(element, role, clickable, editable, collector.parameters.detail)) {
    return undefined;
  }
  const sensitive = isSensitive(element);
  const elementId = getElementId(element);
  const rect = element.getBoundingClientRect();
  const view = ownerWindow(element);
  const name = consumeText(collector, accessibleName(element), 1_000);
  const rawText =
    sensitive || isInputElement(element) || isTextAreaElement(element)
      ? sensitive
        ? REDACTED
        : ""
      : isHtmlElement(element)
        ? element.innerText
        : (element.textContent ?? "");
  const text = consumeText(collector, rawText, 2_000);
  const selectors: AgentElement["selectors"] = { css: safeCssSelector(element) };
  if (role !== "generic" && name.length > 0) {
    selectors.aria = `${role}[name='${name.replaceAll("'", "\\'").slice(0, 900)}']`;
  }
  const item: AgentElement = {
    elementId,
    frameId,
    tag: element.tagName.toLowerCase(),
    role,
    name,
    text,
    visible,
    enabled: !isDisabled(element),
    editable,
    clickable,
    focused: element.ownerDocument.activeElement === element,
    checked: getChecked(element),
    selected: getSelected(element),
    required: isRequired(element),
    sensitive,
    hasValue:
      isInputElement(element) || isTextAreaElement(element)
        ? element.value.length > 0
        : isSelectElement(element)
          ? element.selectedIndex >= 0
          : isHtmlElement(element) && element.isContentEditable
            ? (element.textContent ?? "").trim().length > 0
            : false,
    outsideViewport:
      rect.bottom < 0 ||
      rect.right < 0 ||
      rect.top > view.innerHeight ||
      rect.left > view.innerWidth,
    boundingBox: getBoundingBox(element),
    selectors,
  };
  collector.elements.push(item);
  if (collector.parameters.detail !== "outline") {
    pushTextBlock(collector, element, elementId, frameId, sensitive);
  }
  return item;
};

const pushSemanticGroups = (
  collector: SnapshotCollector,
  element: Element,
  item: AgentElement,
): void => {
  const role = item.role;
  if (isFormElement(element)) {
    const fieldElementIds = [...element.elements]
      .filter(isDomElement)
      .slice(0, 1_000)
      .map(getElementId);
    const sensitive = [...element.elements].some(
      (field) => isDomElement(field) && isSensitive(field),
    );
    const method = element.method.toLowerCase();
    collector.forms.push({
      elementId: item.elementId,
      frameId: item.frameId,
      name: item.name,
      method: method === "get" || method === "post" || method === "dialog" ? method : "unknown",
      action: sanitizeUrl(element.action || element.ownerDocument.URL),
      fieldElementIds,
      sensitive,
    });
  }
  if (role === "dialog" || role === "alertdialog") {
    collector.dialogs.push({
      elementId: item.elementId,
      frameId: item.frameId,
      role,
      name: item.name,
      open: isTag<HTMLDialogElement>(element, "dialog") ? element.open : (item.visible ?? true),
      modal: element.getAttribute("aria-modal") === "true",
    });
  }
  if (role === "alert" || role === "status") {
    collector.alerts.push({
      elementId: item.elementId,
      frameId: item.frameId,
      role,
      text: item.sensitive ? REDACTED : item.text || item.name,
    });
  }
};

const walkElement = (
  collector: SnapshotCollector,
  element: Element,
  frameId: string,
  depth: number,
): void => {
  if (element.hasAttribute(CONTROL_UI_ATTRIBUTE)) return;
  if (depth > collector.parameters.maxDepth) {
    markTruncated(collector, "max_depth");
    return;
  }
  if (collector.elements.length >= collector.parameters.maxElements) {
    markTruncated(collector, "max_elements");
    return;
  }
  let rendered = true;
  if (!collector.parameters.includeHidden) {
    if (suppressesElementSubtree(element)) {
      collector.hiddenSubtreesSkipped += 1;
      return;
    }
    rendered = isVisible(element);
  }

  const item = rendered ? pushElement(collector, element, frameId) : undefined;
  if (item !== undefined && collector.parameters.detail !== "outline") {
    pushSemanticGroups(collector, element, item);
  }

  if (isIFrameElement(element)) {
    const childFrameId = `frame_${collector.nextFrameNumber}`;
    collector.nextFrameNumber += 1;
    let childDocument: Document | null = null;
    try {
      childDocument = element.contentDocument;
    } catch {
      childDocument = null;
    }
    collector.frames.push({
      frameId: childFrameId,
      parentFrameId: frameId,
      url: sanitizeUrl(element.src || "about:blank"),
      title: (element.title || childDocument?.title || "").slice(0, 512),
      name: element.name.slice(0, 512),
      accessible:
        childDocument?.documentElement !== null && childDocument?.documentElement !== undefined,
    });
    if (childDocument?.documentElement !== null && childDocument?.documentElement !== undefined) {
      observeDocument(childDocument);
      walkElement(collector, childDocument.documentElement, childFrameId, 0);
    }
  }

  if (element.shadowRoot !== null) {
    for (const child of [...element.shadowRoot.children]) {
      walkElement(collector, child, frameId, depth + 1);
    }
  }
  for (const child of [...element.children]) {
    walkElement(collector, child, frameId, depth + 1);
  }
};

const buildSnapshot = (parameters: GetPageSnapshotParameters): PageSnapshot => {
  synchronizeDomRevision();

  let snapshotRoot: Element = document.body ?? document.documentElement;
  if (parameters.scope !== undefined) {
    if (
      parameters.scope.documentId !== runtime.documentId ||
      parameters.scope.domRevision !== runtime.domRevision
    ) {
      throw new ContentCommandError(
        "STALE_ELEMENT_REFERENCE",
        "The scoped snapshot document revision is stale; fetch a fresh page snapshot",
        true,
      );
    }
    const scopedElement = runtime.elementReferences.get(parameters.scope.elementId);
    if (scopedElement === undefined || !scopedElement.isConnected) {
      throw new ContentCommandError(
        "STALE_ELEMENT_REFERENCE",
        "The scoped snapshot root is stale or no longer connected",
        true,
      );
    }
    snapshotRoot = scopedElement;
  }

  const collector: SnapshotCollector = {
    parameters,
    elements: [],
    forms: [],
    dialogs: [],
    alerts: [],
    textBlocks: [],
    frames: [
      {
        frameId: "top",
        parentFrameId: null,
        url: sanitizeUrl(location.href),
        title: document.title.slice(0, 512),
        name: "top",
        accessible: true,
      },
    ],
    textLength: 0,
    truncated: false,
    truncationReasons: new Set<TruncationReason>(),
    hiddenSubtreesSkipped: 0,
    nextFrameNumber: 1,
  };

  walkElement(collector, snapshotRoot, "top", 0);
  const compactElement = (item: AgentElement): AgentElement => ({
    elementId: item.elementId,
    frameId: item.frameId,
    tag: item.tag,
    role: item.role,
    name: item.name,
    ...(item.text && item.text !== item.name ? { text: item.text } : {}),
    ...(item.visible === false ? { visible: false } : {}),
    ...(item.enabled === false ? { enabled: false } : {}),
    ...(item.editable ? { editable: true } : {}),
    ...(item.clickable ? { clickable: true } : {}),
    ...(item.focused ? { focused: true } : {}),
    ...(item.checked === null || item.checked === undefined ? {} : { checked: item.checked }),
    ...(item.selected === null || item.selected === undefined ? {} : { selected: item.selected }),
    ...(item.required ? { required: true } : {}),
    ...(item.sensitive ? { sensitive: true } : {}),
    ...(item.hasValue ? { hasValue: true } : {}),
    ...(item.outsideViewport ? { outsideViewport: true } : {}),
    boundingBox: item.boundingBox,
    selectors: item.selectors,
  });
  const outline: OutlineElement[] =
    parameters.detail === "outline"
      ? collector.elements.map((item) => ({
          elementId: item.elementId,
          frameId: item.frameId,
          tag: item.tag,
          role: item.role,
          name: item.name,
          ...(item.editable ? { editable: true as const } : {}),
          ...(item.clickable ? { clickable: true as const } : {}),
          ...(item.sensitive ? { sensitive: true as const } : {}),
          ...(item.hasValue ? { hasValue: true as const } : {}),
          ...(item.outsideViewport ? { outsideViewport: true as const } : {}),
          ...(item.selectors.css === undefined ? {} : { css: item.selectors.css }),
        }))
      : [];
  const root = document.documentElement;
  const maxX = Math.max(0, root.scrollWidth - innerWidth);
  const maxY = Math.max(0, root.scrollHeight - innerHeight);
  return {
    page: {
      url: sanitizeUrl(location.href),
      title: document.title.slice(0, 512),
      origin: (location.origin === "null" ? `${location.protocol}//` : location.origin).slice(
        0,
        2_048,
      ),
      viewport: {
        width: innerWidth,
        height: innerHeight,
        deviceScaleFactor: devicePixelRatio,
      },
      scroll: { x: scrollX, y: scrollY, maxX, maxY },
      loadingState: document.readyState,
    },
    frames: collector.frames,
    elements: parameters.detail === "outline" ? [] : collector.elements.map(compactElement),
    ...(parameters.detail === "outline" ? { outline } : {}),
    forms: collector.forms,
    dialogs: collector.dialogs,
    alerts: collector.alerts,
    textBlocks: collector.textBlocks,
    metadata: {
      generatedAt: new Date().toISOString(),
      documentId: runtime.documentId,
      domRevision: runtime.domRevision,
      elementCount: collector.elements.length,
      textLength: collector.textLength,
      truncated: collector.truncated,
      truncationReasons: [...collector.truncationReasons],
      hiddenSubtreesSkipped: collector.hiddenSubtreesSkipped,
      detail: parameters.detail,
    },
  };
};

const matchesString = (
  actual: string,
  expected: string,
  parameters: FindElementsParameters,
): boolean => {
  const normalizedActual = normalizeText(actual);
  const normalizedExpected = normalizeText(expected);
  const [candidate, query] = parameters.caseSensitive
    ? [normalizedActual, normalizedExpected]
    : [normalizedActual.toLocaleLowerCase(), normalizedExpected.toLocaleLowerCase()];
  if (parameters.matchMode === "exact") return candidate === query;
  if (parameters.matchMode === "starts_with") return candidate.startsWith(query);
  return candidate.includes(query);
};

const isSafeRegexPattern = (pattern: string): boolean => {
  if (pattern.length > 256) return false;
  // Reject the most common catastrophic nested-quantifier forms. This initial
  // content-script slice intentionally supports a bounded regex subset.
  return !/(?:\([^)]*[+*][^)]*\)|\.\*)\s*(?:[+*]|\{\d*,?\d*\})/.test(pattern);
};

const centerDistance = (left: Element, right: Element): number => {
  const a = left.getBoundingClientRect();
  const b = right.getBoundingClientRect();
  return Math.hypot(
    a.left + a.width / 2 - (b.left + b.width / 2),
    a.top + a.height / 2 - (b.top + b.height / 2),
  );
};

const tableCellPosition = (element: Element): { row: number; column: number } | undefined => {
  const cell = element.closest("td,th");
  const row = cell?.closest("tr");
  if (
    cell === null ||
    (!isTag<HTMLTableCellElement>(cell, "td") && !isTag<HTMLTableCellElement>(cell, "th"))
  ) {
    return undefined;
  }
  if (row === null || row === undefined || !isTag<HTMLTableRowElement>(row, "tr")) return undefined;
  return { row: row.rowIndex + 1, column: cell.cellIndex + 1 };
};

const parentMatches = (element: Element, parameters: FindElementsParameters): boolean => {
  const criteria = parameters.parent;
  if (criteria === undefined) return true;
  let ancestor: Element | null = element.parentElement;
  while (ancestor !== null) {
    const matches =
      (criteria.role === undefined ||
        matchesString(getRole(ancestor), criteria.role, parameters)) &&
      (criteria.name === undefined ||
        matchesString(accessibleName(ancestor), criteria.name, parameters)) &&
      (criteria.text === undefined ||
        matchesString(ancestor.textContent ?? "", criteria.text, parameters)) &&
      (criteria.tag === undefined ||
        matchesString(ancestor.tagName.toLowerCase(), criteria.tag, parameters));
    if (matches) return true;
    ancestor = ancestor.parentElement;
  }
  return false;
};

const buildXPathMatches = (
  candidates: readonly AgentElement[],
  xpath: string | undefined,
): Map<Document, Set<Element>> => {
  const result = new Map<Document, Set<Element>>();
  if (xpath === undefined) return result;
  for (const candidate of candidates) {
    const element = runtime.elementReferences.get(candidate.elementId);
    if (element === undefined || result.has(element.ownerDocument)) continue;
    const matches = new Set<Element>();
    let evaluated: XPathResult;
    try {
      evaluated = element.ownerDocument.evaluate(
        xpath,
        element.ownerDocument,
        null,
        XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
        null,
      );
    } catch {
      throw new ContentCommandError("INVALID_MESSAGE", "The XPath criterion is invalid", false);
    }
    for (let index = 0; index < evaluated.snapshotLength; index += 1) {
      const node = evaluated.snapshotItem(index);
      if (isDomElement(node)) matches.add(node);
    }
    result.set(element.ownerDocument, matches);
  }
  return result;
};

const findElements = (parameters: FindElementsParameters): FindElementsData => {
  synchronizeDomRevision();
  if (
    parameters.documentId !== runtime.documentId ||
    parameters.domRevision !== runtime.domRevision
  ) {
    throw new ContentCommandError(
      "STALE_ELEMENT_REFERENCE",
      "The requested document snapshot is stale; fetch a fresh page snapshot",
      true,
    );
  }

  let expression: RegExp | undefined;
  if (parameters.regex !== undefined) {
    if (!isSafeRegexPattern(parameters.regex.pattern)) {
      throw new ContentCommandError("INVALID_MESSAGE", "The regex criterion is unsafe", false);
    }
    try {
      expression = new RegExp(parameters.regex.pattern, parameters.regex.flags);
    } catch {
      throw new ContentCommandError("INVALID_MESSAGE", "The regex criterion is invalid", false);
    }
  }

  const snapshot = buildSnapshot({
    tabId: parameters.tabId,
    detail: "full",
    includeHidden: true,
    maxElements: 5_000,
    maxDepth: 64,
    maxTextLength: 200_000,
  });
  if (snapshot.metadata.domRevision !== parameters.domRevision) {
    throw new ContentCommandError(
      "STALE_ELEMENT_REFERENCE",
      "The document changed while elements were being searched",
      true,
    );
  }

  const proximityTarget = parameters.proximity?.elementId;
  const proximityElement =
    proximityTarget === undefined ? undefined : runtime.elementReferences.get(proximityTarget);
  if (
    proximityTarget !== undefined &&
    (proximityElement === undefined || !proximityElement.isConnected)
  ) {
    throw new ContentCommandError(
      "STALE_ELEMENT_REFERENCE",
      "The proximity reference is stale; fetch a fresh page snapshot",
      true,
    );
  }
  const xpathMatches = buildXPathMatches(snapshot.elements, parameters.xpath);
  const matches: FindElementMatch[] = [];

  for (const item of snapshot.elements) {
    const element = runtime.elementReferences.get(item.elementId);
    if (element === undefined) continue;
    const matchedBy: FindElementCriterion[] = [];
    let score = 0;
    const accept = (
      criterion: FindElementCriterion,
      condition: boolean,
      weight: number,
    ): boolean => {
      if (!condition) return false;
      matchedBy.push(criterion);
      score += weight;
      return true;
    };

    if (!accept("visible", (item.visible ?? true) === parameters.visible, 5)) continue;
    if (
      parameters.enabled !== undefined &&
      !accept("enabled", (item.enabled ?? true) === parameters.enabled, 5)
    )
      continue;
    if (
      parameters.text !== undefined &&
      !accept("text", matchesString(item.text ?? item.name, parameters.text, parameters), 20)
    )
      continue;
    if (
      parameters.role !== undefined &&
      !accept("role", matchesString(item.role, parameters.role, parameters), 20)
    )
      continue;
    if (
      parameters.name !== undefined &&
      !accept("name", matchesString(item.name, parameters.name, parameters), 40)
    )
      continue;
    const label = labelText(element);
    if (
      parameters.label !== undefined &&
      !accept("label", matchesString(label, parameters.label, parameters), 35)
    )
      continue;
    const placeholder = element.getAttribute("placeholder") ?? "";
    if (
      parameters.placeholder !== undefined &&
      !accept("placeholder", matchesString(placeholder, parameters.placeholder, parameters), 25)
    )
      continue;
    const title = element.getAttribute("title") ?? "";
    if (
      parameters.title !== undefined &&
      !accept("title", matchesString(title, parameters.title, parameters), 25)
    )
      continue;
    const alt = element.getAttribute("alt") ?? "";
    if (
      parameters.alt !== undefined &&
      !accept("alt", matchesString(alt, parameters.alt, parameters), 25)
    )
      continue;
    if (
      parameters.testId !== undefined &&
      !accept(
        "testId",
        matchesString(element.getAttribute("data-testid") ?? "", parameters.testId, parameters),
        35,
      )
    )
      continue;
    if (
      parameters.tag !== undefined &&
      !accept("tag", matchesString(item.tag, parameters.tag, parameters), 15)
    )
      continue;
    const inputType = isInputElement(element) ? element.type : "";
    if (
      parameters.inputType !== undefined &&
      !accept("inputType", matchesString(inputType, parameters.inputType, parameters), 20)
    )
      continue;
    if (
      parameters.frameId !== undefined &&
      !accept("frameId", item.frameId === parameters.frameId, 15)
    )
      continue;
    if (parameters.css !== undefined) {
      let cssMatch = false;
      try {
        cssMatch = element.matches(parameters.css);
      } catch {
        throw new ContentCommandError("INVALID_MESSAGE", "The CSS criterion is invalid", false);
      }
      if (!accept("css", cssMatch, 25)) continue;
    }
    if (
      parameters.xpath !== undefined &&
      !accept("xpath", xpathMatches.get(element.ownerDocument)?.has(element) === true, 25)
    )
      continue;

    const regexHaystack = [item.text ?? "", item.name, label, placeholder, title, alt].join(" ");
    if (expression !== undefined && !accept("regex", expression.test(regexHaystack), 20)) continue;
    if (expression !== undefined) expression.lastIndex = 0;
    if (
      parameters.parent !== undefined &&
      !accept("parent", parentMatches(element, parameters), 15)
    )
      continue;

    const cell = tableCellPosition(element);
    if (parameters.table !== undefined) {
      const tableMatch =
        cell !== undefined &&
        (parameters.table.row === undefined || parameters.table.row === cell.row) &&
        (parameters.table.column === undefined || parameters.table.column === cell.column);
      if (!accept("table", tableMatch, 15)) continue;
    }

    let distancePx: number | undefined;
    if (parameters.proximity !== undefined && proximityElement !== undefined) {
      distancePx = centerDistance(element, proximityElement);
      if (!accept("proximity", distancePx <= parameters.proximity.maxDistancePx, 15)) continue;
      score += Math.max(0, Math.round(10 - (distancePx / parameters.proximity.maxDistancePx) * 10));
    }

    matches.push({
      element: item,
      score: Math.min(1_000, score),
      matchedBy,
      ...(distancePx === undefined ? {} : { distancePx }),
      ...(cell === undefined ? {} : { tableCell: cell }),
    });
  }

  matches.sort((left, right) => right.score - left.score);
  const textSensitiveSearch =
    parameters.text !== undefined ||
    parameters.regex !== undefined ||
    parameters.name !== undefined ||
    parameters.label !== undefined ||
    parameters.placeholder !== undefined ||
    parameters.title !== undefined ||
    parameters.alt !== undefined;
  const relevantTruncationReasons = relevantFindTruncationReasons(
    snapshot.metadata.truncationReasons,
    textSensitiveSearch,
  );
  const limited = limitFindMatches(
    matches,
    parameters.maxResults,
    relevantTruncationReasons.length > 0,
    relevantTruncationReasons,
  );
  return {
    page: { url: snapshot.page.url, origin: snapshot.page.origin },
    documentId: snapshot.metadata.documentId,
    domRevision: snapshot.metadata.domRevision,
    ...limited,
  };
};

const resolveRevisionBoundElement = (
  parameters: {
    documentId: string;
    domRevision: number;
    elementId: string;
  },
  allowPreviousRevision = true,
): Element => {
  synchronizeDomRevision();
  if (parameters.documentId !== runtime.documentId) {
    throw new ContentCommandError(
      "STALE_ELEMENT_REFERENCE",
      "The element belongs to a stale document; fetch a fresh page snapshot",
      true,
    );
  }
  const isCurrent = parameters.domRevision === runtime.domRevision;
  const isSafePrevious =
    allowPreviousRevision &&
    runtime.previousRevision === parameters.domRevision &&
    runtime.domRevision === parameters.domRevision + 1;
  const references = isCurrent
    ? runtime.elementReferences
    : isSafePrevious
      ? runtime.previousElementReferences
      : undefined;
  const fingerprints = isCurrent
    ? runtime.elementFingerprints
    : isSafePrevious
      ? runtime.previousElementFingerprints
      : undefined;
  const element = references?.get(parameters.elementId);
  if (element === undefined || !element.isConnected) {
    throw new ContentCommandError(
      "STALE_ELEMENT_REFERENCE",
      "The element reference is stale; fetch a fresh page snapshot or use the returned resolvedElementId",
      true,
    );
  }
  if (isSafePrevious && fingerprints?.get(parameters.elementId) !== elementFingerprint(element)) {
    throw new ContentCommandError(
      "STALE_ELEMENT_REFERENCE",
      "The previous-revision element changed identity or semantics; fetch a fresh page snapshot",
      true,
    );
  }
  return element;
};

const assertCurrentRevision = (parameters: { documentId: string; domRevision: number }): void => {
  synchronizeDomRevision();
  if (
    parameters.documentId !== runtime.documentId ||
    parameters.domRevision !== runtime.domRevision
  ) {
    throw new ContentCommandError(
      "STALE_ELEMENT_REFERENCE",
      "The element belongs to a stale document revision; fetch a fresh page snapshot",
      true,
    );
  }
};

const advanceRevisionAfterAction = (revisionBefore: number): boolean => {
  synchronizeDomRevision();
  const domChanged = runtime.domRevision !== revisionBefore;
  if (runtime.domRevision === revisionBefore) {
    advanceRuntimeRevision(runtime);
  }
  return domChanged;
};

const resolvedElementIdAfterAction = (element: Element): string | undefined =>
  element.isConnected ? getElementId(element) : undefined;

const safeTarget = (element: Element): ClickElementData["target"] => ({
  role: getRole(element),
  name: normalizeText(accessibleName(element)).slice(0, 1_000),
  sensitive: isSensitive(element),
});

const isSubmitControl = (element: Element): boolean => {
  if (isButtonElement(element)) return element.form !== null && element.type === "submit";
  return (
    isInputElement(element) && element.form !== null && ["image", "submit"].includes(element.type)
  );
};

const isResetControl = (element: Element): boolean =>
  (isButtonElement(element) || isInputElement(element)) &&
  element.form !== null &&
  element.type === "reset";

const currentOrigin = (): string =>
  (location.origin === "null" ? `${location.protocol}//` : location.origin).slice(0, 2_048);

const performClick = async (parameters: ClickElementParameters): Promise<ClickElementData> => {
  const element = resolveRevisionBoundElement(parameters);
  const revisionBefore = runtime.domRevision;
  const target = safeTarget(element);
  if (!isVisible(element) || isDisabled(element) || !isClickable(element, target.role)) {
    throw new ContentCommandError(
      "ELEMENT_NOT_INTERACTABLE",
      "The target element is not visible, enabled, and clickable",
      true,
    );
  }
  if (isSubmitControl(element)) {
    throw new ContentCommandError(
      "POLICY_DENIED",
      "Submit controls must use browser.submit_form with explicit user authorization",
      false,
    );
  }
  if (isResetControl(element)) {
    throw new ContentCommandError(
      "POLICY_DENIED",
      "Form reset controls require a dedicated authorized workflow",
      false,
    );
  }

  const urlBefore = sanitizeUrl(location.href);
  if (parameters.scrollIntoView) {
    element.scrollIntoView({ block: "center", inline: "center", behavior: "instant" });
  }
  let blockedFormAction = false;
  const formGuard = (event: Event): void => {
    blockedFormAction = true;
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  const ownerDocument = element.ownerDocument;
  ownerDocument.addEventListener("submit", formGuard, true);
  ownerDocument.addEventListener("reset", formGuard, true);
  try {
    if (isHtmlElement(element)) {
      element.click();
    } else {
      const MouseEventConstructor = ownerWindow(element).MouseEvent;
      element.dispatchEvent(
        new MouseEventConstructor("click", {
          bubbles: true,
          cancelable: true,
          composed: true,
          button: 0,
        }),
      );
    }
    await Promise.resolve();
  } finally {
    ownerDocument.removeEventListener("submit", formGuard, true);
    ownerDocument.removeEventListener("reset", formGuard, true);
  }
  if (blockedFormAction) {
    throw new ContentCommandError(
      "POLICY_DENIED",
      "The click attempted an indirect form submit or reset; use the dedicated authorized action",
      false,
    );
  }
  await new Promise<void>((resolve) => setTimeout(resolve, 50));
  const domChanged = advanceRevisionAfterAction(revisionBefore);
  const resolvedElementId = resolvedElementIdAfterAction(element);
  const urlAfter = sanitizeUrl(location.href);
  return {
    page: {
      urlBefore,
      urlAfter,
      origin: currentOrigin(),
    },
    documentId: runtime.documentId,
    domRevisionBefore: revisionBefore,
    domRevisionAfter: runtime.domRevision,
    elementId: parameters.elementId,
    ...(resolvedElementId === undefined ? {} : { resolvedElementId }),
    target,
    clicked: true,
    domChanged,
    urlChanged: urlAfter !== urlBefore,
    requiresNewSnapshot: true,
  };
};

const elementAtViewportPoint = (
  topX: number,
  topY: number,
): { element: Element; x: number; y: number } | undefined => {
  let currentDocument = document;
  let x = topX;
  let y = topY;
  let element = currentDocument.elementFromPoint(x, y);
  while (element !== null && isIFrameElement(element)) {
    let childDocument: Document | null = null;
    try {
      childDocument = element.contentDocument;
    } catch {
      childDocument = null;
    }
    if (childDocument === null) break;
    const rect = element.getBoundingClientRect();
    x -= rect.left + element.clientLeft;
    y -= rect.top + element.clientTop;
    currentDocument = childDocument;
    const childElement = currentDocument.elementFromPoint(x, y);
    if (childElement === null) break;
    element = childElement;
  }
  return element === null ? undefined : { element, x, y };
};

const performClickAt = async (parameters: ClickAtParameters): Promise<ClickAtData> => {
  assertCurrentRevision(parameters);
  if (parameters.x >= innerWidth || parameters.y >= innerHeight) {
    throw new ContentCommandError(
      "ELEMENT_NOT_INTERACTABLE",
      "The click coordinates are outside the visible viewport",
      false,
    );
  }
  const point = elementAtViewportPoint(parameters.x, parameters.y);
  if (point === undefined || isControlUiNode(point.element)) {
    throw new ContentCommandError(
      "ELEMENT_NOT_INTERACTABLE",
      "No page-owned element exists at the requested viewport coordinates",
      true,
    );
  }
  const element = point.element;
  const activationControl = element.closest("button,input") ?? element;
  if (!isVisible(element) || isDisabled(activationControl)) {
    throw new ContentCommandError(
      "ELEMENT_NOT_INTERACTABLE",
      "The coordinate target is not visible and enabled",
      true,
    );
  }
  if (isSubmitControl(activationControl) || isResetControl(activationControl)) {
    throw new ContentCommandError(
      "POLICY_DENIED",
      "Coordinate clicks cannot submit or reset forms; use the dedicated authorized action",
      false,
    );
  }

  const revisionBefore = runtime.domRevision;
  const urlBefore = sanitizeUrl(location.href);
  const ownerDocument = element.ownerDocument;
  let blockedFormAction = false;
  const formGuard = (event: Event): void => {
    blockedFormAction = true;
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  ownerDocument.addEventListener("submit", formGuard, true);
  ownerDocument.addEventListener("reset", formGuard, true);
  try {
    const view = ownerWindow(element);
    const common = {
      bubbles: true,
      cancelable: true,
      composed: true,
      clientX: point.x,
      clientY: point.y,
      button: 0,
      detail: 1,
      view,
    };
    if (typeof view.PointerEvent === "function") {
      element.dispatchEvent(
        new view.PointerEvent("pointerdown", {
          ...common,
          pointerId: 1,
          pointerType: "mouse",
          isPrimary: true,
          buttons: 1,
        }),
      );
    }
    element.dispatchEvent(new view.MouseEvent("mousedown", { ...common, buttons: 1 }));
    if (isHtmlElement(element)) element.focus({ preventScroll: true });
    if (typeof view.PointerEvent === "function") {
      element.dispatchEvent(
        new view.PointerEvent("pointerup", {
          ...common,
          pointerId: 1,
          pointerType: "mouse",
          isPrimary: true,
          buttons: 0,
        }),
      );
    }
    element.dispatchEvent(new view.MouseEvent("mouseup", { ...common, buttons: 0 }));
    element.dispatchEvent(new view.MouseEvent("click", { ...common, buttons: 0 }));
    await Promise.resolve();
  } finally {
    ownerDocument.removeEventListener("submit", formGuard, true);
    ownerDocument.removeEventListener("reset", formGuard, true);
  }
  if (blockedFormAction) {
    throw new ContentCommandError(
      "POLICY_DENIED",
      "The coordinate click attempted an indirect form submit or reset",
      false,
    );
  }
  await new Promise<void>((resolve) => setTimeout(resolve, 50));
  const domChanged = advanceRevisionAfterAction(revisionBefore);
  const urlAfter = sanitizeUrl(location.href);
  return {
    page: { urlBefore, urlAfter, origin: currentOrigin() },
    documentId: runtime.documentId,
    domRevisionBefore: revisionBefore,
    domRevisionAfter: runtime.domRevision,
    coordinates: { x: parameters.x, y: parameters.y },
    target: safeTarget(element),
    clicked: true,
    domChanged,
    urlChanged: urlAfter !== urlBefore,
    requiresNewSnapshot: true,
  };
};

const performGesture = async (
  parameters: PerformGestureParameters,
): Promise<PerformGestureData> => {
  const revisionBefore = runtime.domRevision;
  let element: Element | undefined;
  let targetElement: Element | undefined;
  if (parameters.operation === "scroll_by" || parameters.operation === "scroll_to") {
    assertCurrentRevision(parameters);
  } else {
    element = resolveRevisionBoundElement(parameters);
    if (!isVisible(element) || isDisabled(element)) {
      throw new ContentCommandError(
        "ELEMENT_NOT_INTERACTABLE",
        "The gesture target is not visible and enabled",
        true,
      );
    }
    if (parameters.operation === "drag_and_drop") {
      targetElement = resolveRevisionBoundElement({
        ...parameters,
        elementId: parameters.targetElementId,
      });
      if (!isVisible(targetElement) || isDisabled(targetElement)) {
        throw new ContentCommandError(
          "ELEMENT_NOT_INTERACTABLE",
          "The drag destination is not visible and enabled",
          true,
        );
      }
    }
  }

  let blockedFormAction = false;
  const ownerDocument = element?.ownerDocument ?? document;
  const formGuard = (event: Event): void => {
    blockedFormAction = true;
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  ownerDocument.addEventListener("submit", formGuard, true);
  ownerDocument.addEventListener("reset", formGuard, true);
  try {
    if (parameters.operation === "scroll_by") {
      window.scrollBy({ left: parameters.deltaX, top: parameters.deltaY, behavior: "instant" });
    } else if (parameters.operation === "scroll_to") {
      window.scrollTo({ left: parameters.x, top: parameters.y, behavior: "instant" });
    } else if (parameters.operation === "scroll_into_view") {
      element!.scrollIntoView({ block: "center", inline: "center", behavior: "instant" });
    } else if (parameters.operation === "focus") {
      if (!isHtmlElement(element!)) {
        throw new ContentCommandError(
          "ELEMENT_NOT_INTERACTABLE",
          "The target does not support programmatic focus",
          false,
        );
      }
      element.focus({ preventScroll: true });
    } else if (parameters.operation === "blur") {
      if (!isHtmlElement(element!)) {
        throw new ContentCommandError(
          "ELEMENT_NOT_INTERACTABLE",
          "The target does not support programmatic blur",
          false,
        );
      }
      element.blur();
    } else if (parameters.operation === "hover") {
      const view = ownerWindow(element!);
      const rect = element!.getBoundingClientRect();
      const common = {
        bubbles: true,
        cancelable: true,
        composed: true,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
        button: 0,
        buttons: 0,
        view,
      };
      if (typeof view.PointerEvent === "function") {
        element!.dispatchEvent(
          new view.PointerEvent("pointerover", {
            ...common,
            pointerId: 1,
            pointerType: "mouse",
            isPrimary: true,
          }),
        );
        element!.dispatchEvent(
          new view.PointerEvent("pointerenter", {
            ...common,
            bubbles: false,
            pointerId: 1,
            pointerType: "mouse",
            isPrimary: true,
          }),
        );
        element!.dispatchEvent(
          new view.PointerEvent("pointermove", {
            ...common,
            pointerId: 1,
            pointerType: "mouse",
            isPrimary: true,
          }),
        );
      }
      element!.dispatchEvent(new view.MouseEvent("mouseover", common));
      element!.dispatchEvent(new view.MouseEvent("mouseenter", { ...common, bubbles: false }));
      element!.dispatchEvent(new view.MouseEvent("mousemove", common));
    } else if (
      parameters.operation === "double_click" ||
      parameters.operation === "context_click"
    ) {
      if (
        parameters.operation === "double_click" &&
        (isSubmitControl(element!) || isResetControl(element!))
      ) {
        throw new ContentCommandError(
          "POLICY_DENIED",
          "Double-click gestures cannot activate submit or reset controls; use the dedicated authorized action",
          false,
        );
      }
      const view = ownerWindow(element!);
      const rect = element!.getBoundingClientRect();
      const button = parameters.operation === "context_click" ? 2 : 0;
      const common = {
        bubbles: true,
        cancelable: true,
        composed: true,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
        button,
        buttons: button === 2 ? 2 : 1,
        view,
      };
      const dispatchPointer = (type: string, detail: number): void => {
        if (typeof view.PointerEvent === "function") {
          element!.dispatchEvent(
            new view.PointerEvent(type, {
              ...common,
              pointerId: 1,
              pointerType: "mouse",
              isPrimary: true,
              detail,
            }),
          );
        }
      };
      if (parameters.operation === "context_click") {
        dispatchPointer("pointerdown", 1);
        element!.dispatchEvent(new view.MouseEvent("mousedown", { ...common, detail: 1 }));
        dispatchPointer("pointerup", 1);
        element!.dispatchEvent(new view.MouseEvent("mouseup", { ...common, detail: 1 }));
        element!.dispatchEvent(
          new view.MouseEvent("contextmenu", { ...common, buttons: 0, detail: 1 }),
        );
      } else {
        for (let detail = 1; detail <= 2; detail += 1) {
          dispatchPointer("pointerdown", detail);
          element!.dispatchEvent(new view.MouseEvent("mousedown", { ...common, detail }));
          dispatchPointer("pointerup", detail);
          element!.dispatchEvent(new view.MouseEvent("mouseup", { ...common, detail }));
          element!.dispatchEvent(new view.MouseEvent("click", { ...common, buttons: 0, detail }));
        }
        element!.dispatchEvent(
          new view.MouseEvent("dblclick", { ...common, buttons: 0, detail: 2 }),
        );
      }
    } else if (parameters.operation === "press_key") {
      if (
        (parameters.key === "Enter" || parameters.key === "Space") &&
        (isSubmitControl(element!) || isResetControl(element!))
      ) {
        throw new ContentCommandError(
          "POLICY_DENIED",
          "Keyboard gestures cannot activate submit or reset controls; use the dedicated authorized action",
          false,
        );
      }
      if (isHtmlElement(element!)) element.focus({ preventScroll: true });
      const view = ownerWindow(element!);
      const key = parameters.key === "Space" ? " " : parameters.key;
      const code = parameters.code ?? (parameters.key === "Space" ? "Space" : parameters.key);
      const common = {
        key,
        code,
        bubbles: true,
        cancelable: true,
        composed: true,
        ctrlKey: parameters.ctrl,
        altKey: parameters.alt,
        metaKey: parameters.meta,
        shiftKey: parameters.shift,
        view,
      };
      const proceed = element!.dispatchEvent(new view.KeyboardEvent("keydown", common));
      if (parameters.key === "Tab" && proceed) {
        const focusable = [
          ...ownerDocument.querySelectorAll<HTMLElement>(
            [
              "a[href]",
              "button:not([disabled])",
              "input:not([disabled]):not([type=hidden])",
              "select:not([disabled])",
              "textarea:not([disabled])",
              "[contenteditable=true]",
              "[tabindex]:not([tabindex='-1'])",
            ].join(","),
          ),
        ].filter((candidate) => isVisible(candidate));
        const currentIndex = focusable.indexOf(element! as HTMLElement);
        const offset = parameters.shift ? -1 : 1;
        const nextIndex =
          currentIndex < 0
            ? parameters.shift
              ? focusable.length - 1
              : 0
            : (currentIndex + offset + focusable.length) % focusable.length;
        focusable[nextIndex]?.focus({ preventScroll: true });
      }
      element!.dispatchEvent(new view.KeyboardEvent("keyup", common));
    } else if (parameters.operation === "drag_and_drop") {
      const source = element!;
      const destination = targetElement!;
      const view = ownerWindow(source);
      source.scrollIntoView({ block: "center", inline: "center", behavior: "instant" });
      destination.scrollIntoView({ block: "center", inline: "center", behavior: "instant" });
      const sourceRect = source.getBoundingClientRect();
      const targetRect = destination.getBoundingClientRect();
      const start = {
        x: sourceRect.left + sourceRect.width / 2,
        y: sourceRect.top + sourceRect.height / 2,
      };
      const end = {
        x: targetRect.left + targetRect.width / 2,
        y: targetRect.top + targetRect.height / 2,
      };
      let dataTransfer: DataTransfer | undefined;
      try {
        dataTransfer = new view.DataTransfer();
      } catch {
        dataTransfer = undefined;
      }
      const dragEvent = (type: string, target: Element, x: number, y: number): void => {
        target.dispatchEvent(
          new view.DragEvent(type, {
            bubbles: true,
            cancelable: true,
            composed: true,
            clientX: x,
            clientY: y,
            dataTransfer,
          }),
        );
      };
      dragEvent("dragstart", source, start.x, start.y);
      for (let step = 1; step <= parameters.steps; step += 1) {
        const ratio = step / parameters.steps;
        const x = start.x + (end.x - start.x) * ratio;
        const y = start.y + (end.y - start.y) * ratio;
        dragEvent("drag", source, x, y);
        dragEvent(step === 1 ? "dragenter" : "dragover", destination, x, y);
      }
      dragEvent("drop", destination, end.x, end.y);
      dragEvent("dragend", source, end.x, end.y);
    } else {
      throw new ContentCommandError("INVALID_MESSAGE", "Unsupported gesture operation", false);
    }
    await Promise.resolve();
  } finally {
    ownerDocument.removeEventListener("submit", formGuard, true);
    ownerDocument.removeEventListener("reset", formGuard, true);
  }
  if (blockedFormAction) {
    throw new ContentCommandError(
      "POLICY_DENIED",
      "The gesture attempted an indirect form submit or reset; use the dedicated authorized action",
      false,
    );
  }
  await new Promise<void>((resolve) => setTimeout(resolve, 50));
  const domChanged = advanceRevisionAfterAction(revisionBefore);
  const resolvedElementId =
    element === undefined ? undefined : resolvedElementIdAfterAction(element);
  const resolvedTargetElementId =
    targetElement === undefined ? undefined : resolvedElementIdAfterAction(targetElement);
  return {
    page: { url: sanitizeUrl(location.href), origin: currentOrigin() },
    documentId: runtime.documentId,
    domRevisionBefore: revisionBefore,
    domRevisionAfter: runtime.domRevision,
    operation: parameters.operation,
    ...("elementId" in parameters ? { elementId: parameters.elementId } : {}),
    ...(resolvedElementId === undefined ? {} : { resolvedElementId }),
    ...("targetElementId" in parameters ? { targetElementId: parameters.targetElementId } : {}),
    ...(resolvedTargetElementId === undefined ? {} : { resolvedTargetElementId }),
    ...("key" in parameters ? { key: parameters.key } : {}),
    ...("code" in parameters && parameters.code !== undefined ? { code: parameters.code } : {}),
    ...("key" in parameters
      ? {
          modifiers: {
            ctrl: parameters.ctrl,
            alt: parameters.alt,
            meta: parameters.meta,
            shift: parameters.shift,
          },
        }
      : {}),
    ...(parameters.operation === "scroll_by" || parameters.operation === "scroll_to"
      ? { scroll: { x: window.scrollX, y: window.scrollY } }
      : {}),
    performed: true,
    domChanged,
    requiresNewSnapshot: true,
  };
};

const setNativeValue = (element: HTMLInputElement | HTMLTextAreaElement, value: string): void => {
  const view = ownerWindow(element);
  const prototype = isInputElement(element)
    ? view.HTMLInputElement.prototype
    : view.HTMLTextAreaElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  if (setter === undefined) {
    throw new ContentCommandError(
      "ELEMENT_NOT_INTERACTABLE",
      "The target field does not expose a writable value",
      false,
    );
  }
  setter.call(element, value);
};

const setNativeChecked = (element: HTMLInputElement, checked: boolean): void => {
  const setter = Object.getOwnPropertyDescriptor(
    ownerWindow(element).HTMLInputElement.prototype,
    "checked",
  )?.set;
  if (setter === undefined) {
    throw new ContentCommandError(
      "ELEMENT_NOT_INTERACTABLE",
      "The target control does not expose a writable checked state",
      false,
    );
  }
  setter.call(element, checked);
};

const editContentEditable = (
  element: HTMLElement,
  text: string,
  mode: TypeTextParameters["mode"],
): { previousValue: string; nextValue: string } => {
  const ownerDocument = element.ownerDocument;
  const previousValue = element.innerText;
  const selection = ownerDocument.getSelection();
  if (selection === null) {
    throw new ContentCommandError(
      "ELEMENT_NOT_INTERACTABLE",
      "The editable document does not expose a text selection",
      false,
    );
  }
  element.focus({ preventScroll: true });
  const range = ownerDocument.createRange();
  range.selectNodeContents(element);
  if (mode === "append") range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
  if (mode === "replace") {
    selection.deleteFromDocument();
  }
  const inserted = ownerDocument.execCommand("insertText", false, text);
  if (!inserted && text.length > 0) {
    const activeRange = selection.rangeCount > 0 ? selection.getRangeAt(0) : range;
    const textNode = ownerDocument.createTextNode(text);
    activeRange.insertNode(textNode);
    activeRange.setStartAfter(textNode);
    activeRange.collapse(true);
    selection.removeAllRanges();
    selection.addRange(activeRange);
  }
  return { previousValue, nextValue: element.innerText };
};

const isModelBackedEditor = (element: Element): boolean =>
  element.closest(".CodeMirror, .cm-editor, .ace_editor, .monaco-editor, .ql-container") !== null ||
  element.matches(".mce-content-body");

const performTypeText = async (
  parameters: TypeTextParameters,
  markerToken: string,
): Promise<{ result: TypeTextData; modelEditorExpected: boolean }> => {
  const element = resolveRevisionBoundElement(parameters);
  const revisionBefore = runtime.domRevision;
  const target = safeTarget(element);
  if (!isVisible(element) || isDisabled(element) || !isEditable(element)) {
    throw new ContentCommandError(
      "ELEMENT_NOT_INTERACTABLE",
      "The target element is not visible, enabled, and editable",
      true,
    );
  }
  if (target.sensitive) {
    throw new ContentCommandError(
      "POLICY_DENIED",
      "Typing into sensitive fields requires the Phase 3 confirmation workflow",
      false,
    );
  }

  let previousValue: string;
  let nextValue: string;
  let modelEditorExpected = false;
  if (isInputElement(element) || isTextAreaElement(element)) {
    if (isInputElement(element) && NON_TEXT_INPUT_TYPES.has(element.type)) {
      throw new ContentCommandError(
        "ELEMENT_NOT_INTERACTABLE",
        "The input type does not accept text",
        false,
      );
    }
    previousValue = element.value;
    nextValue =
      parameters.mode === "append" ? `${previousValue}${parameters.text}` : parameters.text;
    const inputType = parameters.mode === "append" ? "insertText" : "insertReplacementText";
    const beforeInput = createInputEvent(element, "beforeinput", parameters.text, inputType, true);
    if (!element.dispatchEvent(beforeInput)) {
      throw new ContentCommandError(
        "ELEMENT_NOT_INTERACTABLE",
        "The page cancelled text input",
        true,
      );
    }
    setNativeValue(element, nextValue);
  } else if (isContentEditableElement(element)) {
    const inputType = parameters.mode === "append" ? "insertText" : "insertReplacementText";
    if (isModelBackedEditor(element)) {
      previousValue = element.innerText;
      nextValue =
        parameters.mode === "append" ? `${previousValue}${parameters.text}` : parameters.text;
      element.setAttribute(TYPE_TEXT_TARGET_ATTRIBUTE, markerToken);
      modelEditorExpected = true;
    } else {
      if (
        !element.dispatchEvent(
          createInputEvent(element, "beforeinput", parameters.text, inputType, true),
        )
      ) {
        throw new ContentCommandError(
          "ELEMENT_NOT_INTERACTABLE",
          "The WYSIWYG editor cancelled text input",
          true,
        );
      }
      ({ previousValue, nextValue } = editContentEditable(
        element,
        parameters.text,
        parameters.mode,
      ));
    }
  } else {
    throw new ContentCommandError(
      "ELEMENT_NOT_INTERACTABLE",
      "The target does not support text input",
      false,
    );
  }

  if (!modelEditorExpected) {
    element.dispatchEvent(
      createInputEvent(
        element,
        "input",
        parameters.text,
        parameters.mode === "append" ? "insertText" : "insertReplacementText",
      ),
    );
    if (parameters.dispatchChange) {
      element.dispatchEvent(createEvent(element, "change"));
    }
  }
  await Promise.resolve();
  advanceRevisionAfterAction(revisionBefore);
  const resolvedElementId = resolvedElementIdAfterAction(element);
  return {
    modelEditorExpected,
    result: {
      page: {
        url: sanitizeUrl(location.href),
        origin: currentOrigin(),
      },
      documentId: runtime.documentId,
      domRevisionBefore: revisionBefore,
      domRevisionAfter: runtime.domRevision,
      elementId: parameters.elementId,
      ...(resolvedElementId === undefined ? {} : { resolvedElementId }),
      target,
      mode: parameters.mode,
      characters: parameters.text.length,
      changed: previousValue !== nextValue,
      requiresNewSnapshot: true,
    },
  };
};

const sanitizedWordPressMenuItems = (
  items: GetWordPressMenuData["items"],
): GetWordPressMenuData["items"] =>
  items.map((item) => ({
    ...item,
    ...(item.url === undefined ? {} : { url: sanitizeUrl(item.url) }),
  }));

const rethrowWordPressMenuError = (error: unknown): never => {
  if (error instanceof WordPressMenuContentError) {
    throw new ContentCommandError(error.code, error.message, error.retryable);
  }
  throw error;
};

const performGetWordPressMenu = (parameters: GetWordPressMenuParameters): GetWordPressMenuData => {
  synchronizeDomRevision();
  try {
    const inspected = inspectWordPressMenu(parameters.maxItems);
    return {
      page: { url: sanitizeUrl(location.href), origin: currentOrigin() },
      documentId: runtime.documentId,
      domRevision: runtime.domRevision,
      ...inspected,
      items: sanitizedWordPressMenuItems(inspected.items),
    };
  } catch (error) {
    return rethrowWordPressMenuError(error);
  }
};

const performEditWordPressMenu = async (
  parameters: EditWordPressMenuParameters,
): Promise<EditWordPressMenuData> => {
  assertCurrentRevision(parameters);
  const revisionBefore = runtime.domRevision;
  try {
    const edited = editWordPressMenu(parameters);
    await Promise.resolve();
    if (edited.changed) advanceRevisionAfterAction(revisionBefore);
    else synchronizeDomRevision();
    return {
      page: { url: sanitizeUrl(location.href), origin: currentOrigin() },
      documentId: runtime.documentId,
      domRevisionBefore: revisionBefore,
      domRevisionAfter: runtime.domRevision,
      ...edited,
      items: sanitizedWordPressMenuItems(edited.items),
      verificationRequired: edited.submitted,
      requiresNewSnapshot: true,
    };
  } catch (error) {
    return rethrowWordPressMenuError(error);
  }
};

const rethrowWordPressAdminError = (error: unknown): never => {
  if (error instanceof WordPressAdminContentError) {
    throw new ContentCommandError(error.code, error.message, error.retryable);
  }
  throw error;
};

const performGetWordPressAdmin = (
  parameters: GetWordPressAdminParameters,
): GetWordPressAdminData => {
  synchronizeDomRevision();
  try {
    return {
      page: { url: sanitizeUrl(location.href), origin: currentOrigin() },
      documentId: runtime.documentId,
      domRevision: runtime.domRevision,
      ...inspectWordPressAdmin(parameters),
    };
  } catch (error) {
    return rethrowWordPressAdminError(error);
  }
};

const performWordPressAdminListAction = async (
  parameters: WordPressListTableActionParameters,
): Promise<WordPressListTableActionData> => {
  assertCurrentRevision(parameters);
  const revisionBefore = runtime.domRevision;
  const urlBefore = sanitizeUrl(location.href);
  try {
    const result = performWordPressListTableAction(parameters);
    await Promise.resolve();
    advanceRevisionAfterAction(revisionBefore);
    return {
      page: {
        urlBefore,
        urlAfter: sanitizeUrl(location.href),
        origin: currentOrigin(),
      },
      documentId: runtime.documentId,
      domRevisionBefore: revisionBefore,
      domRevisionAfter: runtime.domRevision,
      ...result,
      triggered: true,
      verificationRequired: true,
      requiresNewSnapshot: true,
    };
  } catch (error) {
    return rethrowWordPressAdminError(error);
  }
};

const BLOCKED_MUTATION_ATTRIBUTES = new Set([
  "action",
  "background",
  "data",
  "formaction",
  "manifest",
  "ping",
  "poster",
  "src",
  "srcdoc",
  "srcset",
  "value",
  "xlink:href",
]);
const URL_MUTATION_ATTRIBUTES = new Set(["action", "cite", "formaction", "href", "poster", "src"]);
const BLOCKED_MUTATION_TARGETS = new Set([
  "base",
  "embed",
  "iframe",
  "link",
  "meta",
  "object",
  "script",
  "style",
  "use",
]);
const BLOCKED_INSERTED_ELEMENTS = new Set([
  "animate",
  "animatecolor",
  "animatemotion",
  "animatetransform",
  "base",
  "embed",
  "feimage",
  "iframe",
  "image",
  "link",
  "meta",
  "object",
  "script",
  "set",
  "style",
  "use",
]);
const BLOCKED_INSERTED_ATTRIBUTES = new Set([
  "action",
  "background",
  "data",
  "formaction",
  "manifest",
  "ping",
  "poster",
  "src",
  "srcdoc",
  "srcset",
  "style",
  "value",
  "xlink:href",
]);

const safeMutationUrl = (value: string, baseUrl: string): boolean => {
  if (value.trim().length === 0 || value.startsWith("#")) return true;
  try {
    const parsed = new URL(value, baseUrl);
    return (
      ["http:", "https:"].includes(parsed.protocol) &&
      parsed.username.length === 0 &&
      parsed.password.length === 0
    );
  } catch {
    return false;
  }
};

const assertSafeMutationAttribute = (element: Element, name: string, value?: string): void => {
  const normalized = name.toLowerCase();
  if (
    INTERNAL_MUTATION_ATTRIBUTES.has(normalized) ||
    normalized.startsWith("on") ||
    normalized === "style" ||
    BLOCKED_MUTATION_ATTRIBUTES.has(normalized) ||
    SENSITIVE_FIELD.test(normalized)
  ) {
    throw new ContentCommandError(
      "POLICY_DENIED",
      `Attribute ${normalized} is not available through typed DOM mutation`,
      false,
    );
  }
  if (
    normalized === "href" &&
    !(isTag<HTMLAnchorElement>(element, "a") || isTag<HTMLAreaElement>(element, "area"))
  ) {
    throw new ContentCommandError(
      "POLICY_DENIED",
      "Attribute href is available only on ordinary HTML links through typed DOM mutation",
      false,
    );
  }
  if (
    value !== undefined &&
    URL_MUTATION_ATTRIBUTES.has(normalized) &&
    !safeMutationUrl(value, element.ownerDocument.baseURI)
  ) {
    throw new ContentCommandError(
      "POLICY_DENIED",
      `Attribute ${normalized} requires a credential-free HTTP(S) or fragment URL`,
      false,
    );
  }
};

const assertSafeAttributeRemoval = (name: string): void => {
  const normalized = name.toLowerCase();
  if (INTERNAL_MUTATION_ATTRIBUTES.has(normalized)) {
    throw new ContentCommandError(
      "POLICY_DENIED",
      `Internal bridge attribute ${normalized} cannot be removed through DOM mutation`,
      false,
    );
  }
};

const sanitizedHtml = (element: Element, html: string): string => {
  const template = element.ownerDocument.createElement("template");
  template.innerHTML = html;
  for (const candidate of [...template.content.querySelectorAll("*")]) {
    if (BLOCKED_INSERTED_ELEMENTS.has(candidate.tagName.toLowerCase())) {
      candidate.remove();
      continue;
    }
    for (const attribute of [...candidate.attributes]) {
      const name = attribute.name.toLowerCase();
      if (
        name.startsWith("on") ||
        BLOCKED_INSERTED_ATTRIBUTES.has(name) ||
        SENSITIVE_FIELD.test(name) ||
        (URL_MUTATION_ATTRIBUTES.has(name) &&
          !safeMutationUrl(attribute.value, element.ownerDocument.baseURI))
      ) {
        candidate.removeAttribute(attribute.name);
      }
    }
  }
  return template.innerHTML;
};

const performMutateDom = async (parameters: MutateDomParameters): Promise<MutateDomData> => {
  const element = resolveRevisionBoundElement(parameters);
  if (isSensitive(element)) {
    throw new ContentCommandError(
      "SENSITIVE_INPUT_BLOCKED",
      "Typed DOM mutation is blocked for sensitive elements",
      false,
    );
  }
  const hasUnsafeTargetOperation = parameters.operations.some((operation) =>
    ["set_text", "set_attribute", "set_style", "insert_html", "replace_children_html"].includes(
      operation.type,
    ),
  );
  if (BLOCKED_MUTATION_TARGETS.has(element.tagName.toLowerCase()) && hasUnsafeTargetOperation) {
    throw new ContentCommandError(
      "POLICY_DENIED",
      "Typed DOM mutation cannot target executable, stylesheet, frame, metadata, or resource-loader elements",
      false,
    );
  }
  const removalIndex = parameters.operations.findIndex(
    (operation) => operation.type === "remove_element",
  );
  if (removalIndex >= 0 && removalIndex !== parameters.operations.length - 1) {
    throw new ContentCommandError(
      "INVALID_MESSAGE",
      "remove_element must be the final DOM mutation operation",
      false,
    );
  }
  const revisionBefore = runtime.domRevision;
  let changed = false;
  let elementRemoved = false;
  let usedHtmlSanitizer = false;
  for (const operation of parameters.operations) {
    if (operation.type === "set_text") {
      if (element.textContent !== operation.text) {
        element.textContent = operation.text;
        changed = true;
      }
    } else if (operation.type === "set_attribute") {
      assertSafeMutationAttribute(element, operation.name, operation.value);
      if (element.getAttribute(operation.name) !== operation.value) {
        element.setAttribute(operation.name, operation.value);
        changed = true;
      }
    } else if (operation.type === "remove_attribute") {
      assertSafeAttributeRemoval(operation.name);
      if (element.hasAttribute(operation.name)) {
        element.removeAttribute(operation.name);
        changed = true;
      }
    } else if (operation.type === "set_style") {
      if (containsUnsafeCss(`${operation.property}:${operation.value}`)) {
        throw new ContentCommandError(
          "POLICY_DENIED",
          "Inline CSS cannot use escapes/comments, external resources, credential side channels, password-mask overrides, or executable legacy constructs",
          false,
        );
      }
      if (!isHtmlElement(element) && element.namespaceURI !== "http://www.w3.org/2000/svg") {
        throw new ContentCommandError(
          "ELEMENT_NOT_INTERACTABLE",
          "The target does not expose inline style declarations",
          false,
        );
      }
      const styledElement = element as HTMLElement | SVGElement;
      const previous = styledElement.style.getPropertyValue(operation.property);
      const previousPriority = styledElement.style.getPropertyPriority(operation.property);
      styledElement.style.setProperty(operation.property, operation.value, operation.priority);
      if (previous !== operation.value || previousPriority !== operation.priority) changed = true;
    } else if (operation.type === "remove_style") {
      if (!isHtmlElement(element) && element.namespaceURI !== "http://www.w3.org/2000/svg") {
        throw new ContentCommandError(
          "ELEMENT_NOT_INTERACTABLE",
          "The target does not expose inline style declarations",
          false,
        );
      }
      if ((element as HTMLElement | SVGElement).style.removeProperty(operation.property).length > 0)
        changed = true;
    } else if (operation.type === "insert_html") {
      if (
        (operation.position === "beforebegin" || operation.position === "afterend") &&
        element.parentElement === null
      ) {
        throw new ContentCommandError(
          "ELEMENT_NOT_INTERACTABLE",
          "The requested adjacent HTML position requires a parent element",
          false,
        );
      }
      element.insertAdjacentHTML(operation.position, sanitizedHtml(element, operation.html));
      usedHtmlSanitizer = true;
      changed = true;
    } else if (operation.type === "replace_children_html") {
      element.innerHTML = sanitizedHtml(element, operation.html);
      usedHtmlSanitizer = true;
      changed = true;
    } else if (operation.type === "remove_element") {
      element.remove();
      elementRemoved = true;
      changed = true;
    }
  }
  await Promise.resolve();
  advanceRevisionAfterAction(revisionBefore);
  const resolvedElementId = elementRemoved ? undefined : resolvedElementIdAfterAction(element);
  return {
    page: { url: sanitizeUrl(location.href), origin: currentOrigin() },
    documentId: runtime.documentId,
    domRevisionBefore: revisionBefore,
    domRevisionAfter: runtime.domRevision,
    elementId: parameters.elementId,
    ...(resolvedElementId === undefined ? {} : { resolvedElementId }),
    operationTypes: parameters.operations.map((operation) => operation.type),
    operationsApplied: parameters.operations.length,
    sanitizedHtml: usedHtmlSanitizer,
    elementRemoved,
    changed,
    requiresNewSnapshot: true,
  };
};

const safeAttributeValue = (element: Element, name: string, value: string): string => {
  const normalized = name.toLowerCase();
  if (
    normalized === "value" ||
    normalized === "srcdoc" ||
    normalized.startsWith("on") ||
    SENSITIVE_FIELD.test(normalized)
  ) {
    return REDACTED;
  }
  if (URL_MUTATION_ATTRIBUTES.has(normalized)) return sanitizeUrl(value);
  return SENSITIVE_FIELD.test(value) ? REDACTED : normalizeText(value).slice(0, 4_000);
};

const inspectionSummary = (element: Element): InspectElementData["element"] => {
  const role = getRole(element);
  const rect = element.getBoundingClientRect();
  const sensitive = isSensitive(element);
  const view = element.ownerDocument.defaultView ?? window;
  const customConstructor = element.localName.includes("-")
    ? view.customElements?.get(element.localName)
    : undefined;
  const style =
    isHtmlElement(element) || element.namespaceURI === "http://www.w3.org/2000/svg"
      ? (element as HTMLElement | SVGElement).style
      : null;
  return {
    tag: element.tagName.toLowerCase(),
    id: SENSITIVE_FIELD.test(element.id) ? REDACTED : element.id.slice(0, 256),
    classes: [...element.classList]
      .filter((className) => !SENSITIVE_FIELD.test(className))
      .slice(0, 100)
      .map((className) => className.slice(0, 256)),
    role: role.slice(0, 128),
    name: sensitive ? REDACTED : normalizeText(accessibleName(element)).slice(0, 1_000),
    selector: sensitive ? "[REDACTED]" : safeCssSelector(element),
    text: sensitive ? REDACTED : normalizeText(element.textContent ?? "").slice(0, 2_000),
    sensitive,
    visible: isVisible(element),
    enabled: !isDisabled(element),
    editable: isEditable(element),
    clickable: isClickable(element, role),
    ...(element.localName.includes("-")
      ? {
          customElement: {
            defined: customConstructor !== undefined,
            constructorName: (customConstructor?.name ?? "").slice(0, 256),
          },
        }
      : {}),
    box: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
    attributes: [...element.attributes]
      .filter(
        (attribute) =>
          !["style", ...INTERNAL_MUTATION_ATTRIBUTES].includes(attribute.name.toLowerCase()),
      )
      .slice(0, 200)
      .map((attribute) => ({
        name: attribute.name.slice(0, 256),
        value: safeAttributeValue(element, attribute.name, attribute.value),
      })),
    inlineStyle:
      style === null
        ? []
        : [...Array.from({ length: style.length }, (_, index) => style.item(index))]
            .filter((name) => name.length > 0)
            .slice(0, 200)
            .map((name) => ({
              name: name.slice(0, 256),
              value: `${style.getPropertyValue(name)}${
                style.getPropertyPriority(name) === "important" ? " !important" : ""
              }`.slice(0, 4_000),
            })),
    computedStyle: [],
  };
};

const prepareElementInspection = (
  parameters: InspectElementParameters,
): PreparedElementInspectionData => {
  const element = resolveRevisionBoundElement(parameters);
  if (element.hasAttribute(INSPECT_TARGET_ATTRIBUTE)) {
    throw new ContentCommandError(
      "ELEMENT_NOT_INTERACTABLE",
      "The element already has an inspection in progress",
      true,
    );
  }
  const token = createContentId();
  element.setAttribute(INSPECT_TARGET_ATTRIBUTE, token);
  runtime.pendingElementInspections.set(token, { element });
  const summary = inspectionSummary(element);
  const computed = (element.ownerDocument.defaultView ?? window).getComputedStyle(element);
  summary.computedStyle = parameters.computedStyleProperties.map((name) => ({
    name,
    value: computed.getPropertyValue(name).slice(0, 4_000),
  }));
  const ancestors: InspectElementData["ancestors"] = [];
  let ancestor = element.parentElement;
  while (ancestor !== null && ancestors.length < 12) {
    const ancestorRole = getRole(ancestor);
    ancestors.push({
      tag: ancestor.tagName.toLowerCase(),
      id: SENSITIVE_FIELD.test(ancestor.id) ? REDACTED : ancestor.id.slice(0, 256),
      classes: [...ancestor.classList]
        .filter((className) => !SENSITIVE_FIELD.test(className))
        .slice(0, 100)
        .map((className) => className.slice(0, 256)),
      role: ancestorRole.slice(0, 128),
      name: isSensitive(ancestor)
        ? REDACTED
        : normalizeText(accessibleName(ancestor)).slice(0, 1_000),
      selector: isSensitive(ancestor) ? "[REDACTED]" : safeCssSelector(ancestor),
    });
    ancestor = ancestor.parentElement;
  }
  return {
    token,
    base: {
      page: { url: sanitizeUrl(location.href), origin: currentOrigin() },
      documentId: runtime.documentId,
      domRevision: runtime.domRevision,
      elementId: parameters.elementId,
      element: summary,
      ancestors,
    },
  };
};

const completeElementInspection = (token: string): { completed: true } => {
  const pending = runtime.pendingElementInspections.get(token);
  runtime.pendingElementInspections.delete(token);
  if (pending !== undefined) pending.element.removeAttribute(INSPECT_TARGET_ATTRIBUTE);
  return { completed: true };
};

const eventTargetElement = (event: Event): Element => {
  const target = event.target;
  if (isDomElement(target)) return target;
  if (typeof target === "object" && target !== null) {
    const parent = (target as Readonly<{ parentElement?: unknown }>).parentElement;
    if (isDomElement(parent)) return parent;
  }
  return document.documentElement;
};

const eventPhase = (phase: number): "capturing" | "target" | "bubbling" | "none" =>
  phase === Event.CAPTURING_PHASE
    ? "capturing"
    : phase === Event.AT_TARGET
      ? "target"
      : phase === Event.BUBBLING_PHASE
        ? "bubbling"
        : "none";

const eventElementSummary = (element: Element): ObserveEventsData["events"][number]["target"] => {
  const sensitive = isSensitive(element);
  return {
    tag: element.tagName.toLowerCase(),
    id: sensitive || SENSITIVE_FIELD.test(element.id) ? REDACTED : element.id.slice(0, 256),
    classes: [...element.classList]
      .filter((className) => !SENSITIVE_FIELD.test(className))
      .slice(0, 100)
      .map((className) => className.slice(0, 256)),
    role: getRole(element).slice(0, 128),
    name: sensitive ? REDACTED : normalizeText(accessibleName(element)).slice(0, 1_000),
    selector: sensitive ? "[REDACTED]" : safeCssSelector(element),
  };
};

const accessibleDocuments = (): Document[] => {
  const output: Document[] = [];
  const visit = (current: Document, depth: number): void => {
    if (output.includes(current) || depth > 8) return;
    output.push(current);
    for (const frame of [...current.querySelectorAll("iframe")]) {
      try {
        if (frame.contentDocument !== null) visit(frame.contentDocument, depth + 1);
      } catch {
        // Cross-origin frame: content access is intentionally unavailable.
      }
    }
  };
  visit(document, 0);
  return output;
};

const stopEventCapture = (capture: CapturedEventState): void => {
  for (const registration of capture.listeners) {
    registration.document.removeEventListener(registration.type, registration.listener, true);
  }
  capture.listeners = [];
};

const eventCaptureResult = (
  tabId: number,
  operation: ObserveEventsData["operation"],
  capture: CapturedEventState,
  active: boolean,
  events: ObserveEventsData["events"],
  cleared: boolean,
): ObserveEventsData => ({
  tabId,
  operation,
  captureId: capture.captureId,
  active,
  startedAt: capture.startedAt,
  eventTypes: capture.eventTypes,
  scoped: capture.scopeElement !== undefined,
  events,
  eventCount: events.length,
  droppedEvents: capture.droppedEvents,
  cleared,
});

const performObserveEvents = (parameters: ObserveEventsParameters): ObserveEventsData => {
  if (parameters.operation === "start") {
    if (runtime.eventCapture !== undefined) {
      throw new ContentCommandError(
        "ELEMENT_NOT_INTERACTABLE",
        "An event capture is already active in this tab; stop it before starting another",
        false,
      );
    }
    const scopeElement =
      parameters.scope === undefined ? undefined : resolveRevisionBoundElement(parameters.scope);
    const startedAtMs = Date.now();
    const capture: CapturedEventState = {
      captureId: createContentId(),
      startedAt: new Date(startedAtMs).toISOString(),
      startedAtMs,
      eventTypes: [...parameters.eventTypes],
      maxEvents: parameters.maxEvents,
      ...(scopeElement === undefined ? {} : { scopeElement }),
      events: [],
      droppedEvents: 0,
      nextSequence: 1,
      listeners: [],
    };
    const listener: EventListener = (event) => {
      const target = eventTargetElement(event);
      if (
        capture.scopeElement !== undefined &&
        target !== capture.scopeElement &&
        !capture.scopeElement.contains(target)
      ) {
        return;
      }
      const sensitive = isSensitive(target);
      const record: ObserveEventsData["events"][number] = {
        sequence: capture.nextSequence,
        elapsedMs: Math.max(0, Date.now() - capture.startedAtMs),
        type: event.type.slice(0, 128),
        isTrusted: event.isTrusted,
        defaultPrevented: event.defaultPrevented,
        phase: eventPhase(event.eventPhase),
        target: eventElementSummary(target),
        sensitiveTarget: sensitive,
      };
      capture.nextSequence += 1;
      const pointer = event as Event & {
        clientX?: unknown;
        clientY?: unknown;
        button?: unknown;
        pointerType?: unknown;
      };
      if (
        typeof pointer.clientX === "number" &&
        typeof pointer.clientY === "number" &&
        typeof pointer.button === "number"
      ) {
        record.pointer = {
          x: pointer.clientX,
          y: pointer.clientY,
          button: pointer.button,
          pointerType:
            typeof pointer.pointerType === "string" ? pointer.pointerType.slice(0, 64) : "mouse",
        };
      }
      const keyboard = event as Event & {
        key?: unknown;
        code?: unknown;
        altKey?: unknown;
        ctrlKey?: unknown;
        metaKey?: unknown;
        shiftKey?: unknown;
        repeat?: unknown;
      };
      if (typeof keyboard.key === "string" && typeof keyboard.code === "string") {
        record.keyboard = {
          key: sensitive ? REDACTED : keyboard.key.slice(0, 128),
          code: sensitive ? REDACTED : keyboard.code.slice(0, 128),
          altKey: keyboard.altKey === true,
          ctrlKey: keyboard.ctrlKey === true,
          metaKey: keyboard.metaKey === true,
          shiftKey: keyboard.shiftKey === true,
          repeat: keyboard.repeat === true,
        };
      }
      const input = event as Event & { inputType?: unknown };
      if (typeof input.inputType === "string") record.inputType = input.inputType.slice(0, 128);
      if (typeof CustomEvent !== "undefined" && event instanceof CustomEvent) {
        record.customDetailType =
          event.detail === null
            ? "null"
            : Array.isArray(event.detail)
              ? "array"
              : typeof event.detail;
      }
      if (capture.events.length >= capture.maxEvents) {
        capture.events.shift();
        capture.droppedEvents += 1;
      }
      capture.events.push(record);
    };
    for (const currentDocument of accessibleDocuments()) {
      for (const type of capture.eventTypes) {
        currentDocument.addEventListener(type, listener, true);
        capture.listeners.push({ document: currentDocument, type, listener });
      }
    }
    runtime.eventCapture = capture;
    return eventCaptureResult(parameters.tabId, "start", capture, true, [], false);
  }

  const capture = runtime.eventCapture;
  if (capture === undefined || capture.captureId !== parameters.captureId) {
    throw new ContentCommandError(
      "STALE_ELEMENT_REFERENCE",
      "The requested event capture is no longer active in this document",
      false,
    );
  }
  const events = [...capture.events];
  if (parameters.operation === "read") {
    if (parameters.clear) capture.events = [];
    return eventCaptureResult(parameters.tabId, "read", capture, true, events, parameters.clear);
  }
  stopEventCapture(capture);
  runtime.eventCapture = undefined;
  return eventCaptureResult(parameters.tabId, "stop", capture, false, events, false);
};

const cleanupAdvancedTools = (): { cleaned: true } => {
  if (runtime.eventCapture !== undefined) {
    stopEventCapture(runtime.eventCapture);
    runtime.eventCapture = undefined;
  }
  for (const [token, pending] of runtime.pendingElementInspections) {
    pending.element.removeAttribute(INSPECT_TARGET_ATTRIBUTE);
    runtime.pendingElementInspections.delete(token);
  }
  return { cleaned: true };
};

const prepareFileInput = (
  parameters: PrepareFileInputRequestMessage["parameters"],
): PreparedFileInputData => {
  const element = resolveRevisionBoundElement(parameters);
  if (!isInputElement(element) || element.type !== "file" || isDisabled(element)) {
    throw new ContentCommandError(
      "ELEMENT_NOT_INTERACTABLE",
      "The target is not an enabled file input",
      false,
    );
  }
  if (!element.multiple && parameters.fileCount > 1) {
    throw new ContentCommandError(
      "ELEMENT_NOT_INTERACTABLE",
      "The file input does not allow multiple files",
      false,
    );
  }
  if (element.hasAttribute(FILE_INPUT_TARGET_ATTRIBUTE)) {
    throw new ContentCommandError(
      "ELEMENT_NOT_INTERACTABLE",
      "The file input already has an upload operation in progress",
      true,
    );
  }
  const token = createContentId();
  element.setAttribute(FILE_INPUT_TARGET_ATTRIBUTE, token);
  runtime.pendingFileInputs.set(token, {
    element,
    documentId: runtime.documentId,
    domRevisionBefore: runtime.domRevision,
    elementId: parameters.elementId,
  });
  return {
    token,
    documentId: runtime.documentId,
    domRevisionBefore: runtime.domRevision,
    elementId: parameters.elementId,
    multiple: element.multiple,
    accept: element.accept.slice(0, 2_000),
  };
};

const completeFileInput = (
  parameters: CompleteFileInputRequestMessage["parameters"],
  cancelled: boolean,
): SetFileInputFilesData | { cancelled: true } => {
  const pending = runtime.pendingFileInputs.get(parameters.token);
  runtime.pendingFileInputs.delete(parameters.token);
  if (pending === undefined) {
    throw new ContentCommandError(
      "STALE_ELEMENT_REFERENCE",
      "The prepared file input is no longer available",
      true,
    );
  }
  const { element } = pending;
  element.removeAttribute(FILE_INPUT_TARGET_ATTRIBUTE);
  if (cancelled) return { cancelled: true };
  const actualCount = element.files?.length ?? 0;
  if (actualCount !== parameters.fileCount) {
    throw new ContentCommandError(
      "ELEMENT_NOT_INTERACTABLE",
      "Chrome did not attach the expected number of files",
      true,
    );
  }
  advanceRevisionAfterAction(pending.domRevisionBefore);
  const resolvedElementId = resolvedElementIdAfterAction(element);
  return {
    page: { url: sanitizeUrl(location.href), origin: currentOrigin() },
    documentId: pending.documentId,
    domRevisionBefore: pending.domRevisionBefore,
    domRevisionAfter: runtime.domRevision,
    elementId: pending.elementId,
    ...(resolvedElementId === undefined ? {} : { resolvedElementId }),
    fileCount: actualCount,
    countVerified: true,
    multiple: element.multiple,
    accept: element.accept.slice(0, 2_000),
    changed: true,
    requiresNewSnapshot: true,
    verificationRequired: true,
  };
};

const performSelectOption = async (
  parameters: SelectOptionParameters,
): Promise<SelectOptionData> => {
  const element = resolveRevisionBoundElement(parameters);
  if (!isSelectElement(element) || !isVisible(element) || isDisabled(element)) {
    throw new ContentCommandError(
      "ELEMENT_NOT_INTERACTABLE",
      "The target is not a visible, enabled select element",
      true,
    );
  }
  const revisionBefore = runtime.domRevision;
  const previousIndices = [...element.options]
    .map((option, index) => (option.selected ? index : -1))
    .filter((index) => index >= 0);
  const selection = parameters.selection;
  const requested = new Set<number>();
  for (const [index, option] of [...element.options].entries()) {
    if (
      ("indices" in selection && selection.indices.includes(index)) ||
      ("values" in selection && selection.values.includes(option.value)) ||
      ("labels" in selection &&
        selection.labels.some((label) => normalizeText(label) === normalizeText(option.label)))
    ) {
      requested.add(index);
      if (!element.multiple) break;
    }
  }
  if (requested.size === 0) {
    throw new ContentCommandError(
      "ELEMENT_NOT_INTERACTABLE",
      "No requested option exists in the select element",
      false,
    );
  }
  for (const [index, option] of [...element.options].entries()) {
    option.selected = requested.has(index);
  }
  element.dispatchEvent(createEvent(element, "input"));
  if (parameters.dispatchChange) element.dispatchEvent(createEvent(element, "change"));
  await Promise.resolve();
  advanceRevisionAfterAction(revisionBefore);
  const resolvedElementId = resolvedElementIdAfterAction(element);
  const selectedIndices = [...element.options]
    .map((option, index) => (option.selected ? index : -1))
    .filter((index) => index >= 0);
  return {
    page: { url: sanitizeUrl(location.href), origin: currentOrigin() },
    documentId: runtime.documentId,
    domRevisionBefore: revisionBefore,
    domRevisionAfter: runtime.domRevision,
    elementId: parameters.elementId,
    ...(resolvedElementId === undefined ? {} : { resolvedElementId }),
    selectedCount: selectedIndices.length,
    selectedIndices,
    changed: previousIndices.join(",") !== selectedIndices.join(","),
    requiresNewSnapshot: true,
  };
};

const performSetChecked = async (
  parameters: SetCheckedParameters,
  checked: boolean,
): Promise<SetCheckedData> => {
  const element = resolveRevisionBoundElement(parameters);
  if (
    !isInputElement(element) ||
    !["checkbox", "radio"].includes(element.type) ||
    !isVisible(element) ||
    isDisabled(element)
  ) {
    throw new ContentCommandError(
      "ELEMENT_NOT_INTERACTABLE",
      "The target is not a visible, enabled checkbox or radio control",
      true,
    );
  }
  if (!checked && element.type === "radio") {
    throw new ContentCommandError(
      "ELEMENT_NOT_INTERACTABLE",
      "Radio controls cannot be unchecked directly; check another radio in the group",
      false,
    );
  }
  const revisionBefore = runtime.domRevision;
  const previous = element.checked;
  if (previous !== checked) {
    setNativeChecked(element, checked);
    element.dispatchEvent(createEvent(element, "input"));
    element.dispatchEvent(createEvent(element, "change"));
  }
  await Promise.resolve();
  advanceRevisionAfterAction(revisionBefore);
  const resolvedElementId = resolvedElementIdAfterAction(element);
  return {
    page: { url: sanitizeUrl(location.href), origin: currentOrigin() },
    documentId: runtime.documentId,
    domRevisionBefore: revisionBefore,
    domRevisionAfter: runtime.domRevision,
    elementId: parameters.elementId,
    ...(resolvedElementId === undefined ? {} : { resolvedElementId }),
    checked: element.checked,
    changed: previous !== element.checked,
    requiresNewSnapshot: true,
  };
};

const performSubmitForm = (parameters: SubmitFormParameters): SubmitFormData => {
  const element = resolveRevisionBoundElement(parameters, false);
  const form = isFormElement(element)
    ? element
    : isButtonElement(element) || isInputElement(element)
      ? element.form
      : null;
  const submitter = isSubmitControl(element)
    ? (element as HTMLButtonElement | HTMLInputElement)
    : undefined;
  if (form === null || isDisabled(element) || (submitter !== undefined && !isVisible(submitter))) {
    throw new ContentCommandError(
      "ELEMENT_NOT_INTERACTABLE",
      "The target is not an interactable form or submit control",
      true,
    );
  }
  const revisionBefore = runtime.domRevision;
  const urlBefore = sanitizeUrl(location.href);
  ownerWindow(form).setTimeout(() => {
    try {
      const prototype = ownerWindow(form).HTMLFormElement.prototype;
      if (typeof prototype.requestSubmit === "function") {
        prototype.requestSubmit.call(form, submitter);
      } else {
        prototype.submit.call(form);
      }
    } catch {
      // The response has already acknowledged scheduling; the agent must verify with a new snapshot.
    }
  }, 0);
  return {
    page: { urlBefore, origin: currentOrigin() },
    documentId: runtime.documentId,
    domRevisionBefore: revisionBefore,
    elementId: parameters.elementId,
    submitted: true,
    verificationRequired: true,
  };
};

const createControlOverlay = (): ControlOverlay => {
  const host = document.createElement("div");
  host.setAttribute(CONTROL_UI_ATTRIBUTE, "true");
  host.setAttribute("aria-hidden", "false");
  const shadow = host.attachShadow({ mode: "closed" });

  const style = document.createElement("style");
  style.textContent = `
    :host { all: initial; }
    .panel {
      position: fixed;
      top: 16px;
      right: 16px;
      z-index: 2147483647;
      display: flex;
      align-items: center;
      gap: 9px;
      max-width: min(360px, calc(100vw - 32px));
      padding: 9px 10px 9px 12px;
      border: 1px solid rgba(255,255,255,.16);
      border-radius: 999px;
      background: rgba(18, 24, 38, .94);
      box-shadow: 0 8px 28px rgba(0,0,0,.28);
      color: #f8fafc;
      font: 600 12px/1.25 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      letter-spacing: .01em;
      pointer-events: auto;
      backdrop-filter: blur(10px);
    }
    .dot {
      width: 8px;
      height: 8px;
      flex: 0 0 8px;
      border-radius: 50%;
      background: #2563eb;
      box-shadow: 0 0 0 3px rgba(37,99,235,.2);
    }
    .label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    button {
      appearance: none;
      border: 1px solid rgba(255,255,255,.22);
      border-radius: 999px;
      padding: 4px 8px;
      background: rgba(255,255,255,.08);
      color: #fff;
      font: 600 11px/1.2 system-ui, sans-serif;
      cursor: pointer;
    }
    button:hover { background: rgba(239,68,68,.24); border-color: rgba(248,113,113,.6); }
    button:focus-visible { outline: 2px solid #93c5fd; outline-offset: 2px; }
    button:disabled { cursor: wait; opacity: .55; }
    @media (prefers-reduced-motion: no-preference) {
      .working { animation: invictum-pulse 1.4s ease-in-out infinite; }
      @keyframes invictum-pulse { 50% { opacity: .45; transform: scale(.84); } }
    }
  `;

  const panel = document.createElement("div");
  panel.className = "panel";
  panel.setAttribute("role", "status");
  panel.setAttribute("aria-live", "polite");
  panel.setAttribute("aria-label", "Invictum AI control status");
  const dot = document.createElement("span");
  dot.className = "dot";
  const label = document.createElement("span");
  label.className = "label";
  const stopButton = document.createElement("button");
  stopButton.type = "button";
  stopButton.textContent = "Stop";
  stopButton.setAttribute("aria-label", "Stop AI control of this tab");
  stopButton.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    stopButton.disabled = true;
    label.textContent = "Stopping AI control…";
    void chrome.runtime
      .sendMessage({ channel: CONTROL_CHANNEL, command: "stop_control" })
      .then((response: unknown) => {
        if (
          typeof response !== "object" ||
          response === null ||
          (response as Readonly<Record<string, unknown>>)["ok"] !== true
        ) {
          stopButton.disabled = false;
          label.textContent = "Stop failed";
        }
      })
      .catch(() => {
        stopButton.disabled = false;
        label.textContent = "Stop failed";
      });
  });
  panel.append(dot, label, stopButton);
  shadow.append(style, panel);
  document.documentElement.append(host);
  return { host, dot, label, stopButton };
};

const renderControlOverlay = (state: ControlOverlayState, agentName?: string): void => {
  let overlay = runtime.controlOverlay;
  if (overlay === undefined || !overlay.host.isConnected) {
    overlay = createControlOverlay();
    runtime.controlOverlay = overlay;
  }
  if (overlay.removalTimer !== undefined) {
    clearTimeout(overlay.removalTimer);
    overlay.removalTimer = undefined;
  }

  overlay.dot.classList.toggle("working", state === "active" || state === "idle");
  overlay.stopButton.hidden = state === "stopped";
  overlay.stopButton.disabled = false;
  const activeLabel = `${agentName ?? "AI agent"} is using this tab`;
  const presentation = {
    active: {
      color: "#22c55e",
      shadow: "rgba(34,197,94,.22)",
      label: activeLabel,
    },
    idle: {
      color: "#22c55e",
      shadow: "rgba(34,197,94,.22)",
      label: activeLabel,
    },
    disconnected: {
      color: "#ef4444",
      shadow: "rgba(239,68,68,.22)",
      label: "AI connection lost",
    },
    stopped: {
      color: "#94a3b8",
      shadow: "rgba(148,163,184,.2)",
      label: "AI control stopped",
    },
  } as const;
  const selected = presentation[state];
  overlay.dot.style.background = selected.color;
  overlay.dot.style.boxShadow = `0 0 0 3px ${selected.shadow}`;
  overlay.label.textContent = selected.label;

  if (state === "stopped") {
    const stoppedOverlay = overlay;
    overlay.removalTimer = window.setTimeout(() => {
      stoppedOverlay.host.remove();
      if (runtime.controlOverlay === stoppedOverlay) runtime.controlOverlay = undefined;
    }, 1_500);
  }
};

if (runtime.listener !== undefined) {
  chrome.runtime.onMessage.removeListener(runtime.listener);
}

const listener: RuntimeMessageListener = (message: unknown, _sender, sendResponse) => {
  if (isControlStateMessage(message)) {
    renderControlOverlay(message.state, message.agentName);
    sendResponse({ ok: true });
    return false;
  }
  if (
    !isSnapshotRequest(message) &&
    !isFindElementsRequest(message) &&
    !isClickRequest(message) &&
    !isTypeTextRequest(message) &&
    !isPrepareFileInputRequest(message) &&
    !isCompleteFileInputRequest(message) &&
    !isMutateDomRequest(message) &&
    !isPrepareElementInspectionRequest(message) &&
    !isCompleteElementInspectionRequest(message) &&
    !isObserveEventsRequest(message) &&
    !isCleanupAdvancedToolsRequest(message) &&
    !isSelectOptionRequest(message) &&
    !isSetCheckedRequest(message) &&
    !isSubmitFormRequest(message) &&
    !isFigmaRequest(message) &&
    !isGetWordPressMenuRequest(message) &&
    !isEditWordPressMenuRequest(message) &&
    !isGetWordPressAdminRequest(message) &&
    !isWordPressListTableActionRequest(message) &&
    !isClickAtRequest(message) &&
    !isPerformGestureRequest(message)
  ) {
    return undefined;
  }
  void (async () => {
    try {
      if (message.command === "get_page_snapshot") {
        const response: SnapshotSuccessMessage = {
          ok: true,
          requestId: message.requestId,
          snapshot: buildSnapshot(message.parameters),
        };
        sendResponse(response);
      } else if (message.command === "find_elements") {
        const response: FindElementsSuccessMessage = {
          ok: true,
          requestId: message.requestId,
          result: findElements(message.parameters),
        };
        sendResponse(response);
      } else if (message.command === "prepare_file_input") {
        const response: FileInputPreparationSuccessMessage = {
          ok: true,
          requestId: message.requestId,
          result: prepareFileInput(message.parameters),
        };
        sendResponse(response);
      } else if (message.command === "prepare_element_inspection") {
        sendResponse({
          ok: true as const,
          requestId: message.requestId,
          result: prepareElementInspection(message.parameters),
        });
      } else if (
        message.command === "complete_element_inspection" ||
        message.command === "cancel_element_inspection"
      ) {
        sendResponse({
          ok: true as const,
          requestId: message.requestId,
          result: completeElementInspection(message.parameters.token),
        });
      } else if (message.command === "cleanup_advanced_tools") {
        sendResponse({
          ok: true as const,
          requestId: message.requestId,
          result: cleanupAdvancedTools(),
        });
      } else if (
        message.command === "complete_file_input" ||
        message.command === "cancel_file_input"
      ) {
        const response = {
          ok: true as const,
          requestId: message.requestId,
          result: completeFileInput(message.parameters, message.command === "cancel_file_input"),
        };
        sendResponse(response);
      } else if (
        message.command === "click" ||
        message.command === "type_text" ||
        message.command === "select_option" ||
        message.command === "check" ||
        message.command === "uncheck" ||
        message.command === "submit_form" ||
        FIGMA_COMMANDS.has(message.command) ||
        message.command === "get_wordpress_menu" ||
        message.command === "edit_wordpress_menu" ||
        message.command === "get_wordpress_admin" ||
        message.command === "wordpress_list_table_action" ||
        message.command === "mutate_dom" ||
        message.command === "observe_events" ||
        message.command === "click_at" ||
        message.command === "perform_gesture"
      ) {
        let result: InteractionSuccessMessage["result"];
        let modelEditorExpected = false;
        if (message.command === "click") result = await performClick(message.parameters);
        else if (message.command === "type_text") {
          const performed = await performTypeText(message.parameters, message.requestId);
          result = performed.result;
          modelEditorExpected = performed.modelEditorExpected;
        } else if (message.command === "select_option") {
          result = await performSelectOption(message.parameters);
        } else if (message.command === "check" || message.command === "uncheck") {
          result = await performSetChecked(message.parameters, message.command === "check");
        } else if (message.command === "submit_form") {
          result = performSubmitForm(message.parameters);
        } else if (message.command === "get_figma_document") {
          result = performGetFigmaDocument();
        } else if (message.command === "get_figma_layers") {
          result = performGetFigmaLayers(
            message.parameters as unknown as Parameters<typeof performGetFigmaLayers>[0],
          );
        } else if (message.command === "get_figma_properties") {
          result = performGetFigmaProperties();
        } else if (message.command === "figma_select") {
          result = performFigmaSelect(
            message.parameters as unknown as Parameters<typeof performFigmaSelect>[0],
          );
        } else if (message.command === "figma_locate") {
          result = performFigmaLocate(
            message.parameters as unknown as Parameters<typeof performFigmaLocate>[0],
          );
        } else if (message.command === "figma_healthcheck") {
          result = performFigmaHealthcheck();
        } else if (message.command === "get_wordpress_menu") {
          result = performGetWordPressMenu(message.parameters);
        } else if (message.command === "edit_wordpress_menu") {
          result = await performEditWordPressMenu(message.parameters);
        } else if (message.command === "get_wordpress_admin") {
          result = performGetWordPressAdmin(message.parameters);
        } else if (message.command === "wordpress_list_table_action") {
          result = await performWordPressAdminListAction(message.parameters);
        } else if (message.command === "mutate_dom") {
          result = await performMutateDom(message.parameters);
        } else if (message.command === "observe_events") {
          result = performObserveEvents(message.parameters);
        } else if (message.command === "click_at") {
          result = await performClickAt(message.parameters);
        } else if (message.command === "perform_gesture") {
          result = await performGesture(message.parameters);
        } else {
          return;
        }
        const response: InteractionSuccessMessage = {
          ok: true,
          requestId: message.requestId,
          result,
          ...(modelEditorExpected ? { modelEditorExpected: true } : {}),
        };
        sendResponse(response);
      }
    } catch (error) {
      const response: SnapshotFailureMessage = {
        ok: false,
        requestId: message.requestId,
        error: {
          code: error instanceof ContentCommandError ? error.code : "CONTENT_SCRIPT_UNAVAILABLE",
          message:
            error instanceof ContentCommandError
              ? error.message
              : "The browser content command could not be completed",
          retryable: error instanceof ContentCommandError ? error.retryable : true,
        },
      };
      sendResponse(response);
    }
  })();
  return true;
};

runtime.listener = listener;
chrome.runtime.onMessage.addListener(listener);
void chrome.runtime
  .sendMessage({ channel: CONTROL_CHANNEL, command: "get_control_state" })
  .then((response: unknown) => {
    if (
      typeof response === "object" &&
      response !== null &&
      (response as Readonly<Record<string, unknown>>)["ok"] === true
    ) {
      const control = (response as ControlStateResponse).control;
      if (
        control !== undefined &&
        (control.state === "active" ||
          control.state === "idle" ||
          control.state === "disconnected" ||
          control.state === "stopped") &&
        (control.agentName === undefined ||
          (typeof control.agentName === "string" && control.agentName.length <= 40))
      ) {
        renderControlOverlay(control.state, control.agentName);
        return;
      }
    }
    renderControlOverlay("active");
  })
  .catch(() => renderControlOverlay("active"));
