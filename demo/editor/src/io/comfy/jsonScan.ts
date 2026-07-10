/**
 * Best-effort scanning helpers used to pull a `"key": <json>` value out of
 * an arbitrary blob of text, without knowing anything about the surrounding
 * container format. This is how we recover ComfyUI metadata from formats
 * that don't have a clean chunk/tag API in the browser (WebP EXIF text,
 * MP4/WebM "comment" atoms written by the Video Helper Suite "Video
 * Combine" node) — see extractComfyMetadata.ts. It only works when the
 * JSON was embedded as raw, uncompressed text, which is the common case for
 * these writers; anything compressed or re-encoded simply won't match.
 */

/** Finds the end index (inclusive) of a `{...}` object starting at `startIndex` (which must point at the opening brace), respecting quoted strings and escapes. */
function findBalancedObjectEnd(text: string, startIndex: number): number | null {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = startIndex; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
    } else if (ch === "{") {
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return null;
}

/** Finds the end index (inclusive, at the closing quote) of a `"..."` string starting at `startIndex` (which must point at the opening quote). */
function findStringEnd(text: string, startIndex: number): number | null {
  let escaped = false;
  for (let i = startIndex + 1; i < text.length; i++) {
    const ch = text[i];
    if (escaped) escaped = false;
    else if (ch === "\\") escaped = true;
    else if (ch === '"') return i;
  }
  return null;
}

/**
 * Searches `text` for `"<key>": <value>` and returns the parsed value,
 * trying every occurrence until one parses successfully. Handles both an
 * inline object value (`"key": {...}`) and a doubly-encoded JSON string
 * value (`"key": "{\"a\":1}"`, as some containers store nested JSON).
 */
export function extractJsonValueForKey(text: string, key: string): unknown | undefined {
  const pattern = new RegExp(`"${key}"\\s*:\\s*`, "g");
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    const valueStart = match.index + match[0].length;
    const ch = text[valueStart];
    if (ch === "{") {
      const end = findBalancedObjectEnd(text, valueStart);
      if (end !== null) {
        try {
          return JSON.parse(text.slice(valueStart, end + 1));
        } catch {
          // Not actually valid JSON at this occurrence — keep scanning.
        }
      }
    } else if (ch === '"') {
      const end = findStringEnd(text, valueStart);
      if (end !== null) {
        try {
          const unescaped = JSON.parse(text.slice(valueStart, end + 1)) as string;
          try {
            return JSON.parse(unescaped);
          } catch {
            return unescaped;
          }
        } catch {
          // Malformed escaping — keep scanning.
        }
      }
    }
  }
  return undefined;
}
