import type { DaiceAsset, DaicePackage, DaiceReference } from "@leoninestudios/daice-chain-core";
import type { PendingFile } from "@/state/editorState";

/**
 * References on `asset` that point at another asset in this package with no
 * media blob attached in the current session. Dangling references (pointing
 * at no asset at all) are excluded — those already surface as red schema
 * errors via `@leoninestudios/daice-chain-core`'s `validatePackage`/`assetSchema`. This check is
 * purely advisory and orange, never red: a valid DAICE-Chain package may legitimately
 * omit media a writer doesn't have yet (see spec/README.md §3), so it never
 * blocks export — it only nudges toward retrieving the rest of the
 * provenance chain. See TreeRow's per-row warning icon.
 */
export function missingMediaRefs(asset: DaiceAsset, pkg: DaicePackage, pendingFiles: Map<string, PendingFile>): DaiceReference[] {
  const byId = new Map(pkg.assets.map((a) => [a.id, a]));
  return asset.references.filter((ref) => byId.has(ref.assetId) && !pendingFiles.has(ref.assetId));
}

/**
 * Every asset in the package with no media blob attached in the current
 * session — root outputs and referenced inputs alike. Used for the
 * package-level "incomplete provenance chain" banner (MediaWarningsBanner).
 */
export function assetsMissingMedia(pkg: DaicePackage, pendingFiles: Map<string, PendingFile>): DaiceAsset[] {
  return pkg.assets.filter((asset) => !pendingFiles.has(asset.id));
}
