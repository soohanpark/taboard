import { FALLBACK_FAVICON, VIEW_MODES } from "./constants.js";
import { countMatchesAcrossSpaces } from "./state.js";

const getBoardEl = (options = {}) =>
  options.boardEl ?? document.getElementById("board");

const getSpaceTabsEl = (options = {}) =>
  options.spaceTabsEl ?? document.getElementById("space-tabs");

let searchMemoCache = new Map();
let lastRenderedBoardKey = null;
let lastSpaceTabsKey = null;
let lastSidebarKey = null;

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
  const term = searchTerm.trim();
  let result;
  if (term.startsWith("#")) {
    const tag = term.slice(1).trim().toLowerCase();
    result = tag
      ? (card.tags ?? []).some((t) => t.toLowerCase().includes(tag))
      : true;
  } else {
    const haystack = [
      card.title,
      card.note,
      card.url,
      card.tags?.join(" ") ?? "",
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    result = haystack.includes(term.toLowerCase());
  }
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
    cardEl.dataset.readOnly = "true";
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

  const moreIcon = document.createElement("button");
  moreIcon.type = "button";
  moreIcon.className = "card-floating-button card-menu-button";
  moreIcon.dataset.cardAction = "menu";
  moreIcon.title = "More actions";
  moreIcon.textContent = "⋯";
  moreIcon.setAttribute("aria-label", "More actions");
  moreIcon.setAttribute("aria-haspopup", "menu");
  floating.appendChild(moreIcon);

  cardEl.appendChild(floating);

  if (originLabel) {
    const origin = document.createElement("span");
    origin.className = "card-origin";
    origin.textContent = originLabel;
    cardEl.appendChild(origin);
  }

  const titleRow = document.createElement("div");
  titleRow.className = "card-title-row";

  const leading = document.createElement("div");
  leading.className = "card-leading";

  if (card.type === "todo") {
    const doneButton = document.createElement("button");
    doneButton.type = "button";
    doneButton.className = "card-leading-button card-done-button";
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
    leading.appendChild(doneButton);
  }

  if (!options.hideFavoriteButton) {
    const favoriteIcon = document.createElement("button");
    favoriteIcon.type = "button";
    favoriteIcon.className = "card-leading-button card-favorite-button";
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
    leading.appendChild(favoriteIcon);
  }

  if (card.type === "link") {
    const favicon = document.createElement("img");
    favicon.className = "card-favicon";
    favicon.alt = "";
    favicon.src = getCardFavicon(card);
    favicon.onerror = () => {
      favicon.src = FALLBACK_FAVICON;
      favicon.onerror = null;
    };
    leading.appendChild(favicon);
  }

  if (card.type !== "link") {
    const typeIconMap = {
      note: "\uD83D\uDCDD",
      todo: "\u2713",
    };
    const glyph = typeIconMap[card.type];
    if (glyph) {
      const typeIcon = document.createElement("span");
      typeIcon.className = "card-type-icon";
      typeIcon.textContent = glyph;
      typeIcon.setAttribute("aria-hidden", "true");
      leading.appendChild(typeIcon);
    }
  }
  if (leading.childNodes.length) titleRow.appendChild(leading);

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
      tagEl.dataset.tag = tag;
      tagEl.setAttribute("role", "button");
      tagEl.tabIndex = 0;
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

export const renderBoardSidebar = (state, options = {}) => {
  const sidebarListEl =
    options.sidebarListEl ?? document.getElementById("board-sidebar-list");
  const sidebarEl =
    options.sidebarEl ?? document.getElementById("board-sidebar");
  if (!sidebarListEl || !sidebarEl) return;

  const space = options.getActiveSpace?.(state) ?? null;
  const activeBoardId = state.preferences.activeBoardId ?? null;
  const isFavorites = state.preferences.viewMode === VIEW_MODES.FAVORITES;
  const searchTerm = (state.preferences.searchTerm ?? "").trim();

  if (isFavorites) {
    sidebarEl.classList.add("board-sidebar-hidden");
    return;
  }
  sidebarEl.classList.remove("board-sidebar-hidden");

  const matchCounts = searchTerm
    ? countMatchesAcrossSpaces(state, searchTerm)
    : null;

  const sidebarKey =
    (space?.boards
      ?.map((b) => {
        const todos = (b.cards ?? []).filter((c) => c.type === "todo");
        const todoDone = todos.filter((c) => c.done).length;
        const matchInfo = matchCounts?.perBoard?.[b.id];
        return [
          b.id,
          b.name,
          (b.cards ?? []).length,
          todos.length,
          todoDone,
          matchInfo ? `${matchInfo.match}/${matchInfo.total}` : "",
        ].join(":");
      })
      .join("|") ?? "") +
    "|" +
    activeBoardId +
    "|" +
    searchTerm;
  if (sidebarKey === lastSidebarKey) return;
  lastSidebarKey = sidebarKey;

  sidebarListEl.replaceChildren();

  if (!space || !space.boards.length) return;

  space.boards.forEach((board) => {
    const li = document.createElement("li");
    li.className = "board-sidebar-item";
    if (board.id === activeBoardId) {
      li.classList.add("active");
    }
    li.dataset.boardId = board.id;
    li.draggable = true;
    li.tabIndex = 0;
    li.setAttribute("role", "option");
    li.setAttribute(
      "aria-selected",
      board.id === activeBoardId ? "true" : "false",
    );

    const name = document.createElement("span");
    name.className = "board-sidebar-item-name";
    name.textContent = board.name;

    const count = document.createElement("span");
    count.className = "board-sidebar-item-count";

    if (searchTerm && matchCounts) {
      const info = matchCounts.perBoard[board.id] ?? {
        match: 0,
        total: board.cards.length,
      };
      count.textContent = `${info.match}/${info.total}`;
      if (info.match === 0) li.classList.add("is-dimmed");
    } else {
      const todos = (board.cards ?? []).filter((c) => c.type === "todo");
      if (todos.length) {
        const done = todos.filter((c) => c.done).length;
        if (done === todos.length) {
          count.textContent = "✓";
          count.classList.add("is-all-done");
        } else {
          count.textContent = `${done} / ${todos.length}`;
        }
      } else {
        count.textContent = String(board.cards.length);
      }
    }

    li.appendChild(name);
    li.appendChild(count);
    sidebarListEl.appendChild(li);
  });
};

export const renderBoard = (state, options = {}) => {
  const boardEl = getBoardEl(options);
  if (!boardEl) return;

  const space = options.getActiveSpace?.(state) ?? null;
  const searchTerm = state.preferences.searchTerm?.trim() ?? "";
  const metaAction = options.metaAction ?? null;
  const activeBoardId = state.preferences.activeBoardId ?? null;

  // Find active board, or fallback to first board
  const activeBoard = activeBoardId
    ? (space?.boards?.find((b) => b.id === activeBoardId) ??
      space?.boards?.[0] ??
      null)
    : (space?.boards?.[0] ?? null);

  const boardKey =
    (activeBoard
      ? activeBoard.id +
        ":" +
        activeBoard.name +
        ":" +
        activeBoard.cards
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
          .join(",")
      : "") +
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
  boardEl.classList.add("board-detail-view");
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
    const cta = document.createElement("button");
    cta.type = "button";
    cta.className = "board-empty-cta";
    cta.dataset.emptyAction = "create-space";
    cta.textContent = "+ Create your first space";
    emptyState.appendChild(icon);
    emptyState.appendChild(heading);
    emptyState.appendChild(sub);
    emptyState.appendChild(cta);
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
    sub.textContent = 'Click "+" in the sidebar or use the button below.';
    const cta = document.createElement("button");
    cta.type = "button";
    cta.className = "board-empty-cta";
    cta.dataset.emptyAction = "create-board";
    cta.textContent = "+ Create board";
    emptyState.appendChild(icon);
    emptyState.appendChild(heading);
    emptyState.appendChild(sub);
    emptyState.appendChild(cta);
    if (options.allowSampleTemplate) {
      const sampleLink = document.createElement("button");
      sampleLink.type = "button";
      sampleLink.className = "board-empty-secondary";
      sampleLink.dataset.emptyAction = "use-sample";
      sampleLink.textContent = "Or use sample template";
      emptyState.appendChild(sampleLink);
    }
    boardEl.appendChild(emptyState);
    return;
  }

  if (!activeBoard) return;

  // Render single active board as a detail view
  const column = document.createElement("article");
  column.className = "column";
  column.dataset.spaceId = space.id;
  if (options.animateColumns === false) {
    column.classList.add("column-no-animate");
  }
  column.dataset.boardId = activeBoard.id;

  const header = document.createElement("div");
  header.className = "column-header";

  const title = document.createElement("div");
  title.className = "column-title";
  title.contentEditable = true;
  title.dataset.boardId = activeBoard.id;
  title.textContent = activeBoard.name;

  const metaGroup = document.createElement("div");
  metaGroup.className = "column-meta";

  const linkCount = activeBoard.cards.filter(
    (card) => card.type === "link" && card.url,
  ).length;
  const metaButton = document.createElement("button");
  metaButton.type = "button";
  metaButton.className = "column-sites";
  metaButton.dataset.boardOpen = activeBoard.id;
  if (linkCount === 0) {
    metaButton.disabled = true;
    metaButton.title = "No links to open";
  }
  const metaLabel = document.createElement("span");
  metaLabel.className = "column-sites-label";
  metaLabel.textContent = "Open all";
  const metaBadge = document.createElement("span");
  metaBadge.className = "column-sites-badge";
  metaBadge.textContent = String(linkCount);
  metaButton.appendChild(metaLabel);
  metaButton.appendChild(metaBadge);
  metaGroup.appendChild(metaButton);

  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className = "column-delete";
  deleteBtn.dataset.columnDelete = activeBoard.id;
  deleteBtn.title = "Delete board";
  deleteBtn.textContent = "×";
  const headerControls = document.createElement("div");
  headerControls.className = "column-controls";
  headerControls.appendChild(metaGroup);
  headerControls.appendChild(deleteBtn);

  header.appendChild(title);
  header.appendChild(headerControls);
  column.appendChild(header);

  if (searchTerm) {
    const matches = countMatchesAcrossSpaces(state, searchTerm);
    const localMatch = matches.perBoard[activeBoard.id]?.match ?? 0;
    const elsewhere = matches.total - localMatch;
    if (localMatch === 0 && elsewhere > 0) {
      let bestBoard = null;
      let bestMatch = 0;
      Object.entries(matches.perBoard).forEach(([id, info]) => {
        if (id !== activeBoard.id && info.match > bestMatch) {
          bestMatch = info.match;
          bestBoard = { id, info };
        }
      });
      const banner = document.createElement("div");
      banner.className = "board-search-banner";
      banner.dataset.jumpBoardId = bestBoard?.id ?? "";
      banner.dataset.jumpSpaceId = bestBoard?.info?.spaceId ?? "";
      banner.tabIndex = 0;
      banner.setAttribute("role", "button");
      banner.textContent = `이 보드에는 결과가 없어요 — 다른 보드에서 ${elsewhere}개 발견`;
      column.appendChild(banner);
    }
  }

  const cardList = document.createElement("div");
  cardList.className = "card-list";
  cardList.dataset.boardId = activeBoard.id;
  cardList.dataset.spaceId = space.id;
  options.attachDropTargets?.(cardList);

  activeBoard.cards.forEach((card) => {
    const cardEl = createCardElement(card, activeBoard.id, searchTerm, {
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

  const addCardWrapper = document.createElement("div");
  addCardWrapper.className = "add-card-wrapper";

  const addCardBtn = document.createElement("button");
  addCardBtn.type = "button";
  addCardBtn.className = "add-card";
  addCardBtn.dataset.boardId = activeBoard.id;
  addCardBtn.setAttribute("aria-label", "Add card");
  const addLabel = document.createElement("span");
  addLabel.className = "add-card-label";
  addLabel.textContent = "+ Add card";
  addCardBtn.appendChild(addLabel);
  addCardWrapper.appendChild(addCardBtn);

  const chips = document.createElement("div");
  chips.className = "add-card-chips";
  ["link", "note", "todo"].forEach((type) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = `add-card-chip add-card-chip-${type}`;
    chip.dataset.addCardType = type;
    chip.dataset.boardId = activeBoard.id;
    chip.textContent = type[0].toUpperCase() + type.slice(1);
    chips.appendChild(chip);
  });
  addCardWrapper.appendChild(chips);

  column.appendChild(addCardWrapper);
  options.enableColumnDrag?.(column);
  boardEl.appendChild(column);
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
