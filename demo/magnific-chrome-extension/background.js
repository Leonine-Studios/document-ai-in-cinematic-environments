/**
 * Service worker: owns the context menu and hands right-click captures off
 * to the side panel (which does the actual API calls — see sidepanel.js and
 * magnific.js). Deliberately does no Magnific-specific work itself.
 */

const CONTEXT_MENU_ID = "daice-chain-capture-asset";
const QUEUE_KEY = "daiceCaptureQueue";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: CONTEXT_MENU_ID,
    title: "Capture to DAICE-Chain sidebar",
    contexts: ["image", "video"],
    documentUrlPatterns: ["https://www.magnific.com/*"],
  });
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== CONTEXT_MENU_ID || !tab?.id) return;

  // chrome.sidePanel.open() is only honored when called synchronously
  // within the task that received the user gesture — any `await` first
  // (even a fast one, like a storage read) silently loses that context and
  // the panel just never opens. So this is the very first thing done here,
  // before any of the async work below.
  openSidePanelForTab(tab);

  chrome.tabs
    .sendMessage(tab.id, { type: "daice-chain:get-context-target" })
    .then((target) => enqueueCaptureRequest(buildCaptureRequest(target, tab)))
    .catch((err) => console.error("[DAICE-Chain] could not read the right-clicked element", err));
});

// Magnific installs its own custom context menu on some tiles (notably
// video cards — "Recreate video / Edit clip / Extend / Download / Move to
// trash") by calling preventDefault() on the contextmenu event, which
// suppresses the *native* menu entirely — our contextMenus entry never gets
// a chance to show there. content.js injects a hover "Capture" button on
// those tiles as an independent fallback that doesn't depend on the native
// menu at all; it reaches us here instead of going through
// chrome.contextMenus.onClicked.
chrome.runtime.onMessage.addListener((message, sender) => {
  if (message?.type !== "daice-chain:capture-request" || !sender.tab?.id) return;

  // Same ordering requirement as above: open first, synchronously, then do
  // the (async) enqueue.
  openSidePanelForTab(sender.tab);

  enqueueCaptureRequest(buildCaptureRequest(message.target, sender.tab)).catch((err) =>
    console.error("[DAICE-Chain] capture-request handling failed", err),
  );
});

function openSidePanelForTab(tab) {
  if (tab.windowId === undefined) return;
  chrome.sidePanel.open({ windowId: tab.windowId }).catch((err) => console.error("[DAICE-Chain] sidePanel.open failed", err));
}

function buildCaptureRequest(target, tab) {
  return {
    kind: target?.kind || "single",
    pageUrl: tab.url,
    target,
    queuedAt: Date.now(),
  };
}

async function enqueueCaptureRequest(request) {
  const { [QUEUE_KEY]: queue = [] } = await chrome.storage.session.get(QUEUE_KEY);
  queue.push(request);
  await chrome.storage.session.set({ [QUEUE_KEY]: queue });
}
