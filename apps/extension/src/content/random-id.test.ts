import { describe, expect, it } from "vitest";

import { createContentId } from "./random-id.js";

describe("createContentId", () => {
  it("uses randomUUID when the current context exposes it", () => {
    expect(createContentId({ randomUUID: () => "secure-context-id" })).toBe("secure-context-id");
  });

  it("creates an RFC 4122-shaped identifier with getRandomValues on insecure HTTP pages", () => {
    const id = createContentId({
      getRandomValues: (bytes) => {
        bytes.forEach((_, index) => {
          bytes[index] = index;
        });
        return bytes;
      },
    });

    expect(id).toBe("00010203-0405-4607-8809-0a0b0c0d0e0f");
  });

  it("keeps generating unique internal IDs without Web Crypto", () => {
    const first = createContentId(null);
    const second = createContentId(null);

    expect(first).toMatch(/^invictum-[a-z0-9]+-[a-z0-9]+-[a-z0-9]*$/u);
    expect(second).not.toBe(first);
  });
});
