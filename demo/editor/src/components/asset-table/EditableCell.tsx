import { useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Click-to-edit table cell: click/Enter starts editing, Enter commits,
 * Escape reverts and exits — no separate save step. Used for the asset
 * table's inline-editable text columns (id, provider, model, prompt). See
 * docs/planning/04-editor.md Part B.
 */
export function EditableCell({
  value,
  placeholder,
  onCommit,
  multiline = false,
  className,
  monospace = false,
  type = "text",
  invalid = false,
  invalidTitle,
  suggestions,
}: {
  value: string;
  placeholder?: string;
  onCommit: (next: string) => string | void; // return an error message to keep editing, or undefined/"" to accept
  multiline?: boolean;
  className?: string;
  monospace?: boolean;
  type?: "text" | "datetime-local";
  /** Marks the cell as failing schema validation even while not being edited — e.g. a required-when-AI field left blank. */
  invalid?: boolean;
  invalidTitle?: string;
  /** Previously-used values (e.g. remembered providers/models) offered as a native dropdown while editing. */
  suggestions?: string[];
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const datalistId = useId();

  function startEditing() {
    setDraft(value);
    setError(null);
    setEditing(true);
  }

  function commit() {
    if (draft === value) {
      setEditing(false);
      return;
    }
    const result = onCommit(draft);
    if (result) {
      setError(result);
      return; // stay in edit mode so the user can fix it
    }
    setEditing(false);
    setError(null);
  }

  function cancel() {
    setDraft(value);
    setError(null);
    setEditing(false);
  }

  if (editing) {
    const Comp = multiline ? "textarea" : "input";
    return (
      <div className="relative">
        <Comp
          ref={ref as never}
          autoFocus
          type={!multiline ? type : undefined}
          list={!multiline && suggestions ? datalistId : undefined}
          value={draft}
          rows={multiline ? 2 : undefined}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter" && !multiline) {
              e.preventDefault();
              commit();
            } else if (e.key === "Escape") {
              e.preventDefault();
              cancel();
            }
          }}
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "w-full rounded border border-ring bg-background px-1.5 py-0.5 text-sm outline-none",
            monospace && "font-mono text-xs",
            error && "border-destructive",
          )}
        />
        {!multiline && suggestions && (
          <datalist id={datalistId}>
            {suggestions.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        )}
        {error && <p className="absolute left-0 top-full z-10 mt-0.5 whitespace-nowrap rounded bg-destructive px-1.5 py-0.5 text-xs text-destructive-foreground">{error}</p>}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        startEditing();
      }}
      className={cn(
        "w-full truncate rounded px-1.5 py-0.5 text-left text-sm hover:bg-accent",
        !value && "text-muted-foreground",
        monospace && "font-mono text-xs",
        invalid && "ring-1 ring-inset ring-destructive/70 bg-destructive/5 text-destructive",
        className,
      )}
      title={invalid ? invalidTitle : value || placeholder}
    >
      {value || placeholder || "—"}
    </button>
  );
}
