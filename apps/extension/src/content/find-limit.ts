import type { TruncationReason } from "@invictum/protocol";

export const relevantFindTruncationReasons = (
  reasons: readonly TruncationReason[],
  textSensitive: boolean,
): TruncationReason[] =>
  reasons.filter(
    (reason) =>
      reason === "max_elements" ||
      reason === "max_depth" ||
      (textSensitive && (reason === "max_text_length" || reason === "field_text_limit")),
  );

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
