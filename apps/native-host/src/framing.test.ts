import { describe, expect, it } from "vitest";

import { encodeNativeMessage, NativeMessageDecoder, NativeMessageFramingError } from "./framing.js";

describe("Chrome Native Messaging framing", () => {
  it("uses the UTF-8 byte length and round-trips Unicode", () => {
    const message = { text: "Unicode payload — café 🚀" };
    const frame = encodeNativeMessage(message);
    const declaredLength = frame.readUInt32LE(0);

    expect(declaredLength).toBe(Buffer.byteLength(JSON.stringify(message), "utf8"));
    expect(new NativeMessageDecoder().push(frame)).toEqual([message]);
  });

  it("decodes a message fragmented across arbitrary chunks", () => {
    const frame = encodeNativeMessage({ action: "system.ping" });
    const decoder = new NativeMessageDecoder();

    expect(decoder.push(frame.subarray(0, 2))).toEqual([]);
    expect(decoder.push(frame.subarray(2, 7))).toEqual([]);
    expect(decoder.push(frame.subarray(7))).toEqual([{ action: "system.ping" }]);
    expect(decoder.bufferedBytes).toBe(0);
  });

  it("decodes multiple messages from one chunk", () => {
    const decoder = new NativeMessageDecoder();
    const frames = Buffer.concat([encodeNativeMessage({ id: 1 }), encodeNativeMessage({ id: 2 })]);

    expect(decoder.push(frames)).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it("rejects an oversized frame before buffering its payload", () => {
    const header = Buffer.alloc(4);
    header.writeUInt32LE(1_001, 0);

    expect(() => new NativeMessageDecoder(1_000).push(header)).toThrowError(
      NativeMessageFramingError,
    );
  });

  it("rejects invalid JSON and resets the decoder", () => {
    const payload = Buffer.from("{not-json", "utf8");
    const frame = Buffer.alloc(4 + payload.length);
    frame.writeUInt32LE(payload.length, 0);
    payload.copy(frame, 4);
    const decoder = new NativeMessageDecoder();

    expect(() => decoder.push(frame)).toThrowError(NativeMessageFramingError);
    expect(decoder.bufferedBytes).toBe(0);
  });

  it("rejects outbound messages larger than the configured maximum", () => {
    expect(() => encodeNativeMessage({ value: "x".repeat(100) }, 16)).toThrowError(
      NativeMessageFramingError,
    );
  });
});
