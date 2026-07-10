import type { Dispatch } from "react";
import type { DaiceAsset, DaicePackage } from "@leoninestudios/daice-chain-core";
import type { EditorAction } from "@/state/editorState";
import { deriveDuplicateAssetId } from "@/utils/deriveAssetId";
import { mediaUrlFor, type BridgeInboxJob } from "./extensionBridgeTypes";

export interface ApplyPushResult {
  addedAssetIds: string[];
}

/**
 * Applies one extension push job to the currently open package:
 * 1. Remaps any pushed asset id that collides with an existing one
 *    (propagating the remap through in-batch `references` too), the same
 *    way `duplicateAsset` in AssetTable.tsx does for its own id collisions.
 * 2. Fetches each asset's media bytes from the bridge (see
 *    ../../vite-plugins/daiceExtensionBridge.ts's GET /inbox/:pushId/media/:assetId)
 *    and turns them into a `File`, exactly like a dropped file would be.
 * 3. Dispatches ADD_ASSET for every pushed asset.
 * 4. If `attachTo` names an asset already in the package, links it to every
 *    pushed root — an asset in this batch that nothing else in the batch
 *    references — the same "root" definition AssetTable.tsx's
 *    `computeRootIds` uses.
 *
 * See ../../BRIDGE.md and docs/planning/04-editor.md.
 */
export async function applyExtensionPush(job: BridgeInboxJob, pkg: DaicePackage, dispatch: Dispatch<EditorAction>): Promise<ApplyPushResult> {
  const existingIds = new Set(pkg.assets.map((a) => a.id));
  const finalIds: string[] = [];

  for (const asset of job.assets) {
    let id = asset.id;
    if (existingIds.has(id)) {
      id = deriveDuplicateAssetId(id, existingIds);
    }
    existingIds.add(id);
    finalIds.push(id);
  }

  const resolveInBatchRef = (refAssetId: string): string => {
    const idx = job.assets.findIndex((a) => a.id === refAssetId);
    if (idx === -1) return refAssetId;
    return finalIds[idx];
  };

  const remapped = job.assets.map((original, index) => ({
    original,
    asset: {
      ...original,
      id: finalIds[index],
      references: original.references.map((ref) => ({ ...ref, assetId: resolveInBatchRef(ref.assetId) })),
    } as DaiceAsset,
  }));

  const referencedWithinBatch = new Set(remapped.flatMap(({ asset }) => asset.references.map((ref) => ref.assetId)));
  const rootIds = remapped.filter(({ asset }) => !referencedWithinBatch.has(asset.id)).map(({ asset }) => asset.id);

  const mediaByOriginalAssetId = new Map(job.media.map((m) => [m.assetId, m]));
  const addedAssetIds: string[] = [];
  const mediaFailures: string[] = [];

  for (const { original, asset } of remapped) {
    try {
      const mediaDescriptor = mediaByOriginalAssetId.get(original.id);
      let file: File | undefined;
      if (mediaDescriptor) {
        try {
          const response = await fetch(mediaUrlFor(job.id, original.id));
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const blob = await response.blob();
          file = new File([blob], mediaDescriptor.filename, { type: mediaDescriptor.mimeType });
        } catch (error) {
          mediaFailures.push(`${original.id}: ${(error as Error).message}`);
        }
      }
      const assetToAdd: DaiceAsset = file && !asset.mediaPath ? { ...asset, mediaPath: `assets/${file.name}` } : asset;
      dispatch({ type: "ADD_ASSET", asset: assetToAdd, file });
      addedAssetIds.push(assetToAdd.id);
    } catch (error) {
      console.error(`Failed to apply pushed asset "${asset.id}"`, error);
    }
  }

  if (mediaFailures.length > 0) {
    console.warn(`Extension push applied with ${mediaFailures.length} media fetch failure(s):`, mediaFailures);
  }

  if (job.attachTo) {
    for (const rootId of rootIds) dispatch({ type: "ADD_REFERENCE", targetId: job.attachTo, refAssetId: rootId });
  }

  return { addedAssetIds };
}
