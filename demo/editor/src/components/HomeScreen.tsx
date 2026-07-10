import { useRef, useState } from "react";
import { FilePlus2, FolderOpen, Sparkles } from "lucide-react";
import type { DaicePackage } from "@leoninestudios/daice-chain-core";
import { useEditorDispatch, useEditorState } from "@/state/EditorProvider";
import { importPackage } from "@/io/importPackage";
import { loadDemoPackage } from "@/io/demoPackage";
import { generateId } from "@/utils/id";
import { Button } from "@/components/ui/button";
import { ErrorPanel } from "@/components/ErrorPanel";

function blankPackage(): DaicePackage {
  const now = new Date().toISOString();
  return {
    daiceVersion: "0.1.0",
    package: {
      id: generateId("package"),
      packageName: "",
      createdAt: now,
      createdBy: { name: "" },
    },
    assets: [],
  };
}

export function HomeScreen() {
  const dispatch = useEditorDispatch();
  const { importErrors } = useEditorState();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);

  async function handleFileChosen(file: File) {
    setImporting(true);
    try {
      const result = await importPackage(file);
      if (result.ok) {
        dispatch({ type: "LOAD_PACKAGE", pkg: result.pkg, pendingFiles: result.pendingFiles });
      } else {
        dispatch({ type: "IMPORT_FAILED", errors: result.errors });
      }
    } finally {
      setImporting(false);
    }
  }

  async function handleLoadDemoProject() {
    setImporting(true);
    try {
      const { pkg, pendingFiles } = await loadDemoPackage();
      dispatch({ type: "LOAD_PACKAGE", pkg, pendingFiles });
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="flex w-full max-w-xl flex-col gap-4 rounded-xl border border-border bg-card p-8 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">DAICE-Chain Editor</p>
        <h1 className="text-2xl font-semibold">Author, import, and export DAICE-Chain packages</h1>
        <p className="text-sm text-muted-foreground">
          This proof-of-concept editor keeps everything in memory — nothing is saved until you export it. Start a new package,
          import an existing one, or load the reference demo package.
        </p>

        <div className="flex flex-wrap gap-2 pt-2">
          <Button onClick={() => dispatch({ type: "NEW_PACKAGE", pkg: blankPackage() })}>
            <FilePlus2 className="h-4 w-4" /> New package
          </Button>
          <Button variant="outline" disabled={importing} onClick={() => fileInputRef.current?.click()}>
            <FolderOpen className="h-4 w-4" /> {importing ? "Importing…" : "Import package (.zip or .json)"}
          </Button>
          <Button variant="ghost" disabled={importing} onClick={() => void handleLoadDemoProject()}>
            <Sparkles className="h-4 w-4" /> Load demo project
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".zip,application/zip,.json,application/json"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void handleFileChosen(file);
            }}
          />
        </div>

        {importErrors && <ErrorPanel errors={importErrors} onDismiss={() => dispatch({ type: "DISMISS_IMPORT_ERRORS" })} />}
      </div>
    </div>
  );
}
