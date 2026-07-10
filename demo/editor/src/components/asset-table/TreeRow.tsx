import { useMemo, useState, type DragEvent, type ReactNode } from "react";
import { AlertTriangle, ChevronDown, ChevronRight, Clipboard, ClipboardPaste, Copy, GripVertical, Info, Maximize2, Scissors, Trash2 } from "lucide-react";
import type { LineageNode, DaiceAsset, DaicePackage, Contact } from "@leoninestudios/daice-chain-core";
import { useEditorDispatch } from "@/state/EditorProvider";
import type { PendingFile } from "@/state/editorState";
import { validateAssetDraft } from "@/lib/fieldValidation";
import { missingMediaRefs } from "@/lib/mediaWarnings";
import { assetCompletenessGaps } from "@/lib/completenessHints";
import { wouldCreateCycle } from "@/utils/graph";
import { buildAssetsFromFile } from "@/utils/assetFactory";
import { badgeVariants } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from "@/components/ui/context-menu";
import { cn } from "@/lib/utils";
import { ASSET_DRAG_MIME, decodeAssetDragPayload, encodeAssetDragPayload } from "./dragTypes";
import { TREE_INDENT_PX, visibleColumns } from "./columns";
import { EditableCell } from "./EditableCell";
import { InlineContactCell } from "./InlineContactCell";
import { MediaThumb } from "./MediaThumb";

function isIntegerString(value: string): boolean {
  return /^-?\d+$/.test(value);
}

const EMPTY_CELL = <span className="px-1.5 text-sm text-muted-foreground">—</span>;

/** What's currently held by the right-click Cut/Copy/Paste menu — see AssetTable's `pasteInto`/`pasteAsRoot`. */
export interface AssetClipboard {
  assetId: string;
  mode: "copy" | "cut";
  /** The parent it was cut/copied from, if any — needed so "cut" can unlink the original on paste. */
  sourceParentId?: string;
}

/**
 * One row (and, recursively, its expanded children) in the asset table's
 * hierarchical grid. Every row shares the parent AssetTable's grid template
 * (see columns.ts) so columns stay pixel-aligned across nesting depths —
 * only the "tree" cell grows with depth, via inner padding, never the row
 * itself. Cells are built into a key->node map and then rendered in exactly
 * the same filtered column order as the header, so toggling an optional
 * column on/off never desyncs header and rows. See
 * docs/planning/04-editor.md Part B and the "Editor v3" amendment (Part J).
 */
export function TreeRow({
  node,
  depth,
  path,
  pkg,
  pendingFiles,
  parentId,
  isExpanded,
  onToggleExpand,
  fileDragActive = false,
  selectedIds,
  onSelectClick,
  contactSuggestions,
  providerSuggestions,
  modelSuggestions,
  applyAssetPatch,
  gridTemplate,
  shownOptionalColumns,
  clipboard,
  onDuplicate,
  onCut,
  onCopy,
  onPaste,
  onOpenDetail,
  onOpenPlayer,
  onDeleteAsset,
}: {
  node: LineageNode;
  depth: number;
  path: string;
  pkg: DaicePackage;
  pendingFiles: Map<string, PendingFile>;
  parentId?: string;
  isExpanded: (key: string, depth: number) => boolean;
  onToggleExpand: (key: string, depth: number) => void;
  fileDragActive?: boolean;
  selectedIds: ReadonlySet<string>;
  onSelectClick: (assetId: string, rowKey: string, event: React.MouseEvent) => void;
  contactSuggestions: Contact[];
  providerSuggestions: string[];
  modelSuggestions: string[];
  applyAssetPatch: (assetId: string, patch: Partial<DaiceAsset>) => void;
  gridTemplate: string;
  shownOptionalColumns: ReadonlySet<string>;
  clipboard: AssetClipboard | null;
  onDuplicate: (assetId: string, parentId?: string) => void;
  onCut: (assetId: string, sourceParentId?: string) => void;
  onCopy: (assetId: string, sourceParentId?: string) => void;
  onPaste: (targetId: string) => void;
  onOpenDetail: (assetId: string) => void;
  onOpenPlayer: (assetId: string) => void;
  onDeleteAsset: (assetId: string) => void;
}) {
  const dispatch = useEditorDispatch();
  const [dropState, setDropState] = useState<"valid" | "invalid" | null>(null);
  const { asset } = node;
  const pending = pendingFiles.get(asset.id);
  const hasChildren = node.children.length > 0;
  const expanded = isExpanded(path, depth);
  const selected = selectedIds.has(asset.id);
  const isAi = asset.aiGenerated;

  // Live schema validation against the real asset — not a draft — so
  // required-when-AI fields (and malformed ones like a bad timecode) are
  // flagged the instant they go missing/invalid, without needing to open
  // the detail dialog or attempt an export. See docs/planning/04-editor.md
  // Part J ("as soon as switched to AI it should request all the fields").
  const errors = useMemo(() => validateAssetDraft(asset), [asset]);
  const errorCount = Object.keys(errors).length;
  const errorSummary = useMemo(
    () =>
      Object.entries(errors)
        .map(([field, message]) => `${field}: ${message}`)
        .join("\n"),
    [errors],
  );

  // Orange, non-blocking nudge: this asset references other assets that
  // have no media attached yet, so the provenance chain isn't fully
  // retrievable. Distinct from the red errorCount above, which is reserved
  // for actual schema violations. See lib/mediaWarnings.ts.
  const missingRefs = useMemo(() => missingMediaRefs(asset, pkg, pendingFiles), [asset, pkg, pendingFiles]);
  const missingRefsSummary = useMemo(
    () => missingRefs.map((ref) => (ref.label ? `${ref.assetId} (${ref.label})` : ref.assetId)).join("\n"),
    [missingRefs],
  );

  // Same advisory spirit as missingRefs above, but for the SHOULD/MAY fields
  // themselves (seed, media MIME type, contact email) rather than attached
  // media. See lib/completenessHints.ts.
  const completenessGaps = useMemo(() => assetCompletenessGaps(asset), [asset]);

  const canPaste = Boolean(clipboard) && clipboard!.assetId !== asset.id && !wouldCreateCycle(pkg, asset.id, clipboard!.assetId);

  function evaluateDrag(e: DragEvent): "valid" | "invalid" {
    if (e.dataTransfer.types.includes(ASSET_DRAG_MIME)) return "valid";
    if (e.dataTransfer.types.includes("Files")) return "valid";
    return "invalid";
  }

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = e.dataTransfer.types.includes(ASSET_DRAG_MIME) ? (e.shiftKey ? "copy" : "move") : "copy";
    setDropState(evaluateDrag(e));
  }

  async function handleDrop(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDropState(null);

    const raw = e.dataTransfer.getData(ASSET_DRAG_MIME);
    if (raw) {
      const payload = decodeAssetDragPayload(raw);
      if (!payload || payload.assetId === asset.id) return;
      if (wouldCreateCycle(pkg, asset.id, payload.assetId)) {
        window.alert("Can't add that reference — it would create a reference cycle.");
        return;
      }
      if (e.shiftKey) {
        dispatch({ type: "ADD_REFERENCE", targetId: asset.id, refAssetId: payload.assetId });
      } else {
        dispatch({ type: "MOVE_REFERENCE", sourceParentId: payload.sourceParentId, targetId: asset.id, refAssetId: payload.assetId });
      }
      return;
    }

    const files = Array.from(e.dataTransfer.files ?? []);
    if (files.length === 0) return;
    const existingIds = pkg.assets.map((a) => a.id);
    for (const file of files) {
      // Opportunistically imports embedded ComfyUI generation metadata (and
      // any source-input placeholders it references) — see utils/assetFactory.ts.
      const { asset: newAsset, inputAssets } = await buildAssetsFromFile(file, existingIds);
      existingIds.push(newAsset.id, ...inputAssets.map((a) => a.id));
      for (const inputAsset of inputAssets) dispatch({ type: "ADD_ASSET", asset: inputAsset });
      dispatch({ type: "ADD_ASSET", asset: newAsset, file });
      dispatch({ type: "ADD_REFERENCE", targetId: asset.id, refAssetId: newAsset.id });
    }
  }

  const cells: Record<string, ReactNode> = {
    select: (
      <div className="flex items-center justify-center">
        <input
          type="checkbox"
          className="h-3.5 w-3.5"
          checked={selected}
          onClick={(e) => {
            e.stopPropagation();
            onSelectClick(asset.id, path, e);
          }}
          onChange={() => {}}
        />
      </div>
    ),

    tree: (
      <div className="flex min-w-0 items-center gap-1.5" style={{ paddingLeft: depth * TREE_INDENT_PX }}>
        {hasChildren ? (
          <button type="button" className="shrink-0 text-muted-foreground hover:text-foreground" onClick={() => onToggleExpand(path, depth)}>
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
        ) : (
          <span className="w-4 shrink-0" />
        )}

        <span
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData(ASSET_DRAG_MIME, encodeAssetDragPayload({ assetId: asset.id, sourceParentId: parentId }));
            e.dataTransfer.effectAllowed = "copyMove";
          }}
          className="shrink-0 cursor-grab text-muted-foreground hover:text-foreground active:cursor-grabbing"
          title="Drag onto another row to move it there. Hold Shift to copy instead. Drag to empty space to detach."
        >
          <GripVertical className="h-4 w-4" />
        </span>

        {errorCount > 0 && (
          <span className="shrink-0 text-destructive" title={`${errorCount} field${errorCount === 1 ? "" : "s"} need attention:\n${errorSummary}`}>
            <AlertTriangle className="h-3.5 w-3.5" />
          </span>
        )}

        {missingRefs.length > 0 && (
          <span
            className="shrink-0 text-warning"
            title={`References missing media — attach it to complete the provenance chain:\n${missingRefsSummary}`}
          >
            <AlertTriangle className="h-3.5 w-3.5" />
          </span>
        )}

        {completenessGaps.length > 0 && (
          <span className="shrink-0 text-warning" title={`Recommended fields missing:\n${completenessGaps.join("\n")}`}>
            <Info className="h-3.5 w-3.5" />
          </span>
        )}
      </div>
    ),

    thumb: (
      <div className="flex items-center justify-center">
        <button
          type="button"
          className="rounded transition-shadow hover:ring-2 hover:ring-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          title="Preview media"
          onClick={(e) => {
            e.stopPropagation();
            onOpenPlayer(asset.id);
          }}
        >
          <MediaThumb pending={pending} mimeType={asset.mediaMimeType ?? ""} />
        </button>
      </div>
    ),

    ai: (
      <div className="flex items-center justify-center">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            const next = !isAi;
            const patch: Partial<DaiceAsset> = { aiGenerated: next };
            if (!next) {
              patch.provider = undefined;
              patch.model = undefined;
              patch.prompt = undefined;
              patch.generatedBy = undefined;
              patch.generatedAt = undefined;
              patch.seed = undefined;
            } else if (!asset.generatedAt) {
              patch.generatedAt = new Date().toISOString();
            }
            dispatch({ type: "UPDATE_ASSET", id: asset.id, patch });
          }}
          className={cn(badgeVariants({ variant: isAi ? "ai" : "outline" }), "cursor-pointer select-none")}
          title="Click to toggle AI-generated"
        >
          {isAi ? "AI" : "Non-AI"}
        </button>
      </div>
    ),

    id: (
      <EditableCell
        value={asset.id}
        monospace
        invalid={Boolean(errors["id"])}
        invalidTitle={errors["id"]}
        onCommit={(next) => {
          const trimmed = next.trim();
          if (!trimmed) return "Id can't be empty";
          if (pkg.assets.some((a) => a.id === trimmed && a.id !== asset.id)) return `"${trimmed}" is already used`;
          dispatch({ type: "UPDATE_ASSET", id: asset.id, patch: { id: trimmed } });
        }}
      />
    ),

    provider: isAi ? (
      <EditableCell
        value={asset.provider ?? ""}
        placeholder="Provider"
        invalid={Boolean(errors["provider"])}
        invalidTitle={errors["provider"]}
        suggestions={providerSuggestions}
        onCommit={(next) => applyAssetPatch(asset.id, { provider: next || undefined })}
      />
    ) : (
      EMPTY_CELL
    ),

    model: isAi ? (
      <EditableCell
        value={asset.model ?? ""}
        placeholder="Model"
        invalid={Boolean(errors["model"])}
        invalidTitle={errors["model"]}
        suggestions={modelSuggestions}
        onCommit={(next) => applyAssetPatch(asset.id, { model: next || undefined })}
      />
    ) : (
      EMPTY_CELL
    ),

    seed: isAi ? (
      <EditableCell
        value={asset.seed !== undefined ? String(asset.seed) : ""}
        placeholder="Seed"
        invalid={Boolean(errors["seed"])}
        invalidTitle={errors["seed"]}
        onCommit={(next) => {
          const trimmed = next.trim();
          if (!trimmed) {
            applyAssetPatch(asset.id, { seed: undefined });
            return;
          }
          if (!isIntegerString(trimmed)) return "Seed must be an integer";
          applyAssetPatch(asset.id, { seed: Number(trimmed) });
        }}
      />
    ) : (
      EMPTY_CELL
    ),

    prompt: isAi ? (
      <EditableCell
        value={asset.prompt ?? ""}
        placeholder="Prompt"
        invalid={Boolean(errors["prompt"])}
        invalidTitle={errors["prompt"]}
        onCommit={(next) => applyAssetPatch(asset.id, { prompt: next || undefined })}
      />
    ) : (
      EMPTY_CELL
    ),

    generatedBy: isAi ? (
      <InlineContactCell
        value={asset.generatedBy}
        suggestions={contactSuggestions}
        invalid={Boolean(errors["generatedBy"] ?? errors["generatedBy.name"] ?? errors["generatedBy.email"])}
        invalidTitle={errors["generatedBy"] ?? errors["generatedBy.name"] ?? errors["generatedBy.email"]}
        onChange={(contact) =>
          applyAssetPatch(asset.id, {
            generatedBy: contact,
            generatedAt: contact && !asset.generatedAt ? new Date().toISOString() : asset.generatedAt,
          })
        }
      />
    ) : (
      EMPTY_CELL
    ),

    tcIn: (
      <EditableCell
        value={asset.timecodeIn ?? ""}
        placeholder="HH:MM:SS:FF"
        monospace
        invalid={Boolean(errors["timecodeIn"])}
        invalidTitle={errors["timecodeIn"]}
        onCommit={(next) => applyAssetPatch(asset.id, { timecodeIn: next.trim() || undefined })}
      />
    ),

    tcOut: (
      <EditableCell
        value={asset.timecodeOut ?? ""}
        placeholder="HH:MM:SS:FF"
        monospace
        invalid={Boolean(errors["timecodeOut"])}
        invalidTitle={errors["timecodeOut"]}
        onCommit={(next) => applyAssetPatch(asset.id, { timecodeOut: next.trim() || undefined })}
      />
    ),

    generatedAt: isAi ? (
      <EditableCell
        value={asset.generatedAt ? asset.generatedAt.slice(0, 16) : ""}
        placeholder="Generated at"
        type="datetime-local"
        invalid={Boolean(errors["generatedAt"])}
        invalidTitle={errors["generatedAt"]}
        onCommit={(next) => {
          const trimmed = next.trim();
          applyAssetPatch(asset.id, { generatedAt: trimmed ? new Date(trimmed).toISOString() : undefined });
        }}
      />
    ) : (
      EMPTY_CELL
    ),

    mediaPath: (
      <EditableCell
        value={asset.mediaPath ?? ""}
        placeholder="assets/…"
        monospace
        invalid={Boolean(errors["mediaPath"])}
        invalidTitle={errors["mediaPath"]}
        onCommit={(next) => applyAssetPatch(asset.id, { mediaPath: next.trim() || undefined })}
      />
    ),

    mediaMimeType: (
      <EditableCell
        value={asset.mediaMimeType ?? ""}
        placeholder="image/jpeg"
        invalid={Boolean(errors["mediaMimeType"])}
        invalidTitle={errors["mediaMimeType"]}
        onCommit={(next) => applyAssetPatch(asset.id, { mediaMimeType: next.trim() || undefined })}
      />
    ),

    actions: (
      <div className="flex shrink-0 items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100">
        <Button variant="ghost" size="icon" title="Open details" onClick={() => onOpenDetail(asset.id)}>
          <Maximize2 className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" title="Delete asset" onClick={() => onDeleteAsset(asset.id)}>
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </div>
    ),
  };

  return (
    <div className="select-none">
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            role="row"
            className={cn(
              "group grid items-center gap-x-2 rounded-md border border-transparent px-1 py-1 hover:bg-accent/50",
              selected && "bg-accent/60",
              fileDragActive && !dropState && "border-dashed border-ai/40 bg-ai/5",
              dropState === "valid" && "drop-target-valid",
              dropState === "invalid" && "drop-target-invalid",
            )}
            style={{ gridTemplateColumns: gridTemplate }}
            onDragOver={handleDragOver}
            onDragLeave={(e) => {
              e.stopPropagation();
              setDropState(null);
            }}
            onDrop={handleDrop}
            onContextMenu={() => {
              // Right-clicking a row that isn't already part of the current
              // selection replaces the selection with just that row, so the
              // menu's actions clearly apply to it — right-clicking within an
              // existing multi-selection leaves it intact instead.
              if (!selected) dispatch({ type: "SET_SELECTION", ids: new Set([asset.id]) });
            }}
          >
            {visibleColumns(shownOptionalColumns).map((col) => (
              <div key={col.key} className="min-w-0">
                {cells[col.key]}
              </div>
            ))}
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onSelect={() => onDuplicate(asset.id, parentId)}>
            <Copy className="h-4 w-4" /> Duplicate
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => onCut(asset.id, parentId)}>
            <Scissors className="h-4 w-4" /> Cut
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => onCopy(asset.id, parentId)}>
            <Clipboard className="h-4 w-4" /> Copy
          </ContextMenuItem>
          <ContextMenuItem disabled={!canPaste} onSelect={() => onPaste(asset.id)}>
            <ClipboardPaste className="h-4 w-4" /> Paste {clipboard ? `"${clipboard.assetId}"` : ""} here
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem onSelect={() => onOpenDetail(asset.id)}>
            <Maximize2 className="h-4 w-4" /> Open details
          </ContextMenuItem>
          <ContextMenuItem destructive onSelect={() => onDeleteAsset(asset.id)}>
            <Trash2 className="h-4 w-4" /> Delete
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      {expanded && hasChildren && (
        <div className="flex flex-col gap-0.5">
          {node.children.map((child) => (
            <TreeRow
              key={`${path}>${child.asset.id}`}
              node={child}
              depth={depth + 1}
              path={`${path}>${child.asset.id}`}
              pkg={pkg}
              pendingFiles={pendingFiles}
              parentId={asset.id}
              isExpanded={isExpanded}
              onToggleExpand={onToggleExpand}
              fileDragActive={fileDragActive}
              selectedIds={selectedIds}
              onSelectClick={onSelectClick}
              contactSuggestions={contactSuggestions}
              providerSuggestions={providerSuggestions}
              modelSuggestions={modelSuggestions}
              applyAssetPatch={applyAssetPatch}
              gridTemplate={gridTemplate}
              shownOptionalColumns={shownOptionalColumns}
              clipboard={clipboard}
              onDuplicate={onDuplicate}
              onCut={onCut}
              onCopy={onCopy}
              onPaste={onPaste}
              onOpenDetail={onOpenDetail}
              onOpenPlayer={onOpenPlayer}
              onDeleteAsset={onDeleteAsset}
            />
          ))}
        </div>
      )}
    </div>
  );
}
