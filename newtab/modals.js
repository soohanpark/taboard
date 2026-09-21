import { getRandomAccent, getState, SPACE_ACCENT_PALETTE } from "./state.js";
import { SNACKBAR_DURATION_MS } from "./constants.js";

const cardModalEl = document.getElementById("card-modal");
const cardForm = document.getElementById("card-form");
const cardDeleteBtn = cardForm?.querySelector("[data-delete-card]");
const cardNoteField = cardForm?.querySelector("[data-card-field='note']");
const cardUrlField = cardForm?.querySelector("[data-card-field='url']");
const cardUrlInput = cardForm?.elements?.url;
const cardModalTitleEl = document.getElementById("modal-title");
const spaceModalEl = document.getElementById("space-modal");
const spaceForm = document.getElementById("space-form");
const spaceDeleteBtn = spaceForm?.querySelector("[data-delete-space]");
const spaceModalTitleEl = document.getElementById("space-modal-title");
const spaceModalDescriptionEl = document.getElementById(
  "space-modal-description",
);
const spaceAccentOptionsEl = document.getElementById("space-accent-options");
const spaceAccentPreviewEl = document.getElementById("space-accent-preview");
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
const modalFocusOrigins = new WeakMap();

const MODAL_FOCUSABLE_SELECTOR = [
  "button:not([disabled]):not([hidden])",
  "input:not([disabled]):not([hidden])",
  "textarea:not([disabled]):not([hidden])",
  "select:not([disabled]):not([hidden])",
  '[href]:not([tabindex="-1"])',
  '[tabindex]:not([tabindex="-1"])',
].join(",");

const focusModal = (modal, preferredTarget = null) => {
  if (!modal) return;
  const origin = document.activeElement;
  if (origin?.focus && !modalFocusOrigins.has(modal)) {
    modalFocusOrigins.set(modal, origin);
  }
  queueMicrotask(() => {
    if (!modal.classList.contains("visible")) return;
    const target =
      preferredTarget ?? modal.querySelector?.(MODAL_FOCUSABLE_SELECTOR);
    target?.focus?.();
  });
};

const restoreModalFocus = (modal) => {
  if (!modal) return;
  const origin = modalFocusOrigins.get(modal);
  modalFocusOrigins.delete(modal);
  queueMicrotask(() => {
    if (!getVisibleModal()) origin?.focus?.();
  });
};

const getVisibleModal = () =>
  [confirmModalEl, cardModalEl, spaceModalEl, shortcutsModalEl].find((modal) =>
    modal?.classList.contains("visible"),
  ) ?? null;

const keepFocusInModal = (event) => {
  if (event.key !== "Tab") return false;
  const modal = getVisibleModal();
  if (!modal?.querySelectorAll) return false;
  const focusable = [
    ...modal.querySelectorAll(MODAL_FOCUSABLE_SELECTOR),
  ].filter(
    (element) =>
      !element.hidden &&
      element.getAttribute?.("aria-hidden") !== "true" &&
      element.getClientRects?.().length,
  );
  if (!focusable.length) return false;

  const first = focusable[0];
  const last = focusable.at(-1);
  const active = document.activeElement;
  if (event.shiftKey && (active === first || !modal.contains(active))) {
    event.preventDefault();
    last.focus();
    return true;
  }
  if (!event.shiftKey && (active === last || !modal.contains(active))) {
    event.preventDefault();
    first.focus();
    return true;
  }
  return false;
};

const SPACE_ACCENT_NAMES = [
  "Blue",
  "Indigo",
  "Orange",
  "Emerald",
  "Violet",
  "Sky",
  "Red",
  "Amber",
  "Teal",
  "Pink",
];

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

const setModalCopy = (titleEl, descriptionEl, title, description) => {
  if (titleEl) titleEl.textContent = title;
  if (descriptionEl) descriptionEl.textContent = description;
};

const updateSpaceAccentPreview = (accent) => {
  spaceAccentPreviewEl?.style.setProperty("--space-preview", accent);
};

const renderSpaceAccentOptions = () => {
  if (!spaceAccentOptionsEl || spaceAccentOptionsEl.childNodes.length) return;

  SPACE_ACCENT_PALETTE.forEach((accent, index) => {
    const option = document.createElement("label");
    option.className = "accent-option";

    const input = document.createElement("input");
    input.type = "radio";
    input.name = "accent";
    input.value = accent;
    input.required = true;
    input.setAttribute(
      "aria-label",
      `${SPACE_ACCENT_NAMES[index] ?? "Custom"} space color`,
    );

    const swatch = document.createElement("span");
    swatch.className = "accent-swatch";
    swatch.style.setProperty("--swatch", accent);
    swatch.setAttribute("aria-hidden", "true");

    option.appendChild(input);
    option.appendChild(swatch);
    spaceAccentOptionsEl.appendChild(option);
  });
};

const isCloseAction = (event, target) =>
  Boolean(event.target.closest?.(`[data-close="${target}"]`));

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
    focusModal(confirmModalEl, confirmCancelBtn);
  });

const closeConfirm = () => {
  confirmModalEl?.classList.add("hidden");
  confirmModalEl?.classList.remove("visible");
  confirmModalEl?.setAttribute("aria-hidden", "true");
  confirmResolver = null;
  restoreModalFocus(confirmModalEl);
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
  if (cardModalTitleEl) {
    cardModalTitleEl.textContent = cardId ? "Edit card" : "New card";
  }

  cardModalEl.classList.add("visible");
  cardModalEl.classList.remove("hidden");
  cardModalEl.setAttribute("aria-hidden", "false");
  focusModal(cardModalEl, cardForm.elements.title);
};

export const closeModal = (modal) => {
  modal?.classList.add("hidden");
  modal?.classList.remove("visible");
  modal?.setAttribute("aria-hidden", "true");
  restoreModalFocus(modal);
};

export const openShortcutsSheet = () => {
  if (!shortcutsModalEl) return;
  shortcutsModalEl.classList.add("visible");
  shortcutsModalEl.classList.remove("hidden");
  shortcutsModalEl.setAttribute("aria-hidden", "false");
  focusModal(
    shortcutsModalEl,
    shortcutsModalEl.querySelector?.("[data-close='shortcuts']"),
  );
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
  renderSpaceAccentOptions();
  const state = getState();
  let accent = getRandomAccent();

  if (spaceId) {
    const space = state.spaces.find((item) => item.id === spaceId);
    if (space) {
      spaceForm.elements.spaceId.value = space.id;
      spaceForm.elements.name.value = space.name;
      accent = space.accent ?? accent;
    }
    setModalCopy(
      spaceModalTitleEl,
      spaceModalDescriptionEl,
      "Edit space",
      "Update its name and visual identity.",
    );
    const canDelete = state.spaces.length > 1;
    spaceDeleteBtn.hidden = !canDelete;
    spaceDeleteBtn.style.display = canDelete ? "inline-flex" : "none";
  } else {
    spaceForm.reset();
    spaceForm.elements.spaceId.value = "";
    setModalCopy(
      spaceModalTitleEl,
      spaceModalDescriptionEl,
      "New space",
      "Create a focused home for related boards.",
    );
    spaceDeleteBtn.hidden = true;
    spaceDeleteBtn.style.display = "none";
  }

  spaceForm.elements.accent.value = accent;
  updateSpaceAccentPreview(accent);

  spaceModalEl.classList.add("visible");
  spaceModalEl.classList.remove("hidden");
  spaceModalEl.setAttribute("aria-hidden", "false");
  focusModal(spaceModalEl, spaceForm.elements.name);
};

const handleEscapeKey = (event) => {
  if (keepFocusInModal(event)) return;
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
  renderSpaceAccentOptions();

  cardForm?.addEventListener("change", (event) => {
    if (event.target.matches?.('input[name="type"]')) {
      updateCardFormFields(event.target.value);
    }
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
    if (isCloseAction(event, "card")) {
      closeModal(cardModalEl);
    }
  });

  spaceForm?.addEventListener("change", (event) => {
    if (event.target.matches?.('input[name="accent"]')) {
      updateSpaceAccentPreview(event.target.value);
    }
  });

  spaceForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(spaceForm);
    const spaceId = formData.get("spaceId")?.toString() ?? "";
    const name = formData.get("name")?.toString().trim();
    const accent = formData.get("accent")?.toString() ?? "";
    if (!name) return;

    if (spaceId) {
      mutationCallbacks.editSpace({ spaceId, name, accent });
      showSnackbar("Space updated.");
    } else {
      mutationCallbacks.addSpace({ name, accent });
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
    if (isCloseAction(event, "space")) {
      closeModal(spaceModalEl);
    }
  });

  confirmModalEl?.addEventListener("click", (event) => {
    if (isCloseAction(event, "confirm")) {
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
    if (isCloseAction(event, "shortcuts")) {
      closeModal(shortcutsModalEl);
    }
  });

  window.addEventListener("keydown", handleEscapeKey);
};
