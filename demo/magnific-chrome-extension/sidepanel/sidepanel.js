import { folderReferenceFromUrl, captureFolder, captureSingle } from "../magnific.js";
import {
  discoverBridge,
  getSessionStatus,
  buildPushPayload,
  pushToEditor,
  findAssetsMissingMedia,
} from "../editor-bridge.js";
import {
  magnificKey,
  findCaptureIdByMagnificIdentifier,
  usedFragmentIds,
  ensureUniqueFragmentId,
  rewireIncomingFragmentReferences,
  summarizeCaptureResults,
} from "../basket-dedup.js";

const QUEUE_KEY = "daiceCaptureQueue";
const CAPTURES_KEY = "daiceCaptures";
const DB_NAME = "daice-magnific-extension";
const DB_STORE = "media-blobs";
const DB_VERSION = 1;
const BRIDGE_POLL_MS = 5000;

/** captureId -> { fragment, capturedAt, hasMedia, mimeType, hasThumbnail } */
const captures = new Map();

let bridgeBase = null;
let bridgeSession = null;
let pushing = false;

const els = {
  captureFolderBtn: document.getElementById("capture-folder-btn"),
  folderStatus: document.getElementById("folder-status"),
  captureToast: document.getElementById("capture-toast"),
  captureList: document.getElementById("capture-list"),
  captureCount: document.getElementById("capture-count"),
  emptyState: document.getElementById("empty-state"),
  clearAllBtn: document.getElementById("clear-all-btn"),
  syncBtn: document.getElementById("sync-btn"),
  syncStatus: document.getElementById("sync-status"),
  syncDot: document.getElementById("sync-dot"),
  cardTemplate: document.getElementById("capture-card-template"),
};

init();

async function init() {
  await loadPersistedCaptures();
  render();
  updateSyncUi();
  els.captureFolderBtn.addEventListener("click", onCaptureFolderClick);
  els.clearAllBtn.addEventListener("click", onClearAll);
  els.syncBtn.addEventListener("click", onSyncToEditor);
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "session" && changes[QUEUE_KEY]) drainQueuedContextCaptures();
  });
  await drainQueuedContextCaptures();

  await updateFolderDetection();
  chrome.tabs.onActivated.addListener(updateFolderDetection);
  chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
    if (tab.active && changeInfo.url) updateFolderDetection();
  });

  await pollBridge();
  setInterval(pollBridge, BRIDGE_POLL_MS);
}

async function updateFolderDetection() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const folderReference = folderReferenceFromUrl(tab?.url);
  els.captureFolderBtn.disabled = !folderReference;
  els.folderStatus.textContent = folderReference
    ? "✓ Folder detected on this tab."
    : "Not on a project folder page right now.";
}

function showToast(message, { variant = "default" } = {}) {
  els.captureToast.textContent = message;
  els.captureToast.classList.toggle("toast-warn", variant === "warn");
}

async function onCaptureFolderClick() {
  els.captureFolderBtn.disabled = true;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const folderReference = folderReferenceFromUrl(tab?.url);
    if (!folderReference) {
      showToast("Open a Magnific project folder page first (magnific.com/app/projects/…).");
      return;
    }
    showToast("Capturing folder…");
    const results = await captureFolder(folderReference);
    const families = [
      ...new Set(results.map((r) => r.fragment.metadata?.magnificFamily).filter(Boolean)),
    ];
    await evictBasketFamilies(families);
    await evictLegacyIdCollisions(results);
    const captureResults = [];
    for (const result of results) captureResults.push(await addCapture(result));
    const summary = summarizeCaptureResults(captureResults);
    showToast(summary.message, { variant: summary.variant });
  } catch (err) {
    console.error("[DAICE-Chain] folder capture failed", err);
    showToast(`Capture failed: ${err.message}`);
  } finally {
    await updateFolderDetection();
    render();
    updateSyncUi();
  }
}

async function drainQueuedContextCaptures() {
  const { [QUEUE_KEY]: queue = [] } = await chrome.storage.session.get(QUEUE_KEY);
  if (queue.length === 0) return;
  await chrome.storage.session.set({ [QUEUE_KEY]: [] });
  const captureResults = [];
  for (const request of queue) {
    const result = await handleQueuedRequest(request);
    if (result) captureResults.push(...result);
  }
  if (captureResults.length > 0) {
    const summary = summarizeCaptureResults(captureResults);
    showToast(summary.message, { variant: summary.variant });
  }
  render();
  updateSyncUi();
}

async function handleQueuedRequest(request) {
  if (request.kind !== "single") return [];
  const numericId = request.target?.numericId;
  const folderReference = request.target?.folderReference;
  if (!numericId) {
    showToast("Couldn't identify that element to capture.");
    return [];
  }
  try {
    showToast("Capturing…");
    const results = await captureSingle({ numericId, folderReference });
    const captureResults = [];
    for (const result of results) captureResults.push(await addCapture(result));
    return captureResults;
  } catch (err) {
    console.error("[DAICE-Chain] single capture failed", err);
    showToast(`Capture failed: ${err.message}`);
    return [];
  }
}

/**
 * Stage one capture with basket dedup. Returns { action: "new"|"replaced"|"renamed", ... }.
 */
async function addCapture(result) {
  const identifier = magnificKey(result.fragment);
  let action = "new";
  let renamedFrom;
  let renamedTo;

  let mediaBlob = result.mediaBlob;
  let thumbnailBlob = result.thumbnailBlob;
  let mimeType = result.mediaBlob?.type;

  let excludeCaptureId = null;
  if (identifier) {
    const existingCaptureId = findCaptureIdByMagnificIdentifier(captures, identifier);
    if (existingCaptureId) {
      const existingEntry = captures.get(existingCaptureId);
      if (!mediaBlob) {
        mediaBlob = await getBlob(existingCaptureId);
        if (mediaBlob) mimeType = mediaBlob.type || existingEntry?.mimeType;
      }
      if (!thumbnailBlob) {
        thumbnailBlob = await getBlob(thumbKey(existingCaptureId));
      }
      await removeCapture(existingCaptureId, { render: false });
      excludeCaptureId = existingCaptureId;
      action = "replaced";
    }
  }

  const takenIds = usedFragmentIds(captures, excludeCaptureId);
  const unique = ensureUniqueFragmentId(result.fragment, takenIds);
  let fragment = unique.fragment;
  if (unique.renamed) {
    action = action === "replaced" ? "replaced" : "renamed";
    renamedFrom = unique.oldId;
    renamedTo = unique.newId;
    fragment = rewireIncomingFragmentReferences(fragment, unique.oldId, unique.newId);
    if (fragment.mediaPath) {
      const ext = fragment.mediaPath.split(".").pop();
      fragment = {
        ...fragment,
        mediaPath: ext ? `assets/${fragment.id}.${ext}` : `assets/${fragment.id}`,
      };
    }
  }

  const captureId = `${fragment.id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  if (mediaBlob) await putBlob(captureId, mediaBlob);
  if (thumbnailBlob) await putBlob(thumbKey(captureId), thumbnailBlob);

  captures.set(captureId, {
    fragment,
    capturedAt: result.capturedAt,
    hasMedia: Boolean(mediaBlob),
    mimeType: mimeType || fragment.mediaMimeType,
    hasThumbnail: Boolean(thumbnailBlob),
  });

  await persistCaptures();
  return { action, renamedFrom, renamedTo };
}

function thumbKey(captureId) {
  return `${captureId}:thumb`;
}

function magnificFamily(fragment) {
  return fragment.metadata?.magnificFamily ?? null;
}

/** Drop stale basket rows for families being re-captured from a folder. */
async function evictBasketFamilies(families) {
  const familySet = new Set(families.filter(Boolean));
  if (familySet.size === 0) return;
  for (const captureId of [...captures.keys()]) {
    const entry = captures.get(captureId);
    if (familySet.has(magnificFamily(entry.fragment))) {
      await removeCapture(captureId, { render: false });
    }
  }
}

/** Remove legacy entries (no magnificIdentifier) when a fresh capture reuses their id. */
async function evictLegacyIdCollisions(incomingResults) {
  const incomingIds = new Set(incomingResults.map((r) => r.fragment.id));
  for (const captureId of [...captures.keys()]) {
    const entry = captures.get(captureId);
    if (!magnificKey(entry.fragment) && incomingIds.has(entry.fragment.id)) {
      await removeCapture(captureId, { render: false });
    }
  }
}

async function removeCapture(captureId, { render: shouldRender = true } = {}) {
  captures.delete(captureId);
  await deleteBlob(captureId);
  await deleteBlob(thumbKey(captureId));
  await persistCaptures();
  if (shouldRender) {
    render();
    updateSyncUi();
  }
}

async function persistCaptures() {
  await chrome.storage.session.set({ [CAPTURES_KEY]: Object.fromEntries(captures) });
}

async function loadPersistedCaptures() {
  const { [CAPTURES_KEY]: stored = {} } = await chrome.storage.session.get(CAPTURES_KEY);
  for (const [id, entry] of Object.entries(stored)) captures.set(id, entry);
}

function render() {
  els.captureList.innerHTML = "";
  const entries = [...captures.entries()];
  els.captureCount.textContent = String(entries.length);
  els.emptyState.style.display = entries.length === 0 ? "block" : "none";
  els.clearAllBtn.disabled = entries.length === 0;

  for (const [captureId, entry] of entries) {
    const node = els.cardTemplate.content.cloneNode(true);
    const card = node.querySelector(".capture-card");
    const thumb = node.querySelector(".thumb");

    node.querySelector(".prompt").textContent = entry.fragment.prompt || entry.fragment.id;
    const modelPart = entry.fragment.model ? `${entry.fragment.model} · ` : "";
    node.querySelector(".meta").textContent =
      `${modelPart}${entry.fragment.aiGenerated ? "AI-generated" : "Source upload"}`;

    if (entry.hasThumbnail) {
      getBlob(thumbKey(captureId)).then((blob) => {
        if (blob) thumb.src = URL.createObjectURL(blob);
      });
    } else if (entry.hasMedia && entry.mimeType?.startsWith("image/")) {
      getBlob(captureId).then((blob) => {
        if (blob) thumb.src = URL.createObjectURL(blob);
      });
    } else if (!entry.hasThumbnail && !entry.hasMedia) {
      const placeholder = document.createElement("div");
      placeholder.className = "thumb thumb-missing";
      placeholder.title = "No media downloaded";
      placeholder.textContent = "no media";
      thumb.replaceWith(placeholder);
    } else {
      thumb.remove();
    }

    node.querySelector(".remove-btn").addEventListener("click", () => removeCapture(captureId));
    els.captureList.appendChild(card);
  }
}

async function onClearAll() {
  for (const captureId of [...captures.keys()]) await removeCapture(captureId, { render: false });
  render();
  updateSyncUi();
}

async function pollBridge() {
  if (pushing) return;
  try {
    bridgeBase = await discoverBridge();
    if (!bridgeBase) {
      bridgeSession = null;
    } else {
      bridgeSession = await getSessionStatus(bridgeBase);
    }
  } catch {
    bridgeBase = null;
    bridgeSession = null;
  }
  updateSyncUi();
}

function updateSyncUi() {
  const count = captures.size;
  const ready = bridgeSession?.ready === true;
  const connected = bridgeSession?.connected === true;

  els.syncDot.classList.remove("sync-dot-ready", "sync-dot-connected", "sync-dot-down");
  if (pushing) {
    els.syncBtn.disabled = true;
    els.syncBtn.textContent = "Sending…";
    els.syncStatus.textContent = "Pushing staged assets to the editor…";
    els.syncDot.classList.add("sync-dot-connected");
    return;
  }

  if (!bridgeBase) {
    els.syncBtn.disabled = true;
    els.syncBtn.textContent = "Send to editor";
    els.syncStatus.textContent =
      count === 0
        ? "Start DAICE-Chain editor (`npm run dev` in demo/editor) and open a package."
        : `Start DAICE-Chain editor (\`npm run dev\`) and open a package to send ${count} staged asset(s).`;
    els.syncDot.classList.add("sync-dot-down");
    return;
  }

  if (!connected || !ready) {
    els.syncBtn.disabled = true;
    els.syncBtn.textContent = "Send to editor";
    els.syncStatus.textContent = connected
      ? "Editor connected — open or create a package on the Editor screen."
      : "Editor bridge found — open the DAICE-Chain editor tab.";
    els.syncDot.classList.add("sync-dot-connected");
    return;
  }

  const pkgName = bridgeSession.packageName || "open package";
  els.syncBtn.disabled = count === 0;
  els.syncBtn.textContent = count === 0 ? "Send to editor" : `Send ${count} asset(s) to editor`;
  els.syncStatus.textContent =
    count === 0
      ? `Connected to "${pkgName}" — capture assets to send.`
      : `Ready — will send to "${pkgName}".`;
  els.syncDot.classList.add("sync-dot-ready");
}

async function onSyncToEditor() {
  if (pushing || !bridgeBase || !bridgeSession?.ready || captures.size === 0) return;

  pushing = true;
  updateSyncUi();

  try {
    const payload = buildPushPayload(captures);
    const missingMedia = findAssetsMissingMedia(captures);
    const mediaBlobs = new Map();

    for (const [captureId, entry] of captures) {
      if (!entry.hasMedia) continue;
      const blob = await getBlob(captureId);
      if (blob) mediaBlobs.set(entry.fragment.id, blob);
    }

    const result = await pushToEditor(bridgeBase, payload, mediaBlobs);

    if (result.ok) {
      if (missingMedia.length > 0) {
        const names = missingMedia.slice(0, 2).join(", ");
        const extra = missingMedia.length > 2 ? ` +${missingMedia.length - 2} more` : "";
        showToast(
          `Sent ${payload.assets.length} asset(s) — ${missingMedia.length} without media (${names}${extra}). Re-capture or check Magnific.`,
          { variant: "warn" },
        );
      } else {
        showToast(`Sent ${payload.assets.length} asset(s) to editor.`, { variant: "default" });
      }
    } else if (result.status === 409) {
      showToast("Open a package in the DAICE-Chain editor first.", { variant: "warn" });
      bridgeSession = await getSessionStatus(bridgeBase).catch(() => null);
    } else if (result.status === 422 && result.errors?.length) {
      const first = result.errors[0];
      showToast(`Validation failed: ${first.path} — ${first.message}`, { variant: "warn" });
    } else {
      showToast(result.error || "Send to editor failed.", { variant: "warn" });
    }
  } catch (err) {
    console.error("[DAICE-Chain] sync to editor failed", err);
    showToast(`Send failed: ${err.message}`, { variant: "warn" });
  } finally {
    pushing = false;
    await pollBridge();
  }
}

// --- IndexedDB blob cache ---

let dbPromise;
function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => request.result.createObjectStore(DB_STORE);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  return dbPromise;
}

async function putBlob(key, blob) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, "readwrite");
    tx.objectStore(DB_STORE).put(blob, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getBlob(key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(DB_STORE, "readonly").objectStore(DB_STORE).get(key);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

async function deleteBlob(key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, "readwrite");
    tx.objectStore(DB_STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
