import type { DaicePackage } from "@daice-chain/core";

/**
 * Lightweight, editor-local check used only to give immediate UI feedback
 * before a drag-and-drop nesting action commits (e.g. disabling an invalid
 * drop target). `@daice-chain/core`'s `validatePackage` remains the authoritative
 * cycle check run on import/export — this is a UX convenience, not a
 * replacement for it.
 */
export function wouldCreateCycle(pkg: DaicePackage, targetId: string, newReferenceId: string): boolean {
  if (targetId === newReferenceId) return true;
  const byId = new Map(pkg.assets.map((asset) => [asset.id, asset]));
  const visited = new Set<string>();
  function reaches(fromId: string, searchId: string): boolean {
    if (fromId === searchId) return true;
    if (visited.has(fromId)) return false;
    visited.add(fromId);
    const asset = byId.get(fromId);
    if (!asset) return false;
    return asset.references.some((ref) => reaches(ref.assetId, searchId));
  }
  // Adding newReferenceId -> ... -> targetId would close a cycle back to targetId.
  return reaches(newReferenceId, targetId);
}
