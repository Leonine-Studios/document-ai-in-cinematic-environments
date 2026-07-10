/**
 * Curated MIME type suggestions for the media-file field. This is an editor
 * convenience only, not a schema constraint: spec/README.md §2.3 deliberately
 * leaves `mediaMimeType` open at the schema level, so free text always
 * remains valid — see docs/planning/04-editor.md Part F. The suggestions
 * below are limited to the review-friendly formats spec/README.md §3 asks
 * writers to keep `assets/` to.
 */
export const SUGGESTED_MIME_TYPES: string[] = [
  "image/jpeg",
  "image/png",
  "video/mp4",
  "video/quicktime",
  "audio/mpeg",
  "audio/wav",
];

/** Best-effort guess of a MIME type from a filename, used as a fallback when `File.type` is empty (some browsers/OSes leave it blank for unfamiliar extensions). */
export function guessMimeTypeFromFilename(filename: string): string | undefined {
  const ext = filename.toLowerCase().slice(filename.lastIndexOf(".") + 1);
  const byExt: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    mp4: "video/mp4",
    mov: "video/quicktime",
    mp3: "audio/mpeg",
    wav: "audio/wav",
  };
  return byExt[ext];
}
