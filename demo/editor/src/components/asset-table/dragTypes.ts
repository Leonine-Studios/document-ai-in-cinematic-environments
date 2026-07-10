/** Custom DnD MIME type used to identify "an asset row is being dragged" vs. an OS file drag. */
export const ASSET_DRAG_MIME = "application/x-daice-chain-asset-id";

/**
 * Payload carried alongside `ASSET_DRAG_MIME`: which asset is being dragged,
 * and which parent (if any) it's currently nested under. The drop handler
 * uses `sourceParentId` to decide what a plain drop (move: unlink from the
 * old parent, link under the new one) has to undo — see TreeRow's
 * `handleDrop` and docs/planning/04-editor.md Part B ("move vs. copy").
 */
export interface AssetDragPayload {
  assetId: string;
  sourceParentId?: string;
}

export function encodeAssetDragPayload(payload: AssetDragPayload): string {
  return JSON.stringify(payload);
}

export function decodeAssetDragPayload(raw: string): AssetDragPayload | null {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.assetId === "string") return parsed as AssetDragPayload;
    return null;
  } catch {
    return null;
  }
}
