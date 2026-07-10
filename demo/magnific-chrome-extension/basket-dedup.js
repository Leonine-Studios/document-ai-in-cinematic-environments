/**
 * Basket-level deduplication helpers for the side-panel staging area.
 * Dedup runs at capture time so export and send-to-editor see a clean basket.
 */

export function magnificKey(fragment) {
  return fragment.metadata?.magnificIdentifier ?? null;
}

/**
 * @param {Map<string, { fragment: object }>} captures
 * @param {string} identifier
 * @returns {string | null} captureId
 */
export function findCaptureIdByMagnificIdentifier(captures, identifier) {
  if (!identifier) return null;
  for (const [captureId, entry] of captures) {
    if (magnificKey(entry.fragment) === identifier) return captureId;
  }
  return null;
}

/**
 * Collect fragment ids already used in the basket, optionally excluding one capture.
 * @param {Map<string, { fragment: object }>} captures
 * @param {string | null} excludeCaptureId
 */
export function usedFragmentIds(captures, excludeCaptureId = null) {
  const ids = new Set();
  for (const [captureId, entry] of captures) {
    if (captureId === excludeCaptureId) continue;
    ids.add(entry.fragment.id);
  }
  return ids;
}

/**
 * Suffix fragment.id if it collides with another staged asset (different magnificIdentifier).
 * @param {object} fragment
 * @param {Set<string>} takenIds
 * @returns {{ fragment: object, renamed: boolean, oldId?: string, newId?: string }}
 */
export function ensureUniqueFragmentId(fragment, takenIds) {
  if (!takenIds.has(fragment.id)) {
    return { fragment, renamed: false };
  }
  const oldId = fragment.id;
  let count = 2;
  let newId = `${oldId}-${count}`;
  while (takenIds.has(newId)) {
    count += 1;
    newId = `${oldId}-${count}`;
  }
  return {
    fragment: { ...fragment, id: newId },
    renamed: true,
    oldId,
    newId,
  };
}

/**
 * When an incoming fragment is suffix-renamed to avoid an id collision, update
 * only that fragment's own references — never rewrite refs on other basket
 * entries (which would incorrectly repoint e.g. a duck's upload reference).
 */
export function rewireIncomingFragmentReferences(fragment, oldId, newId) {
  if (oldId === newId) return fragment;
  return {
    ...fragment,
    references: fragment.references.map((ref) =>
      ref.assetId === oldId ? { ...ref, assetId: newId } : ref,
    ),
  };
}

/**
 * Summarise capture results for a batch toast.
 * @param {Array<{ action: string, renamedFrom?: string, renamedTo?: string }>} results
 */
export function summarizeCaptureResults(results) {
  let newCount = 0;
  let replacedCount = 0;
  let renamedCount = 0;
  let lastRename = null;

  for (const r of results) {
    if (r.action === "new") newCount += 1;
    else if (r.action === "replaced") replacedCount += 1;
    else if (r.action === "renamed") {
      renamedCount += 1;
      lastRename = r;
    }
  }

  const total = results.length;
  const hasDedup = replacedCount > 0 || renamedCount > 0;

  if (total === 1) {
    if (results[0].action === "replaced") {
      return { message: "Already staged — replaced with latest capture.", variant: "warn" };
    }
    if (results[0].action === "renamed") {
      return {
        message: `Renamed \`${results[0].renamedFrom}\` → \`${results[0].renamedTo}\` — another staged asset already uses that id.`,
        variant: "warn",
      };
    }
    return { message: "Captured 1 asset.", variant: "default" };
  }

  if (total === 0) {
    return { message: "Nothing captured.", variant: "default" };
  }

  const parts = [];
  if (newCount > 0) parts.push(`${newCount} new`);
  if (replacedCount > 0) parts.push(`${replacedCount} updated`);
  if (renamedCount > 0) parts.push(`${renamedCount} renamed`);

  let message = `Captured ${total} asset(s) (${parts.join(", ")}).`;
  if (lastRename && renamedCount === 1 && replacedCount === 0 && newCount === 0) {
    message = `Captured ${total} asset(s) — renamed \`${lastRename.renamedFrom}\` → \`${lastRename.renamedTo}\`.`;
  }

  return { message, variant: hasDedup ? "warn" : "default" };
}
