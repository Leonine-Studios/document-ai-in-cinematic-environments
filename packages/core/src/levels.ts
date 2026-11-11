import type { Contact, DaicePackage, DaiceTool, DocumentationLevel } from "./types.js";
import { CURRENT_DAICE_VERSION } from "./schema.js";

/** The package's documentation level; a missing value means "detailed" (spec §0). */
export function documentationLevelOf(pkg: Pick<DaicePackage, "package">): DocumentationLevel {
  return pkg.package.documentationLevel ?? "detailed";
}

/**
 * Derives the tool list from a package's AI assets: one entry per distinct
 * provider/model pair, with each asset's `generatedBy` contact as `usedBy`
 * (de-duplicated by email, or by name when there is no email). A convenience
 * for writers that want to fill a detailed package's optional `tools` (spec §2.6).
 */
export function deriveToolsFromAssets(pkg: Pick<DaicePackage, "assets">): DaiceTool[] {
  const tools = new Map<string, { tool: DaiceTool; users: Map<string, Contact> }>();
  for (const asset of pkg.assets) {
    if (!asset.aiGenerated || !asset.provider || !asset.model) continue;
    const key = JSON.stringify([asset.provider, asset.model]);
    let entry = tools.get(key);
    if (!entry) {
      entry = { tool: { provider: asset.provider, model: asset.model }, users: new Map() };
      tools.set(key, entry);
    }
    if (asset.generatedBy) {
      const userKey = (asset.generatedBy.email ?? asset.generatedBy.name).toLowerCase();
      if (!entry.users.has(userKey)) entry.users.set(userKey, asset.generatedBy);
    }
  }
  return [...tools.values()].map(({ tool, users }) =>
    users.size > 0 ? { ...tool, usedBy: [...users.values()] } : tool,
  );
}

/**
 * Relabels a package as the current spec version. v0.2.0 is purely additive
 * (spec §6), so nothing else in the package changes.
 */
export function upgradeToCurrentVersion<T extends { daiceVersion: string }>(
  pkg: T,
): Omit<T, "daiceVersion"> & { daiceVersion: typeof CURRENT_DAICE_VERSION } {
  return { ...pkg, daiceVersion: CURRENT_DAICE_VERSION };
}
