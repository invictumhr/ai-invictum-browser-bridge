import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43,128}$/u;

export const controlDataDirectory = (): string =>
  join(
    process.env["LOCALAPPDATA"] ?? join(homedir(), ".invictum-browser-bridge"),
    "InvictumBrowserBridge",
  );

export const controlTokenPath = (): string => join(controlDataDirectory(), "control-token");

export const operationJournalPath = (): string =>
  join(controlDataDirectory(), "operation-journal.jsonl");

export const auditLogPath = (): string => join(controlDataDirectory(), "audit.jsonl");

export const ensureControlToken = (): string => {
  const configured = process.env["INVICTUM_CONTROL_TOKEN"]?.trim();
  if (configured !== undefined && TOKEN_PATTERN.test(configured)) return configured;

  const path = controlTokenPath();
  if (existsSync(path)) {
    const existing = readFileSync(path, "utf8").trim();
    if (TOKEN_PATTERN.test(existing)) return existing;
    throw new Error(`Invalid Invictum control token at ${path}`);
  }

  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const token = randomBytes(32).toString("base64url");
  try {
    writeFileSync(path, `${token}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });
    return token;
  } catch (error) {
    if (!existsSync(path)) throw error;
    const raced = readFileSync(path, "utf8").trim();
    if (!TOKEN_PATTERN.test(raced)) throw error;
    return raced;
  }
};

export const controlTokenMatches = (expected: string, candidate: string | undefined): boolean => {
  if (candidate === undefined || candidate.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < expected.length; index += 1) {
    difference |= expected.charCodeAt(index) ^ candidate.charCodeAt(index);
  }
  return difference === 0;
};
