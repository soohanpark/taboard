const timestamp = "2026-07-06T08:00:00.000Z";

const card = (id, type, title, options = {}) => ({
  id,
  type,
  title,
  note: options.note ?? "",
  url: options.url ?? "",
  tags: options.tags ?? [],
  color: options.color ?? "#2F6BFF",
  favorite: Boolean(options.favorite),
  done: Boolean(options.done),
  favicon: "",
  createdAt: timestamp,
  updatedAt: timestamp,
});

const board = (id, name, cards) => ({
  id,
  name,
  cards,
  createdAt: timestamp,
  updatedAt: timestamp,
});

const focusBoards = [
  board("board-research", "Research queue", [
    card("card-chrome-docs", "link", "Chrome extension design guidelines", {
      note: "Review store listing and icon requirements",
      url: "https://developer.chrome.com/docs/webstore/best-listing",
      tags: ["research", "chrome"],
      favorite: true,
    }),
    card("card-design-systems", "link", "Design systems field notes", {
      note: "Patterns for clear, scalable interfaces",
      url: "https://web.dev/learn/design",
      tags: ["research", "design"],
    }),
    card("card-reading-note", "note", "Research synthesis", {
      note: "Group findings by impact, effort, and confidence.",
      tags: ["research"],
      color: "#7C3AED",
    }),
  ]),
  board("board-today", "Today", [
    card("card-review", "todo", "Review launch checklist", {
      note: "Confirm copy, screenshots, and privacy fields",
      tags: ["launch"],
      color: "#0EA5E9",
    }),
    card("card-cleanup", "todo", "Close completed research tabs", {
      tags: ["focus"],
      color: "#10B981",
      done: true,
    }),
    card("card-decisions", "note", "Decision log", {
      note: "Keep the product local-first and the interface lightweight.",
      tags: ["product"],
      color: "#F97316",
      favorite: true,
    }),
  ]),
  board("board-ideas", "Ideas", [
    card("card-command-center", "note", "A calmer browser command center", {
      note: "Open tabs on the left, durable knowledge on the right.",
      tags: ["idea"],
      color: "#EC4899",
    }),
  ]),
];

const personalBoards = [
  board("board-weekend", "Weekend", [
    card("card-trail", "link", "Trail ideas for Saturday", {
      url: "https://example.com/trails",
      tags: ["personal"],
      color: "#10B981",
    }),
    card("card-groceries", "todo", "Pick up coffee and fruit", {
      tags: ["errands"],
      color: "#F59E0B",
    }),
  ]),
  board("board-reading", "Reading", [
    card("card-reading", "note", "Books to revisit", {
      note: "Keep short notes beside every saved link.",
      tags: ["reading"],
      color: "#6366F1",
    }),
  ]),
];

const makeState = ({
  activeBoardId = "board-research",
  tabDrawerPinned = false,
  searchTerm = "",
  lastSyncAt = null,
} = {}) => ({
  version: 1,
  spaces: [
    {
      id: "space-focus",
      name: "Focus",
      accent: "#2F6BFF",
      boards: structuredClone(focusBoards),
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: "space-personal",
      name: "Personal",
      accent: "#10B981",
      boards: structuredClone(personalBoards),
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  ],
  preferences: {
    activeSpaceId: "space-focus",
    activeBoardId,
    captureBoardId: "board-research",
    searchTerm,
    viewMode: "spaces",
    tabDrawerPinned,
    lastSyncAt,
  },
  lastUpdated: timestamp,
});

const tabs = [
  {
    id: 101,
    title: "Chrome Web Store listing guidelines",
    url: "https://developer.chrome.com/docs/webstore/best-listing",
    favIconUrl: "",
  },
  {
    id: 102,
    title: "Designing productive workspaces",
    url: "https://web.dev/learn/design",
    favIconUrl: "",
  },
  {
    id: 103,
    title: "Taboard — GitHub",
    url: "https://github.com/soohanpark/taboard",
    favIconUrl: "",
  },
  {
    id: 104,
    title: "Weekly product notes",
    url: "https://example.com/product-notes",
    favIconUrl: "",
  },
  {
    id: 105,
    title: "Research backlog",
    url: "https://example.com/research",
    favIconUrl: "",
  },
];

export const captureScenarios = [
  {
    id: "overview",
    filename: "01-overview.png",
    headline: "Your new tab, under control.",
    supportingCopy: "Open tabs and personal boards, side by side.",
    state: makeState(),
    tabs: structuredClone(tabs),
    afterRender: null,
  },
  {
    id: "save-tabs",
    filename: "02-save-tabs.png",
    headline: "Turn open tabs into useful cards.",
    supportingCopy: "Keep the links worth returning to.",
    state: makeState({ tabDrawerPinned: true }),
    tabs: structuredClone(tabs),
    afterRender: null,
  },
  {
    id: "card-types",
    filename: "03-card-types.png",
    headline: "Organize links, notes, and todos.",
    supportingCopy: "One focused board for every kind of thought.",
    state: makeState({ activeBoardId: "board-today" }),
    tabs: structuredClone(tabs),
    afterRender: null,
  },
  {
    id: "search",
    filename: "04-search.png",
    headline: "Find anything across every space.",
    supportingCopy: "Search cards without losing your place.",
    state: makeState({ searchTerm: "research" }),
    tabs: structuredClone(tabs),
    afterRender: null,
  },
  {
    id: "local-first-sync",
    filename: "05-local-first-sync.png",
    headline: "Local first. Backed up when you choose.",
    supportingCopy: "Optional Google Drive sync keeps you in control.",
    state: makeState({ lastSyncAt: 1783324800000 }),
    tabs: structuredClone(tabs),
    driveMeta: {
      fileId: "capture-file-id",
      lastSyncedAt: 1783324800000,
      lastCheckedAt: 1783324800000,
      lastKnownDriveModifiedTime: "2026-07-06T08:00:00.000Z",
      user: { name: "Demo User" },
    },
    afterRender: "open-drive-menu",
  },
];
