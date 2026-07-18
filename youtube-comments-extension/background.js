// Service worker: make clicking the toolbar icon open the side panel,
// and let the side panel open itself for the current tab.

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((err) => console.warn("[YCG] setPanelBehavior failed:", err));
});

// Belt-and-suspenders: also open the panel on explicit action clicks
// (only fires if openPanelOnActionClick isn't already handling it).
chrome.action.onClicked.addListener((tab) => {
  if (tab && tab.windowId != null) {
    chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {});
  }
});
