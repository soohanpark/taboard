import { FALLBACK_FAVICON, VIEW_MODES } from "./constants.js";

const getBoardEl = (options = {}) =>
  options.boardEl ?? document.getElementById("board");

const getSpaceTabsEl = (options = {}) =>
  options.spaceTabsEl ?? document.getElementById("space-tabs");

const getAddColumnBtn = (options = {}) =>
  options.addColumnBtn ?? document.getElementById("add-column");

let searchMemoCache = new Map();
let lastRenderedBoardKey = null;
let lastSpaceTabsKey = null;

export const invalidateSearchCache = () => {
  searchMemoCache.clear();
};

export const isSafeIconUrl = (icon) => {
  if (!icon || typeof icon !== "string") return false;
  const value = icon.trim();
  if (!value) return false;
  return (
    /^(https?:|data:image)/i.test(value) ||
    value.startsWith("chrome-extension://") ||
    value.startsWith("chrome://") ||
    value.startsWith("/") ||
    value.startsWith("./") ||
    value.startsWith("../") ||
    value.startsWith("icons/")
  );
};

export const deriveFaviconFromUrl = (url) => {
  if (!url || typeof url !== "string") return "";
  try {
    const parsed = new URL(url.trim());
    if (!/^https?:/i.test(parsed.protocol)) {
      return "";
    }
    return `${parsed.origin}/favicon.ico`;
  } catch (error) {
    return "";
  }
};

export const resolveCardFavicon = (payload, existingCard = null) => {
  if (payload.type !== "link") return "";
  const provided = isSafeIconUrl(payload.favicon) ? payload.favicon.trim() : "";
  if (provided) return provided;
  if (
    existingCard?.favicon &&
    isSafeIconUrl(existingCard.favicon) &&
    existingCard.url === payload.url
  ) {
    return existingCard.favicon;
  }
  return deriveFaviconFromUrl(payload.url);
};

export const getCardFavicon = (card) => {
  const source =
    (card?.favicon && isSafeIconUrl(card.favicon) && card.favicon.trim()) ||
    deriveFaviconFromUrl(card?.url) ||
    "";
  return source || FALLBACK_FAVICON;
};

export const formatCount = (count) =>
  `${count} ${count === 1 ? "site" : "sites"}`;

export const cardMatchesSearch = (card, searchTerm) => {
  if (!searchTerm) return true;
  const key = `${searchTerm}:${card.id}`;
  if (searchMemoCache.has(key)) return searchMemoCache.get(key);
  const haystack = [card.title, card.note, card.url, card.tags?.join(" ") ?? ""]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const result = haystack.includes(searchTerm.toLowerCase());
  searchMemoCache.set(key, result);
  return result;
};

export const renderSpaceTabs = (state, options = {}) => {
  const spaceTabsEl = getSpaceTabsEl(options);
  if (!spaceTabsEl) return;
  const spaceKey =
    state.spaces.map((s) => s.id + ":" + s.name).join("|") +
    "|" +
    state.preferences.activeSpaceId +
    "|" +
    state.preferences.viewMode;
  if (spaceKey === lastSpaceTabsKey) return;
  lastSpaceTabsKey = spaceKey;
  spaceTabsEl.replaceChildren();

  const favoritesTab = document.createElement("button");
  favoritesTab.type = "button";
  favoritesTab.className = `space-tab space-tab-favorites${
    state.preferences.viewMode === VIEW_MODES.FAVORITES ? " active" : ""
  }`;
  favoritesTab.dataset.viewMode = VIEW_MODES.FAVORITES;
  favoritesTab.textContent = "★";
  spaceTabsEl.appendChild(favoritesTab);

  state.spaces.forEach((space) => {
    const button = document.createElement("button");
    button.type = "button";
    const isActiveSpace =
      state.preferences.viewMode === VIEW_MODES.SPACES &&
      space.id === state.preferences.activeSpaceId;
    button.className = `space-tab${isActiveSpace ? " active" : ""}`;
    button.dataset.spaceId = space.id;
    button.draggable = true;
    const dot = document.createElement("span");
    dot.className = "favorites-space-dot space-dot";
    dot.style.backgroundColor = space.accent ?? "var(--accent)";
    const name = document.createElement("span");
    name.textContent = space.name;
    button.appendChild(dot);
    button.appendChild(name);
    spaceTabsEl.appendChild(button);
  });

  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.className = "space-tab";
  addBtn.id = "add-space-tab";
  addBtn.textContent = "＋";
  spaceTabsEl.appendChild(addBtn);
};

export const createCardElement = (card, boardId, searchTerm, options = {}) => {
  const {
    spaceId = null,
    readOnly = false,
    originLabel = "",
    animateCards = true,
    originAccent = null,
    onCardDragStart = null,
    onCardDragEnd = null,
  } = options;
  const cardEl = document.createElement("article");
  cardEl.className = "card";
  cardEl.dataset.cardId = card.id;
  cardEl.dataset.boardId = boardId;
  cardEl.dataset.spaceId = spaceId ?? "";
  cardEl.dataset.type = card.type;
  cardEl.draggable = !readOnly;
  if (readOnly) {
    cardEl.classList.add("card-readonly");
  }
  if (card.done) {
    cardEl.classList.add("is-done");
  }
  if (originAccent) {
    cardEl.style.setProperty("--origin-accent", originAccent);
  }

  if (card.type === "link" && card.url) {
    cardEl.classList.add("card-link");
  }
  if (animateCards === false) {
    cardEl.classList.add("card-no-animate");
  }

  const floating = document.createElement("div");
  floating.className = "card-floating-actions";

  if (card.type === "todo") {
    const doneButton = document.createElement("button");
    doneButton.type = "button";
    doneButton.className = "card-floating-button card-done-button";
    doneButton.dataset.cardAction = "toggle-done";
    doneButton.title = card.done ? "Mark incomplete" : "Mark complete";
    doneButton.setAttribute(
      "aria-label",
      card.done ? "Mark incomplete" : "Mark complete",
    );
    doneButton.textContent = card.done ? "✔" : "☐";
    if (card.done) {
      doneButton.classList.add("is-done");
    }
    floating.appendChild(doneButton);
  }

  const editIcon = document.createElement("button");
  editIcon.type = "button";
  editIcon.className = "card-floating-button";
  editIcon.dataset.cardAction = "edit";
  editIcon.title = "Edit";
  editIcon.textContent = "✎";
  editIcon.setAttribute("aria-label", "Edit card");
  floating.appendChild(editIcon);

  const favoriteIcon = document.createElement("button");
  favoriteIcon.type = "button";
  favoriteIcon.className = "card-floating-button card-favorite-button";
  favoriteIcon.dataset.cardAction = "favorite";
  favoriteIcon.title = card.favorite ? "Unfavorite" : "Favorite";
  favoriteIcon.textContent = card.favorite ? "★" : "☆";
  favoriteIcon.setAttribute(
    "aria-label",
    card.favorite ? "Unfavorite" : "Favorite",
  );
  if (card.favorite) {
    favoriteIcon.classList.add("is-active");
  }
  floating.appendChild(favoriteIcon);

  const deleteIcon = document.createElement("button");
  deleteIcon.type = "button";
  deleteIcon.className = "card-floating-button";
  deleteIcon.dataset.cardAction = "delete";
  deleteIcon.title = "Delete";
  deleteIcon.textContent = "×";
  deleteIcon.setAttribute("aria-label", "Delete card");
  floating.appendChild(deleteIcon);

  cardEl.appendChild(floating);

  if (originLabel) {
    const origin = document.createElement("span");
    origin.className = "card-origin";
    origin.textContent = originLabel;
    cardEl.appendChild(origin);
  }

  const titleRow = document.createElement("div");
  titleRow.className = "card-title-row";

  if (card.type === "link") {
    const favicon = document.createElement("img");
    favicon.className = "card-favicon";
    favicon.alt = "";
    favicon.src = getCardFavicon(card);
    favicon.onerror = () => {
      favicon.src = FALLBACK_FAVICON;
      favicon.onerror = null;
    };
    titleRow.appendChild(favicon);
  }

  const typeIconMap = {
    link: "\uD83D\uDD17",
    note: "\uD83D\uDCDD",
    todo: "\u2713",
  };
  const typeIcon = document.createElement("span");
  typeIcon.className = "card-type-icon";
  typeIcon.textContent = typeIconMap[card.type] ?? "";
  typeIcon.setAttribute("aria-hidden", "true");
  titleRow.appendChild(typeIcon);

  const title = document.createElement("p");
  title.className = "card-title";
  title.textContent = card.title;
  titleRow.appendChild(title);

  cardEl.appendChild(titleRow);

  if (card.note) {
    const note = document.createElement("p");
    note.className = "card-note";
    note.textContent = card.note;
    cardEl.appendChild(note);
  }

  if (card.url) {
    const link = document.createElement("p");
    link.className = "card-note card-url";
    link.textContent = card.url;
    cardEl.appendChild(link);
  }

  if (card.tags?.length) {
    const tagsEl = document.createElement("div");
    tagsEl.className = "card-tags";
    card.tags.forEach((tag) => {
      const tagEl = document.createElement("span");
      tagEl.className = "card-tag";
      tagEl.textContent = `#${tag}`;
      tagsEl.appendChild(tagEl);
    });
    cardEl.appendChild(tagsEl);
  }

  const matches = cardMatchesSearch(card, searchTerm);
  if (searchTerm && !matches) {
    cardEl.classList.add("card-hidden");
  } else {
    cardEl.classList.remove("card-hidden");
  }

  if (!readOnly) {
    cardEl.addEventListener("dragstart", (event) => {
      onCardDragStart?.({
        cardId: card.id,
        boardId,
        spaceId,
        cardTitle: card.title ?? "card",
        cardEl,
        event,
      });
    });

    cardEl.addEventListener("dragend", () => {
      onCardDragEnd?.({ cardEl });
    });
  }

  return cardEl;
};

export const appendAddBoardButton = (options = {}) => {
  const addColumnBtn = getAddColumnBtn(options);
  const boardEl = getBoardEl(options);
  if (!addColumnBtn || !boardEl) return;
  addColumnBtn.classList.add("add-column-tile");
  addColumnBtn.textContent = "+";
  addColumnBtn.setAttribute("aria-label", "Add board");
  addColumnBtn.style.display = "inline-flex";
  boardEl.appendChild(addColumnBtn);
};

export const renderBoard = (state, options = {}) => {
  const boardEl = getBoardEl(options);
  if (!boardEl) return;

  const space = options.getActiveSpace?.(state) ?? null;
  const searchTerm = state.preferences.searchTerm?.trim() ?? "";
  const metaAction = options.metaAction ?? null;

  const boardKey =
    (space?.boards
      ?.map(
        (b) =>
          b.id +
          ":" +
          b.name +
          ":" +
          b.cards
            .map(
              (c) =>
                c.id +
                "|" +
                (c.favorite ? 1 : 0) +
                "|" +
                (c.done ? 1 : 0) +
                "|" +
                (c.updatedAt ?? ""),
            )
            .join(","),
      )
      .join("|") ?? "") +
    "|" +
    searchTerm;

  if (
    boardKey === lastRenderedBoardKey &&
    metaAction !== "move-card" &&
    metaAction !== "move-board"
  ) {
    return;
  }
  if (boardKey !== lastRenderedBoardKey) {
    searchMemoCache.clear();
  }
  lastRenderedBoardKey = boardKey;

  boardEl.classList.remove("favorites-view");
  boardEl.classList.remove("board-empty");
  boardEl.replaceChildren();

  if (!space) {
    const emptyState = document.createElement("div");
    emptyState.className = "board-empty-state";
    const icon = document.createElement("div");
    icon.className = "board-empty-icon";
    icon.textContent = "\uD83D\uDDC2\uFE0F";
    const heading = document.createElement("p");
    heading.className = "board-empty-title";
    heading.textContent = "No space selected";
    const sub = document.createElement("p");
    sub.className = "board-empty-subtitle";
    sub.textContent = "Create a space to get started.";
    emptyState.appendChild(icon);
    emptyState.appendChild(heading);
    emptyState.appendChild(sub);
    boardEl.appendChild(emptyState);
    return;
  }

  if (!space.boards.length) {
    boardEl.classList.add("board-empty");
    const emptyState = document.createElement("div");
    emptyState.className = "board-empty-state";
    const icon = document.createElement("div");
    icon.className = "board-empty-icon";
    icon.textContent = "\uD83D\uDCCB";
    const heading = document.createElement("p");
    heading.className = "board-empty-title";
    heading.textContent = "No boards yet";
    const sub = document.createElement("p");
    sub.className = "board-empty-subtitle";
    sub.textContent = "Add a board to organize your cards.";
    emptyState.appendChild(icon);
    emptyState.appendChild(heading);
    emptyState.appendChild(sub);
    boardEl.appendChild(emptyState);
    appendAddBoardButton(options);
    return;
  }

  space.boards.forEach((board) => {
    const column = document.createElement("article");
    column.className = "column";
    column.dataset.spaceId = space.id;
    if (options.animateColumns === false) {
      column.classList.add("column-no-animate");
    }
    column.dataset.boardId = board.id;

    const header = document.createElement("div");
    header.className = "column-header";

    const title = document.createElement("div");
    title.className = "column-title";
    title.contentEditable = true;
    title.dataset.boardId = board.id;
    title.textContent = board.name;

    const metaGroup = document.createElement("div");
    metaGroup.className = "column-meta";

    const metaButton = document.createElement("button");
    metaButton.type = "button";
    metaButton.className = "column-sites";
    metaButton.dataset.boardOpen = board.id;
    metaButton.textContent = formatCount(board.cards.length);
    metaGroup.appendChild(metaButton);

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "column-delete";
    deleteBtn.dataset.columnDelete = board.id;
    deleteBtn.title = "Delete board";
    deleteBtn.textContent = "×";
    const headerControls = document.createElement("div");
    headerControls.className = "column-controls";
    headerControls.appendChild(metaGroup);
    headerControls.appendChild(deleteBtn);

    header.appendChild(title);
    header.appendChild(headerControls);
    column.appendChild(header);

    const cardList = document.createElement("div");
    cardList.className = "card-list";
    cardList.dataset.boardId = board.id;
    cardList.dataset.spaceId = space.id;
    options.attachDropTargets?.(cardList);

    board.cards.forEach((card) => {
      const cardEl = createCardElement(card, board.id, searchTerm, {
        animateCards: options.animateCards,
        spaceId: space.id,
        onCardDragStart: options.onCardDragStart,
        onCardDragEnd: options.onCardDragEnd,
      });
      cardList.appendChild(cardEl);
    });

    const dropIndicator = document.createElement("div");
    dropIndicator.className = "board-drop-indicator";
    cardList.appendChild(dropIndicator);

    column.appendChild(cardList);

    const addCardBtn = document.createElement("button");
    addCardBtn.type = "button";
    addCardBtn.className = "add-card";
    addCardBtn.dataset.boardId = board.id;
    addCardBtn.textContent = "+";
    addCardBtn.setAttribute("aria-label", "Add card");
    column.appendChild(addCardBtn);
    options.enableColumnDrag?.(column);
    boardEl.appendChild(column);
  });

  appendAddBoardButton(options);
};

export const getFavoriteGroups = (state, searchTerm) =>
  state.spaces
    .map((space) => {
      const cards = [];
      space.boards.forEach((board) => {
        board.cards.forEach((card) => {
          if (card.favorite && cardMatchesSearch(card, searchTerm)) {
            cards.push({
              card,
              boardId: board.id,
              boardName: board.name,
            });
          }
        });
      });
      return { space, cards };
    })
    .filter((group) => group.cards.length);

export const renderFavoritesBoard = (state, options = {}) => {
  const boardEl = getBoardEl(options);
  if (!boardEl) return;
  lastRenderedBoardKey = null;
  boardEl.classList.add("favorites-view");
  boardEl.replaceChildren();
  const searchTerm = state.preferences.searchTerm?.trim();
  const favoriteGroups = getFavoriteGroups(state, searchTerm);
  const isFiltering = Boolean(searchTerm);

  if (!favoriteGroups.length) {
    const empty = document.createElement("div");
    empty.className = "favorites-empty";
    const emptyIcon = document.createElement("div");
    emptyIcon.className = "favorites-empty-icon";
    emptyIcon.textContent = "☆";
    const emptyTitle = document.createElement("p");
    emptyTitle.textContent = isFiltering
      ? "No favorited cards match your search."
      : "No favorited cards yet.";
    const emptyHint = document.createElement("p");
    emptyHint.className = "favorites-empty-hint";
    emptyHint.textContent = isFiltering
      ? "Try a different search term or add some favorites."
      : "Use the star on a card to add it to favorites.";
    empty.appendChild(emptyIcon);
    empty.appendChild(emptyTitle);
    empty.appendChild(emptyHint);
    boardEl.appendChild(empty);
    return;
  }

  const hero = document.createElement("div");
  hero.className = "favorites-hero";
  const heroIcon = document.createElement("div");
  heroIcon.className = "favorites-hero-icon";
  heroIcon.textContent = "★";
  const heroText = document.createElement("div");
  heroText.className = "favorites-hero-text";
  const heroTitle = document.createElement("p");
  heroTitle.className = "favorites-hero-title";
  heroTitle.textContent = "Favorites hub";
  const heroSubtitle = document.createElement("p");
  heroSubtitle.className = "favorites-hero-subtitle";
  heroSubtitle.textContent = "See your most important cards in one place.";
  heroText.appendChild(heroTitle);
  heroText.appendChild(heroSubtitle);
  hero.appendChild(heroIcon);
  hero.appendChild(heroText);
  boardEl.appendChild(hero);

  const groupsWrap = document.createElement("div");
  groupsWrap.className = "favorites-groups";

  favoriteGroups.forEach((group) => {
    const groupEl = document.createElement("article");
    groupEl.className = "favorites-group";
    groupEl.style.setProperty(
      "--group-accent",
      group.space.accent ?? "var(--accent)",
    );

    const header = document.createElement("div");
    header.className = "favorites-group-header";

    const title = document.createElement("div");
    title.className = "favorites-group-title";

    const dot = document.createElement("span");
    dot.className = "favorites-space-dot";
    dot.style.backgroundColor = group.space.accent ?? "var(--accent)";

    const name = document.createElement("span");
    name.textContent = group.space.name;
    title.appendChild(dot);
    title.appendChild(name);

    const count = document.createElement("span");
    count.className = "favorites-group-count";
    count.textContent =
      group.cards.length === 1 ? "1 card" : `${group.cards.length} cards`;

    header.appendChild(title);
    header.appendChild(count);
    groupEl.appendChild(header);

    const cards = document.createElement("div");
    cards.className = "favorites-card-grid";

    group.cards.forEach(({ card, boardId, boardName }) => {
      const cardEl = createCardElement(card, boardId, searchTerm, {
        spaceId: group.space.id,
        readOnly: true,
        originLabel: `${group.space.name} · ${boardName}`,
        animateCards: false,
        originAccent: group.space.accent,
      });
      cards.appendChild(cardEl);
    });

    groupEl.appendChild(cards);
    groupsWrap.appendChild(groupEl);
  });

  boardEl.appendChild(groupsWrap);
};
