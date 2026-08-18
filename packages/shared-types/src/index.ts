export const IBP_PROTOCOL = "ibp" as const;
export const IBP_VERSION = "1.0" as const;

export type ProtocolDirection = "request" | "response" | "event";
export type ProtocolMessageType = "ibp.request" | "ibp.response" | "ibp.event";
export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export interface RiskContext {
  expectedEffect?: string;
  destructive?: boolean;
  irreversible?: boolean;
}

export interface RetryPolicy {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

export interface ProtocolRequest<T = unknown> {
  action: string;
  parameters: T;
  timeoutMs?: number;
  riskContext?: RiskContext;
  idempotencyKey?: string;
  retryPolicy?: RetryPolicy;
}

export interface ProtocolError {
  code: string;
  message: string;
  details?: unknown;
  retryable: boolean;
}

export interface ProtocolTiming {
  startedAt: string;
  completedAt: string;
  durationMs: number;
}

export interface ProtocolResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: ProtocolError;
  timing?: ProtocolTiming;
}

export interface ProtocolEvent<T = unknown> {
  event: string;
  data: T;
  completed?: boolean;
}

export interface ProtocolEnvelope<T = unknown> {
  protocol: typeof IBP_PROTOCOL;
  version: typeof IBP_VERSION;
  messageId: string;
  sessionId: string;
  timestamp: string;
  direction: ProtocolDirection;
  type: ProtocolMessageType;
  payload: T;
  correlationId?: string;
  sequence?: number;
}

export type ProtocolRequestEnvelope<T = unknown> = ProtocolEnvelope<ProtocolRequest<T>> & {
  direction: "request";
  type: "ibp.request";
};

export type ProtocolResponseEnvelope<T = unknown> = ProtocolEnvelope<ProtocolResponse<T>> & {
  direction: "response";
  type: "ibp.response";
  correlationId: string;
};

export type ProtocolEventEnvelope<T = unknown> = ProtocolEnvelope<ProtocolEvent<T>> & {
  direction: "event";
  type: "ibp.event";
};

export type IbpEnvelope =
  ProtocolRequestEnvelope | ProtocolResponseEnvelope | ProtocolEventEnvelope;

export interface BinaryAttachmentReference {
  id: string;
  mediaType: string;
  byteLength: number;
  sha256: string;
  expiresAt: string;
}

export interface ScreenshotReference extends BinaryAttachmentReference {
  kind: "screenshot";
  width: number;
  height: number;
}

export const IBP_ERROR_CODES = {
  AUTHENTICATION_FAILED: "AUTHENTICATION_FAILED",
  BROWSER_API_ERROR: "BROWSER_API_ERROR",
  CANCELLED: "CANCELLED",
  CONTENT_SCRIPT_UNAVAILABLE: "CONTENT_SCRIPT_UNAVAILABLE",
  CONFIRMATION_REQUIRED: "CONFIRMATION_REQUIRED",
  ELEMENT_NOT_INTERACTABLE: "ELEMENT_NOT_INTERACTABLE",
  INVALID_PARAMETERS: "INVALID_PARAMETERS",
  INVALID_MESSAGE: "INVALID_MESSAGE",
  LOCAL_FILE_ACCESS_DENIED: "LOCAL_FILE_ACCESS_DENIED",
  LOCAL_FILE_NOT_FOUND: "LOCAL_FILE_NOT_FOUND",
  MESSAGE_TOO_LARGE: "MESSAGE_TOO_LARGE",
  NATIVE_HOST_UNAVAILABLE: "NATIVE_HOST_UNAVAILABLE",
  PERMISSION_DENIED: "PERMISSION_DENIED",
  POLICY_DENIED: "POLICY_DENIED",
  RESTRICTED_PAGE: "RESTRICTED_PAGE",
  SESSION_UNAUTHORIZED: "SESSION_UNAUTHORIZED",
  SCRIPT_EXECUTION_FAILED: "SCRIPT_EXECUTION_FAILED",
  SCRIPT_POLICY_DENIED: "SCRIPT_POLICY_DENIED",
  STALE_ELEMENT_REFERENCE: "STALE_ELEMENT_REFERENCE",
  TIMEOUT: "TIMEOUT",
  UNSUPPORTED_ACTION: "UNSUPPORTED_ACTION",
} as const;

export type IbpErrorCode = (typeof IBP_ERROR_CODES)[keyof typeof IBP_ERROR_CODES];
