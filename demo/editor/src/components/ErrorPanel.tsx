import { AlertTriangle } from "lucide-react";
import type { ValidationError } from "@daice-chain/core";
import { Button } from "@/components/ui/button";

export function ErrorPanel({
  title = "This file isn't a valid DAICE-Chain package",
  lede = "Nothing was loaded — a malformed package is never partially imported. The following issues were found:",
  errors,
  onDismiss,
}: {
  title?: string;
  lede?: string;
  errors: ValidationError[];
  onDismiss: () => void;
}) {
  return (
    <div role="alert" className="flex flex-col gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-4">
      <div className="flex items-center gap-2 font-semibold text-destructive">
        <AlertTriangle className="h-4 w-4" />
        {title}
      </div>
      <p className="text-sm text-muted-foreground">{lede}</p>
      <ul className="flex flex-col gap-1 text-sm">
        {errors.map((error, index) => (
          <li key={index}>
            <code className="rounded bg-background px-1 py-0.5 text-xs">{error.path}</code> — {error.message}
          </li>
        ))}
      </ul>
      <Button variant="outline" size="sm" className="self-start" onClick={onDismiss}>
        Dismiss
      </Button>
    </div>
  );
}
