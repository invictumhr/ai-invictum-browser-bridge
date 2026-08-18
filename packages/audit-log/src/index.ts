import { randomUUID } from "node:crypto";

import type { JsonValue } from "@invictum/shared-types";

export type AuditResult = "success" | "failure" | "denied" | "cancelled";

export interface AuditEntryInput {
  timestamp?: string;
  sessionId: string;
  agentId: string;
  clientId: string;
  domain: string;
  url: string;
  tabId?: number;
  tool: string;
  parameters: unknown;
  policyDecision: string;
  riskLevel: string;
  confirmationId?: string;
  result: AuditResult;
  durationMs: number;
  screenshotBeforeId?: string;
  screenshotAfterId?: string;
}

export interface AuditEntry extends Omit<AuditEntryInput, "parameters" | "timestamp"> {
  id: string;
  timestamp: string;
  sanitizedParameters: JsonValue;
}

export interface AuditLog {
  record: (input: AuditEntryInput) => AuditEntry;
}

const REDACTED = "[REDACTED]";
const SENSITIVE_KEY =
  /(?:authorization|cookie|csrf|cvv|otp|pass(?:word|phrase)?|private[_-]?key|api[_-]?key|secret|session[_-]?token|access[_-]?token|refresh[_-]?token|username|prompt[_-]?text)/i;

const sanitize = (value: unknown, key: string | undefined, seen: WeakSet<object>): JsonValue => {
  if (key !== undefined && SENSITIVE_KEY.test(key)) {
    return REDACTED;
  }
  if (value === null || typeof value === "boolean" || typeof value === "number") {
    return Number.isFinite(value) || typeof value !== "number" ? value : String(value);
  }
  if (typeof value === "string") {
    return value.slice(0, 4_000);
  }
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (typeof value !== "object") {
    return null;
  }
  if (seen.has(value)) {
    return "[CIRCULAR]";
  }
  seen.add(value);
  if (Array.isArray(value)) {
    const sanitized = value.slice(0, 1_000).map((item) => sanitize(item, undefined, seen));
    seen.delete(value);
    return sanitized;
  }
  const sanitized: Record<string, JsonValue> = {};
  for (const [property, propertyValue] of Object.entries(value).slice(0, 1_000)) {
    sanitized[property] = sanitize(propertyValue, property, seen);
  }
  seen.delete(value);
  return sanitized;
};

export const sanitizeAuditValue = (value: unknown): JsonValue =>
  sanitize(value, undefined, new WeakSet<object>());

export class InMemoryAuditLog implements AuditLog {
  readonly #entries: AuditEntry[] = [];

  public record(input: AuditEntryInput): AuditEntry {
    const { parameters, timestamp, ...metadata } = input;
    const entry: AuditEntry = {
      ...metadata,
      id: randomUUID(),
      timestamp: timestamp ?? new Date().toISOString(),
      sanitizedParameters: sanitizeAuditValue(parameters),
    };
    this.#entries.push(entry);
    return entry;
  }

  public list(): readonly AuditEntry[] {
    return this.#entries.map((entry) => ({ ...entry }));
  }
}
