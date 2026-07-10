import { useState } from "react";
import { Archive, FileJson, FileSpreadsheet, FileText, Redo2, Undo2, X } from "lucide-react";
import { validatePackage, type DaicePackage } from "@daice-chain/core";
import { useEditorDispatch, useEditorHistory } from "@/state/EditorProvider";
import type { PendingFile } from "@/state/editorState";
import { exportZip, exportDaiceJson } from "@/io/exportZip";
import { exportOverviewXlsx } from "@/io/exportXlsx";
import { exportOverviewPdf } from "@/io/exportPdf";
import { assetsWithCompletenessGaps } from "@/lib/completenessHints";
import { Button } from "@/components/ui/button";
import { ErrorPanel } from "@/components/ErrorPanel";

/**
 * Export guard: `validatePackage` (the exact function used on import) runs
 * against current state before anything is written, so the editor can never
 * hand out a package it wouldn't accept back in. See
 * docs/planning/04-editor.md Part D.
 */
export function Toolbar({ pkg, pendingFiles }: { pkg: DaicePackage; pendingFiles: Map<string, PendingFile> }) {
  const dispatch = useEditorDispatch();
  const { undo, redo, canUndo, canRedo } = useEditorHistory();
  const [guardErrors, setGuardErrors] = useState<ReturnType<typeof validatePackage>["errors"] | null>(null);
  const [completenessNote, setCompletenessNote] = useState<string | null>(null);

  function guarded(run: () => void) {
    const result = validatePackage(pkg);
    if (!result.valid) {
      setGuardErrors(result.errors);
      setCompletenessNote(null);
      return;
    }
    setGuardErrors(null);

    // Non-blocking reminder at the moment of hand-off: the package is valid,
    // but some assets are still missing a recommended field. See
    // lib/completenessHints.ts and CompletenessBanner for the same signal
    // shown persistently above the table.
    const gapCount = assetsWithCompletenessGaps(pkg).length;
    setCompletenessNote(
      gapCount > 0 ? `Package is valid — ${gapCount} asset${gapCount === 1 ? "" : "s"} ${gapCount === 1 ? "is" : "are"} missing a recommended field.` : null,
    );
    run();
  }

  function handleClose() {
    if (window.confirm("Close this package? Everything is in-memory only — unexported changes will be lost.")) {
      dispatch({ type: "CLOSE_PACKAGE" });
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-2">
        <Button variant="ghost" size="icon" title="Undo (Ctrl+Z)" disabled={!canUndo} onClick={undo}>
          <Undo2 className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" title="Redo (Ctrl+Shift+Z)" disabled={!canRedo} onClick={redo}>
          <Redo2 className="h-4 w-4" />
        </Button>
        <span className="mx-1 h-5 w-px bg-border" />
        <Button size="sm" onClick={() => guarded(() => exportZip(pkg, pendingFiles))}>
          <Archive className="h-4 w-4" /> Export .zip
        </Button>
        <Button variant="outline" size="sm" onClick={() => guarded(() => exportDaiceJson(pkg))}>
          <FileJson className="h-4 w-4" /> Save daice.json
        </Button>
        <span className="mx-1 h-5 w-px bg-border" />
        <span className="text-xs text-muted-foreground">Overview:</span>
        <Button variant="ghost" size="sm" onClick={() => guarded(() => exportOverviewXlsx(pkg))}>
          <FileSpreadsheet className="h-4 w-4" /> Excel
        </Button>
        <Button variant="ghost" size="sm" onClick={() => guarded(() => exportOverviewPdf(pkg))}>
          <FileText className="h-4 w-4" /> PDF
        </Button>
        <Button variant="ghost" size="sm" className="ml-auto text-destructive hover:text-destructive" onClick={handleClose}>
          <X className="h-4 w-4" /> Close
        </Button>
      </div>

      {guardErrors && (
        <ErrorPanel
          title="Can't export — package is not yet valid"
          lede="Fix these fields (open the asset or the package header) before exporting; an invalid package would fail to re-import."
          errors={guardErrors}
          onDismiss={() => setGuardErrors(null)}
        />
      )}

      {completenessNote && (
        <div role="status" className="flex items-center gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
          <span>{completenessNote}</span>
          <Button
            variant="ghost"
            size="icon"
            className="ml-auto h-5 w-5 shrink-0 text-warning hover:text-warning"
            title="Dismiss"
            onClick={() => setCompletenessNote(null)}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      )}
    </div>
  );
}
