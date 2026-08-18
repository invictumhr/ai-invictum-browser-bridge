import type { TruncationReason } from "@invictum/protocol";

export const limitFindMatches = <T>(
  matches: readonly T[],
  maxResults: number,
  scanTruncated: boolean,
  truncationReasons: readonly TruncationReason[],
) => {
  const limitedMatches = matches.slice(0, maxResults);
  const matchesTruncated = matches.length > limitedMatches.length;
  return {
    matches: limitedMatches,
    count: limitedMatches.length,
    truncated: matchesTruncated,
    matchesTruncated,
    scanTruncated,
    truncationReasons: [...truncationReasons],
  };
};
