import {
  FALLBACK_FAVICON,
  TAB_DRAG_MIME,
  TAB_UPDATE_DEBOUNCE_MS,
  SEARCH_DEBOUNCE_MS,
} from "./constants.js";
import { getDraggingCard } from "./drag.js";

const tabListEl = document.getElementById("tab-list");
const tabCountEl = document.getElementById("tab-count");
const tabFilterInput = document.getElementById("tab-filter");

let openTabs = [];
let tabFilter = "";
const cleanupTabListeners = [];
let tabUpdateTimer = null;
let tabFilterDebounceTimer = null;
let tabsInitialized = false;

let tabCallbacks = {
  addTabCardToBoard: null,
};

const safeTabsQuery = (query) =>
  new Promise((resolve) => {
    if (!chrome?.tabs?.query) {
      resolve([]);
      return;
    }
    chrome.tabs.query(query, (tabs) => {
      if (chrome.runtime?.lastError) {
        console.warn("tabs.query failed", chrome.runtime.lastError);
        resolve([]);
        return;
      }
      resolve(tabs);
    });
  });

const safeTabsUpdate = (tabId) => {
  if (!chrome?.tabs?.update) return;
  chrome.tabs.update(tabId, { active: true });
};

const closeBrowserTab = (tabId) => {
  if (!tabId) return;
  if (chrome?.tabs?.remove) {
    chrome.tabs.remove(tabId, () => {
      if (chrome.runtime?.lastError) {
        console.warn(chrome.runtime.lastError);
      } else {
        fetchOpenTabs();
      }
    });
  }
};

export const renderOpenTabs = () => {
  if (getDraggingCard()) return;

  const filtered = openTabs.filter((tab) => {
    if (!tabFilter) return true;
    const haystack = `${tab.title} ${tab.url}`.toLowerCase();
    return haystack.includes(tabFilter.toLowerCase());
  });

  if (tabCountEl) {
    tabCountEl.textContent = filtered.length;
  }

  if (!tabListEl) return;

  const fragment = document.createDocumentFragment();
  filtered.forEach((tab) => {
    const item = document.createElement("div");
    item.className = "tab-item";
    item.dataset.tabId = tab.id;
    item.dataset.tabTitle = tab.title ?? "";
    item.dataset.tabUrl = tab.url ?? "";
    const iconSrc =
      tab.favIconUrl && /^https?:/i.test(tab.favIconUrl)
        ? tab.favIconUrl
        : FALLBACK_FAVICON;
    item.dataset.tabIcon = iconSrc;
    item.draggable = Boolean(tab.url);
    item.tabIndex = 0;
    item.setAttribute("role", "button");
    item.role = "button";

    const favicon = document.createElement("img");
    favicon.className = "tab-favicon";
    favicon.alt = "";
    favicon.src = iconSrc;
    favicon.addEventListener("error", () => {
      favicon.src = FALLBACK_FAVICON;
    });

    const info = document.createElement("div");
    info.className = "tab-info";

    const title = document.createElement("p");
    title.className = "tab-title";
    title.textContent = tab.title;

    const url = document.createElement("p");
    url.className = "tab-url";
    url.textContent = tab.url;

    info.appendChild(title);
    info.appendChild(url);
    item.appendChild(favicon);
    item.appendChild(info);

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "tab-close";
    closeBtn.dataset.closeTabId = tab.id;
    closeBtn.title = "Close tab";
    closeBtn.textContent = "×";
    item.appendChild(closeBtn);

    fragment.appendChild(item);
  });

  tabListEl.replaceChildren(fragment);
};

export const fetchOpenTabs = async () => {
  openTabs = await safeTabsQuery({ currentWindow: true });
  renderOpenTabs();
};

export const registerTabObservers = () => {
  if (!chrome?.tabs) return;

  const debouncedUpdate = () => {
    clearTimeout(tabUpdateTimer);
    tabUpdateTimer = setTimeout(fetchOpenTabs, TAB_UPDATE_DEBOUNCE_MS);
  };

  const events = [
    chrome.tabs.onCreated,
    chrome.tabs.onRemoved,
    chrome.tabs.onUpdated,
    chrome.tabs.onMoved,
    chrome.tabs.onAttached,
    chrome.tabs.onDetached,
    chrome.tabs.onReplaced,
    chrome.tabs.onActivated,
  ];

  events.forEach((event) => {
    if (event?.addListener) {
      event.addListener(debouncedUpdate);
      cleanupTabListeners.push(() => event.removeListener(debouncedUpdate));
    }
  });

  window.addEventListener("unload", () => {
    while (cleanupTabListeners.length) {
      const unsubscribe = cleanupTabListeners.pop();
      try {
        unsubscribe();
      } catch (error) {
        console.warn("Error while cleaning up tab listeners", error);
      }
    }
  });
};

export const initTabs = (callbacks = {}) => {
  tabCallbacks = {
    ...tabCallbacks,
    ...callbacks,
  };

  if (tabsInitialized) return;
  tabsInitialized = true;

  tabFilterInput?.addEventListener("input", (event) => {
    tabFilter = event.target.value.trim();
    clearTimeout(tabFilterDebounceTimer);
    tabFilterDebounceTimer = setTimeout(() => renderOpenTabs(), SEARCH_DEBOUNCE_MS);
  });

  tabListEl?.addEventListener("dragstart", (event) => {
    const tabItem = event.target.closest(".tab-item");
    if (
      !tabItem ||
      !tabItem.dataset.tabUrl ||
      typeof tabCallbacks.addTabCardToBoard !== "function"
    ) {
      return;
    }
    const payload = {
      title: tabItem.dataset.tabTitle,
      url: tabItem.dataset.tabUrl,
      favIcon: tabItem.dataset.tabIcon,
    };
    event.dataTransfer.setData(TAB_DRAG_MIME, JSON.stringify(payload));
    event.dataTransfer.setData("text/plain", tabItem.dataset.tabUrl);
    event.dataTransfer.effectAllowed = "copy";
  });

  tabListEl?.addEventListener("click", (event) => {
    const closeBtn = event.target.closest(".tab-close");
    if (closeBtn) {
      event.stopPropagation();
      const tabId = Number(closeBtn.dataset.closeTabId);
      closeBrowserTab(tabId);
      return;
    }
    const item = event.target.closest(".tab-item");
    if (!item) return;
    const tabId = Number(item.dataset.tabId);
    safeTabsUpdate(tabId);
  });
};
