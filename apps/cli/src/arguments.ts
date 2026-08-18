export const numberArgument = (value: string | undefined, name: string): number => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative integer`);
  }
  return parsed;
};

export const activationOverride = (values: readonly string[]): boolean | undefined => {
  const foreground = values.includes("--active");
  const background = values.includes("--background");
  if (foreground && background) {
    throw new Error("Use either --active or --background, not both");
  }
  if (foreground) return true;
  if (background) return false;
  return undefined;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const optionValue = (values: readonly string[], name: string): string | undefined => {
  const index = values.indexOf(name);
  if (index < 0) return undefined;
  const value = values[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`${name} requires a value`);
  }
  return value;
};

const jsonObjectOption = (
  values: readonly string[],
  name: string,
): Record<string, unknown> | undefined => {
  const raw = optionValue(values, name);
  if (raw === undefined) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new Error(`${name} must contain valid JSON`);
  }
  if (!isRecord(parsed)) throw new Error(`${name} must contain a JSON object`);
  return parsed;
};

export const buildEnhancementArguments = (values: readonly string[]): Record<string, unknown> => {
  const postSnapshot = optionValue(values, "--post-snapshot");
  if (postSnapshot !== undefined && postSnapshot !== "outline" && postSnapshot !== "interactive") {
    throw new Error("--post-snapshot must be outline or interactive");
  }
  const verify = jsonObjectOption(values, "--verify");
  const autoMarks = jsonObjectOption(values, "--auto-marks");
  const idempotencyKey = optionValue(values, "--idempotency-key");
  return {
    ...(values.includes("--dry-run") ? { dryRun: true } : {}),
    ...(postSnapshot === undefined ? {} : { postSnapshot }),
    ...(values.includes("--dom-delta") ? { domDelta: true } : {}),
    ...(verify === undefined ? {} : { verify }),
    ...(autoMarks === undefined ? {} : { autoMarks }),
    ...(values.includes("--timings") ? { timings: true } : {}),
    ...(idempotencyKey === undefined ? {} : { idempotencyKey }),
  };
};

const positiveArgument = (value: string | undefined, name: string): number | undefined => {
  if (value === undefined) return undefined;
  const parsed = numberArgument(value, name);
  if (parsed === 0) throw new Error(`${name} must be greater than zero`);
  return parsed;
};

export const buildWaitParameters = (
  tabId: number,
  type: string | undefined,
  rawValue: string | undefined,
  rawTimeoutMs: string | undefined,
): Record<string, unknown> => {
  const timeoutMs = positiveArgument(rawTimeoutMs, "timeoutMs");
  if (type === "dom_stable") {
    const stableMs = rawValue === undefined ? 500 : positiveArgument(rawValue, "stableMs");
    return {
      tabId,
      condition: { type, stableMs },
      ...(timeoutMs === undefined ? {} : { timeoutMs }),
    };
  }
  if (type === "selector") {
    if (!rawValue) throw new Error("selector wait requires a value");
    return {
      tabId,
      condition: { type, value: rawValue },
      ...(timeoutMs === undefined ? {} : { timeoutMs }),
    };
  }
  if (type === "text" || type === "url" || type === "title") {
    if (!rawValue) throw new Error(`${type} wait requires a value`);
    return {
      tabId,
      condition: { type, value: rawValue, match: "contains", caseSensitive: false },
      ...(timeoutMs === undefined ? {} : { timeoutMs }),
    };
  }
  throw new Error("wait type must be url, title, selector, text, or dom_stable");
};
