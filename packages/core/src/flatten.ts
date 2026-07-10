import type { DaicePackage, TableRow } from "./types.js";

const PROMPT_EXCERPT_LENGTH = 80;

/**
 * Flattens a package's assets into table rows, used by the viewer's table
 * view and by any future export tool. One row per asset, in the same order
 * as `assets`.
 */
export function flattenForTable(pkg: DaicePackage): TableRow[] {
  return pkg.assets.map((asset) => {
    const prompt = asset.prompt ?? "";
    return {
      id: asset.id,
      aiGenerated: asset.aiGenerated,
      provider: asset.provider ?? "",
      model: asset.model ?? "",
      promptExcerpt: prompt.length > PROMPT_EXCERPT_LENGTH ? `${prompt.slice(0, PROMPT_EXCERPT_LENGTH)}…` : prompt,
      generatedByEmail: asset.generatedBy?.email ?? "",
      referenceCount: asset.references.length,
      usedInShow: asset.timecodeIn !== undefined && asset.timecodeOut !== undefined,
    };
  });
}
