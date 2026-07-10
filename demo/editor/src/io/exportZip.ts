import JSZip from "jszip";
import type { DaicePackage } from "@daice-chain/core";
import type { PendingFile } from "../state/editorState";
import { downloadBlob } from "../utils/download";

// The Phase 3 viewer template, imported as raw text so it can be copied
// verbatim into every exported bundle with the package's own data inlined
// into its #daice-chain-data script block (see demo/viewer/viewer.js's
// tryInlineData()). Importing the real template — rather than keeping a
// duplicated copy in this app — means it can never drift out of sync with
// docs/planning/03-viewer.md.
import viewerHtmlTemplate from "../../../viewer/index.html?raw";
import viewerJs from "../../../viewer/viewer.js?raw";
import viewerCss from "../../../viewer/viewer.css?raw";

const EMPTY_DAICE_DATA_TAG = '<script id="daice-chain-data" type="application/json" hidden></script>';

function inlinePackageData(pkg: DaicePackage): string {
  const json = JSON.stringify(pkg, null, 2);
  const inlined = `<script id="daice-chain-data" type="application/json" hidden>\n${json}\n  </script>`;
  if (!viewerHtmlTemplate.includes(EMPTY_DAICE_DATA_TAG)) {
    throw new Error("Viewer template's #daice-chain-data placeholder was not found — has demo/viewer/index.html changed shape?");
  }
  return viewerHtmlTemplate.replace(EMPTY_DAICE_DATA_TAG, inlined);
}

/**
 * Assembles the exact Phase 1 bundle layout (daice.json, assets/, an
 * OPTIONAL index.html viewer) from the current in-memory state and triggers
 * a `.zip` download. See spec/README.md §3 and docs/planning/04-editor.md
 * deliverable 6.
 */
export function exportZip(pkg: DaicePackage, pendingFiles: Map<string, PendingFile>): void {
  const zip = new JSZip();
  zip.file("daice.json", JSON.stringify(pkg, null, 2));

  for (const asset of pkg.assets) {
    if (!asset.mediaPath) continue;
    const pending = pendingFiles.get(asset.id);
    if (!pending) continue; // mediaPath set but no blob attached in this session — same as any unresolved reference
    zip.file(asset.mediaPath, pending.file);
  }

  zip.file("index.html", inlinePackageData(pkg));
  zip.file("viewer.js", viewerJs);
  zip.file("viewer.css", viewerCss);

  zip.generateAsync({ type: "blob" }).then((blob) => {
    const filename = `${pkg.package.packageName || pkg.package.id || "daice-chain-package"}.daice.zip`;
    downloadBlob(blob, filename.replace(/[\\/:*?"<>|]+/g, "_"));
  });
}

/** Saves just `daice.json`, for a lighter-weight hand-off meant for later re-import. */
export function exportDaiceJson(pkg: DaicePackage): void {
  const blob = new Blob([JSON.stringify(pkg, null, 2)], { type: "application/json" });
  downloadBlob(blob, "daice.json");
}
