import {
  ClickElementDataSchema,
  IBP_ERROR_CODES,
  TypeTextDataSchema,
  SelectOptionDataSchema,
  SetCheckedDataSchema,
  SubmitFormDataSchema,
  ClickAtDataSchema,
  PerformGestureDataSchema,
  type ClickElementData,
  type ClickElementParameters,
  type TypeTextData,
  type TypeTextParameters,
  type SelectOptionData,
  type SelectOptionParameters,
  type SetCheckedData,
  type SetCheckedParameters,
  type SubmitFormData,
  type SubmitFormParameters,
  type ClickAtData,
  type ClickAtParameters,
  type PerformGestureData,
  type PerformGestureParameters,
} from "@invictum/protocol";

import { ExtensionCommandError } from "./command-error.js";
import { TOP_FRAME_ID } from "./frames.js";
import { isChromePageAccessDenied, pageAccessDeniedMessage } from "./page-access.js";

const CONTENT_CHANNEL = "invictum.browser.snapshot.v1";
const RESTRICTED_PROTOCOLS = new Set([
  "about:",
  "chrome:",
  "chrome-extension:",
  "devtools:",
  "edge:",
  "view-source:",
]);

interface InteractionResponse {
  ok: boolean;
  requestId: string;
  result?: unknown;
  modelEditorExpected?: boolean;
  error?: { code: string; message: string; retryable: boolean };
}

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const parseResponse = (value: unknown, requestId: string): InteractionResponse => {
  if (!isRecord(value) || value["requestId"] !== requestId || typeof value["ok"] !== "boolean") {
    throw new ExtensionCommandError(
      IBP_ERROR_CODES.INVALID_MESSAGE,
      "The content script returned an invalid interaction response",
      false,
    );
  }
  if (value["ok"] === true) {
    return {
      ok: true,
      requestId,
      result: value["result"],
      ...(value["modelEditorExpected"] === true ? { modelEditorExpected: true } : {}),
    };
  }
  const error = value["error"];
  if (
    !isRecord(error) ||
    typeof error["code"] !== "string" ||
    typeof error["message"] !== "string" ||
    typeof error["retryable"] !== "boolean"
  ) {
    throw new ExtensionCommandError(
      IBP_ERROR_CODES.INVALID_MESSAGE,
      "The content script returned an invalid interaction error",
      false,
    );
  }
  return {
    ok: false,
    requestId,
    error: {
      code: error["code"],
      message: error["message"],
      retryable: error["retryable"],
    },
  };
};

const isRestrictedUrl = (rawUrl: string | undefined): boolean => {
  if (rawUrl === undefined) return true;
  try {
    return RESTRICTED_PROTOCOLS.has(new URL(rawUrl).protocol);
  } catch {
    return true;
  }
};

const installMainWorldFormGuard = (token: string): boolean => {
  const guardGlobal = globalThis as typeof globalThis & {
    __invictumFormGuardV1?: {
      token: string;
      blocked: boolean;
      submit: PropertyDescriptor;
      requestSubmit: PropertyDescriptor | undefined;
    };
  };
  const prototype = HTMLFormElement.prototype;
  const submit = Object.getOwnPropertyDescriptor(prototype, "submit");
  const requestSubmit = Object.getOwnPropertyDescriptor(prototype, "requestSubmit");
  if (submit?.value === undefined || submit.configurable !== true) return false;
  if (guardGlobal.__invictumFormGuardV1 !== undefined) return false;
  const state = { token, blocked: false, submit, requestSubmit };
  const blockedSubmit = (): undefined => {
    state.blocked = true;
    return undefined;
  };
  Object.defineProperty(prototype, "submit", { ...submit, value: blockedSubmit });
  if (requestSubmit?.value !== undefined && requestSubmit.configurable === true) {
    Object.defineProperty(prototype, "requestSubmit", {
      ...requestSubmit,
      value: blockedSubmit,
    });
  }
  guardGlobal.__invictumFormGuardV1 = state;
  return true;
};

const restoreMainWorldFormGuard = (token: string): boolean => {
  const guardGlobal = globalThis as typeof globalThis & {
    __invictumFormGuardV1?: {
      token: string;
      blocked: boolean;
      submit: PropertyDescriptor;
      requestSubmit: PropertyDescriptor | undefined;
    };
  };
  const state = guardGlobal.__invictumFormGuardV1;
  if (state === undefined || state.token !== token) return false;
  const prototype = HTMLFormElement.prototype;
  Object.defineProperty(prototype, "submit", state.submit);
  if (state.requestSubmit !== undefined) {
    Object.defineProperty(prototype, "requestSubmit", state.requestSubmit);
  }
  delete guardGlobal.__invictumFormGuardV1;
  return state.blocked;
};

interface ModelEditorSynchronizationResult {
  found: boolean;
  handled: boolean;
  synchronized: boolean;
  changed: boolean;
  kind?: "ace" | "codemirror5" | "codemirror6" | "monaco" | "quill" | "tinymce";
}

const synchronizeModelBackedEditor = (
  token: string,
  text: string,
  mode: "append" | "replace",
  dispatchChange: boolean,
): ModelEditorSynchronizationResult => {
  const markerAttribute = "data-invictum-type-text-target";
  const findMarkedElement = (root: Document | ShadowRoot): HTMLElement | undefined => {
    for (const candidate of root.querySelectorAll<HTMLElement>(`[${markerAttribute}]`)) {
      if (candidate.getAttribute(markerAttribute) === token) return candidate;
    }
    for (const candidate of root.querySelectorAll<HTMLElement>("*")) {
      if (candidate.shadowRoot !== null) {
        const nested = findMarkedElement(candidate.shadowRoot);
        if (nested !== undefined) return nested;
      }
    }
    return undefined;
  };
  const target = findMarkedElement(document);
  if (target === undefined) {
    return { found: false, handled: false, synchronized: false, changed: false };
  }
  const owner = target.ownerDocument.defaultView ?? window;
  const dispatchModelEvents = (eventTarget: EventTarget): void => {
    eventTarget.dispatchEvent(new owner.Event("input", { bubbles: true, composed: true }));
    if (dispatchChange) {
      eventTarget.dispatchEvent(new owner.Event("change", { bubbles: true, composed: true }));
    }
  };
  const nextValue = (previous: string): string => (mode === "append" ? `${previous}${text}` : text);
  const completed = (
    kind: ModelEditorSynchronizationResult["kind"],
    previous: string,
    next: string,
    actual = next,
  ): ModelEditorSynchronizationResult => ({
    found: true,
    handled: true,
    synchronized: actual === next,
    changed: previous !== actual,
    ...(kind === undefined ? {} : { kind }),
  });

  const codeMirrorWrapper = target.closest<HTMLElement>(".CodeMirror");
  const codeMirror5 = (
    codeMirrorWrapper as
      | (HTMLElement & {
          CodeMirror?: {
            getValue?: () => unknown;
            setValue?: (value: string) => void;
            save?: () => void;
            getTextArea?: () => unknown;
          };
        })
      | null
  )?.CodeMirror;
  if (
    codeMirror5 !== undefined &&
    typeof codeMirror5.getValue === "function" &&
    typeof codeMirror5.setValue === "function"
  ) {
    const previous = String(codeMirror5.getValue());
    const next = nextValue(previous);
    codeMirror5.setValue(next);
    if (typeof codeMirror5.save === "function") codeMirror5.save();
    const source =
      typeof codeMirror5.getTextArea === "function" ? codeMirror5.getTextArea() : undefined;
    dispatchModelEvents(source instanceof owner.HTMLElement ? source : target);
    return completed("codemirror5", previous, next, String(codeMirror5.getValue()));
  }

  const codeMirrorContent =
    (target.matches(".cm-content") ? target : target.querySelector<HTMLElement>(".cm-content")) ??
    target.closest<HTMLElement>(".cm-content");
  const codeMirrorViewReference = (
    codeMirrorContent as
      | (HTMLElement & {
          cmView?: {
            rootView?: { view?: unknown };
            view?: unknown;
            state?: unknown;
            dispatch?: unknown;
          };
        })
      | null
  )?.cmView;
  const codeMirror6 =
    codeMirrorViewReference?.rootView?.view ??
    codeMirrorViewReference?.view ??
    codeMirrorViewReference;
  if (typeof codeMirror6 === "object" && codeMirror6 !== null) {
    const view = codeMirror6 as {
      state?: { doc?: { length?: unknown; toString?: () => string } };
      dispatch?: (transaction: unknown) => void;
      focus?: () => void;
    };
    const length = view.state?.doc?.length;
    if (
      typeof length === "number" &&
      typeof view.state?.doc?.toString === "function" &&
      typeof view.dispatch === "function"
    ) {
      const previous = view.state.doc.toString();
      const next = nextValue(previous);
      view.dispatch({
        changes: {
          from: mode === "append" ? length : 0,
          to: length,
          insert: text,
        },
      });
      if (typeof view.focus === "function") view.focus();
      dispatchModelEvents(codeMirrorContent ?? target);
      return completed("codemirror6", previous, next, view.state.doc.toString());
    }
  }

  const aceWrapper = target.closest<HTMLElement>(".ace_editor");
  const aceEditor = (
    aceWrapper as
      | (HTMLElement & {
          env?: {
            editor?: {
              getValue?: () => unknown;
              setValue?: (value: string, cursorPosition?: number) => void;
            };
          };
        })
      | null
  )?.env?.editor;
  if (
    aceEditor !== undefined &&
    typeof aceEditor.getValue === "function" &&
    typeof aceEditor.setValue === "function"
  ) {
    const previous = String(aceEditor.getValue());
    const next = nextValue(previous);
    aceEditor.setValue(next, 1);
    dispatchModelEvents(target);
    return completed("ace", previous, next, String(aceEditor.getValue()));
  }

  const quillGlobal = (
    globalThis as typeof globalThis & {
      Quill?: { find?: (node: Node) => unknown };
    }
  ).Quill;
  const quillContainer = target.closest<HTMLElement>(".ql-container");
  const quill =
    (
      quillContainer as
        | (HTMLElement & {
            __quill?: {
              getText?: () => unknown;
              setText?: (value: string, source?: string) => void;
            };
          })
        | null
    )?.__quill ?? (typeof quillGlobal?.find === "function" ? quillGlobal.find(target) : undefined);
  if (typeof quill === "object" && quill !== null) {
    const editor = quill as {
      getText?: () => unknown;
      setText?: (value: string, source?: string) => void;
    };
    if (typeof editor.getText === "function" && typeof editor.setText === "function") {
      const rawPrevious = String(editor.getText());
      const previous = rawPrevious.endsWith("\n") ? rawPrevious.slice(0, -1) : rawPrevious;
      const next = nextValue(previous);
      editor.setText(next, "api");
      dispatchModelEvents(target);
      const actualRaw = String(editor.getText());
      const actual = actualRaw.endsWith("\n") ? actualRaw.slice(0, -1) : actualRaw;
      return completed("quill", previous, next, actual);
    }
  }

  const tinymce = (
    globalThis as typeof globalThis & {
      tinymce?: {
        editors?: unknown[];
        activeEditor?: unknown;
      };
    }
  ).tinymce;
  const tinyEditors = [
    ...(Array.isArray(tinymce?.editors) ? tinymce.editors : []),
    ...(tinymce?.activeEditor === undefined ? [] : [tinymce.activeEditor]),
  ];
  for (const candidate of tinyEditors) {
    if (typeof candidate !== "object" || candidate === null) continue;
    const editor = candidate as {
      getBody?: () => unknown;
      getElement?: () => unknown;
      getContent?: (options?: unknown) => unknown;
      setContent?: (content: string) => void;
      save?: () => void;
    };
    const body = typeof editor.getBody === "function" ? editor.getBody() : undefined;
    const source = typeof editor.getElement === "function" ? editor.getElement() : undefined;
    if (
      body !== target &&
      source !== target &&
      !(body instanceof owner.Node && body.contains(target))
    ) {
      continue;
    }
    if (typeof editor.getContent !== "function" || typeof editor.setContent !== "function")
      continue;
    const previousText = String(editor.getContent({ format: "text" }));
    const escapeHtml = (value: string): string =>
      value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
    const next = nextValue(previousText);
    if (mode === "append") {
      const previousHtml = String(editor.getContent());
      editor.setContent(`${previousHtml}${escapeHtml(text)}`);
    } else {
      editor.setContent(escapeHtml(text));
    }
    if (typeof editor.save === "function") editor.save();
    dispatchModelEvents(source instanceof owner.HTMLElement ? source : target);
    return completed("tinymce", previousText, next, String(editor.getContent({ format: "text" })));
  }

  const monaco = (
    globalThis as typeof globalThis & {
      monaco?: {
        editor?: {
          getEditors?: () => unknown[];
        };
      };
    }
  ).monaco;
  const monacoEditors =
    typeof monaco?.editor?.getEditors === "function" ? monaco.editor.getEditors() : [];
  for (const candidate of monacoEditors) {
    if (typeof candidate !== "object" || candidate === null) continue;
    const editor = candidate as {
      getDomNode?: () => unknown;
      getValue?: () => unknown;
      setValue?: (value: string) => void;
    };
    const node = typeof editor.getDomNode === "function" ? editor.getDomNode() : undefined;
    if (!(node instanceof owner.Node) || (node !== target && !node.contains(target))) continue;
    if (typeof editor.getValue !== "function" || typeof editor.setValue !== "function") continue;
    const previous = String(editor.getValue());
    const next = nextValue(previous);
    editor.setValue(next);
    dispatchModelEvents(target);
    return completed("monaco", previous, next, String(editor.getValue()));
  }

  return { found: true, handled: false, synchronized: false, changed: false };
};

const clearModelEditorMarker = (token: string): number => {
  const markerAttribute = "data-invictum-type-text-target";
  let cleared = 0;
  const clearRoot = (root: Document | ShadowRoot): void => {
    for (const candidate of root.querySelectorAll<HTMLElement>(`[${markerAttribute}]`)) {
      if (candidate.getAttribute(markerAttribute) === token) {
        candidate.removeAttribute(markerAttribute);
        cleared += 1;
      }
    }
    for (const candidate of root.querySelectorAll<HTMLElement>("*")) {
      if (candidate.shadowRoot !== null) clearRoot(candidate.shadowRoot);
    }
  };
  clearRoot(document);
  return cleared;
};

type InteractionParameters =
  | ClickElementParameters
  | TypeTextParameters
  | SelectOptionParameters
  | SetCheckedParameters
  | SubmitFormParameters
  | ClickAtParameters
  | PerformGestureParameters;
type InteractionCommand =
  | "click"
  | "type_text"
  | "select_option"
  | "check"
  | "uncheck"
  | "submit_form"
  | "click_at"
  | "perform_gesture";

export class ChromeInteractionsAdapter {
  public async click(parameters: ClickElementParameters): Promise<ClickElementData> {
    return ClickElementDataSchema.parse(await this.#execute("click", parameters));
  }

  public async typeText(parameters: TypeTextParameters): Promise<TypeTextData> {
    return TypeTextDataSchema.parse(await this.#execute("type_text", parameters));
  }

  public async selectOption(parameters: SelectOptionParameters): Promise<SelectOptionData> {
    return SelectOptionDataSchema.parse(await this.#execute("select_option", parameters));
  }

  public async setChecked(
    parameters: SetCheckedParameters,
    checked: boolean,
  ): Promise<SetCheckedData> {
    return SetCheckedDataSchema.parse(
      await this.#execute(checked ? "check" : "uncheck", parameters),
    );
  }

  public async submitForm(parameters: SubmitFormParameters): Promise<SubmitFormData> {
    return SubmitFormDataSchema.parse(await this.#execute("submit_form", parameters));
  }

  public async clickAt(parameters: ClickAtParameters): Promise<ClickAtData> {
    return ClickAtDataSchema.parse(await this.#execute("click_at", parameters));
  }

  public async performGesture(parameters: PerformGestureParameters): Promise<PerformGestureData> {
    return PerformGestureDataSchema.parse(await this.#execute("perform_gesture", parameters));
  }

  async #execute(command: InteractionCommand, parameters: InteractionParameters): Promise<unknown> {
    const permissionsGranted = await chrome.permissions.contains({
      permissions: ["activeTab", "scripting"],
    });
    if (!permissionsGranted) {
      throw new ExtensionCommandError(
        IBP_ERROR_CODES.PERMISSION_DENIED,
        "Page interaction permission is unavailable; set Invictum Site access to On all sites",
        false,
      );
    }
    const tab = await chrome.tabs.get(parameters.tabId);
    const tabUrl = tab.pendingUrl ?? tab.url;
    if (isRestrictedUrl(tabUrl)) {
      throw new ExtensionCommandError(
        IBP_ERROR_CODES.RESTRICTED_PAGE,
        "Chrome does not allow interaction with this browser-internal page",
        false,
      );
    }
    const requestId = crypto.randomUUID();
    try {
      const formGuardToken =
        command === "click" || command === "click_at" || command === "perform_gesture"
          ? crypto.randomUUID()
          : undefined;
      if (formGuardToken !== undefined) {
        const installed = await chrome.scripting.executeScript({
          target: { tabId: parameters.tabId },
          world: "MAIN",
          func: installMainWorldFormGuard,
          args: [formGuardToken],
        });
        if (installed[0]?.result !== true) {
          throw new ExtensionCommandError(
            IBP_ERROR_CODES.POLICY_DENIED,
            "The page could not install the temporary indirect-submit guard",
            false,
          );
        }
      }
      let rawResponse: unknown;
      let indirectSubmitBlocked = false;
      try {
        await chrome.scripting.executeScript({
          target: { tabId: parameters.tabId },
          files: ["content.js"],
        });
        rawResponse = await chrome.tabs.sendMessage(
          parameters.tabId,
          {
            channel: CONTENT_CHANNEL,
            command,
            requestId,
            parameters,
          },
          { frameId: TOP_FRAME_ID },
        );
      } finally {
        if (formGuardToken !== undefined) {
          const restored = await chrome.scripting.executeScript({
            target: { tabId: parameters.tabId },
            world: "MAIN",
            func: restoreMainWorldFormGuard,
            args: [formGuardToken],
          });
          indirectSubmitBlocked = restored[0]?.result === true;
        }
      }
      if (indirectSubmitBlocked) {
        throw new ExtensionCommandError(
          IBP_ERROR_CODES.POLICY_DENIED,
          "The click attempted a programmatic form submit; use browser.submit_form",
          false,
        );
      }
      const response = parseResponse(rawResponse, requestId);
      if (!response.ok) {
        throw new ExtensionCommandError(
          response.error?.code ?? IBP_ERROR_CODES.CONTENT_SCRIPT_UNAVAILABLE,
          response.error?.message ?? "The content script could not perform the interaction",
          response.error?.retryable ?? true,
        );
      }
      if (command === "type_text" && response.modelEditorExpected === true) {
        const typedParameters = parameters as TypeTextParameters;
        let synchronization: ModelEditorSynchronizationResult | undefined;
        try {
          const synchronizedFrames = await chrome.scripting.executeScript({
            target: { tabId: parameters.tabId, allFrames: true },
            world: "MAIN",
            func: synchronizeModelBackedEditor,
            args: [
              requestId,
              typedParameters.text,
              typedParameters.mode,
              typedParameters.dispatchChange,
            ],
          });
          synchronization = synchronizedFrames
            .map(({ result }) => result)
            .find((result) => result?.handled === true);
        } finally {
          try {
            await chrome.scripting.executeScript({
              target: { tabId: parameters.tabId, allFrames: true },
              world: "MAIN",
              func: clearModelEditorMarker,
              args: [requestId],
            });
          } catch {
            // A navigation destroys the marked document and therefore also clears the marker.
          }
        }
        if (synchronization?.synchronized !== true) {
          throw new ExtensionCommandError(
            IBP_ERROR_CODES.ELEMENT_NOT_INTERACTABLE,
            "The page uses a model-backed editor, but its editor API was not available for safe synchronization",
            true,
          );
        }
        if (!isRecord(response.result)) {
          throw new ExtensionCommandError(
            IBP_ERROR_CODES.INVALID_MESSAGE,
            "The content script returned an invalid type_text result",
            false,
          );
        }
        return { ...response.result, changed: synchronization.changed };
      }
      return response.result;
    } catch (error) {
      if (error instanceof ExtensionCommandError) throw error;
      if (isChromePageAccessDenied(error)) {
        throw new ExtensionCommandError(
          IBP_ERROR_CODES.PERMISSION_DENIED,
          pageAccessDeniedMessage(parameters.tabId, tabUrl, "page interaction"),
          false,
        );
      }
      throw new ExtensionCommandError(
        IBP_ERROR_CODES.CONTENT_SCRIPT_UNAVAILABLE,
        "The target page is not available to the Invictum content script",
        true,
        { cause: error },
      );
    }
  }
}
