/**
 * Derives an asset id from a media filename, per spec/README.md §2.3's
 * recommendation that an asset id be a human-readable slug tied to its
 * media file rather than a UUID. Falls back to a short random slug for a
 * filename that sanitizes to nothing (e.g. "___.jpg"), and appends a short
 * suffix on collision with an existing id in the package.
 */
function sanitize(stem: string): string {
  return stem
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function shortSuffix(): string {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  return random.replace(/-/g, "").slice(0, 6);
}

export function deriveAssetId(filename: string, existingIds: Iterable<string>): string {
  const stem = filename.slice(0, filename.lastIndexOf(".") === -1 ? undefined : filename.lastIndexOf("."));
  const base = sanitize(stem) || `asset-${shortSuffix()}`;
  const taken = new Set(existingIds);
  if (!taken.has(base)) return base;
  let candidate = `${base}-${shortSuffix()}`;
  while (taken.has(candidate)) candidate = `${base}-${shortSuffix()}`;
  return candidate;
}

/** Derives an id for a duplicated asset — `<original>-copy`, with a short random suffix on collision. Used by the "Duplicate" row action and shift+drop-to-root. */
export function deriveDuplicateAssetId(originalId: string, existingIds: Iterable<string>): string {
  const base = `${originalId}-copy`;
  const taken = new Set(existingIds);
  if (!taken.has(base)) return base;
  let candidate = `${base}-${shortSuffix()}`;
  while (taken.has(candidate)) candidate = `${base}-${shortSuffix()}`;
  return candidate;
}
