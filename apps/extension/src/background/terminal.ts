import {
  GetTerminalsDataSchema,
  TerminalInputDataSchema,
  TerminalReadDataSchema,
  IBP_ERROR_CODES,
  type GetTerminalsData,
  type GetTerminalsParameters,
  type ReadTerminalParameters,
  type TerminalInputData,
  type TerminalInputParameters,
  type TerminalReadData,
  type TerminalWaitCondition,
} from "@invictum/protocol";

import { ExtensionCommandError } from "./command-error.js";
import { debuggerSessions, type ChromeDebuggerLease } from "./debugger-session.js";
import { isChromePageAccessDenied, pageAccessDeniedMessage } from "./page-access.js";
import {
  startTerminalTransportCapture,
  type TerminalTransportCapture,
} from "./terminal-transport.js";

type ProbeMode = "detect" | "focus" | "guard_focus" | "verify_focus" | "release_focus" | "dom_read";

interface RawTerminalDescriptor {
  terminalId: string;
  engine: "xterm" | "dom";
  renderer: "canvas" | "dom" | "unknown";
  documentId: string;
  domRevision: number;
  index: number;
  focused: boolean;
  inputAvailable: boolean;
  screenshotRegion: {
    x: number;
    y: number;
    width: number;
    height: number;
    coordinateSpace: "document";
  } | null;
}

interface RawProbeResult {
  ok: boolean;
  reason?: string;
  origin?: string;
  documentId?: string;
  domRevision?: number;
  terminals?: RawTerminalDescriptor[];
  terminal?: RawTerminalDescriptor;
  lines?: string[];
}

interface RawBufferResult {
  ok: boolean;
  lines?: string[];
  buffer?: "normal" | "alternate" | "unknown";
  columns?: number | null;
  rows?: number | null;
  cursor?: { x: number; y: number } | null;
  totalLines?: number;
  truncated?: boolean;
}

interface TerminalTransportReadContext {
  capture: TerminalTransportCapture;
  requestId: string;
  receivedOffset: number;
}

interface SanitizedText {
  lines: string[];
  text: string;
  redactionsApplied: number;
  truncated: boolean;
}

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const boundedInteger = (value: unknown, minimum: number, maximum: number): number | undefined =>
  typeof value === "number" && Number.isInteger(value) && value >= minimum && value <= maximum
    ? value
    : undefined;

const terminalTextContainsDraft = (read: TerminalReadData, draft: string): boolean =>
  read.text.includes(draft) || read.lines.join("").includes(draft);

/**
 * Fixed, caller-independent isolated-world probe. It exposes only terminal
 * structure, focus state, and bounded accessibility text. It never evaluates
 * agent-supplied JavaScript and never returns field values or page storage.
 */
function terminalDomProbe(mode: ProbeMode, options: Readonly<Record<string, unknown>>): unknown {
  const globalRecord = globalThis as typeof globalThis & {
    __invictumTerminalProbeV2?: {
      documentId: string;
      domRevision: number;
      observer: MutationObserver;
      terminalIds: WeakMap<HTMLElement, string>;
      nextTerminalId: number;
      focusGuard?: {
        listener: EventListener;
        timeoutId: ReturnType<typeof globalThis.setTimeout>;
      };
    };
  };
  const createProbeId = (): string => {
    if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
    if (typeof crypto.getRandomValues === "function") {
      const bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
      bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
      const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    }
    return `invictum-terminal-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
  };
  let runtime = globalRecord.__invictumTerminalProbeV2;
  if (runtime === undefined) {
    runtime = {
      documentId: createProbeId(),
      domRevision: 0,
      observer: new MutationObserver((mutations) => {
        if (mutations.some((mutation) => mutation.type === "childList")) {
          globalRecord.__invictumTerminalProbeV2!.domRevision += 1;
        }
      }),
      terminalIds: new WeakMap(),
      nextTerminalId: 1,
    };
    runtime.observer.observe(document.documentElement, { childList: true, subtree: true });
    globalRecord.__invictumTerminalProbeV2 = runtime;
  }

  const releaseFocusGuard = (): void => {
    const guard = runtime?.focusGuard;
    if (guard === undefined) return;
    document.removeEventListener("focusin", guard.listener, true);
    globalThis.clearTimeout(guard.timeoutId);
    delete runtime!.focusGuard;
  };
  if (mode === "release_focus") {
    releaseFocusGuard();
    return {
      ok: true,
      documentId: runtime.documentId,
      domRevision: runtime.domRevision,
    } satisfies RawProbeResult;
  }

  const roots = [...document.querySelectorAll<HTMLElement>(".xterm")].slice(0, 32);
  const descriptors = roots.map((root, index): RawTerminalDescriptor => {
    let terminalId = runtime!.terminalIds.get(root);
    if (terminalId === undefined) {
      terminalId = `xterm-${runtime!.nextTerminalId}`;
      runtime!.nextTerminalId += 1;
      runtime!.terminalIds.set(root, terminalId);
    }
    const input = root.querySelector<HTMLTextAreaElement>(
      "textarea.xterm-helper-textarea, textarea[aria-label*='terminal' i]",
    );
    const canvasCount = root.querySelectorAll("canvas").length;
    const domRows = root.querySelector(".xterm-rows, .xterm-accessibility-tree");
    const rect = root.getBoundingClientRect();
    const screenshotRegion =
      rect.width > 0 && rect.height > 0
        ? {
            x: Math.min(100_000, Math.max(0, rect.left + scrollX)),
            y: Math.min(100_000, Math.max(0, rect.top + scrollY)),
            width: Math.min(100_000, rect.width),
            height: Math.min(100_000, rect.height),
            coordinateSpace: "document" as const,
          }
        : null;
    return {
      terminalId,
      engine: "xterm",
      renderer: canvasCount > 0 ? "canvas" : domRows !== null ? "dom" : "unknown",
      documentId: runtime!.documentId,
      domRevision: runtime!.domRevision,
      index,
      focused: input !== null && document.activeElement === input,
      inputAvailable: input !== null && !input.disabled && !input.readOnly,
      screenshotRegion,
    };
  });

  if (mode === "detect") {
    return {
      ok: true,
      origin: location.origin,
      documentId: runtime.documentId,
      domRevision: runtime.domRevision,
      terminals: descriptors,
    } satisfies RawProbeResult;
  }

  const documentId = typeof options["documentId"] === "string" ? options["documentId"] : "";
  const domRevision =
    typeof options["domRevision"] === "number" ? Math.trunc(options["domRevision"]) : -1;
  const terminalId = typeof options["terminalId"] === "string" ? options["terminalId"] : "";
  if (documentId !== runtime.documentId || domRevision > runtime.domRevision) {
    return { ok: false, reason: "stale" } satisfies RawProbeResult;
  }
  const descriptor = descriptors.find((candidate) => candidate.terminalId === terminalId);
  if (descriptor === undefined) {
    return { ok: false, reason: "missing" } satisfies RawProbeResult;
  }
  const root = roots[descriptor.index];
  if (root === undefined || !root.isConnected) {
    return { ok: false, reason: "missing" } satisfies RawProbeResult;
  }

  if (mode === "focus" || mode === "guard_focus" || mode === "verify_focus") {
    const input = root.querySelector<HTMLTextAreaElement>(
      "textarea.xterm-helper-textarea, textarea[aria-label*='terminal' i]",
    );
    if (input === null || input.disabled || input.readOnly) {
      return { ok: false, reason: "input_unavailable" } satisfies RawProbeResult;
    }
    if (mode === "guard_focus") {
      releaseFocusGuard();
      const listener: EventListener = (event) => {
        if (event.target !== input && input.isConnected && !input.disabled && !input.readOnly) {
          input.focus({ preventScroll: true });
        }
      };
      document.addEventListener("focusin", listener, true);
      const timeoutId = globalThis.setTimeout(releaseFocusGuard, 15_000);
      runtime.focusGuard = { listener, timeoutId };
    }
    if (mode !== "verify_focus") input.focus({ preventScroll: true });
    const focused = document.activeElement === input && root.contains(input) && input.isConnected;
    return {
      ok: focused,
      reason: focused ? undefined : mode === "verify_focus" ? "focus_lost" : "focus_failed",
      terminal: { ...descriptor, focused },
      documentId: runtime.documentId,
      domRevision: runtime.domRevision,
    } satisfies RawProbeResult;
  }

  const maxLines =
    typeof options["maxLines"] === "number"
      ? Math.max(1, Math.min(200, Math.trunc(options["maxLines"])))
      : 80;
  const candidates = [
    root.querySelector<HTMLElement>(".xterm-accessibility-tree"),
    root.querySelector<HTMLElement>(".xterm-rows"),
    root.querySelector<HTMLElement>("[role='log']"),
    root.querySelector<HTMLElement>("[aria-live]"),
  ].filter((candidate): candidate is HTMLElement => candidate !== null);
  const rawText =
    candidates.map((candidate) => candidate.innerText).find((text) => text.trim()) ?? "";
  return {
    ok: true,
    terminal: descriptor,
    documentId: runtime.documentId,
    domRevision: runtime.domRevision,
    lines: rawText.replaceAll("\r\n", "\n").split("\n").slice(-maxLines),
  } satisfies RawProbeResult;
}

const BUFFER_READER = `function(index, maxLines, includeScrollback) {
  const roots = Array.from(document.querySelectorAll('.xterm'));
  const root = roots[index];
  if (!root) return { ok: false };
  let terminal;
  for (let i = 0; i < this.length; i += 1) {
    const candidate = this[i];
    if (!candidate || typeof candidate !== 'object') continue;
    const candidateElement = candidate.element || (candidate._core && candidate._core.element);
    const candidateTextarea = candidate.textarea || (candidate._core && candidate._core.textarea);
    if (candidateElement === root || (candidateTextarea && root.contains(candidateTextarea))) {
      terminal = candidate;
      break;
    }
  }
  if (!terminal && this.length === 1 && roots.length === 1) terminal = this[0];
  if (!terminal) return { ok: false };

  const publicBuffer = terminal.buffer && terminal.buffer.active;
  const legacyBuffer = terminal.buffer && terminal.buffer.lines ? terminal.buffer :
    terminal._core && terminal._core.buffer && terminal._core.buffer.active &&
    (terminal._core.buffer.active.buffer || terminal._core.buffer.active);
  const buffer = publicBuffer || legacyBuffer;
  if (!buffer) return { ok: false };

  const linesStore = buffer.lines;
  const length = Number.isInteger(buffer.length) ? buffer.length :
    linesStore && Number.isInteger(linesStore.length) ? linesStore.length : 0;
  const rows = Number.isInteger(terminal.rows) ? terminal.rows :
    terminal._core && Number.isInteger(terminal._core.rows) ? terminal._core.rows : null;
  const columns = Number.isInteger(terminal.cols) ? terminal.cols :
    terminal._core && Number.isInteger(terminal._core.cols) ? terminal._core.cols : null;
  const viewportY = Number.isInteger(buffer.viewportY) ? buffer.viewportY :
    Number.isInteger(buffer.ydisp) ? buffer.ydisp : Math.max(0, length - (rows || maxLines));
  const visibleEnd = Math.min(length, viewportY + (rows || maxLines));
  const end = includeScrollback ? length : visibleEnd;
  const start = includeScrollback ? Math.max(0, end - maxLines) : Math.max(viewportY, end - maxLines);
  const lines = [];
  for (let lineIndex = start; lineIndex < end; lineIndex += 1) {
    const line = typeof buffer.getLine === 'function' ? buffer.getLine(lineIndex) :
      linesStore && typeof linesStore.get === 'function' ? linesStore.get(lineIndex) : undefined;
    if (!line) {
      lines.push('');
      continue;
    }
    let text = '';
    if (typeof line.translateToString === 'function') {
      text = line.translateToString(true);
    } else if (Array.isArray(line)) {
      text = line.map((cell) => Array.isArray(cell) ? String(cell[1] || '') : '').join('').trimEnd();
    }
    lines.push(String(text).slice(0, 4000));
  }
  const cursorX = Number.isInteger(buffer.cursorX) ? buffer.cursorX :
    Number.isInteger(buffer.x) ? buffer.x : null;
  const cursorY = Number.isInteger(buffer.cursorY) ? buffer.cursorY :
    Number.isInteger(buffer.y) ? buffer.y : null;
  const type = buffer.type === 'alternate' || buffer.type === 'normal' ? buffer.type :
    terminal.buffers && terminal.buffers.alt === buffer ? 'alternate' : 'normal';
  return {
    ok: true,
    lines,
    buffer: type,
    columns,
    rows,
    cursor: cursorX === null || cursorY === null ? null : { x: cursorX, y: cursorY },
    totalLines: length
  };
}`;

const terminalOrigin = async (tabId: number, purpose: string): Promise<string> => {
  const granted = await chrome.permissions.contains({ permissions: ["activeTab", "scripting"] });
  if (!granted) {
    throw new ExtensionCommandError(
      IBP_ERROR_CODES.PERMISSION_DENIED,
      "Terminal access requires activeTab and scripting permissions",
      false,
    );
  }
  const tab = await chrome.tabs.get(tabId);
  const rawUrl = tab.pendingUrl ?? tab.url;
  if (rawUrl === undefined) {
    throw new ExtensionCommandError(
      IBP_ERROR_CODES.RESTRICTED_PAGE,
      "The terminal tab has no accessible URL",
      false,
    );
  }
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error("restricted");
    return parsed.origin;
  } catch {
    throw new ExtensionCommandError(
      IBP_ERROR_CODES.RESTRICTED_PAGE,
      `Terminal ${purpose} is only available on normal HTTP(S) pages`,
      false,
    );
  }
};

const parseProbeResult = (value: unknown): RawProbeResult => {
  if (!isRecord(value) || typeof value["ok"] !== "boolean") {
    throw new ExtensionCommandError(
      IBP_ERROR_CODES.INVALID_MESSAGE,
      "The fixed terminal probe returned an invalid response",
      false,
    );
  }
  return value as unknown as RawProbeResult;
};

const injectionValue = (results: readonly chrome.scripting.InjectionResult<unknown>[]): unknown =>
  results.find((result) => result.frameId === 0)?.result ?? results[0]?.result;

const runProbe = async (
  tabId: number,
  mode: ProbeMode,
  options: Readonly<Record<string, unknown>> = {},
): Promise<RawProbeResult> => {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      world: "ISOLATED",
      func: terminalDomProbe,
      args: [mode, options],
    });
    return parseProbeResult(injectionValue(results));
  } catch (error) {
    if (error instanceof ExtensionCommandError) throw error;
    const tab = await chrome.tabs.get(tabId).catch(() => undefined);
    const rawUrl = tab?.pendingUrl ?? tab?.url;
    if (isChromePageAccessDenied(error)) {
      throw new ExtensionCommandError(
        IBP_ERROR_CODES.PERMISSION_DENIED,
        pageAccessDeniedMessage(tabId, rawUrl, "terminal access"),
        false,
      );
    }
    throw new ExtensionCommandError(
      IBP_ERROR_CODES.CONTENT_SCRIPT_UNAVAILABLE,
      "Chrome could not run the fixed terminal adapter on this page",
      true,
      { cause: error },
    );
  }
};

const assertReference = (probe: RawProbeResult): RawTerminalDescriptor => {
  if (!probe.ok) {
    const stale = probe.reason === "stale";
    throw new ExtensionCommandError(
      stale ? IBP_ERROR_CODES.STALE_ELEMENT_REFERENCE : IBP_ERROR_CODES.ELEMENT_NOT_INTERACTABLE,
      stale
        ? "The terminal reference is stale; detect terminals again"
        : "The requested terminal is no longer available",
      stale,
    );
  }
  if (probe.terminal === undefined) {
    throw new ExtensionCommandError(
      IBP_ERROR_CODES.ELEMENT_NOT_INTERACTABLE,
      "The fixed terminal adapter could not resolve the requested terminal",
      true,
    );
  }
  return probe.terminal;
};

const remoteObjectId = (value: unknown, field: "result" | "objects"): string | undefined => {
  if (!isRecord(value)) return undefined;
  const object = value[field];
  return isRecord(object) && typeof object["objectId"] === "string"
    ? object["objectId"]
    : undefined;
};

const remoteValue = (value: unknown): unknown => {
  if (!isRecord(value) || !isRecord(value["result"])) return undefined;
  return value["result"]["value"];
};

const parseRawBuffer = (value: unknown): RawBufferResult | undefined => {
  if (!isRecord(value) || value["ok"] !== true || !Array.isArray(value["lines"])) return undefined;
  const lines = value["lines"]
    .filter((line): line is string => typeof line === "string")
    .slice(0, 200);
  const rawCursor = value["cursor"];
  const cursor =
    isRecord(rawCursor) &&
    boundedInteger(rawCursor["x"], 0, 1_000) !== undefined &&
    boundedInteger(rawCursor["y"], 0, 1_000) !== undefined
      ? { x: rawCursor["x"] as number, y: rawCursor["y"] as number }
      : null;
  return {
    ok: true,
    lines,
    buffer:
      value["buffer"] === "normal" || value["buffer"] === "alternate" ? value["buffer"] : "unknown",
    columns: boundedInteger(value["columns"], 1, 1_000) ?? null,
    rows: boundedInteger(value["rows"], 1, 1_000) ?? null,
    cursor,
    totalLines: boundedInteger(value["totalLines"], 0, 1_000_000) ?? lines.length,
  };
};

const readXtermBuffer = async (
  lease: ChromeDebuggerLease,
  index: number,
  maxLines: number,
  includeScrollback: boolean,
): Promise<RawBufferResult | undefined> => {
  const objectGroup = `invictum-terminal-${crypto.randomUUID()}`;
  try {
    await lease.sendCommand("Runtime.enable");
    const prototype = await lease.sendCommand("Runtime.evaluate", {
      expression:
        "globalThis.Terminal && globalThis.Terminal.prototype ? globalThis.Terminal.prototype : undefined",
      objectGroup,
      silent: true,
      returnByValue: false,
    });
    const prototypeId = remoteObjectId(prototype, "result");
    if (prototypeId === undefined) return undefined;
    const queried = await lease.sendCommand("Runtime.queryObjects", {
      prototypeObjectId: prototypeId,
      objectGroup,
    });
    const objectsId = remoteObjectId(queried, "objects");
    if (objectsId === undefined) return undefined;
    const called = await lease.sendCommand("Runtime.callFunctionOn", {
      objectId: objectsId,
      functionDeclaration: BUFFER_READER,
      arguments: [{ value: index }, { value: maxLines }, { value: includeScrollback }],
      returnByValue: true,
      silent: true,
      objectGroup,
    });
    return parseRawBuffer(remoteValue(called));
  } catch {
    return undefined;
  } finally {
    await lease.sendCommand("Runtime.releaseObjectGroup", { objectGroup }).catch(() => undefined);
  }
};

const redactTerminalText = (rawLines: readonly string[], maxLines: number): SanitizedText => {
  let joined = rawLines
    .slice(-maxLines)
    .join("\n")
    // ANSI OSC and CSI control sequences are intentionally matched by code point.
    // eslint-disable-next-line no-control-regex
    .replace(/\u001b\][^\u0007]*(?:\u0007|\u001b\\)/gu, "")
    // eslint-disable-next-line no-control-regex
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/gu, "")
    .replaceAll("\u0000", "");
  let redactionsApplied = 0;
  const replace = (pattern: RegExp, replacement: string): void => {
    joined = joined.replace(pattern, (...args: unknown[]) => {
      redactionsApplied += 1;
      return replacement.replace("$1", typeof args[1] === "string" ? args[1] : "");
    });
  };
  replace(
    /-----BEGIN [^-\n]*(?:PRIVATE KEY|OPENSSH PRIVATE KEY)-----[\s\S]*?-----END [^-\n]*(?:PRIVATE KEY|OPENSSH PRIVATE KEY)-----/giu,
    "[REDACTED PRIVATE KEY]",
  );
  replace(/\b(Bearer\s+)[A-Za-z0-9._~+/=-]{12,}/giu, "$1[REDACTED]");
  replace(/\b(authorization\s*[:=]\s*)[^\s]+/giu, "$1[REDACTED]");
  replace(/\b(password|passwd|secret|token|api[_-]?key)(\s*[:=]\s*)[^\s]+/giu, "$1=[REDACTED]");
  replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/gu, "[REDACTED JWT]");
  replace(/\bcpsess\d+\b/giu, "cpsess[REDACTED]");
  const characterLimit = 100_000;
  const truncated = joined.length > characterLimit || rawLines.length > maxLines;
  if (joined.length > characterLimit) joined = joined.slice(joined.length - characterLimit);
  const lines = joined
    .split("\n")
    .slice(-maxLines)
    .map((line) => line.slice(0, 4_000));
  return { lines, text: lines.join("\n"), redactionsApplied, truncated };
};

const conditionMatches = (
  condition: TerminalWaitCondition | undefined,
  current: TerminalReadData,
  priorText: string,
  stableSince: number,
): { matched: boolean; stableSince: number } => {
  if (condition === undefined) return { matched: true, stableSince };
  if (condition.type === "prompt") {
    return { matched: /(?:^|\n)[^\n]{0,256}[#$>%]\s*$/u.test(current.text), stableSince };
  }
  if (condition.type === "text") {
    const haystack = condition.caseSensitive ? current.text : current.text.toLocaleLowerCase();
    const needle = condition.caseSensitive ? condition.value : condition.value.toLocaleLowerCase();
    return {
      matched: condition.match === "exact" ? haystack === needle : haystack.includes(needle),
      stableSince,
    };
  }
  const nextStableSince = current.text === priorText ? stableSince : Date.now();
  return {
    matched: Date.now() - nextStableSince >= condition.stableMs,
    stableSince: nextStableSince,
  };
};

const sleep = async (milliseconds: number): Promise<void> =>
  new Promise((resolve) => globalThis.setTimeout(resolve, milliseconds));

const terminalReferenceOptions = (
  terminal: Pick<RawTerminalDescriptor, "documentId" | "domRevision" | "terminalId">,
): Readonly<Record<string, unknown>> => ({
  documentId: terminal.documentId,
  domRevision: terminal.domRevision,
  terminalId: terminal.terminalId,
});

const assertFocusedTerminal = (probe: RawProbeResult): RawTerminalDescriptor => {
  if (!probe.ok && (probe.reason === "focus_failed" || probe.reason === "focus_lost")) {
    throw new ExtensionCommandError(
      IBP_ERROR_CODES.TERMINAL_FOCUS_LOST,
      "The selected terminal lost focus before trusted input; no further keys were sent",
      false,
    );
  }
  const terminal = assertReference(probe);
  if (!terminal.focused) {
    throw new ExtensionCommandError(
      IBP_ERROR_CODES.TERMINAL_FOCUS_LOST,
      "The selected terminal is not the active input target; no further keys were sent",
      false,
    );
  }
  return terminal;
};

const focusAndVerifyTerminal = async (
  tabId: number,
  terminal: RawTerminalDescriptor,
  guarded = false,
): Promise<RawTerminalDescriptor> => {
  const focused = assertFocusedTerminal(
    await runProbe(tabId, guarded ? "guard_focus" : "focus", terminalReferenceOptions(terminal)),
  );
  // Give synchronous focus handlers and zero-delay focus traps (such as WHM's
  // global tool search) a chance to run, then fail closed if they stole focus.
  await sleep(0);
  return assertFocusedTerminal(
    await runProbe(tabId, "verify_focus", terminalReferenceOptions(focused)),
  );
};

const verifyTerminalFocus = async (
  tabId: number,
  terminal: RawTerminalDescriptor,
): Promise<RawTerminalDescriptor> =>
  assertFocusedTerminal(await runProbe(tabId, "verify_focus", terminalReferenceOptions(terminal)));

const releaseTerminalFocus = async (tabId: number): Promise<void> => {
  await runProbe(tabId, "release_focus").catch(() => undefined);
};

/** CDP modifier mask: Alt 1, Ctrl 2, Meta 4, Shift 8. */
const CTRL_MODIFIER = 2;

const keyDefinition = (
  key: TerminalInputParameters["input"] extends infer T
    ? T extends { type: "key"; key: infer K }
      ? K
      : never
    : never,
): { key: string; code: string; virtualKeyCode: number } => {
  const named: Record<string, { code: string; virtualKeyCode: number }> = {
    Enter: { code: "Enter", virtualKeyCode: 13 },
    Tab: { code: "Tab", virtualKeyCode: 9 },
    Escape: { code: "Escape", virtualKeyCode: 27 },
    Backspace: { code: "Backspace", virtualKeyCode: 8 },
    Delete: { code: "Delete", virtualKeyCode: 46 },
    ArrowUp: { code: "ArrowUp", virtualKeyCode: 38 },
    ArrowDown: { code: "ArrowDown", virtualKeyCode: 40 },
    ArrowLeft: { code: "ArrowLeft", virtualKeyCode: 37 },
    ArrowRight: { code: "ArrowRight", virtualKeyCode: 39 },
    Home: { code: "Home", virtualKeyCode: 36 },
    End: { code: "End", virtualKeyCode: 35 },
    PageUp: { code: "PageUp", virtualKeyCode: 33 },
    PageDown: { code: "PageDown", virtualKeyCode: 34 },
    Insert: { code: "Insert", virtualKeyCode: 45 },
  };
  if (/^F(?:[1-9]|1[0-2])$/u.test(key)) {
    const number = Number(key.slice(1));
    return { key, code: key, virtualKeyCode: 111 + number };
  }
  if (/^[a-z]$/u.test(key)) {
    return {
      key,
      code: `Key${key.toUpperCase()}`,
      virtualKeyCode: key.toUpperCase().charCodeAt(0),
    };
  }
  const entry = named[key];
  return { key, code: entry?.code ?? key, virtualKeyCode: entry?.virtualKeyCode ?? 0 };
};

const dispatchKey = async (
  lease: ChromeDebuggerLease,
  definition: { key: string; code: string; virtualKeyCode: number },
  modifiers = 0,
  text?: string,
): Promise<void> => {
  await lease.sendCommand("Input.dispatchKeyEvent", {
    type: text === undefined ? "rawKeyDown" : "keyDown",
    key: definition.key,
    code: definition.code,
    windowsVirtualKeyCode: definition.virtualKeyCode,
    nativeVirtualKeyCode: definition.virtualKeyCode,
    modifiers,
    ...(text === undefined ? {} : { text, unmodifiedText: text }),
  });
  await lease.sendCommand("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: definition.key,
    code: definition.code,
    windowsVirtualKeyCode: definition.virtualKeyCode,
    nativeVirtualKeyCode: definition.virtualKeyCode,
    modifiers,
  });
};

const dispatchTerminalText = async (lease: ChromeDebuggerLease, text: string): Promise<void> => {
  for (const character of text) {
    await lease.sendCommand("Input.dispatchKeyEvent", {
      type: "char",
      text: character,
      unmodifiedText: character,
    });
  }
};

export class ChromeTerminalAdapter {
  public async getTerminals(parameters: GetTerminalsParameters): Promise<GetTerminalsData> {
    const origin = await terminalOrigin(parameters.tabId, "detection");
    const probe = await runProbe(parameters.tabId, "detect");
    if (!probe.ok || probe.documentId === undefined || probe.domRevision === undefined) {
      throw new ExtensionCommandError(
        IBP_ERROR_CODES.BROWSER_API_ERROR,
        "Chrome could not detect terminal widgets on this page",
        true,
      );
    }
    const debuggerPermission = await chrome.permissions.contains({ permissions: ["debugger"] });
    const terminals = (probe.terminals ?? []).map((terminal) => ({
      ...terminal,
      trustedInputAvailable: debuggerPermission && terminal.inputAvailable,
      bufferReadbackAvailable: debuggerPermission && terminal.engine === "xterm",
      columns: null,
      rows: null,
    }));
    return GetTerminalsDataSchema.parse({
      tabId: parameters.tabId,
      origin,
      documentId: probe.documentId,
      domRevision: probe.domRevision,
      terminals,
      count: terminals.length,
    });
  }

  public async readTerminal(parameters: ReadTerminalParameters): Promise<TerminalReadData> {
    const origin = await terminalOrigin(parameters.tabId, "readback");
    const debuggerPermission = await chrome.permissions.contains({ permissions: ["debugger"] });
    if (!debuggerPermission) {
      throw new ExtensionCommandError(
        IBP_ERROR_CODES.PERMISSION_DENIED,
        "Terminal buffer readback requires the Chrome debugger permission",
        false,
      );
    }
    const initial = assertReference(
      await runProbe(parameters.tabId, "dom_read", {
        documentId: parameters.documentId,
        domRevision: parameters.domRevision,
        terminalId: parameters.terminalId,
        maxLines: parameters.maxLines,
      }),
    );
    const currentParameters: ReadTerminalParameters = {
      ...parameters,
      documentId: initial.documentId,
      domRevision: initial.domRevision,
      terminalId: initial.terminalId,
    };
    let lease: ChromeDebuggerLease | undefined;
    try {
      lease = await debuggerSessions.acquire(parameters.tabId);
      return await this.#waitForRead(currentParameters, origin, initial.index, lease);
    } catch (error) {
      if (error instanceof ExtensionCommandError) throw error;
      throw new ExtensionCommandError(
        IBP_ERROR_CODES.BROWSER_API_ERROR,
        "Chrome could not read the terminal buffer; close visible DevTools for this tab and retry",
        true,
        { cause: error },
      );
    } finally {
      await lease?.release();
    }
  }

  async #waitForRead(
    parameters: ReadTerminalParameters,
    origin: string,
    terminalIndex: number,
    lease: ChromeDebuggerLease,
    initialText?: string,
    requireChange = false,
    transport?: TerminalTransportReadContext,
  ): Promise<TerminalReadData> {
    let priorText = initialText ?? "";
    let stableSince = Date.now();
    let changed = !requireChange;
    const deadline = Date.now() + parameters.timeoutMs;
    while (true) {
      const data = await this.#readOnce(
        parameters,
        origin,
        terminalIndex,
        lease,
        parameters.maxLines,
        parameters.includeScrollback,
        transport,
      );
      if (initialText === undefined || data.text !== initialText) changed = true;
      const condition = conditionMatches(parameters.waitFor, data, priorText, stableSince);
      stableSince = condition.stableSince;
      if (changed && condition.matched) {
        return TerminalReadDataSchema.parse({ ...data, matched: true });
      }
      if (Date.now() >= deadline) {
        return TerminalReadDataSchema.parse({ ...data, matched: false, timedOut: true });
      }
      priorText = data.text;
      await sleep(parameters.pollIntervalMs);
    }
  }

  async #readOnce(
    parameters: ReadTerminalParameters,
    origin: string,
    terminalIndex: number,
    lease: ChromeDebuggerLease,
    maxLines: number,
    includeScrollback: boolean,
    transport?: TerminalTransportReadContext,
  ): Promise<TerminalReadData> {
    const rawBuffer = await readXtermBuffer(lease, terminalIndex, maxLines, includeScrollback);
    let source: TerminalReadData["source"] = "unavailable";
    let rawLines: string[] = [];
    let buffer: TerminalReadData["buffer"] = "unknown";
    let columns: number | null = null;
    let rows: number | null = null;
    let cursor: { x: number; y: number } | null = null;
    let totalLines = 0;
    if (rawBuffer !== undefined) {
      source = "xterm_buffer";
      rawLines = rawBuffer.lines ?? [];
      buffer = rawBuffer.buffer ?? "unknown";
      columns = rawBuffer.columns ?? null;
      rows = rawBuffer.rows ?? null;
      cursor = rawBuffer.cursor ?? null;
      totalLines = rawBuffer.totalLines ?? rawLines.length;
    } else {
      const dom = await runProbe(parameters.tabId, "dom_read", {
        documentId: parameters.documentId,
        domRevision: parameters.domRevision,
        terminalId: parameters.terminalId,
        maxLines,
      });
      assertReference(dom);
      rawLines = dom.lines ?? [];
      if (rawLines.some((line) => line.trim().length > 0)) source = "accessibility_dom";
      totalLines = rawLines.length;
      if (source === "unavailable" && transport !== undefined) {
        const streamed = transport.capture.readReceived(
          transport.requestId,
          transport.receivedOffset,
          maxLines,
        );
        if (streamed !== undefined && streamed.lines.some((line) => line.length > 0)) {
          source = "websocket_stream";
          rawLines = streamed.lines;
          totalLines = rawLines.length;
          if (streamed.truncated) totalLines = Math.max(totalLines, maxLines + 1);
        }
      }
    }
    const sanitized = redactTerminalText(rawLines, maxLines);
    return TerminalReadDataSchema.parse({
      tabId: parameters.tabId,
      origin,
      documentId: parameters.documentId,
      domRevision: parameters.domRevision,
      terminalId: parameters.terminalId,
      source,
      buffer,
      columns,
      rows,
      cursor,
      lines: sanitized.lines,
      text: sanitized.text,
      lineCount: sanitized.lines.length,
      truncated: sanitized.truncated || totalLines > sanitized.lines.length,
      redactionsApplied: sanitized.redactionsApplied,
      matched: parameters.waitFor === undefined,
      timedOut: false,
    });
  }

  public async input(parameters: TerminalInputParameters): Promise<TerminalInputData> {
    const origin = await terminalOrigin(parameters.tabId, "input");
    const debuggerPermission = await chrome.permissions.contains({ permissions: ["debugger"] });
    if (!debuggerPermission) {
      throw new ExtensionCommandError(
        IBP_ERROR_CODES.PERMISSION_DENIED,
        "Trusted terminal input requires the Chrome debugger permission",
        false,
      );
    }
    let terminal = assertReference(
      await runProbe(parameters.tabId, "dom_read", {
        documentId: parameters.documentId,
        domRevision: parameters.domRevision,
        terminalId: parameters.terminalId,
        maxLines: 1,
      }),
    );
    let lease: ChromeDebuggerLease | undefined;
    let transport: TerminalTransportCapture | undefined;
    let focusEmulationEnabled = false;
    let output: TerminalReadData | undefined;
    let draftVerification: TerminalInputData["draftVerification"] =
      parameters.input.type === "text" ? "unavailable" : "not_applicable";
    let transportRead: TerminalTransportReadContext | undefined;
    try {
      lease = await debuggerSessions.acquire(parameters.tabId);
      transport = await startTerminalTransportCapture(parameters.tabId, lease);
      try {
        await lease.sendCommand("Emulation.setFocusEmulationEnabled", { enabled: true });
        focusEmulationEnabled = true;
      } catch {
        // Older Chromium builds may not expose the experimental command. Keep
        // the existing trusted-input path and let delivery verification report
        // whether the background target actually accepted the input.
      }
      // Focus only after focus emulation is configured. WHM can restore its
      // global search focus while background focus state is changing.
      terminal = await focusAndVerifyTerminal(parameters.tabId, terminal);
      const submitted =
        (parameters.input.type === "text" && parameters.input.submit) ||
        (parameters.input.type === "key" && parameters.input.key === "Enter");
      const waitFor: TerminalWaitCondition | undefined =
        parameters.waitFor ??
        (submitted
          ? { type: "prompt" }
          : parameters.input.type === "text"
            ? { type: "quiet", stableMs: 200 }
            : undefined);
      const readParameters: ReadTerminalParameters = {
        tabId: parameters.tabId,
        documentId: terminal.documentId,
        domRevision: terminal.domRevision,
        terminalId: terminal.terminalId,
        maxLines: parameters.maxOutputLines,
        includeScrollback: false,
        ...(waitFor === undefined ? {} : { waitFor }),
        timeoutMs: parameters.timeoutMs,
        pollIntervalMs: parameters.pollIntervalMs,
        authorization: parameters.authorization,
      };
      const baseline = await this.#readOnce(
        readParameters,
        origin,
        terminal.index,
        lease,
        parameters.maxOutputLines,
        false,
      );
      if (parameters.input.type === "text") {
        // Buffer reads and page callbacks can yield long enough for a focus
        // trap to run. Guard only the actual key-delivery window.
        try {
          terminal = await focusAndVerifyTerminal(parameters.tabId, terminal, true);
          await dispatchTerminalText(lease, parameters.input.text);
          terminal = await verifyTerminalFocus(parameters.tabId, terminal);
        } finally {
          await releaseTerminalFocus(parameters.tabId);
        }

        // Verify the staged draft independently of focus. Prefer the native
        // xterm/accessibility readback; otherwise require one unambiguous
        // WebSocket channel whose sent terminal data contains the exact draft.
        const staged = await this.#readOnce(
          readParameters,
          origin,
          terminal.index,
          lease,
          parameters.maxOutputLines,
          false,
        );
        let transportRequestId: string | undefined;
        if (
          staged.source !== "unavailable" &&
          terminalTextContainsDraft(staged, parameters.input.text)
        ) {
          draftVerification = "buffer_observed";
        } else {
          transportRequestId = await transport?.findRequestIdForSentText(parameters.input.text);
          if (transportRequestId !== undefined) draftVerification = "transport_observed";
        }

        if (parameters.input.submit && draftVerification === "unavailable") {
          // The draft is already typed at this point. Leaving it on the line is
          // not neutral: the next command is appended to it, so an unverified
          // `nproc` followed by `free -m` runs as `nprocfree -m`. Clear the line
          // with Ctrl+U before failing so the staged text cannot merge into a
          // later command. Ctrl+U only discards input; it submits nothing.
          const cleared = await dispatchKey(lease, keyDefinition("u"), CTRL_MODIFIER)
            .then(() => true)
            .catch(() => false);
          throw new ExtensionCommandError(
            IBP_ERROR_CODES.TERMINAL_DELIVERY_UNVERIFIED,
            cleared
              ? "The terminal draft could not be verified in xterm or its WebSocket transport; Enter was not sent and the staged line was cleared. Retype the command rather than sending a bare Enter"
              : "The terminal draft could not be verified in xterm or its WebSocket transport; Enter was not sent and the staged line could NOT be cleared. Inspect a bounded terminal screenshot: the draft may still be on the line and would merge with the next command",
            false,
          );
        }

        if (parameters.input.submit) {
          if (transportRequestId !== undefined) {
            transportRead = {
              capture: transport!,
              requestId: transportRequestId,
              receivedOffset: transport!.receivedLength(transportRequestId),
            };
          }
          // Delivery verification can yield long enough for page focus to
          // move. Reacquire the guarded xterm target immediately before the
          // single authorized Enter.
          try {
            terminal = await focusAndVerifyTerminal(parameters.tabId, terminal, true);
            await dispatchKey(lease, keyDefinition("Enter"));
          } finally {
            await releaseTerminalFocus(parameters.tabId);
          }
        }
      } else {
        try {
          terminal = await focusAndVerifyTerminal(parameters.tabId, terminal, true);
          const modifiers =
            (parameters.input.alt ? 1 : 0) |
            (parameters.input.ctrl ? CTRL_MODIFIER : 0) |
            (parameters.input.meta ? 4 : 0) |
            (parameters.input.shift ? 8 : 0);
          await dispatchKey(lease, keyDefinition(parameters.input.key), modifiers);
        } finally {
          await releaseTerminalFocus(parameters.tabId);
        }
      }
      if (
        parameters.waitFor === undefined &&
        waitFor !== undefined &&
        baseline.source === "unavailable" &&
        transportRead === undefined &&
        draftVerification !== "buffer_observed"
      ) {
        const immediate = await this.#readOnce(
          readParameters,
          origin,
          terminal.index,
          lease,
          parameters.maxOutputLines,
          false,
        );
        output = TerminalReadDataSchema.parse({
          ...immediate,
          matched: false,
          timedOut: false,
        });
      } else {
        output = await this.#waitForRead(
          readParameters,
          origin,
          terminal.index,
          lease,
          baseline.text,
          waitFor !== undefined,
          transportRead,
        );
      }
    } catch (error) {
      if (error instanceof ExtensionCommandError) throw error;
      throw new ExtensionCommandError(
        IBP_ERROR_CODES.BROWSER_API_ERROR,
        "Trusted terminal input failed; do not retry automatically because delivery may be uncertain",
        false,
        { cause: error },
      );
    } finally {
      await releaseTerminalFocus(parameters.tabId);
      transport?.stop();
      if (focusEmulationEnabled) {
        await lease
          ?.sendCommand("Emulation.setFocusEmulationEnabled", { enabled: false })
          .catch(() => undefined);
      }
      await lease?.release();
    }

    const submitted =
      (parameters.input.type === "text" && parameters.input.submit) ||
      (parameters.input.type === "key" && parameters.input.key === "Enter");
    const waitedForOutput =
      parameters.waitFor !== undefined || submitted || parameters.input.type === "text";
    if (output === undefined) {
      throw new ExtensionCommandError(
        IBP_ERROR_CODES.BROWSER_API_ERROR,
        "Trusted terminal input completed without a readable terminal result",
        false,
      );
    }
    return TerminalInputDataSchema.parse({
      tabId: parameters.tabId,
      documentId: terminal.documentId,
      domRevision: terminal.domRevision,
      terminalId: terminal.terminalId,
      inputType: parameters.input.type,
      characters: parameters.input.type === "text" ? Array.from(parameters.input.text).length : 0,
      submitted,
      key: parameters.input.type === "key" ? parameters.input.key : null,
      trustedInput: true,
      tabActivated: false,
      draftVerification,
      deliveryVerification: !waitedForOutput
        ? "not_requested"
        : output.source === "unavailable"
          ? draftVerification === "transport_observed"
            ? "transport_observed"
            : "unavailable"
          : output.timedOut
            ? "timed_out"
            : "observed",
      output,
    });
  }
}
