import { useState } from "react";
import { EditorProvider, useEditorState } from "@/state/EditorProvider";
import { HomeScreen } from "@/components/HomeScreen";
import { EditorScreen } from "@/components/EditorScreen";
import { ExtensionBridgeHost } from "@/components/ExtensionBridgeHost";
import type { BridgeConnectionState } from "@/bridge/useExtensionBridge";
import { cn } from "@/lib/utils";

const BRIDGE_STATUS_LABEL: Record<BridgeConnectionState, string> = {
  unavailable: "Extension bridge: no editor tab connected",
  connected: "Extension bridge: connected — open a package to receive pushes",
  ready: "Extension bridge: ready to receive pushes",
};

const BRIDGE_STATUS_DOT: Record<BridgeConnectionState, string> = {
  unavailable: "bg-muted-foreground/40",
  connected: "bg-amber-500",
  ready: "bg-emerald-500",
};

function Shell() {
  const { pkg } = useEditorState();
  const [bridgeState, setBridgeState] = useState<BridgeConnectionState>("unavailable");

  return (
    <div className="flex h-screen flex-col bg-background">
      <header className="flex items-center gap-3 border-b border-border bg-card px-4 py-2.5">
        <span className="text-sm font-semibold">DAICE-Chain Editor</span>
        <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">proof of concept · in-memory demo only</span>
        <span
          className="ml-auto flex items-center gap-1.5 rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground"
          title={BRIDGE_STATUS_LABEL[bridgeState]}
        >
          <span className={cn("h-1.5 w-1.5 rounded-full", BRIDGE_STATUS_DOT[bridgeState])} />
          Extension
        </span>
      </header>
      <main className="flex flex-1 flex-col overflow-hidden">{pkg ? <EditorScreen /> : <HomeScreen />}</main>
      <ExtensionBridgeHost onStateChange={setBridgeState} />
    </div>
  );
}

export default function App() {
  return (
    <EditorProvider>
      <Shell />
    </EditorProvider>
  );
}
