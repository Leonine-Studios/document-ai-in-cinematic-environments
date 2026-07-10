import { useMemo } from "react";
import type { DaicePackage } from "@leoninestudios/daice-chain-core";
import { useEditorDispatch } from "@/state/EditorProvider";
import { loadContactRegistry, rememberContact } from "@/state/contactRegistry";
import { validatePackageMetaDraft } from "@/lib/fieldValidation";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ContactPicker } from "@/components/ContactPicker";

export function PackageHeader({ pkg }: { pkg: DaicePackage }) {
  const dispatch = useEditorDispatch();
  const errors = useMemo(() => validatePackageMetaDraft(pkg.package), [pkg.package]);
  const suggestions = useMemo(() => loadContactRegistry(), [pkg.package.createdBy.name, pkg.package.createdBy.email]);

  return (
    <header className="flex flex-wrap items-end gap-4 rounded-lg border border-border bg-card p-4">
      <Field label="Package name" htmlFor="pkg-name" error={errors["packageName"]} className="min-w-[220px] flex-1">
        <Input
          id="pkg-name"
          placeholder="e.g. vendorxyz_contract123"
          value={pkg.package.packageName}
          aria-invalid={!!errors["packageName"]}
          onChange={(e) => dispatch({ type: "UPDATE_PACKAGE_META", patch: { packageName: e.target.value } })}
        />
      </Field>

      <Field label="Description" htmlFor="pkg-description" error={errors["description"]} className="min-w-[260px] flex-[2]">
        <Textarea
          id="pkg-description"
          rows={1}
          placeholder="Optional — what this package is, in plain language"
          value={pkg.package.description ?? ""}
          onChange={(e) => dispatch({ type: "UPDATE_PACKAGE_META", patch: { description: e.target.value || undefined } })}
        />
      </Field>

      <div className="min-w-[320px]">
        <ContactPicker
          idPrefix="pkg-createdby"
          label="Created by"
          value={pkg.package.createdBy}
          suggestions={suggestions}
          nameError={errors["createdBy"] ?? errors["createdBy.name"]}
          emailError={errors["createdBy.email"]}
          onChange={(contact) => {
            dispatch({ type: "UPDATE_PACKAGE_META", patch: { createdBy: contact } });
            if (contact.name.trim()) rememberContact(contact);
          }}
        />
      </div>

      <div className="ml-auto flex flex-col items-end gap-0.5 text-xs text-muted-foreground">
        <span title={pkg.package.id}>id: {pkg.package.id}</span>
        <span>created: {new Date(pkg.package.createdAt).toLocaleString()}</span>
        <span>{pkg.assets.length} asset(s)</span>
      </div>
    </header>
  );
}
