import { describe, expect, it } from "vitest";

import { decodeStdinText } from "./stdin-json.js";

describe("decodeStdinText", () => {
  const json = '{"tabId":42,"text":"čćžšđ"}';

  it("decodes UTF-8 JSON", () => {
    expect(decodeStdinText(Buffer.from(json, "utf8"))).toBe(json);
  });

  it("decodes Windows PowerShell UTF-16LE JSON without a BOM", () => {
    expect(decodeStdinText(Buffer.from(json, "utf16le"))).toBe(json);
  });

  it("decodes BOM-prefixed UTF-16LE JSON", () => {
    expect(
      decodeStdinText(Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(json, "utf16le")])),
    ).toBe(json);
  });
});
