import type { DaiceAsset } from "@daice-chain/core";
import { deriveAssetId } from "@/utils/deriveAssetId";
import { guessMimeTypeFromFilename } from "@/lib/mimeTypes";
import type { ComfyGraph, ComfyNode } from "./types";

export interface ComfyAssetImport {
  /** Fields to merge onto the asset this generation produced. */
  patch: Partial<DaiceAsset>;
  /** Placeholder source-media assets (e.g. `LoadImage`/`LoadVideo` inputs) — already wired into `patch.references`, with no media attached yet. */
  inputAssets: DaiceAsset[];
}

function isNodeLink(value: unknown): value is [string, number] {
  return Array.isArray(value) && value.length === 2 && typeof value[0] === "string" && typeof value[1] === "number";
}

function nodesByClassType(graph: ComfyGraph, classTypes: string[]): ComfyNode[] {
  return Object.values(graph).filter((node) => Boolean(node.class_type) && classTypes.includes(node.class_type!));
}

function firstStringInput(node: ComfyNode | undefined, fields: string[]): string | undefined {
  for (const field of fields) {
    const value = node?.inputs?.[field];
    if (typeof value === "string" && value) return value;
  }
  return undefined;
}

// Covers the checkpoint/UNET loaders that ship with core ComfyUI; custom
// loader nodes with a differently-named class_type fall through to the
// generic "any node with one of these input fields" scan below.
const MODEL_LOADER_TYPES = ["CheckpointLoaderSimple", "CheckpointLoader", "unCLIPCheckpointLoader", "ImageOnlyCheckpointLoader", "UNETLoader"];
const MODEL_NAME_FIELDS = ["ckpt_name", "unet_name", "model_name", "model_path"];

function extractModel(graph: ComfyGraph): string | undefined {
  for (const node of nodesByClassType(graph, MODEL_LOADER_TYPES)) {
    const model = firstStringInput(node, MODEL_NAME_FIELDS);
    if (model) return model;
  }
  // Fallback: some custom nodes load checkpoints under an unrecognized
  // class_type, but still use one of the conventional input field names.
  for (const node of Object.values(graph)) {
    const model = firstStringInput(node, MODEL_NAME_FIELDS);
    if (model) return model;
  }
  return undefined;
}

const SAMPLER_TYPES = ["KSampler", "KSamplerAdvanced", "SamplerCustom", "SamplerCustomAdvanced"];
const TEXT_ENCODE_TYPES = ["CLIPTextEncode", "CLIPTextEncodeSDXL", "CLIPTextEncodeSDXLRefiner", "BNK_CLIPTextEncodeAdvanced"];

function resolvePromptText(graph: ComfyGraph, link: unknown): string | undefined {
  if (!isNodeLink(link)) return undefined;
  const node = graph[link[0]];
  if (!node || !TEXT_ENCODE_TYPES.includes(node.class_type ?? "")) return undefined;
  const text = node.inputs?.text;
  return typeof text === "string" ? text : undefined;
}

interface SamplerInfo {
  seed?: number;
  positivePrompt?: string;
  negativePrompt?: string;
  samplerName?: string;
  scheduler?: string;
  steps?: number;
  cfg?: number;
}

function extractSamplerInfo(graph: ComfyGraph): SamplerInfo {
  const sampler = nodesByClassType(graph, SAMPLER_TYPES)[0];
  if (!sampler) return {};
  const inputs = sampler.inputs ?? {};
  const seedValue = inputs.seed ?? inputs.noise_seed;
  return {
    seed: typeof seedValue === "number" ? seedValue : undefined,
    positivePrompt: resolvePromptText(graph, inputs.positive),
    negativePrompt: resolvePromptText(graph, inputs.negative),
    samplerName: typeof inputs.sampler_name === "string" ? inputs.sampler_name : undefined,
    scheduler: typeof inputs.scheduler === "string" ? inputs.scheduler : undefined,
    steps: typeof inputs.steps === "number" ? inputs.steps : undefined,
    cfg: typeof inputs.cfg === "number" ? inputs.cfg : undefined,
  };
}

const LOAD_IMAGE_TYPES = ["LoadImage", "LoadImageMask"];
const LOAD_VIDEO_TYPES = ["VHS_LoadVideo", "VHS_LoadVideoPath", "LoadVideo"];

/** Source-media filenames this generation was built from — each becomes a placeholder asset the new one references, so Feature 1's warning immediately nudges toward retrieving them. */
function extractInputFilenames(graph: ComfyGraph): string[] {
  const filenames: string[] = [];
  for (const node of nodesByClassType(graph, LOAD_IMAGE_TYPES)) {
    const filename = firstStringInput(node, ["image"]);
    if (filename) filenames.push(filename);
  }
  for (const node of nodesByClassType(graph, LOAD_VIDEO_TYPES)) {
    const filename = firstStringInput(node, ["video", "video_path", "file_path"]);
    if (filename) filenames.push(filename);
  }
  return filenames;
}

/**
 * Maps a ComfyUI API-format `prompt` graph (plus its optional UI `workflow`)
 * onto DAICE-Chain asset fields — "import as much as possible": provider/model/
 * prompt/seed where identifiable, the full raw graphs preserved verbatim in
 * `metadata.comfyui` for anything the mapping misses, and placeholder input
 * assets for any `LoadImage`/`LoadVideo` nodes so the provenance chain has
 * somewhere to receive their media. Fields ComfyUI has no equivalent for at
 * all (who ran it, when) are intentionally left unset — same as manually
 * toggling "AI-generated" in the editor, they're flagged for the user to
 * fill in rather than guessed.
 */
export function comfyToAssetPatch(prompt: ComfyGraph | undefined, workflow: unknown, existingIds: Iterable<string>): ComfyAssetImport | null {
  if (!prompt) return null;

  const model = extractModel(prompt);
  const sampler = extractSamplerInfo(prompt);
  const inputFilenames = extractInputFilenames(prompt);

  const comfyMetadata: Record<string, unknown> = { prompt };
  if (workflow !== undefined) comfyMetadata.workflow = workflow;
  if (sampler.negativePrompt) comfyMetadata.negativePrompt = sampler.negativePrompt;
  if (sampler.samplerName) comfyMetadata.samplerName = sampler.samplerName;
  if (sampler.scheduler) comfyMetadata.scheduler = sampler.scheduler;
  if (sampler.steps !== undefined) comfyMetadata.steps = sampler.steps;
  if (sampler.cfg !== undefined) comfyMetadata.cfg = sampler.cfg;

  const takenIds = new Set(existingIds);
  const inputAssets: DaiceAsset[] = inputFilenames.map((filename) => {
    const id = deriveAssetId(filename, takenIds);
    takenIds.add(id);
    return {
      id,
      aiGenerated: false,
      mediaPath: `assets/${filename}`,
      mediaMimeType: guessMimeTypeFromFilename(filename),
      references: [],
    };
  });

  const patch: Partial<DaiceAsset> = {
    aiGenerated: true,
    provider: "Local (ComfyUI)",
    metadata: { comfyui: comfyMetadata },
    references: inputAssets.map((asset) => ({ assetId: asset.id })),
  };
  if (model) patch.model = model;
  if (sampler.positivePrompt !== undefined) patch.prompt = sampler.positivePrompt;
  if (sampler.seed !== undefined) patch.seed = sampler.seed;

  return { patch, inputAssets };
}
