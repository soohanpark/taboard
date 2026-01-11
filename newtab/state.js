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
  const createDefaultSections = () => [
    {
      id: generateId("section"),
      name: "Today's tasks",
      cards: sampleCards(),
    },
    {
      id: generateId("section"),
      name: "Links & resources",
      cards: [],
    },
    {
      id: generateId("section"),
      name: "Ideas",
      cards: [],
    },
  ];
  const focusSections = createDefaultSections();
  const personalSections = createDefaultSections();

  return {
    version: 1,
    spaces: [
      {
        id: focusSpaceId,
        name: "Focus",
        accent: getRandomAccent(),
        sections: focusSections,
      },
      {
        id: personalSpaceId,
        name: "Personal",
        accent: getRandomAccent(),
        sections: personalSections,
      },
    ],
    preferences: {
      activeSpaceId: focusSpaceId,
      searchTerm: "",
      captureSectionId: focusSections[0].id,
      viewMode: "spaces",
    },
    lastUpdated: new Date().toISOString(),
  };
};

let appState = createDefaultState();
const listeners = new Set();

const normalizeState = (state) => {
  const next = clone(state);
  next.version = next.version ?? 1;
  next.spaces = Array.isArray(next.spaces) ? next.spaces : [];
  if (!next.preferences) {
    next.preferences = {
      activeSpaceId: next.spaces[0]?.id ?? null,
      searchTerm: "",
      captureSectionId: next.spaces[0]?.sections?.[0]?.id ?? null,
      viewMode: "spaces",
    };
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
  if (!next.preferences.captureSectionId) {
    next.preferences.captureSectionId =
      activeSpace?.sections?.[0]?.id ??
      next.spaces[0]?.sections?.[0]?.id ??
      null;
  } else if (activeSpace) {
    const exists = activeSpace.sections.some(
      (section) => section.id === next.preferences.captureSectionId,
    );
    if (!exists) {
      next.preferences.captureSectionId = activeSpace.sections[0]?.id ?? null;
    }
  }
  next.spaces = next.spaces.map((space) => ({
    id: space.id ?? generateId("space"),
    name: space.name ?? "Untitled",
    accent: space.accent ?? getRandomAccent(),
    sections: Array.isArray(space.sections)
      ? space.sections.map((section) => ({
          id: section.id ?? generateId("section"),
          name: section.name ?? "New section",
          cards: Array.isArray(section.cards)
            ? section.cards.map((card) => ({
                id: card.id ?? generateId("card"),
                type: card.type ?? "link",
                title: card.title ?? "Untitled",
                note: card.note ?? "",
                url: card.url ?? "",
                tags: Array.isArray(card.tags) ? card.tags : [],
                color: card.color ?? "#475569",
                favorite: Boolean(card.favorite),
                done: Boolean(card.done),
                favicon: typeof card.favicon === "string" ? card.favicon : "",
                createdAt: card.createdAt ?? new Date().toISOString(),
                updatedAt: card.updatedAt ?? new Date().toISOString(),
              }))
            : [],
        }))
      : [],
  }));
  next.lastUpdated = next.lastUpdated ?? new Date().toISOString();
  return next;
};

const notify = () => {
  for (const listener of listeners) {
    listener(clone(appState));
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
  appState = normalizeState(draft);
  notify();
};
