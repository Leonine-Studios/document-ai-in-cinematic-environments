import { FileText, UploadCloud } from "lucide-react";
import type { PendingFile } from "@/state/editorState";
import { cn } from "@/lib/utils";

export function MediaPreview({
  pending,
  mimeType,
  dropActive = false,
  variant = "panel",
  mediaKey,
}: {
  pending?: PendingFile;
  mimeType: string;
  dropActive?: boolean;
  variant?: "panel" | "player";
  /** Remount video/audio when navigating between assets. */
  mediaKey?: string;
}) {
  const type = pending?.file.type || mimeType;

  if (variant === "player") {
    if (!pending) return null;
    if (type.startsWith("image/")) {
      return <img src={pending.objectUrl} alt="" className="max-h-[70vh] max-w-full object-contain" />;
    }
    if (type.startsWith("video/")) {
      return (
        <video key={mediaKey} src={pending.objectUrl} controls className="max-h-[70vh] max-w-full object-contain" />
      );
    }
    if (type.startsWith("audio/")) {
      return <audio key={mediaKey} src={pending.objectUrl} controls className="w-full max-w-md" />;
    }
    return (
      <div className="flex flex-col items-center gap-2 text-center text-sm text-muted-foreground">
        <FileText className="h-10 w-10" />
        <p className="break-all">{pending.file.name}</p>
        <p>{(pending.file.size / 1024).toFixed(1)} KB</p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex aspect-square w-full flex-col items-center justify-center gap-2 overflow-hidden rounded-md border border-dashed border-border bg-muted p-3 text-center text-xs text-muted-foreground",
        dropActive && "drop-target-valid",
      )}
    >
      {!pending ? (
        <>
          <UploadCloud className="h-8 w-8" />
          <p>Drop a file here, or use the picker below</p>
        </>
      ) : type.startsWith("image/") ? (
        <img src={pending.objectUrl} alt="" className="h-full w-full object-contain" />
      ) : type.startsWith("video/") ? (
        <video src={pending.objectUrl} controls className="h-full w-full object-contain" />
      ) : type.startsWith("audio/") ? (
        <audio src={pending.objectUrl} controls className="w-full" />
      ) : (
        <>
          <FileText className="h-8 w-8" />
          <p className="break-all">{pending.file.name}</p>
          <p>{(pending.file.size / 1024).toFixed(1)} KB</p>
        </>
      )}
    </div>
  );
}
