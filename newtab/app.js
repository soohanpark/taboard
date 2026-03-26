import {
  createDefaultState,
  generateId,
  initState,
  getRandomAccent,
  subscribe,
  updateState,
} from "./state.js";
import { loadStateFromStorage } from "./storage.js";
import { initDrive, subscribeDrive } from "./drive.js";
import {
  SEARCH_DEBOUNCE_MS,
  VIEW_MODES,
  DEFAULT_BOARD_NAME,
  TAB_DRAG_MIME,
} from "./constants.js";
import {
  renderSpaceTabs,
  renderBoard,
  renderBoardSidebar,
  renderFavoritesBoard,
  resolveCardFavicon,
  invalidateSearchCache,
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
  cleanupTabs,
} from "./tabs.js";
import {
  getHorizontalAfterElement,
  getVerticalAfterElement,
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
  warmDragCache,
  clearDragCache,
  cleanupDrag,
} from "./drag.js";
import {
  schedulePersist,
  scheduleDriveSync,
  handleDriveUpdate,
  initDriveUI,
  cleanupDriveUI,
} from "./drive-ui.js";
const boardEl = document.getElementById("board");
const spaceTabsEl = document.getElementById("space-tabs");
const addColumnBtn = document.getElementById("add-column");
const boardSidebarListEl = document.getElementById("board-sidebar-list");
const boardSidebarEl = document.getElementById("board-sidebar");
const sidebarToggleBtn = document.getElementById("sidebar-toggle");
const sidebarExpandBtn = document.getElementById("sidebar-expand");
const searchControl = document.getElementById("search-control");
const searchInput = document.getElementById("search-input");
const searchFocusBtn = document.getElementById("search-focus");
let currentState = null;
let searchDebounceTimer = null;
let prevSearchTerm = null;
const getActiveSpace = (state = currentState) =>
  state?.spaces?.find((s) => s.id === state.preferences?.activeSpaceId) ??
  state?.spaces?.[0] ??
  null;
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
  if (!board && space && cardId)
    board = space.boards?.find((item) =>
      item.cards?.some((card) => card.id === cardId),
    );
  return {
    space,
    board,
    card: board?.cards?.find((item) => item.id === cardId) ?? null,
  };
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
      for (let ci = 0; ci < (board.cards?.length ?? 0); ci++)
        if (board.cards[ci].id === cardId)
          return { spaceIdx: si, boardIdx: bi, cardIdx: ci };
    }
  }
  return null;
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
  document.body.classList.add("drag-in-progress");
  const container = cardEl.closest(".card-list");
  if (container) warmDragCache(container);
};
const handleCardDragEnd = ({ cardEl }) => {
  setDraggingCard(null);
  cardEl.classList.remove("dragging");
  document.body.classList.remove("drag-in-progress");
  clearDragCache();
};
const ensureActiveBoardId = (state) => {
  const space = getActiveSpace(state);
  if (!space?.boards?.length) return;
  const activeBoardId = state.preferences.activeBoardId;
  if (activeBoardId && space.boards.some((b) => b.id === activeBoardId)) return;
  updateState((draft) => {
    draft.preferences.activeBoardId = space.boards[0]?.id ?? null;
  });
};
const handleStateChange = (state) => {
  const meta = state.meta ? { ...state.meta } : null;
  const metaAction = meta?.action ?? null;
  currentState = state;
  const currentSearchTerm = state.preferences.searchTerm ?? "";
  if (
    metaAction === "add-card" ||
    metaAction === "edit-card" ||
    metaAction === "delete-card" ||
    currentSearchTerm !== prevSearchTerm
  ) {
    invalidateSearchCache();
  }
  prevSearchTerm = currentSearchTerm;
  renderSpaceTabs(state, { spaceTabsEl });
  if (state.preferences.viewMode === VIEW_MODES.FAVORITES) {
    renderFavoritesBoard(state, { boardEl });
    renderBoardSidebar(state, {
      sidebarListEl: boardSidebarListEl,
      sidebarEl: boardSidebarEl,
      getActiveSpace,
    });
  } else {
    ensureActiveBoardId(state);
    renderBoardSidebar(state, {
      sidebarListEl: boardSidebarListEl,
      sidebarEl: boardSidebarEl,
      getActiveSpace,
    });
    renderBoard(state, {
      boardEl,
      addColumnBtn,
      getActiveSpace,
      metaAction,
      attachDropTargets: (cardListEl) =>
        attachDropTargets(cardListEl, { addTabCardToBoard }),
      enableColumnDrag: (column) =>
        enableColumnDrag(column, {
          clearColumnDropTargets: () => clearColumnDropTargets(boardEl),
        }),
      onCardDragStart: handleCardDragStart,
      onCardDragEnd: handleCardDragEnd,
      animateCards: metaAction !== "move-card",
      animateColumns: metaAction !== "move-card" && metaAction !== "move-board",
    });
  }
  if (searchInput !== document.activeElement)
    searchInput.value = state.preferences.searchTerm ?? "";
  schedulePersist(state);
  scheduleDriveSync(state, { trigger: metaAction, meta });
};
const addTabCardToBoard = (boardId, tabPayload) => {
  if (!boardId || !tabPayload?.url) return;
  const activeSpaceId = getActiveSpace()?.id ?? null;
  const newCardId = generateId("card");
  updateState(
    (draft) => {
      const board = findBoard(getActiveSpace(draft), boardId);
      if (!board) return;
      board.cards.unshift({
        id: newCardId,
        type: "link",
        title: tabPayload.title?.trim() || tabPayload.url,
        note: "",
        url: tabPayload.url,
        tags: [],
        favorite: false,
        done: false,
        favicon: resolveCardFavicon(
          { type: "link", url: tabPayload.url, favicon: tabPayload.favIcon },
          null,
        ),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    },
    {
      action: "add-card",
      addedCards: [{ id: newCardId, spaceId: activeSpaceId, boardId }],
    },
  );
  showSnackbar("Tab saved as a card.");
};
const editCard = ({ cardId, boardId, spaceId, payload, favicon }) =>
  updateState((draft) => {
    const { card } = findCardContext(draft, { spaceId, boardId, cardId });
    if (!card) return;
    Object.assign(card, payload, { favicon });
    card.updatedAt = new Date().toISOString();
  });
const addCard = ({ boardId, spaceId, payload, favicon }) => {
  const cardId = generateId("card");
  updateState(
    (draft) => {
      const { board } = findCardContext(draft, { spaceId, boardId });
      if (board)
        board.cards.unshift({
          id: cardId,
          favorite: false,
          done: false,
          favicon,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          ...payload,
        });
    },
    { action: "add-card", addedCards: [{ id: cardId, spaceId, boardId }] },
  );
};
const deleteCard = ({ cardId, boardId, spaceId }) =>
  updateState((draft) => {
    const { board } = findCardContext(draft, { spaceId, boardId, cardId });
    if (board) board.cards = board.cards.filter((card) => card.id !== cardId);
  });
const editSpace = ({ spaceId, name }) =>
  updateState((draft) => {
    const space = draft.spaces.find((item) => item.id === spaceId);
    if (space) space.name = name;
  });
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
const deleteSpace = ({ spaceId }) =>
  updateState((draft) => {
    draft.spaces = draft.spaces.filter((space) => space.id !== spaceId);
    if (draft.preferences.activeSpaceId === spaceId)
      draft.preferences.activeSpaceId = draft.spaces[0]?.id ?? null;
  });
const handleCardAction = (action, boardId, cardId, spaceId = null) => {
  const indices = findCardIndices(currentState, { spaceId, boardId, cardId });
  if (!indices) return;
  const { card } = findCardContext(currentState, { spaceId, boardId, cardId });
  if (!card) return;
  if (action === "favorite")
    return updateState((draft) => {
      const target =
        draft.spaces[indices.spaceIdx]?.boards[indices.boardIdx]?.cards[
          indices.cardIdx
        ];
      if (target) target.favorite = !target.favorite;
    });
  if (action === "toggle-done")
    return updateState((draft) => {
      const target =
        draft.spaces[indices.spaceIdx]?.boards[indices.boardIdx]?.cards[
          indices.cardIdx
        ];
      if (target) target.done = !target.done;
    });
  if (action === "edit") return openCardModal({ boardId, cardId, spaceId });
  if (action !== "delete") return;
  updateState((draft) => {
    const board = draft.spaces[indices.spaceIdx]?.boards[indices.boardIdx];
    if (board) board.cards = board.cards.filter((item) => item.id !== cardId);
  });
  showSnackbar("Card deleted.");
};
const handleCardPrimaryClick = (cardElement) => {
  const boardId = cardElement.dataset.boardId;
  const cardId = cardElement.dataset.cardId;
  const spaceId = cardElement.dataset.spaceId || null;
  const { card } = findCardContext(currentState, { spaceId, boardId, cardId });
  if (card?.type === "link" && card.url) window.open(card.url, "_blank");
};
const getCurrentWindowId = () =>
  new Promise((resolve) => {
    if (!chrome?.windows?.getCurrent) return resolve(undefined);
    chrome.windows.getCurrent((win) =>
      resolve(chrome.runtime?.lastError || !win ? undefined : win.id),
    );
  });
const chromeTabsCreate = (options) =>
  new Promise((resolve, reject) => {
    if (!chrome?.tabs?.create)
      return reject(new Error("tabs.create unavailable"));
    chrome.tabs.create(options, (tab) =>
      chrome.runtime?.lastError
        ? reject(chrome.runtime.lastError)
        : resolve(tab),
    );
  });
const chromeTabsGroup = (tabIds) =>
  new Promise((resolve, reject) => {
    if (!chrome?.tabs?.group)
      return reject(new Error("tabs.group unavailable"));
    chrome.tabs.group({ tabIds }, (groupId) =>
      chrome.runtime?.lastError
        ? reject(chrome.runtime.lastError)
        : resolve(groupId),
    );
  });
const chromeTabGroupsUpdate = (groupId, options) =>
  new Promise((resolve, reject) => {
    if (!chrome?.tabGroups?.update) return resolve();
    chrome.tabGroups.update(groupId, options, (group) =>
      chrome.runtime?.lastError
        ? reject(chrome.runtime.lastError)
        : resolve(group),
    );
  });
const openBoardLinks = async (boardId) => {
  const board = findBoard(getActiveSpace(), boardId);
  const links = board?.cards?.filter((card) => card.url) ?? [];
  if (!links.length) return showSnackbar("No link cards to open.");
  if (
    !chrome?.tabs?.create ||
    !chrome?.tabs?.group ||
    !chrome?.tabGroups?.update ||
    !chrome?.windows?.getCurrent
  ) {
    links.forEach((card) => window.open(card.url, "_blank"));
    return showSnackbar(
      "Your browser doesn't support tab groups; opened in new tabs.",
    );
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
      if (tab?.id !== undefined) tabIds.push(tab.id);
    }
    if (!tabIds.length) return showSnackbar("Could not open new tabs.");
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
const focusSearchInput = () => {
  searchInput.focus();
  searchInput.select();
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
  initDriveUI({ findCardContext });
  subscribe(handleStateChange);
  subscribeDrive(handleDriveUpdate);
  initTabs({ addTabCardToBoard });
  renderOpenTabs();
  initState((await loadStateFromStorage()) ?? createDefaultState());
  await initDrive();
  fetchOpenTabs();
  registerTabObservers();
};
spaceTabsEl.addEventListener("click", (event) => {
  const tab = event.target.closest(".space-tab");
  if (!tab) return;
  if (tab.id === "add-space-tab") return openSpaceModal();
  if (tab.dataset.viewMode === VIEW_MODES.FAVORITES)
    return updateState((draft) => {
      draft.preferences.viewMode = VIEW_MODES.FAVORITES;
    });
  if (tab.dataset.spaceId)
    updateState((draft) => {
      draft.preferences.viewMode = VIEW_MODES.SPACES;
      draft.preferences.activeSpaceId = tab.dataset.spaceId;
      draft.preferences.activeBoardId = null;
    });
});
spaceTabsEl.addEventListener("contextmenu", (event) => {
  const tab = event.target.closest(".space-tab");
  if (!tab?.dataset.spaceId) return;
  event.preventDefault();
  openSpaceModal(tab.dataset.spaceId);
});
spaceTabsEl.addEventListener("dragstart", (event) => {
  const tab = event.target.closest(".space-tab");
  if (!tab?.dataset.spaceId) return;
  setDraggingSpaceId(tab.dataset.spaceId);
  tab.classList.add("dragging");
  event.dataTransfer.effectAllowed = "move";
});
spaceTabsEl.addEventListener("dragover", (event) => {
  if (getDraggingSpaceId()) {
    event.preventDefault();
    const tab = event.target.closest(".space-tab");
    clearSpaceTabDropState(spaceTabsEl);
    if (tab?.dataset.spaceId && tab.dataset.spaceId !== getDraggingSpaceId())
      tab.classList.add("space-tab-drop");
    return;
  }
  if (!getDraggingCard()) return;
  const tab = event.target.closest(".space-tab");
  if (!tab?.dataset.spaceId) return;
  event.preventDefault();
  clearSpaceTabDropState(spaceTabsEl);
  tab.classList.add("space-tab-drop");
});
spaceTabsEl.addEventListener("dragleave", () =>
  clearSpaceTabDropState(spaceTabsEl),
);
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
    moveSpace(
      getDraggingSpaceId(),
      afterElement
        ? tabs.findIndex(
            (tab) => tab.dataset.spaceId === afterElement.dataset.spaceId,
          )
        : tabs.length,
    );
    clearSpaceDragging(spaceTabsEl);
    setDraggingSpaceId(null);
    return;
  }
  if (!getDraggingCard()) return;
  const tab = event.target.closest(".space-tab");
  if (!tab?.dataset.spaceId) return;
  event.preventDefault();
  clearSpaceTabDropState(spaceTabsEl);
  moveCardToSpace(tab.dataset.spaceId, { currentState, showSnackbar });
});
spaceTabsEl.addEventListener("dragend", () => {
  setDraggingSpaceId(null);
  clearSpaceDragging(spaceTabsEl);
});
boardEl.addEventListener("click", async (event) => {
  if (isSuppressCardClick()) return setSuppressCardClick(false);
  const cardActionEl = event.target.closest("[data-card-action]");
  if (cardActionEl) {
    const card = cardActionEl.closest(".card");
    if (card)
      handleCardAction(
        cardActionEl.dataset.cardAction,
        card.dataset.boardId,
        card.dataset.cardId,
        card.dataset.spaceId || null,
      );
    return;
  }
  const clickedCard = event.target.closest(".card");
  if (clickedCard && !event.target.closest("[data-card-action]"))
    return handleCardPrimaryClick(clickedCard);
  const openGroupBtn = event.target.closest("[data-board-open]");
  if (openGroupBtn) return openBoardLinks(openGroupBtn.dataset.boardOpen);
  const addCardBtnEl = event.target.closest(".add-card");
  if (addCardBtnEl)
    return openCardModal({ boardId: addCardBtnEl.dataset.boardId });
  const deleteColumnEl = event.target.closest("[data-column-delete]");
  if (
    !deleteColumnEl ||
    !(await openConfirm(
      "Delete this board? Cards inside will also be removed.",
    ))
  )
    return;
  updateState((draft) => {
    const active = getActiveSpace(draft);
    if (!active) return;
    const deletedId = deleteColumnEl.dataset.columnDelete;
    const idx = active.boards.findIndex((board) => board.id === deletedId);
    active.boards = active.boards.filter((board) => board.id !== deletedId);
    if (draft.preferences.activeBoardId === deletedId) {
      draft.preferences.activeBoardId =
        active.boards[idx]?.id ?? active.boards[idx - 1]?.id ?? null;
    }
  });
  showSnackbar("Board deleted.");
});
boardEl.addEventListener("focusout", (event) => {
  if (!event.target.classList?.contains("column-title")) return;
  const boardId = event.target.dataset.boardId;
  const newName = event.target.textContent.trim() || DEFAULT_BOARD_NAME;
  event.target.textContent = newName;
  updateState((draft) => {
    const board = findBoard(getActiveSpace(draft), boardId);
    if (board) board.name = newName;
  });
});
boardEl.addEventListener("keydown", (event) => {
  if (
    !event.target.classList?.contains("column-title") ||
    event.key !== "Enter"
  )
    return;
  event.preventDefault();
  event.target.blur();
});
let boardDragRafPending = false;
boardEl.addEventListener("dragover", (event) => {
  if (!getDraggingBoardId()) return;
  event.preventDefault();
  if (boardDragRafPending) return;
  boardDragRafPending = true;
  requestAnimationFrame(() => {
    boardDragRafPending = false;
    const afterElement = getHorizontalAfterElement(
      boardEl,
      ".column:not(.dragging)",
      event.clientX,
    );
    clearColumnDropTargets(boardEl);
    if (afterElement) afterElement.classList.add("column-drop-target");
  });
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
  moveBoard(
    getDraggingBoardId(),
    afterElement
      ? columns.findIndex(
          (column) => column.dataset.boardId === afterElement.dataset.boardId,
        )
      : columns.length,
  );
  clearColumnDropTargets(boardEl);
  boardEl.querySelector(".column.dragging")?.classList.remove("dragging");
  setDraggingBoardId(null);
});
boardEl.addEventListener("contextmenu", (event) => {
  const card = event.target.closest(".card");
  if (!card) return;
  event.preventDefault();
  openCardModal({
    boardId: card.dataset.boardId,
    cardId: card.dataset.cardId,
    spaceId: card.dataset.spaceId || null,
  });
});
boardSidebarListEl?.addEventListener("click", (event) => {
  const item = event.target.closest(".board-sidebar-item");
  if (!item?.dataset.boardId) return;
  updateState((draft) => {
    draft.preferences.activeBoardId = item.dataset.boardId;
  });
});
boardSidebarListEl?.addEventListener("contextmenu", (event) => {
  const item = event.target.closest(".board-sidebar-item");
  if (!item?.dataset.boardId) return;
  event.preventDefault();
  // Select the board on right-click as well
  updateState((draft) => {
    draft.preferences.activeBoardId = item.dataset.boardId;
  });
});
let draggingSidebarBoardId = null;
boardSidebarListEl?.addEventListener("dragstart", (event) => {
  const item = event.target.closest(".board-sidebar-item");
  if (!item?.dataset.boardId) return;
  draggingSidebarBoardId = item.dataset.boardId;
  item.classList.add("dragging");
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", item.dataset.boardId);
});
boardSidebarListEl?.addEventListener("dragover", (event) => {
  const isTabDrag = Array.from(event.dataTransfer?.types ?? []).includes(
    TAB_DRAG_MIME,
  );
  if (draggingSidebarBoardId) {
    event.preventDefault();
    const items = boardSidebarListEl.querySelectorAll(
      ".board-sidebar-item:not(.dragging)",
    );
    items.forEach((el) => el.classList.remove("sidebar-drop-target"));
    const afterElement = getVerticalAfterElement(
      boardSidebarListEl,
      ".board-sidebar-item:not(.dragging)",
      event.clientY,
    );
    if (afterElement) afterElement.classList.add("sidebar-drop-target");
    return;
  }
  if (isTabDrag) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    boardSidebarListEl
      .querySelectorAll(".tab-drop-target")
      .forEach((el) => el.classList.remove("tab-drop-target"));
    const item = event.target.closest(".board-sidebar-item");
    if (item) item.classList.add("tab-drop-target");
  }
});
boardSidebarListEl?.addEventListener("dragleave", (event) => {
  if (boardSidebarListEl.contains(event.relatedTarget)) return;
  boardSidebarListEl
    .querySelectorAll(".sidebar-drop-target, .tab-drop-target")
    .forEach((el) =>
      el.classList.remove("sidebar-drop-target", "tab-drop-target"),
    );
});
boardSidebarListEl?.addEventListener("drop", (event) => {
  const isTabDrag = Array.from(event.dataTransfer?.types ?? []).includes(
    TAB_DRAG_MIME,
  );
  if (isTabDrag && !draggingSidebarBoardId) {
    event.preventDefault();
    boardSidebarListEl
      .querySelectorAll(".tab-drop-target")
      .forEach((el) => el.classList.remove("tab-drop-target"));
    const item = event.target.closest(".board-sidebar-item");
    if (!item?.dataset.boardId) return;
    try {
      const parsed = JSON.parse(event.dataTransfer.getData(TAB_DRAG_MIME));
      addTabCardToBoard(item.dataset.boardId, parsed);
    } catch (error) {
      console.warn("Could not parse tab drop data.", error);
    }
    return;
  }
  if (!draggingSidebarBoardId) return;
  event.preventDefault();
  const afterElement = getVerticalAfterElement(
    boardSidebarListEl,
    ".board-sidebar-item:not(.dragging)",
    event.clientY,
  );
  const items = [
    ...boardSidebarListEl.querySelectorAll(
      ".board-sidebar-item:not(.dragging)",
    ),
  ];
  moveBoard(
    draggingSidebarBoardId,
    afterElement
      ? items.findIndex(
          (el) => el.dataset.boardId === afterElement.dataset.boardId,
        )
      : items.length,
  );
  boardSidebarListEl
    .querySelectorAll(".dragging, .sidebar-drop-target")
    .forEach((el) => el.classList.remove("dragging", "sidebar-drop-target"));
  draggingSidebarBoardId = null;
});
boardSidebarListEl?.addEventListener("dragend", () => {
  draggingSidebarBoardId = null;
  boardSidebarListEl
    ?.querySelectorAll(".dragging, .sidebar-drop-target")
    .forEach((el) => el.classList.remove("dragging", "sidebar-drop-target"));
});
const toggleSidebar = () => {
  boardSidebarEl?.classList.toggle("board-sidebar-collapsed");
};
sidebarToggleBtn?.addEventListener("click", toggleSidebar);
sidebarExpandBtn?.addEventListener("click", toggleSidebar);
addColumnBtn?.addEventListener("click", () => {
  if (currentState?.preferences.viewMode === VIEW_MODES.FAVORITES)
    return showSnackbar("You can't add boards while in Favorites view.");
  const newBoardId = generateId("board");
  updateState((draft) => {
    const active = getActiveSpace(draft);
    if (active) {
      active.boards.push({
        id: newBoardId,
        name: "New board",
        cards: [],
      });
      draft.preferences.activeBoardId = newBoardId;
    }
  });
  showSnackbar("Board added.");
});
searchControl?.addEventListener("mouseenter", focusSearchInput);
searchFocusBtn.addEventListener("click", focusSearchInput);
window.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    focusSearchInput();
    return;
  }
  if (currentState?.preferences.viewMode !== VIEW_MODES.SPACES) return;
  const space = getActiveSpace();
  if (!space?.boards?.length) return;
  // Arrow Up/Down to navigate boards
  if (event.key === "ArrowUp" || event.key === "ArrowDown") {
    const isInputFocused =
      document.activeElement?.tagName === "INPUT" ||
      document.activeElement?.tagName === "TEXTAREA" ||
      document.activeElement?.isContentEditable;
    if (isInputFocused) return;
    event.preventDefault();
    const activeBoardId = currentState.preferences.activeBoardId;
    let idx = space.boards.findIndex((b) => b.id === activeBoardId);
    if (idx === -1) idx = 0;
    const nextIdx =
      event.key === "ArrowDown"
        ? Math.min(idx + 1, space.boards.length - 1)
        : Math.max(idx - 1, 0);
    if (nextIdx !== idx) {
      updateState((draft) => {
        draft.preferences.activeBoardId = space.boards[nextIdx].id;
      });
    }
    const nextItem = boardSidebarListEl?.querySelector(
      `[data-board-id="${space.boards[nextIdx].id}"]`,
    );
    nextItem?.focus();
    return;
  }
  // Alt + number (1-9) to quick-switch boards
  if (event.altKey && event.key >= "1" && event.key <= "9") {
    const idx = parseInt(event.key, 10) - 1;
    if (idx < space.boards.length) {
      event.preventDefault();
      updateState((draft) => {
        draft.preferences.activeBoardId = space.boards[idx].id;
      });
    }
  }
});
searchInput.addEventListener("input", (event) => {
  const value = event.target.value;
  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(
    () =>
      updateState((draft) => {
        draft.preferences.searchTerm = value;
      }),
    SEARCH_DEBOUNCE_MS,
  );
});
bootstrap();
window.addEventListener("beforeunload", () => {
  cleanupTabs();
  cleanupDriveUI();
  cleanupDrag();
});
