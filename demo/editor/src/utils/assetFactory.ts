import type { DaiceAsset } from "@daice-chain/core";
import { deriveAssetId } from "./deriveAssetId";
import { guessMimeTypeFromFilename } from "@/lib/mimeTypes";
import { extractComfyMetadata } from "@/io/comfy/extractComfyMetadata";
import { comfyToAssetPatch } from "@/io/comfy/comfyToAsset";

/** Builds a non-AI leaf asset from a dropped file, with an id derived from its filename (see deriveAssetId). */
export function buildNonAiAssetFromFile(file: File, existingIds: Iterable<string>): DaiceAsset {
  return {
    id: deriveAssetId(file.name, existingIds),
    aiGenerated: false,
    mediaPath: `assets/${file.name}`,
    mediaMimeType: file.type || guessMimeTypeFromFilename(file.name),
    references: [],
  };
}

export interface FileImportResult {
  /** The asset representing the dropped/picked file itself. */
  asset: DaiceAsset;
  /** Placeholder source-media assets discovered in embedded ComfyUI metadata (e.g. `LoadImage` inputs) — already referenced by `asset`, with no media attached yet. */
  inputAssets: DaiceAsset[];
}

/**
 * Builds an asset from a dropped/picked file, opportunistically importing
 * ComfyUI generation metadata (provider/model/prompt/seed, the full raw
 * workflow, and placeholder assets for any source-image/video inputs) when
 * the file carries any — see io/comfy/. Falls back to a plain non-AI leaf
 * asset, exactly like before this feature, when no such metadata is found.
 */
export async function buildAssetsFromFile(file: File, existingIds: Iterable<string>): Promise<FileImportResult> {
  const base = buildNonAiAssetFromFile(file, existingIds);
  const comfy = await extractComfyMetadata(file).catch(() => null);
  if (!comfy?.prompt) return { asset: base, inputAssets: [] };

  const imported = comfyToAssetPatch(comfy.prompt, comfy.workflow, [...existingIds, base.id]);
  if (!imported) return { asset: base, inputAssets: [] };

  return { asset: { ...base, ...imported.patch }, inputAssets: imported.inputAssets };
}
