/**
 * Deliberately thin: this script never reads prompt/model text out of the
 * page. Its only job is to remember which element was right-clicked (so the
 * background script's context-menu handler knows what to capture), expose
 * the current page's folder id, and — since Magnific suppresses the native
 * right-click menu on some tiles (video cards install their own custom
 * menu) — inject a "Capture" button on every recognized tile as a fallback
 * that doesn't depend on the native context menu at all. All actual asset
 * data comes from Magnific's own JSON API — see magnific.js.
 *
 * Every Magnific creation tile (image or video, on a project folder page or
 * on any tool's own "Creations" feed) carries a `data-item="{numericId}"`
 * attribute matching the creation's numeric `id` — this is the one
 * consistent hook across all of Magnific's tile markup (their `data-cy`
 * naming is not: only video tiles expose an identifier there, e.g.
 * `video-box-{identifier}`; image tiles never do). magnific.js resolves
 * that numeric id to a full creation record itself, so this script only
 * needs to find it.
 */

const TILE_SELECTOR = "[data-item]";

let lastContextTarget = null;

document.addEventListener(
  "contextmenu",
  (event) => {
    lastContextTarget = event.target instanceof Element ? describeTarget(event.target) : null;
  },
  true,
);

function describeTarget(element) {
  const tile = element.closest(TILE_SELECTOR);
  return {
    kind: "single",
    numericId: tile && !isProjectFolderCard(tile) ? tile.getAttribute("data-item") : null,
    folderReference: folderReferenceFromLocation(),
    pageUrl: location.href,
  };
}

function folderReferenceFromLocation() {
  const match = /\/app\/projects\/([0-9a-f-]{36})/i.exec(location.href);
  return match ? match[1] : null;
}

// A *project folder card* (e.g. on the Projects list page) also carries
// `data-item`, but its value is the folder's own uuid, not a creation's
// numeric id — it's marked with its own `data-project-item` attribute, and
// there is nothing capturable about it as a single asset (folder capture is
// the side panel's job). Skip it entirely.
function isProjectFolderCard(tile) {
  return Boolean(tile.closest("[data-project-item]"));
}

// --- Hover capture button: works even where Magnific's own contextmenu
// handler calls preventDefault() and suppresses the native menu (and thus
// our contextMenus entry) entirely, e.g. on video tiles. Rendered as a
// single floating badge (not a child of the tile) positioned just outside
// it, since every corner *inside* a tile is contested by one of Magnific's
// own hover icons/badges/checkbox — verified by inspecting real tile
// markup — so an in-tile button always ends up overlapping something. ---

const floatingButton = createFloatingButton();
let activeTile = null;
let hideTimer = null;

document.addEventListener("mouseover", (event) => {
  const tile = event.target instanceof Element ? event.target.closest(TILE_SELECTOR) : null;
  if (!tile || isProjectFolderCard(tile)) return;
  clearTimeout(hideTimer);
  activeTile = tile;
  positionFloatingButton(tile);
  floatingButton.style.display = "flex";
});

document.addEventListener("mouseout", (event) => {
  const leavingTile = event.target instanceof Element ? event.target.closest(TILE_SELECTOR) : null;
  if (!leavingTile) return;
  const goingTo = event.relatedTarget;
  if (goingTo === floatingButton || floatingButton.contains(goingTo)) return;
  scheduleHide();
});

window.addEventListener(
  "scroll",
  () => {
    if (activeTile) positionFloatingButton(activeTile);
  },
  true,
);
window.addEventListener("resize", () => {
  if (activeTile) positionFloatingButton(activeTile);
});

function scheduleHide() {
  clearTimeout(hideTimer);
  // Short grace period: the cursor crosses a real (if small) gap between
  // the tile and the floating button on its way from one to the other.
  hideTimer = setTimeout(() => {
    floatingButton.style.display = "none";
    activeTile = null;
  }, 200);
}

function createFloatingButton() {
  const style = document.createElement("style");
  style.textContent = `
    .daice-chain-capture-float-btn {
      position: fixed;
      z-index: 2147483647;
      display: none;
      align-items: center;
      gap: 4px;
      padding: 4px 8px;
      border-radius: 6px;
      border: none;
      background: rgba(20, 20, 24, 0.92);
      color: #fff;
      font: 600 11px/1.2 -apple-system, BlinkMacSystemFont, sans-serif;
      letter-spacing: 0.01em;
      cursor: pointer;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
    }
    .daice-chain-capture-float-btn:hover { background: rgba(88, 84, 214, 0.95); }
  `;
  document.head.appendChild(style);

  const button = document.createElement("button");
  button.type = "button";
  button.className = "daice-chain-capture-float-btn";
  button.textContent = "Capture DAICE-Chain";
  button.title = "Capture to DAICE-Chain sidebar";
  button.addEventListener("mouseenter", () => clearTimeout(hideTimer));
  button.addEventListener("mouseleave", scheduleHide);
  button.addEventListener("mousedown", (event) => event.stopPropagation());
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (activeTile) chrome.runtime.sendMessage({ type: "daice-chain:capture-request", target: describeTarget(activeTile) });
  });
  document.body.appendChild(button);
  return button;
}

function positionFloatingButton(tile) {
  const rect = tile.getBoundingClientRect();
  const btnWidth = floatingButton.offsetWidth || 90;
  const btnHeight = floatingButton.offsetHeight || 22;
  const gap = 6;

  let left = rect.right + gap;
  if (left + btnWidth > window.innerWidth - 4) {
    left = rect.left - btnWidth - gap; // not enough room to the right — use the left instead
  }
  let top = rect.top + rect.height / 2 - btnHeight / 2;
  top = Math.min(Math.max(top, 4), window.innerHeight - btnHeight - 4);

  floatingButton.style.left = `${Math.max(4, left)}px`;
  floatingButton.style.top = `${top}px`;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "daice-chain:get-context-target") {
    sendResponse(lastContextTarget);
  }
  return false;
});
