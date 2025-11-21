const clone = (value) => {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
};

const sampleCards = () => [
  {
    id: generateId("card"),
    type: "todo",
    title: "Daily planning",
    note: "우선순위 정리하고 집중 구간 설정",
    done: false,
    tags: ["focus"],
    color: "#6366f1",
    favorite: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: generateId("card"),
    type: "note",
    title: "빠른 메모",
    note: "회의에서 나온 아이디어 정리",
    tags: ["notes"],
    favorite: false,
    color: "#f472b6",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

export const generateId = (prefix = "item") =>
  `${prefix}-${Math.random().toString(36).slice(2, 9)}`;

export const createDefaultState = () => {
  const focusSpaceId = generateId("space");
  const personalSpaceId = generateId("space");
  const createDefaultSections = () => [
    {
      id: generateId("section"),
      name: "오늘 할 일",
      cards: sampleCards(),
    },
    {
      id: generateId("section"),
      name: "링크 & 자료",
      cards: [],
    },
    {
      id: generateId("section"),
      name: "아이디어",
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
        accent: "#6366f1",
        sections: focusSections,
      },
      {
        id: personalSpaceId,
        name: "Personal",
        accent: "#f97316",
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
  const activeSpace = next.spaces.find((space) => space.id === next.preferences.activeSpaceId);
  if (!next.preferences.captureSectionId) {
    next.preferences.captureSectionId =
      activeSpace?.sections?.[0]?.id ?? next.spaces[0]?.sections?.[0]?.id ?? null;
  } else if (activeSpace) {
    const exists = activeSpace.sections.some(
      (section) => section.id === next.preferences.captureSectionId
    );
    if (!exists) {
      next.preferences.captureSectionId = activeSpace.sections[0]?.id ?? null;
    }
  }
  next.spaces = next.spaces.map((space) => ({
    id: space.id ?? generateId("space"),
    name: space.name ?? "Untitled",
    accent: space.accent ?? "#6366f1",
    sections: Array.isArray(space.sections)
      ? space.sections.map((section) => ({
          id: section.id ?? generateId("section"),
          name: section.name ?? "새 섹션",
          cards: Array.isArray(section.cards)
            ? section.cards.map((card) => ({
                id: card.id ?? generateId("card"),
                type: card.type ?? "link",
                title: card.title ?? "제목 없음",
                note: card.note ?? "",
                url: card.url ?? "",
                tags: Array.isArray(card.tags) ? card.tags : [],
                color: card.color ?? "#475569",
                favorite: Boolean(card.favorite),
                done: Boolean(card.done),
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

export const replaceState = (nextState) => {
  appState = normalizeState(nextState);
  appState.lastUpdated = new Date().toISOString();
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
