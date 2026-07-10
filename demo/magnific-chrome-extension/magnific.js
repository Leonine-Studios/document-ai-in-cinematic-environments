/**
 * The one file in this extension that knows anything about Magnific: its
 * two API endpoints (verified live against magnific.com on 2026-07-08) and
 * the mapping from a Magnific "creation" record to a DAICE-Chain asset
 * fragment. If Magnific changes its API, this is the only file that should
 * need to change.
 *
 * Every exported function here is plain data-in/data-out (no DOM access),
 * so it can also be exercised outside a browser — see test/static-check.mjs.
 */

const API_BASE = "https://www.magnific.com/app/api";

const MIME_BY_EXTENSION = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  mp3: "audio/mpeg",
  wav: "audio/wav",
};

const EXTENSION_BY_MIME = Object.fromEntries(
  Object.entries(MIME_BY_EXTENSION).map(([ext, mime]) => [mime, ext]),
);

/** Extracts the folder id from a Magnific project URL, e.g. `.../app/projects/{uuid}`. */
export function folderReferenceFromUrl(url) {
  const match = /\/app\/projects\/([0-9a-f-]{36})/i.exec(url || "");
  return match ? match[1] : null;
}

/** One page of every asset in a Magnific project folder, via the same endpoint the app's own UI uses. */
export async function fetchFolderAssets(folderReference, { page = 1, perPage = 50 } = {}) {
  const params = new URLSearchParams({
    page: String(page),
    per_page: String(perPage),
    order_direction: "desc",
    folder_reference: folderReference,
    include_subfolders: "true",
    lang: "en_US",
  });
  // Deliberately NOT excluding tool_name=upload, unlike the request
  // Magnific's own "Organized" tab issues: raw uploads only carry their
  // `download_url`/`thumbnail` here (their /creations/{family} record has
  // no media URL of its own — see pickSourceUrl), so excluding them would
  // silently drop the media for every non-AI leaf asset. "spaces" (a
  // canvas/board, not a media asset) and the internal reference-upload
  // tools are still excluded — they're neither a generation nor a source
  // upload, so there's no DaiceAsset to make out of them.
  for (const excludedTool of ["video-upload", "upload-reference", "spaces"]) {
    params.append("exclude_tool_name[]", excludedTool);
  }
  const response = await fetch(`${API_BASE}/projects/workspaces/assets?${params.toString()}`, {
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error(`Magnific folder listing failed (HTTP ${response.status})`);
  }
  const body = await response.json();
  return Array.isArray(body.data) ? body.data : [];
}

/**
 * The full generation chain ("family") behind one output: a raw upload
 * (`tool: "upload"`) plus however many generation steps that used it,
 * flattened into one array. Two folder-listing items can share a family
 * (e.g. an uploaded reference image and the generation that used it) even
 * though they appear as separate cards in Magnific's UI.
 */
export async function fetchCreationFamily(familyReference) {
  const params = new URLSearchParams({ lang: "en_US" });
  const response = await fetch(`${API_BASE}/creations/${familyReference}?${params.toString()}`, {
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error(`Magnific creation lookup failed (HTTP ${response.status})`);
  }
  const body = await response.json();
  return Array.isArray(body.data) ? body.data : [];
}

/**
 * Builds an in-progress "draft" from one Magnific creation record. A draft
 * carries `_magnific` bookkeeping (identifier/family/reference pointers)
 * needed to auto-wire references across a capture batch; call
 * finalizeFragment() to strip that down to a spec-clean DaiceAsset.
 */
export function creationToDraft(creation, { owner, listingItem, folderListing, familyCreations } = {}) {
  const listingMeta = listingItem?.creation?.metadata ?? {};
  const familyMeta = creation.metadata ?? {};
  const meta = { ...listingMeta, ...familyMeta };
  const enrichedCreation = { ...creation, metadata: meta };
  const isUpload = creation.tool === "upload";
  // Video creations expose their own output at `metadata.url`; image
  // ("talk") creations don't carry a direct media URL in this endpoint at
  // all — only the folder listing's `download_url` has it. Resolve the
  // media URL first so both cases can still name the asset after its file.
  let sourceUrl = pickSourceUrl(enrichedCreation, listingItem);
  if (!sourceUrl && isUpload && folderListing?.length) {
    sourceUrl = findUploadMediaUrl(creation, folderListing, familyCreations);
  }
  const nameSource = meta.name || filenameFromUrl(meta.url) || filenameFromUrl(sourceUrl) || creation.identifier;
  // Two shapes carry a video's input images: Seedance's multi-image prompt
  // (`@img1`/`@img2`) uses `metadata.references[]`; every other video model
  // observed (Kling, Veo, Wan, Runway, ...) uses `metadata.keyframes`
  // (start/end slots) instead — normalize both into one list so downstream
  // reference wiring doesn't need to know which model produced a creation.
  const mediaReferences = Array.isArray(meta.references) ? [...meta.references] : [];
  const keyframes = meta.keyframes && typeof meta.keyframes === "object" ? meta.keyframes : {};
  for (const [slot, frame] of Object.entries(keyframes)) {
    if (frame?.url) {
      mediaReferences.push({ url: frame.url, name: slot, type: frame.type, media_id: frame.media_id });
    }
  }

  const draft = {
    id: slugify(nameSource),
    aiGenerated: !isUpload,
    references: [],
    metadata: {
      sourceUrl,
      magnificIdentifier: creation.identifier,
      magnificFamily: creation.family,
    },
    _magnific: {
      identifier: creation.identifier,
      family: creation.family,
      imageReferences: Array.isArray(meta.imageReferences) ? meta.imageReferences : [],
      mediaReferences,
      // UI-only preview, never part of the exported fragment: a video's own
      // source is a poster frame away from being displayable as an <img>,
      // and some records (e.g. uploads) only expose a usable image via the
      // listing's `thumbnail`, not `sourceUrl` at all.
      thumbnailUrl: pickThumbnailUrl(enrichedCreation, listingItem, sourceUrl),
    },
  };

  if (!isUpload) {
    draft.provider = "Magnific";
    draft.model = meta.slug || meta.mode || creation.tool;
    draft.prompt = typeof meta.prompt === "string" ? meta.prompt : "";
    if (owner?.display_name) {
      draft.generatedBy = { name: owner.display_name, email: owner.email };
    }
    draft.generatedAt = creation.created_at;
    const seed = extractMagnificSeed(meta);
    if (seed !== undefined) draft.seed = seed;
    if (Array.isArray(meta.tags) && meta.tags.length > 0) {
      draft.metadata.tags = meta.tags;
    }
    if (mediaReferences.length > 0) {
      // Summary kept for provenance; wireCopiedMediaReferences() resolves the
      // full entries into DAICE-Chain references when a batch match exists.
      draft.metadata.magnificMediaReferences = mediaReferences.map((ref) => ({
        name: ref.name,
        mediaId: ref.media_id,
      }));
    }
  }

  return draft;
}

/** Cross-links drafts in the same capture batch using Magnific reference data. */
export function wireReferences(drafts) {
  const byIdentifier = new Map(drafts.map((draft) => [draft._magnific.identifier, draft]));
  for (const draft of drafts) {
    for (const ref of draft._magnific.imageReferences) {
      const match = /^creation:(.+)$/.exec(ref?.image || "");
      const target = match ? byIdentifier.get(match[1]) : undefined;
      if (target && target !== draft) {
        draft.references.push(ref.label ? { assetId: target.id, label: ref.label } : { assetId: target.id });
      }
    }
  }
  wireCopiedMediaReferences(drafts, byIdentifier);
}

/** Parses `/production/{id}/` from Magnific CDN URLs. */
export function mediaIdFromUrl(url) {
  if (!url) return undefined;
  try {
    const match = /\/production\/(\d+)\//.exec(new URL(url).pathname);
    return match ? Number.parseInt(match[1], 10) : undefined;
  } catch {
    return undefined;
  }
}

/** Basename without extension, lowercased — for matching copied reference files. */
export function filenameStemFromUrl(url) {
  const filename = filenameFromUrl(url);
  if (!filename) return undefined;
  return filename.replace(/\.[a-z0-9]+$/i, "").toLowerCase();
}

function draftFilenameStems(draft) {
  const stems = new Set();
  const fromUrl = filenameStemFromUrl(draft.metadata?.sourceUrl);
  if (fromUrl) stems.add(fromUrl);
  if (draft.id) stems.add(String(draft.id).toLowerCase());
  return stems;
}

/** Indexes drafts by production media id and filename stem for reference matching. */
export function indexDraftsForMediaMatch(drafts) {
  const byMediaId = new Map();
  const byStem = new Map();

  for (const draft of drafts) {
    const mediaId = mediaIdFromUrl(draft.metadata?.sourceUrl);
    if (mediaId !== undefined) byMediaId.set(mediaId, draft);
    for (const stem of draftFilenameStems(draft)) {
      const list = byStem.get(stem) || [];
      list.push(draft);
      byStem.set(stem, list);
    }
  }

  return { byMediaId, byStem };
}

function resolveMediaRefDirect(ref, index) {
  if (ref.media_id !== undefined && index.byMediaId.has(ref.media_id)) {
    return index.byMediaId.get(ref.media_id);
  }

  const stem = filenameStemFromUrl(ref.url);
  if (!stem || !index.byStem.has(stem)) return undefined;

  const candidates = index.byStem.get(stem);
  if (candidates.length === 1) return candidates[0];

  const aiCandidates = candidates.filter((draft) => draft.aiGenerated);
  if (aiCandidates.length === 1) return aiCandidates[0];

  const uploadCandidates = candidates.filter((draft) => !draft.aiGenerated);
  if (uploadCandidates.length === 1) return uploadCandidates[0];

  return undefined;
}

function draftReferencesAsset(draft, assetId) {
  return draft.references.some((ref) => ref.assetId === assetId);
}

function aiDraftsReferencingUpload(drafts, uploadDraft, byIdentifier) {
  const uploadIdentifier = uploadDraft._magnific?.identifier;
  return drafts.filter((draft) => {
    if (!draft.aiGenerated || draft === uploadDraft) return false;
    if (draftReferencesAsset(draft, uploadDraft.id)) return true;
    for (const ref of draft._magnific?.imageReferences || []) {
      const match = /^creation:(.+)$/.exec(ref?.image || "");
      if (match && match[1] === uploadIdentifier) return true;
    }
    return false;
  });
}

function findAiRenderForSiblingUpload(drafts, uploadDraft, byIdentifier) {
  const candidates = aiDraftsReferencingUpload(drafts, uploadDraft, byIdentifier);
  if (candidates.length === 0) return undefined;
  if (candidates.length === 1) return candidates[0];
  return (
    candidates.find((draft) => /\.(jpe?g|png|webp|gif)/i.test(draft.metadata?.sourceUrl || "")) || candidates[0]
  );
}

/**
 * Wires video (and similar) copied-media refs into DAICE-Chain references when other
 * assets in the same capture batch can be matched by media id, filename, or
 * chain via a co-referenced upload.
 */
export function wireCopiedMediaReferences(drafts, byIdentifier = new Map(drafts.map((d) => [d._magnific.identifier, d]))) {
  const index = indexDraftsForMediaMatch(drafts);

  for (const draft of drafts) {
    const mediaRefs = draft._magnific?.mediaReferences;
    if (!mediaRefs?.length) continue;

    const targets = mediaRefs.map((ref) => resolveMediaRefDirect(ref, index));
    const siblingUploads = () => targets.filter((target) => target && !target.aiGenerated);

    // Prefer the AI render over an upload copy when a sibling ref resolves to
    // an upload that the AI render references (e.g. video img1 → render, not
    // the seedream export upload, when img2 → real-screenshot).
    for (let i = 0; i < targets.length; i += 1) {
      const current = targets[i];
      if (!current || current.aiGenerated) continue;
      for (const upload of siblingUploads()) {
        if (upload === current) continue;
        const aiRender = findAiRenderForSiblingUpload(drafts, upload, byIdentifier);
        if (aiRender) {
          targets[i] = aiRender;
          break;
        }
      }
    }

    // Chain fallback: unresolved image refs → AI render referencing a sibling upload.
    for (let i = 0; i < mediaRefs.length; i += 1) {
      if (targets[i]) continue;
      for (const upload of siblingUploads()) {
        const aiRender = findAiRenderForSiblingUpload(drafts, upload, byIdentifier);
        if (aiRender) {
          targets[i] = aiRender;
          break;
        }
      }
    }

    for (let i = 0; i < targets.length; i += 1) {
      const target = targets[i];
      if (!target || target === draft) continue;
      if (draft.references.some((ref) => ref.assetId === target.id)) continue;
      const label = mediaRefs[i]?.name;
      draft.references.push(label ? { assetId: target.id, label } : { assetId: target.id });
    }
  }
}

/** Guarantees unique `id`s within one capture batch, in place, per spec §2.3. */
export function ensureUniqueIds(drafts) {
  const seen = new Map();
  for (const draft of drafts) {
    const count = seen.get(draft.id) || 0;
    seen.set(draft.id, count + 1);
    if (count > 0) draft.id = `${draft.id}-${count + 1}`;
  }
}

/**
 * Collapse duplicate drafts that share the same Magnific creation identifier
 * (can happen when the same creation appears in multiple family fetches).
 * Prefers the draft whose listing item supplied a media URL.
 */
export function dedupeDraftsByIdentifier(drafts) {
  const byIdentifier = new Map();
  const withoutIdentifier = [];

  for (const draft of drafts) {
    const identifier = draft._magnific?.identifier;
    if (!identifier) {
      withoutIdentifier.push(draft);
      continue;
    }
    const existing = byIdentifier.get(identifier);
    if (!existing) {
      byIdentifier.set(identifier, draft);
      continue;
    }
    const existingHasMedia = Boolean(existing.metadata?.sourceUrl);
    const incomingHasMedia = Boolean(draft.metadata?.sourceUrl);
    if (incomingHasMedia && !existingHasMedia) {
      byIdentifier.set(identifier, draft);
    }
  }

  return [...byIdentifier.values(), ...withoutIdentifier];
}

/**
 * Strips `_magnific` bookkeeping and unset fields, producing an object with
 * only spec-defined keys — required because the asset schema declares
 * `additionalProperties: false`.
 */
export function finalizeFragment(draft) {
  const asset = {
    id: draft.id,
    aiGenerated: draft.aiGenerated,
    references: draft.references,
  };

  if (draft.aiGenerated) {
    if (draft.provider) asset.provider = draft.provider;
    if (draft.model) asset.model = draft.model;
    asset.prompt = draft.prompt ?? "";
    if (draft.generatedBy?.name) {
      asset.generatedBy = draft.generatedBy.email
        ? { name: draft.generatedBy.name, email: draft.generatedBy.email }
        : { name: draft.generatedBy.name };
    }
    if (draft.generatedAt) asset.generatedAt = draft.generatedAt;
    if (Number.isInteger(draft.seed)) asset.seed = draft.seed;
  }

  if (draft.mediaPath) asset.mediaPath = draft.mediaPath;
  if (draft.mediaMimeType) asset.mediaMimeType = draft.mediaMimeType;

  const metadata = { ...draft.metadata };
  for (const key of Object.keys(metadata)) {
    if (metadata[key] === undefined) delete metadata[key];
  }
  if (Object.keys(metadata).length > 0) asset.metadata = metadata;

  return asset;
}

/** Downloads media bytes at capture time — Magnific's URLs are signed and expire within hours. */
export async function downloadMedia(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download media (HTTP ${response.status})`);
  }
  const blob = await response.blob();
  const mimeType =
    blob.type && blob.type !== "application/octet-stream" ? blob.type : guessMimeFromUrl(url) || "application/octet-stream";
  return { blob, mimeType };
}

export function extensionForMime(mimeType) {
  return EXTENSION_BY_MIME[mimeType] || "bin";
}

function guessMimeFromUrl(url) {
  const ext = filenameFromUrl(url)?.split(".").pop()?.toLowerCase();
  return ext ? MIME_BY_EXTENSION[ext] : undefined;
}

function filenameFromUrl(url) {
  if (!url) return undefined;
  try {
    return decodeURIComponent(new URL(url).pathname.split("/").pop() || "");
  } catch {
    return undefined;
  }
}

/**
 * Which URL to treat as this creation's primary media. Magnific's records are
 * not entirely consistent about where this lives (top-level `metadata.url`
 * for most generations, a `mediaCollection` entry for others, and only the
 * outer folder-listing item for a plain upload) — this best-effort order
 * covers every shape observed live.
 */
function pickSourceUrl(creation, listingItem) {
  const meta = creation.metadata || {};
  if (typeof meta.url === "string" && meta.url) return meta.url;
  const collection = Array.isArray(meta.mediaCollection) ? meta.mediaCollection : [];
  const primary = collection.find((entry) => entry.type === "video" || entry.type === "image");
  if (primary?.url) return primary.url;
  if (listingItem?.download_url) return listingItem.download_url;
  if (listingItem?.thumbnail?.url) return listingItem.thumbnail.url;
  return undefined;
}

/**
 * Resolves a download URL for uploads that exist in a family fetch but have
 * no folder-listing row of their own. Magnific often records the bytes only
 * on another asset's `metadata.references` (e.g. a video's img2 entry).
 */
export function findUploadMediaUrl(creation, folderListing, familyCreations = []) {
  const uploadName = creation.metadata?.name;
  const uploadStem = uploadName ? uploadName.replace(/\.[a-z0-9]+$/i, "").toLowerCase() : null;
  if (!uploadStem) return undefined;

  function urlMatchesUpload(url) {
    if (!url) return false;
    try {
      const path = decodeURIComponent(new URL(url).pathname).toLowerCase();
      return path.includes(uploadStem);
    } catch {
      return url.toLowerCase().includes(uploadStem);
    }
  }

  function scanReferences(references) {
    if (!Array.isArray(references)) return undefined;
    for (const ref of references) {
      if (ref?.url && urlMatchesUpload(ref.url)) return ref.url;
    }
    return undefined;
  }

  for (const item of folderListing) {
    const fromListing = scanReferences(item.creation?.metadata?.references);
    if (fromListing) return fromListing;
  }

  for (const other of familyCreations) {
    if (other.identifier === creation.identifier) continue;
    const fromFamily = scanReferences(other.metadata?.references);
    if (fromFamily) return fromFamily;
  }

  return undefined;
}

/**
 * A displayable preview image for the side panel. Prefers the folder
 * listing's own `thumbnail` (present for every item type, including videos
 * and uploads) over a `mediaCollection` frame, and only falls back to the
 * main media URL when it's plausibly an image itself.
 */
function pickThumbnailUrl(creation, listingItem, sourceUrl) {
  if (listingItem?.thumbnail?.url) return listingItem.thumbnail.url;
  const meta = creation.metadata || {};
  const collection = Array.isArray(meta.mediaCollection) ? meta.mediaCollection : [];
  const frame = collection.find((entry) => entry.type === "frame" || entry.type === "preview-grid");
  if (frame?.url) return frame.url;
  const looksLikeImage = /\.(jpe?g|png|webp|gif)(\?|$)/i.test(sourceUrl || "");
  return looksLikeImage ? sourceUrl : undefined;
}

function parseSeed(value) {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) ? parsed : undefined;
}

/** Best-effort seed extraction across Magnific metadata shapes (images + video). */
export function extractMagnificSeed(meta = {}) {
  const direct = parseSeed(
    meta.seed ??
      meta.source_metadata?.seed ??
      meta.video_seed ??
      meta.generation_seed ??
      meta.random_seed,
  );
  if (direct !== undefined) return direct;

  if (meta.params && typeof meta.params === "object") {
    const fromParams = parseSeed(meta.params.seed ?? meta.params.video_seed ?? meta.params.random_seed);
    if (fromParams !== undefined) return fromParams;
  }

  if (meta.extraParameters && typeof meta.extraParameters === "object") {
    const fromExtra = parseSeed(meta.extraParameters.seed ?? meta.extraParameters.random_seed);
    if (fromExtra !== undefined) return fromExtra;
  }

  if (Array.isArray(meta.tags)) {
    for (const tag of meta.tags) {
      const match = /^seed[:\s]+(\d+)$/i.exec(String(tag).trim());
      if (match) {
        const fromTag = parseSeed(match[1]);
        if (fromTag !== undefined) return fromTag;
      }
    }
  }

  return findSeedInMetadata(meta);
}

/** Walk nested metadata for an own-property named `seed` with an integer value. */
export function findSeedInMetadata(meta, seen = new Set(), depth = 0, maxDepth = 4) {
  if (!meta || typeof meta !== "object" || depth > maxDepth) return undefined;
  if (seen.has(meta)) return undefined;
  seen.add(meta);

  if (Object.prototype.hasOwnProperty.call(meta, "seed")) {
    const parsed = parseSeed(meta.seed);
    if (parsed !== undefined) return parsed;
  }

  for (const value of Object.values(meta)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        const found = findSeedInMetadata(item, seen, depth + 1, maxDepth);
        if (found !== undefined) return found;
      }
    } else if (value && typeof value === "object") {
      const found = findSeedInMetadata(value, seen, depth + 1, maxDepth);
      if (found !== undefined) return found;
    }
  }

  return undefined;
}

// Magnific auto-names untitled generations after their full prompt, which
// can run to hundreds of characters — too long for a friendly `id`/filename.
const MAX_SLUG_LENGTH = 60;

function slugify(input) {
  const base = String(input ?? "asset")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\.[a-z0-9]+$/i, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/g, "");
  return base || "asset";
}

/**
 * Downloads media for every draft in a batch and finalizes it into a
 * schema-clean DaiceAsset fragment, pairing each with its media Blob (or
 * `null` if the asset has none / the download failed).
 */
export async function finalizeDraftsWithMedia(drafts) {
  const captures = [];
  for (const draft of drafts) {
    let mediaBlob = null;
    const sourceUrl = draft.metadata.sourceUrl;
    const thumbnailUrl = draft._magnific.thumbnailUrl;
    const isUpload = !draft.aiGenerated;

    if (sourceUrl) {
      try {
        const { blob, mimeType } = await downloadMedia(sourceUrl);
        draft.mediaMimeType = mimeType;
        draft.mediaPath = `assets/${draft.id}.${extensionForMime(mimeType)}`;
        mediaBlob = blob;
      } catch (err) {
        console.error(`[DAICE-Chain] failed to download media for "${draft.id}"`, err);
      }
    }

    // Uploads often have no `metadata.url` on the creation record — only the
    // folder listing's thumbnail/download_url. If the primary URL failed or
    // was missing, use the listing thumbnail as the exportable media bytes.
    if (!mediaBlob && isUpload && thumbnailUrl) {
      try {
        const { blob, mimeType } = await downloadMedia(thumbnailUrl);
        draft.mediaMimeType = mimeType;
        draft.mediaPath = `assets/${draft.id}.${extensionForMime(mimeType)}`;
        mediaBlob = blob;
      } catch (err) {
        console.warn(`[DAICE-Chain] failed to download upload fallback media for "${draft.id}"`, err);
      }
    }

    // The thumbnail is a side-panel preview convenience only — never part of
    // the exported fragment — so a download failure here is silent.
    let thumbnailBlob = null;
    if (thumbnailUrl && thumbnailUrl !== sourceUrl) {
      try {
        thumbnailBlob = (await downloadMedia(thumbnailUrl)).blob;
      } catch (err) {
        console.warn(`[DAICE-Chain] failed to download thumbnail for "${draft.id}"`, err);
      }
    } else if (thumbnailUrl === sourceUrl) {
      thumbnailBlob = mediaBlob;
    } else if (!thumbnailBlob && mediaBlob && isUpload) {
      thumbnailBlob = mediaBlob;
    }

    captures.push({
      fragment: finalizeFragment(draft),
      mediaBlob,
      thumbnailBlob,
      capturedAt: new Date().toISOString(),
    });
  }
  return captures;
}

/**
 * High-level orchestration: capture every asset in a Magnific project folder
 * as spec-clean DAICE-Chain asset fragments, media already downloaded.
 */
export async function captureFolder(folderReference) {
  const listing = await fetchFolderAssets(folderReference);
  const listingByIdentifier = new Map(
    listing.filter((item) => item.creation?.identifier).map((item) => [item.creation.identifier, item]),
  );
  const families = [...new Set(listing.map((item) => item.creation?.family).filter(Boolean))];

  const drafts = [];
  for (const family of families) {
    const creations = await fetchCreationFamily(family);
    for (const creation of creations) {
      const listingItem = listingByIdentifier.get(creation.identifier);
      drafts.push(
        creationToDraft(creation, {
          owner: listingItem?.owner,
          listingItem,
          folderListing: listing,
          familyCreations: creations,
        }),
      );
    }
  }

  const uniqueDrafts = dedupeDraftsByIdentifier(drafts);
  ensureUniqueIds(uniqueDrafts);
  wireReferences(uniqueDrafts);
  return finalizeDraftsWithMedia(uniqueDrafts);
}

const GLOBAL_FEED_MAX_PAGES = 5;

/**
 * Every Magnific tile — image or video, on a project folder page or on any
 * tool's own "Creations" feed panel — carries `data-item="{numericId}"`
 * matching the creation's numeric `id`. Off a folder page there's no folder
 * id to resolve against directly, so this walks the account's own global
 * feed (`GET /app/api/creations`, unfiltered — the same feed backing every
 * tool's "Creations" panel) looking for a matching `id`; each item there
 * already carries its own `folder_reference`. Recently-touched items are
 * always near the front (most-recent-first), so a handful of pages covers
 * the practical "I just right-clicked something I can see" case.
 */
async function resolveFeedItemByNumericId(numericId) {
  for (let page = 1; page <= GLOBAL_FEED_MAX_PAGES; page += 1) {
    const response = await fetch(`${API_BASE}/creations?page=${page}`, { credentials: "include" });
    if (!response.ok) throw new Error(`Magnific creations feed lookup failed (HTTP ${response.status})`);
    const body = await response.json();
    const match = (body.data || []).find((item) => String(item.id) === String(numericId));
    if (match) return match;
    if (!body.links?.next) break;
  }
  return undefined;
}

/**
 * Capture one clicked/right-clicked asset, identified only by its numeric
 * `id` (see resolveFeedItemByNumericId's comment for why — Magnific's
 * `data-cy` naming isn't a reliable identifier source for images). Resolves
 * it against a folder listing (the only endpoint that carries `owner`),
 * using the current page's folder id when available, or the account's
 * global feed to discover which folder it lives in otherwise. Then pulls in
 * its whole generation family so the same reference-wiring as a folder
 * capture applies.
 */
export async function captureSingle({ numericId, folderReference }) {
  if (!numericId) {
    throw new Error("Could not identify that element to capture.");
  }

  let resolvedFolderReference = folderReference;
  if (!resolvedFolderReference) {
    const feedItem = await resolveFeedItemByNumericId(numericId);
    if (!feedItem?.folder_reference) {
      throw new Error("Could not find this asset among your recent creations — try again from its project folder.");
    }
    resolvedFolderReference = feedItem.folder_reference;
  }

  const listing = await fetchFolderAssets(resolvedFolderReference);
  const listingByIdentifier = new Map(
    listing.filter((item) => item.creation?.identifier).map((item) => [item.creation.identifier, item]),
  );
  const listingItem = listing.find((item) => String(item.creation?.id) === String(numericId));
  if (!listingItem) {
    throw new Error("Could not find this asset in its project folder's listing.");
  }

  const creations = await fetchCreationFamily(listingItem.creation.family);
  const drafts = dedupeDraftsByIdentifier(
    creations.map((creation) =>
      creationToDraft(creation, {
        owner: listingItem.owner,
        listingItem:
          creation.identifier === listingItem.creation.identifier
            ? listingItem
            : listingByIdentifier.get(creation.identifier),
        folderListing: listing,
        familyCreations: creations,
      }),
    ),
  );

  ensureUniqueIds(drafts);
  wireReferences(drafts);
  return finalizeDraftsWithMedia(drafts);
}
