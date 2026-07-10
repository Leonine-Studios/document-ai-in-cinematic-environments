import JSZip from "jszip";
import { validatePackage, type DaicePackage, type ValidationError } from "@leoninestudios/daice-chain-core";
import type { PendingFile } from "../state/editorState";

export type ImportResult =
  | { ok: true; pkg: DaicePackage; pendingFiles: Map<string, PendingFile> }
  | { ok: false; errors: ValidationError[] };

function basename(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

async function readZip(file: File): Promise<{ data: unknown; pendingFiles: Map<string, PendingFile> } | ValidationError[]> {
  const zip = await JSZip.loadAsync(file);
  const manifestEntry = zip.file("daice.json");
  if (!manifestEntry) {
    return [{ path: "(root)", message: "The .zip does not contain a daice.json file at its root." }];
  }

  let data: unknown;
  try {
    data = JSON.parse(await manifestEntry.async("string"));
  } catch (error) {
    return [{ path: "(root)", message: `daice.json is not valid JSON: ${(error as Error).message}` }];
  }

  // Build a mediaPath -> asset-id lookup once we know the shape is at least
  // parseable JSON, so we only load blobs for assets that will actually be
  // used (validated for real just below, in importPackage).
  const pendingFiles = new Map<string, PendingFile>();
  const assets = Array.isArray((data as { assets?: unknown })?.assets) ? (data as { assets: unknown[] }).assets : [];
  const mediaPathToAssetId = new Map<string, string>();
  for (const asset of assets) {
    const a = asset as { id?: unknown; mediaPath?: unknown; mediaMimeType?: unknown };
    if (typeof a?.id === "string" && typeof a?.mediaPath === "string") {
      mediaPathToAssetId.set(a.mediaPath, a.id);
    }
  }

  await Promise.all(
    Object.keys(zip.files)
      .filter((path) => path.startsWith("assets/") && !zip.files[path].dir)
      .map(async (path) => {
        const assetId = mediaPathToAssetId.get(path);
        if (!assetId) return; // file in the zip but not referenced by any asset — ignore
        const blob = await zip.files[path].async("blob");
        const mimeType =
          (assets.find((a) => (a as { id?: unknown }).id === assetId) as { mediaMimeType?: string } | undefined)
            ?.mediaMimeType ?? blob.type;
        const file = new File([blob], basename(path), { type: mimeType || undefined });
        pendingFiles.set(assetId, { file, objectUrl: URL.createObjectURL(file) });
      }),
  );

  return { data, pendingFiles };
}

async function readBareJson(
  file: File,
): Promise<{ data: unknown; pendingFiles: Map<string, PendingFile> } | ValidationError[]> {
  let data: unknown;
  try {
    data = JSON.parse(await file.text());
  } catch (error) {
    return [{ path: "(root)", message: `File is not valid JSON: ${(error as Error).message}` }];
  }
  return { data, pendingFiles: new Map<string, PendingFile>() };
}

/**
 * Imports a package from either a `.zip` bundle or a bare `daice.json` file,
 * validating it via `@leoninestudios/daice-chain-core`'s `validatePackage` before ever touching
 * editor state — a failed validation never partially loads. See
 * docs/planning/04-editor.md, deliverable 5.
 */
export async function importPackage(file: File): Promise<ImportResult> {
  const isZip = file.name.toLowerCase().endsWith(".zip") || file.type === "application/zip";

  const read = isZip ? await readZip(file) : await readBareJson(file);
  if (Array.isArray(read)) return { ok: false, errors: read };

  const result = validatePackage(read.data);
  if (!result.valid) return { ok: false, errors: result.errors };

  return { ok: true, pkg: result.package, pendingFiles: read.pendingFiles };
}
