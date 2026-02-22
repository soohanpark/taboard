// Magic numbers and string constants extracted from app.js
// These are used throughout the application for debouncing, intervals, and UI defaults

export const PERSIST_DEBOUNCE_MS = 350;
export const DRIVE_SYNC_DEBOUNCE_MS = 1500;
export const SEARCH_DEBOUNCE_MS = 150;
export const TAB_UPDATE_DEBOUNCE_MS = 100;
export const DRIVE_SYNC_INTERVAL = 30 * 60 * 1000;
export const NEWTAB_DRIVE_CHECK_INTERVAL = 60 * 60 * 1000;
export const TAB_DRAG_MIME = "application/taboard-tab";
export const VIEW_MODES = { SPACES: "spaces", FAVORITES: "favorites" };
export const FALLBACK_FAVICON =
  (typeof chrome !== "undefined" &&
    chrome.runtime?.getURL?.("icons/icon48.png")) ||
  "icons/icon48.png";
export const DEFAULT_BOARD_NAME = "Untitled board";
export const DEFAULT_SPACE_NAME = "Untitled";
export const SNACKBAR_DURATION_MS = 3000;
