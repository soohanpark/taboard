import {
  createDefaultState,
  generateId,
  getState,
  initState,
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

const boardEl = document.getElementById("board");
const spaceTabsEl = document.getElementById("space-tabs");
const addColumnBtn = document.getElementById("add-column");
const cardModalEl = document.getElementById("card-modal");
const cardForm = document.getElementById("card-form");
const cardDeleteBtn = cardForm.querySelector("[data-delete-card]");
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
let draggingCard = null;
let openTabs = [];
let tabFilter = "";
const cleanupTabListeners = [];
const TAB_DRAG_MIME = "application/taboard-tab";
let suppressCardClick = false;
const DRIVE_SYNC_INTERVAL = 30 * 60 * 1000;
const VIEW_MODES = { SPACES: "spaces", FAVORITES: "favorites" };
let driveSyncIntervalId = null;
let hasPulledDriveState = false;
let driveSyncInFlight = false;
const FALLBACK_FAVICON =
  (typeof chrome !== "undefined" && chrome.runtime?.getURL?.("icons/icon48.png")) ||
  "icons/icon48.png";
let confirmResolver = null;

const getActiveSpace = (state = currentState) => {
  if (!state?.spaces?.length) return null;
  const active = state.spaces.find((space) => space.id === state.preferences?.activeSpaceId);
  return active ?? state.spaces[0];
};

const findSection = (space, sectionId) =>
  space?.sections?.find((section) => section.id === sectionId) ?? null;

const findSpaceById = (state, spaceId) =>
  state?.spaces?.find((space) => space.id === spaceId) ?? null;

const findCardContext = (state, { spaceId = null, sectionId = null, cardId = null }) => {
  let space =
    findSpaceById(state, spaceId) ??
    state?.spaces?.find((candidate) =>
      candidate.sections?.some((section) => section.id === sectionId)
    ) ??
    state?.spaces?.find((candidate) =>
      candidate.sections?.some((section) => section.cards?.some((item) => item.id === cardId))
    ) ??
    null;

  let section = space?.sections?.find((item) => item.id === sectionId) ?? null;
  if (!section && space && cardId) {
    section = space.sections?.find((item) => item.cards?.some((card) => card.id === cardId));
  }

  const card = section?.cards?.find((item) => item.id === cardId) ?? null;
  return { space, section, card };
};

const hideSnackbar = () => {
  clearTimeout(snackbarTimer);
  snackbarEl.classList.remove("visible");
  snackbarEl.setAttribute("aria-hidden", "true");
  snackbarEl.textContent = "";
};

const showSnackbar = (message, duration = 3000) => {
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
  saveTimer = setTimeout(() => saveStateToStorage(state), 350);
};

const scheduleDriveSync = (state, immediate = false) => {
  const driveSnapshot = getDriveSnapshot();
  if (driveSnapshot.status !== "connected") {
    return;
  }

  clearTimeout(driveTimer);
  const executor = async () => {
    try {
      await pushToDrive(state);
      if (immediate) {
        showSnackbar("Google Drive 백업 완료");
      }
    } catch (error) {
      console.error(error);
      showSnackbar("Drive 동기화 실패: " + error.message);
    }
  };

  if (immediate) {
    executor();
  } else {
    driveTimer = setTimeout(executor, 1500);
  }
};

const runDriveSync = async () => {
  if (driveSyncInFlight || getDriveSnapshot().status !== "connected") {
    return;
  }
  driveSyncInFlight = true;
  try {
    const remoteState = await pullFromDrive();
    const localState = getState();
    const remoteTime = remoteState?.lastUpdated ? new Date(remoteState.lastUpdated).getTime() : 0;
    const localTime = localState?.lastUpdated ? new Date(localState.lastUpdated).getTime() : 0;
    if (remoteState && remoteTime > localTime) {
      replaceState(remoteState);
    } else {
      await pushToDrive(localState);
    }
  } catch (error) {
    console.error("Google Drive background sync failed", error);
  } finally {
    driveSyncInFlight = false;
  }
};

const startDriveBackgroundSync = () => {
  if (driveSyncIntervalId) return;
  driveSyncIntervalId = setInterval(() => {
    runDriveSync();
  }, DRIVE_SYNC_INTERVAL);
  runDriveSync();
};

const stopDriveBackgroundSync = () => {
  if (driveSyncIntervalId) {
    clearInterval(driveSyncIntervalId);
    driveSyncIntervalId = null;
  }
  driveSyncInFlight = false;
};

const formatCount = (count) => `${count} ${count === 1 ? "site" : "sites"}`;

const cardMatchesSearch = (card, searchTerm) => {
  if (!searchTerm) return true;
  const haystack = [card.title, card.note, card.url, card.tags?.join(" ") ?? ""]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(searchTerm.toLowerCase());
};

const renderSpaceTabs = (state) => {
  spaceTabsEl.innerHTML = "";

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

const createCardElement = (card, sectionId, searchTerm, options = {}) => {
  const {
    spaceId = null,
    readOnly = false,
    originLabel = "",
    animateCards = true,
    originAccent = null,
  } = options;
  const cardEl = document.createElement("article");
  cardEl.className = "card";
  cardEl.dataset.cardId = card.id;
  cardEl.dataset.sectionId = sectionId;
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
    doneButton.title = card.done ? "완료 취소" : "완료 처리";
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
  editIcon.title = "편집";
  editIcon.textContent = "✎";
  floating.appendChild(editIcon);

  const favoriteIcon = document.createElement("button");
  favoriteIcon.type = "button";
  favoriteIcon.className = "card-floating-button card-favorite-button";
  favoriteIcon.dataset.cardAction = "favorite";
  favoriteIcon.title = card.favorite ? "즐겨찾기 해제" : "즐겨찾기";
  favoriteIcon.textContent = card.favorite ? "★" : "☆";
  if (card.favorite) {
    favoriteIcon.classList.add("is-active");
  }
  floating.appendChild(favoriteIcon);

  const deleteIcon = document.createElement("button");
  deleteIcon.type = "button";
  deleteIcon.className = "card-floating-button";
  deleteIcon.dataset.cardAction = "delete";
  deleteIcon.title = "삭제";
  deleteIcon.textContent = "×";
  floating.appendChild(deleteIcon);

  cardEl.appendChild(floating);

  if (originLabel) {
    const origin = document.createElement("span");
    origin.className = "card-origin";
    origin.textContent = originLabel;
    cardEl.appendChild(origin);
  }

  const title = document.createElement("p");
  title.className = "card-title";
  title.textContent = card.title;
  cardEl.appendChild(title);

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
      draggingCard = { cardId: card.id, sectionId };
      cardEl.classList.add("dragging");
      event.dataTransfer.effectAllowed = "move";
    });

    cardEl.addEventListener("dragend", () => {
      draggingCard = null;
      cardEl.classList.remove("dragging");
    });
  }

  return cardEl;
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
    { offset: Number.NEGATIVE_INFINITY, element: null }
  ).element;
};

const attachDropTargets = (cardListEl) => {
  cardListEl.addEventListener("dragover", (event) => {
    event.preventDefault();
    cardListEl.classList.add("drag-over");
    event.dataTransfer.dropEffect = draggingCard ? "move" : "copy";
  });

  cardListEl.addEventListener("dragleave", () => {
    cardListEl.classList.remove("drag-over");
  });

  cardListEl.addEventListener("drop", (event) => {
    event.preventDefault();
    cardListEl.classList.remove("drag-over");
    const tabPayload = event.dataTransfer.getData(TAB_DRAG_MIME);
    if (tabPayload) {
      try {
        const parsed = JSON.parse(tabPayload);
        addTabCardToSection(cardListEl.dataset.sectionId, parsed);
      } catch (error) {
        console.warn("드롭 데이터를 파싱할 수 없습니다.", error);
      }
      return;
    }
    if (!draggingCard) return;
    const afterElement = getDragAfterElement(cardListEl, event.clientY);
    const cards = [...cardListEl.querySelectorAll(".card:not(.dragging)")];
    let targetIndex = cards.length;
    if (afterElement) {
      targetIndex = cards.findIndex((el) => el.dataset.cardId === afterElement.dataset.cardId);
    }
    moveCard(
      draggingCard.cardId,
      draggingCard.sectionId,
      cardListEl.dataset.sectionId,
      targetIndex
    );
    suppressCardClick = true;
    setTimeout(() => {
      suppressCardClick = false;
    }, 0);
  });
};

const moveCard = (cardId, fromSectionId, toSectionId, targetIndex) => {
  updateState(
    (draft) => {
      const active = getActiveSpace(draft);
      if (!active) return;
      const fromSection = findSection(active, fromSectionId);
      const toSection = findSection(active, toSectionId);
      if (!fromSection || !toSection) return;

      const cardIndex = fromSection.cards.findIndex((card) => card.id === cardId);
      if (cardIndex === -1) return;

      const [card] = fromSection.cards.splice(cardIndex, 1);
      const normalizedIndex = Math.max(0, Math.min(targetIndex, toSection.cards.length));
      toSection.cards.splice(normalizedIndex, 0, card);
      card.updatedAt = new Date().toISOString();
    },
    { action: "move-card" }
  );
};

const renderBoard = (state, options = {}) => {
  boardEl.classList.remove("favorites-view");
  boardEl.innerHTML = "";
  const space = getActiveSpace(state);
  if (!space) {
    const placeholder = document.createElement("p");
    placeholder.textContent = "공간을 먼저 만들어 주세요.";
    boardEl.appendChild(placeholder);
    return;
  }

  const searchTerm = state.preferences.searchTerm?.trim();

  if (!space.sections.length) {
    const placeholder = document.createElement("p");
    placeholder.textContent = "보드를 추가해보세요.";
    boardEl.appendChild(placeholder);
    return;
  }

  space.sections.forEach((section) => {
    const column = document.createElement("article");
    column.className = "column";
    if (options.animateColumns === false) {
      column.classList.add("column-no-animate");
    }
    column.dataset.sectionId = section.id;

    const header = document.createElement("div");
    header.className = "column-header";

    const title = document.createElement("div");
    title.className = "column-title";
    title.contentEditable = true;
    title.dataset.sectionId = section.id;
    title.textContent = section.name;

    const metaGroup = document.createElement("div");
    metaGroup.className = "column-meta";

    const metaButton = document.createElement("button");
    metaButton.type = "button";
    metaButton.className = "column-sites";
    metaButton.dataset.sectionOpen = section.id;
    metaButton.textContent = formatCount(section.cards.length);
    metaGroup.appendChild(metaButton);

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "column-delete";
    deleteBtn.dataset.columnDelete = section.id;
    deleteBtn.title = "보드 삭제";
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
    cardList.dataset.sectionId = section.id;
    attachDropTargets(cardList);

    section.cards.forEach((card) => {
      const cardEl = createCardElement(card, section.id, searchTerm, {
        animateCards: options.animateCards,
        spaceId: space.id,
      });
      cardList.appendChild(cardEl);
    });

    const dropIndicator = document.createElement("div");
    dropIndicator.className = "section-drop-indicator";
    cardList.appendChild(dropIndicator);

    column.appendChild(cardList);

    const addCardBtn = document.createElement("button");
    addCardBtn.type = "button";
    addCardBtn.className = "add-card";
    addCardBtn.dataset.sectionId = section.id;
    addCardBtn.textContent = "+";
    addCardBtn.setAttribute("aria-label", "카드 추가");
    column.appendChild(addCardBtn);
    boardEl.appendChild(column);
  });

  if (addColumnBtn) {
    addColumnBtn.classList.add("add-column-tile");
    addColumnBtn.textContent = "+";
    addColumnBtn.setAttribute("aria-label", "보드 추가");
    addColumnBtn.style.display = "inline-flex";
    boardEl.appendChild(addColumnBtn);
  }
};

const getFavoriteGroups = (state, searchTerm) =>
  state.spaces
    .map((space) => {
      const cards = [];
      space.sections.forEach((section) => {
        section.cards.forEach((card) => {
          if (card.favorite && cardMatchesSearch(card, searchTerm)) {
            cards.push({ card, sectionId: section.id, sectionName: section.name });
          }
        });
      });
      return { space, cards };
    })
    .filter((group) => group.cards.length);

const renderFavoritesBoard = (state) => {
  boardEl.classList.add("favorites-view");
  boardEl.innerHTML = "";
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
      ? "검색어에 맞는 즐겨찾기 카드가 없습니다."
      : "즐겨찾기한 카드가 없습니다.";
    const emptyHint = document.createElement("p");
    emptyHint.className = "favorites-empty-hint";
    emptyHint.textContent = isFiltering
      ? "검색어를 바꾸거나 즐겨찾기 표시를 추가해 보세요."
      : "카드 우측 상단의 별을 눌러 즐겨찾기에 추가하세요.";
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
  heroTitle.textContent = "즐겨찾기 모음";
  const heroSubtitle = document.createElement("p");
  heroSubtitle.className = "favorites-hero-subtitle";
  heroSubtitle.textContent = "가장 중요한 카드들을 한곳에서 바로 확인하세요.";
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
    groupEl.style.setProperty("--group-accent", group.space.accent ?? "var(--accent)");

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
    count.textContent = `${group.cards.length}개`;

    header.appendChild(title);
    header.appendChild(count);
    groupEl.appendChild(header);

    const cards = document.createElement("div");
    cards.className = "favorites-card-grid";

    group.cards.forEach(({ card, sectionId, sectionName }) => {
      const cardEl = createCardElement(card, sectionId, searchTerm, {
        spaceId: group.space.id,
        readOnly: true,
        originLabel: `${group.space.name} · ${sectionName}`,
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

const openCardModal = ({ sectionId, cardId = null, spaceId = null }) => {
  const { section, card } = findCardContext(currentState, { spaceId, sectionId, cardId });
  const fallbackSpace = getActiveSpace();
  const fallbackSectionId = fallbackSpace?.sections?.[0]?.id ?? "";
  const resolvedSectionId = section?.id ?? sectionId ?? fallbackSectionId;

  if (!resolvedSectionId) {
    showSnackbar("먼저 공간을 만들어 주세요.");
    return;
  }

  cardForm.elements.sectionId.value = resolvedSectionId;
  cardForm.elements.cardId.value = cardId ?? "";

  if (cardId && card) {
    cardForm.elements.title.value = card.title;
    cardForm.elements.type.value = card.type ?? "note";
    cardForm.elements.note.value = card.note ?? "";
    cardForm.elements.tags.value = card.tags?.join(", ") ?? "";
    cardDeleteBtn.style.display = "inline-flex";
  } else {
    cardForm.reset();
    cardForm.elements.sectionId.value = resolvedSectionId;
    cardForm.elements.type.value = "note";
    cardDeleteBtn.style.display = "none";
  }

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
    spaceDeleteBtn.style.display = currentState.spaces.length > 1 ? "inline-flex" : "none";
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
  const metaAction = state.meta?.action ?? null;
  if (state.meta) {
    delete state.meta;
  }
  currentState = state;
  renderSpaceTabs(state);
  const isFavoritesView = state.preferences.viewMode === VIEW_MODES.FAVORITES;
  if (isFavoritesView) {
    renderFavoritesBoard(state);
    if (addColumnBtn) {
      addColumnBtn.style.display = "none";
    }
  } else {
    renderBoard(state, {
      animateCards: metaAction !== "move-card",
      animateColumns: metaAction !== "move-card",
    });
    if (addColumnBtn) {
      addColumnBtn.style.display = "inline-flex";
    }
  }
  if (searchInput !== document.activeElement) {
    searchInput.value = state.preferences.searchTerm ?? "";
  }
  schedulePersist(state);
  scheduleDriveSync(state);
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
        console.warn("tabs.query 실패", chrome.runtime.lastError);
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
  tabListEl.innerHTML = "";
  const filtered = openTabs.filter((tab) => {
    if (!tabFilter) return true;
    const haystack = `${tab.title} ${tab.url}`.toLowerCase();
    return haystack.includes(tabFilter.toLowerCase());
  });

  tabCountEl.textContent = filtered.length;

  filtered.forEach((tab) => {
    const item = document.createElement("div");
    item.className = "tab-item";
    item.dataset.tabId = tab.id;
    item.dataset.tabTitle = tab.title ?? "";
    item.dataset.tabUrl = tab.url ?? "";
    const iconSrc =
      tab.favIconUrl && /^https?:/i.test(tab.favIconUrl) ? tab.favIconUrl : FALLBACK_FAVICON;
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
    closeBtn.title = "탭 닫기";
    closeBtn.textContent = "×";
    item.appendChild(closeBtn);

    tabListEl.appendChild(item);
  });
};

const fetchOpenTabs = async () => {
  openTabs = await safeTabsQuery({ currentWindow: true });
  renderOpenTabs();
};

const registerTabObservers = () => {
  if (!chrome?.tabs) return;
  const update = () => fetchOpenTabs();
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
      event.addListener(update);
      cleanupTabListeners.push(() => event.removeListener(update));
    }
  });

  window.addEventListener("unload", () => {
    while (cleanupTabListeners.length) {
      const unsubscribe = cleanupTabListeners.pop();
      try {
        unsubscribe();
      } catch (error) {
        console.warn("탭 리스너 정리 중 오류", error);
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

boardEl.addEventListener("click", async (event) => {
  if (suppressCardClick) {
    suppressCardClick = false;
    return;
  }
  const cardActionEl = event.target.closest("[data-card-action]");
  if (cardActionEl) {
    const card = cardActionEl.closest(".card");
    if (card) {
      const sectionId = card.dataset.sectionId;
      const cardId = card.dataset.cardId;
      const action = cardActionEl.dataset.cardAction;
      const spaceId = card.dataset.spaceId || null;
      handleCardAction(action, sectionId, cardId, spaceId);
    }
    return;
  }

  const clickedCard = event.target.closest(".card");
  if (clickedCard && !event.target.closest("[data-card-action]")) {
    handleCardPrimaryClick(clickedCard);
    return;
  }

  const openGroupBtn = event.target.closest("[data-section-open]");
  if (openGroupBtn) {
    await openSectionLinks(openGroupBtn.dataset.sectionOpen);
    return;
  }

  const addCardBtnEl = event.target.closest(".add-card");
  if (addCardBtnEl) {
    openCardModal({ sectionId: addCardBtnEl.dataset.sectionId });
    return;
  }

  const deleteColumnEl = event.target.closest("[data-column-delete]");
  if (deleteColumnEl) {
    const sectionId = deleteColumnEl.dataset.columnDelete;
    const confirmed = await openConfirm("선택한 보드를 삭제할까요? 포함된 카드도 함께 삭제됩니다.");
    if (!confirmed) {
      return;
    }
    updateState((draft) => {
      const active = getActiveSpace(draft);
      if (!active) return;
      active.sections = active.sections.filter((section) => section.id !== sectionId);
    });
    showSnackbar("보드를 삭제했습니다.");
    return;
  }
});

boardEl.addEventListener("focusout", (event) => {
  if (event.target.classList?.contains("column-title")) {
    const sectionId = event.target.dataset.sectionId;
    const newName = event.target.textContent.trim() || "이름 없는 보드";
    event.target.textContent = newName;
    updateState((draft) => {
      const active = getActiveSpace(draft);
      if (!active) return;
      const section = findSection(active, sectionId);
      if (section) section.name = newName;
    });
  }
});

boardEl.addEventListener("keydown", (event) => {
  if (event.target.classList?.contains("column-title") && event.key === "Enter") {
    event.preventDefault();
    event.target.blur();
  }
});

const handleCardAction = (action, sectionId, cardId, spaceId = null) => {
  const { card } = findCardContext(currentState, { spaceId, sectionId, cardId });
  if (!card) return;

  switch (action) {
    case "favorite":
      updateState((draft) => {
        const { card: target } = findCardContext(draft, { spaceId, sectionId, cardId });
        if (target) {
          target.favorite = !target.favorite;
        }
      });
      break;
    case "toggle-done":
      updateState((draft) => {
        const { card: target } = findCardContext(draft, { spaceId, sectionId, cardId });
        if (target) {
          target.done = !target.done;
        }
      });
      break;
    case "edit":
      openCardModal({ sectionId, cardId, spaceId });
      break;
    case "delete":
      updateState((draft) => {
        const { section } = findCardContext(draft, { spaceId, sectionId, cardId });
        if (!section) return;
        section.cards = section.cards.filter((item) => item.id !== cardId);
      });
      showSnackbar("카드를 삭제했습니다.");
      break;
    default:
      break;
  }
};

const handleCardPrimaryClick = (cardElement) => {
  const sectionId = cardElement.dataset.sectionId;
  const cardId = cardElement.dataset.cardId;
  const spaceId = cardElement.dataset.spaceId || null;
  const { card } = findCardContext(currentState, { spaceId, sectionId, cardId });
  if (!card) return;
  if (card.type === "link" && card.url) {
    window.open(card.url, "_blank");
  }
};

const addTabCardToSection = (sectionId, tabPayload) => {
  if (!sectionId || !tabPayload?.url) return;
  updateState((draft) => {
    const active = getActiveSpace(draft);
    const section = findSection(active, sectionId);
    if (!section) return;
    section.cards.unshift({
      id: generateId("card"),
      type: "link",
      title: tabPayload.title?.trim() || tabPayload.url,
      note: "",
      url: tabPayload.url,
      tags: [],
      favorite: false,
      done: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  });
  showSnackbar("탭을 카드로 추가했습니다.");
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

const openSectionLinks = async (sectionId) => {
  const active = getActiveSpace();
  if (!active) return;
  const section = findSection(active, sectionId);
  if (!section) return;
  const links = section.cards.filter((card) => card.url);
  if (!links.length) {
    showSnackbar("열 수 있는 링크 카드가 없습니다.");
    return;
  }
  if (
    !chrome?.tabs?.create ||
    !chrome?.tabs?.group ||
    !chrome?.tabGroups?.update ||
    !chrome?.windows?.getCurrent
  ) {
    links.forEach((card) => window.open(card.url, "_blank"));
    showSnackbar("브라우저가 탭 그룹 기능을 지원하지 않아 새 탭으로 열었습니다.");
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
      showSnackbar("새 탭을 열 수 없었습니다.");
      return;
    }
    const groupId = await chromeTabsGroup(tabIds);
    await chromeTabGroupsUpdate(groupId, { title: section.name });
    chrome.tabs.update(tabIds[0], { active: true });
    showSnackbar(`${links.length}개의 링크를 현재 창에서 그룹으로 열었습니다.`);
  } catch (error) {
    console.error("Failed to open section links as group", error);
    links.forEach((card) => window.open(card.url, "_blank"));
    showSnackbar("탭 그룹 생성에 실패하여 새 탭으로 열었습니다.");
  }
};

addColumnBtn?.addEventListener("click", () => {
  if (currentState?.preferences.viewMode === VIEW_MODES.FAVORITES) {
    showSnackbar("즐겨찾기 모드에서는 보드를 추가할 수 없습니다.");
    return;
  }
  updateState((draft) => {
    const active = getActiveSpace(draft);
    if (!active) return;
    active.sections.push({ id: generateId("section"), name: "새 보드", cards: [] });
  });
  showSnackbar("보드를 추가했습니다.");
});

cardForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const formData = new FormData(cardForm);
  const cardId = formData.get("cardId");
  const sectionId = formData.get("sectionId");
  const existingContext = findCardContext(currentState, { sectionId, cardId });
  const existingUrl = cardId
    ? (() => {
        const card = existingContext.card;
        return card?.url ?? "";
      })()
    : "";
  const resolvedSectionId =
    sectionId || existingContext.section?.id || getActiveSpace()?.sections?.[0]?.id || "";
  const targetSpaceId = existingContext.space?.id ?? getActiveSpace()?.id ?? null;

  const payload = {
    title: formData.get("title")?.toString().trim(),
    type: formData.get("type"),
    note: formData.get("note")?.toString() ?? "",
    url: existingUrl,
    tags:
      formData
        .get("tags")
        ?.toString()
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean) ?? [],
  };

  if (!payload.title || !resolvedSectionId) {
    showSnackbar("카드 정보를 다시 확인해 주세요.");
    return;
  }

  if (cardId) {
    updateState((draft) => {
      const { card } = findCardContext(draft, {
        spaceId: targetSpaceId,
        sectionId: resolvedSectionId,
        cardId,
      });
      if (card) {
        Object.assign(card, payload);
        card.updatedAt = new Date().toISOString();
      }
    });
    showSnackbar("카드를 수정했습니다.");
  } else {
    updateState((draft) => {
      const { section } = findCardContext(draft, {
        spaceId: targetSpaceId,
        sectionId: resolvedSectionId,
      });
      if (section) {
        section.cards.unshift({
          id: generateId("card"),
          favorite: false,
          done: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          ...payload,
        });
      }
    });
    showSnackbar("카드를 추가했습니다.");
  }

  closeModal(cardModalEl);
});

cardDeleteBtn.addEventListener("click", () => {
  const cardId = cardForm.elements.cardId.value;
  const sectionId = cardForm.elements.sectionId.value;
  if (!cardId || !sectionId) return;
  const targetSpaceId = findCardContext(currentState, { sectionId, cardId }).space?.id ?? null;
  updateState((draft) => {
    const { section } = findCardContext(draft, { spaceId: targetSpaceId, sectionId, cardId });
    if (section) {
      section.cards = section.cards.filter((card) => card.id !== cardId);
    }
  });
  closeModal(cardModalEl);
  showSnackbar("카드를 삭제했습니다.");
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
    showSnackbar("공간을 수정했습니다.");
  } else {
    const newSpaceId = generateId("space");
    updateState((draft) => {
      draft.spaces.push({ id: newSpaceId, name, accent: "#2563eb", sections: [] });
      draft.preferences.activeSpaceId = newSpaceId;
    });
    showSnackbar("새 공간을 만들었습니다.");
  }

  closeModal(spaceModalEl);
});

spaceDeleteBtn.addEventListener("click", () => {
  const spaceId = spaceForm.elements.spaceId.value;
  if (!spaceId || !currentState) return;
  if (currentState.spaces.length <= 1) {
    showSnackbar("최소 한 개의 공간이 필요합니다.");
    return;
  }
  updateState((draft) => {
    draft.spaces = draft.spaces.filter((space) => space.id !== spaceId);
    if (draft.preferences.activeSpaceId === spaceId) {
      draft.preferences.activeSpaceId = draft.spaces[0]?.id ?? null;
    }
  });
  closeModal(spaceModalEl);
  showSnackbar("공간을 삭제했습니다.");
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
        const remoteState = await pullFromDrive();
        if (remoteState) {
          replaceState(remoteState);
        }
        hasPulledDriveState = true;
      } catch (error) {
        console.error("Failed to pull Drive data", error);
        showSnackbar("Drive 데이터 불러오기 실패: " + error.message);
      }
    }
    showSnackbar("Google Drive와 연결되었습니다.");
    scheduleDriveSync(getState(), true);
  } catch (error) {
    showSnackbar("Drive 연결 실패: " + error.message);
  }
});

driveMenuSyncBtn?.addEventListener("click", async (event) => {
  event.preventDefault();
  event.stopPropagation();
  if (getDriveSnapshot().status !== "connected") return;
  showSnackbar("Google Drive 수동 동기화 중...");
  try {
    await runDriveSync();
    showSnackbar("Drive와 수동 동기화를 완료했습니다.");
  } catch (error) {
    showSnackbar("Drive 동기화 실패: " + error.message);
  }
});

driveMenuDisconnectBtn?.addEventListener("click", async (event) => {
  event.stopPropagation();
  await disconnectDrive();
  stopDriveBackgroundSync();
  hasPulledDriveState = false;
  showSnackbar("Google Drive 연결 해제됨.");
});

tabFilterInput.addEventListener("input", (event) => {
  tabFilter = event.target.value.trim();
  renderOpenTabs();
});

searchInput.addEventListener("input", (event) => {
  const value = event.target.value;
  updateState((draft) => {
    draft.preferences.searchTerm = value;
  });
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
