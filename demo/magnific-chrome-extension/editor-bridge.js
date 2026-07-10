/**
 * HTTP client for the DAICE-Chain editor dev bridge (see ../editor/BRIDGE.md).
 * Used by the side panel to discover a running editor, check session
 * readiness, and push staged asset fragments + media bytes.
 */

export const DEFAULT_EDITOR_BASE = "http://localhost:5173/api/daice-editor/v1";
const EDITOR_BASE_STORAGE_KEY = "daiceEditorBase";
const PORT_SCAN_START = 5173;
const PORT_SCAN_END = 5180;

export async function getEditorBase() {
  const { [EDITOR_BASE_STORAGE_KEY]: stored } = await chrome.storage.local.get(EDITOR_BASE_STORAGE_KEY);
  return typeof stored === "string" && stored.length > 0 ? stored : DEFAULT_EDITOR_BASE;
}

export async function setEditorBase(base) {
  await chrome.storage.local.set({ [EDITOR_BASE_STORAGE_KEY]: base });
}

function apiPath(base, path) {
  return `${base.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}

export async function probeBridge(base) {
  try {
    const res = await fetch(apiPath(base, "/health"));
    if (!res.ok) return null;
    const body = await res.json();
    if (body?.ok && body?.service === "daice-editor-bridge") return { ok: true, base };
    return null;
  } catch {
    return null;
  }
}

export async function discoverBridge() {
  const stored = await getEditorBase();
  const storedHit = await probeBridge(stored);
  if (storedHit) return storedHit.base;

  for (let port = PORT_SCAN_START; port <= PORT_SCAN_END; port++) {
    const base = `http://localhost:${port}/api/daice-editor/v1`;
    if (base === stored) continue;
    const hit = await probeBridge(base);
    if (hit) {
      await setEditorBase(hit.base);
      return hit.base;
    }
  }
  return null;
}

export async function getSessionStatus(base) {
  const res = await fetch(apiPath(base, "/session"));
  if (!res.ok) throw new Error(`Session check failed (${res.status})`);
  return res.json();
}

/**
 * Build the JSON payload for POST /push from the side-panel basket.
 * @param {Map<string, { fragment: object, hasMedia?: boolean, mimeType?: string }>} captures
 */
export function buildPushPayload(captures) {
  const assets = [];
  const media = [];

  for (const entry of captures.values()) {
    assets.push(entry.fragment);
    if (entry.hasMedia) {
      const filename = entry.fragment.mediaPath?.split("/").pop() || `${entry.fragment.id}.bin`;
      media.push({
        assetId: entry.fragment.id,
        filename,
        mimeType: entry.mimeType || entry.fragment.mediaMimeType || "application/octet-stream",
      });
    }
  }

  return { assets, media: media.length > 0 ? media : undefined };
}

/**
 * Asset ids staged with a mediaPath but no downloaded blob in the basket.
 * @param {Map<string, { fragment: object, hasMedia?: boolean }>} captures
 */
export function findAssetsMissingMedia(captures) {
  const missing = [];
  for (const entry of captures.values()) {
    if (entry.fragment.mediaPath && !entry.hasMedia) {
      missing.push(entry.fragment.id);
    }
  }
  return missing;
}

/**
 * POST /push as multipart/form-data with payload JSON + media_<assetId> blobs.
 * @param {string} base
 * @param {{ assets: object[], media?: Array<{ assetId: string, filename?: string, mimeType?: string }> }} payload
 * @param {Map<string, Blob>} mediaBlobs assetId -> blob
 */
export async function pushToEditor(base, payload, mediaBlobs) {
  const form = new FormData();
  form.append("payload", JSON.stringify(payload));

  for (const ref of payload.media ?? []) {
    const blob = mediaBlobs.get(ref.assetId);
    if (blob) {
      form.append(`media_${ref.assetId}`, blob, ref.filename || ref.assetId);
    }
  }

  const res = await fetch(apiPath(base, "/push"), { method: "POST", body: form });
  const body = await res.json().catch(() => ({}));

  if (res.status === 202) {
    return { ok: true, pushId: body.pushId };
  }

  return {
    ok: false,
    status: res.status,
    error: body.error || `Push failed (${res.status})`,
    errors: body.errors,
    details: body.details,
  };
}
