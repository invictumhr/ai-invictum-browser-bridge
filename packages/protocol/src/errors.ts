import { z, type ZodError } from "zod";

import { IBP_ERROR_CODES, type IbpErrorCode, type JsonValue } from "@invictum/shared-types";

export interface IbpProtocolErrorOptions extends ErrorOptions {
  details?: JsonValue;
}

export class IbpProtocolError extends Error {
  public constructor(
    public readonly code: IbpErrorCode | string,
    message: string,
    public readonly retryable = false,
    options?: IbpProtocolErrorOptions,
  ) {
    super(message, options);
    this.name = "IbpProtocolError";
    this.details = options?.details;
  }

  public readonly details: JsonValue | undefined;
}

export function validationErrorToProtocolError(error: ZodError): IbpProtocolError {
  return new IbpProtocolError(
    IBP_ERROR_CODES.INVALID_MESSAGE,
    `Invalid IBP message: ${error.issues.map((issue) => issue.message).join("; ")}`,
    false,
    { cause: error },
  );
}

export const isZodError = (error: unknown): error is ZodError => error instanceof z.ZodError;

const issueDetails = (error: ZodError): JsonValue[] =>
  error.issues.map((issue) => ({
    code: issue.code,
    path: issue.path.length === 0 ? "$" : issue.path.join("."),
    message: issue.message,
    ...(issue.code === "unrecognized_keys" ? { unknownKeys: issue.keys } : {}),
  }));

const readableValidationMessage = (
  action: string,
  error: ZodError,
  allowedKeys: readonly string[],
): string => {
  const first = error.issues[0];
  const location = first?.path.length ? first.path.join(".") : "parameters";
  const problem =
    first?.code === "unrecognized_keys"
      ? `unknown key${first.keys.length === 1 ? "" : "s"} ${first.keys.map((key) => `'${key}'`).join(", ")}`
      : `${location}: ${first?.message ?? "invalid value"}`;
  const allowed = allowedKeys.length === 0 ? "none" : allowedKeys.join(", ");
  return `${action}: ${problem}. Allowed keys: ${allowed}`;
};

export const parameterValidationError = (
  action: string,
  error: ZodError,
  allowedKeys: readonly string[],
): IbpProtocolError =>
  new IbpProtocolError(
    IBP_ERROR_CODES.INVALID_PARAMETERS,
    readableValidationMessage(action, error, allowedKeys),
    false,
    {
      cause: error,
      details: {
        stage: "parameters",
        action,
        allowedKeys: [...allowedKeys],
        issues: issueDetails(error),
      },
    },
  );

export const resultValidationError = (
  action: string,
  error: ZodError,
  stage: "extension_result" | "desktop_result",
): IbpProtocolError =>
  new IbpProtocolError(
    IBP_ERROR_CODES.INVALID_MESSAGE,
    `${action}: the ${stage === "extension_result" ? "extension" : "desktop"} result failed schema validation`,
    false,
    {
      cause: error,
      details: { stage, action, issues: issueDetails(error) },
    },
  );
