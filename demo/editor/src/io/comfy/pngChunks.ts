import type { ComfyMetadata } from "./types";

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export function isPng(bytes: Uint8Array): boolean {
  return PNG_SIGNATURE.every((byte, i) => bytes[i] === byte);
}

function readUint32BE(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
}

function indexOfNull(bytes: Uint8Array, from: number, to: number): number {
  for (let i = from; i < to; i++) if (bytes[i] === 0) return i;
  return -1;
}

interface TextEntry {
  keyword: string;
  text: string;
}

/** PNG `tEXt`: `keyword\0text`, both Latin-1. This is what PIL's `PngInfo.add_text` writes for ASCII-only values — the common case for ComfyUI's JSON metadata. */
function parseTEXt(bytes: Uint8Array, start: number, end: number): TextEntry | null {
  const nullAt = indexOfNull(bytes, start, end);
  if (nullAt === -1) return null;
  const latin1 = new TextDecoder("latin1");
  return {
    keyword: latin1.decode(bytes.subarray(start, nullAt)),
    text: latin1.decode(bytes.subarray(nullAt + 1, end)),
  };
}

/** PNG `iTXt`: `keyword\0 compressionFlag compressionMethod languageTag\0 translatedKeyword\0 text`, text is UTF-8 (or zlib-compressed UTF-8 if compressionFlag=1, which we don't decode — best-effort only). Used by PIL when a value contains non-Latin-1 characters (e.g. a unicode prompt). */
function parseITXt(bytes: Uint8Array, start: number, end: number): TextEntry | null {
  let cursor = start;
  const keywordEnd = indexOfNull(bytes, cursor, end);
  if (keywordEnd === -1) return null;
  const keyword = new TextDecoder("latin1").decode(bytes.subarray(cursor, keywordEnd));
  cursor = keywordEnd + 1;

  const compressionFlag = bytes[cursor];
  cursor += 2; // flag byte + compression-method byte

  const languageEnd = indexOfNull(bytes, cursor, end);
  if (languageEnd === -1) return null;
  cursor = languageEnd + 1;

  const translatedKeywordEnd = indexOfNull(bytes, cursor, end);
  if (translatedKeywordEnd === -1) return null;
  cursor = translatedKeywordEnd + 1;

  if (compressionFlag !== 0) return null; // compressed iTXt isn't decoded — see comment above
  return { keyword, text: new TextDecoder("utf-8").decode(bytes.subarray(cursor, end)) };
}

function assignEntry(result: ComfyMetadata, entry: TextEntry): void {
  if (entry.keyword === "prompt" && result.prompt === undefined) {
    try {
      result.prompt = JSON.parse(entry.text);
    } catch {
      // Not JSON — not the chunk we're looking for.
    }
  } else if (entry.keyword === "workflow" && result.workflow === undefined) {
    try {
      result.workflow = JSON.parse(entry.text);
    } catch {
      // Not JSON — not the chunk we're looking for.
    }
  }
}

/**
 * Reads `tEXt`/`iTXt` chunks out of a PNG looking for ComfyUI's `prompt` and
 * `workflow` keys — the two chunks `SaveImage` (and equivalents) embed by
 * default. Never throws: a malformed/truncated PNG just yields whatever was
 * parsed before the problem, and the caller (extractComfyMetadata) falls
 * back to a generic byte-scan on top of this.
 */
export function extractFromPngChunks(bytes: Uint8Array): ComfyMetadata {
  const result: ComfyMetadata = {};
  let offset = 8; // past the 8-byte PNG signature
  while (offset + 8 <= bytes.length) {
    const length = readUint32BE(bytes, offset);
    const type = String.fromCharCode(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7]);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd > bytes.length) break; // truncated chunk

    if (type === "tEXt") {
      const entry = parseTEXt(bytes, dataStart, dataEnd);
      if (entry) assignEntry(result, entry);
    } else if (type === "iTXt") {
      const entry = parseITXt(bytes, dataStart, dataEnd);
      if (entry) assignEntry(result, entry);
    } else if (type === "IEND") {
      break;
    }

    offset = dataEnd + 4; // skip the trailing 4-byte CRC
  }
  return result;
}
