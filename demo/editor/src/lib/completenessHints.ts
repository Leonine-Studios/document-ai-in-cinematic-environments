import type { DaiceAsset, DaicePackage } from "@daice-chain/core";

/**
 * Advisory (never blocking) gaps in the SHOULD/MAY-level fields the
 * specification recommends but doesn't require (spec/README.md §2.3): seed,
 * media MIME type, and the generation contact's email. Distinct from
 * `mediaWarnings.ts`, which covers missing media files specifically — this
 * covers the rest of the "fill in as much as you know" fields. Purely
 * advisory, never red: a valid DAICE-Chain package may legitimately omit
 * every field checked here, so this never blocks export. See TreeRow's amber
 * completeness icon and CompletenessBanner for the UI this powers.
 */
export function assetCompletenessGaps(asset: DaiceAsset): string[] {
  const gaps: string[] = [];
  if (asset.aiGenerated && asset.prompt === undefined) {
    gaps.push("No prompt recorded — add one if it can be disclosed.");
  }
  if (asset.aiGenerated && asset.seed === undefined) {
    gaps.push("No seed recorded — add one if the provider exposed it.");
  }
  if (asset.aiGenerated && asset.generatedBy && !asset.generatedBy.email) {
    gaps.push("Generated-by contact has no email.");
  }
  if (asset.mediaPath && !asset.mediaMimeType) {
    gaps.push("Media path is set but the MIME type is missing.");
  }
  return gaps;
}

export function assetsWithCompletenessGaps(pkg: DaicePackage): DaiceAsset[] {
  return pkg.assets.filter((asset) => assetCompletenessGaps(asset).length > 0);
}
