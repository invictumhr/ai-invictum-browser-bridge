const stripBom = (value: string): string => value.replace(/^\uFEFF/u, "");

export const decodeStdinText = (buffer: Buffer): string => {
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return stripBom(buffer.subarray(2).toString("utf16le"));
  }
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return stripBom(buffer.subarray(3).toString("utf8"));
  }

  const sampleLength = Math.min(buffer.length, 256);
  let oddNulls = 0;
  let oddPositions = 0;
  for (let index = 1; index < sampleLength; index += 2) {
    oddPositions += 1;
    if (buffer[index] === 0) oddNulls += 1;
  }
  if (oddPositions > 0 && oddNulls / oddPositions > 0.6) {
    return stripBom(buffer.toString("utf16le"));
  }
  return stripBom(buffer.toString("utf8"));
};
