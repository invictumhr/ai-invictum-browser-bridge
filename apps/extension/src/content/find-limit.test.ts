import { describe, expect, it } from "vitest";

import { limitFindMatches } from "./find-limit.js";

describe("find match limiting", () => {
  it("does not call one complete match truncated when the page scan was incomplete", () => {
    expect(limitFindMatches(["only"], 50, true, ["max_elements"])).toEqual({
      matches: ["only"],
      count: 1,
      truncated: false,
      matchesTruncated: false,
      scanTruncated: true,
      truncationReasons: ["max_elements"],
    });
  });

  it("marks matches truncated only when maxResults cuts candidates", () => {
    expect(limitFindMatches(["first", "second"], 1, false, [])).toEqual({
      matches: ["first"],
      count: 1,
      truncated: true,
      matchesTruncated: true,
      scanTruncated: false,
      truncationReasons: [],
    });
  });
});
