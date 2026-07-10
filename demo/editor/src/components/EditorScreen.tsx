import { useEffect } from "react";
import { useEditorHistory, useEditorState } from "@/state/EditorProvider";
import { rememberContactsFromPackage } from "@/state/contactRegistry";
import { rememberProviderModelsFromPackage } from "@/state/providerModelRegistry";
import { PackageHeader } from "@/components/PackageHeader";
import { Toolbar } from "@/components/Toolbar";
import { MediaWarningsBanner } from "@/components/MediaWarningsBanner";
import { CompletenessBanner } from "@/components/CompletenessBanner";
import { AssetTable } from "@/components/asset-table/AssetTable";

export function EditorScreen() {
  const { pkg, pendingFiles } = useEditorState();
  const { undo, redo } = useEditorHistory();

  // Seed the contact registry from whatever package is opened, once per
  // package "session" (not on every keystroke) — see contactRegistry.ts.
  useEffect(() => {
    if (pkg) {
      rememberContactsFromPackage(pkg);
      rememberProviderModelsFromPackage(pkg);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pkg?.package.id]);

  // Global Ctrl/Cmd+Z (undo) and Ctrl/Cmd+Shift+Z or Ctrl+Y (redo) — skipped
  // while a text input/textarea is focused so the browser's own per-field
  // undo still works while actively typing. See docs/planning/04-editor.md
  // Part J.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey)) return;
      const key = e.key.toLowerCase();
      if (key !== "z" && key !== "y") return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      if (key === "y" || (key === "z" && e.shiftKey)) {
        e.preventDefault();
        redo();
      } else {
        e.preventDefault();
        undo();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [undo, redo]);

  if (!pkg) return null;

  return (
    <div className="mx-auto flex h-full w-full min-h-0 max-w-[1800px] flex-1 flex-col gap-3 p-4">
      <PackageHeader pkg={pkg} />
      <Toolbar pkg={pkg} pendingFiles={pendingFiles} />
      <MediaWarningsBanner pkg={pkg} pendingFiles={pendingFiles} />
      <CompletenessBanner pkg={pkg} />
      <AssetTable pkg={pkg} pendingFiles={pendingFiles} />
    </div>
  );
}
