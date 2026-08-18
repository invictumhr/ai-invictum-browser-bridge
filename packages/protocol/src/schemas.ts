import { z } from "zod";

const containsAsciiControlCharacter = (value: string): boolean =>
  Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint !== undefined && (codePoint <= 31 || codePoint === 127);
  });

import {
  IBP_PROTOCOL,
  IBP_VERSION,
  type IbpEnvelope,
  type JsonValue,
} from "@invictum/shared-types";

const ACTION_PATTERN = /^[a-z][a-z0-9_-]*(?:\.[a-z][a-z0-9_-]*)+$/;

export const MessageIdSchema = z.string().min(1).max(128);
export const SessionIdSchema = z.string().min(1).max(128);
export const TimestampSchema = z.string().datetime({ offset: true });
export const JsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.null(),
    z.boolean(),
    z.number().finite(),
    z.string(),
    z.array(JsonValueSchema),
    z.record(JsonValueSchema),
  ]),
);

export const RiskContextSchema = z
  .object({
    expectedEffect: z.string().min(1).max(2_000).optional(),
    destructive: z.boolean().optional(),
    irreversible: z.boolean().optional(),
  })
  .strict();

export const RetryPolicySchema = z
  .object({
    maxAttempts: z.number().int().min(1).max(10),
    initialDelayMs: z.number().int().min(1).max(60_000),
    maxDelayMs: z.number().int().min(1).max(120_000),
    backoffMultiplier: z.number().min(1).max(10),
  })
  .strict()
  .refine((value) => value.maxDelayMs >= value.initialDelayMs, {
    message: "maxDelayMs must be greater than or equal to initialDelayMs",
    path: ["maxDelayMs"],
  });

export const ProtocolRequestSchema = z
  .object({
    action: z.string().min(3).max(128).regex(ACTION_PATTERN),
    parameters: JsonValueSchema,
    timeoutMs: z.number().int().min(1).max(120_000).optional(),
    riskContext: RiskContextSchema.optional(),
    idempotencyKey: z.string().min(1).max(128).optional(),
    retryPolicy: RetryPolicySchema.optional(),
  })
  .strict();

export const ProtocolErrorSchema = z
  .object({
    code: z.string().min(1).max(128),
    message: z.string().min(1).max(4_000),
    details: JsonValueSchema.optional(),
    retryable: z.boolean(),
  })
  .strict();

export const ProtocolTimingSchema = z
  .object({
    startedAt: TimestampSchema,
    completedAt: TimestampSchema,
    durationMs: z.number().nonnegative().finite(),
  })
  .strict();

export const ProtocolResponseSchema = z
  .object({
    success: z.boolean(),
    data: JsonValueSchema.optional(),
    error: ProtocolErrorSchema.optional(),
    timing: ProtocolTimingSchema.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.success && value.error !== undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A successful response cannot contain an error",
        path: ["error"],
      });
    }

    if (!value.success && value.error === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A failed response must contain an error",
        path: ["error"],
      });
    }
  });

export const ProtocolEventSchema = z
  .object({
    event: z.string().min(3).max(128).regex(ACTION_PATTERN),
    data: JsonValueSchema,
    completed: z.boolean().optional(),
  })
  .strict();

export const ProtocolEnvelopeSchema = z
  .object({
    protocol: z.literal(IBP_PROTOCOL),
    version: z.literal(IBP_VERSION),
    messageId: MessageIdSchema,
    sessionId: SessionIdSchema,
    timestamp: TimestampSchema,
    direction: z.enum(["request", "response", "event"]),
    type: z.enum(["ibp.request", "ibp.response", "ibp.event"]),
    payload: JsonValueSchema,
    correlationId: MessageIdSchema.optional(),
    sequence: z.number().int().nonnegative().optional(),
  })
  .strict();

export const SystemPingParametersSchema = z
  .object({
    sentAt: TimestampSchema,
    nonce: z.string().min(16).max(128),
  })
  .strict();

export const SystemPongDataSchema = z
  .object({
    reply: z.literal("pong"),
    nonce: z.string().min(16).max(128),
    receivedAt: TimestampSchema,
    component: z.literal("extension"),
  })
  .strict();

export const SystemCapabilitiesParametersSchema = z.object({}).strict();

export const BrowserCapabilitySchema = z
  .object({
    action: z.string().min(3).max(128).regex(ACTION_PATTERN),
    riskLevel: z.enum(["R0", "R1", "R2", "R3", "R4", "diagnostic"]),
    targeted: z.boolean(),
    description: z.string().min(1).max(512),
    readOnly: z.boolean().optional(),
    destructive: z.boolean().optional(),
    idempotent: z.boolean().optional(),
    requiresAuthorization: z.boolean().optional(),
    parameterKeys: z.array(z.string().min(1).max(128)).max(64).optional(),
  })
  .strict();

export const SystemCapabilitiesDataSchema = z
  .object({
    protocol: z.literal(IBP_PROTOCOL),
    protocolVersion: z.literal(IBP_VERSION),
    component: z.literal("extension"),
    extensionVersion: z.string().min(1).max(64),
    actions: z.array(BrowserCapabilitySchema).min(1).max(128),
    features: z
      .object({
        persistentHttpHostAccess: z.boolean(),
        figmaDesignFiles: z.literal(true),
        agentWindow: z.literal(true),
        semanticSnapshots: z.literal(true),
        scopedSnapshots: z.literal(true),
        compactSnapshots: z.literal(true),
        outlineSnapshots: z.literal(true),
        previousRevisionRelocation: z.literal(true),
        structuredParameterErrors: z.literal(true),
        screenshots: z.literal(true),
        screenshotModes: z.literal(true),
        screenshotAnnotations: z.literal(true),
        coordinateFallback: z.literal(true),
        prefilledCredentialPresence: z.literal(true),
        httpBasicAuth: z.literal(true),
        nativeJavaScriptDialogs: z.literal(true),
        localFileUpload: z.literal(true),
        wordpressMenuEditing: z.literal(true),
        wordpressAdminTools: z.literal(true),
        wordpressPostEditing: z.literal(true),
        elementInspection: z.literal(true),
        domMutation: z.literal(true),
        cssInjection: z.literal(true),
        eventCapture: z.literal(true),
        browserConsole: z.literal(true),
        networkCapture: z.literal(true),
        deviceEmulation: z.literal(true),
        advancedGestures: z.literal(true),
        pageText: z.literal(true),
        naturalLanguageFind: z.literal(true),
        historyNavigation: z.literal(true),
        explicitTabActivation: z.literal(true),
        sameOriginPageApi: z.literal(true),
        agentBatching: z.literal(true),
        pdfExport: z.literal(true),
        rawJavaScript: z.literal(true),
        customControlIdentity: z.literal(true),
        configurableTabActivation: z.literal(true),
        terminalAutomation: z.literal(true),
        trustedTerminalInput: z.literal(true),
        terminalBufferReadback: z.literal(true),
        terminalTransportReadback: z.literal(true),
        userStop: z.literal(true),
      })
      .strict(),
  })
  .strict();

export const ListTabsParametersSchema = z.object({}).strict();

export const BrowserTabSchema = z
  .object({
    tabId: z.number().int().nonnegative(),
    windowId: z.number().int(),
    index: z.number().int().nonnegative(),
    active: z.boolean(),
    highlighted: z.boolean(),
    pinned: z.boolean(),
    incognito: z.boolean(),
    audible: z.boolean(),
    discarded: z.boolean(),
    status: z.enum(["unloaded", "loading", "complete"]),
    title: z.string().max(512),
    url: z.string().min(1).max(4_096),
    origin: z.string().min(1).max(2_048),
    restricted: z.boolean(),
  })
  .strict();

export const ListTabsDataSchema = z
  .object({
    tabs: z.array(BrowserTabSchema).max(10_000),
    count: z.number().int().nonnegative().max(10_000),
    permission: z.literal("tabs"),
  })
  .strict()
  .refine((value) => value.count === value.tabs.length, {
    message: "Tab count must match the number of returned tabs",
    path: ["count"],
  });

const HttpUrlSchema = z
  .string()
  .min(1)
  .max(4_096)
  .url()
  .superRefine((value, context) => {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Only HTTP and HTTPS URLs are supported",
      });
    }
    if (parsed.username.length > 0 || parsed.password.length > 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "URL credentials are not allowed",
      });
    }
  });

export const OpenTabParametersSchema = z
  .object({
    url: HttpUrlSchema,
    active: z.boolean().optional(),
    waitUntil: z.enum(["none", "complete"]).default("complete"),
    timeoutMs: z.number().int().min(100).max(120_000).default(30_000),
  })
  .strict();

export const OpenTabDataSchema = z
  .object({
    tab: BrowserTabSchema,
    created: z.literal(true),
  })
  .strict();

export const NavigateParametersSchema = z
  .object({
    tabId: z.number().int().nonnegative(),
    url: HttpUrlSchema,
    active: z.boolean().optional(),
    waitUntil: z.enum(["none", "complete"]).default("complete"),
    timeoutMs: z.number().int().min(100).max(120_000).default(30_000),
  })
  .strict();

export const NavigateDataSchema = z
  .object({
    tab: BrowserTabSchema,
    navigated: z.literal(true),
    previousOrigin: z.string().min(1).max(2_048),
    originChanged: z.boolean(),
  })
  .strict();

export const HistoryNavigationParametersSchema = z
  .object({
    tabId: z.number().int().nonnegative(),
    waitUntil: z.enum(["none", "complete"]).default("complete"),
    timeoutMs: z.number().int().min(100).max(120_000).default(30_000),
  })
  .strict();

export const HistoryNavigationDataSchema = z
  .object({
    tab: BrowserTabSchema,
    direction: z.enum(["back", "forward"]),
    navigated: z.literal(true),
    previousUrl: z.string().min(1).max(4_096),
    previousOrigin: z.string().min(1).max(2_048),
    originChanged: z.boolean(),
  })
  .strict();

export const ActivateTabParametersSchema = z
  .object({
    tabId: z.number().int().nonnegative(),
  })
  .strict();

export const ActivateTabDataSchema = z
  .object({
    tab: BrowserTabSchema,
    activated: z.literal(true),
  })
  .strict();

const TextWaitConditionSchema = z
  .object({
    type: z.enum(["url", "title", "selector", "text"]),
    value: z.string().min(1).max(2_048),
    match: z.enum(["exact", "contains"]).default("contains"),
    caseSensitive: z.boolean().default(false),
  })
  .strict();

const DomStableWaitConditionSchema = z
  .object({
    type: z.literal("dom_stable"),
    stableMs: z.number().int().min(100).max(10_000).default(500),
  })
  .strict();

export const WaitForConditionSchema = z.union([
  TextWaitConditionSchema,
  DomStableWaitConditionSchema,
]);

export const WaitForParametersSchema = z
  .object({
    tabId: z.number().int().nonnegative(),
    condition: WaitForConditionSchema,
    timeoutMs: z.number().int().min(100).max(120_000).default(10_000),
    pollIntervalMs: z.number().int().min(50).max(2_000).default(200),
  })
  .strict();

export const WaitForDataSchema = z
  .object({
    tabId: z.number().int().nonnegative(),
    matched: z.literal(true),
    conditionType: z.enum(["url", "title", "selector", "text", "dom_stable"]),
    elapsedMs: z.number().int().nonnegative(),
    tab: BrowserTabSchema,
    documentId: z.string().min(1).max(128),
    domRevision: z.number().int().nonnegative(),
  })
  .strict();

export const UnlockTabParametersSchema = z
  .object({
    tabId: z.number().int().nonnegative(),
  })
  .strict();

export const AgentDisplayNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .regex(
    /^[\p{L}\p{N}][\p{L}\p{N} ._+-]{0,39}$/u,
    "Agent name may contain letters, numbers, spaces, dots, underscores, pluses, and hyphens",
  );

export const SetControlIdentityParametersSchema = z
  .object({
    tabId: z.number().int().nonnegative(),
    agentName: AgentDisplayNameSchema,
  })
  .strict();

export const SetControlIdentityDataSchema = z
  .object({
    tabId: z.number().int().nonnegative(),
    agentName: AgentDisplayNameSchema,
    label: z.string().min(1).max(64),
    identified: z.literal(true),
  })
  .strict();

export const UnlockTabDataSchema = z
  .object({
    tabId: z.number().int().nonnegative(),
    unlocked: z.boolean(),
  })
  .strict();

export const SnapshotDetailSchema = z.enum([
  "minimal",
  "outline",
  "interactive",
  "semantic",
  "full",
]);

export const TruncationReasonSchema = z.enum([
  "max_elements",
  "max_depth",
  "max_text_length",
  "field_text_limit",
]);

export const GetPageSnapshotParametersSchema = z
  .object({
    tabId: z.number().int().nonnegative(),
    detail: SnapshotDetailSchema.default("interactive"),
    includeHidden: z.boolean().default(false),
    maxElements: z.number().int().min(1).max(5_000).default(1_000),
    maxDepth: z.number().int().min(1).max(64).default(64),
    maxTextLength: z.number().int().min(1_000).max(200_000).default(50_000),
    scope: z
      .object({
        documentId: z.string().min(1).max(128),
        domRevision: z.number().int().nonnegative(),
        elementId: z.string().min(1).max(128),
      })
      .strict()
      .optional(),
  })
  .strict();

export const BoundingBoxSchema = z
  .object({
    x: z.number().finite(),
    y: z.number().finite(),
    width: z.number().nonnegative().finite(),
    height: z.number().nonnegative().finite(),
  })
  .strict();

export const ElementSelectorsSchema = z
  .object({
    css: z.string().min(1).max(1_024).optional(),
    aria: z.string().min(1).max(1_024).optional(),
  })
  .strict();

export const AgentElementSchema = z
  .object({
    elementId: z.string().min(1).max(128),
    frameId: z.string().min(1).max(128),
    tag: z.string().min(1).max(64),
    role: z.string().min(1).max(128),
    name: z.string().max(1_000),
    text: z.string().max(2_000).optional(),
    visible: z.boolean().optional(),
    enabled: z.boolean().optional(),
    editable: z.boolean().optional(),
    clickable: z.boolean().optional(),
    focused: z.boolean().optional(),
    checked: z.boolean().nullable().optional(),
    selected: z.boolean().nullable().optional(),
    required: z.boolean().optional(),
    sensitive: z.boolean().optional(),
    hasValue: z.boolean().optional(),
    outsideViewport: z.boolean().optional(),
    boundingBox: BoundingBoxSchema,
    selectors: ElementSelectorsSchema,
  })
  .strict();

export const OutlineElementSchema = z
  .object({
    elementId: z.string().min(1).max(128),
    frameId: z.string().min(1).max(128),
    tag: z.string().min(1).max(64),
    role: z.string().min(1).max(128),
    name: z.string().max(1_000),
    editable: z.literal(true).optional(),
    clickable: z.literal(true).optional(),
    sensitive: z.literal(true).optional(),
    hasValue: z.literal(true).optional(),
    outsideViewport: z.literal(true).optional(),
    css: z.string().min(1).max(1_024).optional(),
  })
  .strict();

export const AgentFormSchema = z
  .object({
    elementId: z.string().min(1).max(128),
    frameId: z.string().min(1).max(128),
    name: z.string().max(1_000),
    method: z.enum(["get", "post", "dialog", "unknown"]),
    action: z.string().min(1).max(4_096),
    fieldElementIds: z.array(z.string().min(1).max(128)).max(1_000),
    sensitive: z.boolean(),
  })
  .strict();

export const AgentDialogSchema = z
  .object({
    elementId: z.string().min(1).max(128),
    frameId: z.string().min(1).max(128),
    role: z.enum(["dialog", "alertdialog"]),
    name: z.string().max(1_000),
    open: z.boolean(),
    modal: z.boolean(),
  })
  .strict();

export const AgentAlertSchema = z
  .object({
    elementId: z.string().min(1).max(128),
    frameId: z.string().min(1).max(128),
    role: z.enum(["alert", "status"]),
    text: z.string().max(2_000),
  })
  .strict();

export const TextBlockSchema = z
  .object({
    elementId: z.string().min(1).max(128),
    frameId: z.string().min(1).max(128),
    kind: z.enum(["heading", "paragraph", "label", "navigation", "other"]),
    text: z.string().min(1).max(2_000),
    level: z.number().int().min(1).max(6).nullable(),
    boundingBox: BoundingBoxSchema,
  })
  .strict();

export const FrameSnapshotSchema = z
  .object({
    frameId: z.string().min(1).max(128),
    parentFrameId: z.string().min(1).max(128).nullable(),
    url: z.string().min(1).max(4_096),
    title: z.string().max(512),
    name: z.string().max(512),
    accessible: z.boolean(),
  })
  .strict();

export const PageSnapshotSchema = z
  .object({
    page: z
      .object({
        url: z.string().min(1).max(4_096),
        title: z.string().max(512),
        origin: z.string().min(1).max(2_048),
        viewport: z
          .object({
            width: z.number().nonnegative().finite(),
            height: z.number().nonnegative().finite(),
            deviceScaleFactor: z.number().positive().finite(),
          })
          .strict(),
        scroll: z
          .object({
            x: z.number().finite(),
            y: z.number().finite(),
            maxX: z.number().nonnegative().finite(),
            maxY: z.number().nonnegative().finite(),
          })
          .strict(),
        loadingState: z.enum(["loading", "interactive", "complete"]),
      })
      .strict(),
    frames: z.array(FrameSnapshotSchema).max(1_000),
    elements: z.array(AgentElementSchema).max(5_000),
    outline: z.array(OutlineElementSchema).max(5_000).optional(),
    forms: z.array(AgentFormSchema).max(1_000),
    dialogs: z.array(AgentDialogSchema).max(100),
    alerts: z.array(AgentAlertSchema).max(1_000),
    textBlocks: z.array(TextBlockSchema).max(5_000),
    metadata: z
      .object({
        generatedAt: TimestampSchema,
        documentId: z.string().min(1).max(128),
        domRevision: z.number().int().nonnegative(),
        elementCount: z.number().int().nonnegative().max(5_000),
        textLength: z.number().int().nonnegative().max(200_000),
        truncated: z.boolean(),
        truncationReasons: z.array(TruncationReasonSchema).max(4).default([]),
        hiddenSubtreesSkipped: z.number().int().nonnegative().max(1_000_000).default(0),
        detail: SnapshotDetailSchema,
      })
      .strict(),
  })
  .strict()
  .refine(
    (value) =>
      value.metadata.elementCount ===
      (value.metadata.detail === "outline" ? (value.outline?.length ?? 0) : value.elements.length),
    {
      message: "Snapshot elementCount must match the active element representation",
      path: ["metadata", "elementCount"],
    },
  );

export const GetPageTextParametersSchema = z
  .object({
    tabId: z.number().int().nonnegative(),
    maxChars: z.number().int().min(1_000).max(200_000).default(50_000),
    format: z.enum(["text", "markdown"]).default("text"),
    scope: z
      .object({
        documentId: z.string().min(1).max(128),
        domRevision: z.number().int().nonnegative(),
        elementId: z.string().min(1).max(128),
      })
      .strict()
      .optional(),
  })
  .strict();

export const GetPageTextDataSchema = z
  .object({
    page: z
      .object({
        url: z.string().min(1).max(4_096),
        title: z.string().max(512),
        origin: z.string().min(1).max(2_048),
      })
      .strict(),
    documentId: z.string().min(1).max(128),
    domRevision: z.number().int().nonnegative(),
    format: z.enum(["text", "markdown"]),
    text: z.string().max(200_000),
    characterCount: z.number().int().nonnegative().max(200_000),
    blockCount: z.number().int().nonnegative().max(5_000),
    truncated: z.boolean(),
    scopeElementId: z.string().min(1).max(128).optional(),
  })
  .strict()
  .refine((value) => value.characterCount === value.text.length, {
    message: "Page-text characterCount must match the returned text",
    path: ["characterCount"],
  });

export const FindElementsRegexSchema = z
  .object({
    pattern: z.string().min(1).max(256),
    flags: z
      .string()
      .regex(/^[imsu]*$/)
      .default("iu")
      .refine((flags) => new Set(flags).size === flags.length, {
        message: "Regex flags must not be repeated",
      }),
  })
  .strict();

export const FindElementsParentContextSchema = z
  .object({
    role: z.string().min(1).max(128).optional(),
    name: z.string().min(1).max(1_000).optional(),
    text: z.string().min(1).max(2_000).optional(),
    tag: z.string().min(1).max(64).optional(),
  })
  .strict()
  .refine((value) => Object.values(value).some((criterion) => criterion !== undefined), {
    message: "Parent context requires at least one criterion",
  });

export const FindElementsProximitySchema = z
  .object({
    elementId: z.string().min(1).max(128),
    maxDistancePx: z.number().positive().finite().max(100_000).default(1_000),
  })
  .strict();

export const FindElementsTablePositionSchema = z
  .object({
    row: z.number().int().positive().max(100_000).optional(),
    column: z.number().int().positive().max(10_000).optional(),
  })
  .strict()
  .refine((value) => value.row !== undefined || value.column !== undefined, {
    message: "Table position requires a row or column",
  });

export const FindElementsParametersSchema = z
  .object({
    tabId: z.number().int().nonnegative(),
    documentId: z.string().min(1).max(128),
    domRevision: z.number().int().nonnegative(),
    text: z.string().min(1).max(2_000).optional(),
    regex: FindElementsRegexSchema.optional(),
    role: z.string().min(1).max(128).optional(),
    name: z.string().min(1).max(1_000).optional(),
    label: z.string().min(1).max(1_000).optional(),
    placeholder: z.string().min(1).max(1_000).optional(),
    title: z.string().min(1).max(1_000).optional(),
    alt: z.string().min(1).max(1_000).optional(),
    css: z.string().min(1).max(1_024).optional(),
    xpath: z.string().min(1).max(2_048).optional(),
    testId: z.string().min(1).max(512).optional(),
    tag: z.string().min(1).max(64).optional(),
    inputType: z.string().min(1).max(64).optional(),
    visible: z.boolean().default(true),
    enabled: z.boolean().optional(),
    frameId: z.string().min(1).max(128).optional(),
    proximity: FindElementsProximitySchema.optional(),
    table: FindElementsTablePositionSchema.optional(),
    parent: FindElementsParentContextSchema.optional(),
    matchMode: z.enum(["exact", "contains", "starts_with"]).default("contains"),
    caseSensitive: z.boolean().default(false),
    maxResults: z.number().int().min(1).max(500).default(50),
  })
  .strict();

export const FindElementCriterionSchema = z.enum([
  "text",
  "regex",
  "role",
  "name",
  "label",
  "placeholder",
  "title",
  "alt",
  "css",
  "xpath",
  "testId",
  "tag",
  "inputType",
  "visible",
  "enabled",
  "frameId",
  "proximity",
  "table",
  "parent",
]);

export const FindElementMatchSchema = z
  .object({
    element: AgentElementSchema,
    score: z.number().int().min(0).max(1_000),
    matchedBy: z.array(FindElementCriterionSchema).min(1).max(20),
    distancePx: z.number().nonnegative().finite().optional(),
    tableCell: z
      .object({
        row: z.number().int().positive(),
        column: z.number().int().positive(),
      })
      .strict()
      .optional(),
  })
  .strict();

export const FindElementsDataSchema = z
  .object({
    page: z
      .object({
        url: z.string().min(1).max(4_096),
        origin: z.string().min(1).max(2_048),
      })
      .strict(),
    documentId: z.string().min(1).max(128),
    domRevision: z.number().int().nonnegative(),
    matches: z.array(FindElementMatchSchema).max(500),
    count: z.number().int().nonnegative().max(500),
    truncated: z.boolean(),
    matchesTruncated: z.boolean().default(false),
    scanTruncated: z.boolean().default(false),
    truncationReasons: z.array(TruncationReasonSchema).max(4).default([]),
  })
  .strict()
  .refine((value) => value.count === value.matches.length, {
    message: "Find-elements count must match the returned matches",
    path: ["count"],
  });

export const FindNaturalLanguageParametersSchema = z
  .object({
    tabId: z.number().int().nonnegative(),
    query: z.string().trim().min(2).max(500),
    maxResults: z.number().int().min(1).max(50).default(10),
    includeHidden: z.boolean().default(false),
  })
  .strict();

export const NaturalLanguageMatchSchema = z
  .object({
    element: AgentElementSchema,
    score: z.number().int().min(1).max(1_000),
    matchedTerms: z.array(z.string().min(1).max(64)).min(1).max(64),
    reasons: z
      .array(z.enum(["exact_name", "name", "role", "text", "tag", "selector", "state"]))
      .min(1)
      .max(16),
  })
  .strict();

export const FindNaturalLanguageDataSchema = z
  .object({
    page: z
      .object({
        url: z.string().min(1).max(4_096),
        origin: z.string().min(1).max(2_048),
      })
      .strict(),
    documentId: z.string().min(1).max(128),
    domRevision: z.number().int().nonnegative(),
    query: z.string().min(2).max(500),
    matches: z.array(NaturalLanguageMatchSchema).max(50),
    count: z.number().int().nonnegative().max(50),
    truncated: z.boolean(),
  })
  .strict()
  .refine((value) => value.count === value.matches.length, {
    message: "Natural-language match count must match the returned matches",
    path: ["count"],
  });

const RevisionBoundElementParametersShape = {
  tabId: z.number().int().nonnegative(),
  documentId: z.string().min(1).max(128),
  domRevision: z.number().int().nonnegative(),
  elementId: z.string().min(1).max(128),
};

export const ClickElementParametersSchema = z
  .object({
    ...RevisionBoundElementParametersShape,
    scrollIntoView: z.boolean().default(true),
  })
  .strict();

export const ClickElementDataSchema = z
  .object({
    page: z
      .object({
        urlBefore: z.string().min(1).max(4_096),
        urlAfter: z.string().min(1).max(4_096),
        origin: z.string().min(1).max(2_048),
      })
      .strict(),
    documentId: z.string().min(1).max(128),
    domRevisionBefore: z.number().int().nonnegative(),
    domRevisionAfter: z.number().int().nonnegative(),
    elementId: z.string().min(1).max(128),
    resolvedElementId: z.string().min(1).max(128).optional(),
    target: z
      .object({
        role: z.string().min(1).max(128),
        name: z.string().max(1_000),
        sensitive: z.boolean(),
      })
      .strict(),
    clicked: z.literal(true),
    domChanged: z.boolean(),
    urlChanged: z.boolean(),
    requiresNewSnapshot: z.literal(true),
  })
  .strict();

export const TypeTextParametersSchema = z
  .object({
    ...RevisionBoundElementParametersShape,
    text: z.string().max(10_000),
    mode: z.enum(["replace", "append"]).default("replace"),
    dispatchChange: z.boolean().default(true),
  })
  .strict();

export const TypeTextDataSchema = z
  .object({
    page: z
      .object({
        url: z.string().min(1).max(4_096),
        origin: z.string().min(1).max(2_048),
      })
      .strict(),
    documentId: z.string().min(1).max(128),
    domRevisionBefore: z.number().int().nonnegative(),
    domRevisionAfter: z.number().int().nonnegative(),
    elementId: z.string().min(1).max(128),
    resolvedElementId: z.string().min(1).max(128).optional(),
    target: z
      .object({
        role: z.string().min(1).max(128),
        name: z.string().max(1_000),
        sensitive: z.boolean(),
      })
      .strict(),
    mode: z.enum(["replace", "append"]),
    characters: z.number().int().nonnegative().max(10_000),
    changed: z.boolean(),
    requiresNewSnapshot: z.literal(true),
  })
  .strict();

export const ExplicitUserAuthorizationSchema = z
  .object({
    source: z.literal("explicit_user_instruction"),
    instructionId: z
      .string()
      .min(1)
      .max(128)
      .regex(/^[A-Za-z0-9._:-]+$/),
  })
  .strict();

const PageApiUrlSchema = z
  .string()
  .trim()
  .min(1)
  .max(4_096)
  .refine((value) => !containsAsciiControlCharacter(value), {
    message: "Page API URL cannot contain control characters",
  });

export const PageApiRequestParametersSchema = z
  .object({
    tabId: z.number().int().nonnegative(),
    url: PageApiUrlSchema,
    method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).default("GET"),
    headers: z
      .object({
        accept: z.string().min(1).max(256).optional(),
        contentType: z.enum(["application/json", "text/plain"]).optional(),
        ifMatch: z.string().min(1).max(512).optional(),
        ifNoneMatch: z.string().min(1).max(512).optional(),
      })
      .strict()
      .default({}),
    body: z.union([JsonValueSchema, z.string().max(262_144)]).optional(),
    responseMode: z.enum(["json", "text", "status_only"]).default("json"),
    maxResponseChars: z.number().int().min(1_000).max(500_000).default(100_000),
    useWordPressNonce: z.boolean().default(false),
    authorization: ExplicitUserAuthorizationSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (value.method === "GET" && value.body !== undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "GET page API requests cannot include a body",
        path: ["body"],
      });
    }
  });

export const PageApiRequestDataSchema = z
  .object({
    tabId: z.number().int().nonnegative(),
    origin: z.string().min(1).max(2_048),
    url: z.string().min(1).max(4_096),
    method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
    status: z.number().int().min(0).max(999),
    ok: z.boolean(),
    redirected: z.boolean(),
    contentType: z.string().max(512),
    responseMode: z.enum(["json", "text", "status_only"]),
    body: JsonValueSchema.optional(),
    responseChars: z.number().int().nonnegative().max(500_000),
    truncated: z.boolean(),
    wordpressNonceUsed: z.boolean(),
    verificationRequired: z.boolean(),
  })
  .strict();

export const CloseTabParametersSchema = z
  .object({
    tabId: z.number().int().nonnegative(),
    authorization: ExplicitUserAuthorizationSchema,
  })
  .strict();

export const CloseTabDataSchema = z
  .object({
    tabId: z.number().int().nonnegative(),
    closed: z.literal(true),
  })
  .strict();

export const SetFileInputFilesParametersSchema = z
  .object({
    ...RevisionBoundElementParametersShape,
    filePaths: z.array(z.string().min(1).max(32_767)).min(1).max(20),
    authorization: ExplicitUserAuthorizationSchema,
  })
  .strict();

export const SetFileInputFilesDataSchema = z
  .object({
    page: z
      .object({
        url: z.string().min(1).max(4_096),
        origin: z.string().min(1).max(2_048),
      })
      .strict(),
    documentId: z.string().min(1).max(128),
    domRevisionBefore: z.number().int().nonnegative(),
    domRevisionAfter: z.number().int().nonnegative(),
    elementId: z.string().min(1).max(128),
    resolvedElementId: z.string().min(1).max(128).optional(),
    fileCount: z.number().int().positive().max(20),
    countVerified: z.boolean(),
    multiple: z.boolean(),
    accept: z.string().max(2_000),
    changed: z.literal(true),
    requiresNewSnapshot: z.literal(true),
    verificationRequired: z.literal(true),
  })
  .strict();

export const HttpAuthStateParametersSchema = z
  .object({
    tabId: z.number().int().nonnegative(),
  })
  .strict();

export const HttpAuthStateDataSchema = z
  .object({
    tabId: z.number().int().nonnegative(),
    challengeDetected: z.boolean(),
    origin: z.string().min(1).max(2_048).optional(),
    scheme: z.string().min(1).max(64).optional(),
    realm: z.string().max(512).optional(),
    isProxy: z.boolean().optional(),
    detectedAt: TimestampSchema.optional(),
  })
  .strict();

export const AuthenticateHttpParametersSchema = z
  .object({
    tabId: z.number().int().nonnegative(),
    username: z.string().min(1).max(512),
    password: z.string().min(1).max(4_096),
    authorization: ExplicitUserAuthorizationSchema,
    timeoutMs: z.number().int().min(1_000).max(30_000).default(15_000),
  })
  .strict();

export const AuthenticateHttpDataSchema = z
  .object({
    tabId: z.number().int().nonnegative(),
    origin: z.string().min(1).max(2_048),
    authenticated: z.literal(true),
    challengeHandled: z.boolean(),
    scheme: z.literal("basic").optional(),
    credentialsRetained: z.literal(false),
    verificationRequired: z.literal(true),
  })
  .strict();

const JavaScriptDialogTriggerSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("none") }).strict(),
  z
    .object({
      type: z.literal("click"),
      documentId: z.string().min(1).max(128),
      domRevision: z.number().int().nonnegative(),
      elementId: z.string().min(1).max(128),
      scrollIntoView: z.boolean().default(true),
    })
    .strict(),
  z
    .object({
      type: z.literal("navigate"),
      url: HttpUrlSchema,
    })
    .strict(),
]);

export const HandleJavaScriptDialogParametersSchema = z
  .object({
    tabId: z.number().int().nonnegative(),
    accept: z.boolean(),
    promptText: z.string().max(2_000).optional(),
    trigger: JavaScriptDialogTriggerSchema.default({ type: "none" }),
    timeoutMs: z.number().int().min(100).max(30_000).default(5_000),
    authorization: ExplicitUserAuthorizationSchema,
  })
  .strict();

export const HandleJavaScriptDialogDataSchema = z
  .object({
    tabId: z.number().int().nonnegative(),
    detected: z.literal(true),
    handled: z.literal(true),
    accepted: z.boolean(),
    type: z.enum(["alert", "confirm", "prompt", "beforeunload", "unknown"]),
    message: z.string().max(2_000),
    origin: z.string().min(1).max(2_048),
    triggerType: z.enum(["none", "click", "navigate"]),
    promptTextSupplied: z.boolean(),
    requiresNewSnapshot: z.literal(true),
  })
  .strict();

const SelectionCriterionSchema = z.union([
  z.object({ values: z.array(z.string().max(2_000)).min(1).max(100) }).strict(),
  z.object({ labels: z.array(z.string().max(2_000)).min(1).max(100) }).strict(),
  z.object({ indices: z.array(z.number().int().nonnegative()).min(1).max(100) }).strict(),
]);

export const SelectOptionParametersSchema = z
  .object({
    ...RevisionBoundElementParametersShape,
    selection: SelectionCriterionSchema,
    dispatchChange: z.boolean().default(true),
  })
  .strict();

export const SelectOptionDataSchema = z
  .object({
    page: z
      .object({
        url: z.string().min(1).max(4_096),
        origin: z.string().min(1).max(2_048),
      })
      .strict(),
    documentId: z.string().min(1).max(128),
    domRevisionBefore: z.number().int().nonnegative(),
    domRevisionAfter: z.number().int().nonnegative(),
    elementId: z.string().min(1).max(128),
    resolvedElementId: z.string().min(1).max(128).optional(),
    selectedCount: z.number().int().nonnegative().max(100),
    selectedIndices: z.array(z.number().int().nonnegative()).max(100),
    changed: z.boolean(),
    requiresNewSnapshot: z.literal(true),
  })
  .strict()
  .refine((value) => value.selectedCount === value.selectedIndices.length, {
    message: "selectedCount must match selectedIndices",
    path: ["selectedCount"],
  });

export const SetCheckedParametersSchema = z.object(RevisionBoundElementParametersShape).strict();

export const SetCheckedDataSchema = z
  .object({
    page: z
      .object({
        url: z.string().min(1).max(4_096),
        origin: z.string().min(1).max(2_048),
      })
      .strict(),
    documentId: z.string().min(1).max(128),
    domRevisionBefore: z.number().int().nonnegative(),
    domRevisionAfter: z.number().int().nonnegative(),
    elementId: z.string().min(1).max(128),
    resolvedElementId: z.string().min(1).max(128).optional(),
    checked: z.boolean(),
    changed: z.boolean(),
    requiresNewSnapshot: z.literal(true),
  })
  .strict();

export const SubmitFormParametersSchema = z
  .object({
    ...RevisionBoundElementParametersShape,
    authorization: ExplicitUserAuthorizationSchema,
  })
  .strict();

export const SubmitFormDataSchema = z
  .object({
    page: z
      .object({
        urlBefore: z.string().min(1).max(4_096),
        origin: z.string().min(1).max(2_048),
      })
      .strict(),
    documentId: z.string().min(1).max(128),
    domRevisionBefore: z.number().int().nonnegative(),
    elementId: z.string().min(1).max(128),
    submitted: z.literal(true),
    verificationRequired: z.literal(true),
  })
  .strict();

const WordPressMenuItemIdSchema = z
  .string()
  .min(1)
  .max(32)
  .regex(/^-?\d+$/);

const WordPressMenuDestinationSchema = z.discriminatedUnion("placement", [
  z.object({ placement: z.enum(["root_start", "root_end"]) }).strict(),
  z
    .object({
      placement: z.enum(["before", "after", "inside_start", "inside_end"]),
      targetItemId: WordPressMenuItemIdSchema,
    })
    .strict(),
]);

const WordPressMenuItemSchema = z
  .object({
    itemId: WordPressMenuItemIdSchema,
    parentItemId: WordPressMenuItemIdSchema.nullable(),
    depth: z.number().int().nonnegative().max(50),
    position: z.number().int().nonnegative().max(10_000),
    label: z.string().max(1_000),
    type: z.string().max(128),
    object: z.string().max(128),
    url: z.string().max(4_096).optional(),
    openInNewTab: z.boolean(),
    childCount: z.number().int().nonnegative().max(10_000),
  })
  .strict();

export const GetWordPressMenuParametersSchema = z
  .object({
    tabId: z.number().int().nonnegative(),
    maxItems: z.number().int().min(1).max(500).default(250),
  })
  .strict();

export const GetWordPressMenuDataSchema = z
  .object({
    page: z
      .object({
        url: z.string().min(1).max(4_096),
        origin: z.string().min(1).max(2_048),
      })
      .strict(),
    documentId: z.string().min(1).max(128),
    domRevision: z.number().int().nonnegative(),
    menuId: z.string().min(1).max(128),
    menuName: z.string().max(1_000),
    items: z.array(WordPressMenuItemSchema).max(500),
    itemCount: z.number().int().nonnegative().max(10_000),
    truncated: z.boolean(),
    dirty: z.boolean(),
  })
  .strict()
  .refine((value) => value.items.length <= value.itemCount, {
    message: "items cannot exceed itemCount",
    path: ["items"],
  });

const UpdateWordPressMenuItemOperationSchema = z
  .object({
    type: z.literal("update"),
    itemId: WordPressMenuItemIdSchema,
    label: z.string().min(1).max(1_000).optional(),
    url: z.string().min(1).max(4_096).optional(),
    titleAttribute: z.string().max(1_000).optional(),
    cssClasses: z.string().max(1_000).optional(),
    description: z.string().max(4_000).optional(),
    openInNewTab: z.boolean().optional(),
  })
  .strict();

const WordPressMenuOperationSchema = z
  .discriminatedUnion("type", [
    z
      .object({
        type: z.literal("add_custom"),
        label: z.string().min(1).max(1_000),
        url: z.string().min(1).max(4_096),
        destination: WordPressMenuDestinationSchema.default({ placement: "root_end" }),
        titleAttribute: z.string().max(1_000).default(""),
        cssClasses: z.string().max(1_000).default(""),
        description: z.string().max(4_000).default(""),
        openInNewTab: z.boolean().default(false),
      })
      .strict(),
    UpdateWordPressMenuItemOperationSchema,
    z
      .object({
        type: z.literal("remove"),
        itemId: WordPressMenuItemIdSchema,
        includeChildren: z.boolean().default(false),
      })
      .strict(),
    z
      .object({
        type: z.literal("move"),
        itemId: WordPressMenuItemIdSchema,
        destination: WordPressMenuDestinationSchema,
      })
      .strict(),
  ])
  .superRefine((value, context) => {
    if (
      value.type === "update" &&
      value.label === undefined &&
      value.url === undefined &&
      value.titleAttribute === undefined &&
      value.cssClasses === undefined &&
      value.description === undefined &&
      value.openInNewTab === undefined
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "update requires at least one changed field",
      });
    }
  });

export const EditWordPressMenuParametersSchema = z
  .object({
    tabId: z.number().int().nonnegative(),
    documentId: z.string().min(1).max(128),
    domRevision: z.number().int().nonnegative(),
    operations: z.array(WordPressMenuOperationSchema).max(100),
    save: z.boolean().default(false),
    authorization: ExplicitUserAuthorizationSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (value.operations.length === 0 && !value.save) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "At least one operation is required unless save is true",
        path: ["operations"],
      });
    }
  });

export const EditWordPressMenuDataSchema = z
  .object({
    page: z
      .object({
        url: z.string().min(1).max(4_096),
        origin: z.string().min(1).max(2_048),
      })
      .strict(),
    documentId: z.string().min(1).max(128),
    domRevisionBefore: z.number().int().nonnegative(),
    domRevisionAfter: z.number().int().nonnegative(),
    menuId: z.string().min(1).max(128),
    menuName: z.string().max(1_000),
    operationTypes: z.array(z.enum(["add_custom", "update", "remove", "move"])).max(100),
    affectedItemIds: z.array(WordPressMenuItemIdSchema).max(500),
    items: z.array(WordPressMenuItemSchema).max(500),
    itemCount: z.number().int().nonnegative().max(10_000),
    changed: z.boolean(),
    submitted: z.boolean(),
    verificationRequired: z.boolean(),
    requiresNewSnapshot: z.literal(true),
  })
  .strict()
  .refine((value) => value.submitted === value.verificationRequired, {
    message: "submitted and verificationRequired must match",
    path: ["verificationRequired"],
  });

const WordPressAdminNoticeSchema = z
  .object({
    kind: z.enum(["info", "success", "warning", "error"]),
    text: z.string().max(4_000),
    dismissible: z.boolean(),
  })
  .strict();

const WordPressListTableActionSchema = z
  .object({
    key: z
      .string()
      .min(1)
      .max(128)
      .regex(/^[A-Za-z0-9_.:-]+$/),
    label: z.string().max(500),
    destructive: z.boolean(),
  })
  .strict();

const WordPressListTableSchema = z
  .object({
    tableId: z.string().max(256),
    columns: z
      .array(
        z
          .object({
            key: z.string().min(1).max(128),
            label: z.string().max(500),
          })
          .strict(),
      )
      .max(100),
    rows: z
      .array(
        z
          .object({
            rowId: z.string().min(1).max(512),
            primaryText: z.string().max(2_000),
            status: z.string().max(256),
            selected: z.boolean(),
            columns: z
              .array(
                z
                  .object({
                    key: z.string().min(1).max(128),
                    text: z.string().max(2_000),
                  })
                  .strict(),
              )
              .max(100),
            actions: z.array(WordPressListTableActionSchema).max(50),
          })
          .strict(),
      )
      .max(250),
    rowCount: z.number().int().nonnegative().max(100_000),
    truncated: z.boolean(),
    bulkActions: z.array(WordPressListTableActionSchema).max(100),
  })
  .strict()
  .refine((value) => value.rows.length <= value.rowCount, {
    message: "rows cannot exceed rowCount",
    path: ["rows"],
  });

export const GetWordPressAdminParametersSchema = z
  .object({
    tabId: z.number().int().nonnegative(),
    maxRows: z.number().int().min(1).max(250).default(50),
    maxCellText: z.number().int().min(50).max(2_000).default(500),
  })
  .strict();

export const GetWordPressAdminDataSchema = z
  .object({
    page: z
      .object({
        url: z.string().min(1).max(4_096),
        origin: z.string().min(1).max(2_048),
      })
      .strict(),
    documentId: z.string().min(1).max(128),
    domRevision: z.number().int().nonnegative(),
    screen: z
      .object({
        pageTitle: z.string().max(1_000),
        heading: z.string().max(1_000),
        pageSlug: z.string().max(256),
        postType: z.string().max(128),
        taxonomy: z.string().max(128),
        editorKind: z.enum(["none", "block", "classic"]),
      })
      .strict(),
    adminBar: z
      .object({
        present: z.boolean(),
        siteName: z.string().max(1_000),
      })
      .strict(),
    notices: z.array(WordPressAdminNoticeSchema).max(100),
    listTable: WordPressListTableSchema.nullable(),
  })
  .strict();

const WordPressAdminPageBoundShape = {
  tabId: z.number().int().nonnegative(),
  documentId: z.string().min(1).max(128),
  domRevision: z.number().int().nonnegative(),
  authorization: ExplicitUserAuthorizationSchema,
};

export const WordPressListTableActionParametersSchema = z.discriminatedUnion("operation", [
  z
    .object({
      ...WordPressAdminPageBoundShape,
      operation: z.literal("open_row_action"),
      rowId: z.string().min(1).max(512),
      actionKey: z
        .string()
        .min(1)
        .max(128)
        .regex(/^[A-Za-z0-9_.:-]+$/),
    })
    .strict(),
  z
    .object({
      ...WordPressAdminPageBoundShape,
      operation: z.literal("apply_bulk"),
      rowIds: z.array(z.string().min(1).max(512)).min(1).max(250),
      actionKey: z.string().min(1).max(128),
    })
    .strict(),
]);

export const WordPressListTableActionDataSchema = z
  .object({
    page: z
      .object({
        urlBefore: z.string().min(1).max(4_096),
        urlAfter: z.string().min(1).max(4_096),
        origin: z.string().min(1).max(2_048),
      })
      .strict(),
    documentId: z.string().min(1).max(128),
    domRevisionBefore: z.number().int().nonnegative(),
    domRevisionAfter: z.number().int().nonnegative(),
    operation: z.enum(["open_row_action", "apply_bulk"]),
    rowIds: z.array(z.string().min(1).max(512)).min(1).max(250),
    actionKey: z.string().min(1).max(128),
    destructive: z.boolean(),
    triggered: z.literal(true),
    verificationRequired: z.literal(true),
    requiresNewSnapshot: z.literal(true),
  })
  .strict();

export const GetWordPressEditorParametersSchema = z
  .object({
    tabId: z.number().int().nonnegative(),
    maxContentChars: z.number().int().min(1_000).max(500_000).default(100_000),
  })
  .strict();

export const GetWordPressEditorDataSchema = z
  .object({
    page: z
      .object({
        url: z.string().min(1).max(4_096),
        origin: z.string().min(1).max(2_048),
      })
      .strict(),
    documentId: z.string().min(1).max(128),
    domRevision: z.number().int().nonnegative(),
    editorKind: z.enum(["block", "classic"]),
    postId: z.string().min(1).max(128),
    postType: z.string().min(1).max(128),
    title: z.string().max(20_000),
    content: z.string().max(500_000),
    contentTruncated: z.boolean(),
    excerpt: z.string().max(50_000),
    slug: z.string().max(1_000),
    status: z.string().max(128),
    categoryIds: z.array(z.number().int().nonnegative()).max(500),
    tagIds: z.array(z.number().int().nonnegative()).max(500),
    featuredMediaId: z.number().int().nonnegative().nullable(),
    authorId: z.number().int().nonnegative().nullable(),
    parentId: z.number().int().nonnegative().nullable(),
    menuOrder: z.number().int().min(-100_000).max(100_000).nullable(),
    commentStatus: z.enum(["open", "closed", ""]).optional(),
    pingStatus: z.enum(["open", "closed", ""]).optional(),
    permalink: z.string().max(4_096).optional(),
    dirty: z.boolean(),
    saving: z.boolean(),
    lastSaveSucceeded: z.boolean().nullable(),
  })
  .strict();

const WordPressEditorFieldsSchema = z
  .object({
    title: z.string().max(20_000).optional(),
    content: z.string().max(500_000).optional(),
    excerpt: z.string().max(50_000).optional(),
    slug: z.string().max(1_000).optional(),
    status: z.enum(["draft", "pending", "private", "publish", "future"]).optional(),
    categoryIds: z.array(z.number().int().nonnegative()).max(500).optional(),
    tagIds: z.array(z.number().int().nonnegative()).max(500).optional(),
    featuredMediaId: z.number().int().nonnegative().nullable().optional(),
    authorId: z.number().int().positive().optional(),
    parentId: z.number().int().nonnegative().optional(),
    menuOrder: z.number().int().min(-100_000).max(100_000).optional(),
    commentStatus: z.enum(["open", "closed"]).optional(),
    pingStatus: z.enum(["open", "closed"]).optional(),
  })
  .strict();

export const EditWordPressEditorParametersSchema = z
  .object({
    tabId: z.number().int().nonnegative(),
    documentId: z.string().min(1).max(128),
    domRevision: z.number().int().nonnegative(),
    fields: WordPressEditorFieldsSchema,
    save: z.boolean().default(false),
    authorization: ExplicitUserAuthorizationSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (Object.keys(value.fields).length === 0 && !value.save) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "At least one editor field is required unless save is true",
        path: ["fields"],
      });
    }
    if (value.fields.status === "publish" && !value.save) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Publishing requires save=true in the same explicitly authorized action",
        path: ["save"],
      });
    }
  });

export const EditWordPressEditorDataSchema = z
  .object({
    page: z
      .object({
        urlBefore: z.string().min(1).max(4_096),
        urlAfter: z.string().min(1).max(4_096),
        origin: z.string().min(1).max(2_048),
      })
      .strict(),
    documentId: z.string().min(1).max(128),
    domRevisionBefore: z.number().int().nonnegative(),
    domRevisionAfter: z.number().int().nonnegative(),
    editorKind: z.enum(["block", "classic"]),
    postId: z.string().min(1).max(128),
    postType: z.string().min(1).max(128),
    fieldNames: z
      .array(
        z.enum([
          "title",
          "content",
          "excerpt",
          "slug",
          "status",
          "categoryIds",
          "tagIds",
          "featuredMediaId",
          "authorId",
          "parentId",
          "menuOrder",
          "commentStatus",
          "pingStatus",
        ]),
      )
      .max(13),
    status: z.string().max(128),
    changed: z.boolean(),
    saved: z.boolean(),
    publishRequested: z.boolean(),
    verificationRequired: z.boolean(),
    requiresNewSnapshot: z.literal(true),
  })
  .strict()
  .refine((value) => value.saved === value.verificationRequired, {
    message: "saved and verificationRequired must match",
    path: ["verificationRequired"],
  });

export const EvaluateJavaScriptParametersSchema = z
  .object({
    tabId: z.number().int().nonnegative(),
    expression: z.string().min(1).max(20_000),
    mode: z.enum(["read_only", "page_mutation"]).default("read_only"),
    world: z.enum(["ISOLATED", "MAIN"]).default("ISOLATED"),
    authorization: ExplicitUserAuthorizationSchema,
  })
  .strict();

export const EvaluateJavaScriptDataSchema = z
  .object({
    tabId: z.number().int().nonnegative(),
    mode: z.enum(["read_only", "page_mutation"]),
    world: z.enum(["ISOLATED", "MAIN"]),
    value: JsonValueSchema,
    valueType: z.enum(["null", "boolean", "number", "string", "array", "object"]),
    truncated: z.boolean(),
  })
  .strict();

const CssPropertyNameSchema = z
  .string()
  .min(1)
  .max(256)
  .regex(/^(?:--[A-Za-z0-9_-]+|-?[A-Za-z][A-Za-z0-9-]*)$/);

const AttributeNameSchema = z
  .string()
  .min(1)
  .max(256)
  .regex(/^[A-Za-z_][A-Za-z0-9_.:-]*$/);

const DomMutationOperationSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("set_text"), text: z.string().max(50_000) }).strict(),
  z
    .object({
      type: z.literal("set_attribute"),
      name: AttributeNameSchema,
      value: z.string().max(50_000),
    })
    .strict(),
  z.object({ type: z.literal("remove_attribute"), name: AttributeNameSchema }).strict(),
  z
    .object({
      type: z.literal("set_style"),
      property: CssPropertyNameSchema,
      value: z.string().max(4_000),
      priority: z.enum(["", "important"]).default(""),
    })
    .strict(),
  z.object({ type: z.literal("remove_style"), property: CssPropertyNameSchema }).strict(),
  z
    .object({
      type: z.literal("insert_html"),
      position: z.enum(["beforebegin", "afterbegin", "beforeend", "afterend"]),
      html: z.string().max(100_000),
    })
    .strict(),
  z
    .object({
      type: z.literal("replace_children_html"),
      html: z.string().max(100_000),
    })
    .strict(),
  z.object({ type: z.literal("remove_element") }).strict(),
]);

export const MutateDomParametersSchema = z
  .object({
    ...RevisionBoundElementParametersShape,
    operations: z.array(DomMutationOperationSchema).min(1).max(50),
    authorization: ExplicitUserAuthorizationSchema,
  })
  .strict();

export const MutateDomDataSchema = z
  .object({
    page: z
      .object({
        url: z.string().min(1).max(4_096),
        origin: z.string().min(1).max(2_048),
      })
      .strict(),
    documentId: z.string().min(1).max(128),
    domRevisionBefore: z.number().int().nonnegative(),
    domRevisionAfter: z.number().int().nonnegative(),
    elementId: z.string().min(1).max(128),
    resolvedElementId: z.string().min(1).max(128).optional(),
    operationTypes: z
      .array(
        z.enum([
          "set_text",
          "set_attribute",
          "remove_attribute",
          "set_style",
          "remove_style",
          "insert_html",
          "replace_children_html",
          "remove_element",
        ]),
      )
      .min(1)
      .max(50),
    operationsApplied: z.number().int().positive().max(50),
    sanitizedHtml: z.boolean(),
    elementRemoved: z.boolean(),
    changed: z.boolean(),
    requiresNewSnapshot: z.literal(true),
  })
  .strict();

const InspectionPropertySchema = z
  .object({ name: z.string().min(1).max(256), value: z.string().max(4_000) })
  .strict();

const InspectedElementSummarySchema = z
  .object({
    tag: z.string().min(1).max(128),
    id: z.string().max(256),
    classes: z.array(z.string().max(256)).max(100),
    role: z.string().max(128),
    name: z.string().max(1_000),
    selector: z.string().max(1_024),
  })
  .strict();

export const InspectElementParametersSchema = z
  .object({
    ...RevisionBoundElementParametersShape,
    computedStyleProperties: z
      .array(CssPropertyNameSchema)
      .min(1)
      .max(64)
      .default([
        "display",
        "visibility",
        "opacity",
        "position",
        "z-index",
        "overflow",
        "pointer-events",
        "color",
        "background-color",
        "font-family",
        "font-size",
        "font-weight",
        "line-height",
        "width",
        "height",
      ]),
    includeEventListeners: z.boolean().default(true),
    includeDocumentListeners: z.boolean().default(true),
    listenerDepth: z.number().int().min(0).max(5).default(2),
    maxListeners: z.number().int().min(1).max(100).default(40),
    sourceExcerptChars: z.number().int().min(0).max(4_000).default(1_200),
  })
  .strict();

export const InspectElementDataSchema = z
  .object({
    page: z
      .object({
        url: z.string().min(1).max(4_096),
        origin: z.string().min(1).max(2_048),
      })
      .strict(),
    documentId: z.string().min(1).max(128),
    domRevision: z.number().int().nonnegative(),
    elementId: z.string().min(1).max(128),
    element: InspectedElementSummarySchema.extend({
      text: z.string().max(2_000),
      sensitive: z.boolean(),
      visible: z.boolean(),
      enabled: z.boolean(),
      editable: z.boolean(),
      clickable: z.boolean(),
      customElement: z
        .object({
          defined: z.boolean(),
          constructorName: z.string().max(256),
        })
        .strict()
        .optional(),
      box: z
        .object({
          x: z.number().finite(),
          y: z.number().finite(),
          width: z.number().nonnegative().finite(),
          height: z.number().nonnegative().finite(),
        })
        .strict(),
      attributes: z.array(InspectionPropertySchema).max(200),
      inlineStyle: z.array(InspectionPropertySchema).max(200),
      computedStyle: z.array(InspectionPropertySchema).max(64),
    }),
    ancestors: z.array(InspectedElementSummarySchema).max(12),
    eventListeners: z
      .array(
        z
          .object({
            target: z.enum(["element", "subtree", "document", "window"]),
            type: z.string().min(1).max(256),
            useCapture: z.boolean(),
            passive: z.boolean(),
            once: z.boolean(),
            handlerName: z.string().max(256),
            scriptId: z.string().max(256),
            sourceUrl: z.string().max(4_096),
            lineNumber: z.number().int().nonnegative(),
            columnNumber: z.number().int().nonnegative(),
            sourceExcerpt: z.string().max(4_000),
            excerptTruncated: z.boolean(),
          })
          .strict(),
      )
      .max(100),
    listenersTruncated: z.boolean(),
    debuggerUsed: z.boolean(),
  })
  .strict();

const CssInjectionAddSchema = z
  .object({
    operation: z.literal("add"),
    tabId: z.number().int().nonnegative(),
    css: z.string().min(1).max(100_000),
    origin: z.enum(["AUTHOR", "USER"]).default("AUTHOR"),
    allFrames: z.boolean().default(false),
    authorization: ExplicitUserAuthorizationSchema,
  })
  .strict();

const CssInjectionRemoveSchema = z
  .object({
    operation: z.literal("remove"),
    tabId: z.number().int().nonnegative(),
    injectionId: z.string().uuid(),
    authorization: ExplicitUserAuthorizationSchema,
  })
  .strict();

export const ManageCssParametersSchema = z.discriminatedUnion("operation", [
  CssInjectionAddSchema,
  CssInjectionRemoveSchema,
]);

export const ManageCssDataSchema = z
  .object({
    tabId: z.number().int().nonnegative(),
    operation: z.enum(["add", "remove"]),
    injectionId: z.string().uuid(),
    applied: z.boolean(),
    removed: z.boolean(),
    origin: z.enum(["AUTHOR", "USER"]),
    allFrames: z.boolean(),
    cssBytes: z.number().int().nonnegative().max(400_000),
    cleanupOnUnlock: z.literal(true),
    requiresNewSnapshot: z.literal(true),
  })
  .strict();

const EventCaptureScopeSchema = z
  .object({
    documentId: z.string().min(1).max(128),
    domRevision: z.number().int().nonnegative(),
    elementId: z.string().min(1).max(128),
  })
  .strict();

const ObserveEventsStartSchema = z
  .object({
    operation: z.literal("start"),
    tabId: z.number().int().nonnegative(),
    eventTypes: z
      .array(
        z
          .string()
          .min(1)
          .max(128)
          .regex(/^[A-Za-z][A-Za-z0-9:_-]*$/),
      )
      .min(1)
      .max(50)
      .default(["click", "input", "change", "focusin", "focusout", "keydown", "submit"]),
    scope: EventCaptureScopeSchema.optional(),
    maxEvents: z.number().int().min(1).max(500).default(200),
  })
  .strict();

const ObserveEventsReadSchema = z
  .object({
    operation: z.literal("read"),
    tabId: z.number().int().nonnegative(),
    captureId: z.string().uuid(),
    clear: z.boolean().default(false),
  })
  .strict();

const ObserveEventsStopSchema = z
  .object({
    operation: z.literal("stop"),
    tabId: z.number().int().nonnegative(),
    captureId: z.string().uuid(),
  })
  .strict();

export const ObserveEventsParametersSchema = z.discriminatedUnion("operation", [
  ObserveEventsStartSchema,
  ObserveEventsReadSchema,
  ObserveEventsStopSchema,
]);

const CapturedEventSchema = z
  .object({
    sequence: z.number().int().positive(),
    elapsedMs: z.number().nonnegative().finite(),
    type: z.string().min(1).max(128),
    isTrusted: z.boolean(),
    defaultPrevented: z.boolean(),
    phase: z.enum(["capturing", "target", "bubbling", "none"]),
    target: InspectedElementSummarySchema,
    sensitiveTarget: z.boolean(),
    pointer: z
      .object({
        x: z.number().finite(),
        y: z.number().finite(),
        button: z.number().int(),
        pointerType: z.string().max(64),
      })
      .strict()
      .optional(),
    keyboard: z
      .object({
        key: z.string().max(128),
        code: z.string().max(128),
        altKey: z.boolean(),
        ctrlKey: z.boolean(),
        metaKey: z.boolean(),
        shiftKey: z.boolean(),
        repeat: z.boolean(),
      })
      .strict()
      .optional(),
    inputType: z.string().max(128).optional(),
    customDetailType: z.string().max(128).optional(),
  })
  .strict();

export const ObserveEventsDataSchema = z
  .object({
    tabId: z.number().int().nonnegative(),
    operation: z.enum(["start", "read", "stop"]),
    captureId: z.string().uuid(),
    active: z.boolean(),
    startedAt: TimestampSchema,
    eventTypes: z.array(z.string().min(1).max(128)).max(50),
    scoped: z.boolean(),
    events: z.array(CapturedEventSchema).max(500),
    eventCount: z.number().int().nonnegative().max(500),
    droppedEvents: z.number().int().nonnegative(),
    cleared: z.boolean(),
  })
  .strict()
  .refine((value) => value.eventCount === value.events.length, {
    message: "eventCount must match events length",
    path: ["eventCount"],
  });

export const ExecuteJavaScriptParametersSchema = z
  .object({
    tabId: z.number().int().nonnegative(),
    source: z.string().min(1).max(100_000),
    sourceType: z.enum(["expression", "function_body"]).default("expression"),
    awaitPromise: z.boolean().default(true),
    userGesture: z.boolean().default(false),
    timeoutMs: z.number().int().min(100).max(30_000).default(5_000),
    authorization: ExplicitUserAuthorizationSchema,
  })
  .strict();

export const ExecuteJavaScriptDataSchema = z
  .object({
    tabId: z.number().int().nonnegative(),
    sourceType: z.enum(["expression", "function_body"]),
    value: JsonValueSchema,
    valueType: z.string().min(1).max(128),
    description: z.string().max(2_000),
    truncated: z.boolean(),
    awaitPromise: z.boolean(),
    userGesture: z.boolean(),
    debuggerUsed: z.literal(true),
    requiresNewSnapshot: z.literal(true),
  })
  .strict();

export const ConsoleEntrySchema = z
  .object({
    sequence: z.number().int().nonnegative(),
    timestamp: TimestampSchema,
    source: z.enum(["console", "exception", "log"]),
    level: z.enum(["debug", "info", "log", "warning", "error"]),
    text: z.string().max(2_000),
    url: z.string().max(4_096),
    lineNumber: z.number().int().nonnegative(),
    columnNumber: z.number().int().nonnegative(),
  })
  .strict();

export const BrowserConsoleParametersSchema = z.discriminatedUnion("operation", [
  z
    .object({
      operation: z.literal("start"),
      tabId: z.number().int().nonnegative(),
      bufferSize: z.number().int().min(10).max(500).default(200),
    })
    .strict(),
  z
    .object({
      operation: z.literal("read"),
      tabId: z.number().int().nonnegative(),
      limit: z.number().int().min(1).max(500).default(200),
      clear: z.boolean().default(false),
    })
    .strict(),
  z
    .object({
      operation: z.literal("clear"),
      tabId: z.number().int().nonnegative(),
    })
    .strict(),
  z
    .object({
      operation: z.literal("stop"),
      tabId: z.number().int().nonnegative(),
    })
    .strict(),
]);

export const BrowserConsoleDataSchema = z
  .object({
    tabId: z.number().int().nonnegative(),
    operation: z.enum(["start", "read", "clear", "stop"]),
    active: z.boolean(),
    captureId: z.string().uuid().nullable(),
    startedAt: TimestampSchema.nullable(),
    entries: z.array(ConsoleEntrySchema).max(500),
    entryCount: z.number().int().nonnegative().max(500),
    droppedEntries: z.number().int().nonnegative(),
    cleared: z.boolean(),
  })
  .strict()
  .refine((value) => value.entryCount === value.entries.length, {
    message: "entryCount must match entries length",
    path: ["entryCount"],
  });

export const NetworkEntrySchema = z
  .object({
    sequence: z.number().int().nonnegative(),
    timestamp: TimestampSchema,
    phase: z.enum(["request", "response", "finished", "failed"]),
    requestId: z.string().min(1).max(256),
    url: z.string().max(4_096),
    method: z.string().min(1).max(32).optional(),
    resourceType: z.string().min(1).max(128).optional(),
    status: z.number().int().min(100).max(599).optional(),
    mimeType: z.string().max(256).optional(),
    fromDiskCache: z.boolean().optional(),
    fromServiceWorker: z.boolean().optional(),
    encodedDataLength: z.number().nonnegative().finite().optional(),
    errorText: z.string().max(1_000).optional(),
    canceled: z.boolean().optional(),
    blockedReason: z.string().max(128).optional(),
  })
  .strict();

export const NetworkCaptureParametersSchema = z.discriminatedUnion("operation", [
  z
    .object({
      operation: z.literal("start"),
      tabId: z.number().int().nonnegative(),
      bufferSize: z.number().int().min(20).max(1_000).default(300),
    })
    .strict(),
  z
    .object({
      operation: z.literal("read"),
      tabId: z.number().int().nonnegative(),
      limit: z.number().int().min(1).max(1_000).default(300),
      clear: z.boolean().default(false),
    })
    .strict(),
  z
    .object({
      operation: z.literal("clear"),
      tabId: z.number().int().nonnegative(),
    })
    .strict(),
  z
    .object({
      operation: z.literal("stop"),
      tabId: z.number().int().nonnegative(),
    })
    .strict(),
]);

export const NetworkCaptureDataSchema = z
  .object({
    tabId: z.number().int().nonnegative(),
    operation: z.enum(["start", "read", "clear", "stop"]),
    active: z.boolean(),
    captureId: z.string().uuid().nullable(),
    startedAt: TimestampSchema.nullable(),
    entries: z.array(NetworkEntrySchema).max(1_000),
    entryCount: z.number().int().nonnegative().max(1_000),
    droppedEntries: z.number().int().nonnegative(),
    cleared: z.boolean(),
    bodiesCaptured: z.literal(false),
    headersCaptured: z.literal(false),
    queryStringsRedacted: z.literal(true),
  })
  .strict()
  .refine((value) => value.entryCount === value.entries.length, {
    message: "entryCount must match entries length",
    path: ["entryCount"],
  });

export const DeviceEmulationPresetSchema = z.enum([
  "mobile_small",
  "mobile_medium",
  "mobile_large",
  "tablet",
  "custom",
]);

export const DeviceEmulationOrientationSchema = z.enum(["portrait", "landscape"]);

const SetDeviceEmulationParametersSchema = z
  .object({
    operation: z.literal("set"),
    tabId: z.number().int().nonnegative(),
    preset: DeviceEmulationPresetSchema.default("mobile_medium"),
    orientation: DeviceEmulationOrientationSchema.default("portrait"),
    width: z.number().int().min(240).max(2_560).optional(),
    height: z.number().int().min(240).max(2_560).optional(),
    deviceScaleFactor: z.number().min(1).max(4).finite().optional(),
    touch: z.boolean().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.preset === "custom" &&
      (value.width === undefined ||
        value.height === undefined ||
        value.deviceScaleFactor === undefined)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "custom device emulation requires width, height, and deviceScaleFactor",
      });
    }
    if (
      value.preset !== "custom" &&
      (value.width !== undefined ||
        value.height !== undefined ||
        value.deviceScaleFactor !== undefined)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "width, height, and deviceScaleFactor are only valid with preset custom",
      });
    }
  });

export const DeviceEmulationParametersSchema = z.union([
  SetDeviceEmulationParametersSchema,
  z
    .object({
      operation: z.literal("get"),
      tabId: z.number().int().nonnegative(),
    })
    .strict(),
  z
    .object({
      operation: z.literal("reset"),
      tabId: z.number().int().nonnegative(),
    })
    .strict(),
]);

export const DeviceEmulationProfileSchema = z
  .object({
    preset: DeviceEmulationPresetSchema,
    orientation: DeviceEmulationOrientationSchema,
    width: z.number().int().min(240).max(2_560),
    height: z.number().int().min(240).max(2_560),
    deviceScaleFactor: z.number().min(1).max(4).finite(),
    mobile: z.literal(true),
    touch: z.boolean(),
  })
  .strict();

export const DeviceEmulationDataSchema = z
  .object({
    tabId: z.number().int().nonnegative(),
    operation: z.enum(["set", "get", "reset"]),
    active: z.boolean(),
    profile: DeviceEmulationProfileSchema.nullable(),
    debuggerAttached: z.boolean(),
    requiresNewSnapshot: z.boolean(),
  })
  .strict();

export const ScreenshotModeSchema = z.enum(["viewport", "element", "region", "full_page"]);
export const ScreenshotCoordinateSpaceSchema = z.enum(["viewport", "document"]);
export const ScreenshotShapeSchema = z.enum([
  "rectangle",
  "rounded_rectangle",
  "ellipse",
  "circle",
  "highlight",
]);
export const ScreenshotLabelPositionSchema = z.enum(["auto", "top", "bottom", "left", "right"]);
const ScreenshotColorSchema = z.string().regex(/^#[0-9a-f]{6}$/iu);

export const ScreenshotRegionSchema = z
  .object({
    x: z.number().nonnegative().finite().max(100_000),
    y: z.number().nonnegative().finite().max(100_000),
    width: z.number().positive().finite().max(100_000),
    height: z.number().positive().finite().max(100_000),
    coordinateSpace: ScreenshotCoordinateSpaceSchema.default("viewport"),
  })
  .strict();

export const ScreenshotAnnotationTargetSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("element"),
      elementId: z.string().min(1).max(128),
      padding: z.number().nonnegative().finite().max(200).default(8),
    })
    .strict(),
  z
    .object({
      type: z.literal("region"),
      region: ScreenshotRegionSchema,
    })
    .strict(),
]);

export const ScreenshotAnnotationSchema = z
  .object({
    target: ScreenshotAnnotationTargetSchema,
    shape: ScreenshotShapeSchema.default("rounded_rectangle"),
    stroke: ScreenshotColorSchema.default("#ef4444"),
    strokeWidth: z.number().int().min(1).max(16).default(4),
    fill: ScreenshotColorSchema.optional(),
    fillOpacity: z.number().min(0).max(1).finite().default(0.12),
    label: z
      .object({
        text: z.string().min(1).max(200),
        position: ScreenshotLabelPositionSchema.default("auto"),
        color: ScreenshotColorSchema.default("#ffffff"),
        background: ScreenshotColorSchema.default("#ef4444"),
        fontSize: z.number().int().min(10).max(48).default(18),
        arrow: z.boolean().default(true),
      })
      .strict()
      .optional(),
  })
  .strict();

export const CaptureScreenshotParametersSchema = z
  .object({
    tabId: z.number().int().nonnegative(),
    quality: z.number().int().min(30).max(90).default(70),
    maxWidth: z.number().int().min(320).max(2_560).default(1_920),
    maxHeight: z.number().int().min(240).max(2_560).default(1_080),
    mode: ScreenshotModeSchema.default("viewport"),
    documentId: z.string().min(1).max(128).optional(),
    domRevision: z.number().int().nonnegative().optional(),
    elementId: z.string().min(1).max(128).optional(),
    padding: z.number().nonnegative().finite().max(200).default(0),
    region: ScreenshotRegionSchema.optional(),
    annotations: z.array(ScreenshotAnnotationSchema).max(20).default([]),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.mode === "element" && value.elementId === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["elementId"],
        message: "element mode requires elementId",
      });
    }
    if (value.mode === "region" && value.region === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["region"],
        message: "region mode requires region",
      });
    }
    const needsRevision =
      value.mode === "element" ||
      value.annotations.some((annotation) => annotation.target.type === "element");
    if (needsRevision && value.documentId === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["documentId"],
        message: "element screenshots and annotations require documentId",
      });
    }
    if (needsRevision && value.domRevision === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["domRevision"],
        message: "element screenshots and annotations require domRevision",
      });
    }
  });

export const CaptureScreenshotDataSchema = z
  .object({
    screenshotId: z.string().uuid(),
    tabId: z.number().int().nonnegative(),
    documentId: z.string().min(1).max(128),
    domRevision: z.number().int().nonnegative(),
    capturedAt: TimestampSchema,
    mediaType: z.literal("image/jpeg"),
    width: z.number().int().positive().max(2_560),
    height: z.number().int().positive().max(2_560),
    viewport: z
      .object({
        cssWidth: z.number().positive().finite(),
        cssHeight: z.number().positive().finite(),
        deviceScaleFactor: z.number().positive().finite(),
      })
      .strict(),
    capture: z
      .object({
        mode: ScreenshotModeSchema,
        sourceCssRect: z
          .object({
            x: z.number().nonnegative().finite(),
            y: z.number().nonnegative().finite(),
            width: z.number().positive().finite(),
            height: z.number().positive().finite(),
          })
          .strict(),
        fullPage: z.boolean(),
        annotationsApplied: z.number().int().nonnegative().max(20),
      })
      .strict(),
    byteLength: z.number().int().positive().max(500_000),
    dataUrl: z.string().min(32).max(750_000).startsWith("data:image/jpeg;base64,"),
  })
  .strict();

const GestureReferenceSchema = z.object({
  tabId: z.number().int().nonnegative(),
  documentId: z.string().min(1).max(128),
  domRevision: z.number().int().nonnegative(),
});

export const GestureKeySchema = z
  .string()
  .min(1)
  .max(64)
  .refine((value) => !containsAsciiControlCharacter(value), {
    message: "Gesture keys cannot contain control characters",
  });

export const PerformGestureParametersSchema = z.union([
  GestureReferenceSchema.extend({
    operation: z.enum([
      "hover",
      "focus",
      "blur",
      "scroll_into_view",
      "double_click",
      "context_click",
    ]),
    elementId: z.string().min(1).max(128),
  }).strict(),
  GestureReferenceSchema.extend({
    operation: z.literal("press_key"),
    elementId: z.string().min(1).max(128),
    key: GestureKeySchema,
    code: z
      .string()
      .min(1)
      .max(64)
      .regex(/^[A-Za-z0-9]+$/)
      .optional(),
    ctrl: z.boolean().default(false),
    alt: z.boolean().default(false),
    meta: z.boolean().default(false),
    shift: z.boolean().default(false),
  }).strict(),
  GestureReferenceSchema.extend({
    operation: z.literal("drag_and_drop"),
    elementId: z.string().min(1).max(128),
    targetElementId: z.string().min(1).max(128),
    steps: z.number().int().min(2).max(50).default(10),
  }).strict(),
  GestureReferenceSchema.extend({
    operation: z.literal("scroll_by"),
    deltaX: z.number().finite().min(-100_000).max(100_000).default(0),
    deltaY: z.number().finite().min(-100_000).max(100_000).default(0),
  })
    .strict()
    .refine((value) => value.deltaX !== 0 || value.deltaY !== 0, {
      message: "scroll_by requires a non-zero deltaX or deltaY",
    }),
  GestureReferenceSchema.extend({
    operation: z.literal("scroll_to"),
    x: z.number().finite().min(0).max(10_000_000).default(0),
    y: z.number().finite().min(0).max(10_000_000).default(0),
  }).strict(),
]);

export const PerformGestureDataSchema = z
  .object({
    page: z
      .object({
        url: z.string().min(1).max(4_096),
        origin: z.string().min(1).max(2_048),
      })
      .strict(),
    documentId: z.string().min(1).max(128),
    domRevisionBefore: z.number().int().nonnegative(),
    domRevisionAfter: z.number().int().nonnegative(),
    operation: z.enum([
      "hover",
      "focus",
      "blur",
      "press_key",
      "scroll_into_view",
      "scroll_by",
      "scroll_to",
      "double_click",
      "context_click",
      "drag_and_drop",
    ]),
    elementId: z.string().min(1).max(128).optional(),
    resolvedElementId: z.string().min(1).max(128).optional(),
    targetElementId: z.string().min(1).max(128).optional(),
    resolvedTargetElementId: z.string().min(1).max(128).optional(),
    key: GestureKeySchema.optional(),
    code: z.string().min(1).max(64).optional(),
    modifiers: z
      .object({
        ctrl: z.boolean(),
        alt: z.boolean(),
        meta: z.boolean(),
        shift: z.boolean(),
      })
      .strict()
      .optional(),
    scroll: z
      .object({
        x: z.number().finite(),
        y: z.number().finite(),
      })
      .strict()
      .optional(),
    performed: z.literal(true),
    domChanged: z.boolean(),
    requiresNewSnapshot: z.literal(true),
  })
  .strict();

export const TerminalDescriptorSchema = z
  .object({
    terminalId: z.string().min(1).max(128),
    engine: z.enum(["xterm", "dom"]),
    renderer: z.enum(["canvas", "dom", "unknown"]),
    documentId: z.string().min(1).max(128),
    domRevision: z.number().int().nonnegative(),
    index: z.number().int().nonnegative().max(31),
    focused: z.boolean(),
    inputAvailable: z.boolean(),
    trustedInputAvailable: z.boolean(),
    bufferReadbackAvailable: z.boolean(),
    screenshotRegion: z
      .object({
        x: z.number().nonnegative().finite().max(100_000),
        y: z.number().nonnegative().finite().max(100_000),
        width: z.number().positive().finite().max(100_000),
        height: z.number().positive().finite().max(100_000),
        coordinateSpace: z.literal("document"),
      })
      .strict()
      .nullable(),
    columns: z.number().int().positive().max(1_000).nullable(),
    rows: z.number().int().positive().max(1_000).nullable(),
  })
  .strict();

export const GetTerminalsParametersSchema = z
  .object({
    tabId: z.number().int().nonnegative(),
  })
  .strict();

export const GetTerminalsDataSchema = z
  .object({
    tabId: z.number().int().nonnegative(),
    origin: z.string().min(1).max(2_048),
    documentId: z.string().min(1).max(128),
    domRevision: z.number().int().nonnegative(),
    terminals: z.array(TerminalDescriptorSchema).max(32),
    count: z.number().int().nonnegative().max(32),
  })
  .strict()
  .refine((value) => value.count === value.terminals.length, {
    message: "count must match terminals length",
    path: ["count"],
  });

export const TerminalWaitConditionSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("text"),
      value: z.string().min(1).max(2_000),
      match: z.enum(["contains", "exact"]).default("contains"),
      caseSensitive: z.boolean().default(false),
    })
    .strict(),
  z.object({ type: z.literal("prompt") }).strict(),
  z
    .object({
      type: z.literal("quiet"),
      stableMs: z.number().int().min(100).max(10_000).default(500),
    })
    .strict(),
]);

const TerminalReferenceShape = {
  tabId: z.number().int().nonnegative(),
  documentId: z.string().min(1).max(128),
  domRevision: z.number().int().nonnegative(),
  terminalId: z.string().min(1).max(128),
};

export const ReadTerminalParametersSchema = z
  .object({
    ...TerminalReferenceShape,
    maxLines: z.number().int().min(1).max(200).default(80),
    includeScrollback: z.boolean().default(false),
    waitFor: TerminalWaitConditionSchema.optional(),
    timeoutMs: z.number().int().min(100).max(120_000).default(10_000),
    pollIntervalMs: z.number().int().min(50).max(2_000).default(200),
    authorization: ExplicitUserAuthorizationSchema,
  })
  .strict();

export const TerminalReadDataSchema = z
  .object({
    tabId: z.number().int().nonnegative(),
    origin: z.string().min(1).max(2_048),
    documentId: z.string().min(1).max(128),
    domRevision: z.number().int().nonnegative(),
    terminalId: z.string().min(1).max(128),
    source: z.enum([
      "xterm_buffer",
      "websocket_stream",
      "accessibility_dom",
      "dom_fallback",
      "unavailable",
    ]),
    buffer: z.enum(["normal", "alternate", "unknown"]),
    columns: z.number().int().positive().max(1_000).nullable(),
    rows: z.number().int().positive().max(1_000).nullable(),
    cursor: z
      .object({
        x: z.number().int().nonnegative().max(1_000),
        y: z.number().int().nonnegative().max(1_000),
      })
      .strict()
      .nullable(),
    lines: z.array(z.string().max(4_000)).max(200),
    text: z.string().max(100_000),
    lineCount: z.number().int().nonnegative().max(200),
    truncated: z.boolean(),
    redactionsApplied: z.number().int().nonnegative(),
    matched: z.boolean(),
    timedOut: z.boolean(),
  })
  .strict()
  .refine((value) => value.lineCount === value.lines.length, {
    message: "lineCount must match lines length",
    path: ["lineCount"],
  });

const TerminalTextInputSchema = z
  .object({
    type: z.literal("text"),
    text: z
      .string()
      .min(1)
      .max(10_000)
      .refine((value) => !containsAsciiControlCharacter(value), {
        message:
          "Terminal text cannot contain control characters; submit and special keys separately",
      }),
    submit: z.boolean().default(false),
  })
  .strict();

const TerminalKeyInputSchema = z
  .object({
    type: z.literal("key"),
    key: z.enum([
      "Enter",
      "Tab",
      "Escape",
      "Backspace",
      "Delete",
      "ArrowUp",
      "ArrowDown",
      "ArrowLeft",
      "ArrowRight",
      "Home",
      "End",
      "PageUp",
      "PageDown",
      "Insert",
      "F1",
      "F2",
      "F3",
      "F4",
      "F5",
      "F6",
      "F7",
      "F8",
      "F9",
      "F10",
      "F11",
      "F12",
      "a",
      "c",
      "d",
      "l",
      "r",
      "u",
      "w",
      "z",
    ]),
    ctrl: z.boolean().default(false),
    alt: z.boolean().default(false),
    meta: z.boolean().default(false),
    shift: z.boolean().default(false),
  })
  .strict();

export const TerminalInputParametersSchema = z
  .object({
    ...TerminalReferenceShape,
    input: z.discriminatedUnion("type", [TerminalTextInputSchema, TerminalKeyInputSchema]),
    waitFor: TerminalWaitConditionSchema.optional(),
    timeoutMs: z.number().int().min(100).max(120_000).default(15_000),
    pollIntervalMs: z.number().int().min(50).max(2_000).default(200),
    maxOutputLines: z.number().int().min(1).max(200).default(80),
    authorization: ExplicitUserAuthorizationSchema,
  })
  .strict();

export const TerminalInputDataSchema = z
  .object({
    tabId: z.number().int().nonnegative(),
    documentId: z.string().min(1).max(128),
    domRevision: z.number().int().nonnegative(),
    terminalId: z.string().min(1).max(128),
    inputType: z.enum(["text", "key"]),
    characters: z.number().int().nonnegative().max(10_000),
    submitted: z.boolean(),
    key: z.string().min(1).max(32).nullable(),
    trustedInput: z.literal(true),
    tabActivated: z.literal(false),
    draftVerification: z.enum([
      "not_applicable",
      "buffer_observed",
      "transport_observed",
      "unavailable",
    ]),
    deliveryVerification: z.enum([
      "observed",
      "transport_observed",
      "not_requested",
      "unavailable",
      "timed_out",
    ]),
    output: TerminalReadDataSchema,
  })
  .strict();

export const PrintToPdfParametersSchema = z
  .object({
    tabId: z.number().int().nonnegative(),
    landscape: z.boolean().default(false),
    printBackground: z.boolean().default(true),
    scale: z.number().min(0.5).max(2).finite().default(1),
    paperSize: z.enum(["a4", "letter", "legal"]).default("a4"),
    marginTop: z.number().min(0).max(2).finite().default(0.4),
    marginBottom: z.number().min(0).max(2).finite().default(0.4),
    marginLeft: z.number().min(0).max(2).finite().default(0.4),
    marginRight: z.number().min(0).max(2).finite().default(0.4),
    pageRanges: z
      .string()
      .max(256)
      .regex(/^[0-9,\-\s]*$/u)
      .default(""),
    preferCssPageSize: z.boolean().default(false),
  })
  .strict();

export const PrintToPdfDataSchema = z
  .object({
    pdfId: z.string().uuid(),
    tabId: z.number().int().nonnegative(),
    capturedAt: TimestampSchema,
    mediaType: z.literal("application/pdf"),
    byteLength: z.number().int().positive().max(10_000_000),
    dataUrl: z.string().min(32).max(14_000_000).startsWith("data:application/pdf;base64,"),
    landscape: z.boolean(),
    printBackground: z.boolean(),
    paperSize: z.enum(["a4", "letter", "legal"]),
    pageRanges: z.string().max(256),
  })
  .strict();

export const ClickAtParametersSchema = z
  .object({
    tabId: z.number().int().nonnegative(),
    documentId: z.string().min(1).max(128),
    domRevision: z.number().int().nonnegative(),
    x: z.number().nonnegative().finite().max(100_000),
    y: z.number().nonnegative().finite().max(100_000),
  })
  .strict();

export const ClickAtDataSchema = z
  .object({
    page: z
      .object({
        urlBefore: z.string().min(1).max(4_096),
        urlAfter: z.string().min(1).max(4_096),
        origin: z.string().min(1).max(2_048),
      })
      .strict(),
    documentId: z.string().min(1).max(128),
    domRevisionBefore: z.number().int().nonnegative(),
    domRevisionAfter: z.number().int().nonnegative(),
    coordinates: z.object({ x: z.number().finite(), y: z.number().finite() }).strict(),
    target: z
      .object({
        role: z.string().min(1).max(128),
        name: z.string().max(1_000),
        sensitive: z.boolean(),
      })
      .strict(),
    clicked: z.literal(true),
    domChanged: z.boolean(),
    urlChanged: z.boolean(),
    requiresNewSnapshot: z.literal(true),
  })
  .strict();

export const HeartbeatEventDataSchema = z
  .object({
    component: z.enum(["extension", "native-host", "desktop"]),
    status: z.literal("alive"),
  })
  .strict();

export type SystemPingParameters = z.infer<typeof SystemPingParametersSchema>;
export type SystemPongData = z.infer<typeof SystemPongDataSchema>;
export type BrowserCapability = z.infer<typeof BrowserCapabilitySchema>;
export type SystemCapabilitiesData = z.infer<typeof SystemCapabilitiesDataSchema>;
export type SystemCapabilitiesParameters = z.infer<typeof SystemCapabilitiesParametersSchema>;
export type BrowserTab = z.infer<typeof BrowserTabSchema>;
export type ListTabsData = z.infer<typeof ListTabsDataSchema>;
export type ListTabsParameters = z.infer<typeof ListTabsParametersSchema>;
export type OpenTabData = z.infer<typeof OpenTabDataSchema>;
export type OpenTabInput = z.input<typeof OpenTabParametersSchema>;
export type OpenTabParameters = z.infer<typeof OpenTabParametersSchema>;
export type NavigateData = z.infer<typeof NavigateDataSchema>;
export type NavigateInput = z.input<typeof NavigateParametersSchema>;
export type NavigateParameters = z.infer<typeof NavigateParametersSchema>;
export type HistoryNavigationData = z.infer<typeof HistoryNavigationDataSchema>;
export type HistoryNavigationInput = z.input<typeof HistoryNavigationParametersSchema>;
export type HistoryNavigationParameters = z.infer<typeof HistoryNavigationParametersSchema>;
export type ActivateTabData = z.infer<typeof ActivateTabDataSchema>;
export type ActivateTabParameters = z.infer<typeof ActivateTabParametersSchema>;
export type CloseTabData = z.infer<typeof CloseTabDataSchema>;
export type CloseTabInput = z.input<typeof CloseTabParametersSchema>;
export type CloseTabParameters = z.infer<typeof CloseTabParametersSchema>;
export type WaitForData = z.infer<typeof WaitForDataSchema>;
export type WaitForInput = z.input<typeof WaitForParametersSchema>;
export type WaitForParameters = z.infer<typeof WaitForParametersSchema>;
export type SetControlIdentityData = z.infer<typeof SetControlIdentityDataSchema>;
export type SetControlIdentityParameters = z.infer<typeof SetControlIdentityParametersSchema>;
export type UnlockTabData = z.infer<typeof UnlockTabDataSchema>;
export type UnlockTabParameters = z.infer<typeof UnlockTabParametersSchema>;
export type AgentAlert = z.infer<typeof AgentAlertSchema>;
export type ClickElementData = z.infer<typeof ClickElementDataSchema>;
export type ClickElementInput = z.input<typeof ClickElementParametersSchema>;
export type ClickElementParameters = z.infer<typeof ClickElementParametersSchema>;
export type AgentDialog = z.infer<typeof AgentDialogSchema>;
export type AgentElement = z.infer<typeof AgentElementSchema>;
export type OutlineElement = z.infer<typeof OutlineElementSchema>;
export type AgentForm = z.infer<typeof AgentFormSchema>;
export type FrameSnapshot = z.infer<typeof FrameSnapshotSchema>;
export type FindElementCriterion = z.infer<typeof FindElementCriterionSchema>;
export type FindElementMatch = z.infer<typeof FindElementMatchSchema>;
export type FindElementsData = z.infer<typeof FindElementsDataSchema>;
export type FindElementsInput = z.input<typeof FindElementsParametersSchema>;
export type FindElementsParameters = z.infer<typeof FindElementsParametersSchema>;
export type FindNaturalLanguageData = z.infer<typeof FindNaturalLanguageDataSchema>;
export type FindNaturalLanguageInput = z.input<typeof FindNaturalLanguageParametersSchema>;
export type FindNaturalLanguageParameters = z.infer<typeof FindNaturalLanguageParametersSchema>;
export type GetPageSnapshotParameters = z.infer<typeof GetPageSnapshotParametersSchema>;
export type GetPageSnapshotInput = z.input<typeof GetPageSnapshotParametersSchema>;
export type PageSnapshot = z.infer<typeof PageSnapshotSchema>;
export type GetPageTextData = z.infer<typeof GetPageTextDataSchema>;
export type GetPageTextInput = z.input<typeof GetPageTextParametersSchema>;
export type GetPageTextParameters = z.infer<typeof GetPageTextParametersSchema>;
export type SnapshotDetail = z.infer<typeof SnapshotDetailSchema>;
export type TruncationReason = z.infer<typeof TruncationReasonSchema>;
export type TextBlock = z.infer<typeof TextBlockSchema>;
export type TypeTextData = z.infer<typeof TypeTextDataSchema>;
export type TypeTextInput = z.input<typeof TypeTextParametersSchema>;
export type TypeTextParameters = z.infer<typeof TypeTextParametersSchema>;
export type SetFileInputFilesData = z.infer<typeof SetFileInputFilesDataSchema>;
export type SetFileInputFilesInput = z.input<typeof SetFileInputFilesParametersSchema>;
export type SetFileInputFilesParameters = z.infer<typeof SetFileInputFilesParametersSchema>;
export type ExplicitUserAuthorization = z.infer<typeof ExplicitUserAuthorizationSchema>;
export type PageApiRequestData = z.infer<typeof PageApiRequestDataSchema>;
export type PageApiRequestInput = z.input<typeof PageApiRequestParametersSchema>;
export type PageApiRequestParameters = z.infer<typeof PageApiRequestParametersSchema>;
export type HttpAuthStateData = z.infer<typeof HttpAuthStateDataSchema>;
export type HttpAuthStateParameters = z.infer<typeof HttpAuthStateParametersSchema>;
export type AuthenticateHttpData = z.infer<typeof AuthenticateHttpDataSchema>;
export type AuthenticateHttpInput = z.input<typeof AuthenticateHttpParametersSchema>;
export type AuthenticateHttpParameters = z.infer<typeof AuthenticateHttpParametersSchema>;
export type HandleJavaScriptDialogData = z.infer<typeof HandleJavaScriptDialogDataSchema>;
export type HandleJavaScriptDialogInput = z.input<typeof HandleJavaScriptDialogParametersSchema>;
export type HandleJavaScriptDialogParameters = z.infer<
  typeof HandleJavaScriptDialogParametersSchema
>;
export type SelectOptionData = z.infer<typeof SelectOptionDataSchema>;
export type SelectOptionInput = z.input<typeof SelectOptionParametersSchema>;
export type SelectOptionParameters = z.infer<typeof SelectOptionParametersSchema>;
export type SetCheckedData = z.infer<typeof SetCheckedDataSchema>;
export type SetCheckedParameters = z.infer<typeof SetCheckedParametersSchema>;
export type SubmitFormData = z.infer<typeof SubmitFormDataSchema>;
export type SubmitFormParameters = z.infer<typeof SubmitFormParametersSchema>;
export type GetWordPressMenuData = z.infer<typeof GetWordPressMenuDataSchema>;
export type GetWordPressMenuInput = z.input<typeof GetWordPressMenuParametersSchema>;
export type GetWordPressMenuParameters = z.infer<typeof GetWordPressMenuParametersSchema>;
export type EditWordPressMenuData = z.infer<typeof EditWordPressMenuDataSchema>;
export type EditWordPressMenuInput = z.input<typeof EditWordPressMenuParametersSchema>;
export type EditWordPressMenuParameters = z.infer<typeof EditWordPressMenuParametersSchema>;
export type GetWordPressAdminData = z.infer<typeof GetWordPressAdminDataSchema>;
export type GetWordPressAdminInput = z.input<typeof GetWordPressAdminParametersSchema>;
export type GetWordPressAdminParameters = z.infer<typeof GetWordPressAdminParametersSchema>;
export type WordPressListTableActionData = z.infer<typeof WordPressListTableActionDataSchema>;
export type WordPressListTableActionInput = z.input<
  typeof WordPressListTableActionParametersSchema
>;
export type WordPressListTableActionParameters = z.infer<
  typeof WordPressListTableActionParametersSchema
>;
export type GetWordPressEditorData = z.infer<typeof GetWordPressEditorDataSchema>;
export type GetWordPressEditorInput = z.input<typeof GetWordPressEditorParametersSchema>;
export type GetWordPressEditorParameters = z.infer<typeof GetWordPressEditorParametersSchema>;
export type EditWordPressEditorData = z.infer<typeof EditWordPressEditorDataSchema>;
export type EditWordPressEditorInput = z.input<typeof EditWordPressEditorParametersSchema>;
export type EditWordPressEditorParameters = z.infer<typeof EditWordPressEditorParametersSchema>;
export type EvaluateJavaScriptData = z.infer<typeof EvaluateJavaScriptDataSchema>;
export type EvaluateJavaScriptInput = z.input<typeof EvaluateJavaScriptParametersSchema>;
export type EvaluateJavaScriptParameters = z.infer<typeof EvaluateJavaScriptParametersSchema>;
export type MutateDomData = z.infer<typeof MutateDomDataSchema>;
export type MutateDomInput = z.input<typeof MutateDomParametersSchema>;
export type MutateDomParameters = z.infer<typeof MutateDomParametersSchema>;
export type InspectElementData = z.infer<typeof InspectElementDataSchema>;
export type InspectElementInput = z.input<typeof InspectElementParametersSchema>;
export type InspectElementParameters = z.infer<typeof InspectElementParametersSchema>;
export type ManageCssData = z.infer<typeof ManageCssDataSchema>;
export type ManageCssInput = z.input<typeof ManageCssParametersSchema>;
export type ManageCssParameters = z.infer<typeof ManageCssParametersSchema>;
export type ObserveEventsData = z.infer<typeof ObserveEventsDataSchema>;
export type ObserveEventsInput = z.input<typeof ObserveEventsParametersSchema>;
export type ObserveEventsParameters = z.infer<typeof ObserveEventsParametersSchema>;
export type ExecuteJavaScriptData = z.infer<typeof ExecuteJavaScriptDataSchema>;
export type ExecuteJavaScriptInput = z.input<typeof ExecuteJavaScriptParametersSchema>;
export type ExecuteJavaScriptParameters = z.infer<typeof ExecuteJavaScriptParametersSchema>;
export type ConsoleEntry = z.infer<typeof ConsoleEntrySchema>;
export type BrowserConsoleInput = z.input<typeof BrowserConsoleParametersSchema>;
export type BrowserConsoleParameters = z.infer<typeof BrowserConsoleParametersSchema>;
export type BrowserConsoleData = z.infer<typeof BrowserConsoleDataSchema>;
export type NetworkEntry = z.infer<typeof NetworkEntrySchema>;
export type NetworkCaptureInput = z.input<typeof NetworkCaptureParametersSchema>;
export type NetworkCaptureParameters = z.infer<typeof NetworkCaptureParametersSchema>;
export type NetworkCaptureData = z.infer<typeof NetworkCaptureDataSchema>;
export type DeviceEmulationPreset = z.infer<typeof DeviceEmulationPresetSchema>;
export type DeviceEmulationOrientation = z.infer<typeof DeviceEmulationOrientationSchema>;
export type DeviceEmulationProfile = z.infer<typeof DeviceEmulationProfileSchema>;
export type DeviceEmulationInput = z.input<typeof DeviceEmulationParametersSchema>;
export type DeviceEmulationParameters = z.infer<typeof DeviceEmulationParametersSchema>;
export type DeviceEmulationData = z.infer<typeof DeviceEmulationDataSchema>;
export type ScreenshotMode = z.infer<typeof ScreenshotModeSchema>;
export type ScreenshotRegion = z.infer<typeof ScreenshotRegionSchema>;
export type ScreenshotAnnotation = z.infer<typeof ScreenshotAnnotationSchema>;
export type CaptureScreenshotData = z.infer<typeof CaptureScreenshotDataSchema>;
export type CaptureScreenshotInput = z.input<typeof CaptureScreenshotParametersSchema>;
export type CaptureScreenshotParameters = z.infer<typeof CaptureScreenshotParametersSchema>;
export type PerformGestureInput = z.input<typeof PerformGestureParametersSchema>;
export type PerformGestureParameters = z.infer<typeof PerformGestureParametersSchema>;
export type PerformGestureData = z.infer<typeof PerformGestureDataSchema>;
export type TerminalDescriptor = z.infer<typeof TerminalDescriptorSchema>;
export type GetTerminalsInput = z.input<typeof GetTerminalsParametersSchema>;
export type GetTerminalsParameters = z.infer<typeof GetTerminalsParametersSchema>;
export type GetTerminalsData = z.infer<typeof GetTerminalsDataSchema>;
export type TerminalWaitCondition = z.infer<typeof TerminalWaitConditionSchema>;
export type ReadTerminalInput = z.input<typeof ReadTerminalParametersSchema>;
export type ReadTerminalParameters = z.infer<typeof ReadTerminalParametersSchema>;
export type TerminalReadData = z.infer<typeof TerminalReadDataSchema>;
export type TerminalInputInput = z.input<typeof TerminalInputParametersSchema>;
export type TerminalInputParameters = z.infer<typeof TerminalInputParametersSchema>;
export type TerminalInputData = z.infer<typeof TerminalInputDataSchema>;
export type PrintToPdfInput = z.input<typeof PrintToPdfParametersSchema>;
export type PrintToPdfParameters = z.infer<typeof PrintToPdfParametersSchema>;
export type PrintToPdfData = z.infer<typeof PrintToPdfDataSchema>;
export type ClickAtData = z.infer<typeof ClickAtDataSchema>;
export type ClickAtParameters = z.infer<typeof ClickAtParametersSchema>;

export function parseIbpEnvelope(value: unknown): IbpEnvelope {
  const envelope = ProtocolEnvelopeSchema.parse(value);

  if (envelope.direction === "request" && envelope.type === "ibp.request") {
    return {
      ...envelope,
      direction: "request",
      type: "ibp.request",
      payload: ProtocolRequestSchema.parse(envelope.payload),
    };
  }

  if (
    envelope.direction === "response" &&
    envelope.type === "ibp.response" &&
    envelope.correlationId !== undefined
  ) {
    return {
      ...envelope,
      direction: "response",
      type: "ibp.response",
      correlationId: envelope.correlationId,
      payload: ProtocolResponseSchema.parse(envelope.payload),
    };
  }

  if (envelope.direction === "event" && envelope.type === "ibp.event") {
    return {
      ...envelope,
      direction: "event",
      type: "ibp.event",
      payload: ProtocolEventSchema.parse(envelope.payload),
    };
  }

  throw new z.ZodError([
    {
      code: z.ZodIssueCode.custom,
      message: "Envelope direction, type, and correlationId are inconsistent",
      path: ["direction"],
    },
  ]);
}

// --- Figma design files -----------------------------------------------------
//
// Figma paints the design surface into a single WebGL canvas but keeps its
// chrome - pages list, layer tree, properties - in ordinary DOM. These typed
// actions read that chrome. Anchors are layered on purpose: `data-testid` where
// Figma ships one, then role plus accessible name. Hashed CSS module classes are
// never used because they change on every deploy.

export const FigmaModeSchema = z.enum(["design", "dev", "prototype", "unknown"]);

export const FigmaAnchorStrategySchema = z.enum([
  "test_id",
  "role",
  "accessible_name",
  "structure",
]);

export const FigmaAnchorHealthSchema = z
  .object({
    ok: z.boolean(),
    resolved: z.array(z.string().min(1).max(64)).max(32),
    missing: z.array(z.string().min(1).max(64)).max(32),
  })
  .strict();

export const FigmaSelectionSchema = z
  .object({
    name: z.string().max(512),
    type: z.string().max(128),
  })
  .strict();

export const GetFigmaDocumentParametersSchema = z
  .object({ tabId: z.number().int().nonnegative() })
  .strict();

export const GetFigmaDocumentDataSchema = z
  .object({
    file: z.object({ name: z.string().max(512) }).strict(),
    mode: FigmaModeSchema,
    pages: z.array(z.object({ name: z.string().max(512), current: z.boolean() }).strict()).max(500),
    selection: FigmaSelectionSchema.nullable(),
    anchors: FigmaAnchorHealthSchema,
  })
  .strict();

export const GetFigmaLayersParametersSchema = z
  .object({
    tabId: z.number().int().nonnegative(),
    maxRows: z.number().int().min(1).max(1_000).default(300),
  })
  .strict();

export const FigmaLayerSchema = z
  .object({
    layerId: z.string().min(1).max(128),
    name: z.string().max(512),
    depth: z.number().int().nonnegative().max(64),
    hasChildren: z.boolean(),
    expanded: z.boolean(),
    selected: z.boolean(),
  })
  .strict();

export const GetFigmaLayersDataSchema = z
  .object({
    page: z.string().max(512),
    layers: z.array(FigmaLayerSchema).max(1_000),
    // The layer panel is virtualised: only rows Figma has rendered can be read.
    renderedOnly: z.literal(true),
    truncated: z.boolean(),
    anchors: FigmaAnchorHealthSchema,
  })
  .strict();

export const GetFigmaPropertiesParametersSchema = z
  .object({ tabId: z.number().int().nonnegative() })
  .strict();

export const FigmaPropertySchema = z
  .object({ name: z.string().max(128), value: z.string().max(512) })
  .strict();

export const GetFigmaPropertiesDataSchema = z
  .object({
    selection: FigmaSelectionSchema.nullable(),
    // `design_panel` values are reassembled from the inspector and may differ
    // from the CSS Figma itself emits in Dev Mode.
    source: z.enum(["dev_mode_inspect", "design_panel"]),
    reconstructed: z.boolean(),
    sections: z
      .array(
        z
          .object({
            name: z.string().max(128),
            properties: z.array(FigmaPropertySchema).max(64),
          })
          .strict(),
      )
      .max(32),
    css: z.string().max(20_000).optional(),
    anchors: FigmaAnchorHealthSchema,
  })
  .strict();

export const FigmaSelectParametersSchema = z
  .object({
    tabId: z.number().int().nonnegative(),
    target: z.discriminatedUnion("type", [
      z.object({ type: z.literal("page"), name: z.string().min(1).max(512) }).strict(),
      // A layerId is Figma's rendered-row index, which shifts as soon as the
      // virtualised panel scrolls or a node expands. Carrying the name that
      // get_figma_layers reported for that row lets the adapter refuse a stale
      // target instead of silently selecting whatever now sits at that index.
      z
        .object({
          type: z.literal("layer"),
          layerId: z.string().min(1).max(128),
          name: z.string().max(512),
        })
        .strict(),
      z.object({ type: z.literal("mode"), mode: z.enum(["design", "dev"]) }).strict(),
    ]),
  })
  .strict();

export const FigmaSelectDataSchema = z
  .object({
    selected: z.boolean(),
    mode: FigmaModeSchema,
    selection: FigmaSelectionSchema.nullable(),
    currentPage: z.string().max(512),
  })
  .strict();

export const FigmaHealthcheckParametersSchema = z
  .object({ tabId: z.number().int().nonnegative() })
  .strict();

export const FigmaHealthcheckDataSchema = z
  .object({
    ok: z.boolean(),
    figmaDetected: z.boolean(),
    checks: z
      .array(
        z
          .object({
            anchor: z.string().min(1).max(64),
            strategy: FigmaAnchorStrategySchema,
            ok: z.boolean(),
            detail: z.string().max(256),
          })
          .strict(),
      )
      .max(32),
  })
  .strict();

export type FigmaMode = z.infer<typeof FigmaModeSchema>;
export type FigmaAnchorHealth = z.infer<typeof FigmaAnchorHealthSchema>;
export type GetFigmaDocumentParameters = z.infer<typeof GetFigmaDocumentParametersSchema>;
export type GetFigmaDocumentData = z.infer<typeof GetFigmaDocumentDataSchema>;
export type GetFigmaLayersParameters = z.infer<typeof GetFigmaLayersParametersSchema>;
export type GetFigmaLayersData = z.infer<typeof GetFigmaLayersDataSchema>;
export type FigmaLayer = z.infer<typeof FigmaLayerSchema>;
export type GetFigmaPropertiesParameters = z.infer<typeof GetFigmaPropertiesParametersSchema>;
export type GetFigmaPropertiesData = z.infer<typeof GetFigmaPropertiesDataSchema>;
export type FigmaSelectParameters = z.infer<typeof FigmaSelectParametersSchema>;
export type FigmaSelectData = z.infer<typeof FigmaSelectDataSchema>;
export type FigmaHealthcheckParameters = z.infer<typeof FigmaHealthcheckParametersSchema>;
export type FigmaHealthcheckData = z.infer<typeof FigmaHealthcheckDataSchema>;
