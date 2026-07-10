import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { Columns3, Plus, ChevronsDownUp, ChevronsUpDown, UploadCloud, X } from "lucide-react";
import { resolveLineage, type LineageNode, type DaiceAsset, type DaicePackage } from "@leoninestudios/daice-chain-core";
import { useEditorDispatch, useEditorState } from "@/state/EditorProvider";
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
import { buildAssetsFromFile } from "@/utils/assetFactory";
import { deriveDuplicateAssetId } from "@/utils/deriveAssetId";
import { wouldCreateCycle } from "@/utils/graph";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { TreeRow, type AssetClipboard } from "./TreeRow";
import { AssetDetailDialog } from "./AssetDetailDialog";
import { AssetPlayerOverlay } from "./AssetPlayerOverlay";
import { BulkEditBar } from "./BulkEditBar";
import { ASSET_TABLE_COLUMNS, DEFAULT_VISIBLE_OPTIONAL_COLUMNS, TREE_INDENT_PX, buildGridTemplate, visibleColumns } from "./columns";
import { ASSET_DRAG_MIME, decodeAssetDragPayload } from "./dragTypes";

function computeRootIds(pkg: DaicePackage): string[] {
  const referenced = new Set(pkg.assets.flatMap((asset) => asset.references.map((ref) => ref.assetId)));
  const roots = pkg.assets.filter((asset) => !referenced.has(asset.id)).map((asset) => asset.id);
  return roots.length > 0 ? roots : pkg.assets.map((asset) => asset.id);
}

interface FlatRow {
  key: string;
  assetId: string;
  depth: number;
}

/** Walks the full lineage forest (ignoring collapse state) to a flat, depth-ordered row list, keyed the same way TreeRow keys its rows (`parentPath>assetId`). Used for expand/collapse-all and for resolving a shift-click range. */
function flattenAll(lineageByRoot: { rootId: string; node: LineageNode }[]): FlatRow[] {
  const rows: FlatRow[] = [];
  function visit(node: LineageNode, depth: number, path: string) {
    rows.push({ key: path, assetId: node.asset.id, depth });
    for (const child of node.children) visit(child, depth + 1, `${path}>${child.asset.id}`);
  }
  for (const { rootId, node } of lineageByRoot) visit(node, 0, rootId);
  return rows;
}

/**
 * The editor's entire working surface: one hierarchical tree-table (root
 * rows = final outputs, expandable into their references), replacing the
 * old side-by-side asset panel + lineage tree. See
 * docs/planning/04-editor.md Part B ("Editor v2") and the "Editor v3"
 * amendment (aligned grid columns, move/copy DnD, multiselect bulk edit).
 */
export function AssetTable({ pkg, pendingFiles }: { pkg: DaicePackage; pendingFiles: Map<string, PendingFile> }) {
  const dispatch = useEditorDispatch();
  const { selectedAssetIds } = useEditorState();
  const [expandedOverrides, setExpandedOverrides] = useState<Map<string, boolean>>(new Map());
  const [detailAssetId, setDetailAssetId] = useState<string | null>(null);
  const [playerAssetId, setPlayerAssetId] = useState<string | null>(null);
  const [creatingNew, setCreatingNew] = useState(false);
  const [backgroundDropActive, setBackgroundDropActive] = useState(false);
  const [shownOptionalColumns, setShownOptionalColumns] = useState<Set<string>>(new Set(DEFAULT_VISIBLE_OPTIONAL_COLUMNS));
  const [clipboard, setClipboard] = useState<AssetClipboard | null>(null);
  const shiftAnchorRef = useRef<string | null>(null);

  // Window-level file-drag detection: as soon as an OS file drag enters the
  // page (from anywhere, not just this table), every row lights up as a
  // potential drop target — a simplified version of document-ai's
  // asset-table.tsx "file-drag spotlight". Escape (or leaving the window,
  // or the drop finishing) clears it again. See docs/planning/04-editor.md Part B.
  const [fileDragActive, setFileDragActive] = useState(false);
  const fileDragActiveRef = useRef(false);

  useEffect(() => {
    function reset() {
      fileDragActiveRef.current = false;
      setFileDragActive(false);
    }
    function onDragOver(e: globalThis.DragEvent) {
      if (!e.dataTransfer?.types.includes("Files")) return;
      if (!fileDragActiveRef.current) {
        fileDragActiveRef.current = true;
        setFileDragActive(true);
      }
    }
    function onDragLeave(e: globalThis.DragEvent) {
      // Only reset once the cursor actually leaves the viewport, not merely
      // between two child elements (which also fires dragleave).
      if (e.relatedTarget != null) return;
      if (e.clientX <= 0 || e.clientY <= 0 || e.clientX >= window.innerWidth || e.clientY >= window.innerHeight) reset();
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && fileDragActiveRef.current) reset();
    }
    window.addEventListener("dragover", onDragOver, true);
    window.addEventListener("dragend", reset, true);
    window.addEventListener("drop", reset, true);
    window.addEventListener("dragleave", onDragLeave, true);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("dragover", onDragOver, true);
      window.removeEventListener("dragend", reset, true);
      window.removeEventListener("drop", reset, true);
      window.removeEventListener("dragleave", onDragLeave, true);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  // Floating "Move" / "+ Copy" hint that follows the cursor while an asset
  // row is being dragged, spelling out in words what the OS's own
  // copy-cursor badge only implies. See docs/planning/04-editor.md Part J.
  const [assetDragHint, setAssetDragHint] = useState<{ x: number; y: number; copy: boolean } | null>(null);

  useEffect(() => {
    function onDragOver(e: globalThis.DragEvent) {
      if (!e.dataTransfer?.types.includes(ASSET_DRAG_MIME)) return;
      setAssetDragHint({ x: e.clientX, y: e.clientY, copy: e.shiftKey });
    }
    function reset() {
      setAssetDragHint(null);
    }
    window.addEventListener("dragover", onDragOver, true);
    window.addEventListener("dragend", reset, true);
    window.addEventListener("drop", reset, true);
    return () => {
      window.removeEventListener("dragover", onDragOver, true);
      window.removeEventListener("dragend", reset, true);
      window.removeEventListener("drop", reset, true);
    };
  }, []);

  const lineageByRoot = useMemo(() => {
    const rootIds = computeRootIds(pkg);
    // Build every root's fully-resolved lineage once per render, shared by
    // reference (see @leoninestudios/daice-chain-core's resolveLineage) rather than recomputed per row.
    return rootIds.map((rootId) => ({ rootId, node: resolveLineage(rootId, pkg) }));
  }, [pkg]);

  const allRows = useMemo(() => flattenAll(lineageByRoot), [lineageByRoot]);

  function isRowExpanded(key: string, depth: number): boolean {
    return expandedOverrides.get(key) ?? depth === 0;
  }

  function toggleExpand(key: string, depth: number) {
    setExpandedOverrides((prev) => {
      const next = new Map(prev);
      next.set(key, !isRowExpanded(key, depth));
      return next;
    });
  }

  function expandAll() {
    setExpandedOverrides(new Map(allRows.map((r) => [r.key, true])));
  }

  function collapseAll() {
    setExpandedOverrides(new Map(allRows.map((r) => [r.key, false])));
  }

  // Only rows whose entire ancestor chain is expanded are actually visible —
  // this is what a shift-click range should span, so it matches what the
  // user can see on screen. allRows is pre-order (parent before children),
  // so a row's parent has always already been classified by the time we get to it.
  const visibleRows = useMemo(() => {
    const hidden = new Set<string>();
    const visible: FlatRow[] = [];
    for (const row of allRows) {
      const parentKey = row.key.includes(">") ? row.key.slice(0, row.key.lastIndexOf(">")) : null;
      if (parentKey && (hidden.has(parentKey) || !isRowExpanded(parentKey, row.depth - 1))) {
        hidden.add(row.key);
        continue;
      }
      visible.push(row);
    }
    return visible;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allRows, expandedOverrides]);

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

  // Clones an asset's fields (including its own references, but not who
  // references *it*) under a fresh id. With no `parentId`, the clone is left
  // unreferenced — i.e. it surfaces as its own independent root row — which
  // is what "copy" onto empty space / the root level means, since a root is
  // just "nothing references this asset" and pointing to the *same* asset id
  // an extra time isn't representable there the way it is for a reference
  // drop onto another asset. See docs/planning/04-editor.md Part J.
  function duplicateAsset(assetId: string, parentId?: string) {
    const original = pkg.assets.find((a) => a.id === assetId);
    if (!original) return;
    const newId = deriveDuplicateAssetId(original.id, pkg.assets.map((a) => a.id));
    const duplicate: DaiceAsset = { ...original, id: newId, references: [...original.references] };
    const file = pendingFiles.get(original.id)?.file;
    dispatch({ type: "ADD_ASSET", asset: duplicate, file });
    if (parentId) dispatch({ type: "ADD_REFERENCE", targetId: parentId, refAssetId: newId });
  }

  // Right-click Cut/Copy/Paste — a menu-driven alternative to drag-and-drop
  // for the same two operations (move vs. reference-copy), plus "paste as
  // root" in the toolbar for the case DnD can't otherwise reach (see
  // duplicateAsset above). See docs/planning/04-editor.md Part J.
  function pasteInto(targetId: string) {
    if (!clipboard) return;
    if (wouldCreateCycle(pkg, targetId, clipboard.assetId)) {
      window.alert("Can't paste here — it would create a reference cycle.");
      return;
    }
    if (clipboard.mode === "copy") {
      dispatch({ type: "ADD_REFERENCE", targetId, refAssetId: clipboard.assetId });
    } else {
      dispatch({ type: "MOVE_REFERENCE", sourceParentId: clipboard.sourceParentId, targetId, refAssetId: clipboard.assetId });
      setClipboard(null); // cut is one-shot; copy can be pasted repeatedly
    }
  }

  function pasteAsRoot() {
    if (!clipboard) return;
    if (clipboard.mode === "copy") {
      duplicateAsset(clipboard.assetId);
    } else {
      if (clipboard.sourceParentId) {
        dispatch({ type: "REMOVE_REFERENCE", targetId: clipboard.sourceParentId, refAssetId: clipboard.assetId });
      }
      setClipboard(null);
    }
  }

  function applyAssetPatch(assetId: string, patch: Partial<DaiceAsset>) {
    if (patch.generatedBy) rememberContact(patch.generatedBy);
    if (patch.provider) rememberProvider(patch.provider);
    if (patch.model) rememberModel(patch.model);
    if (selectedAssetIds.has(assetId) && selectedAssetIds.size > 1) {
      dispatch({ type: "BULK_UPDATE_ASSETS", ids: [...selectedAssetIds], patch });
    } else {
      dispatch({ type: "UPDATE_ASSET", id: assetId, patch });
    }
  }

  // A row's checkbox always toggles it into/out of the current selection —
  // multiselect shouldn't require holding Ctrl/Cmd. Shift still selects a
  // contiguous range from the last-clicked row. See
  // docs/planning/04-editor.md Part J.
  function handleSelectClick(assetId: string, rowKey: string, event: React.MouseEvent) {
    if (event.shiftKey && shiftAnchorRef.current) {
      const indices = visibleRows.map((r) => r.key);
      const from = indices.indexOf(shiftAnchorRef.current);
      const to = indices.indexOf(rowKey);
      if (from !== -1 && to !== -1) {
        const [start, end] = from < to ? [from, to] : [to, from];
        const ids = new Set(visibleRows.slice(start, end + 1).map((r) => r.assetId));
        dispatch({ type: "SET_SELECTION", ids });
        shiftAnchorRef.current = rowKey;
        return;
      }
    }
    const next = new Set(selectedAssetIds);
    if (next.has(assetId)) next.delete(assetId);
    else next.add(assetId);
    dispatch({ type: "SET_SELECTION", ids: next });
    shiftAnchorRef.current = rowKey;
  }

  function toggleSelectAllVisible() {
    const visibleIds = visibleRows.map((r) => r.assetId);
    const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedAssetIds.has(id));
    dispatch({ type: "SET_SELECTION", ids: allSelected ? new Set() : new Set(visibleIds) });
  }

  async function handleBackgroundDrop(e: DragEvent) {
    e.preventDefault();
    setBackgroundDropActive(false);

    const raw = e.dataTransfer.getData(ASSET_DRAG_MIME);
    if (raw) {
      const payload = decodeAssetDragPayload(raw);
      if (!payload) return;
      if (e.shiftKey) {
        // Shift+drop onto empty space duplicates the asset as an
        // independent new root asset — the root-level equivalent of
        // shift-dropping onto another row (which adds a reference instead).
        // See duplicateAsset above and docs/planning/04-editor.md Part J.
        duplicateAsset(payload.assetId);
        return;
      }
      // A plain drop onto empty space (not another row) detaches the asset
      // from whichever parent it was dragged from, so it becomes a root —
      // this is the DnD-based replacement for the old "unlink" button. See
      // docs/planning/04-editor.md Part B.
      if (payload.sourceParentId) {
        dispatch({ type: "REMOVE_REFERENCE", targetId: payload.sourceParentId, refAssetId: payload.assetId });
      }
      return;
    }

    const files = Array.from(e.dataTransfer.files ?? []);
    const existingIds = pkg.assets.map((a) => a.id);
    for (const file of files) {
      // Opportunistically imports embedded ComfyUI generation metadata (and
      // any source-input placeholders it references) — see utils/assetFactory.ts.
      const { asset: newAsset, inputAssets } = await buildAssetsFromFile(file, existingIds);
      existingIds.push(newAsset.id, ...inputAssets.map((a) => a.id));
      for (const inputAsset of inputAssets) dispatch({ type: "ADD_ASSET", asset: inputAsset });
      dispatch({ type: "ADD_ASSET", asset: newAsset, file });
    }
  }

  const visibleIds = visibleRows.map((r) => r.assetId);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedAssetIds.has(id));
  const someVisibleSelected = visibleIds.some((id) => selectedAssetIds.has(id));
  const gridTemplate = buildGridTemplate(shownOptionalColumns);
  const optionalColumns = ASSET_TABLE_COLUMNS.filter((c) => c.optional);

  function toggleOptionalColumn(key: string) {
    setShownOptionalColumns((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <section
      className={cn(
        "flex min-h-0 flex-1 flex-col gap-2 rounded-lg border border-border bg-card p-3 transition-colors",
        fileDragActive && !backgroundDropActive && "border-ai/40 bg-ai/5",
        backgroundDropActive && "drop-target-valid",
      )}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes("Files") && !e.dataTransfer.types.includes(ASSET_DRAG_MIME)) return;
        e.preventDefault();
        if (e.dataTransfer.types.includes(ASSET_DRAG_MIME)) e.dataTransfer.dropEffect = e.shiftKey ? "copy" : "move";
        setBackgroundDropActive(true);
      }}
      onDragLeave={() => setBackgroundDropActive(false)}
      onDrop={handleBackgroundDrop}
    >
      <div className="flex items-center justify-between gap-2 border-b border-border pb-2">
        <div>
          <h2 className="text-sm font-semibold">Assets ({pkg.assets.length})</h2>
          <p className="text-xs text-muted-foreground">
            Drag the grip handle of a row onto another row to move it there (hold Shift to copy instead), or onto empty space to detach it (hold Shift to
            duplicate it there instead). Right-click a row for more actions. Drop a file anywhere to create a new asset from it.
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm">
                <Columns3 className="h-4 w-4" /> Columns
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-56 p-2">
              <p className="px-1.5 pb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">Show columns</p>
              <div className="flex flex-col gap-0.5">
                {optionalColumns.map((col) => (
                  <label key={col.key} className="flex items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-accent">
                    <input
                      type="checkbox"
                      className="h-3.5 w-3.5"
                      checked={shownOptionalColumns.has(col.key)}
                      onChange={() => toggleOptionalColumn(col.key)}
                    />
                    {col.label}
                  </label>
                ))}
              </div>
            </PopoverContent>
          </Popover>
          <Button variant="outline" size="sm" onClick={expandAll}>
            <ChevronsUpDown className="h-4 w-4" /> Expand all
          </Button>
          <Button variant="outline" size="sm" onClick={collapseAll}>
            <ChevronsDownUp className="h-4 w-4" /> Collapse all
          </Button>
          <Button size="sm" onClick={() => setCreatingNew(true)}>
            <Plus className="h-4 w-4" /> New asset
          </Button>
        </div>
      </div>

      {clipboard && (
        <div className="flex items-center gap-2 rounded-md border border-dashed border-ai/40 bg-ai/5 px-2.5 py-1.5 text-xs">
          <span className="text-muted-foreground">
            {clipboard.mode === "cut" ? "Cut" : "Copied"}: <span className="font-medium text-foreground">{clipboard.assetId}</span> — right-click another
            row to paste, or:
          </span>
          <Button variant="outline" size="sm" className="h-6 px-2 text-xs" onClick={pasteAsRoot}>
            Paste as root
          </Button>
          <Button variant="ghost" size="icon" className="ml-auto h-6 w-6" title="Clear clipboard" onClick={() => setClipboard(null)}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      {selectedAssetIds.size >= 2 && (
        <BulkEditBar
          count={selectedAssetIds.size}
          providerSuggestions={providerSuggestions}
          modelSuggestions={modelSuggestions}
          onApply={(patch) => {
            if (patch.generatedBy) rememberContact(patch.generatedBy);
            if (patch.provider) rememberProvider(patch.provider);
            if (patch.model) rememberModel(patch.model);
            dispatch({ type: "BULK_UPDATE_ASSETS", ids: [...selectedAssetIds], patch });
          }}
          onClear={() => dispatch({ type: "SET_SELECTION", ids: new Set() })}
        />
      )}

      {pkg.assets.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border py-16 text-center text-sm text-muted-foreground">
          <UploadCloud className="h-8 w-8" />
          <p>No assets yet. Drop a file here, or use "New asset" above.</p>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          <div
            className="grid items-center gap-x-2 border-b border-border px-1 pb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground"
            style={{ gridTemplateColumns: gridTemplate }}
          >
            <div className="flex items-center justify-center">
              <input
                type="checkbox"
                className="h-3.5 w-3.5"
                checked={allVisibleSelected}
                ref={(el) => {
                  if (el) el.indeterminate = !allVisibleSelected && someVisibleSelected;
                }}
                onChange={toggleSelectAllVisible}
              />
            </div>
            {visibleColumns(shownOptionalColumns)
              .slice(1)
              .map((col) => (
                <span key={col.key} style={col.key === "tree" ? { paddingLeft: TREE_INDENT_PX } : undefined}>
                  {col.label}
                </span>
              ))}
          </div>

          <div className="flex flex-col gap-0.5 pt-1">
            {lineageByRoot.map(({ rootId, node }) => (
              <TreeRow
                key={rootId}
                node={node}
                depth={0}
                path={rootId}
                pkg={pkg}
                pendingFiles={pendingFiles}
                isExpanded={isRowExpanded}
                onToggleExpand={toggleExpand}
                fileDragActive={fileDragActive}
                selectedIds={selectedAssetIds}
                onSelectClick={handleSelectClick}
                contactSuggestions={contactSuggestions}
                providerSuggestions={providerSuggestions}
                modelSuggestions={modelSuggestions}
                applyAssetPatch={applyAssetPatch}
                gridTemplate={gridTemplate}
                shownOptionalColumns={shownOptionalColumns}
                clipboard={clipboard}
                onDuplicate={duplicateAsset}
                onCut={(assetId, sourceParentId) => setClipboard({ assetId, mode: "cut", sourceParentId })}
                onCopy={(assetId, sourceParentId) => setClipboard({ assetId, mode: "copy", sourceParentId })}
                onPaste={pasteInto}
                onOpenDetail={setDetailAssetId}
                onOpenPlayer={setPlayerAssetId}
                onDeleteAsset={(assetId) => {
                  if (window.confirm(`Delete asset "${assetId}"? Any references to it will also be removed.`)) {
                    dispatch({ type: "DELETE_ASSET", id: assetId });
                  }
                }}
              />
            ))}
          </div>
        </div>
      )}

      {(detailAssetId || creatingNew) && (
        <AssetDetailDialog
          pkg={pkg}
          pendingFiles={pendingFiles}
          assetId={creatingNew ? null : detailAssetId}
          onClose={() => {
            setDetailAssetId(null);
            setCreatingNew(false);
          }}
        />
      )}

      {playerAssetId && (
        <AssetPlayerOverlay
          pkg={pkg}
          pendingFiles={pendingFiles}
          assetId={playerAssetId}
          onAssetChange={setPlayerAssetId}
          onClose={() => setPlayerAssetId(null)}
          onEditDetails={(assetId) => {
            setPlayerAssetId(null);
            setDetailAssetId(assetId);
          }}
        />
      )}

      {assetDragHint && (
        <div
          className={cn(
            "pointer-events-none fixed z-50 rounded-md px-2 py-1 text-xs font-medium text-white shadow-md",
            assetDragHint.copy ? "bg-ai" : "bg-foreground",
          )}
          style={{ left: assetDragHint.x + 14, top: assetDragHint.y + 14 }}
        >
          {assetDragHint.copy ? "+ Copy" : "Move · hold Shift to copy"}
        </div>
      )}
    </section>
  );
}
