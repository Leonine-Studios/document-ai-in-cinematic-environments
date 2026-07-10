import { useMemo, useState, type DragEvent } from "react";
import { Sparkles } from "lucide-react";
import type { DaiceAsset, DaicePackage } from "@leoninestudios/daice-chain-core";
import { useEditorDispatch } from "@/state/EditorProvider";
import type { PendingFile } from "@/state/editorState";
import { collectPackageContacts, loadContactRegistry, rememberContact } from "@/state/contactRegistry";
import {
  collectPackageProvidersAndModels,
  dedupeCaseInsensitive,
  loadModelRegistry,
  loadProviderRegistry,
  rememberModel,
  rememberProvider,
} from "@/state/providerModelRegistry";
import { validateAssetDraft } from "@/lib/fieldValidation";
import { SUGGESTED_MIME_TYPES, guessMimeTypeFromFilename } from "@/lib/mimeTypes";
import { generateId } from "@/utils/id";
import { deriveAssetId } from "@/utils/deriveAssetId";
import { extractComfyMetadata } from "@/io/comfy/extractComfyMetadata";
import { comfyToAssetPatch, type ComfyAssetImport } from "@/io/comfy/comfyToAsset";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/ui/field";
import { ContactPicker } from "@/components/ContactPicker";
import { MediaPreview } from "./MediaPreview";

interface AssetDraft {
  id: string;
  aiGenerated: boolean;
  provider: string;
  model: string;
  prompt: string;
  generatedByName: string;
  generatedByEmail: string;
  generatedAt: string;
  seed: string;
  mediaPath: string;
  mediaMimeType: string;
  timecodeIn: string;
  timecodeOut: string;
}

function toDraft(asset?: DaiceAsset): AssetDraft {
  return {
    id: asset?.id ?? generateId("asset"),
    aiGenerated: asset?.aiGenerated ?? true,
    provider: asset?.provider ?? "",
    model: asset?.model ?? "",
    prompt: asset?.prompt ?? "",
    generatedByName: asset?.generatedBy?.name ?? "",
    generatedByEmail: asset?.generatedBy?.email ?? "",
    generatedAt: asset?.generatedAt ?? new Date().toISOString(),
    seed: asset?.seed !== undefined ? String(asset.seed) : "",
    mediaPath: asset?.mediaPath ?? "",
    mediaMimeType: asset?.mediaMimeType ?? "",
    timecodeIn: asset?.timecodeIn ?? "",
    timecodeOut: asset?.timecodeOut ?? "",
  };
}

function toAsset(draft: AssetDraft, references: DaiceAsset["references"]): DaiceAsset {
  // `handleSave` dispatches this whole object as an UPDATE_ASSET patch, and
  // that reducer does a shallow `{...asset, ...patch}` merge — a key that's
  // simply missing from the patch leaves the old value in place. So a
  // cleared field must be assigned `undefined` explicitly here rather than
  // omitted, or clearing it in this dialog would silently no-op.
  const asset: DaiceAsset = {
    id: draft.id.trim(),
    aiGenerated: draft.aiGenerated,
    references,
    mediaPath: draft.mediaPath.trim() || undefined,
    mediaMimeType: draft.mediaMimeType.trim() || undefined,
    timecodeIn: draft.timecodeIn.trim() || undefined,
    timecodeOut: draft.timecodeOut.trim() || undefined,
  };
  if (draft.aiGenerated) {
    asset.provider = draft.provider.trim() || undefined;
    asset.model = draft.model.trim() || undefined;
    asset.prompt = draft.prompt.trim() || undefined;
    asset.generatedBy = draft.generatedByName.trim()
      ? { name: draft.generatedByName.trim(), email: draft.generatedByEmail.trim() || undefined }
      : undefined;
    asset.generatedAt = draft.generatedAt || new Date().toISOString();
    asset.seed = draft.seed.trim() ? Number(draft.seed.trim()) : undefined;
  } else {
    asset.provider = undefined;
    asset.model = undefined;
    asset.prompt = undefined;
    asset.generatedBy = undefined;
    asset.generatedAt = undefined;
    asset.seed = undefined;
  }
  return asset;
}

/**
 * Asset detail dialog: media preview + every editable field, with per-field
 * validation reusing `@leoninestudios/daice-chain-core`'s `assetSchema` so nothing invalid can be
 * saved. Replaces the old `AssetForm`. See docs/planning/04-editor.md Part C.
 */
export function AssetDetailDialog({
  pkg,
  pendingFiles,
  assetId,
  onClose,
}: {
  pkg: DaicePackage;
  pendingFiles: Map<string, PendingFile>;
  assetId: string | null;
  onClose: () => void;
}) {
  const dispatch = useEditorDispatch();
  const existing = assetId ? pkg.assets.find((a) => a.id === assetId) : undefined;
  const isNew = !assetId;

  const [draft, setDraft] = useState<AssetDraft>(() => toDraft(existing));
  const [file, setFile] = useState<File | undefined>(undefined);
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | undefined>(undefined);
  const [dropActive, setDropActive] = useState(false);
  // Once the user has manually typed an id, a picked file no longer
  // overrides it — see handleFile below and spec/README.md's filename-id
  // recommendation.
  const [idTouched, setIdTouched] = useState(false);
  // Set when the just-picked file carried embedded ComfyUI metadata — see
  // handleFile below. Merged into the saved asset's metadata.comfyui and
  // (for generation fields left blank by the user) the draft itself, on save.
  const [comfyImport, setComfyImport] = useState<ComfyAssetImport | null>(null);

  const existingMediaFilename = existing?.mediaPath?.split("/").pop();
  const hasExistingMedia = Boolean(existingMediaFilename) || (existing ? pendingFiles.has(existing.id) : false);

  const contactSuggestions = useMemo(() => {
    const registry = loadContactRegistry();
    const fromPackage = collectPackageContacts(pkg);
    return [...registry, ...fromPackage];
  }, [pkg]);

  const { providerSuggestions, modelSuggestions } = useMemo(() => {
    const { providers, models } = collectPackageProvidersAndModels(pkg);
    return {
      providerSuggestions: dedupeCaseInsensitive([...loadProviderRegistry(), ...providers]),
      modelSuggestions: dedupeCaseInsensitive([...loadModelRegistry(), ...models]),
    };
  }, [pkg]);

  function update<K extends keyof AssetDraft>(key: K, value: AssetDraft[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  function handleFile(chosen: File | undefined) {
    if (!chosen) return;
    setFile(chosen);
    setComfyImport(null);
    setLocalPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(chosen);
    });
    setDraft((prev) => ({
      ...prev,
      id: isNew && !idTouched ? deriveAssetId(chosen.name, pkg.assets.map((a) => a.id)) : prev.id,
      mediaPath: `assets/${chosen.name}`,
      mediaMimeType: chosen.type || guessMimeTypeFromFilename(chosen.name) || "",
    }));

    // Opportunistically import embedded ComfyUI generation metadata — see
    // io/comfy/. Runs async so it never blocks the dialog from reflecting
    // the picked file immediately; only fills fields the user hasn't
    // already set (see the fieldsEmpty check below), and never overwrites
    // an existing asset's metadata, only adds to it (handleSave).
    void (async () => {
      const comfy = await extractComfyMetadata(chosen).catch(() => null);
      if (!comfy?.prompt) return;
      const imported = comfyToAssetPatch(comfy.prompt, comfy.workflow, pkg.assets.map((a) => a.id));
      if (!imported) return;
      setComfyImport(imported);
      setDraft((prev) => {
        const fieldsEmpty = !prev.provider.trim() && !prev.model.trim() && !prev.prompt.trim();
        if (!fieldsEmpty) return prev;
        return {
          ...prev,
          aiGenerated: true,
          provider: imported.patch.provider ?? prev.provider,
          model: imported.patch.model ?? prev.model,
          prompt: imported.patch.prompt ?? prev.prompt,
          seed: imported.patch.seed !== undefined ? String(imported.patch.seed) : prev.seed,
        };
      });
    })();
  }

  const pendingPreview: PendingFile | undefined = file
    ? { file, objectUrl: localPreviewUrl! }
    : existing
      ? pendingFiles.get(existing.id)
      : undefined;

  const draftAsset = useMemo(() => toAsset(draft, existing?.references ?? []), [draft, existing]);
  const errors = useMemo(() => validateAssetDraft(draftAsset), [draftAsset]);
  const idConflict = pkg.assets.some((a) => a.id === draft.id.trim() && a.id !== existing?.id);
  const canSave = Object.keys(errors).length === 0 && !idConflict;

  function handleSave() {
    if (!canSave) return;
    if (draftAsset.generatedBy) rememberContact(draftAsset.generatedBy);
    if (draftAsset.provider) rememberProvider(draftAsset.provider);
    if (draftAsset.model) rememberModel(draftAsset.model);

    // Merge the imported ComfyUI blob onto whatever metadata this asset
    // already carries, and wire in placeholder assets for any source-image/
    // video inputs the workflow references — never overwrite unrelated
    // metadata keys a previous import (e.g. Magnific) may have set.
    const importedMetadata = comfyImport?.patch.metadata as Record<string, unknown> | undefined;
    const finalAsset: DaiceAsset = importedMetadata
      ? {
          ...draftAsset,
          references: [...draftAsset.references, ...(comfyImport!.patch.references ?? [])],
          metadata: { ...existing?.metadata, ...importedMetadata },
        }
      : draftAsset;

    for (const inputAsset of comfyImport?.inputAssets ?? []) {
      if (!pkg.assets.some((a) => a.id === inputAsset.id)) {
        dispatch({ type: "ADD_ASSET", asset: inputAsset });
      }
    }
    if (isNew) {
      dispatch({ type: "ADD_ASSET", asset: finalAsset, file });
    } else {
      dispatch({ type: "UPDATE_ASSET", id: existing!.id, patch: finalAsset, file });
    }
    onClose();
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    setDropActive(false);
    handleFile(e.dataTransfer.files?.[0]);
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isNew ? "New asset" : `Edit ${existing?.id}`}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-[220px_1fr]">
          <div className="flex flex-col gap-2" onDragOver={(e) => (e.preventDefault(), setDropActive(true))} onDragLeave={() => setDropActive(false)} onDrop={handleDrop}>
            <MediaPreview pending={pendingPreview} mimeType={draft.mediaMimeType} dropActive={dropActive} />
            {hasExistingMedia && !file && (
              <p className="truncate text-xs text-muted-foreground" title={existingMediaFilename}>
                Current file: <span className="font-medium text-foreground">{existingMediaFilename ?? pendingFiles.get(existing!.id)?.file.name}</span>
              </p>
            )}
            <Field label={hasExistingMedia ? "Replace file" : "Choose file"} htmlFor="asset-file-input">
              <Input id="asset-file-input" type="file" onChange={(e) => handleFile(e.target.files?.[0])} />
            </Field>
            {file ? (
              <p className="text-xs text-ai">Will overwrite the current media with "{file.name}" when you save.</p>
            ) : hasExistingMedia ? (
              <p className="text-xs text-muted-foreground">Picking a new file above overwrites this asset's current media.</p>
            ) : null}

            {comfyImport && (
              <p className="flex items-start gap-1.5 text-xs text-ai">
                <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  ComfyUI metadata detected — provider/model/prompt/seed filled in below (only where left blank), and the full workflow is kept in this
                  asset's metadata.
                  {comfyImport.inputAssets.length > 0 &&
                    ` ${comfyImport.inputAssets.length} source input${comfyImport.inputAssets.length === 1 ? "" : "s"} will be added as reference${
                      comfyImport.inputAssets.length === 1 ? "" : "s"
                    } once you save — attach their media to complete the provenance chain.`}
                </span>
              </p>
            )}
          </div>

          <div className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto pr-1">
            <div className="grid grid-cols-2 gap-3">
              <Field
                label="Asset id"
                htmlFor="asset-id"
                error={idConflict ? `"${draft.id.trim()}" is already used` : errors["id"]}
                hint={isNew ? "Defaults to the picked file's name" : undefined}
              >
                <Input
                  id="asset-id"
                  value={draft.id}
                  aria-invalid={idConflict}
                  onChange={(e) => {
                    setIdTouched(true);
                    update("id", e.target.value);
                  }}
                />
              </Field>
              <label className="flex items-center gap-2 self-end pb-1.5 text-sm font-medium">
                <input type="checkbox" className="h-4 w-4" checked={draft.aiGenerated} onChange={(e) => update("aiGenerated", e.target.checked)} />
                AI-generated
              </label>
            </div>

            {draft.aiGenerated && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Provider" htmlFor="asset-provider" error={errors["provider"]}>
                    <Input id="asset-provider" value={draft.provider} placeholder="e.g. Magnific" list="provider-suggestions" onChange={(e) => update("provider", e.target.value)} />
                    <datalist id="provider-suggestions">
                      {providerSuggestions.map((s) => (
                        <option key={s} value={s} />
                      ))}
                    </datalist>
                  </Field>
                  <Field label="Model" htmlFor="asset-model" error={errors["model"]}>
                    <Input id="asset-model" value={draft.model} placeholder="e.g. ExampleModel v2" list="model-suggestions" onChange={(e) => update("model", e.target.value)} />
                    <datalist id="model-suggestions">
                      {modelSuggestions.map((s) => (
                        <option key={s} value={s} />
                      ))}
                    </datalist>
                  </Field>
                </div>

                <Field
                  label="Prompt"
                  htmlFor="asset-prompt"
                  error={errors["prompt"]}
                  hint="Recommended for AI assets, but MAY be left empty — e.g. no text prompt was used, or the prompt is proprietary and can't be disclosed."
                >
                  <Textarea id="asset-prompt" value={draft.prompt} rows={3} onChange={(e) => update("prompt", e.target.value)} />
                </Field>

                <ContactPicker
                  idPrefix="asset-generated-by"
                  label="Generated by"
                  value={{ name: draft.generatedByName, email: draft.generatedByEmail || undefined }}
                  suggestions={contactSuggestions}
                  nameError={errors["generatedBy"] ?? errors["generatedBy.name"]}
                  emailError={errors["generatedBy.email"]}
                  onChange={(contact) => setDraft((prev) => ({ ...prev, generatedByName: contact.name, generatedByEmail: contact.email ?? "" }))}
                />

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Generated at" htmlFor="asset-generated-at" error={errors["generatedAt"]}>
                    <Input
                      id="asset-generated-at"
                      type="datetime-local"
                      value={draft.generatedAt ? draft.generatedAt.slice(0, 16) : ""}
                      onChange={(e) => update("generatedAt", e.target.value ? new Date(e.target.value).toISOString() : "")}
                    />
                  </Field>
                  <Field
                    label="Seed"
                    htmlFor="asset-seed"
                    error={errors["seed"]}
                    hint="Recommended when your provider exposes a seed — omit only if unknown or not applicable."
                  >
                    <Input id="asset-seed" inputMode="numeric" value={draft.seed} placeholder="e.g. 482913" onChange={(e) => update("seed", e.target.value)} />
                  </Field>
                </div>
              </>
            )}

            <div className="grid grid-cols-2 gap-3">
              <Field label="Media path" htmlFor="asset-media-path" error={errors["mediaPath"]} hint="Recommended. Must start with assets/ when present.">
                <Input id="asset-media-path" value={draft.mediaPath} placeholder="assets/example.jpg" onChange={(e) => update("mediaPath", e.target.value)} />
              </Field>
              <Field
                label="Media MIME type"
                htmlFor="asset-mime"
                error={errors["mediaMimeType"]}
                hint="Recommended — helps viewers and archives identify the file type."
              >
                <Input id="asset-mime" list="mime-suggestions" value={draft.mediaMimeType} placeholder="image/jpeg" onChange={(e) => update("mediaMimeType", e.target.value)} />
                <datalist id="mime-suggestions">
                  {SUGGESTED_MIME_TYPES.map((mime) => (
                    <option key={mime} value={mime} />
                  ))}
                </datalist>
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field
                label="Timecode in"
                htmlFor="asset-tc-in"
                error={errors["timecodeIn"]}
                hint="Recommended when this asset was placed in the final show. Both timecodes must be set together."
              >
                <Input id="asset-tc-in" value={draft.timecodeIn} placeholder="HH:MM:SS:FF" onChange={(e) => update("timecodeIn", e.target.value)} />
              </Field>
              <Field label="Timecode out" htmlFor="asset-tc-out" error={errors["timecodeOut"]}>
                <Input id="asset-tc-out" value={draft.timecodeOut} placeholder="HH:MM:SS:FF" onChange={(e) => update("timecodeOut", e.target.value)} />
              </Field>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!canSave}>
            {isNew ? "Add asset" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
