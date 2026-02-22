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

let snackbarTimer = null;
let confirmResolver = null;
let initialized = false;

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
  if (snackbarEl) snackbarEl.textContent = "";
};

export const showSnackbar = (message, duration = SNACKBAR_DURATION_MS) => {
  if (!message) {
    hideSnackbar();
    return;
  }
  clearTimeout(snackbarTimer);
  if (snackbarEl) {
    snackbarEl.textContent = message;
    snackbarEl.classList.add("visible");
    snackbarEl.setAttribute("aria-hidden", "false");
  }
  snackbarTimer = setTimeout(() => hideSnackbar(), duration);
};

export const openConfirm = (message) =>
  new Promise((resolve) => {
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

export const openCardModal = ({ boardId, cardId = null, spaceId = null }) => {
  if (!cardForm || !cardModalEl || !cardDeleteBtn) return;

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

export const closeModal = (modal) => {
  modal?.classList.add("hidden");
  modal?.classList.remove("visible");
  modal?.setAttribute("aria-hidden", "true");
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
    spaceDeleteBtn.style.display =
      state.spaces.length > 1 ? "inline-flex" : "none";
  } else {
    spaceForm.reset();
    spaceForm.elements.spaceId.value = "";
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
  if (confirmModalEl?.classList.contains("visible")) {
    if (confirmResolver) {
      confirmResolver(false);
    }
    closeConfirm();
  }
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

    if (!payload.title || !resolvedBoardId) {
      showSnackbar("Please double-check the card information.");
      return;
    }

    if (payload.type === "link" && !payload.url) {
      showSnackbar("Please enter a link.");
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

    mutationCallbacks.deleteCard({
      cardId,
      boardId,
      spaceId: targetSpaceId,
    });
    closeModal(cardModalEl);
    showSnackbar("Card deleted.");
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

    mutationCallbacks.deleteSpace({ spaceId });
    closeModal(spaceModalEl);
    showSnackbar("Space deleted.");
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

  window.addEventListener("keydown", handleEscapeKey);
};
