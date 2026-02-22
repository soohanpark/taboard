import { TAB_DRAG_MIME } from "./constants.js";
import { getState, updateState as dispatch } from "./state.js";

let draggingCard = null;
let draggingBoardId = null;
let draggingSpaceId = null;
let suppressCardClick = false;

const getActiveSpace = (state = getState()) => {
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

export const getDraggingCard = () => draggingCard;
export const getDraggingBoardId = () => draggingBoardId;
export const getDraggingSpaceId = () => draggingSpaceId;
export const isSuppressCardClick = () => suppressCardClick;

export const setSuppressCardClick = (value) => {
  suppressCardClick = Boolean(value);
};

export const setDraggingCard = (value) => {
  draggingCard = value;
};

export const setDraggingBoardId = (value) => {
  draggingBoardId = value;
};

export const setDraggingSpaceId = (value) => {
  draggingSpaceId = value;
};

export const getDragAfterElement = (container, y) => {
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

export const getHorizontalAfterElement = (container, selector, x) => {
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

export const moveCard = (
  cardId,
  fromBoardId,
  toBoardId,
  targetIndex,
  fromSpaceId = null,
  toSpaceId = null,
) => {
  dispatch(
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

export const moveCardToSpace = (targetSpaceId, options = {}) => {
  const { currentState = getState(), showSnackbar = () => {} } = options;
  const activeDragCard = getDraggingCard();
  if (!activeDragCard) return;
  const targetSpace = findSpaceById(currentState, targetSpaceId);
  if (!targetSpace) return;
  if (activeDragCard.spaceId === targetSpaceId) {
    showSnackbar("Card is already in this workspace.");
    return;
  }
  if (!targetSpace.boards?.length) {
    showSnackbar("Add a board to that space before moving cards.");
    return;
  }
  const targetBoardId = targetSpace.boards[0].id;
  moveCard(
    activeDragCard.cardId,
    activeDragCard.boardId,
    targetBoardId,
    0,
    activeDragCard.spaceId,
    targetSpaceId,
  );
  setSuppressCardClick(true);
  setTimeout(() => {
    setSuppressCardClick(false);
  }, 0);
  showSnackbar(`Moved card to ${targetSpace.name}.`);
};

export const moveBoard = (boardId, targetIndex, spaceId = null) => {
  dispatch(
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

export const moveSpace = (spaceId, targetIndex) => {
  dispatch(
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

export const attachDropTargets = (cardListEl, options = {}) => {
  const { addTabCardToBoard = null } = options;

  cardListEl.addEventListener("dragover", (event) => {
    const isTabDrag = Array.from(event.dataTransfer?.types ?? []).includes(
      TAB_DRAG_MIME,
    );
    const isCardDrag = Boolean(getDraggingCard());
    if (!isTabDrag && !isCardDrag) return;
    event.preventDefault();
    cardListEl.classList.add("drag-over");
    event.dataTransfer.dropEffect = getDraggingCard() ? "move" : "copy";
  });

  cardListEl.addEventListener("dragleave", () => {
    cardListEl.classList.remove("drag-over");
  });

  cardListEl.addEventListener("drop", (event) => {
    const isTabDrag = Array.from(event.dataTransfer?.types ?? []).includes(
      TAB_DRAG_MIME,
    );
    const isCardDrag = Boolean(getDraggingCard());
    if (!isTabDrag && !isCardDrag) return;
    event.preventDefault();
    cardListEl.classList.remove("drag-over");
    const tabPayload = event.dataTransfer.getData(TAB_DRAG_MIME);
    if (tabPayload && typeof addTabCardToBoard === "function") {
      try {
        const parsed = JSON.parse(tabPayload);
        addTabCardToBoard(cardListEl.dataset.boardId, parsed);
      } catch (error) {
        console.warn("Could not parse drop data.", error);
      }
      return;
    }
    const activeDragCard = getDraggingCard();
    if (!activeDragCard) return;
    const afterElement = getDragAfterElement(cardListEl, event.clientY);
    const cards = [...cardListEl.querySelectorAll(".card:not(.dragging)")];
    let targetIndex = cards.length;
    if (afterElement) {
      targetIndex = cards.findIndex(
        (el) => el.dataset.cardId === afterElement.dataset.cardId,
      );
    }
    moveCard(
      activeDragCard.cardId,
      activeDragCard.boardId,
      cardListEl.dataset.boardId,
      targetIndex,
      activeDragCard.spaceId,
      cardListEl.dataset.spaceId || null,
    );
    setSuppressCardClick(true);
    setTimeout(() => {
      setSuppressCardClick(false);
    }, 0);
  });
};

export const clearSpaceTabDropState = (spaceTabsEl) => {
  const targets = spaceTabsEl.querySelectorAll(".space-tab-drop");
  targets.forEach((tab) => tab.classList.remove("space-tab-drop"));
};

export const clearSpaceDragging = (spaceTabsEl) => {
  spaceTabsEl
    .querySelectorAll(".space-tab-drop, .space-tab.dragging")
    .forEach((el) => {
      el.classList.remove("space-tab-drop", "dragging");
    });
};

export const clearColumnDropTargets = (boardEl) => {
  const targets = boardEl.querySelectorAll(".column-drop-target");
  targets.forEach((column) => column.classList.remove("column-drop-target"));
};

export const enableColumnDrag = (column, options = {}) => {
  const { clearColumnDropTargets: clearDropTargets = null } = options;
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
    setDraggingBoardId(column.dataset.boardId);
    column.classList.add("dragging");
    event.dataTransfer.effectAllowed = "move";
  });
  header.addEventListener("dragend", () => {
    setDraggingBoardId(null);
    column.classList.remove("dragging");
    clearDropTargets?.();
  });
};
