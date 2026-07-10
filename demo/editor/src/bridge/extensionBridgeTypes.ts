import type { DaiceAsset } from "@daice-chain/core";

/**
 * Shared request/response shapes for the dev-only extension bridge (see
 * ../../vite-plugins/daiceExtensionBridge.ts and ../../BRIDGE.md). Imported
 * as types (erased at build time) by the server-side Vite plugin too, so
 * the two sides of the bridge can never drift out of sync on shape.
 */
export const BRIDGE_API_BASE = "/api/daice-editor/v1";

/** Heartbeat the editor tab sends every few seconds so the bridge (and, through it, the extension) know a package is open and ready to receive a push. */
export interface BridgeSessionHeartbeat {
  sessionId: string;
  hasPackage: boolean;
  packageId?: string;
  packageName?: string;
  assetCount: number;
}

/** What GET /session reports — to the editor tab and to an external caller like the extension. */
export interface BridgeSessionStatus {
  /** A heartbeat arrived within the last 15s. */
  connected: boolean;
  /** connected AND a package is currently open — POST /push requires this. */
  ready: boolean;
  sessionId: string | null;
  hasPackage: boolean;
  packageId: string | null;
  packageName: string | null;
  assetCount: number;
  lastSeenAt: number;
}

/** One media reference in a push — either a remote URL (the bridge fetches it server-side) or omitted here in favor of a `media_<assetId>` multipart file part the extension already downloaded. */
export interface BridgePushMediaRef {
  assetId: string;
  url?: string;
  filename?: string;
  mimeType?: string;
}

/**
 * Body of POST /push. `assets` may reference each other via `references`
 * (the extension is allowed to pre-wire a lineage chain in one push);
 * `attachTo` optionally links an existing asset already in the open package
 * to every pushed asset that nothing else in this batch references (i.e.
 * every root of the pushed subgraph).
 */
export interface BridgePushRequest {
  assets: DaiceAsset[];
  attachTo?: string;
  media?: BridgePushMediaRef[];
}

export interface BridgePushAccepted {
  accepted: true;
  pushId: string;
}

export interface BridgePushRejected {
  error: string;
  errors?: Array<{ path: string; message: string }>;
  details?: string[];
}

/** One media descriptor as reported by GET /inbox — the actual bytes are fetched separately via mediaUrlFor(). */
export interface BridgeInboxMedia {
  assetId: string;
  filename: string;
  mimeType: string;
  byteLength: number;
}

export interface BridgeInboxJob {
  id: string;
  assets: DaiceAsset[];
  attachTo: string | null;
  media: BridgeInboxMedia[];
  createdAt: number;
}

/** Builds the URL to fetch one push job's raw media bytes from — see GET /inbox/:pushId/media/:assetId in daiceExtensionBridge.ts. */
export function mediaUrlFor(pushId: string, assetId: string): string {
  return `${BRIDGE_API_BASE}/inbox/${encodeURIComponent(pushId)}/media/${encodeURIComponent(assetId)}`;
}
