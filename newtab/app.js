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
  DRIVE_SYNC_INTERVAL,
  NEWTAB_DRIVE_CHECK_INTERVAL,
  VIEW_MODES,
  DEFAULT_BOARD_NAME,
} from "./constants.js";
import {
  renderSpaceTabs,
  renderBoard,
  renderFavoritesBoard,
  resolveCardFavicon,
} from "./render.js";
import {
  showSnackbar,
  hideSnackbar,
  openConfirm,
  openCardModal,
  closeModal,
  openSpaceModal,
  initModals,
} from "./modals.js";
import {
  fetchOpenTabs,
  initTabs,
  renderOpenTabs,
  registerTabObservers,
} from "./tabs.js";
import {
  getHorizontalAfterElement,
  attachDropTargets,
  enableColumnDrag,
  moveCardToSpace,
  moveBoard,
  moveSpace,
  clearSpaceTabDropState,
  clearSpaceDragging,
  clearColumnDropTargets,
  getDraggingCard,
  getDraggingBoardId,
  getDraggingSpaceId,
  isSuppressCardClick,
  setSuppressCardClick,
  setDraggingCard,
  setDraggingBoardId,
  setDraggingSpaceId,
} from "./drag.js";

const boardEl = document.getElementById("board");
const spaceTabsEl = document.getElementById("space-tabs");
const addColumnBtn = document.getElementById("add-column");
const searchControl = document.getElementById("search-control");
const searchInput = document.getElementById("search-input");
const searchFocusBtn = document.getElementById("search-focus");
const driveControl = document.getElementById("drive-control");
const driveConnectBtn = document.getElementById("drive-connect");
const driveMenuSyncBtn = document.getElementById("drive-menu-sync");
const driveMenuDisconnectBtn = document.getElementById("drive-menu-disconnect");

let currentState = null;
let saveTimer = null;
let driveTimer = null;
let searchDebounceTimer = null;
let driveSyncIntervalId = null;

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

const handleCardDragStart = ({
  cardId,
  boardId,
  spaceId,
  cardTitle,
  cardEl,
  event,
}) => {
  setDraggingCard({ cardId, boardId, spaceId });
  cardEl.classList.add("dragging");
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", cardTitle);
};

const handleCardDragEnd = ({ cardEl }) => {
  setDraggingCard(null);
  cardEl.classList.remove("dragging");
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
      attachDropTargets: (cardListEl) => {
        attachDropTargets(cardListEl, { addTabCardToBoard });
      },
      enableColumnDrag: (column) => {
        enableColumnDrag(column, {
          clearColumnDropTargets: () => clearColumnDropTargets(boardEl),
        });
      },
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

const bootstrap = async () => {
  hideSnackbar();
  initModals({
    addCard,
    editCard,
    deleteCard,
    addSpace,
    editSpace,
    deleteSpace,
    closeModal,
    resolveCardFavicon,
  });
  subscribe(handleStateChange);
  subscribeDrive(handleDriveUpdate);
  initTabs({ addTabCardToBoard });
  renderOpenTabs();
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
  setDraggingSpaceId(tab.dataset.spaceId);
  tab.classList.add("dragging");
  event.dataTransfer.effectAllowed = "move";
});

spaceTabsEl.addEventListener("dragover", (event) => {
  if (getDraggingSpaceId()) {
    event.preventDefault();
    const tab = event.target.closest(".space-tab");
    clearSpaceTabDropState(spaceTabsEl);
    if (
      tab &&
      tab.dataset.spaceId &&
      tab.dataset.spaceId !== getDraggingSpaceId()
    ) {
      tab.classList.add("space-tab-drop");
    }
    return;
  }
  if (getDraggingCard()) {
    const tab = event.target.closest(".space-tab");
    if (!tab?.dataset.spaceId) return;
    event.preventDefault();
    clearSpaceTabDropState(spaceTabsEl);
    tab.classList.add("space-tab-drop");
  }
});

spaceTabsEl.addEventListener("dragleave", () => {
  clearSpaceTabDropState(spaceTabsEl);
});

spaceTabsEl.addEventListener("drop", (event) => {
  if (getDraggingSpaceId()) {
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
    clearSpaceDragging(spaceTabsEl);
    moveSpace(getDraggingSpaceId(), targetIndex);
    setDraggingSpaceId(null);
    return;
  }
  if (getDraggingCard()) {
    const tab = event.target.closest(".space-tab");
    if (!tab?.dataset.spaceId) return;
    event.preventDefault();
    clearSpaceTabDropState(spaceTabsEl);
    moveCardToSpace(tab.dataset.spaceId, { currentState, showSnackbar });
  }
});

spaceTabsEl.addEventListener("dragend", () => {
  setDraggingSpaceId(null);
  clearSpaceDragging(spaceTabsEl);
});

boardEl.addEventListener("click", async (event) => {
  if (isSuppressCardClick()) {
    setSuppressCardClick(false);
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
  if (!getDraggingBoardId()) return;
  event.preventDefault();
  const afterElement = getHorizontalAfterElement(
    boardEl,
    ".column:not(.dragging)",
    event.clientX,
  );
  clearColumnDropTargets(boardEl);
  if (afterElement) {
    afterElement.classList.add("column-drop-target");
  }
});

boardEl.addEventListener("drop", (event) => {
  if (!getDraggingBoardId()) return;
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
  clearColumnDropTargets(boardEl);
  const draggingColumn = boardEl.querySelector(".column.dragging");
  draggingColumn?.classList.remove("dragging");
  moveBoard(getDraggingBoardId(), targetIndex);
  setDraggingBoardId(null);
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

const editCard = ({ cardId, boardId, spaceId, payload, favicon }) => {
  updateState((draft) => {
    const { card } = findCardContext(draft, {
      spaceId,
      boardId,
      cardId,
    });
    if (card) {
      Object.assign(card, payload, { favicon });
      card.updatedAt = new Date().toISOString();
    }
  });
};

const addCard = ({ boardId, spaceId, payload, favicon }) => {
  const cardId = generateId("card");
  updateState(
    (draft) => {
      const { board } = findCardContext(draft, {
        spaceId,
        boardId,
      });
      if (board) {
        board.cards.unshift({
          id: cardId,
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
      addedCards: [{ id: cardId, spaceId, boardId }],
    },
  );
};

const deleteCard = ({ cardId, boardId, spaceId }) => {
  updateState((draft) => {
    const { board } = findCardContext(draft, {
      spaceId,
      boardId,
      cardId,
    });
    if (board) {
      board.cards = board.cards.filter((card) => card.id !== cardId);
    }
  });
};

const editSpace = ({ spaceId, name }) => {
  updateState((draft) => {
    const space = draft.spaces.find((item) => item.id === spaceId);
    if (space) space.name = name;
  });
};

const addSpace = ({ name }) => {
  const spaceId = generateId("space");
  updateState((draft) => {
    draft.spaces.push({
      id: spaceId,
      name,
      accent: getRandomAccent(),
      boards: [],
    });
    draft.preferences.activeSpaceId = spaceId;
  });
};

const deleteSpace = ({ spaceId }) => {
  updateState((draft) => {
    draft.spaces = draft.spaces.filter((space) => space.id !== spaceId);
    if (draft.preferences.activeSpaceId === spaceId) {
      draft.preferences.activeSpaceId = draft.spaces[0]?.id ?? null;
    }
  });
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

searchInput.addEventListener("input", (event) => {
  const value = event.target.value;
  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(() => {
    updateState((draft) => {
      draft.preferences.searchTerm = value;
    });
  }, SEARCH_DEBOUNCE_MS);
});

bootstrap();
