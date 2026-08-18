import { describe, expect, it } from "vitest";

import { serializeWordPressMenuPosition } from "./wordpress-menu.js";

describe("WordPress menu position serialization", () => {
  it("submits one-based positions so WordPress does not append the first item", () => {
    expect([0, 1, 2, 3].map(serializeWordPressMenuPosition)).toEqual(["1", "2", "3", "4"]);
  });

  it("rejects invalid model positions", () => {
    expect(() => serializeWordPressMenuPosition(-1)).toThrow(
      "A WordPress menu position must be a non-negative integer",
    );
    expect(() => serializeWordPressMenuPosition(1.5)).toThrow(
      "A WordPress menu position must be a non-negative integer",
    );
  });
});
