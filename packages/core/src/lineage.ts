import type { LineageNode, DaicePackage } from "./types.js";

/**
 * Recursively unfolds an asset's references into a lineage tree.
 *
 * Every reference points to another asset in the same package (there is no
 * separate file-reference kind — non-AI inputs are assets with
 * `aiGenerated: false`), so a lineage node needs only `asset` and `children`.
 *
 * Defensive against cycles even though a package that passed
 * `validatePackage` cannot contain one: if a cycle is encountered anyway
 * (e.g. this is called on unvalidated input), the recursion stops at the
 * repeated asset rather than looping forever.
 */
export function resolveLineage(assetId: string, pkg: DaicePackage, seen: Set<string> = new Set()): LineageNode {
  const asset = pkg.assets.find((a) => a.id === assetId);
  if (!asset) {
    throw new Error(`resolveLineage: no asset with id "${assetId}" in this package`);
  }

  if (seen.has(assetId)) {
    return { asset, children: [] };
  }
  const nextSeen = new Set(seen).add(assetId);

  const children: LineageNode[] = asset.references.map((ref) => {
    const childAsset = pkg.assets.find((a) => a.id === ref.assetId);
    if (!childAsset) {
      // Dangling reference on unvalidated input — surface as an unresolved leaf
      // rather than throwing, so viewers can still render the rest of the tree.
      const placeholder = { id: ref.assetId, aiGenerated: false as const, references: [] };
      return { asset: placeholder, children: [] };
    }
    return resolveLineage(ref.assetId, pkg, nextSeen);
  });

  return { asset, children };
}
