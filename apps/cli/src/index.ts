#!/usr/bin/env node

import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { EnhancedActionRunner } from "@invictum/agent-sdk";

import {
  activationOverride,
  buildEnhancementArguments,
  buildWaitParameters,
  numberArgument,
} from "./arguments.js";
import { ControlClient, ControlError } from "./client.js";
import { CliStateStore, type CachedElementReference, type CachedTabState } from "./state.js";

const rawArgs = process.argv.slice(2);
const pretty = rawArgs.includes("--pretty");
const args = rawArgs.filter((argument) => argument !== "--pretty");
const baseUrl = process.env["INVICTUM_CONTROL_URL"] ?? "http://127.0.0.1:47820";
const sessionId = process.env["INVICTUM_SESSION_ID"] ?? "invictum-cli";
const client = new ControlClient(baseUrl, {
  sessionId,
  agentId: process.env["INVICTUM_AGENT_ID"] ?? "cli-agent",
  clientId: "invictum-browser-cli",
  sessionAuthorized: process.env["INVICTUM_SESSION_AUTHORIZED"] !== "false",
});
const state = new CliStateStore(sessionId, baseUrl);
const enhancedActions = new EnhancedActionRunner(client);

const enhancedCall = async (
  action: string,
  parameters: Record<string, unknown> = {},
): Promise<unknown> => {
  const tabId = parameters["tabId"];
  const elementId = parameters["elementId"];
  if (typeof tabId === "number" && typeof elementId === "string") {
    const reference = (await state.getTab(tabId))?.elements[elementId];
    if (reference !== undefined) {
      enhancedActions.observe(
        "browser.find_elements",
        { tabId },
        { matches: [{ element: reference }] },
      );
    }
  }
  return enhancedActions.run(action, parameters, {
    createError: (code, message, retryable, details) =>
      new ControlError(code, message, retryable, details),
  });
};

const sleep = async (milliseconds: number): Promise<void> =>
  new Promise((resolveSleep) => setTimeout(resolveSleep, milliseconds));

const ensureDaemon = async (): Promise<Record<string, unknown>> => {
  try {
    return await client.health();
  } catch {
    const desktopEntry = fileURLToPath(new URL("../../desktop/dist/index.js", import.meta.url));
    const child = spawn(process.execPath, [desktopEntry], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
      env: process.env,
    });
    child.unref();
    for (let attempt = 0; attempt < 30; attempt += 1) {
      await sleep(100);
      try {
        return await client.health();
      } catch {
        // Authority can need a moment to bind both loopback ports.
      }
    }
    throw new Error("Invictum desktop authority did not start within 3 seconds");
  }
};

const waitForNativeConnection = async (initialHealth: Record<string, unknown>): Promise<void> => {
  if (initialHealth["nativeConnected"] === true) return;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    await sleep(200);
    const health = await client.health();
    if (health["nativeConnected"] === true) return;
  }
  throw new ControlError(
    "NATIVE_HOST_UNAVAILABLE",
    "Desktop Authority is running, but Chrome did not reconnect within 10 seconds. Reload the unpacked extension once and retry.",
    true,
  );
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const jsonArgument = (value: string | undefined): unknown => {
  if (value === undefined) return {};
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new Error("Parameters must be valid JSON; use --stdin in Windows PowerShell");
  }
};

const readStdinJson = async (): Promise<unknown> => {
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of process.stdin) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += bytes.length;
    if (length > 1024 * 1024) throw new Error("stdin JSON exceeds 1 MiB");
    chunks.push(bytes);
  }
  if (chunks.length === 0) return {};
  return jsonArgument(Buffer.concat(chunks).toString("utf8"));
};

const cachedReference = (element: Record<string, unknown>): CachedElementReference | undefined => {
  if (
    typeof element["elementId"] !== "string" ||
    typeof element["frameId"] !== "string" ||
    typeof element["role"] !== "string" ||
    typeof element["name"] !== "string" ||
    typeof element["tag"] !== "string"
  ) {
    return undefined;
  }
  const selectors = isRecord(element["selectors"]) ? element["selectors"] : undefined;
  return {
    elementId: element["elementId"],
    frameId: element["frameId"],
    role: element["role"],
    name: element["name"],
    tag: element["tag"],
    ...(typeof selectors?.["css"] === "string"
      ? { css: selectors["css"] }
      : typeof element["css"] === "string"
        ? { css: element["css"] }
        : {}),
  };
};

const cacheSnapshot = async (tabId: number, snapshot: unknown): Promise<CachedTabState> => {
  if (!isRecord(snapshot) || !isRecord(snapshot["metadata"])) {
    throw new Error("Snapshot result did not contain metadata");
  }
  const documentId = snapshot["metadata"]["documentId"];
  const domRevision = snapshot["metadata"]["domRevision"];
  if (typeof documentId !== "string" || typeof domRevision !== "number") {
    throw new Error("Snapshot result did not contain a valid document revision");
  }
  const representation =
    snapshot["metadata"]["detail"] === "outline" && Array.isArray(snapshot["outline"])
      ? snapshot["outline"]
      : Array.isArray(snapshot["elements"])
        ? snapshot["elements"]
        : undefined;
  if (representation === undefined) {
    throw new Error("Snapshot result did not contain elements or outline");
  }
  const references = representation
    .filter(isRecord)
    .map(cachedReference)
    .filter((reference): reference is CachedElementReference => reference !== undefined);
  const tab: CachedTabState = {
    documentId,
    domRevision,
    updatedAt: new Date().toISOString(),
    elements: Object.fromEntries(references.map((reference) => [reference.elementId, reference])),
  };
  await state.setTab(tabId, tab);
  enhancedActions.observe("browser.get_page_snapshot", { tabId }, snapshot);
  return tab;
};

const freshSnapshot = async (tabId: number, detail = "interactive"): Promise<unknown> => {
  const snapshot = await client.call("browser.get_page_snapshot", { tabId, detail });
  await cacheSnapshot(tabId, snapshot);
  return snapshot;
};

const uniqueRelocatedReference = async (
  tabId: number,
  previous: CachedElementReference,
): Promise<{ tab: CachedTabState; element: CachedElementReference }> => {
  await freshSnapshot(tabId, "interactive");
  const tab = await state.getTab(tabId);
  if (tab === undefined) throw new Error(`No cached snapshot exists for tab ${tabId}`);
  const criteria: Record<string, unknown> = {
    tabId,
    documentId: tab.documentId,
    domRevision: tab.domRevision,
    maxResults: 2,
    matchMode: "exact",
    role: previous.role,
    name: previous.name,
    tag: previous.tag,
    frameId: previous.frameId,
    ...(previous.css === undefined ? {} : { css: previous.css }),
  };
  const found = await client.call("browser.find_elements", criteria);
  if (!isRecord(found) || !Array.isArray(found["matches"]) || found["matches"].length !== 1) {
    throw new Error("The stale element could not be deterministically relocated");
  }
  const match = found["matches"][0];
  const element =
    isRecord(match) && isRecord(match["element"]) ? cachedReference(match["element"]) : undefined;
  if (element === undefined) throw new Error("The relocated element result was invalid");
  tab.elements[element.elementId] = element;
  await state.setTab(tabId, tab);
  return { tab, element };
};

const callWithReference = async (
  action: string,
  tabId: number,
  elementId: string | undefined,
  extra: Record<string, unknown> = {},
): Promise<unknown> => {
  if (!elementId) throw new Error(`${action} requires an elementId`);
  const tab = await state.getTab(tabId);
  const previous = tab?.elements[elementId];
  if (tab === undefined || previous === undefined) {
    throw new Error(
      `No cached reference for ${elementId}; run snapshot or find in this CLI session first`,
    );
  }
  const invoke = async (
    targetTab: CachedTabState,
    target: CachedElementReference,
  ): Promise<unknown> => {
    const result = await client.call(action, {
      tabId,
      documentId: targetTab.documentId,
      domRevision: targetTab.domRevision,
      elementId: target.elementId,
      ...extra,
    });
    if (
      isRecord(result) &&
      typeof result["resolvedElementId"] === "string" &&
      typeof result["documentId"] === "string" &&
      typeof result["domRevisionAfter"] === "number"
    ) {
      const relocated = { ...target, elementId: result["resolvedElementId"] };
      await state.setTab(tabId, {
        documentId: result["documentId"],
        domRevision: result["domRevisionAfter"],
        updatedAt: new Date().toISOString(),
        elements: { [relocated.elementId]: relocated },
      });
    }
    return result;
  };
  try {
    return await invoke(tab, previous);
  } catch (error) {
    if (!(error instanceof ControlError) || error.code !== "STALE_ELEMENT_REFERENCE") throw error;
    const relocated = await uniqueRelocatedReference(tabId, previous);
    return invoke(relocated.tab, relocated.element);
  }
};

const saveScreenshotResult = async (result: unknown, output?: string): Promise<unknown> => {
  if (!isRecord(result) || typeof result["dataUrl"] !== "string") {
    throw new Error("Screenshot result did not contain an image");
  }
  const match = /^data:image\/jpeg;base64,(.+)$/s.exec(result["dataUrl"]);
  if (match?.[1] === undefined) throw new Error("Screenshot result was not a JPEG data URL");
  const resultTabId = typeof result["tabId"] === "number" ? result["tabId"] : "tab";
  const path = resolve(output ?? `invictum-screenshot-${resultTabId}-${Date.now()}.jpg`);
  await writeFile(path, Buffer.from(match[1], "base64"));
  const metadata = { ...result };
  delete metadata["dataUrl"];
  return { ...metadata, path };
};

const screenshotToFile = async (
  parameters: Record<string, unknown>,
  output?: string,
): Promise<unknown> =>
  saveScreenshotResult(await client.call("browser.screenshot", parameters), output);

const savePdfResult = async (result: unknown, output?: string): Promise<unknown> => {
  if (!isRecord(result) || typeof result["dataUrl"] !== "string") {
    throw new Error("PDF result did not contain a document");
  }
  const match = /^data:application\/pdf;base64,(.+)$/s.exec(result["dataUrl"]);
  if (match?.[1] === undefined) throw new Error("PDF result was not a PDF data URL");
  const resultTabId = typeof result["tabId"] === "number" ? result["tabId"] : "tab";
  const path = resolve(output ?? `invictum-page-${resultTabId}-${Date.now()}.pdf`);
  await writeFile(path, Buffer.from(match[1], "base64"));
  const metadata = { ...result };
  delete metadata["dataUrl"];
  return { ...metadata, path };
};

const screenshotElementToFile = async (
  tabId: number,
  elementId: string | undefined,
  output: string | undefined,
  annotationText?: string,
): Promise<unknown> => {
  if (elementId === undefined) throw new Error("screenshot-element requires an elementId");
  let tab = await state.getTab(tabId);
  let element = tab?.elements[elementId];
  if (tab === undefined || element === undefined) {
    throw new Error(
      `No cached reference for ${elementId}; run snapshot or find in this CLI session first`,
    );
  }
  const invoke = (targetTab: CachedTabState, target: CachedElementReference): Promise<unknown> =>
    client.call("browser.screenshot", {
      tabId,
      documentId: targetTab.documentId,
      domRevision: targetTab.domRevision,
      elementId: target.elementId,
      mode: "element",
      padding: annotationText === undefined ? 12 : 96,
      ...(annotationText === undefined
        ? {}
        : {
            annotations: [
              {
                target: { type: "element", elementId: target.elementId, padding: 8 },
                shape: "rounded_rectangle",
                stroke: "#ef4444",
                strokeWidth: 4,
                label: {
                  text: annotationText,
                  position: "auto",
                  background: "#ef4444",
                  color: "#ffffff",
                  arrow: true,
                },
              },
            ],
          }),
    });
  let result: unknown;
  try {
    result = await invoke(tab, element);
  } catch (error) {
    if (!(error instanceof ControlError) || error.code !== "STALE_ELEMENT_REFERENCE") throw error;
    const relocated = await uniqueRelocatedReference(tabId, element);
    tab = relocated.tab;
    element = relocated.element;
    result = await invoke(tab, element);
  }
  return saveScreenshotResult(result, output);
};

const screenshotRegion = (
  value: string | undefined,
): { x: number; y: number; width: number; height: number } => {
  const parts = value?.split(",").map(Number);
  if (
    parts === undefined ||
    parts.length !== 4 ||
    parts.some((part) => !Number.isFinite(part)) ||
    parts[0]! < 0 ||
    parts[1]! < 0 ||
    parts[2]! <= 0 ||
    parts[3]! <= 0
  ) {
    throw new Error("--region requires x,y,width,height using non-negative CSS pixels");
  }
  return { x: parts[0]!, y: parts[1]!, width: parts[2]!, height: parts[3]! };
};

const instructionArgument = (): string => {
  const index = args.indexOf("--instruction");
  const value = index < 0 ? undefined : args[index + 1];
  if (value === undefined || value.length === 0) {
    throw new Error("This R2 action requires --instruction <stable-user-instruction-id>");
  }
  return value;
};

const explicitAuthorization = (): Record<string, string> => ({
  source: "explicit_user_instruction",
  instructionId: instructionArgument(),
});

const readBatchPath = (value: unknown, path: string): unknown => {
  if (path.length === 0) return value;
  let current = value;
  for (const segment of path.split(".")) {
    if (Array.isArray(current) && /^\d+$/u.test(segment)) current = current[Number(segment)];
    else if (isRecord(current) && Object.hasOwn(current, segment)) current = current[segment];
    else throw new Error(`Batch placeholder path '${path}' does not exist`);
  }
  return current;
};

const resolveBatchValue = (
  value: unknown,
  completed: ReadonlyMap<string, unknown>,
  last: unknown,
  depth = 0,
): unknown => {
  if (depth > 32) throw new Error("Batch parameter nesting exceeds 32 levels");
  if (typeof value === "string") {
    const step = /^\$steps\.([A-Za-z][A-Za-z0-9_-]{0,63})(?:\.(.*))?$/u.exec(value);
    if (step !== null) {
      if (!completed.has(step[1]!)) {
        throw new Error(`Batch placeholder references unfinished step '${step[1]}'`);
      }
      return readBatchPath(completed.get(step[1]!), step[2] ?? "");
    }
    const latest = /^\$last(?:\.(.*))?$/u.exec(value);
    if (latest !== null) {
      if (last === undefined) throw new Error("Batch $last placeholder has no successful step");
      return readBatchPath(last, latest[1] ?? "");
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => resolveBatchValue(item, completed, last, depth + 1));
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        resolveBatchValue(item, completed, last, depth + 1),
      ]),
    );
  }
  return value;
};

const runBatch = async (input: unknown): Promise<Record<string, unknown>> => {
  if (!isRecord(input) || !Array.isArray(input["steps"])) {
    throw new Error("batch stdin must be an object with a steps array");
  }
  if (input["steps"].length < 1 || input["steps"].length > 25) {
    throw new Error("batch requires 1-25 steps");
  }
  const completed = new Map<string, unknown>();
  const ids = new Set<string>();
  const results: Record<string, unknown>[] = [];
  let last: unknown;
  for (const rawStep of input["steps"]) {
    if (
      !isRecord(rawStep) ||
      typeof rawStep["id"] !== "string" ||
      !/^[A-Za-z][A-Za-z0-9_-]{0,63}$/u.test(rawStep["id"]) ||
      typeof rawStep["action"] !== "string"
    ) {
      throw new Error("Each batch step requires a valid id and action");
    }
    const id = rawStep["id"];
    const action = rawStep["action"];
    if (ids.has(id)) throw new Error(`Duplicate batch step id '${id}'`);
    ids.add(id);
    if (action === "browser.batch") throw new Error("Nested batches are forbidden");
    try {
      const parameters = resolveBatchValue(rawStep["parameters"] ?? {}, completed, last);
      if (!isRecord(parameters)) throw new Error(`Batch step '${id}' parameters must be an object`);
      const data = await enhancedCall(action, {
        ...parameters,
        ...(typeof rawStep["idempotencyKey"] === "string"
          ? { idempotencyKey: rawStep["idempotencyKey"] }
          : {}),
        ...(rawStep["dryRun"] === true ? { dryRun: true } : {}),
        ...(rawStep["postSnapshot"] === "outline" || rawStep["postSnapshot"] === "interactive"
          ? { postSnapshot: rawStep["postSnapshot"] }
          : {}),
        ...(rawStep["domDelta"] === true ? { domDelta: true } : {}),
        ...(isRecord(rawStep["verify"]) ? { verify: rawStep["verify"] } : {}),
        ...(isRecord(rawStep["autoMarks"]) ? { autoMarks: rawStep["autoMarks"] } : {}),
        ...(rawStep["timings"] === true ? { timings: true } : {}),
      });
      completed.set(id, data);
      last = data;
      results.push({ id, action, success: true, data });
    } catch (error) {
      results.push({
        id,
        action,
        success: false,
        error: {
          code: error instanceof ControlError ? error.code : "BATCH_STEP_ERROR",
          message: error instanceof Error ? error.message : String(error),
          retryable: error instanceof ControlError ? error.retryable : false,
        },
      });
      if (input["continueOnError"] !== true) break;
    }
  }
  const failed = results.filter((result) => result["success"] === false).length;
  return {
    steps: results,
    completed: results.length - failed,
    failed,
    stoppedEarly: results.length < input["steps"].length,
  };
};

const usage = {
  usage: [
    "invictum-browser health",
    "invictum-browser ping",
    "invictum-browser capabilities",
    "invictum-browser list-tabs",
    "invictum-browser open <https-url> [--active|--background]",
    "invictum-browser navigate <tabId> <https-url> [--active|--background]",
    "invictum-browser back|forward|activate <tabId>",
    "invictum-browser identify <tabId> <agent-name>",
    "invictum-browser snapshot <tabId> [minimal|interactive|semantic|full|outline]",
    "invictum-browser text <tabId> [maxChars] [text|markdown]",
    'invictum-browser natural <tabId> "Update button"',
    "invictum-browser wait <tabId> <url|title|selector|text> <value> [timeoutMs]",
    "invictum-browser wait <tabId> dom_stable [stableMs] [timeoutMs]",
    "invictum-browser find <tabId> <role> [name]",
    "invictum-browser click <tabId> <elementId>",
    "invictum-browser type <tabId> <elementId> <text> [--append]",
    "invictum-browser upload <tabId> <elementId> <absolute-path>... --instruction <id>",
    "invictum-browser select <tabId> <elementId> <value>",
    "invictum-browser check|uncheck <tabId> <elementId>",
    "invictum-browser hover|focus|blur|scroll-to|double-click|context-click <tabId> <elementId>",
    "invictum-browser press <tabId> <elementId> <key> [--ctrl] [--alt] [--meta] [--shift]",
    "invictum-browser drag <tabId> <sourceElementId> <targetElementId>",
    "invictum-browser scroll-by <tabId> <deltaX> <deltaY>",
    "invictum-browser scroll-xy <tabId> <x> <y>",
    "invictum-browser wp-admin <tabId>",
    "invictum-browser wp-row <tabId> <rowId> <actionKey> --instruction <id>",
    "invictum-browser wp-bulk <tabId> <actionKey> <rowId>... --instruction <id>",
    "invictum-browser wp-editor <tabId>",
    "invictum-browser wp-edit <tabId> --stdin [--save] --instruction <id>",
    "invictum-browser wp-save <tabId> --instruction <id>",
    "invictum-browser beforeunload <tabId> <leave|stay> --url <destination> --instruction <id>",
    "invictum-browser close <tabId> --instruction <id>",
    "invictum-browser screenshot <tabId> [outfile.jpg] [--full-page]",
    "invictum-browser screenshot <tabId> [outfile.jpg] --region x,y,width,height [--document]",
    "invictum-browser screenshot-element <tabId> <elementId> [outfile.jpg]",
    'invictum-browser tutorial-screenshot <tabId> <elementId> "Click this button" [outfile.jpg]',
    "invictum-browser console <tabId> <start|read|clear|stop> [--clear]",
    "invictum-browser network <tabId> <start|read|clear|stop> [--clear]",
    "invictum-browser pdf <tabId> [outfile.pdf] [--landscape] [--letter|--legal]",
    "invictum-browser api <tabId> <same-origin-url> [METHOD] [--stdin] [--wp-nonce] --instruction <id>",
    "invictum-browser mobile <tabId> [mobile_small|mobile_medium|mobile_large|tablet] [portrait|landscape]",
    "invictum-browser desktop <tabId>",
    "invictum-browser unlock <tabId>",
    "invictum-browser call <ibp.action> --stdin",
    "invictum-browser call <ibp.action> '<json-parameters>'",
    "  enhancement flags: --dry-run --post-snapshot <outline|interactive> --dom-delta",
    "  --verify '<json>' --auto-marks '<json>' --timings --idempotency-key <key>",
    "invictum-browser batch --stdin",
    "invictum-browser close-session",
  ],
  note: "JSON output is compact by default; add --pretty for human-readable output. The CLI auto-starts the desktop authority.",
};

const main = async (): Promise<unknown> => {
  const command = args[0] ?? "help";
  if (command === "help" || command === "--help" || command === "-h") return usage;
  const health = await ensureDaemon();
  if (command === "health") return health;
  await waitForNativeConnection(health);
  if (command === "ping") return client.call("system.ping");
  if (command === "capabilities") return client.call("system.capabilities");
  if (command === "list-tabs") return client.call("browser.list_tabs");
  if (command === "open") {
    const active = activationOverride(args.slice(2));
    return client.call("browser.open_tab", {
      url: args[1],
      ...(active === undefined ? {} : { active }),
    });
  }
  if (command === "navigate") {
    const tabId = numberArgument(args[1], "tabId");
    const active = activationOverride(args.slice(3));
    await state.removeTab(tabId);
    return client.call("browser.navigate", {
      tabId,
      url: args[2],
      ...(active === undefined ? {} : { active }),
      waitUntil: "complete",
    });
  }
  if (command === "back" || command === "forward") {
    const tabId = numberArgument(args[1], "tabId");
    await state.removeTab(tabId);
    return client.call(command === "back" ? "browser.go_back" : "browser.go_forward", {
      tabId,
      waitUntil: "complete",
    });
  }
  if (command === "activate") {
    return client.call("browser.activate_tab", { tabId: numberArgument(args[1], "tabId") });
  }
  if (command === "identify") {
    return client.call("browser.set_control_identity", {
      tabId: numberArgument(args[1], "tabId"),
      agentName: args.slice(2).join(" "),
    });
  }
  if (command === "snapshot") {
    const tabId = numberArgument(args[1], "tabId");
    return freshSnapshot(tabId, args[2] ?? "interactive");
  }
  if (command === "text") {
    return client.call("browser.get_page_text", {
      tabId: numberArgument(args[1], "tabId"),
      ...(args[2] === undefined ? {} : { maxChars: numberArgument(args[2], "maxChars") }),
      ...(args[3] === undefined ? {} : { format: args[3] }),
    });
  }
  if (command === "wait") {
    return client.call(
      "browser.wait_for",
      buildWaitParameters(numberArgument(args[1], "tabId"), args[2], args[3], args[4]),
    );
  }
  if (command === "find") {
    const tabId = numberArgument(args[1], "tabId");
    await freshSnapshot(tabId, "interactive");
    const tab = await state.getTab(tabId);
    if (tab === undefined) throw new Error(`No snapshot state exists for tab ${tabId}`);
    const result = await client.call("browser.find_elements", {
      tabId,
      documentId: tab.documentId,
      domRevision: tab.domRevision,
      role: args[2],
      ...(args[3] === undefined ? {} : { name: args[3] }),
      matchMode: args[3] === undefined ? "contains" : "exact",
      maxResults: 50,
    });
    if (isRecord(result) && Array.isArray(result["matches"])) {
      for (const match of result["matches"]) {
        if (!isRecord(match) || !isRecord(match["element"])) continue;
        const reference = cachedReference(match["element"]);
        if (reference !== undefined) tab.elements[reference.elementId] = reference;
      }
      await state.setTab(tabId, tab);
    }
    return result;
  }
  if (command === "natural") {
    const tabId = numberArgument(args[1], "tabId");
    const result = await client.call("browser.find_natural_language", {
      tabId,
      query: args.slice(2).join(" "),
      maxResults: 50,
    });
    if (
      isRecord(result) &&
      typeof result["documentId"] === "string" &&
      typeof result["domRevision"] === "number" &&
      Array.isArray(result["matches"])
    ) {
      const references = result["matches"]
        .filter(isRecord)
        .map((match) =>
          isRecord(match["element"]) ? cachedReference(match["element"]) : undefined,
        )
        .filter((reference): reference is CachedElementReference => reference !== undefined);
      await state.setTab(tabId, {
        documentId: result["documentId"],
        domRevision: result["domRevision"],
        updatedAt: new Date().toISOString(),
        elements: Object.fromEntries(
          references.map((reference) => [reference.elementId, reference]),
        ),
      });
    }
    return result;
  }
  if (command === "click") {
    return callWithReference("browser.click", numberArgument(args[1], "tabId"), args[2]);
  }
  if (command === "type") {
    return callWithReference("browser.type_text", numberArgument(args[1], "tabId"), args[2], {
      text: args[3] ?? "",
      mode: args.includes("--append") ? "append" : "replace",
    });
  }
  if (command === "upload") {
    const instructionIndex = args.indexOf("--instruction");
    const instructionId = instructionIndex < 0 ? undefined : args[instructionIndex + 1];
    const filePaths = args.slice(3, instructionIndex < 0 ? undefined : instructionIndex);
    if (instructionId === undefined || instructionId.length === 0) {
      throw new Error("upload requires --instruction <stable-user-instruction-id>");
    }
    if (filePaths.length === 0) throw new Error("upload requires at least one absolute file path");
    return callWithReference(
      "browser.set_file_input_files",
      numberArgument(args[1], "tabId"),
      args[2],
      {
        filePaths,
        authorization: {
          source: "explicit_user_instruction",
          instructionId,
        },
      },
    );
  }
  if (command === "select") {
    return callWithReference("browser.select_option", numberArgument(args[1], "tabId"), args[2], {
      selection: { values: [args[3] ?? ""] },
    });
  }
  if (command === "check" || command === "uncheck") {
    return callWithReference(`browser.${command}`, numberArgument(args[1], "tabId"), args[2]);
  }
  if (["hover", "focus", "blur", "scroll-to", "double-click", "context-click"].includes(command)) {
    return callWithReference("browser.perform_gesture", numberArgument(args[1], "tabId"), args[2], {
      operation:
        command === "scroll-to"
          ? "scroll_into_view"
          : command === "double-click"
            ? "double_click"
            : command === "context-click"
              ? "context_click"
              : command,
    });
  }
  if (command === "press") {
    return callWithReference("browser.perform_gesture", numberArgument(args[1], "tabId"), args[2], {
      operation: "press_key",
      key: args[3],
      ctrl: args.includes("--ctrl"),
      alt: args.includes("--alt"),
      meta: args.includes("--meta"),
      shift: args.includes("--shift"),
    });
  }
  if (command === "drag") {
    const tabId = numberArgument(args[1], "tabId");
    const tab = await state.getTab(tabId);
    const source = args[2] === undefined ? undefined : tab?.elements[args[2]];
    const target = args[3] === undefined ? undefined : tab?.elements[args[3]];
    if (tab === undefined || source === undefined || target === undefined) {
      throw new Error("drag requires fresh cached source and target element references");
    }
    return client.call("browser.perform_gesture", {
      operation: "drag_and_drop",
      tabId,
      documentId: tab.documentId,
      domRevision: tab.domRevision,
      elementId: source.elementId,
      targetElementId: target.elementId,
    });
  }
  if (command === "scroll-by") {
    const tabId = numberArgument(args[1], "tabId");
    const tab = await state.getTab(tabId);
    if (tab === undefined) throw new Error("scroll-by requires a fresh snapshot first");
    return client.call("browser.perform_gesture", {
      operation: "scroll_by",
      tabId,
      documentId: tab.documentId,
      domRevision: tab.domRevision,
      deltaX: Number(args[2] ?? 0),
      deltaY: Number(args[3] ?? 0),
    });
  }
  if (command === "scroll-xy") {
    const tabId = numberArgument(args[1], "tabId");
    const tab = await state.getTab(tabId);
    if (tab === undefined) throw new Error("scroll-xy requires a fresh snapshot first");
    return client.call("browser.perform_gesture", {
      operation: "scroll_to",
      tabId,
      documentId: tab.documentId,
      domRevision: tab.domRevision,
      x: numberArgument(args[2], "x"),
      y: numberArgument(args[3], "y"),
    });
  }
  if (command === "wp-admin") {
    return client.call("browser.get_wordpress_admin", {
      tabId: numberArgument(args[1], "tabId"),
    });
  }
  if (command === "wp-row") {
    const tabId = numberArgument(args[1], "tabId");
    const admin = await client.call("browser.get_wordpress_admin", { tabId });
    if (!isRecord(admin)) throw new Error("WordPress admin result was invalid");
    return client.call("browser.wordpress_list_table_action", {
      tabId,
      documentId: admin["documentId"],
      domRevision: admin["domRevision"],
      operation: "open_row_action",
      rowId: args[2],
      actionKey: args[3],
      authorization: explicitAuthorization(),
    });
  }
  if (command === "wp-bulk") {
    const tabId = numberArgument(args[1], "tabId");
    const instructionIndex = args.indexOf("--instruction");
    const rowIds = args.slice(3, instructionIndex < 0 ? undefined : instructionIndex);
    if (rowIds.length === 0) throw new Error("wp-bulk requires at least one rowId");
    const admin = await client.call("browser.get_wordpress_admin", { tabId });
    if (!isRecord(admin)) throw new Error("WordPress admin result was invalid");
    return client.call("browser.wordpress_list_table_action", {
      tabId,
      documentId: admin["documentId"],
      domRevision: admin["domRevision"],
      operation: "apply_bulk",
      rowIds,
      actionKey: args[2],
      authorization: explicitAuthorization(),
    });
  }
  if (command === "wp-editor") {
    return client.call("browser.get_wordpress_editor", {
      tabId: numberArgument(args[1], "tabId"),
    });
  }
  if (command === "wp-edit") {
    if (!args.includes("--stdin")) {
      throw new Error("wp-edit reads the strict fields object from stdin; add --stdin");
    }
    const fields = await readStdinJson();
    if (!isRecord(fields)) throw new Error("wp-edit stdin must be a JSON object of editor fields");
    const tabId = numberArgument(args[1], "tabId");
    const editor = await client.call("browser.get_wordpress_editor", { tabId });
    if (!isRecord(editor)) throw new Error("WordPress editor result was invalid");
    return client.call("browser.edit_wordpress_editor", {
      tabId,
      documentId: editor["documentId"],
      domRevision: editor["domRevision"],
      fields,
      save: args.includes("--save"),
      authorization: explicitAuthorization(),
    });
  }
  if (command === "wp-save") {
    const tabId = numberArgument(args[1], "tabId");
    const editor = await client.call("browser.get_wordpress_editor", { tabId });
    if (!isRecord(editor)) throw new Error("WordPress editor result was invalid");
    return client.call("browser.edit_wordpress_editor", {
      tabId,
      documentId: editor["documentId"],
      domRevision: editor["domRevision"],
      fields: {},
      save: true,
      authorization: explicitAuthorization(),
    });
  }
  if (command === "beforeunload") {
    const decision = args[2];
    if (decision !== "leave" && decision !== "stay") {
      throw new Error("beforeunload requires decision leave or stay");
    }
    const urlIndex = args.indexOf("--url");
    const navigateUrl = urlIndex >= 0 ? args[urlIndex + 1] : undefined;
    if (urlIndex >= 0 && navigateUrl === undefined) {
      throw new Error("beforeunload --url requires a credential-free HTTP(S) destination");
    }
    return client.call("browser.handle_javascript_dialog", {
      tabId: numberArgument(args[1], "tabId"),
      accept: decision === "leave",
      trigger:
        navigateUrl === undefined ? { type: "none" } : { type: "navigate", url: navigateUrl },
      authorization: explicitAuthorization(),
    });
  }
  if (command === "close") {
    return client.call("browser.close_tab", {
      tabId: numberArgument(args[1], "tabId"),
      authorization: explicitAuthorization(),
    });
  }
  if (command === "screenshot") {
    const tabId = numberArgument(args[1], "tabId");
    const output = args[2]?.startsWith("--") === false ? args[2] : undefined;
    const regionIndex = args.indexOf("--region");
    if (regionIndex >= 0) {
      return screenshotToFile(
        {
          tabId,
          mode: "region",
          region: {
            ...screenshotRegion(args[regionIndex + 1]),
            coordinateSpace: args.includes("--document") ? "document" : "viewport",
          },
        },
        output,
      );
    }
    return screenshotToFile(
      { tabId, ...(args.includes("--full-page") ? { mode: "full_page" } : {}) },
      output,
    );
  }
  if (command === "screenshot-element") {
    const output = args[3]?.startsWith("--") === false ? args[3] : undefined;
    return screenshotElementToFile(numberArgument(args[1], "tabId"), args[2], output);
  }
  if (command === "tutorial-screenshot") {
    if (args[3] === undefined || args[3].length === 0) {
      throw new Error("tutorial-screenshot requires label text");
    }
    return screenshotElementToFile(numberArgument(args[1], "tabId"), args[2], args[4], args[3]);
  }
  if (command === "console") {
    const operation = args[2] ?? "read";
    if (!["start", "read", "clear", "stop"].includes(operation)) {
      throw new Error("console operation must be start, read, clear, or stop");
    }
    return client.call("browser.console", {
      tabId: numberArgument(args[1], "tabId"),
      operation,
      ...(operation === "read" && args.includes("--clear") ? { clear: true } : {}),
    });
  }
  if (command === "network") {
    const operation = args[2] ?? "read";
    if (!["start", "read", "clear", "stop"].includes(operation)) {
      throw new Error("network operation must be start, read, clear, or stop");
    }
    return client.call("browser.network", {
      tabId: numberArgument(args[1], "tabId"),
      operation,
      ...(operation === "read" && args.includes("--clear") ? { clear: true } : {}),
    });
  }
  if (command === "pdf") {
    const tabId = numberArgument(args[1], "tabId");
    const output = args[2]?.startsWith("--") === false ? args[2] : undefined;
    return savePdfResult(
      await client.call("browser.print_to_pdf", {
        tabId,
        landscape: args.includes("--landscape"),
        paperSize: args.includes("--legal") ? "legal" : args.includes("--letter") ? "letter" : "a4",
      }),
      output,
    );
  }
  if (command === "api") {
    const method = (args[3] ?? "GET").toUpperCase();
    if (!["GET", "POST", "PUT", "PATCH", "DELETE"].includes(method)) {
      throw new Error("api method must be GET, POST, PUT, PATCH, or DELETE");
    }
    const body = args.includes("--stdin") ? await readStdinJson() : undefined;
    return client.call("browser.page_api_request", {
      tabId: numberArgument(args[1], "tabId"),
      url: args[2],
      method,
      ...(body === undefined ? {} : { body }),
      responseMode: args.includes("--status-only")
        ? "status_only"
        : args.includes("--text")
          ? "text"
          : "json",
      useWordPressNonce: args.includes("--wp-nonce"),
      authorization: explicitAuthorization(),
    });
  }
  if (command === "mobile") {
    return client.call("browser.emulate_device", {
      operation: "set",
      tabId: numberArgument(args[1], "tabId"),
      preset: args[2] ?? "mobile_medium",
      orientation: args[3] ?? "portrait",
    });
  }
  if (command === "desktop") {
    return client.call("browser.emulate_device", {
      operation: "reset",
      tabId: numberArgument(args[1], "tabId"),
    });
  }
  if (command === "unlock") {
    const tabId = numberArgument(args[1], "tabId");
    const result = await client.call("browser.unlock_tab", { tabId });
    await state.removeTab(tabId);
    enhancedActions.clearTab(tabId);
    return result;
  }
  if (command === "call") {
    const parameters = args[2] === "--stdin" ? await readStdinJson() : jsonArgument(args[2]);
    if (!isRecord(parameters)) throw new Error("call parameters must be a JSON object");
    return enhancedCall(args[1] ?? "", {
      ...parameters,
      ...buildEnhancementArguments(args),
    });
  }
  if (command === "batch") {
    if (!args.includes("--stdin")) throw new Error("batch requires --stdin");
    return runBatch(await readStdinJson());
  }
  if (command === "close-session") {
    const result = await client.closeSession();
    await state.clear();
    enhancedActions.clear();
    return result;
  }
  throw new Error(`Unknown command: ${command}`);
};

try {
  process.stdout.write(`${JSON.stringify(await main(), null, pretty ? 2 : undefined)}\n`);
} catch (error) {
  const body = {
    ok: false,
    error: {
      code: error instanceof ControlError ? error.code : "CLI_ERROR",
      message: error instanceof Error ? error.message : String(error),
      retryable: error instanceof ControlError ? error.retryable : false,
      ...(error instanceof ControlError && error.details !== undefined
        ? { details: error.details }
        : {}),
    },
  };
  process.stderr.write(`${JSON.stringify(body, null, pretty ? 2 : undefined)}\n`);
  process.exitCode = 1;
}
