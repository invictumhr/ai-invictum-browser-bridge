import { createHash } from "node:crypto";

import { getActionMetadata, type ActionMetadata, type ActionRiskLevel } from "@invictum/protocol";

export interface EnhancedActionTransport {
  call(
    action: string,
    parameters?: unknown,
    options?: { idempotencyKey?: string },
  ): Promise<unknown>;
}

export interface EnhancedActionErrorLike {
  readonly code: string;
  readonly retryable: boolean;
}

export interface EnhancedActionHooks {
  authorize?: (
    action: string,
    metadata: ActionMetadata,
  ) => Promise<Record<string, unknown> | undefined>;
  createError?: (code: string, message: string, retryable: boolean, details?: unknown) => Error;
}

export interface EnhancedActionRunnerOptions {
  maxCachedTabs?: number;
  maxElementReferencesPerTab?: number;
}

export interface EnhancedActionStateStats {
  cachedTabs: number;
  cachedSnapshots: number;
  cachedElementReferences: number;
}

interface CachedElementReference {
  elementId: string;
  frameId: string;
  role: string;
  name: string;
  tag: string;
  css?: string;
}

interface CachedSemanticElement {
  elementId: string;
  signature: string;
}

interface CachedSnapshotState {
  documentId: string;
  domRevision: number;
  detail?: "minimal" | "outline" | "interactive" | "semantic" | "full";
  elements: Map<string, CachedSemanticElement>;
}

interface ParsedEnhancements {
  parameters: Record<string, unknown>;
  idempotencyKey?: string;
  dryRun: boolean;
  postSnapshot?: "outline" | "interactive";
  wantsDomDelta: boolean;
  verify?: Record<string, unknown>;
  autoMarks?: Record<string, unknown>;
  timings: boolean;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const hasErrorCode = (error: unknown, code: string): error is EnhancedActionErrorLike =>
  error instanceof Error &&
  "code" in error &&
  (error as { code?: unknown }).code === code &&
  "retryable" in error;

const now = (): number => performance.now();

const elapsed = (startedAt: number): number =>
  Math.max(0, Math.round((now() - startedAt) * 10) / 10);

const parseEnhancements = (
  originalArguments: Readonly<Record<string, unknown>>,
): ParsedEnhancements => {
  const parameters = { ...originalArguments };
  const idempotencyKey =
    typeof parameters["idempotencyKey"] === "string" ? parameters["idempotencyKey"] : undefined;
  const dryRun = parameters["dryRun"] === true;
  const postSnapshot =
    parameters["postSnapshot"] === "outline" || parameters["postSnapshot"] === "interactive"
      ? parameters["postSnapshot"]
      : undefined;
  const wantsDomDelta = parameters["domDelta"] === true;
  const verify = isRecord(parameters["verify"]) ? parameters["verify"] : undefined;
  const autoMarks = isRecord(parameters["autoMarks"]) ? parameters["autoMarks"] : undefined;
  const timings = parameters["timings"] === true;
  delete parameters["idempotencyKey"];
  delete parameters["dryRun"];
  delete parameters["postSnapshot"];
  delete parameters["domDelta"];
  delete parameters["verify"];
  delete parameters["autoMarks"];
  delete parameters["timings"];
  return {
    parameters,
    ...(idempotencyKey === undefined ? {} : { idempotencyKey }),
    dryRun,
    ...(postSnapshot === undefined ? {} : { postSnapshot }),
    wantsDomDelta,
    ...(verify === undefined ? {} : { verify }),
    ...(autoMarks === undefined ? {} : { autoMarks }),
    timings,
  };
};

const semanticElementCss = (element: Readonly<Record<string, unknown>>): string | undefined => {
  const selectors = isRecord(element["selectors"]) ? element["selectors"] : undefined;
  return typeof selectors?.["css"] === "string"
    ? selectors["css"]
    : typeof element["css"] === "string"
      ? element["css"]
      : undefined;
};

const semanticElementSignature = (element: Readonly<Record<string, unknown>>): string =>
  JSON.stringify({
    tag: element["tag"],
    role: element["role"],
    name: element["name"],
    text: element["text"],
    editable: element["editable"],
    clickable: element["clickable"],
    checked: element["checked"],
    selected: element["selected"],
    enabled: element["enabled"],
  });

const semanticElementMap = (
  rawElements: ReadonlyArray<Readonly<Record<string, unknown>>>,
): Map<string, CachedSemanticElement> => {
  const occurrences = new Map<string, number>();
  return new Map(
    rawElements
      .filter((element) => typeof element["elementId"] === "string")
      .map((element, index) => {
        const frameId = typeof element["frameId"] === "string" ? element["frameId"] : "top";
        const css = semanticElementCss(element);
        const baseKey =
          css === undefined
            ? `fallback:${frameId}:${String(element["tag"] ?? "")}:${String(element["role"] ?? "")}:${String(element["name"] ?? "")}:${index}`
            : `css:${frameId}:${css}`;
        const occurrence = occurrences.get(baseKey) ?? 0;
        occurrences.set(baseKey, occurrence + 1);
        return [
          `${baseKey}:${occurrence}`,
          {
            elementId: element["elementId"] as string,
            signature: semanticElementSignature(element),
          },
        ];
      }),
  );
};

const referenceFrom = (element: unknown): CachedElementReference | undefined => {
  if (
    !isRecord(element) ||
    typeof element["elementId"] !== "string" ||
    typeof element["frameId"] !== "string" ||
    typeof element["role"] !== "string" ||
    typeof element["name"] !== "string" ||
    typeof element["tag"] !== "string"
  ) {
    return undefined;
  }
  const selectors = isRecord(element["selectors"]) ? element["selectors"] : undefined;
  const css =
    typeof selectors?.["css"] === "string"
      ? selectors["css"]
      : typeof element["css"] === "string"
        ? element["css"]
        : undefined;
  return {
    elementId: element["elementId"],
    frameId: element["frameId"],
    role: element["role"],
    name: element["name"],
    tag: element["tag"],
    ...(css === undefined ? {} : { css }),
  };
};

const snapshotElements = (snapshot: Record<string, unknown>): Record<string, unknown>[] =>
  (Array.isArray(snapshot["elements"])
    ? snapshot["elements"]
    : Array.isArray(snapshot["outline"])
      ? snapshot["outline"]
      : []
  ).filter(isRecord);

const actionTabId = (
  parameters: Readonly<Record<string, unknown>>,
  result: unknown,
): number | undefined => {
  if (typeof parameters["tabId"] === "number") return parameters["tabId"];
  if (isRecord(result) && isRecord(result["tab"]) && typeof result["tab"]["tabId"] === "number") {
    return result["tab"]["tabId"];
  }
  return undefined;
};

const redactedPreviewValue = (key: string, value: unknown, depth = 0): unknown => {
  if (depth > 5) return "[bounded]";
  if (
    /password|passwd|secret|token|credential|cookie|authorization|body|code|source|username|otp|one.?time|pin|card|cvv|text/iu.test(
      key,
    )
  ) {
    return "[redacted]";
  }
  if (/filepaths?/iu.test(key) && Array.isArray(value)) return `[${value.length} local file(s)]`;
  if (/url/iu.test(key) && typeof value === "string") {
    try {
      const url = new URL(value);
      url.username = "";
      url.password = "";
      if ([...url.searchParams.keys()].length > 0) url.search = "?[REDACTED]";
      if (url.hash.length > 0) url.hash = "#[REDACTED]";
      return url.toString();
    } catch {
      return "[redacted-url]";
    }
  }
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => redactedPreviewValue(key, item, depth + 1));
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([childKey, childValue]) => [
        childKey,
        redactedPreviewValue(childKey, childValue, depth + 1),
      ]),
    );
  }
  if (typeof value === "string" && value.length > 200) return `${value.slice(0, 197)}...`;
  return value;
};

const semanticDelta = (
  previous: CachedSnapshotState | undefined,
  currentSnapshot: unknown,
): Record<string, unknown> => {
  if (previous === undefined) return { available: false, reason: "no_baseline" };
  if (!isRecord(currentSnapshot) || !isRecord(currentSnapshot["metadata"])) {
    return { available: false, reason: "invalid_post_snapshot" };
  }
  const currentDocumentId = currentSnapshot["metadata"]["documentId"];
  const currentRevision = currentSnapshot["metadata"]["domRevision"];
  if (typeof currentDocumentId !== "string" || typeof currentRevision !== "number") {
    return { available: false, reason: "invalid_post_snapshot" };
  }
  const current = semanticElementMap(snapshotElements(currentSnapshot));
  const documentChanged = previous.documentId !== currentDocumentId;
  const added = documentChanged
    ? [...current.values()].map(({ elementId }) => elementId)
    : [...current.entries()]
        .filter(([key]) => !previous.elements.has(key))
        .map(([, { elementId }]) => elementId);
  const removed = documentChanged
    ? [...previous.elements.values()].map(({ elementId }) => elementId)
    : [...previous.elements.entries()]
        .filter(([key]) => !current.has(key))
        .map(([, { elementId }]) => elementId);
  const changed = documentChanged
    ? []
    : [...current.entries()]
        .filter(([key, element]) => {
          const previousElement = previous.elements.get(key);
          return previousElement !== undefined && previousElement.signature !== element.signature;
        })
        .map(([, { elementId }]) => elementId);
  const limit = 100;
  return {
    available: true,
    previousDocumentId: previous.documentId,
    documentId: currentDocumentId,
    previousDomRevision: previous.domRevision,
    domRevision: currentRevision,
    documentChanged,
    addedCount: added.length,
    removedCount: removed.length,
    changedCount: changed.length,
    addedElementIds: added.slice(0, limit),
    removedElementIds: removed.slice(0, limit),
    changedElementIds: changed.slice(0, limit),
    truncated: added.length > limit || removed.length > limit || changed.length > limit,
  };
};

export class EnhancedActionRunner {
  readonly #transport: EnhancedActionTransport;
  readonly #maxCachedTabs: number;
  readonly #maxElementReferencesPerTab: number;
  readonly #elementReferences = new Map<number, Map<string, CachedElementReference>>();
  readonly #snapshotStates = new Map<number, CachedSnapshotState>();

  public constructor(
    transport: EnhancedActionTransport,
    options: EnhancedActionRunnerOptions = {},
  ) {
    this.#transport = transport;
    this.#maxCachedTabs = Math.max(1, options.maxCachedTabs ?? 64);
    this.#maxElementReferencesPerTab = Math.max(10, options.maxElementReferencesPerTab ?? 2_000);
  }

  public clearTab(tabId: number): void {
    this.#elementReferences.delete(tabId);
    this.#snapshotStates.delete(tabId);
  }

  public clear(): void {
    this.#elementReferences.clear();
    this.#snapshotStates.clear();
  }

  public stateStats(): EnhancedActionStateStats {
    return {
      cachedTabs: new Set([...this.#elementReferences.keys(), ...this.#snapshotStates.keys()]).size,
      cachedSnapshots: this.#snapshotStates.size,
      cachedElementReferences: [...this.#elementReferences.values()].reduce(
        (sum, references) => sum + references.size,
        0,
      ),
    };
  }

  public observe(
    action: string,
    parameters: Readonly<Record<string, unknown>>,
    data: unknown,
  ): void {
    this.#cacheElementResult(action, parameters, data);
  }

  public async run(
    action: string,
    originalArguments: Readonly<Record<string, unknown>>,
    hooks: EnhancedActionHooks = {},
  ): Promise<unknown> {
    const totalStartedAt = now();
    const parsed = parseEnhancements(originalArguments);
    const metadata = getActionMetadata(action);
    if (metadata !== undefined && parsed.dryRun) {
      const preview = await this.#previewAction(action, parsed.parameters, metadata);
      return parsed.timings
        ? { ...preview, timings: { totalMs: elapsed(totalStartedAt) } }
        : preview;
    }
    if (
      metadata?.requiresAuthorization &&
      !isRecord(parsed.parameters["authorization"]) &&
      hooks.authorize !== undefined
    ) {
      const authorization = await hooks.authorize(action, metadata);
      if (authorization !== undefined) parsed.parameters["authorization"] = authorization;
    }

    let marks: Record<string, unknown>[] | undefined;
    let actionParameters = parsed.parameters;
    if (action === "browser.screenshot" && parsed.autoMarks !== undefined) {
      const prepared = await this.#prepareAutomaticMarks(parsed.parameters, parsed.autoMarks);
      actionParameters = prepared.parameters;
      marks = prepared.marks;
    }

    const requestedTabId =
      typeof actionParameters["tabId"] === "number" ? actionParameters["tabId"] : undefined;
    let previousSnapshot =
      requestedTabId === undefined ? undefined : this.#snapshotStates.get(requestedTabId);
    let baselineMs: number | undefined;
    if (parsed.wantsDomDelta && requestedTabId !== undefined && previousSnapshot === undefined) {
      const baselineStartedAt = now();
      try {
        const baselineDetail = parsed.postSnapshot ?? "outline";
        const baseline = await this.#transport.call("browser.get_page_snapshot", {
          tabId: requestedTabId,
          detail: baselineDetail,
          maxElements: baselineDetail === "outline" ? 500 : 1_000,
          maxTextLength: 25_000,
        });
        this.#cacheElementResult("browser.get_page_snapshot", { tabId: requestedTabId }, baseline);
        previousSnapshot = this.#snapshotStates.get(requestedTabId);
      } catch {
        // The requested action remains authoritative; domDelta will explain that no baseline exists.
      }
      baselineMs = elapsed(baselineStartedAt);
    }

    const actionStartedAt = now();
    const data = await this.#callWithSafeRelocation(
      action,
      actionParameters,
      { idempotencyKey: parsed.idempotencyKey },
      hooks,
    );
    const actionMs = elapsed(actionStartedAt);
    const tabId = actionTabId(actionParameters, data);

    let verification: unknown;
    let verifyMs: number | undefined;
    if (parsed.verify !== undefined && tabId !== undefined) {
      const verifyStartedAt = now();
      verification = await this.#transport.call("browser.wait_for", {
        tabId,
        ...parsed.verify,
      });
      verifyMs = elapsed(verifyStartedAt);
    }

    let snapshot: unknown;
    let domDelta: Record<string, unknown> | undefined;
    let snapshotMs: number | undefined;
    if ((parsed.postSnapshot !== undefined || parsed.wantsDomDelta) && tabId !== undefined) {
      const snapshotStartedAt = now();
      const previousDetail = previousSnapshot?.detail;
      const snapshotDetail = parsed.postSnapshot ?? previousDetail ?? "outline";
      snapshot = await this.#transport.call("browser.get_page_snapshot", {
        tabId,
        detail: snapshotDetail,
        maxElements: snapshotDetail === "outline" ? 500 : 1_000,
        maxTextLength: 25_000,
      });
      let deltaSnapshot = snapshot;
      if (
        parsed.wantsDomDelta &&
        parsed.postSnapshot !== undefined &&
        previousDetail !== undefined &&
        previousDetail !== parsed.postSnapshot
      ) {
        deltaSnapshot = await this.#transport.call("browser.get_page_snapshot", {
          tabId,
          detail: previousDetail,
          maxElements: previousDetail === "outline" ? 500 : 1_000,
          maxTextLength: 25_000,
        });
      }
      domDelta = parsed.wantsDomDelta ? semanticDelta(previousSnapshot, deltaSnapshot) : undefined;
      this.#cacheElementResult("browser.get_page_snapshot", { tabId }, snapshot);
      snapshotMs = elapsed(snapshotStartedAt);
    } else if (parsed.wantsDomDelta) {
      domDelta = { available: false, reason: "tab_unavailable" };
    }

    const shouldClearTab =
      tabId !== undefined && (action === "browser.unlock_tab" || action === "browser.close_tab");
    if (shouldClearTab) this.clearTab(tabId);

    const timings = parsed.timings
      ? {
          ...(baselineMs === undefined ? {} : { baselineMs }),
          actionMs,
          ...(verifyMs === undefined ? {} : { verifyMs }),
          ...(snapshotMs === undefined ? {} : { snapshotMs }),
          totalMs: elapsed(totalStartedAt),
        }
      : undefined;
    if (
      marks === undefined &&
      parsed.postSnapshot === undefined &&
      verification === undefined &&
      domDelta === undefined &&
      timings === undefined
    ) {
      return data;
    }
    return {
      ...(isRecord(data) ? data : { result: data }),
      ...(marks === undefined ? {} : { marks }),
      ...(parsed.postSnapshot === undefined || snapshot === undefined
        ? {}
        : { postSnapshot: snapshot }),
      ...(verification === undefined ? {} : { verification }),
      ...(domDelta === undefined ? {} : { domDelta }),
      ...(timings === undefined ? {} : { timings }),
    };
  }

  #touchTab(tabId: number): void {
    const references = this.#elementReferences.get(tabId);
    if (references !== undefined) {
      this.#elementReferences.delete(tabId);
      this.#elementReferences.set(tabId, references);
    }
    const snapshot = this.#snapshotStates.get(tabId);
    if (snapshot !== undefined) {
      this.#snapshotStates.delete(tabId);
      this.#snapshotStates.set(tabId, snapshot);
    }
    const tabs = [...new Set([...this.#elementReferences.keys(), ...this.#snapshotStates.keys()])];
    while (tabs.length > this.#maxCachedTabs) {
      const oldest = tabs.shift();
      if (oldest !== undefined) this.clearTab(oldest);
    }
  }

  #setReference(tabId: number, reference: CachedElementReference): void {
    let references = this.#elementReferences.get(tabId);
    if (references === undefined) {
      references = new Map();
      this.#elementReferences.set(tabId, references);
    }
    references.delete(reference.elementId);
    references.set(reference.elementId, reference);
    while (references.size > this.#maxElementReferencesPerTab) {
      const oldest = references.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      references.delete(oldest);
    }
    this.#touchTab(tabId);
  }

  #cacheElementResult(
    action: string,
    parameters: Readonly<Record<string, unknown>>,
    data: unknown,
  ): void {
    const tabId = actionTabId(parameters, data);
    if (tabId === undefined || !isRecord(data)) return;
    const rawElements =
      action === "browser.get_page_snapshot"
        ? snapshotElements(data)
        : action === "browser.find_elements" || action === "browser.find_natural_language"
          ? Array.isArray(data["matches"])
            ? data["matches"]
                .map((match) => (isRecord(match) ? match["element"] : undefined))
                .filter(isRecord)
            : []
          : [];
    if (
      action === "browser.get_page_snapshot" &&
      isRecord(data["metadata"]) &&
      typeof data["metadata"]["documentId"] === "string" &&
      typeof data["metadata"]["domRevision"] === "number"
    ) {
      const prior = this.#snapshotStates.get(tabId);
      if (prior !== undefined && prior.documentId !== data["metadata"]["documentId"]) {
        this.#elementReferences.delete(tabId);
      }
      const rawDetail = data["metadata"]["detail"];
      const detail =
        rawDetail === "minimal" ||
        rawDetail === "outline" ||
        rawDetail === "interactive" ||
        rawDetail === "semantic" ||
        rawDetail === "full"
          ? rawDetail
          : undefined;
      this.#snapshotStates.set(tabId, {
        documentId: data["metadata"]["documentId"],
        domRevision: data["metadata"]["domRevision"],
        ...(detail === undefined ? {} : { detail }),
        elements: semanticElementMap(rawElements),
      });
    }
    for (const rawElement of rawElements) {
      const reference = referenceFrom(rawElement);
      if (reference !== undefined) this.#setReference(tabId, reference);
    }
    if (
      typeof parameters["elementId"] === "string" &&
      typeof data["resolvedElementId"] === "string"
    ) {
      const previous = this.#elementReferences.get(tabId)?.get(parameters["elementId"]);
      if (previous !== undefined) {
        this.#setReference(tabId, { ...previous, elementId: data["resolvedElementId"] });
      }
    }
    this.#touchTab(tabId);
  }

  async #callWithSafeRelocation(
    action: string,
    parameters: Record<string, unknown>,
    options: { idempotencyKey?: string },
    hooks: EnhancedActionHooks,
  ): Promise<unknown> {
    try {
      const data = await this.#transport.call(action, parameters, options);
      this.#cacheElementResult(action, parameters, data);
      return data;
    } catch (error) {
      const metadata = getActionMetadata(action);
      const tabId = parameters["tabId"];
      const elementId = parameters["elementId"];
      if (
        !hasErrorCode(error, "STALE_ELEMENT_REFERENCE") ||
        metadata === undefined ||
        metadata.riskLevel === "R2" ||
        metadata.riskLevel === "R3" ||
        typeof tabId !== "number" ||
        typeof elementId !== "string"
      ) {
        throw error;
      }
      const previous = this.#elementReferences.get(tabId)?.get(elementId);
      if (previous === undefined) throw error;
      const snapshot = await this.#transport.call("browser.get_page_snapshot", {
        tabId,
        detail: "interactive",
        maxElements: 1_000,
        maxTextLength: 25_000,
      });
      this.#cacheElementResult("browser.get_page_snapshot", { tabId }, snapshot);
      if (!isRecord(snapshot) || !isRecord(snapshot["metadata"])) throw error;
      const found = await this.#transport.call("browser.find_elements", {
        tabId,
        documentId: snapshot["metadata"]["documentId"],
        domRevision: snapshot["metadata"]["domRevision"],
        ...(previous.role.length === 0 || previous.role === "generic"
          ? {}
          : { role: previous.role }),
        ...(previous.name.length === 0 ? {} : { name: previous.name }),
        ...(previous.tag.length === 0 ? {} : { tag: previous.tag }),
        ...(previous.frameId.length === 0 ? {} : { frameId: previous.frameId }),
        ...(previous.css === undefined ? {} : { css: previous.css }),
        matchMode: "exact",
        maxResults: 2,
      });
      this.#cacheElementResult("browser.find_elements", { tabId }, found);
      if (!isRecord(found) || !Array.isArray(found["matches"]) || found["matches"].length !== 1) {
        const createError =
          hooks.createError ??
          ((code: string, message: string) => Object.assign(new Error(message), { code }));
        throw createError(
          "STALE_ELEMENT_REFERENCE",
          "The stale element could not be relocated uniquely; take a fresh snapshot and choose again",
          false,
          {
            action,
            tabId,
            previousElementId: elementId,
            candidateCount:
              isRecord(found) && Array.isArray(found["matches"]) ? found["matches"].length : 0,
          },
        );
      }
      const match = found["matches"][0];
      const relocated = isRecord(match) ? referenceFrom(match["element"]) : undefined;
      if (relocated === undefined) throw error;
      const retriedParameters = {
        ...parameters,
        documentId: found["documentId"],
        domRevision: found["domRevision"],
        elementId: relocated.elementId,
      };
      const relocationOptions =
        options.idempotencyKey === undefined
          ? options
          : {
              idempotencyKey: `relocated-${createHash("sha256")
                .update(options.idempotencyKey)
                .digest("hex")
                .slice(0, 48)}`,
            };
      const data = await this.#transport.call(action, retriedParameters, relocationOptions);
      this.#cacheElementResult(action, retriedParameters, data);
      return isRecord(data) ? { ...data, automaticallyRelocated: true } : data;
    }
  }

  async #previewAction(
    action: string,
    parameters: Record<string, unknown>,
    metadata: ActionMetadata,
  ): Promise<Record<string, unknown>> {
    const tabId = typeof parameters["tabId"] === "number" ? parameters["tabId"] : undefined;
    let page: unknown;
    let forms: unknown;
    if (tabId !== undefined) {
      try {
        const snapshot = await this.#transport.call("browser.get_page_snapshot", {
          tabId,
          detail: "interactive",
          maxElements: 300,
          maxTextLength: 10_000,
        });
        this.#cacheElementResult("browser.get_page_snapshot", { tabId }, snapshot);
        if (isRecord(snapshot)) {
          page = redactedPreviewValue("page", snapshot["page"]);
          forms = Array.isArray(snapshot["forms"])
            ? snapshot["forms"].slice(0, 20).map((form) =>
                isRecord(form)
                  ? {
                      elementId: form["elementId"],
                      name: form["name"],
                      method: form["method"],
                      action: redactedPreviewValue("url", form["action"]),
                      fieldCount: Array.isArray(form["fieldElementIds"])
                        ? form["fieldElementIds"].length
                        : undefined,
                      sensitive: form["sensitive"],
                    }
                  : form,
              )
            : undefined;
        }
      } catch {
        // A redacted preview is still useful when current-page inspection is unavailable.
      }
    }
    return {
      dryRun: true,
      executed: false,
      action,
      riskLevel: metadata.riskLevel as ActionRiskLevel,
      destructive: metadata.destructive,
      requiresAuthorization: metadata.requiresAuthorization,
      tabId,
      parameters: redactedPreviewValue("parameters", parameters),
      ...(page === undefined ? {} : { page }),
      ...(forms === undefined ? {} : { forms }),
      next: "Review this preview. To execute, repeat the same action without dryRun and include explicit authorization when required.",
    };
  }

  async #prepareAutomaticMarks(
    parameters: Record<string, unknown>,
    autoMarks: Record<string, unknown>,
  ): Promise<{ parameters: Record<string, unknown>; marks: Record<string, unknown>[] }> {
    const tabId = parameters["tabId"];
    if (typeof tabId !== "number") throw new Error("autoMarks requires tabId");
    const mode = parameters["mode"] ?? "viewport";
    if (mode !== "viewport" && mode !== "full_page") {
      throw new Error("autoMarks supports viewport and full_page screenshot modes");
    }
    const snapshot = await this.#transport.call("browser.get_page_snapshot", {
      tabId,
      detail: "interactive",
      maxElements: 1_000,
      maxTextLength: 10_000,
    });
    this.#cacheElementResult("browser.get_page_snapshot", { tabId }, snapshot);
    if (
      !isRecord(snapshot) ||
      !isRecord(snapshot["metadata"]) ||
      !Array.isArray(snapshot["elements"])
    ) {
      throw new Error("Could not obtain an interactive snapshot for automatic marks");
    }
    const max =
      typeof autoMarks["max"] === "number"
        ? Math.max(1, Math.min(20, Math.trunc(autoMarks["max"])))
        : 12;
    const includeEditable = autoMarks["includeEditable"] !== false;
    const labelMode = autoMarks["label"] === "name" ? "name" : "number";
    const candidates = snapshot["elements"]
      .filter(
        (element): element is Record<string, unknown> =>
          isRecord(element) &&
          element["visible"] !== false &&
          element["enabled"] !== false &&
          element["sensitive"] !== true &&
          (element["clickable"] === true || (includeEditable && element["editable"] === true)) &&
          (mode === "full_page" || element["outsideViewport"] !== true) &&
          typeof element["elementId"] === "string",
      )
      .slice(0, max);
    const marks = candidates.map((element, index) => ({
      mark: index + 1,
      elementId: element["elementId"],
      role: element["role"],
      name: element["name"],
    }));
    const generatedAnnotations = candidates.map((element, index) => {
      const name =
        typeof element["name"] === "string" && element["name"].trim().length > 0
          ? element["name"].trim().slice(0, 80)
          : String(element["role"] ?? "control");
      return {
        target: { type: "element", elementId: element["elementId"], padding: 4 },
        shape: "rounded_rectangle",
        stroke: "#2563eb",
        strokeWidth: 3,
        fill: "#2563eb",
        fillOpacity: 0.08,
        label: {
          text: labelMode === "name" ? `${index + 1}. ${name}` : String(index + 1),
          position: "auto",
          color: "#ffffff",
          background: "#2563eb",
          fontSize: 16,
          arrow: true,
        },
      };
    });
    const existing = Array.isArray(parameters["annotations"]) ? parameters["annotations"] : [];
    if (existing.length + generatedAnnotations.length > 20) {
      throw new Error("Existing annotations plus autoMarks exceed the 20-annotation limit");
    }
    return {
      parameters: {
        ...parameters,
        documentId: snapshot["metadata"]["documentId"],
        domRevision: snapshot["metadata"]["domRevision"],
        annotations: [...existing, ...generatedAnnotations],
      },
      marks,
    };
  }
}
