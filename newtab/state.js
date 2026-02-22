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
  const createDefaultBoards = () => [
    {
      id: generateId("board"),
      name: "Today's tasks",
      cards: sampleCards(),
    },
    {
      id: generateId("board"),
      name: "Links & resources",
      cards: [],
    },
    {
      id: generateId("board"),
      name: "Ideas",
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
        boards: focusBoards,
      },
      {
        id: personalSpaceId,
        name: "Personal",
        accent: getRandomAccent(),
        boards: personalBoards,
      },
    ],
    preferences: {
      activeSpaceId: focusSpaceId,
      searchTerm: "",
      captureBoardId: focusBoards[0].id,
      viewMode: "spaces",
    },
    lastUpdated: new Date().toISOString(),
  };
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
        boards: Array.isArray(space.boards)
          ? space.boards
              .filter((board) => board && typeof board === "object")
              .map((board) => ({
                id: board.id ?? generateId("board"),
                name: board.name ?? "New board",
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
