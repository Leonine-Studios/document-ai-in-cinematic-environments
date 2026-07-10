import { useEffect, useState } from "react";
import { Info, X } from "lucide-react";
import type { DaicePackage } from "@daice-chain/core";
import { assetsWithCompletenessGaps } from "@/lib/completenessHints";
import { Button } from "@/components/ui/button";

/**
 * Non-blocking, package-wide nudge toward filling in every SHOULD/MAY field
 * the specification recommends (spec/README.md §2.3) — seed, media MIME
 * type, and generation-contact email. Distinct from MediaWarningsBanner,
 * which tracks missing media files specifically. Never blocks export: a
 * valid package may legitimately omit any of these. See TreeRow's matching
 * per-row icon for the row-level view of the same signal.
 */
export function CompletenessBanner({ pkg }: { pkg: DaicePackage }) {
  const [dismissed, setDismissed] = useState(false);

  // A freshly opened/imported package should always get a chance to show
  // this once, even if the previous package's banner had been dismissed.
  useEffect(() => setDismissed(false), [pkg.package.id]);

  const withGaps = assetsWithCompletenessGaps(pkg);
  if (withGaps.length === 0 || dismissed) return null;

  return (
    <div role="status" className="flex items-center gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning">
      <Info className="h-4 w-4 shrink-0" />
      <span>
        {withGaps.length} asset{withGaps.length === 1 ? "" : "s"} {withGaps.length === 1 ? "is" : "are"} missing a recommended field (seed, media MIME
        type, or contact email) — the package is still valid.
      </span>
      <Button variant="ghost" size="icon" className="ml-auto h-6 w-6 shrink-0 text-warning hover:text-warning" title="Dismiss" onClick={() => setDismissed(true)}>
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
