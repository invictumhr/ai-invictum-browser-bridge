import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const controlTokenPath = (): string =>
  join(
    process.env["LOCALAPPDATA"] ?? join(homedir(), ".invictum-browser-bridge"),
    "InvictumBrowserBridge",
    "control-token",
  );

/** Read the bearer token created by Desktop Authority without exposing it in logs. */
export const readControlToken = (): string | undefined => {
  const configured = process.env["INVICTUM_CONTROL_TOKEN"]?.trim();
  if (configured !== undefined && configured.length > 0) return configured;
  const path = controlTokenPath();
  if (!existsSync(path)) return undefined;
  const value = readFileSync(path, "utf8").trim();
  return value.length > 0 ? value : undefined;
};
