import {
  createDefaultState,
  generateId,
  getState,
  initState,
  getRandomAccent,
  replaceState,
  subscribe,
  updateState,
} from "./state.js";
import { loadStateFromStorage, saveStateToStorage } from "./storage.js";
import {
  connectDrive,
  disconnectDrive,
  getDriveSnapshot,
  initDrive,
  pullFromDrive,
  pushToDrive,
  subscribeDrive,
} from "./drive.js";
import {
  PERSIST_DEBOUNCE_MS,
  DRIVE_SYNC_DEBOUNCE_MS,
  SEARCH_DEBOUNCE_MS,
  TAB_UPDATE_DEBOUNCE_MS,
  DRIVE_SYNC_INTERVAL,
  NEWTAB_DRIVE_CHECK_INTERVAL,
  TAB_DRAG_MIME,
  VIEW_MODES,
  FALLBACK_FAVICON,
  DEFAULT_BOARD_NAME,
  SNACKBAR_DURATION_MS,
} from "./constants.js";
import {
  renderSpaceTabs,
  renderBoard,
  renderFavoritesBoard,
  resolveCardFavicon,
} from "./render.js";

const boardEl = document.getElementById("board");
const spaceTabsEl = document.getElementById("space-tabs");
const addColumnBtn = document.getElementById("add-column");
const cardModalEl = document.getElementById("card-modal");
const cardForm = document.getElementById("card-form");
const cardDeleteBtn = cardForm.querySelector("[data-delete-card]");
const cardNoteField = cardForm.querySelector("[data-card-field='note']");
const cardUrlField = cardForm.querySelector("[data-card-field='url']");
const cardUrlInput = cardForm.elements.url;
const spaceModalEl = document.getElementById("space-modal");
const spaceForm = document.getElementById("space-form");
const spaceDeleteBtn = spaceForm.querySelector("[data-delete-space]");
const snackbarEl = document.getElementById("snackbar");
const tabListEl = document.getElementById("tab-list");
const tabCountEl = document.getElementById("tab-count");
const tabFilterInput = document.getElementById("tab-filter");
const searchControl = document.getElementById("search-control");
const searchInput = document.getElementById("search-input");
const searchFocusBtn = document.getElementById("search-focus");
const driveControl = document.getElementById("drive-control");
const driveConnectBtn = document.getElementById("drive-connect");
const driveMenuSyncBtn = document.getElementById("drive-menu-sync");
const driveMenuDisconnectBtn = document.getElementById("drive-menu-disconnect");
const confirmModalEl = document.getElementById("confirm-modal");
const confirmMessageEl = document.getElementById("confirm-message");
const confirmAcceptBtn = document.getElementById("confirm-accept");
const confirmCancelBtn = document.getElementById("confirm-cancel");

let currentState = null;
let saveTimer = null;
let driveTimer = null;
let snackbarTimer = null;
let searchDebounceTimer = null;
let draggingCard = null;
let draggingBoardId = null;
let draggingSpaceId = null;
let openTabs = [];
let tabFilter = "";
const cleanupTabListeners = [];
let suppressCardClick = false;
let driveSyncIntervalId = null;
let confirmResolver = null;

const getActiveSpace = (state = currentState) => {
  if (!state?.spaces?.length) return null;
  const active = state.spaces.find(
    (space) => space.id === state.preferences?.activeSpaceId,
  );
  return active ?? state.spaces[0];
};

const findBoard = (space, boardId) =>
  space?.boards?.find((board) => board.id === boardId) ?? null;

const findSpaceById = (state, spaceId) =>
  state?.spaces?.find((space) => space.id === spaceId) ?? null;

const findCardContext = (
  state,
  { spaceId = null, boardId = null, cardId = null },
) => {
  let space =
    findSpaceById(state, spaceId) ??
    state?.spaces?.find((candidate) =>
      candidate.boards?.some((board) => board.id === boardId),
    ) ??
    state?.spaces?.find((candidate) =>
      candidate.boards?.some((board) =>
        board.cards?.some((item) => item.id === cardId),
      ),
    ) ??
    null;

  let board = space?.boards?.find((item) => item.id === boardId) ?? null;
  if (!board && space && cardId) {
    board = space.boards?.find((item) =>
      item.cards?.some((card) => card.id === cardId),
    );
  }

  const card = board?.cards?.find((item) => item.id === cardId) ?? null;
  return { space, board, card };
};

const findCardIndices = (
  state,
  { spaceId = null, boardId = null, cardId = null },
) => {
  for (let si = 0; si < (state?.spaces?.length ?? 0); si++) {
    const space = state.spaces[si];
    if (spaceId && space.id !== spaceId) continue;
    for (let bi = 0; bi < (space.boards?.length ?? 0); bi++) {
      const board = space.boards[bi];
      if (boardId && board.id !== boardId) continue;
      for (let ci = 0; ci < (board.cards?.length ?? 0); ci++) {
        if (board.cards[ci].id === cardId) {
          return { spaceIdx: si, boardIdx: bi, cardIdx: ci };
        }
      }
    }
  }
  return null;
};

const hideSnackbar = () => {
  clearTimeout(snackbarTimer);
  snackbarEl.classList.remove("visible");
  snackbarEl.setAttribute("aria-hidden", "true");
  snackbarEl.textContent = "";
};

const showSnackbar = (message, duration = SNACKBAR_DURATION_MS) => {
  if (!message) {
    hideSnackbar();
    return;
  }
  clearTimeout(snackbarTimer);
  snackbarEl.textContent = message;
  snackbarEl.classList.add("visible");
  snackbarEl.setAttribute("aria-hidden", "false");
  snackbarTimer = setTimeout(() => hideSnackbar(), duration);
};

hideSnackbar();

const openConfirm = (message) =>
  new Promise((resolve) => {
    confirmResolver = resolve;
    confirmMessageEl.textContent = message;
    confirmModalEl.classList.remove("hidden");
    confirmModalEl.classList.add("visible");
    confirmModalEl.setAttribute("aria-hidden", "false");
  });

const closeConfirm = () => {
  confirmModalEl.classList.add("hidden");
  confirmModalEl.classList.remove("visible");
  confirmModalEl.setAttribute("aria-hidden", "true");
  confirmResolver = null;
};

const schedulePersist = (state) => {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveStateToStorage(state), PERSIST_DEBOUNCE_MS);
};

const scheduleDriveSync = (
  state,
  { immediate = false, trigger = null, meta = null } = {},
) => {
  const driveSnapshot = getDriveSnapshot();
  if (driveSnapshot.status !== "connected") {
    return;
  }

  clearTimeout(driveTimer);
  const executor = async () => {
    try {
      if (trigger === "add-card") {
        await runDriveSync({ reason: "add-card", localState: state, meta });
        return;
      }
      await pushToDrive(state);
      if (immediate) showSnackbar("Google Drive backup complete");
    } catch (error) {
      console.error(error);
      showSnackbar("Drive sync failed: " + error.message);
    }
  };

  if (immediate || trigger === "add-card") {
    executor();
  } else {
    driveTimer = setTimeout(executor, DRIVE_SYNC_DEBOUNCE_MS);
  }
};

const mergeAddedCardsIntoRemote = (
  remoteState,
  localState,
  addedCards = [],
) => {
  if (!remoteState || !localState || !Array.isArray(addedCards)) {
    return remoteState;
  }

  const merged = JSON.parse(JSON.stringify(remoteState));

  const remoteHasCard = (cardId) => {
    if (!cardId) return false;
    return merged.spaces?.some((space) =>
      space.boards?.some((board) =>
        board.cards?.some((card) => card.id === cardId),
      ),
    );
  };

  addedCards.forEach((entry) => {
    const cardId = entry?.id;
    if (!cardId || remoteHasCard(cardId)) return;

    const { card } = findCardContext(localState, {
      spaceId: entry.spaceId ?? null,
      boardId: entry.boardId ?? null,
      cardId,
    });
    if (!card) return;

    let targetSpace =
      merged.spaces?.find((space) => space.id === entry.spaceId) ??
      merged.spaces?.[0] ??
      null;
    if (!targetSpace) return;

    let targetBoard =
      targetSpace.boards?.find((board) => board.id === entry.boardId) ??
      targetSpace.boards?.[0] ??
      null;
    if (!targetBoard) return;

    if (!Array.isArray(targetBoard.cards)) {
      targetBoard.cards = [];
    }
    targetBoard.cards.unshift(JSON.parse(JSON.stringify(card)));
  });

  return merged;
};

const runDriveSync = async ({
  reason = "interval",
  localState = null,
  meta = null,
  throwOnError = false,
} = {}) => {
  const snapshot = getDriveSnapshot();
  if (driveSyncInFlight || snapshot.status !== "connected") return;

  if (reason === "newtab") {
    const lastCheckedAt = snapshot.lastCheckedAt
      ? new Date(snapshot.lastCheckedAt).getTime()
      : 0;
    if (
      lastCheckedAt &&
      Date.now() - lastCheckedAt < NEWTAB_DRIVE_CHECK_INTERVAL
    ) {
      return;
    }
  }

  driveSyncInFlight = true;
  try {
    const remoteState = await pullFromDrive({
      markChecked: reason === "newtab",
    });
    const resolvedLocalState = localState ?? getState();

    // On connect: prioritize remote state to prevent new device from overwriting
    if (reason === "connect" && remoteState) {
      suppressNextDriveSync = true;
      replaceState(remoteState, { preserveTimestamp: true });
      return;
    }

    const remoteTime = remoteState?.lastUpdated
      ? new Date(remoteState.lastUpdated).getTime()
      : 0;
    const localTime = resolvedLocalState?.lastUpdated
      ? new Date(resolvedLocalState.lastUpdated).getTime()
      : 0;
    if (remoteState && remoteTime > localTime) {
      if (reason === "add-card" && meta?.addedCards?.length) {
        const mergedState = mergeAddedCardsIntoRemote(
          remoteState,
          resolvedLocalState,
          meta.addedCards,
        );
        suppressNextDriveSync = true;
        replaceState(mergedState);
        await pushToDrive(mergedState);
      } else {
        suppressNextDriveSync = true;
        replaceState(remoteState, { preserveTimestamp: true });
      }
    } else {
      await pushToDrive(resolvedLocalState);
    }
  } catch (error) {
    console.error("Google Drive sync failed", error);
    if (
      throwOnError ||
      reason === "manual" ||
      reason === "add-card" ||
      reason === "connect"
    ) {
      throw error;
    }
  } finally {
    driveSyncInFlight = false;
  }
};

const startDriveBackgroundSync = () => {
  if (driveSyncIntervalId) return;
  driveSyncIntervalId = setInterval(() => {
    runDriveSync({ reason: "interval" });
  }, DRIVE_SYNC_INTERVAL);
  runDriveSync({ reason: "newtab" });
};

const stopDriveBackgroundSync = () => {
  if (driveSyncIntervalId) {
    clearInterval(driveSyncIntervalId);
    driveSyncIntervalId = null;
  }
  driveSyncInFlight = false;
};

const updateCardFormFields = (type) => {
  const isLink = type === "link";
  if (cardNoteField) {
    cardNoteField.style.display = isLink ? "none" : "";
  }
  if (cardUrlField) {
    cardUrlField.style.display = isLink ? "" : "none";
  }
  if (cardUrlInput) {
    cardUrlInput.required = isLink;
  }
};

const getDragAfterElement = (container, y) => {
  const cards = [...container.querySelectorAll(".card:not(.dragging)")];
  return cards.reduce(
    (closest, child) => {
      const box = child.getBoundingClientRect();
      const offset = y - (box.top + box.height / 2);
      if (offset < 0 && offset > closest.offset) {
        return { offset, element: child };
      }
      return closest;
    },
    { offset: Number.NEGATIVE_INFINITY, element: null },
  ).element;
};

const getHorizontalAfterElement = (container, selector, x) => {
  const items = [...container.querySelectorAll(selector)];
  return items.reduce(
    (closest, child) => {
      const box = child.getBoundingClientRect();
      const offset = x - (box.left + box.width / 2);
      if (offset < 0 && offset > closest.offset) {
        return { offset, element: child };
      }
      return closest;
    },
    { offset: Number.NEGATIVE_INFINITY, element: null },
  ).element;
};

const attachDropTargets = (cardListEl) => {
  cardListEl.addEventListener("dragover", (event) => {
    const isTabDrag = Array.from(event.dataTransfer?.types ?? []).includes(
      TAB_DRAG_MIME,
    );
    const isCardDrag = Boolean(draggingCard);
    if (!isTabDrag && !isCardDrag) return;
    event.preventDefault();
    cardListEl.classList.add("drag-over");
    event.dataTransfer.dropEffect = draggingCard ? "move" : "copy";
  });

  cardListEl.addEventListener("dragleave", () => {
    cardListEl.classList.remove("drag-over");
  });

  cardListEl.addEventListener("drop", (event) => {
    const isTabDrag = Array.from(event.dataTransfer?.types ?? []).includes(
      TAB_DRAG_MIME,
    );
    const isCardDrag = Boolean(draggingCard);
    if (!isTabDrag && !isCardDrag) return;
    event.preventDefault();
    cardListEl.classList.remove("drag-over");
    const tabPayload = event.dataTransfer.getData(TAB_DRAG_MIME);
    if (tabPayload) {
      try {
        const parsed = JSON.parse(tabPayload);
        addTabCardToBoard(cardListEl.dataset.boardId, parsed);
      } catch (error) {
        console.warn("Could not parse drop data.", error);
      }
      return;
    }
    if (!draggingCard) return;
    const afterElement = getDragAfterElement(cardListEl, event.clientY);
    const cards = [...cardListEl.querySelectorAll(".card:not(.dragging)")];
    let targetIndex = cards.length;
    if (afterElement) {
      targetIndex = cards.findIndex(
        (el) => el.dataset.cardId === afterElement.dataset.cardId,
      );
    }
    moveCard(
      draggingCard.cardId,
      draggingCard.boardId,
      cardListEl.dataset.boardId,
      targetIndex,
      draggingCard.spaceId,
      cardListEl.dataset.spaceId || null,
    );
    suppressCardClick = true;
    setTimeout(() => {
      suppressCardClick = false;
    }, 0);
  });
};

const moveCard = (
  cardId,
  fromBoardId,
  toBoardId,
  targetIndex,
  fromSpaceId = null,
  toSpaceId = null,
) => {
  updateState(
    (draft) => {
      const sourceSpace = fromSpaceId
        ? findSpaceById(draft, fromSpaceId)
        : getActiveSpace(draft);
      const targetSpace =
        toSpaceId && toSpaceId !== fromSpaceId
          ? findSpaceById(draft, toSpaceId)
          : (sourceSpace ?? getActiveSpace(draft));
      if (!sourceSpace || !targetSpace) return;

      const fromBoard = findBoard(sourceSpace, fromBoardId);
      const toBoard = findBoard(targetSpace, toBoardId);
      if (!fromBoard || !toBoard) return;

      const cardIndex = fromBoard.cards.findIndex((card) => card.id === cardId);
      if (cardIndex === -1) return;

      const [card] = fromBoard.cards.splice(cardIndex, 1);
      const normalizedIndex = Math.max(
        0,
        Math.min(targetIndex, toBoard.cards.length),
      );
      toBoard.cards.splice(normalizedIndex, 0, card);
      card.updatedAt = new Date().toISOString();
    },
    { action: "move-card" },
  );
};

const moveCardToSpace = (targetSpaceId) => {
  if (!draggingCard) return;
  const targetSpace = findSpaceById(currentState, targetSpaceId);
  if (!targetSpace) return;
  if (draggingCard.spaceId === targetSpaceId) {
    showSnackbar("Card is already in this workspace.");
    return;
  }
  if (!targetSpace.boards?.length) {
    showSnackbar("Add a board to that space before moving cards.");
    return;
  }
  const targetBoardId = targetSpace.boards[0].id;
  moveCard(
    draggingCard.cardId,
    draggingCard.boardId,
    targetBoardId,
    0,
    draggingCard.spaceId,
    targetSpaceId,
  );
  suppressCardClick = true;
  setTimeout(() => {
    suppressCardClick = false;
  }, 0);
  showSnackbar(`Moved card to ${targetSpace.name}.`);
};

const moveBoard = (boardId, targetIndex, spaceId = null) => {
  updateState(
    (draft) => {
      const space = spaceId
        ? findSpaceById(draft, spaceId)
        : getActiveSpace(draft);
      if (!space) return;
      const fromIndex = space.boards.findIndex((board) => board.id === boardId);
      if (fromIndex === -1) return;
      const [board] = space.boards.splice(fromIndex, 1);
      const normalizedIndex = Math.max(
        0,
        Math.min(targetIndex, space.boards.length),
      );
      space.boards.splice(normalizedIndex, 0, board);
    },
    { action: "move-board" },
  );
};

const moveSpace = (spaceId, targetIndex) => {
  updateState(
    (draft) => {
      const fromIndex = draft.spaces.findIndex((space) => space.id === spaceId);
      if (fromIndex === -1) return;
      const [space] = draft.spaces.splice(fromIndex, 1);
      const normalizedIndex = Math.max(
        0,
        Math.min(targetIndex, draft.spaces.length),
      );
      draft.spaces.splice(normalizedIndex, 0, space);
    },
    { action: "move-space" },
  );
};

const clearSpaceTabDropState = () => {
  const targets = spaceTabsEl.querySelectorAll(".space-tab-drop");
  targets.forEach((tab) => tab.classList.remove("space-tab-drop"));
};

const clearSpaceDragging = () => {
  spaceTabsEl
    .querySelectorAll(".space-tab-drop, .space-tab.dragging")
    .forEach((el) => {
      el.classList.remove("space-tab-drop", "dragging");
    });
};

const clearColumnDropTargets = () => {
  const targets = boardEl.querySelectorAll(".column-drop-target");
  targets.forEach((column) => column.classList.remove("column-drop-target"));
};

const handleCardDragStart = ({
  cardId,
  boardId,
  spaceId,
  cardTitle,
  cardEl,
  event,
}) => {
  draggingCard = { cardId, boardId, spaceId };
  cardEl.classList.add("dragging");
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", cardTitle);
};

const handleCardDragEnd = ({ cardEl }) => {
  draggingCard = null;
  cardEl.classList.remove("dragging");
};

const enableColumnDrag = (column) => {
  const header = column.querySelector(".column-header");
  if (!header) return;
  header.draggable = true;
  header.addEventListener("dragstart", (event) => {
    const titleEl = event.target.closest(".column-title");
    if (titleEl && document.activeElement === titleEl) {
      event.preventDefault();
      return;
    }
    if (event.target.closest(".column-controls")) {
      event.preventDefault();
      return;
    }
    if (event.target.closest(".card")) return;
    draggingBoardId = column.dataset.boardId;
    column.classList.add("dragging");
    event.dataTransfer.effectAllowed = "move";
  });
  header.addEventListener("dragend", () => {
    draggingBoardId = null;
    column.classList.remove("dragging");
    clearColumnDropTargets();
  });
};

const openCardModal = ({ boardId, cardId = null, spaceId = null }) => {
  const { board, card } = findCardContext(currentState, {
    spaceId,
    boardId,
    cardId,
  });
  const fallbackSpace = getActiveSpace();
  const fallbackBoardId = fallbackSpace?.boards?.[0]?.id ?? "";
  const resolvedBoardId = board?.id ?? boardId ?? fallbackBoardId;

  if (!resolvedBoardId) {
    showSnackbar("Create a space first.");
    return;
  }

  cardForm.elements.boardId.value = resolvedBoardId;
  cardForm.elements.cardId.value = cardId ?? "";

  if (cardId && card) {
    cardForm.elements.title.value = card.title;
    cardForm.elements.type.value = card.type ?? "note";
    cardForm.elements.note.value = card.note ?? "";
    cardForm.elements.url.value = card.url ?? "";
    cardForm.elements.tags.value = card.tags?.join(", ") ?? "";
    cardDeleteBtn.style.display = "inline-flex";
  } else {
    cardForm.reset();
    cardForm.elements.boardId.value = resolvedBoardId;
    cardForm.elements.type.value = "note";
    cardForm.elements.url.value = "";
    cardDeleteBtn.style.display = "none";
  }

  updateCardFormFields(cardForm.elements.type.value);

  cardModalEl.classList.add("visible");
  cardModalEl.classList.remove("hidden");
  cardModalEl.setAttribute("aria-hidden", "false");
};

const closeModal = (modal) => {
  modal.classList.add("hidden");
  modal.classList.remove("visible");
  modal.setAttribute("aria-hidden", "true");
};

const openSpaceModal = (spaceId = null) => {
  if (!currentState) return;
  if (spaceId) {
    const space = currentState.spaces.find((item) => item.id === spaceId);
    if (space) {
      spaceForm.elements.spaceId.value = space.id;
      spaceForm.elements.name.value = space.name;
    }
    spaceDeleteBtn.style.display =
      currentState.spaces.length > 1 ? "inline-flex" : "none";
  } else {
    spaceForm.reset();
    spaceForm.elements.spaceId.value = "";
    spaceDeleteBtn.style.display = "none";
  }

  spaceModalEl.classList.add("visible");
  spaceModalEl.classList.remove("hidden");
  spaceModalEl.setAttribute("aria-hidden", "false");
};

const handleStateChange = (state) => {
  const meta = state.meta ? { ...state.meta } : null;
  const metaAction = meta?.action ?? null;
  if (state.meta) delete state.meta;
  currentState = state;
  renderSpaceTabs(state, { spaceTabsEl });
  const isFavoritesView = state.preferences.viewMode === VIEW_MODES.FAVORITES;
  if (isFavoritesView) {
    renderFavoritesBoard(state, { boardEl });
    if (addColumnBtn) {
      addColumnBtn.style.display = "none";
    }
  } else {
    renderBoard(state, {
      boardEl,
      addColumnBtn,
      getActiveSpace,
      attachDropTargets,
      enableColumnDrag,
      onCardDragStart: handleCardDragStart,
      onCardDragEnd: handleCardDragEnd,
      animateCards: metaAction !== "move-card",
      animateColumns: metaAction !== "move-card" && metaAction !== "move-board",
    });
    if (addColumnBtn) {
      addColumnBtn.style.display = "inline-flex";
    }
  }
  if (searchInput !== document.activeElement) {
    searchInput.value = state.preferences.searchTerm ?? "";
  }
  schedulePersist(state);
  if (suppressNextDriveSync) {
    suppressNextDriveSync = false;
    return;
  }
  scheduleDriveSync(state, { trigger: metaAction, meta });
};

const handleDriveUpdate = (snapshot) => {
  const connected = snapshot.status === "connected";
  const label = driveConnectBtn.querySelector("span");
  if (label) {
    label.textContent = connected ? "Drive Synced" : "Google Drive Sync";
  }
  if (connected) {
    startDriveBackgroundSync();
  } else {
    stopDriveBackgroundSync();
    hasPulledDriveState = false;
  }
  if (driveControl) {
    driveControl.classList.toggle("connected", connected);
  }
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

const renderOpenTabs = () => {
  const filtered = openTabs.filter((tab) => {
    if (!tabFilter) return true;
    const haystack = `${tab.title} ${tab.url}`.toLowerCase();
    return haystack.includes(tabFilter.toLowerCase());
  });

  tabCountEl.textContent = filtered.length;

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

const fetchOpenTabs = async () => {
  openTabs = await safeTabsQuery({ currentWindow: true });
  renderOpenTabs();
};

const registerTabObservers = () => {
  if (!chrome?.tabs) return;
  let tabUpdateTimer = null;
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

const bootstrap = async () => {
  subscribe(handleStateChange);
  subscribeDrive(handleDriveUpdate);
  const storedState = await loadStateFromStorage();
  initState(storedState ?? createDefaultState());
  await initDrive();
  fetchOpenTabs();
  registerTabObservers();
};

spaceTabsEl.addEventListener("click", (event) => {
  const tab = event.target.closest(".space-tab");
  if (!tab) return;
  if (tab.id === "add-space-tab") {
    openSpaceModal();
    return;
  }

  if (tab.dataset.viewMode === VIEW_MODES.FAVORITES) {
    updateState((draft) => {
      draft.preferences.viewMode = VIEW_MODES.FAVORITES;
    });
    return;
  }

  const spaceId = tab.dataset.spaceId;
  if (spaceId) {
    updateState((draft) => {
      draft.preferences.viewMode = VIEW_MODES.SPACES;
      draft.preferences.activeSpaceId = spaceId;
    });
  }
});

spaceTabsEl.addEventListener("contextmenu", (event) => {
  const tab = event.target.closest(".space-tab");
  if (!tab || !tab.dataset.spaceId) return;
  event.preventDefault();
  openSpaceModal(tab.dataset.spaceId);
});

spaceTabsEl.addEventListener("dragstart", (event) => {
  const tab = event.target.closest(".space-tab");
  if (!tab || !tab.dataset.spaceId) return;
  draggingSpaceId = tab.dataset.spaceId;
  tab.classList.add("dragging");
  event.dataTransfer.effectAllowed = "move";
});

spaceTabsEl.addEventListener("dragover", (event) => {
  if (draggingSpaceId) {
    event.preventDefault();
    const tab = event.target.closest(".space-tab");
    clearSpaceTabDropState();
    if (tab && tab.dataset.spaceId && tab.dataset.spaceId !== draggingSpaceId) {
      tab.classList.add("space-tab-drop");
    }
    return;
  }
  if (draggingCard) {
    const tab = event.target.closest(".space-tab");
    if (!tab?.dataset.spaceId) return;
    event.preventDefault();
    clearSpaceTabDropState();
    tab.classList.add("space-tab-drop");
  }
});

spaceTabsEl.addEventListener("dragleave", () => {
  clearSpaceTabDropState();
});

spaceTabsEl.addEventListener("drop", (event) => {
  if (draggingSpaceId) {
    event.preventDefault();
    const afterElement = getHorizontalAfterElement(
      spaceTabsEl,
      ".space-tab[data-space-id]:not(.dragging)",
      event.clientX,
    );
    const tabs = [
      ...spaceTabsEl.querySelectorAll(
        ".space-tab[data-space-id]:not(.dragging)",
      ),
    ];
    let targetIndex = tabs.length;
    if (afterElement) {
      targetIndex = tabs.findIndex(
        (tab) => tab.dataset.spaceId === afterElement.dataset.spaceId,
      );
    }
    clearSpaceDragging();
    moveSpace(draggingSpaceId, targetIndex);
    draggingSpaceId = null;
    return;
  }
  if (draggingCard) {
    const tab = event.target.closest(".space-tab");
    if (!tab?.dataset.spaceId) return;
    event.preventDefault();
    clearSpaceTabDropState();
    moveCardToSpace(tab.dataset.spaceId);
  }
});

spaceTabsEl.addEventListener("dragend", () => {
  draggingSpaceId = null;
  clearSpaceDragging();
});

boardEl.addEventListener("click", async (event) => {
  if (suppressCardClick) {
    suppressCardClick = false;
    return;
  }
  const cardActionEl = event.target.closest("[data-card-action]");
  if (cardActionEl) {
    const card = cardActionEl.closest(".card");
    if (card) {
      const boardId = card.dataset.boardId;
      const cardId = card.dataset.cardId;
      const action = cardActionEl.dataset.cardAction;
      const spaceId = card.dataset.spaceId || null;
      handleCardAction(action, boardId, cardId, spaceId);
    }
    return;
  }

  const clickedCard = event.target.closest(".card");
  if (clickedCard && !event.target.closest("[data-card-action]")) {
    handleCardPrimaryClick(clickedCard);
    return;
  }

  const openGroupBtn = event.target.closest("[data-board-open]");
  if (openGroupBtn) {
    await openBoardLinks(openGroupBtn.dataset.boardOpen);
    return;
  }

  const addCardBtnEl = event.target.closest(".add-card");
  if (addCardBtnEl) {
    openCardModal({ boardId: addCardBtnEl.dataset.boardId });
    return;
  }

  const deleteColumnEl = event.target.closest("[data-column-delete]");
  if (deleteColumnEl) {
    const boardId = deleteColumnEl.dataset.columnDelete;
    const confirmed = await openConfirm(
      "Delete this board? Cards inside will also be removed.",
    );
    if (!confirmed) {
      return;
    }
    updateState((draft) => {
      const active = getActiveSpace(draft);
      if (!active) return;
      active.boards = active.boards.filter((board) => board.id !== boardId);
    });
    showSnackbar("Board deleted.");
    return;
  }
});

boardEl.addEventListener("focusout", (event) => {
  if (event.target.classList?.contains("column-title")) {
    const boardId = event.target.dataset.boardId;
    const newName = event.target.textContent.trim() || DEFAULT_BOARD_NAME;
    event.target.textContent = newName;
    updateState((draft) => {
      const active = getActiveSpace(draft);
      if (!active) return;
      const board = findBoard(active, boardId);
      if (board) board.name = newName;
    });
  }
});

boardEl.addEventListener("keydown", (event) => {
  if (
    event.target.classList?.contains("column-title") &&
    event.key === "Enter"
  ) {
    event.preventDefault();
    event.target.blur();
  }
});

boardEl.addEventListener("dragover", (event) => {
  if (!draggingBoardId) return;
  event.preventDefault();
  const afterElement = getHorizontalAfterElement(
    boardEl,
    ".column:not(.dragging)",
    event.clientX,
  );
  clearColumnDropTargets();
  if (afterElement) {
    afterElement.classList.add("column-drop-target");
  }
});

boardEl.addEventListener("drop", (event) => {
  if (!draggingBoardId) return;
  event.preventDefault();
  const afterElement = getHorizontalAfterElement(
    boardEl,
    ".column:not(.dragging)",
    event.clientX,
  );
  const columns = [...boardEl.querySelectorAll(".column:not(.dragging)")];
  let targetIndex = columns.length;
  if (afterElement) {
    targetIndex = columns.findIndex(
      (column) => column.dataset.boardId === afterElement.dataset.boardId,
    );
  }
  clearColumnDropTargets();
  const draggingColumn = boardEl.querySelector(".column.dragging");
  draggingColumn?.classList.remove("dragging");
  moveBoard(draggingBoardId, targetIndex);
  draggingBoardId = null;
});

const handleCardAction = (action, boardId, cardId, spaceId = null) => {
  const indices = findCardIndices(currentState, {
    spaceId,
    boardId,
    cardId,
  });
  if (!indices) return;

  const { card } = findCardContext(currentState, {
    spaceId,
    boardId,
    cardId,
  });
  if (!card) return;

  switch (action) {
    case "favorite":
      updateState((draft) => {
        const target =
          draft.spaces[indices.spaceIdx]?.boards[indices.boardIdx]?.cards[
            indices.cardIdx
          ];
        if (target) {
          target.favorite = !target.favorite;
        }
      });
      break;
    case "toggle-done":
      updateState((draft) => {
        const target =
          draft.spaces[indices.spaceIdx]?.boards[indices.boardIdx]?.cards[
            indices.cardIdx
          ];
        if (target) {
          target.done = !target.done;
        }
      });
      break;
    case "edit":
      openCardModal({ boardId, cardId, spaceId });
      break;
    case "delete":
      updateState((draft) => {
        const board = draft.spaces[indices.spaceIdx]?.boards[indices.boardIdx];
        if (!board) return;
        board.cards = board.cards.filter((item) => item.id !== cardId);
      });
      showSnackbar("Card deleted.");
      break;
    default:
      break;
  }
};

const handleCardPrimaryClick = (cardElement) => {
  const boardId = cardElement.dataset.boardId;
  const cardId = cardElement.dataset.cardId;
  const spaceId = cardElement.dataset.spaceId || null;
  const { card } = findCardContext(currentState, {
    spaceId,
    boardId,
    cardId,
  });
  if (!card) return;
  if (card.type === "link" && card.url) {
    window.open(card.url, "_blank");
  }
};

const addTabCardToBoard = (boardId, tabPayload) => {
  if (!boardId || !tabPayload?.url) return;
  const activeSpaceId = getActiveSpace()?.id ?? null;
  const newCardId = generateId("card");
  updateState(
    (draft) => {
      const active = getActiveSpace(draft);
      const board = findBoard(active, boardId);
      if (!board) return;
      const favicon = resolveCardFavicon(
        { type: "link", url: tabPayload.url, favicon: tabPayload.favIcon },
        null,
      );
      board.cards.unshift({
        id: newCardId,
        type: "link",
        title: tabPayload.title?.trim() || tabPayload.url,
        note: "",
        url: tabPayload.url,
        tags: [],
        favorite: false,
        done: false,
        favicon,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    },
    {
      action: "add-card",
      addedCards: [{ id: newCardId, spaceId: activeSpaceId, boardId: boardId }],
    },
  );
  showSnackbar("Tab saved as a card.");
};

const getCurrentWindowId = () =>
  new Promise((resolve) => {
    if (!chrome?.windows?.getCurrent) {
      resolve(undefined);
      return;
    }
    chrome.windows.getCurrent((win) => {
      if (chrome.runtime?.lastError || !win) {
        resolve(undefined);
      } else {
        resolve(win.id);
      }
    });
  });

const chromeTabsCreate = (options) =>
  new Promise((resolve, reject) => {
    if (!chrome?.tabs?.create) {
      reject(new Error("tabs.create unavailable"));
      return;
    }
    chrome.tabs.create(options, (tab) => {
      const error = chrome.runtime?.lastError;
      if (error) {
        reject(error);
      } else {
        resolve(tab);
      }
    });
  });

const chromeTabsGroup = (tabIds) =>
  new Promise((resolve, reject) => {
    if (!chrome?.tabs?.group) {
      reject(new Error("tabs.group unavailable"));
      return;
    }
    chrome.tabs.group({ tabIds }, (groupId) => {
      const error = chrome.runtime?.lastError;
      if (error) {
        reject(error);
      } else {
        resolve(groupId);
      }
    });
  });

const chromeTabGroupsUpdate = (groupId, options) =>
  new Promise((resolve, reject) => {
    if (!chrome?.tabGroups?.update) {
      resolve();
      return;
    }
    chrome.tabGroups.update(groupId, options, (group) => {
      const error = chrome.runtime?.lastError;
      if (error) {
        reject(error);
      } else {
        resolve(group);
      }
    });
  });

const openBoardLinks = async (boardId) => {
  const active = getActiveSpace();
  if (!active) return;
  const board = findBoard(active, boardId);
  if (!board) return;
  const links = board.cards.filter((card) => card.url);
  if (!links.length) {
    showSnackbar("No link cards to open.");
    return;
  }
  if (
    !chrome?.tabs?.create ||
    !chrome?.tabs?.group ||
    !chrome?.tabGroups?.update ||
    !chrome?.windows?.getCurrent
  ) {
    links.forEach((card) => window.open(card.url, "_blank"));
    showSnackbar(
      "Your browser doesn't support tab groups; opened in new tabs.",
    );
    return;
  }

  try {
    const windowId = (await getCurrentWindowId()) ?? undefined;
    const tabIds = [];
    for (const card of links) {
      const tab = await chromeTabsCreate({
        windowId,
        url: card.url,
        active: false,
      });
      if (tab?.id !== undefined) {
        tabIds.push(tab.id);
      }
    }
    if (!tabIds.length) {
      showSnackbar("Could not open new tabs.");
      return;
    }
    const groupId = await chromeTabsGroup(tabIds);
    await chromeTabGroupsUpdate(groupId, { title: board.name });
    chrome.tabs.update(tabIds[0], { active: true });
    showSnackbar(
      `Opened ${links.length} link ${links.length === 1 ? "card" : "cards"} as a group in this window.`,
    );
  } catch (error) {
    console.error("Failed to open board links as group", error);
    links.forEach((card) => window.open(card.url, "_blank"));
    showSnackbar("Failed to create a tab group; opened in new tabs instead.");
  }
};

addColumnBtn?.addEventListener("click", () => {
  if (currentState?.preferences.viewMode === VIEW_MODES.FAVORITES) {
    showSnackbar("You can't add boards while in Favorites view.");
    return;
  }
  updateState((draft) => {
    const active = getActiveSpace(draft);
    if (!active) return;
    active.boards.push({
      id: generateId("board"),
      name: "New board",
      cards: [],
    });
  });
  showSnackbar("Board added.");
});

boardEl.addEventListener("contextmenu", (event) => {
  const card = event.target.closest(".card");
  if (!card) return;
  event.preventDefault();
  const boardId = card.dataset.boardId;
  const cardId = card.dataset.cardId;
  const spaceId = card.dataset.spaceId || null;
  openCardModal({ boardId, cardId, spaceId });
});

cardForm.elements.type.addEventListener("change", (event) => {
  updateCardFormFields(event.target.value);
});

cardForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const formData = new FormData(cardForm);
  const cardId = formData.get("cardId");
  const boardId = formData.get("boardId");
  const existingContext = findCardContext(currentState, { boardId, cardId });
  const cardType = formData.get("type") ?? "note";
  const resolvedBoardId =
    boardId ||
    existingContext.board?.id ||
    getActiveSpace()?.boards?.[0]?.id ||
    "";
  const targetSpaceId =
    existingContext.space?.id ?? getActiveSpace()?.id ?? null;

  const payload = {
    title: formData.get("title")?.toString().trim(),
    type: cardType,
    note:
      cardType === "link"
        ? ""
        : (formData.get("note")?.toString().trim() ?? ""),
    url:
      cardType === "link" ? (formData.get("url")?.toString().trim() ?? "") : "",
    tags:
      formData
        .get("tags")
        ?.toString()
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean) ?? [],
  };
  const favicon = resolveCardFavicon(payload, existingContext?.card);

  if (!payload.title || !resolvedBoardId) {
    showSnackbar("Please double-check the card information.");
    return;
  }

  if (payload.type === "link" && !payload.url) {
    showSnackbar("Please enter a link.");
    return;
  }

  if (cardId) {
    updateState((draft) => {
      const { card } = findCardContext(draft, {
        spaceId: targetSpaceId,
        boardId: resolvedBoardId,
        cardId,
      });
      if (card) {
        Object.assign(card, payload, { favicon });
        card.updatedAt = new Date().toISOString();
      }
    });
    showSnackbar("Card updated.");
  } else {
    const newCardId = generateId("card");
    updateState(
      (draft) => {
        const { board } = findCardContext(draft, {
          spaceId: targetSpaceId,
          boardId: resolvedBoardId,
        });
        if (board) {
          board.cards.unshift({
            id: newCardId,
            favorite: false,
            done: false,
            favicon,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            ...payload,
          });
        }
      },
      {
        action: "add-card",
        addedCards: [
          {
            id: newCardId,
            spaceId: targetSpaceId,
            boardId: resolvedBoardId,
          },
        ],
      },
    );
    showSnackbar("Card added.");
  }

  closeModal(cardModalEl);
});

cardDeleteBtn.addEventListener("click", () => {
  const cardId = cardForm.elements.cardId.value;
  const boardId = cardForm.elements.boardId.value;
  if (!cardId || !boardId) return;
  const targetSpaceId =
    findCardContext(currentState, { boardId, cardId }).space?.id ?? null;
  updateState((draft) => {
    const { board } = findCardContext(draft, {
      spaceId: targetSpaceId,
      boardId,
      cardId,
    });
    if (board) {
      board.cards = board.cards.filter((card) => card.id !== cardId);
    }
  });
  closeModal(cardModalEl);
  showSnackbar("Card deleted.");
});

cardModalEl.addEventListener("click", (event) => {
  if (event.target.dataset.close === "card") {
    closeModal(cardModalEl);
  }
});

spaceForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const formData = new FormData(spaceForm);
  const spaceId = formData.get("spaceId");
  const name = formData.get("name")?.toString().trim();
  if (!name) return;

  if (spaceId) {
    updateState((draft) => {
      const space = draft.spaces.find((item) => item.id === spaceId);
      if (space) space.name = name;
    });
    showSnackbar("Space updated.");
  } else {
    const newSpaceId = generateId("space");
    updateState((draft) => {
      draft.spaces.push({
        id: newSpaceId,
        name,
        accent: getRandomAccent(),
        boards: [],
      });
      draft.preferences.activeSpaceId = newSpaceId;
    });
    showSnackbar("Space created.");
  }

  closeModal(spaceModalEl);
});

spaceDeleteBtn.addEventListener("click", () => {
  const spaceId = spaceForm.elements.spaceId.value;
  if (!spaceId || !currentState) return;
  if (currentState.spaces.length <= 1) {
    showSnackbar("At least one space is required.");
    return;
  }
  updateState((draft) => {
    draft.spaces = draft.spaces.filter((space) => space.id !== spaceId);
    if (draft.preferences.activeSpaceId === spaceId) {
      draft.preferences.activeSpaceId = draft.spaces[0]?.id ?? null;
    }
  });
  closeModal(spaceModalEl);
  showSnackbar("Space deleted.");
});

spaceModalEl.addEventListener("click", (event) => {
  if (event.target.dataset.close === "space") {
    closeModal(spaceModalEl);
  }
});

confirmModalEl.addEventListener("click", (event) => {
  if (event.target.dataset.close === "confirm") {
    if (confirmResolver) {
      confirmResolver(false);
    }
    closeConfirm();
  }
});

confirmAcceptBtn.addEventListener("click", () => {
  if (confirmResolver) {
    confirmResolver(true);
  }
  closeConfirm();
});

confirmCancelBtn.addEventListener("click", () => {
  if (confirmResolver) {
    confirmResolver(false);
  }
  closeConfirm();
});

const focusSearchInput = () => {
  searchInput.focus();
  searchInput.select();
};

searchControl?.addEventListener("mouseenter", () => {
  focusSearchInput();
});

searchFocusBtn.addEventListener("click", () => {
  focusSearchInput();
});

window.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    focusSearchInput();
  }
  if (event.key === "Escape") {
    if (cardModalEl.classList.contains("visible")) closeModal(cardModalEl);
    if (spaceModalEl.classList.contains("visible")) closeModal(spaceModalEl);
    if (confirmModalEl.classList.contains("visible")) {
      if (confirmResolver) {
        confirmResolver(false);
      }
      closeConfirm();
    }
  }
});

driveConnectBtn.addEventListener("click", async () => {
  const snapshot = getDriveSnapshot();
  if (snapshot.status === "connected") {
    return;
  }
  try {
    await connectDrive();
    if (!hasPulledDriveState) {
      try {
        await runDriveSync({ reason: "connect" });
        hasPulledDriveState = true;
      } catch (error) {
        console.error("Failed to pull Drive data", error);
        showSnackbar("Failed to load Drive data: " + error.message);
      }
    }
    showSnackbar("Connected to Google Drive.");
    scheduleDriveSync(getState(), { immediate: true });
  } catch (error) {
    showSnackbar("Failed to connect to Drive: " + error.message);
  }
});

driveMenuSyncBtn?.addEventListener("click", async (event) => {
  event.preventDefault();
  event.stopPropagation();
  if (getDriveSnapshot().status !== "connected") return;
  showSnackbar("Manually syncing with Google Drive...");
  try {
    await runDriveSync({ reason: "manual" });
    showSnackbar("Manual sync with Drive completed.");
  } catch (error) {
    showSnackbar("Drive sync failed: " + error.message);
  }
});

driveMenuDisconnectBtn?.addEventListener("click", async (event) => {
  event.stopPropagation();
  await disconnectDrive();
  stopDriveBackgroundSync();
  hasPulledDriveState = false;
  showSnackbar("Disconnected from Google Drive.");
});

tabFilterInput.addEventListener("input", (event) => {
  tabFilter = event.target.value.trim();
  renderOpenTabs();
});

searchInput.addEventListener("input", (event) => {
  const value = event.target.value;
  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(() => {
    updateState((draft) => {
      draft.preferences.searchTerm = value;
    });
  }, SEARCH_DEBOUNCE_MS);
});

tabListEl.addEventListener("dragstart", (event) => {
  const tabItem = event.target.closest(".tab-item");
  if (!tabItem || !tabItem.dataset.tabUrl) return;
  const payload = {
    title: tabItem.dataset.tabTitle,
    url: tabItem.dataset.tabUrl,
    favIcon: tabItem.dataset.tabIcon,
  };
  event.dataTransfer.setData(TAB_DRAG_MIME, JSON.stringify(payload));
  event.dataTransfer.setData("text/plain", tabItem.dataset.tabUrl);
  event.dataTransfer.effectAllowed = "copy";
});

tabListEl.addEventListener("click", (event) => {
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

bootstrap();
