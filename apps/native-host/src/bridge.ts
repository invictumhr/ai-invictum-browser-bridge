import type { Readable, Writable } from "node:stream";

import { parseIbpEnvelope } from "@invictum/protocol";
import WebSocket, { type RawData } from "ws";

import {
  DEFAULT_MAX_NATIVE_MESSAGE_BYTES,
  encodeNativeMessage,
  NativeMessageDecoder,
} from "./framing.js";

export interface NativeHostLogger {
  error: (event: string, error: unknown) => void;
  info: (event: string, fields?: Readonly<Record<string, unknown>>) => void;
  warn: (event: string, fields?: Readonly<Record<string, unknown>>) => void;
}

export interface NativeHostBridgeOptions {
  input: Readable;
  output: Writable;
  desktopUrl: string;
  logger: NativeHostLogger;
  maxMessageBytes?: number;
  maxQueuedMessages?: number;
  reconnectInitialDelayMs?: number;
  reconnectMaxDelayMs?: number;
  heartbeatMs?: number;
}

const socketDataToString = (data: RawData): string => {
  if (Buffer.isBuffer(data)) {
    return data.toString("utf8");
  }
  if (Array.isArray(data)) {
    return Buffer.concat(data).toString("utf8");
  }
  return Buffer.from(data).toString("utf8");
};

export class NativeHostBridge {
  readonly #decoder: NativeMessageDecoder;
  readonly #queue: string[] = [];
  readonly #maxMessageBytes: number;
  readonly #maxQueuedMessages: number;
  readonly #reconnectInitialDelayMs: number;
  readonly #reconnectMaxDelayMs: number;
  readonly #heartbeatMs: number;
  #socket: WebSocket | undefined;
  #reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  #heartbeatTimer: ReturnType<typeof setInterval> | undefined;
  #reconnectAttempts = 0;
  #started = false;
  #receivedPong = true;

  public constructor(private readonly options: NativeHostBridgeOptions) {
    this.#maxMessageBytes = options.maxMessageBytes ?? DEFAULT_MAX_NATIVE_MESSAGE_BYTES;
    this.#maxQueuedMessages = options.maxQueuedMessages ?? 100;
    this.#reconnectInitialDelayMs = options.reconnectInitialDelayMs ?? 250;
    this.#reconnectMaxDelayMs = options.reconnectMaxDelayMs ?? 10_000;
    this.#heartbeatMs = options.heartbeatMs ?? 15_000;
    this.#decoder = new NativeMessageDecoder(this.#maxMessageBytes);
  }

  public start(): void {
    if (this.#started) {
      return;
    }

    this.#started = true;
    this.options.input.on("data", this.#handleNativeData);
    this.options.input.once("end", this.#handleNativeEnd);
    this.options.input.once("error", this.#handleNativeError);
    this.#connect();
  }

  public stop(): void {
    if (!this.#started) {
      return;
    }

    this.#started = false;
    this.options.input.off("data", this.#handleNativeData);
    this.options.input.off("end", this.#handleNativeEnd);
    this.options.input.off("error", this.#handleNativeError);
    this.#clearTimers();
    const socket = this.#socket;
    this.#socket = undefined;
    if (socket !== undefined) {
      if (socket.readyState === WebSocket.OPEN) {
        socket.close(1000, "Native host shutting down");
      } else if (socket.readyState === WebSocket.CONNECTING) {
        // ws emits an error when a connecting socket is terminated. Keep a
        // no-op listener so a graceful shutdown never becomes an uncaught error.
        socket.removeAllListeners();
        socket.once("error", () => undefined);
        socket.terminate();
      }
    }
    this.#queue.length = 0;
    this.#decoder.reset();
  }

  public get connected(): boolean {
    return this.#socket?.readyState === WebSocket.OPEN;
  }

  readonly #handleNativeData = (chunk: Buffer): void => {
    try {
      for (const message of this.#decoder.push(chunk)) {
        const envelope = parseIbpEnvelope(message);
        this.#sendOrQueue(JSON.stringify(envelope));
      }
    } catch (error) {
      this.options.logger.error("native_message_rejected", error);
    }
  };

  readonly #handleNativeEnd = (): void => {
    this.options.logger.info("native_input_closed");
    this.stop();
  };

  readonly #handleNativeError = (error: Error): void => {
    this.options.logger.error("native_input_error", error);
    this.stop();
  };

  #connect(): void {
    if (!this.#started || this.#socket !== undefined) {
      return;
    }

    const socket = new WebSocket(this.options.desktopUrl, {
      maxPayload: this.#maxMessageBytes,
    });
    this.#socket = socket;

    socket.once("open", () => {
      if (this.#socket !== socket) {
        return;
      }
      this.#reconnectAttempts = 0;
      this.#receivedPong = true;
      this.options.logger.info("desktop_connected", { transport: "local_websocket" });
      this.#flushQueue();
      this.#startHeartbeat(socket);
    });

    socket.on("message", (data, isBinary) => {
      if (isBinary) {
        this.options.logger.warn("desktop_binary_message_rejected");
        return;
      }

      try {
        const text = socketDataToString(data);
        if (Buffer.byteLength(text, "utf8") > this.#maxMessageBytes) {
          throw new Error("Desktop message exceeds configured maximum");
        }
        const envelope = parseIbpEnvelope(JSON.parse(text) as unknown);
        this.options.output.write(encodeNativeMessage(envelope, this.#maxMessageBytes));
      } catch (error) {
        this.options.logger.error("desktop_message_rejected", error);
      }
    });

    socket.on("pong", () => {
      this.#receivedPong = true;
    });

    socket.once("close", (code, reason) => {
      if (this.#socket !== socket) {
        return;
      }
      this.#socket = undefined;
      this.#clearHeartbeat();
      this.options.logger.warn("desktop_disconnected", {
        code,
        reason: reason.toString("utf8").slice(0, 200),
      });
      this.#scheduleReconnect();
    });

    socket.once("error", (error) => {
      this.options.logger.error("desktop_connection_error", error);
    });
  }

  #sendOrQueue(serializedEnvelope: string): void {
    if (this.#socket?.readyState === WebSocket.OPEN) {
      this.#socket.send(serializedEnvelope);
      return;
    }

    if (this.#queue.length >= this.#maxQueuedMessages) {
      this.#queue.shift();
      this.options.logger.warn("desktop_queue_overflow", {
        maximum: this.#maxQueuedMessages,
      });
    }
    this.#queue.push(serializedEnvelope);
  }

  #flushQueue(): void {
    const socket = this.#socket;
    if (socket?.readyState !== WebSocket.OPEN) {
      return;
    }

    for (const envelope of this.#queue.splice(0)) {
      socket.send(envelope);
    }
  }

  #scheduleReconnect(): void {
    if (!this.#started || this.#reconnectTimer !== undefined) {
      return;
    }

    const delay = Math.min(
      this.#reconnectInitialDelayMs * 2 ** this.#reconnectAttempts,
      this.#reconnectMaxDelayMs,
    );
    this.#reconnectAttempts += 1;
    this.#reconnectTimer = setTimeout(() => {
      this.#reconnectTimer = undefined;
      this.#connect();
    }, delay);
  }

  #startHeartbeat(socket: WebSocket): void {
    this.#clearHeartbeat();
    this.#heartbeatTimer = setInterval(() => {
      if (socket.readyState !== WebSocket.OPEN) {
        return;
      }
      if (!this.#receivedPong) {
        this.options.logger.warn("desktop_heartbeat_missed");
        socket.terminate();
        return;
      }
      this.#receivedPong = false;
      socket.ping();
    }, this.#heartbeatMs);
  }

  #clearHeartbeat(): void {
    if (this.#heartbeatTimer !== undefined) {
      clearInterval(this.#heartbeatTimer);
      this.#heartbeatTimer = undefined;
    }
  }

  #clearTimers(): void {
    if (this.#reconnectTimer !== undefined) {
      clearTimeout(this.#reconnectTimer);
      this.#reconnectTimer = undefined;
    }
    this.#clearHeartbeat();
  }
}
