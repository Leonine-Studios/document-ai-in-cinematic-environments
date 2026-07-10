import { useEffect, useRef } from "react";
import { FileText } from "lucide-react";
import type { PendingFile } from "@/state/editorState";
import { cn } from "@/lib/utils";

function resolveMediaType(pending: PendingFile | undefined, mimeType: string): string {
  return pending?.file.type || mimeType || "";
}

export function MediaThumb({
  pending,
  mimeType,
  className,
}: {
  pending?: PendingFile;
  mimeType: string;
  className?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const type = resolveMediaType(pending, mimeType);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !type.startsWith("video/")) return;

    function seekToPoster() {
      if (video && Number.isFinite(video.duration) && video.duration > 0) {
        video.currentTime = Math.min(0.1, video.duration / 2);
      }
    }

    video.addEventListener("loadedmetadata", seekToPoster);
    if (video.readyState >= 1) seekToPoster();
    return () => video.removeEventListener("loadedmetadata", seekToPoster);
  }, [pending?.objectUrl, type]);

  if (!pending) {
    // Amber, not neutral: no media attached is worth noticing at a glance,
    // even before checking whether anything actually references this asset.
    // See lib/mediaWarnings.ts and MediaWarningsBanner for the row/package
    // level views of the same signal.
    return (
      <div className={cn("h-7 w-7 shrink-0 rounded border border-dashed border-warning/50 bg-warning/5", className)} title="No media attached yet" />
    );
  }

  if (type.startsWith("image/")) {
    return (
      <img
        src={pending.objectUrl}
        alt=""
        className={cn("h-7 w-7 shrink-0 rounded border border-border object-cover", className)}
      />
    );
  }

  if (type.startsWith("video/")) {
    return (
      <video
        ref={videoRef}
        src={pending.objectUrl}
        muted
        playsInline
        preload="metadata"
        className={cn("h-7 w-7 shrink-0 rounded border border-border object-cover", className)}
      />
    );
  }

  return (
    <div
      className={cn(
        "flex h-7 w-7 shrink-0 items-center justify-center rounded border border-border bg-muted text-muted-foreground",
        className,
      )}
      title={pending.file.name}
    >
      <FileText className="h-3.5 w-3.5" />
    </div>
  );
}
