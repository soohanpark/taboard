import { getState } from "./state.js";
import { SNACKBAR_DURATION_MS } from "./constants.js";

const cardModalEl = document.getElementById("card-modal");
const cardForm = document.getElementById("card-form");
const cardDeleteBtn = cardForm?.querySelector("[data-delete-card]");
const cardNoteField = cardForm?.querySelector("[data-card-field='note']");
const cardUrlField = cardForm?.querySelector("[data-card-field='url']");
const cardUrlInput = cardForm?.elements?.url;
const spaceModalEl = document.getElementById("space-modal");
const spaceForm = document.getElementById("space-form");
const spaceDeleteBtn = spaceForm?.querySelector("[data-delete-space]");
const snackbarEl = document.getElementById("snackbar");
const confirmModalEl = document.getElementById("confirm-modal");
const confirmMessageEl = document.getElementById("confirm-message");
const confirmAcceptBtn = document.getElementById("confirm-accept");
const confirmCancelBtn = document.getElementById("confirm-cancel");
const shortcutsModalEl = document.getElementById("shortcuts-modal");

let snackbarTimer = null;
let confirmResolver = null;
let initialized = false;
let lastSnackbarUndo = null;
let activeCardMenu = null;

const mutationCallbacks = {
  addCard: () => {},
  editCard: () => {},
  deleteCard: () => {},
  addSpace: () => {},
  editSpace: () => {},
  deleteSpace: () => {},
  resolveCardFavicon: (payload) => payload.favicon ?? "",
};

const getActiveSpace = (state = getState()) => {
  if (!state?.spaces?.length) return null;
  const active = state.spaces.find(
    (space) => space.id === state.preferences?.activeSpaceId,
  );
  return active ?? state.spaces[0];
};

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

export const hideSnackbar = () => {
  clearTimeout(snackbarTimer);
  snackbarEl?.classList.remove("visible");
  snackbarEl?.setAttribute("aria-hidden", "true");
  if (snackbarEl) snackbarEl.replaceChildren();
  lastSnackbarUndo = null;
};

export const showSnackbar = (message, opts = {}) => {
  if (!message) {
    hideSnackbar();
    return;
  }
  const options = typeof opts === "number" ? { duration: opts } : (opts ?? {});
  const duration = options.duration ?? SNACKBAR_DURATION_MS;
  const action = options.action ?? null;

  clearTimeout(snackbarTimer);
  lastSnackbarUndo = null;
  if (snackbarEl) {
    snackbarEl.replaceChildren();
    const text = document.createElement("span");
    text.className = "snackbar-text";
    text.textContent = message;
    snackbarEl.appendChild(text);

    if (action && typeof action.onClick === "function") {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "snackbar-action";
      button.textContent = action.label ?? "Undo";
      const trigger = () => {
        try {
          action.onClick();
        } finally {
          hideSnackbar();
        }
      };
      button.addEventListener("click", trigger);
      snackbarEl.appendChild(button);
      lastSnackbarUndo = trigger;
    }

    snackbarEl.classList.add("visible");
    snackbarEl.setAttribute("aria-hidden", "false");
  }
  snackbarTimer = setTimeout(() => hideSnackbar(), duration);
};

export const triggerSnackbarUndo = () => {
  if (typeof lastSnackbarUndo === "function") {
    lastSnackbarUndo();
    return true;
  }
  return false;
};

export const openConfirm = (message) =>
  new Promise((resolve) => {
    // A second confirm supersedes the first; settle it so no caller hangs.
    confirmResolver?.(false);
    confirmResolver = resolve;
    if (confirmMessageEl) confirmMessageEl.textContent = message;
    confirmModalEl?.classList.remove("hidden");
    confirmModalEl?.classList.add("visible");
    confirmModalEl?.setAttribute("aria-hidden", "false");
  });

const closeConfirm = () => {
  confirmModalEl?.classList.add("hidden");
  confirmModalEl?.classList.remove("visible");
  confirmModalEl?.setAttribute("aria-hidden", "true");
  confirmResolver = null;
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

export const openCardModal = ({
  boardId,
  cardId = null,
  spaceId = null,
  initialType = null,
} = {}) => {
  if (!cardForm || !cardModalEl || !cardDeleteBtn) return;
  const options = { initialType };

  const state = getState();
  const { board, card } = findCardContext(state, {
    spaceId,
    boardId,
    cardId,
  });
  const fallbackSpace = getActiveSpace(state);
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
    cardDeleteBtn.hidden = false;
    cardDeleteBtn.style.display = "inline-flex";
  } else {
    cardForm.reset();
    cardForm.elements.boardId.value = resolvedBoardId;
    cardForm.elements.type.value = options.initialType ?? "note";
    cardForm.elements.url.value = "";
    cardDeleteBtn.hidden = true;
    cardDeleteBtn.style.display = "none";
  }

  updateCardFormFields(cardForm.elements.type.value);

  cardModalEl.classList.add("visible");
  cardModalEl.classList.remove("hidden");
  cardModalEl.setAttribute("aria-hidden", "false");
};

export const closeModal = (modal) => {
  modal?.classList.add("hidden");
  modal?.classList.remove("visible");
  modal?.setAttribute("aria-hidden", "true");
};

export const openShortcutsSheet = () => {
  if (!shortcutsModalEl) return;
  shortcutsModalEl.classList.add("visible");
  shortcutsModalEl.classList.remove("hidden");
  shortcutsModalEl.setAttribute("aria-hidden", "false");
};

export const isInteractionOverlayOpen = (root = document) =>
  Boolean(root?.querySelector?.(".modal.visible, .card-action-menu"));

export const closeCardActionMenu = () => {
  if (activeCardMenu) {
    activeCardMenu.remove();
    activeCardMenu = null;
  }
};

const getCardActionMenuItems = (card, options = {}) => {
  const items = [];
  if (!options.hideEdit) {
    items.push({ action: "edit", label: "Edit" });
  }
  if (card.type === "link" && card.url) {
    items.push({ action: "open", label: "Open in new tab" });
  }
  if (!options.hideDelete) {
    if (items.length) items.push({ separator: true });
    items.push({ action: "delete", label: "Delete", danger: true });
  }
  return items;
};

export const renderCardActionMenu = (cardEl, card, options = {}) => {
  closeCardActionMenu();
  if (!cardEl) return;

  const items = getCardActionMenuItems(card, options);
  if (!items.some((item) => !item.separator)) return null;

  const menu = document.createElement("div");
  menu.className = "card-action-menu";
  menu.setAttribute("role", "menu");

  items.forEach((item) => {
    if (item.separator) {
      const sep = document.createElement("div");
      sep.className = "card-action-menu-separator";
      menu.appendChild(sep);
      return;
    }
    const button = document.createElement("button");
    button.type = "button";
    button.className = "card-action-menu-item";
    if (item.danger) button.classList.add("danger");
    button.dataset.cardAction = item.action;
    button.textContent = item.label;
    button.setAttribute("role", "menuitem");
    menu.appendChild(button);
  });

  cardEl.appendChild(menu);
  activeCardMenu = menu;

  const onOutsideClick = (event) => {
    if (!menu.contains(event.target)) {
      closeCardActionMenu();
      document.removeEventListener("click", onOutsideClick, true);
      document.removeEventListener("keydown", onEsc, true);
    }
  };
  const onEsc = (event) => {
    if (event.key === "Escape") {
      closeCardActionMenu();
      document.removeEventListener("click", onOutsideClick, true);
      document.removeEventListener("keydown", onEsc, true);
    }
  };
  setTimeout(() => {
    document.addEventListener("click", onOutsideClick, true);
    document.addEventListener("keydown", onEsc, true);
  }, 0);

  return menu;
};

export const openSpaceModal = (spaceId = null) => {
  if (!spaceForm || !spaceModalEl || !spaceDeleteBtn) return;
  const state = getState();

  if (spaceId) {
    const space = state.spaces.find((item) => item.id === spaceId);
    if (space) {
      spaceForm.elements.spaceId.value = space.id;
      spaceForm.elements.name.value = space.name;
    }
    const canDelete = state.spaces.length > 1;
    spaceDeleteBtn.hidden = !canDelete;
    spaceDeleteBtn.style.display = canDelete ? "inline-flex" : "none";
  } else {
    spaceForm.reset();
    spaceForm.elements.spaceId.value = "";
    spaceDeleteBtn.hidden = true;
    spaceDeleteBtn.style.display = "none";
  }

  spaceModalEl.classList.add("visible");
  spaceModalEl.classList.remove("hidden");
  spaceModalEl.setAttribute("aria-hidden", "false");
};

const handleEscapeKey = (event) => {
  if (event.key !== "Escape") return;
  if (cardModalEl?.classList.contains("visible")) closeModal(cardModalEl);
  if (spaceModalEl?.classList.contains("visible")) closeModal(spaceModalEl);
  if (shortcutsModalEl?.classList.contains("visible"))
    closeModal(shortcutsModalEl);
  if (confirmModalEl?.classList.contains("visible")) {
    if (confirmResolver) {
      confirmResolver(false);
    }
    closeConfirm();
  }
  closeCardActionMenu();
};

export const initModals = (callbacks = {}) => {
  Object.assign(mutationCallbacks, callbacks);

  if (initialized) return;
  initialized = true;
  hideSnackbar();

  cardForm?.elements?.type?.addEventListener("change", (event) => {
    updateCardFormFields(event.target.value);
  });

  cardForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(cardForm);
    const cardId = formData.get("cardId")?.toString() ?? "";
    const boardId = formData.get("boardId")?.toString() ?? "";
    const state = getState();
    const existingContext = findCardContext(state, { boardId, cardId });
    const cardType = formData.get("type")?.toString() ?? "note";
    const resolvedBoardId =
      boardId ||
      existingContext.board?.id ||
      getActiveSpace(state)?.boards?.[0]?.id ||
      "";
    const targetSpaceId =
      existingContext.space?.id ?? getActiveSpace(state)?.id ?? null;

    const payload = {
      title: formData.get("title")?.toString().trim(),
      type: cardType,
      note:
        cardType === "link"
          ? ""
          : (formData.get("note")?.toString().trim() ?? ""),
      url:
        cardType === "link"
          ? (formData.get("url")?.toString().trim() ?? "")
          : "",
      tags:
        formData
          .get("tags")
          ?.toString()
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean) ?? [],
    };
    const favicon = mutationCallbacks.resolveCardFavicon(
      payload,
      existingContext?.card,
    );

    const titleInput = cardForm?.elements?.title;
    const urlInput = cardForm?.elements?.url;

    titleInput?.classList.remove("input-error");
    urlInput?.classList.remove("input-error");
    if (!payload.title || !resolvedBoardId) {
      showSnackbar("Please double-check the card information.");
      if (!payload.title && titleInput) {
        titleInput.classList.add("input-error");
        titleInput.focus();
      }
      return;
    }
    if (payload.type === "link" && !payload.url) {
      showSnackbar("Please enter a link.");
      if (urlInput) {
        urlInput.classList.add("input-error");
        urlInput.focus();
      }
      return;
    }

    if (cardId) {
      mutationCallbacks.editCard({
        cardId,
        boardId: resolvedBoardId,
        spaceId: targetSpaceId,
        payload,
        favicon,
      });
      showSnackbar("Card updated.");
    } else {
      mutationCallbacks.addCard({
        boardId: resolvedBoardId,
        spaceId: targetSpaceId,
        payload,
        favicon,
      });
      showSnackbar("Card added.");
    }

    closeModal(cardModalEl);
  });

  cardDeleteBtn?.addEventListener("click", () => {
    const cardId = cardForm?.elements?.cardId?.value;
    const boardId = cardForm?.elements?.boardId?.value;
    if (!cardId || !boardId) return;
    const targetSpaceId =
      findCardContext(getState(), { boardId, cardId }).space?.id ?? null;

    closeModal(cardModalEl);
    mutationCallbacks.deleteCard({
      cardId,
      boardId,
      spaceId: targetSpaceId,
    });
  });

  cardModalEl?.addEventListener("click", (event) => {
    if (event.target.dataset.close === "card") {
      closeModal(cardModalEl);
    }
  });

  spaceForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(spaceForm);
    const spaceId = formData.get("spaceId")?.toString() ?? "";
    const name = formData.get("name")?.toString().trim();
    if (!name) return;

    if (spaceId) {
      mutationCallbacks.editSpace({ spaceId, name });
      showSnackbar("Space updated.");
    } else {
      mutationCallbacks.addSpace({ name });
      showSnackbar("Space created.");
    }

    closeModal(spaceModalEl);
  });

  spaceDeleteBtn?.addEventListener("click", () => {
    const spaceId = spaceForm?.elements?.spaceId?.value;
    const state = getState();
    if (!spaceId || !state) return;
    if (state.spaces.length <= 1) {
      showSnackbar("At least one space is required.");
      return;
    }

    closeModal(spaceModalEl);
    mutationCallbacks.deleteSpace({ spaceId });
  });

  spaceModalEl?.addEventListener("click", (event) => {
    if (event.target.dataset.close === "space") {
      closeModal(spaceModalEl);
    }
  });

  confirmModalEl?.addEventListener("click", (event) => {
    if (event.target.dataset.close === "confirm") {
      if (confirmResolver) {
        confirmResolver(false);
      }
      closeConfirm();
    }
  });

  confirmAcceptBtn?.addEventListener("click", () => {
    if (confirmResolver) {
      confirmResolver(true);
    }
    closeConfirm();
  });

  confirmCancelBtn?.addEventListener("click", () => {
    if (confirmResolver) {
      confirmResolver(false);
    }
    closeConfirm();
  });

  shortcutsModalEl?.addEventListener("click", (event) => {
    if (event.target.dataset.close === "shortcuts") {
      closeModal(shortcutsModalEl);
    }
  });

  window.addEventListener("keydown", handleEscapeKey);
};
