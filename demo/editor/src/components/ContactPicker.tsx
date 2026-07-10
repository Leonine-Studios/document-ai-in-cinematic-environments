import { useMemo, useState } from "react";
import type { Contact } from "@daice-chain/core";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { cn } from "@/lib/utils";

/**
 * Name + email pair with an autocomplete popover suggesting previously used
 * contacts (from the localStorage registry and the currently open package).
 * Picking a suggestion fills both fields together, since the spec always
 * couples them as one `Contact` object (spec/README.md §2.4) — free-form
 * entry remains fully supported, there is no registrar in the spec itself.
 */
export function ContactPicker({
  idPrefix,
  label,
  value,
  suggestions,
  nameError,
  emailError,
  onChange,
}: {
  idPrefix: string;
  label: string;
  value: Contact;
  suggestions: Contact[];
  nameError?: string | null;
  emailError?: string | null;
  onChange: (contact: Contact) => void;
}) {
  const [open, setOpen] = useState(false);

  const filtered = useMemo(() => {
    const query = value.name.trim().toLowerCase();
    const pool = query ? suggestions.filter((c) => c.name.toLowerCase().includes(query)) : suggestions;
    // De-dupe by name+email, cap the list so the popover stays scannable.
    const seen = new Set<string>();
    const result: Contact[] = [];
    for (const contact of pool) {
      const key = `${contact.name.toLowerCase()}\u0000${(contact.email ?? "").toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(contact);
      if (result.length >= 8) break;
    }
    return result;
  }, [suggestions, value.name]);

  return (
    <div className="grid grid-cols-2 gap-3">
      <Popover open={open && filtered.length > 0} onOpenChange={setOpen}>
        <Field label={`${label} (name)`} htmlFor={`${idPrefix}-name`} error={nameError}>
          <PopoverAnchor asChild>
            <Input
              id={`${idPrefix}-name`}
              value={value.name}
              aria-invalid={!!nameError}
              onFocus={() => setOpen(true)}
              onChange={(e) => {
                onChange({ ...value, name: e.target.value });
                setOpen(true);
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape") setOpen(false);
              }}
              placeholder="Name or organisation"
              autoComplete="off"
            />
          </PopoverAnchor>
        </Field>
        <PopoverContent onOpenAutoFocus={(e) => e.preventDefault()} className="max-h-56 overflow-y-auto p-1">
          {filtered.map((contact, index) => (
            <button
              key={`${contact.name}-${contact.email ?? ""}-${index}`}
              type="button"
              className={cn("flex w-full flex-col items-start rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent")}
              onMouseDown={(e) => {
                e.preventDefault(); // keep focus on the input, avoid a blur-before-click race
                onChange(contact);
                setOpen(false);
              }}
            >
              <span className="font-medium">{contact.name}</span>
              {contact.email && <span className="text-xs text-muted-foreground">{contact.email}</span>}
            </button>
          ))}
        </PopoverContent>
      </Popover>

      <Field
        label={`${label} (email)`}
        htmlFor={`${idPrefix}-email`}
        error={emailError}
        hint="Recommended — a contact email for this person or organisation."
      >
        <Input
          id={`${idPrefix}-email`}
          type="email"
          value={value.email ?? ""}
          aria-invalid={!!emailError}
          onChange={(e) => onChange({ ...value, email: e.target.value || undefined })}
          placeholder="name@example.com"
        />
      </Field>
    </div>
  );
}
