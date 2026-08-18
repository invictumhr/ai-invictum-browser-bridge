export const toHostPermissionPattern = (rawUrl: string | undefined): string | undefined => {
  if (rawUrl === undefined) return undefined;

  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;

    // Chrome match patterns intentionally omit ports; an approved host applies
    // to that host on every port for the selected HTTP(S) scheme.
    return `${url.protocol}//${url.hostname}/*`;
  } catch {
    return undefined;
  }
};

export const isChromePageAccessDenied = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error);
  return /cannot access contents|missing host permission|cannot be scripted/i.test(message);
};

export const pageAccessDeniedMessage = (
  tabId: number,
  rawUrl: string | undefined,
  operation: string,
): string => {
  let origin = "unknown origin";
  try {
    const parsed = new URL(rawUrl ?? "about:blank");
    origin = parsed.origin === "null" ? parsed.protocol : parsed.origin;
  } catch {
    // Keep the bounded fallback without echoing an invalid or secret-bearing URL.
  }
  return `Chrome blocked ${operation} for tab ${tabId} (${origin}). In Invictum extension Details set Site access to On all sites`;
};
