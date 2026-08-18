interface ContentRandomSource {
  randomUUID?: () => string;
  getRandomValues?: (bytes: Uint8Array) => Uint8Array;
}

let fallbackCounter = 0;

const toHex = (byte: number): string => byte.toString(16).padStart(2, "0");

const uuidFromBytes = (bytes: Uint8Array): string => {
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = [...bytes].map(toHex).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

/**
 * Generates an internal content-script identifier on both secure and insecure
 * HTTP origins. Chrome exposes crypto.randomUUID only in secure contexts, but
 * IBB must also work on LAN admin panels served over plain HTTP.
 */
export const createContentId = (
  source: ContentRandomSource | null | undefined = globalThis.crypto,
): string => {
  if (typeof source?.randomUUID === "function") {
    try {
      return source.randomUUID.call(source);
    } catch {
      // Fall through to getRandomValues for partial/legacy Web Crypto implementations.
    }
  }

  if (typeof source?.getRandomValues === "function") {
    try {
      const bytes = new Uint8Array(16);
      source.getRandomValues.call(source, bytes);
      return uuidFromBytes(bytes);
    } catch {
      // Internal DOM markers are not authentication secrets; use the bounded fallback below.
    }
  }

  fallbackCounter = (fallbackCounter + 1) % Number.MAX_SAFE_INTEGER;
  return `invictum-${Date.now().toString(36)}-${fallbackCounter.toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
};
