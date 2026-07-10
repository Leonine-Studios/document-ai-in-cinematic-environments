import type { DaiceAsset, DaicePackage, PackageMetadata, ValidationError } from "@leoninestudios/daice-chain-core";

/**
 * A media file the user has attached to an asset but that has not been
 * written anywhere yet — it only exists as an in-memory Blob until the
 * package is exported. Keyed by asset id in EditorState.pendingFiles.
 */
export interface PendingFile {
  file: File;
  /** Object URL for thumbnail previews; revoked when the file is replaced/removed. */
  objectUrl: string;
}

export interface EditorState {
  /**
   * The editor's entire working document is exactly a DaicePackage plus this
   * pending-file side-map — never a bespoke internal model — so export is
   * lossless by construction. See docs/planning/04-editor.md "Interfaces".
   */
  pkg: DaicePackage | null;
  pendingFiles: Map<string, PendingFile>;
  /** Set when the last import attempt failed validation; cleared on success/dismiss. */
  importErrors: ValidationError[] | null;
  /** Multi-row selection in the asset table, used for bulk edits. See Part F. */
  selectedAssetIds: Set<string>;
}

export const initialEditorState: EditorState = {
  pkg: null,
  pendingFiles: new Map(),
  importErrors: null,
  selectedAssetIds: new Set(),
};

export type EditorAction =
  | { type: "NEW_PACKAGE"; pkg: DaicePackage }
  | { type: "LOAD_PACKAGE"; pkg: DaicePackage; pendingFiles: Map<string, PendingFile> }
  | { type: "IMPORT_FAILED"; errors: ValidationError[] }
  | { type: "DISMISS_IMPORT_ERRORS" }
  | { type: "CLOSE_PACKAGE" }
  | { type: "UPDATE_PACKAGE_META"; patch: Partial<PackageMetadata> }
  | { type: "ADD_ASSET"; asset: DaiceAsset; file?: File }
  | { type: "UPDATE_ASSET"; id: string; patch: Partial<DaiceAsset>; file?: File }
  | { type: "BULK_UPDATE_ASSETS"; ids: string[]; patch: Partial<DaiceAsset> }
  | { type: "DELETE_ASSET"; id: string }
  | { type: "ADD_REFERENCE"; targetId: string; refAssetId: string; label?: string }
  | { type: "REMOVE_REFERENCE"; targetId: string; refAssetId: string }
  | { type: "MOVE_REFERENCE"; sourceParentId?: string; targetId: string; refAssetId: string; label?: string }
  | { type: "SET_SELECTION"; ids: Set<string> };

function withPendingFile(
  pendingFiles: Map<string, PendingFile>,
  assetId: string,
  file: File | undefined,
): Map<string, PendingFile> {
  if (!file) return pendingFiles;
  const next = new Map(pendingFiles);
  const previous = next.get(assetId);
  if (previous) URL.revokeObjectURL(previous.objectUrl);
  next.set(assetId, { file, objectUrl: URL.createObjectURL(file) });
  return next;
}

function withoutPendingFile(pendingFiles: Map<string, PendingFile>, assetId: string): Map<string, PendingFile> {
  const existing = pendingFiles.get(assetId);
  if (!existing) return pendingFiles;
  URL.revokeObjectURL(existing.objectUrl);
  const next = new Map(pendingFiles);
  next.delete(assetId);
  return next;
}

function revokeAll(pendingFiles: Map<string, PendingFile>): void {
  for (const { objectUrl } of pendingFiles.values()) URL.revokeObjectURL(objectUrl);
}

function withoutFromSelection(selection: Set<string>, id: string): Set<string> {
  if (!selection.has(id)) return selection;
  const next = new Set(selection);
  next.delete(id);
  return next;
}

function renamedInSelection(selection: Set<string>, from: string, to: string): Set<string> {
  if (!selection.has(from)) return selection;
  const next = new Set(selection);
  next.delete(from);
  next.add(to);
  return next;
}

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case "NEW_PACKAGE":
      revokeAll(state.pendingFiles);
      return { ...initialEditorState, pkg: action.pkg, pendingFiles: new Map() };

    case "LOAD_PACKAGE":
      revokeAll(state.pendingFiles);
      return { ...initialEditorState, pkg: action.pkg, pendingFiles: action.pendingFiles };

    case "IMPORT_FAILED":
      return { ...state, importErrors: action.errors };

    case "DISMISS_IMPORT_ERRORS":
      return { ...state, importErrors: null };

    case "CLOSE_PACKAGE":
      revokeAll(state.pendingFiles);
      return { ...initialEditorState };

    case "UPDATE_PACKAGE_META": {
      if (!state.pkg) return state;
      return { ...state, pkg: { ...state.pkg, package: { ...state.pkg.package, ...action.patch } } };
    }

    case "ADD_ASSET": {
      if (!state.pkg) return state;
      return {
        ...state,
        pkg: { ...state.pkg, assets: [...state.pkg.assets, action.asset] },
        pendingFiles: withPendingFile(state.pendingFiles, action.asset.id, action.file),
      };
    }

    case "UPDATE_ASSET": {
      if (!state.pkg) return state;
      const assets = state.pkg.assets.map((asset) => (asset.id === action.id ? { ...asset, ...action.patch } : asset));
      // References point at ids, so a rename must be propagated everywhere else it's referenced too.
      const renamedTo = action.patch.id && action.patch.id !== action.id ? action.patch.id : null;
      const withRenamedRefs = renamedTo
        ? assets.map((asset) => ({
            ...asset,
            references: asset.references.map((ref) => (ref.assetId === action.id ? { ...ref, assetId: renamedTo } : ref)),
          }))
        : assets;
      let pendingFiles = withPendingFile(state.pendingFiles, action.id, action.file);
      if (renamedTo && pendingFiles.has(action.id)) {
        const moved = new Map(pendingFiles);
        const entry = moved.get(action.id)!;
        moved.delete(action.id);
        moved.set(renamedTo, entry);
        pendingFiles = moved;
      }
      return {
        ...state,
        pkg: { ...state.pkg, assets: withRenamedRefs },
        pendingFiles,
        selectedAssetIds: renamedTo ? renamedInSelection(state.selectedAssetIds, action.id, renamedTo) : state.selectedAssetIds,
      };
    }

    case "BULK_UPDATE_ASSETS": {
      if (!state.pkg) return state;
      const ids = new Set(action.ids);
      const assets = state.pkg.assets.map((asset) => (ids.has(asset.id) ? { ...asset, ...action.patch } : asset));
      return { ...state, pkg: { ...state.pkg, assets } };
    }

    case "DELETE_ASSET": {
      if (!state.pkg) return state;
      const assets = state.pkg.assets
        .filter((asset) => asset.id !== action.id)
        .map((asset) => ({ ...asset, references: asset.references.filter((ref) => ref.assetId !== action.id) }));
      return {
        ...state,
        pkg: { ...state.pkg, assets },
        pendingFiles: withoutPendingFile(state.pendingFiles, action.id),
        selectedAssetIds: withoutFromSelection(state.selectedAssetIds, action.id),
      };
    }

    case "ADD_REFERENCE": {
      if (!state.pkg) return state;
      const assets = state.pkg.assets.map((asset) => {
        if (asset.id !== action.targetId) return asset;
        if (asset.references.some((ref) => ref.assetId === action.refAssetId)) return asset;
        return { ...asset, references: [...asset.references, { assetId: action.refAssetId, label: action.label }] };
      });
      return { ...state, pkg: { ...state.pkg, assets } };
    }

    case "REMOVE_REFERENCE": {
      if (!state.pkg) return state;
      const assets = state.pkg.assets.map((asset) =>
        asset.id === action.targetId
          ? { ...asset, references: asset.references.filter((ref) => ref.assetId !== action.refAssetId) }
          : asset,
      );
      return { ...state, pkg: { ...state.pkg, assets } };
    }

    case "MOVE_REFERENCE": {
      if (!state.pkg) return state;
      if (action.sourceParentId === action.targetId) return state;
      const assets = state.pkg.assets.map((asset) => {
        if (action.sourceParentId && asset.id === action.sourceParentId) {
          return { ...asset, references: asset.references.filter((ref) => ref.assetId !== action.refAssetId) };
        }
        if (asset.id === action.targetId) {
          if (asset.references.some((ref) => ref.assetId === action.refAssetId)) return asset;
          return { ...asset, references: [...asset.references, { assetId: action.refAssetId, label: action.label }] };
        }
        return asset;
      });
      return { ...state, pkg: { ...state.pkg, assets } };
    }

    case "SET_SELECTION":
      return { ...state, selectedAssetIds: action.ids };

    default:
      return state;
  }
}
