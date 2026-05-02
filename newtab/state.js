const clone = (value) => {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
};

const sampleCards = () => [
  {
    id: generateId("card"),
    type: "link",
    title: "Reading list",
    note: "Open everything at once with the board header's sites button",
    url: "https://example.com/productivity",
    tags: ["links", "reading"],
    color: "#2563eb",
    favorite: true,
    done: false,
    favicon: "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: generateId("card"),
    type: "todo",
    title: "Focus tasks for today",
    note: "Jump straight to the search bar with ⌘/Ctrl + K",
    done: false,
    tags: ["focus"],
    color: "#6366f1",
    favorite: false,
    favicon: "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: generateId("card"),
    type: "note",
    title: "Favorites test",
    note: "Press the star to see it in the ★ tab",
    tags: ["tips"],
    favorite: true,
    color: "#f472b6",
    done: false,
    favicon: "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

/**
 * Generates a 7-char base-36 ID with optional prefix.
 * Collision probability: ~1/78 billion for 2 IDs, safe for extension usage (<10k IDs).
 */
export const generateId = (prefix = "item") =>
  `${prefix}-${Math.random().toString(36).slice(2, 9)}`;

const ACCENT_PALETTE = [
  "#2563eb",
  "#6366f1",
  "#f97316",
  "#10b981",
  "#a855f7",
  "#0ea5e9",
  "#dc2626",
  "#f59e0b",
  "#14b8a6",
  "#ec4899",
];

export const getRandomAccent = () => {
  const index = Math.floor(Math.random() * ACCENT_PALETTE.length);
  return ACCENT_PALETTE[index];
};

export const createDefaultState = () => {
  const focusSpaceId = generateId("space");
  const personalSpaceId = generateId("space");
  const now = new Date().toISOString();
  const createDefaultBoards = () => [
    {
      id: generateId("board"),
      name: "Today's tasks",
      createdAt: now,
      updatedAt: now,
      cards: sampleCards(),
    },
    {
      id: generateId("board"),
      name: "Links & resources",
      createdAt: now,
      updatedAt: now,
      cards: [],
    },
    {
      id: generateId("board"),
      name: "Ideas",
      createdAt: now,
      updatedAt: now,
      cards: [],
    },
  ];
  const focusBoards = createDefaultBoards();
  const personalBoards = createDefaultBoards();

  return {
    version: 1,
    spaces: [
      {
        id: focusSpaceId,
        name: "Focus",
        accent: getRandomAccent(),
        createdAt: now,
        updatedAt: now,
        boards: focusBoards,
      },
      {
        id: personalSpaceId,
        name: "Personal",
        accent: getRandomAccent(),
        createdAt: now,
        updatedAt: now,
        boards: personalBoards,
      },
    ],
    preferences: {
      activeSpaceId: focusSpaceId,
      searchTerm: "",
      captureBoardId: focusBoards[0].id,
      viewMode: "spaces",
      tabDrawerPinned: false,
      lastSyncAt: null,
    },
    lastUpdated: new Date().toISOString(),
  };
};

const PREFERENCE_DEFAULTS = {
  searchTerm: "",
  viewMode: "spaces",
  tabDrawerPinned: false,
  lastSyncAt: null,
};

let appState = createDefaultState();
const listeners = new Set();

const normalizeState = (state) => {
  // Guard against null/undefined/non-object state
  if (!state || typeof state !== "object") {
    return createDefaultState();
  }
  const next = clone(state);
  next.version = next.version ?? 1;

  // Guard: ensure spaces is an array
  if (!Array.isArray(next.spaces)) {
    next.spaces = [];
  }

  if (!next.preferences) {
    next.preferences = {
      activeSpaceId: next.spaces[0]?.id ?? null,
      searchTerm: "",
      captureBoardId:
        next.spaces[0]?.boards?.[0]?.id ??
        next.spaces[0]?.sections?.[0]?.id ??
        null,
      viewMode: "spaces",
    };
  }
  if (next.preferences.captureSectionId && !next.preferences.captureBoardId) {
    next.preferences.captureBoardId = next.preferences.captureSectionId;
    delete next.preferences.captureSectionId;
  }
  if (!next.preferences.activeSpaceId && next.spaces[0]) {
    next.preferences.activeSpaceId = next.spaces[0].id;
  }
  next.preferences.searchTerm = next.preferences.searchTerm ?? "";
  next.preferences.activeBoardId = next.preferences.activeBoardId ?? null;
  next.preferences.tabDrawerPinned = Boolean(
    next.preferences.tabDrawerPinned ?? PREFERENCE_DEFAULTS.tabDrawerPinned,
  );
  next.preferences.lastSyncAt =
    typeof next.preferences.lastSyncAt === "number"
      ? next.preferences.lastSyncAt
      : null;
  if (next.preferences.viewMode !== "favorites") {
    next.preferences.viewMode = "spaces";
  }
  const activeSpace = next.spaces.find(
    (space) => space.id === next.preferences.activeSpaceId,
  );
  if (!next.preferences.captureBoardId) {
    next.preferences.captureBoardId =
      activeSpace?.boards?.[0]?.id ??
      activeSpace?.sections?.[0]?.id ??
      next.spaces[0]?.boards?.[0]?.id ??
      next.spaces[0]?.sections?.[0]?.id ??
      null;
  } else if (activeSpace) {
    const exists = activeSpace.boards?.some(
      (board) => board.id === next.preferences.captureBoardId,
    );
    if (!exists) {
      next.preferences.captureBoardId = activeSpace.boards?.[0]?.id ?? null;
    }
  }

  // Guard: normalize spaces with null/type checks
  next.spaces = next.spaces
    .filter((space) => space && typeof space === "object")
    .map((space) => {
      if (!space.boards && space.sections) {
        space.boards = space.sections;
        delete space.sections;
      }

      return {
        id: space.id ?? generateId("space"),
        name: space.name ?? "Untitled",
        accent: space.accent ?? getRandomAccent(),
        createdAt: space.createdAt ?? new Date().toISOString(),
        updatedAt: space.updatedAt ?? new Date().toISOString(),
        boards: Array.isArray(space.boards)
          ? space.boards
              .filter((board) => board && typeof board === "object")
              .map((board) => ({
                id: board.id ?? generateId("board"),
                name: board.name ?? "New board",
                createdAt: board.createdAt ?? new Date().toISOString(),
                updatedAt: board.updatedAt ?? new Date().toISOString(),
                cards: Array.isArray(board.cards)
                  ? board.cards
                      .filter((card) => card && typeof card === "object")
                      .map((card) => ({
                        id: card.id ?? generateId("card"),
                        type: card.type ?? "link",
                        title: card.title ?? "Untitled",
                        note: card.note ?? "",
                        url: card.url ?? "",
                        tags: Array.isArray(card.tags) ? card.tags : [],
                        color: card.color ?? "#475569",
                        favorite: Boolean(card.favorite),
                        done: Boolean(card.done),
                        favicon:
                          typeof card.favicon === "string" ? card.favicon : "",
                        createdAt: card.createdAt ?? new Date().toISOString(),
                        updatedAt: card.updatedAt ?? new Date().toISOString(),
                      }))
                  : [],
              }))
          : [],
      };
    });

  // Ensure activeBoardId is valid for the active space
  const normalizedActiveSpace = next.spaces.find(
    (s) => s.id === next.preferences.activeSpaceId,
  );
  if (next.preferences.activeBoardId && normalizedActiveSpace) {
    const boardExists = normalizedActiveSpace.boards.some(
      (b) => b.id === next.preferences.activeBoardId,
    );
    if (!boardExists) {
      next.preferences.activeBoardId =
        normalizedActiveSpace.boards[0]?.id ?? null;
    }
  } else if (
    !next.preferences.activeBoardId &&
    normalizedActiveSpace?.boards?.length
  ) {
    next.preferences.activeBoardId =
      normalizedActiveSpace.boards[0]?.id ?? null;
  }

  next.lastUpdated = next.lastUpdated ?? new Date().toISOString();
  return next;
};

const notify = () => {
  const snapshot = Object.freeze({ ...appState });
  for (const listener of listeners) {
    listener(snapshot);
  }
};

export const initState = (initial) => {
  appState = normalizeState(initial ?? createDefaultState());
  notify();
};

export const replaceState = (nextState, { preserveTimestamp = false } = {}) => {
  appState = normalizeState(nextState);
  if (!preserveTimestamp) {
    appState.lastUpdated = new Date().toISOString();
  }
  notify();
};

export const getState = () => clone(appState);

export const subscribe = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const updateState = (mutator, meta = {}) => {
  const draft = clone(appState);
  mutator(draft);
  draft.lastUpdated = new Date().toISOString();
  draft.meta = { ...(draft.meta ?? {}), ...meta };
  appState = draft;
  notify();
  delete appState.meta;
};

export const softDeleteCard = (state, cardId) => {
  const snapshot = clone(state);
  const next = clone(state);
  let removed = false;
  let deleted = null;
  for (const space of next.spaces ?? []) {
    for (const board of space.boards ?? []) {
      const idx = (board.cards ?? []).findIndex((card) => card.id === cardId);
      if (idx !== -1) {
        const card = board.cards[idx];
        deleted = {
          type: "card",
          card: clone(card),
          cardId: card.id,
          cardIndex: idx,
          boardId: board.id,
          spaceId: space.id,
        };
        board.cards.splice(idx, 1);
        removed = true;
        break;
      }
    }
    if (removed) break;
  }
  return { nextState: next, snapshot, removed, deleted };
};

export const softDeleteBoard = (state, boardId) => {
  const snapshot = clone(state);
  const next = clone(state);
  let removed = false;
  let deleted = null;
  for (const space of next.spaces ?? []) {
    const idx = (space.boards ?? []).findIndex((board) => board.id === boardId);
    if (idx !== -1) {
      const board = space.boards[idx];
      deleted = {
        type: "board",
        board: clone(board),
        boardId: board.id,
        boardIndex: idx,
        spaceId: space.id,
        wasActiveBoard: next.preferences?.activeBoardId === boardId,
        activeBoardIdBefore: snapshot.preferences?.activeBoardId ?? null,
        activeBoardIdAfter: null,
      };
      space.boards.splice(idx, 1);
      removed = true;
      if (next.preferences?.activeBoardId === boardId) {
        next.preferences.activeBoardId =
          space.boards[idx]?.id ?? space.boards[idx - 1]?.id ?? null;
      }
      deleted.activeBoardIdAfter = next.preferences?.activeBoardId ?? null;
      break;
    }
  }
  return { nextState: next, snapshot, removed, deleted };
};

export const softDeleteSpace = (state, spaceId) => {
  const snapshot = clone(state);
  const next = clone(state);
  const idx = (next.spaces ?? []).findIndex((space) => space.id === spaceId);
  let removed = false;
  let deleted = null;
  if (idx !== -1) {
    const space = next.spaces[idx];
    deleted = {
      type: "space",
      space: clone(space),
      spaceId: space.id,
      spaceIndex: idx,
      wasActiveSpace: next.preferences?.activeSpaceId === spaceId,
      activeSpaceIdBefore: snapshot.preferences?.activeSpaceId ?? null,
      activeBoardIdBefore: snapshot.preferences?.activeBoardId ?? null,
      activeSpaceIdAfter: null,
      activeBoardIdAfter: null,
    };
    next.spaces.splice(idx, 1);
    removed = true;
    if (next.preferences?.activeSpaceId === spaceId) {
      next.preferences.activeSpaceId = next.spaces[0]?.id ?? null;
      next.preferences.activeBoardId = next.spaces[0]?.boards?.[0]?.id ?? null;
    }
    deleted.activeSpaceIdAfter = next.preferences?.activeSpaceId ?? null;
    deleted.activeBoardIdAfter = next.preferences?.activeBoardId ?? null;
  }
  return { nextState: next, snapshot, removed, deleted };
};

const getDeletion = (payload, type) => {
  const deletion = payload?.deleted ?? payload;
  return deletion?.type === type ? deletion : null;
};

const boundedInsertIndex = (index, length) => {
  const fallback = Number.isInteger(index) ? index : length;
  return Math.max(0, Math.min(fallback, length));
};

const boardContainsCard = (board, cardId) =>
  (board?.cards ?? []).some((card) => card.id === cardId);

const spaceContainsBoard = (space, boardId) =>
  (space?.boards ?? []).some((board) => board.id === boardId);

export const restoreDeletedCard = (state, payload) => {
  const deletion = getDeletion(payload, "card");
  const card = deletion?.card ? clone(deletion.card) : null;
  if (!state || !card || !deletion.boardId) return clone(state);

  const next = clone(state);
  const space =
    (next.spaces ?? []).find((item) => item.id === deletion.spaceId) ??
    (next.spaces ?? []).find((item) =>
      spaceContainsBoard(item, deletion.boardId),
    );
  const board = space?.boards?.find((item) => item.id === deletion.boardId);
  if (!board) return next;
  if (!Array.isArray(board.cards)) board.cards = [];
  if (boardContainsCard(board, card.id)) return next;

  const index = boundedInsertIndex(deletion.cardIndex, board.cards.length);
  board.cards.splice(index, 0, card);
  return next;
};

export const restoreDeletedBoard = (state, payload) => {
  const deletion = getDeletion(payload, "board");
  const board = deletion?.board ? clone(deletion.board) : null;
  if (!state || !board || !deletion.spaceId) return clone(state);

  const next = clone(state);
  const space = (next.spaces ?? []).find(
    (item) => item.id === deletion.spaceId,
  );
  if (!space) return next;
  if (!Array.isArray(space.boards)) space.boards = [];
  if (spaceContainsBoard(space, board.id)) return next;

  const index = boundedInsertIndex(deletion.boardIndex, space.boards.length);
  space.boards.splice(index, 0, board);

  if (
    deletion.wasActiveBoard &&
    next.preferences?.activeSpaceId === deletion.spaceId &&
    next.preferences?.activeBoardId === deletion.activeBoardIdAfter
  ) {
    next.preferences.activeBoardId = deletion.activeBoardIdBefore ?? board.id;
  }

  return next;
};

export const restoreDeletedSpace = (state, payload) => {
  const deletion = getDeletion(payload, "space");
  const space = deletion?.space ? clone(deletion.space) : null;
  if (!state || !space) return clone(state);

  const next = clone(state);
  if (!Array.isArray(next.spaces)) next.spaces = [];
  if (next.spaces.some((item) => item.id === space.id)) return next;

  const index = boundedInsertIndex(deletion.spaceIndex, next.spaces.length);
  next.spaces.splice(index, 0, space);

  if (
    deletion.wasActiveSpace &&
    next.preferences?.activeSpaceId === deletion.activeSpaceIdAfter &&
    next.preferences?.activeBoardId === deletion.activeBoardIdAfter
  ) {
    const restoredBoardExists = spaceContainsBoard(
      space,
      deletion.activeBoardIdBefore,
    );
    next.preferences.activeSpaceId = deletion.activeSpaceIdBefore ?? space.id;
    next.preferences.activeBoardId = restoredBoardExists
      ? deletion.activeBoardIdBefore
      : (space.boards?.[0]?.id ?? null);
  }

  return next;
};

const matchCardForCount = (card, term) => {
  if (!term) return true;
  if (term.startsWith("#")) {
    const tag = term.slice(1).trim().toLowerCase();
    if (!tag) return true;
    return (card.tags ?? []).some((t) => t.toLowerCase().includes(tag));
  }
  const haystack = [card.title, card.note, card.url, card.tags?.join(" ") ?? ""]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(term.toLowerCase());
};

export const countMatchesAcrossSpaces = (state, term) => {
  const trimmed = (term ?? "").trim();
  const result = { perBoard: {}, perSpace: {}, total: 0 };
  if (!state?.spaces?.length) return result;
  for (const space of state.spaces) {
    let spaceTotal = 0;
    for (const board of space.boards ?? []) {
      const matches = (board.cards ?? []).filter((card) =>
        matchCardForCount(card, trimmed),
      ).length;
      result.perBoard[board.id] = {
        match: matches,
        total: (board.cards ?? []).length,
        spaceId: space.id,
        boardName: board.name,
      };
      spaceTotal += matches;
    }
    result.perSpace[space.id] = spaceTotal;
    result.total += spaceTotal;
  }
  return result;
};
