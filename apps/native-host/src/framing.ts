import { IBP_ERROR_CODES } from "@invictum/protocol";

export const DEFAULT_MAX_NATIVE_MESSAGE_BYTES = 1024 * 1024;
const HEADER_BYTES = 4;

export class NativeMessageFramingError extends Error {
  public constructor(
    public readonly code:
      typeof IBP_ERROR_CODES.INVALID_MESSAGE | typeof IBP_ERROR_CODES.MESSAGE_TOO_LARGE,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "NativeMessageFramingError";
  }
}

export function encodeNativeMessage(
  message: unknown,
  maxMessageBytes = DEFAULT_MAX_NATIVE_MESSAGE_BYTES,
): Buffer {
  let json: string;
  try {
    json = JSON.stringify(message);
  } catch (error) {
    throw new NativeMessageFramingError(
      IBP_ERROR_CODES.INVALID_MESSAGE,
      "Native Messaging payload is not JSON serializable",
      { cause: error },
    );
  }

  if (json === undefined) {
    throw new NativeMessageFramingError(
      IBP_ERROR_CODES.INVALID_MESSAGE,
      "Native Messaging payload cannot be undefined",
    );
  }

  const payload = Buffer.from(json, "utf8");
  if (payload.length === 0) {
    throw new NativeMessageFramingError(
      IBP_ERROR_CODES.INVALID_MESSAGE,
      "Native Messaging payload cannot be empty",
    );
  }
  if (payload.length > maxMessageBytes) {
    throw new NativeMessageFramingError(
      IBP_ERROR_CODES.MESSAGE_TOO_LARGE,
      `Native Messaging payload is ${payload.length} bytes; maximum is ${maxMessageBytes}`,
    );
  }

  const frame = Buffer.allocUnsafe(HEADER_BYTES + payload.length);
  frame.writeUInt32LE(payload.length, 0);
  payload.copy(frame, HEADER_BYTES);
  return frame;
}

export class NativeMessageDecoder {
  #buffer = Buffer.alloc(0);

  public constructor(private readonly maxMessageBytes = DEFAULT_MAX_NATIVE_MESSAGE_BYTES) {}

  public push(chunk: Uint8Array): unknown[] {
    if (chunk.byteLength === 0) {
      return [];
    }

    this.#buffer = Buffer.concat([this.#buffer, Buffer.from(chunk)]);
    const messages: unknown[] = [];

    while (this.#buffer.length >= HEADER_BYTES) {
      const payloadLength = this.#buffer.readUInt32LE(0);
      if (payloadLength === 0) {
        this.reset();
        throw new NativeMessageFramingError(
          IBP_ERROR_CODES.INVALID_MESSAGE,
          "Native Messaging frame declared an empty payload",
        );
      }
      if (payloadLength > this.maxMessageBytes) {
        this.reset();
        throw new NativeMessageFramingError(
          IBP_ERROR_CODES.MESSAGE_TOO_LARGE,
          `Native Messaging frame declares ${payloadLength} bytes; maximum is ${this.maxMessageBytes}`,
        );
      }

      const frameLength = HEADER_BYTES + payloadLength;
      if (this.#buffer.length < frameLength) {
        break;
      }

      const payload = this.#buffer.subarray(HEADER_BYTES, frameLength);
      this.#buffer = this.#buffer.subarray(frameLength);

      try {
        messages.push(JSON.parse(payload.toString("utf8")) as unknown);
      } catch (error) {
        this.reset();
        throw new NativeMessageFramingError(
          IBP_ERROR_CODES.INVALID_MESSAGE,
          "Native Messaging frame contains invalid JSON",
          { cause: error },
        );
      }
    }

    return messages;
  }

  public reset(): void {
    this.#buffer = Buffer.alloc(0);
  }

  public get bufferedBytes(): number {
    return this.#buffer.length;
  }
}
