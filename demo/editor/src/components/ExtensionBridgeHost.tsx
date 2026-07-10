import { useEffect, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { useExtensionBridge, type BridgeConnectionState } from "@/bridge/useExtensionBridge";
import { generateId } from "@/utils/id";

interface PushToast {
  id: string;
  message: string;
}

const TOAST_DURATION_MS = 4000;

/**
 * Invisible by default — runs the extension bridge's heartbeat/poll loop
 * (see useExtensionBridge.ts) for as long as the editor is mounted, and
 * pops a brief toast whenever a push from the Magnific extension gets
 * applied. Reports live connection state via `onStateChange` so App.tsx's
 * header chip can reflect it without running a second bridge loop. See
 * BRIDGE.md.
 */
export function ExtensionBridgeHost({ onStateChange }: { onStateChange?: (state: BridgeConnectionState) => void }) {
  const [toasts, setToasts] = useState<PushToast[]>([]);

  const state = useExtensionBridge((addedCount) => {
    const toast: PushToast = {
      id: generateId("toast"),
      message: `Added ${addedCount} asset${addedCount === 1 ? "" : "s"} from the Magnific extension`,
    };
    setToasts((prev) => [...prev, toast]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== toast.id)), TOAST_DURATION_MS);
  });

  useEffect(() => {
    onStateChange?.(state);
  }, [state, onStateChange]);

  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((toast) => (
        <div key={toast.id} className="flex items-center gap-2 rounded-md border border-ai/40 bg-card px-3 py-2 text-sm shadow-md">
          <CheckCircle2 className="h-4 w-4 text-ai" />
          {toast.message}
        </div>
      ))}
    </div>
  );
}
