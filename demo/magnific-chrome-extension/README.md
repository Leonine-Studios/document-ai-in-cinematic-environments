# DAICE-Chain Capture for Magnific

A Chrome MV3 extension demonstrating how a real generation platform (Magnific) can feed [DAICE-Chain](../../spec/README.md) documentation with minimal effort.

## What it does

- **Capture a single asset — hover it and click "Capture DAICE-Chain"** — anywhere on magnific.com: a project folder page, or any tool's own "Creations" feed panel (e.g. the AI Image Generator, Video Generator, or any editing tool). This is the one reliable, documented way to capture a single asset; it floats just outside the tile (not on top of it), since every corner *inside* a tile is contested by one of Magnific's own hover icons/badges. It's skipped entirely on project-folder cards (e.g. the Projects list page) — those aren't a capturable asset; use "Capture this project folder" instead. (A native right-click "Capture to DAICE-Chain sidebar" menu item also exists, but Magnific suppresses the native context menu on many tiles — notably video cards — so it isn't reliable enough to document as the primary way to capture.)
- **Capture a whole project folder** from the side panel: reads every asset in the folder open in the current tab and turns each into a DAICE-Chain asset fragment (prompt, model, seed, creator, media file). Only possible while a project folder page is open — the side panel shows a live "folder detected" / "not on a folder page" status so this is never a guessing game.
- Captures accumulate in the side panel's basket as you browse, each reviewable and individually removable. Duplicates (same Magnific creation captured again) replace the existing staged card automatically, with an amber warning toast so you know a decision was made.
- **Send to editor** pushes the whole basket to a locally running DAICE-Chain editor dev server when a package is open (see below).

## Load it (unpacked)

1. Open `chrome://extensions`.
2. Enable "Developer mode" (top right).
3. Click "Load unpacked" and select this folder.
4. Open the extension's side panel (toolbar icon). Hover any image/video anywhere on magnific.com and click "Capture DAICE-Chain" to capture it individually, or open a Magnific project folder page (`magnific.com/app/projects/{id}`) and click "Capture this project folder" to grab everything in it at once.

## Send to editor (dev bridge)

Live sync uses the HTTP bridge documented in [`demo/editor/BRIDGE.md`](../editor/BRIDGE.md). It only exists while the editor dev server is running — not in production builds.

1. **Terminal:** `cd daice-chain/demo/editor && npm run dev` — note the port Vite prints (defaults to 5173).
2. **Editor tab:** Create a new package, import one, or load the demo project. You must be on the **Editor screen** (not Home) — the bridge status chip in the editor header should be green ("ready to receive pushes").
3. **Extension side panel:** The sync dot turns green when ready. Click **Send N asset(s) to editor**.
4. Assets appear in the editor table within ~2 seconds, with media previews. Ctrl+Z undoes the push one asset at a time.

The extension auto-discovers the editor on ports 5173–5180. To pin a custom port, set `daiceEditorBase` in extension local storage (e.g. `http://localhost:5174/api/daice-editor/v1`).

## How it works

- [`magnific.js`](magnific.js) is the one file that knows about Magnific: its API endpoints (folder listing, creation/family lookup, the account's global "creations" feed) and the mapping from a Magnific "creation" record to a spec-clean DAICE-Chain asset fragment. If Magnific's API changes, this is the file to update.
- [`editor-bridge.js`](editor-bridge.js) is the one file that knows about the DAICE-Chain editor HTTP bridge: discovery, session polling, and multipart push.
- [`basket-dedup.js`](basket-dedup.js) handles staging deduplication at capture time (replace-by-`magnificIdentifier`, unique fragment ids, reference rewiring).
- [`content.js`](content.js) injects the hover "Capture DAICE-Chain" button (the primary, reliable capture trigger), also tracks which element was right-clicked for the native menu item, and reads the current folder id from the page URL — it never scrapes prompt/model text from the DOM. All asset data comes from Magnific's own JSON API, read with the user's existing logged-in session (ordinary cookies, no API key).
- **Every Magnific tile — image or video, on any page — carries `data-item="{numericId}"`**, matching the creation's numeric `id`. This is the one consistent hook across Magnific's markup: only *video* tiles also expose an `identifier` (the alphanumeric id most of the rest of the API keys on) via `data-cy="video-box-{identifier}"` — image tiles never do, on any page, including a project folder page. So the numeric id is what content.js reads, and `magnific.js` resolves it to a full creation record from there (see below). Project-folder cards also carry `data-item` (the folder's own uuid), but are marked with their own `data-project-item` attribute, which content.js uses to skip them — they're not a capturable asset.
- **Resolving a numeric id to a capturable asset**: on a project folder page, its own listing (`GET /app/api/projects/workspaces/assets`) is searched for a matching `creation.id` — no extra request needed beyond what folder capture already does. Off a folder page (e.g. a tool's "Creations" panel), there's no folder id in the URL to search against, so the account's own global feed (`GET /app/api/creations`, unfiltered — the same feed backing every tool's "Creations" panel, paginated most-recent-first) is searched instead; each item there already carries its own `folder_reference`, which is then used to fetch that folder's listing exactly as before.
- [`background.js`](background.js) owns the context menu, receives hover-button clicks via `chrome.runtime.onMessage`, opens the side panel, and hands both off to it via a small queue in `chrome.storage.session`. `chrome.sidePanel.open()` is called as the very first, fully synchronous thing in both handlers — Chrome only honors it within the same task as the user gesture that triggered the click, and inserting an `await` first (e.g. reading storage) silently loses that and the panel just never opens.
- [`sidepanel/`](sidepanel) holds the basket UI, drains that queue, does the actual API calls and media downloads (an extension page can fetch cross-origin with the granted `host_permissions`, unlike the content script), polls the editor bridge, and tracks the active tab to show live "folder detected" status. The UI keeps two states clearly apart: the persistent "is a folder detected on this tab" status next to the folder button, and a separate transient toast for "Captured N asset(s)" / dedup warnings / error feedback from *either* capture mode.
- Media bytes are downloaded **at capture time** — Magnific's media URLs are signed and expire within hours — and cached in the side panel's IndexedDB until sent to the editor. A separate, UI-only preview thumbnail (the folder listing's own `thumbnail`, or a video's poster frame) is cached alongside it so every card in the basket shows a picture, even for videos and raw uploads.
- The folder listing endpoint is queried with a narrower `exclude_tool_name[]` than Magnific's own "Organized" tab uses: raw uploads (`tool: "upload"`) are *kept* — their `download_url`/`thumbnail` here are the *only* place a source upload's media is available (its own creation record has no media URL at all) — but `spaces` (a canvas/board, not a media asset) and internal reference-upload tooling are still excluded, since neither is a generation nor a source upload.
- No build step, no dependencies, no `@daice-chain/core` import — plain JS/HTML/CSS so the whole extension is auditable at a glance.

## Static tests

From the repo root:

```bash
node demo/magnific-chrome-extension/test/static-check.mjs
node demo/magnific-chrome-extension/test/basket-dedup.mjs
node demo/magnific-chrome-extension/test/push-payload-check.mjs
```

## Known limitations

- Magnific doesn't preserve the full reference graph itself: an image-to-image chain within one "family" is recovered automatically (`imageReferences`), but a video's reference images are only copied media (no reusable creation id) — those are recorded under `metadata.magnificMediaReferences` for visibility and wired into `references` by hand in the editor. This is a deliberate, documented limitation, not a bug.
- Single-asset capture off a folder page depends on the item showing up in the account's global "creations" feed within its first ~300 items (5 pages) — true for anything recently touched, but a very old asset scrolled deep into a tool's history might not resolve; opening its project folder page is the fallback in that case.
- The editor bridge only works during `npm run dev` — not `vite preview` or static deploy. No auth; localhost trust model only.
- Verified live against Chrome across two passes, which surfaced and fixed: missing media/thumbnails for raw uploads; a hover button that first appeared in the same corner as Magnific's own hover icons and lost the fight for clicks (moved to the one empty corner); and single-asset capture never working for images at all, on any page, because their tiles don't carry the `data-cy` identifier the first draft looked for (replaced with the universal `data-item` numeric id, see "How it works"). See the static tests above for no-browser verification of mapping, dedup, and push payload shape.
