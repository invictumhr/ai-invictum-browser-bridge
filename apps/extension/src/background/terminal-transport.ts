import type { ChromeDebuggerLease } from "./debugger-session.js";

const MAX_CHANNELS = 16;
const MAX_SENT_CHARACTERS = 40_000;
const MAX_RECEIVED_CHARACTERS = 200_000;

interface TransportChannel {
  sentRaw: string;
  sentLogical: string;
  receivedLogical: string;
  receivedTotalCharacters: number;
  receivedTruncated: boolean;
}

export interface TerminalTransportRead {
  lines: string[];
  truncated: boolean;
}

export interface TerminalTransportCapture {
  findRequestIdForSentText: (text: string, timeoutMs?: number) => Promise<string | undefined>;
  receivedLength: (requestId: string) => number;
  readReceived: (
    requestId: string,
    offset: number,
    maxLines: number,
  ) => TerminalTransportRead | undefined;
  stop: () => void;
}

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const appendBounded = (
  current: string,
  addition: string,
  maximum: number,
  keepEnd: boolean,
): { value: string; truncated: boolean } => {
  const joined = current + addition;
  if (joined.length <= maximum) return { value: joined, truncated: false };
  return {
    value: keepEnd ? joined.slice(joined.length - maximum) : joined.slice(0, maximum),
    truncated: true,
  };
};

const decodeBinaryPayload = (payload: string): string => {
  try {
    const binary = globalThis.atob(payload);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return "";
  }
};

const decodeFramePayload = (payload: string, opcode: number): string =>
  opcode === 2 ? decodeBinaryPayload(payload) : payload;

const preferredPayloadKeys = new Set([
  "data",
  "payload",
  "text",
  "message",
  "input",
  "output",
  "stdout",
  "stderr",
  "content",
]);

const collectStrings = (value: unknown, output: string[], depth: number): void => {
  if (depth > 6 || output.length >= 256) return;
  if (typeof value === "string") {
    output.push(value);
    return;
  }
  if (Array.isArray(value)) {
    const start =
      value.length > 1 &&
      typeof value[0] === "string" &&
      /^(?:data|input|message|output|stderr|stdin|stdout|terminal)$/iu.test(value[0])
        ? 1
        : 0;
    for (const item of value.slice(start)) collectStrings(item, output, depth + 1);
    return;
  }
  if (!isRecord(value)) return;
  const preferred = Object.entries(value).filter(([key]) =>
    preferredPayloadKeys.has(key.toLocaleLowerCase()),
  );
  const entries = preferred.length > 0 ? preferred : Object.entries(value);
  for (const [, item] of entries) collectStrings(item, output, depth + 1);
};

const logicalPayload = (payload: string): string => {
  const trimmed = payload.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return payload;
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    const strings: string[] = [];
    collectStrings(parsed, strings, 0);
    return strings.length > 0 ? strings.join("") : payload;
  } catch {
    return payload;
  }
};

const normalizeTerminalStream = (value: string): string[] => {
  const plain = value
    // ANSI OSC and CSI sequences are matched by code point.
    // eslint-disable-next-line no-control-regex
    .replace(/\u001b\][^\u0007]*(?:\u0007|\u001b\\)/gu, "")
    // eslint-disable-next-line no-control-regex
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/gu, "")
    .replaceAll("\r\n", "\n");
  const lines = [""];
  for (const character of plain) {
    const index = lines.length - 1;
    if (character === "\n") {
      lines.push("");
    } else if (character === "\r") {
      lines[index] = "";
    } else if (character === "\b") {
      lines[index] = Array.from(lines[index] ?? "")
        .slice(0, -1)
        .join("");
    } else if (character === "\t" || (character.codePointAt(0) ?? 0) >= 0x20) {
      lines[index] = (lines[index] ?? "") + character;
    }
  }
  return lines;
};

const delay = async (milliseconds: number): Promise<void> =>
  new Promise((resolve) => globalThis.setTimeout(resolve, milliseconds));

export const startTerminalTransportCapture = async (
  tabId: number,
  lease: ChromeDebuggerLease,
): Promise<TerminalTransportCapture | undefined> => {
  if (chrome.debugger.onEvent?.addListener === undefined) return undefined;
  const channels = new Map<string, TransportChannel>();
  let active = true;

  const channelFor = (requestId: string): TransportChannel | undefined => {
    const existing = channels.get(requestId);
    if (existing !== undefined) return existing;
    if (channels.size >= MAX_CHANNELS) return undefined;
    const created: TransportChannel = {
      sentRaw: "",
      sentLogical: "",
      receivedLogical: "",
      receivedTotalCharacters: 0,
      receivedTruncated: false,
    };
    channels.set(requestId, created);
    return created;
  };

  const listener: Parameters<typeof chrome.debugger.onEvent.addListener>[0] = (
    source,
    method,
    rawParameters,
  ) => {
    if (!active || source.tabId !== tabId) return;
    if (method !== "Network.webSocketFrameSent" && method !== "Network.webSocketFrameReceived") {
      return;
    }
    const parameters = isRecord(rawParameters) ? rawParameters : {};
    const requestId = parameters["requestId"];
    const response = isRecord(parameters["response"]) ? parameters["response"] : {};
    const payload = response["payloadData"];
    const opcode = response["opcode"];
    if (
      typeof requestId !== "string" ||
      requestId.length === 0 ||
      requestId.length > 256 ||
      typeof payload !== "string" ||
      typeof opcode !== "number"
    ) {
      return;
    }
    const decoded = decodeFramePayload(payload, opcode);
    if (decoded.length === 0) return;
    const logical = logicalPayload(decoded);
    const channel = channelFor(requestId);
    if (channel === undefined) return;
    if (method === "Network.webSocketFrameSent") {
      channel.sentRaw = appendBounded(channel.sentRaw, decoded, MAX_SENT_CHARACTERS, false).value;
      channel.sentLogical = appendBounded(
        channel.sentLogical,
        logical,
        MAX_SENT_CHARACTERS,
        false,
      ).value;
    } else {
      channel.receivedTotalCharacters += logical.length;
      const appended = appendBounded(
        channel.receivedLogical,
        logical,
        MAX_RECEIVED_CHARACTERS,
        true,
      );
      channel.receivedLogical = appended.value;
      channel.receivedTruncated ||= appended.truncated;
    }
  };

  chrome.debugger.onEvent.addListener(listener);
  try {
    // Do not disable Network in stop(): another reference-counted IBB feature
    // may be using the same debugger target. Removing this listener is enough;
    // the final lease detach resets the domain when no other consumer remains.
    await lease.sendCommand("Network.enable", { maxPostDataSize: 0 });
  } catch {
    active = false;
    chrome.debugger.onEvent.removeListener(listener);
    return undefined;
  }

  const matchingRequestIds = (text: string): string[] =>
    [...channels.entries()]
      .filter(([, channel]) => channelCarriedDraft(channel.sentRaw, channel.sentLogical, text))
      .map(([requestId]) => requestId);

  return {
    findRequestIdForSentText: async (text, timeoutMs = 300) => {
      const deadline = Date.now() + Math.max(0, Math.min(1_000, timeoutMs));
      while (true) {
        const matches = matchingRequestIds(text);
        if (matches.length === 1) return matches[0];
        if (matches.length > 1 || Date.now() >= deadline) return undefined;
        await delay(20);
      }
    },
    receivedLength: (requestId) => channels.get(requestId)?.receivedTotalCharacters ?? 0,
    readReceived: (requestId, offset, maxLines) => {
      const channel = channels.get(requestId);
      if (channel === undefined) return undefined;
      const retainedStart = Math.max(
        0,
        channel.receivedTotalCharacters - channel.receivedLogical.length,
      );
      const relativeOffset = Math.max(
        0,
        Math.min(channel.receivedLogical.length, offset - retainedStart),
      );
      const text = channel.receivedLogical.slice(relativeOffset);
      if (text.length === 0) return undefined;
      const allLines = normalizeTerminalStream(text);
      return {
        lines: allLines.slice(-Math.max(1, Math.min(200, maxLines))),
        truncated: channel.receivedTruncated || allLines.length > maxLines,
      };
    },
    stop: () => {
      if (!active) return;
      active = false;
      chrome.debugger.onEvent.removeListener(listener);
      channels.clear();
    },
  };
};

/**
 * How much protocol noise may sit between the characters of a draft before the
 * match stops counting as evidence. WHM wraps each keystroke in its own frame,
 * so the concatenated stream carries envelope characters between the letters we
 * typed; a plain substring test therefore fails on exactly the drafts it should
 * confirm. The span limit keeps the relaxed test from matching text that merely
 * happens to contain the right letters somewhere far apart.
 */
const MAX_DRAFT_SPAN_FACTOR = 8;
const MIN_DRAFT_SPAN_ALLOWANCE = 64;

/**
 * True when every character of `draft` appears in `stream`, in order, inside a
 * bounded span. Stronger than "the letters are present somewhere" and weaker
 * than a contiguous substring, which is what per-keystroke framing breaks.
 */
export const containsDraftInOrder = (stream: string, draft: string): boolean => {
  if (draft.length === 0) return false;
  if (stream.includes(draft)) return true;
  const maxSpan = Math.max(MIN_DRAFT_SPAN_ALLOWANCE, draft.length * MAX_DRAFT_SPAN_FACTOR);
  for (let start = stream.indexOf(draft[0]!); start !== -1;) {
    let cursor = start;
    let matched = 0;
    while (cursor < stream.length && matched < draft.length) {
      if (stream[cursor] === draft[matched]) matched += 1;
      cursor += 1;
      if (cursor - start > maxSpan) break;
    }
    if (matched === draft.length) return true;
    start = stream.indexOf(draft[0]!, start + 1);
  }
  return false;
};

/** A channel carried the draft when either the raw or the decoded stream did. */
export const channelCarriedDraft = (sentRaw: string, sentLogical: string, draft: string): boolean =>
  containsDraftInOrder(sentRaw, draft) || containsDraftInOrder(sentLogical, draft);
