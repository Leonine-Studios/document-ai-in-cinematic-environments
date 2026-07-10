/**
 * Shapes for ComfyUI's "API format" node graph — what `SaveImage`/
 * "Video Combine" actually embed in output files, keyed by node id. This is
 * a small, permissive subset (only the fields we read); we never assume a
 * node has more than this, since third-party custom nodes vary widely.
 */
export interface ComfyNode {
  class_type?: string;
  inputs?: Record<string, unknown>;
  _meta?: { title?: string };
}

export type ComfyGraph = Record<string, ComfyNode>;

export interface ComfyMetadata {
  /**
   * The API-format graph — the one ComfyUI actually runs. Embedded under
   * the "prompt" PNG text chunk / container metadata key.
   */
  prompt?: ComfyGraph;
  /**
   * The UI-format node graph (nodes/links/groups) — informational only,
   * kept verbatim in `asset.metadata.comfyui.workflow`.
   */
  workflow?: unknown;
}
