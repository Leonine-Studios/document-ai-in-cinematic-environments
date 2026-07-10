import { useEffect } from "react";
import { ChevronLeft, ChevronRight, FileQuestion } from "lucide-react";
import type { DaicePackage } from "@daice-chain/core";
import type { PendingFile } from "@/state/editorState";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { MediaPreview } from "./MediaPreview";

export function AssetPlayerOverlay({
  pkg,
  pendingFiles,
  assetId,
  onAssetChange,
  onClose,
  onEditDetails,
}: {
  pkg: DaicePackage;
  pendingFiles: Map<string, PendingFile>;
  assetId: string;
  onAssetChange: (assetId: string) => void;
  onClose: () => void;
  onEditDetails: (assetId: string) => void;
}) {
  const assetIds = pkg.assets.map((a) => a.id);
  const index = assetIds.indexOf(assetId);
  const asset = pkg.assets[index];
  const pending = asset ? pendingFiles.get(asset.id) : undefined;
  const hasPrev = index > 0;
  const hasNext = index < assetIds.length - 1;

  function goPrev() {
    if (hasPrev) onAssetChange(assetIds[index - 1]!);
  }

  function goNext() {
    if (hasNext) onAssetChange(assetIds[index + 1]!);
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        e.stopPropagation();
        goPrev();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        e.stopPropagation();
        goNext();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, assetIds]);

  if (!asset) return null;

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="flex max-h-[90vh] max-w-[min(96vw,1400px)] flex-col gap-4 p-4 sm:p-6">
        <DialogHeader className="flex-row items-center justify-between space-y-0 pr-8">
          <DialogTitle className="truncate text-base font-semibold">{asset.id}</DialogTitle>
          <span className="shrink-0 text-sm text-muted-foreground">
            {index + 1} / {assetIds.length}
          </span>
        </DialogHeader>

        <div className="relative flex min-h-[40vh] flex-1 items-center justify-center">
          <Button
            variant="outline"
            size="icon"
            className="absolute left-0 top-1/2 z-10 -translate-y-1/2"
            disabled={!hasPrev}
            onClick={goPrev}
            title="Previous asset (Left arrow)"
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>

          <div className="flex w-full items-center justify-center px-12">
            {pending ? (
              <MediaPreview
                pending={pending}
                mimeType={asset.mediaMimeType ?? ""}
                variant="player"
                mediaKey={asset.id}
              />
            ) : (
              <div className="flex flex-col items-center gap-2 text-center text-sm text-muted-foreground">
                <FileQuestion className="h-10 w-10" />
                <p>No media attached</p>
                {asset.mediaPath && <p className="break-all text-xs">{asset.mediaPath}</p>}
              </div>
            )}
          </div>

          <Button
            variant="outline"
            size="icon"
            className="absolute right-0 top-1/2 z-10 -translate-y-1/2"
            disabled={!hasNext}
            onClick={goNext}
            title="Next asset (Right arrow)"
          >
            <ChevronRight className="h-5 w-5" />
          </Button>
        </div>

        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={() => onEditDetails(asset.id)}>
            Edit details
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
