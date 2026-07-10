import { useEffect, useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import type { DaicePackage } from "@daice-chain/core";
import type { PendingFile } from "@/state/editorState";
import { assetsMissingMedia } from "@/lib/mediaWarnings";
import { Button } from "@/components/ui/button";

/**
 * Non-blocking, package-wide nudge toward a complete provenance chain: every
 * asset — root output or referenced input alike — still needs its media
 * attached before the chain is fully retrievable. Purely advisory: unlike
 * `ErrorPanel`, this never blocks export, since a valid DAICE-Chain package can
 * legitimately omit media a writer doesn't have yet (spec/README.md §3).
 * See TreeRow's per-row warning icon and MediaThumb's amber empty state for
 * the row-level view of the same signal.
 */
export function MediaWarningsBanner({ pkg, pendingFiles }: { pkg: DaicePackage; pendingFiles: Map<string, PendingFile> }) {
  const [dismissed, setDismissed] = useState(false);

  // A freshly opened/imported package should always get a chance to show
  // this once, even if the previous package's banner had been dismissed.
  useEffect(() => setDismissed(false), [pkg.package.id]);

  const missing = assetsMissingMedia(pkg, pendingFiles);
  if (missing.length === 0 || dismissed) return null;

  return (
    <div role="status" className="flex items-center gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning">
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <span>
        {missing.length} asset{missing.length === 1 ? "" : "s"} {missing.length === 1 ? "has" : "have"} no media attached — the provenance chain isn't
        fully retrievable yet.
      </span>
      <Button variant="ghost" size="icon" className="ml-auto h-6 w-6 shrink-0 text-warning hover:text-warning" title="Dismiss" onClick={() => setDismissed(true)}>
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
