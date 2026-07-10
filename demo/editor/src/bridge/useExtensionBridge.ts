import { useEffect, useRef, useState } from "react";
import { useEditorDispatch, useEditorState } from "@/state/EditorProvider";
import { generateId } from "@/utils/id";
import { applyExtensionPush } from "./applyExtensionPush";
import { BRIDGE_API_BASE, type BridgeInboxJob, type BridgeSessionHeartbeat } from "./extensionBridgeTypes";

const HEARTBEAT_INTERVAL_MS = 5000;
const POLL_INTERVAL_MS = 1500;

export type BridgeConnectionState = "unavailable" | "connected" | "ready";

/**
 * Keeps the dev-only extension bridge (../../vite-plugins/daiceExtensionBridge.ts,
 * ../../BRIDGE.md) informed that this tab is open and, once a package is
 * loaded, applies any asset pushes the Magnific extension queues while it
 * polls. See applyExtensionPush.ts for what "applies" means.
 *
 * `onPushApplied` fires after each job is applied, with how many assets it
 * added, so the caller can surface a toast — this hook itself renders
 * nothing.
 */
export function useExtensionBridge(onPushApplied?: (addedCount: number) => void): BridgeConnectionState {
  const { pkg } = useEditorState();
  const dispatch = useEditorDispatch();
  const sessionIdRef = useRef(generateId("session"));
  const pkgRef = useRef(pkg);
  pkgRef.current = pkg;
  const onPushAppliedRef = useRef(onPushApplied);
  onPushAppliedRef.current = onPushApplied;
  const [state, setState] = useState<BridgeConnectionState>("unavailable");

  useEffect(() => {
    let cancelled = false;

    async function heartbeat() {
      const body: BridgeSessionHeartbeat = {
        sessionId: sessionIdRef.current,
        hasPackage: Boolean(pkgRef.current),
        packageId: pkgRef.current?.package.id,
        packageName: pkgRef.current?.package.packageName,
        assetCount: pkgRef.current?.assets.length ?? 0,
      };
      try {
        const res = await fetch(`${BRIDGE_API_BASE}/session`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (cancelled) return;
        setState(res.ok ? (pkgRef.current ? "ready" : "connected") : "unavailable");
      } catch {
        if (!cancelled) setState("unavailable");
      }
    }

    heartbeat();
    const interval = setInterval(heartbeat, HEARTBEAT_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    // pkg is read via pkgRef so the heartbeat loop doesn't restart on every edit — only its *presence* changes what's sent, and that's picked up on the next tick regardless.
  }, []);

  useEffect(() => {
    if (!pkg) return;
    let cancelled = false;
    let applying = false;

    async function pollOnce() {
      if (applying) return;
      try {
        const res = await fetch(`${BRIDGE_API_BASE}/inbox`);
        if (!res.ok || cancelled) return;
        const jobs = (await res.json()) as BridgeInboxJob[];
        const job = jobs[0];
        const currentPkg = pkgRef.current;
        if (!job || !currentPkg) return;

        applying = true;
        try {
          const result = await applyExtensionPush(job, currentPkg, dispatch);
          onPushAppliedRef.current?.(result.addedAssetIds.length);
        } catch (error) {
          console.error("Failed to apply extension push", error);
        } finally {
          // Ack regardless of success — a job that fails once (e.g. a bad
          // media URL) would otherwise retry forever and block every push
          // queued behind it.
          await fetch(`${BRIDGE_API_BASE}/inbox/${job.id}/ack`, { method: "POST" });
          applying = false;
        }
      } catch {
        // Bridge unreachable this tick — next poll retries.
      }
    }

    const interval = setInterval(pollOnce, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [pkg, dispatch]);

  return state;
}
