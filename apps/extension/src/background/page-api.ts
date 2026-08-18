import {
  IBP_ERROR_CODES,
  PageApiRequestDataSchema,
  type PageApiRequestData,
  type PageApiRequestParameters,
  type JsonValue,
} from "@invictum/protocol";

import { ExtensionCommandError } from "./command-error.js";

type PageApiExecutionInput = Omit<PageApiRequestParameters, "tabId" | "authorization">;

const isRestrictedUrl = (rawUrl: string | undefined): boolean => {
  if (rawUrl === undefined) return true;
  try {
    const url = new URL(rawUrl);
    return url.protocol !== "http:" && url.protocol !== "https:";
  } catch {
    return true;
  }
};

export const executeSameOriginPageApiRequest = async (
  input: PageApiExecutionInput,
): Promise<Omit<PageApiRequestData, "tabId">> => {
  const target = new URL(input.url, location.href);
  if (
    target.origin !== location.origin ||
    (target.protocol !== "http:" && target.protocol !== "https:") ||
    target.username.length > 0 ||
    target.password.length > 0
  ) {
    throw new Error("Only credential-free same-origin HTTP(S) page API URLs are allowed");
  }
  target.hash = "";

  const headers = new Headers();
  if (input.headers.accept !== undefined) headers.set("Accept", input.headers.accept);
  if (input.headers.ifMatch !== undefined) headers.set("If-Match", input.headers.ifMatch);
  if (input.headers.ifNoneMatch !== undefined) {
    headers.set("If-None-Match", input.headers.ifNoneMatch);
  }

  let wordpressNonceUsed = false;
  if (input.useWordPressNonce) {
    const candidate = (globalThis as typeof globalThis & { wpApiSettings?: { nonce?: unknown } })
      .wpApiSettings?.nonce;
    if (typeof candidate !== "string" || candidate.length === 0 || candidate.length > 512) {
      throw new Error("The page does not expose a usable WordPress REST nonce");
    }
    headers.set("X-WP-Nonce", candidate);
    wordpressNonceUsed = true;
  }

  let body: string | undefined;
  if (input.body !== undefined) {
    if (typeof input.body === "string") {
      body = input.body;
      headers.set("Content-Type", input.headers.contentType ?? "text/plain");
    } else {
      body = JSON.stringify(input.body);
      headers.set("Content-Type", input.headers.contentType ?? "application/json");
    }
  } else if (input.headers.contentType !== undefined) {
    headers.set("Content-Type", input.headers.contentType);
  }

  const response = await fetch(target.href, {
    method: input.method,
    headers,
    ...(body === undefined ? {} : { body }),
    credentials: "same-origin",
    redirect: "manual",
    cache: "no-store",
  });

  const readBounded = async (): Promise<{ text: string; truncated: boolean }> => {
    if (input.responseMode === "status_only" || response.body === null) {
      return { text: "", truncated: false };
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let text = "";
    let truncated = false;
    try {
      while (text.length <= input.maxResponseChars) {
        const chunk = await reader.read();
        if (chunk.done) {
          text += decoder.decode();
          break;
        }
        text += decoder.decode(chunk.value, { stream: true });
        if (text.length > input.maxResponseChars) {
          truncated = true;
          await reader.cancel();
          break;
        }
      }
    } finally {
      reader.releaseLock();
    }
    return { text: text.slice(0, input.maxResponseChars), truncated };
  };

  const redactString = (value: string): string =>
    value
      .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/giu, "Bearer [REDACTED]")
      .replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}(?:\.[A-Za-z0-9_-]+)?\b/gu, "[REDACTED]")
      .replace(
        /(["']?(?:api[_-]?key|authorization|cookie|credential|nonce|otp|pass(?:word)?|secret|token)["']?\s*[:=]\s*)["']?[^"',\s}<]+/giu,
        "$1[REDACTED]",
      );
  const sensitiveKey =
    /(?:api.?key|authorization|cookie|credential|nonce|otp|pass(?:word)?|secret|token)/iu;
  const redactJson = (value: unknown, depth = 0): JsonValue => {
    if (depth > 32) return "[TRUNCATED_DEPTH]";
    if (typeof value === "string") return redactString(value);
    if (Array.isArray(value))
      return value.slice(0, 10_000).map((item) => redactJson(item, depth + 1));
    if (value === null || typeof value === "boolean" || typeof value === "string") return value;
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    if (typeof value !== "object") return null;
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .slice(0, 10_000)
        .map(([key, item]) => [
          key,
          sensitiveKey.test(key) ? "[REDACTED]" : redactJson(item, depth + 1),
        ]),
    );
  };

  const bounded = await readBounded();
  let responseBody: JsonValue | undefined;
  if (input.responseMode === "text") {
    responseBody = redactString(bounded.text);
  } else if (input.responseMode === "json" && bounded.text.length > 0) {
    if (bounded.truncated) {
      responseBody = { truncatedPreview: redactString(bounded.text) };
    } else {
      try {
        responseBody = redactJson(JSON.parse(bounded.text));
      } catch {
        responseBody = { invalidJsonPreview: redactString(bounded.text) };
      }
    }
  }

  const safeUrl = `${target.origin}${target.pathname}${target.search.length > 0 ? "?[redacted]" : ""}`;
  return {
    origin: target.origin,
    url: safeUrl,
    method: input.method,
    status: response.status,
    ok: response.ok,
    redirected: response.type === "opaqueredirect" || response.redirected,
    contentType: response.headers.get("content-type") ?? "",
    responseMode: input.responseMode,
    ...(responseBody === undefined ? {} : { body: responseBody }),
    responseChars: bounded.text.length,
    truncated: bounded.truncated,
    wordpressNonceUsed,
    verificationRequired: input.method !== "GET",
  };
};

export class ChromePageApiAdapter {
  public async request(parameters: PageApiRequestParameters): Promise<PageApiRequestData> {
    const permissionsGranted = await chrome.permissions.contains({
      permissions: ["activeTab", "scripting"],
    });
    if (!permissionsGranted) {
      throw new ExtensionCommandError(
        IBP_ERROR_CODES.PERMISSION_DENIED,
        "Page API permission is unavailable; set Invictum Site access to On all sites",
        false,
      );
    }
    const tab = await chrome.tabs.get(parameters.tabId);
    const tabUrl = tab.pendingUrl ?? tab.url;
    if (isRestrictedUrl(tabUrl)) {
      throw new ExtensionCommandError(
        IBP_ERROR_CODES.RESTRICTED_PAGE,
        "Chrome does not allow page API access on this browser-internal page",
        false,
      );
    }
    try {
      const { tabId } = parameters;
      const input: PageApiExecutionInput = {
        url: parameters.url,
        method: parameters.method,
        headers: parameters.headers,
        responseMode: parameters.responseMode,
        maxResponseChars: parameters.maxResponseChars,
        useWordPressNonce: parameters.useWordPressNonce,
        ...(parameters.body === undefined ? {} : { body: parameters.body }),
      };
      const result = await chrome.scripting.executeScript({
        target: { tabId },
        world: "MAIN",
        func: executeSameOriginPageApiRequest,
        args: [input],
      });
      if (result[0]?.result === undefined) {
        throw new Error("The page API request did not return a result");
      }
      return PageApiRequestDataSchema.parse({ tabId, ...result[0].result });
    } catch (error) {
      if (error instanceof ExtensionCommandError) throw error;
      throw new ExtensionCommandError(
        IBP_ERROR_CODES.BROWSER_API_ERROR,
        "The explicitly authorized same-origin page API request failed",
        false,
        { cause: error },
      );
    }
  }
}
