import { validatePackage, type DaicePackage } from "@daice-chain/core";
import type { PendingFile } from "../state/editorState";

// The Phase 1 demo package is the canonical example shipped at
// demo/examples/demo-package/ (see spec/README.md §7). Importing it directly
// (rather than duplicating a copy inside the editor) keeps the "Load demo
// project" button honest about matching the real reference package.
import demoPackageJson from "../../../examples/demo-package/daice.json";

const demoAssetModules = import.meta.glob<string>("../../../examples/demo-package/assets/*.png", {
  query: "?url",
  import: "default",
  eager: true,
});

function basename(modulePath: string): string {
  return modulePath.slice(modulePath.lastIndexOf("/") + 1);
}

const demoAssetUrlsByBasename = new Map<string, string>(
  Object.entries(demoAssetModules).map(([modulePath, url]) => [basename(modulePath), url]),
);

/**
 * Loads the Phase 1 demo package into editor state shape: a validated
 * DaicePackage plus a pending-file map built from its bundled assets/. Any
 * `mediaPath` with no matching bundled file (the package's deliberate
 * "missing texture" fixture) is simply left out of the map, same as a real
 * missing file would be. Assets are binary (PNG), so each is fetched from
 * its bundled URL rather than inlined as raw text.
 */
export async function loadDemoPackage(): Promise<{ pkg: DaicePackage; pendingFiles: Map<string, PendingFile> }> {
  const result = validatePackage(demoPackageJson);
  if (!result.valid) {
    // The shipped demo package is expected to always be valid; a failure
    // here means the fixture and @daice-chain/core have drifted apart.
    throw new Error(`Bundled demo package failed validation: ${result.errors.map((e) => e.path).join(", ")}`);
  }

  const pendingFiles = new Map<string, PendingFile>();
  for (const asset of result.package.assets) {
    if (!asset.mediaPath) continue;
    const url = demoAssetUrlsByBasename.get(basename(asset.mediaPath));
    if (url === undefined) continue;
    const blob = await (await fetch(url)).blob();
    const file = new File([blob], basename(asset.mediaPath), { type: asset.mediaMimeType ?? "image/png" });
    pendingFiles.set(asset.id, { file, objectUrl: URL.createObjectURL(file) });
  }

  return { pkg: result.package, pendingFiles };
}
