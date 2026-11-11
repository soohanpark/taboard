import test from "node:test";
import assert from "node:assert/strict";
import {
  cardMatchesSearch,
  renderBoard,
  renderBoardSidebar,
  renderFavoritesBoard,
  renderSpaceTabs,
} from "../newtab/render.js";

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.dataset = {};
    this.attributes = {};
    this.parentNode = null;
    this.style = { setProperty() {} };
    this.textContent = "";
    this.className = "";
    this.classList = {
      contains: (name) => this.className.split(" ").includes(name),
      add: (...names) => {
        this.className = [...new Set([...this.className.split(" "), ...names])]
          .filter(Boolean)
          .join(" ");
      },
      remove: (...names) => {
        this.className = this.className
          .split(" ")
          .filter((name) => !names.includes(name))
          .join(" ");
      },
      toggle: (name, force = !this.classList.contains(name)) => {
        this.classList[force ? "add" : "remove"](name);
        return force;
      },
    };
  }

  get childNodes() {
    return this.children;
  }

  get firstElementChild() {
    return this.children[0] ?? null;
  }

  get nextElementSibling() {
    if (!this.parentNode) return null;
    const siblings = this.parentNode.children;
    return siblings[siblings.indexOf(this) + 1] ?? null;
  }

  appendChild(child) {
    return this.insertBefore(child, null);
  }

  insertBefore(child, reference) {
    if (child === reference) return child;
    if (reference && reference.parentNode !== this) {
      throw new Error("Reference must be a child of this element");
    }
    child.remove();
    const index = reference
      ? this.children.indexOf(reference)
      : this.children.length;
    this.children.splice(index, 0, child);
    child.parentNode = this;
    return child;
  }

  remove() {
    if (!this.parentNode) return;
    const siblings = this.parentNode.children;
    siblings.splice(siblings.indexOf(this), 1);
    this.parentNode = null;
  }

  replaceChildren(...children) {
    [...this.children].forEach((child) => child.remove());
    children.forEach((child) => this.appendChild(child));
  }

  setAttribute(name, value) {
    this.attributes[name] = value;
  }

  querySelector(selector) {
    for (const child of this.children) {
      if (child.classList.contains(selector.slice(1))) return child;
      const nested = child.querySelector(selector);
      if (nested) return nested;
    }
    return null;
  }

  addEventListener() {}
}

const fakeDocument = {
  createElement: (tagName) => new FakeElement(tagName),
  getElementById: () => null,
};

globalThis.document = fakeDocument;

const fixture = () => ({
  spaces: [
    {
      id: "space-a",
      name: "Space A",
      accent: "#2563eb",
      boards: [
        {
          id: "board-a",
          name: "Board A",
          cards: [
            {
              id: "card-a",
              type: "todo",
              title: "Alpha",
              tags: ["work"],
              favorite: true,
            },
            {
              id: "card-b",
              type: "note",
              title: "Beta",
              note: "Notes",
              tags: ["personal"],
            },
          ],
        },
        {
          id: "board-b",
          name: "Board B",
          cards: [
            {
              id: "card-c",
              type: "link",
              title: "Gamma",
              url: "https://example.com",
            },
          ],
        },
      ],
    },
  ],
  preferences: {
    activeSpaceId: "space-a",
    activeBoardId: "board-a",
    searchTerm: "",
    viewMode: "spaces",
  },
});

const setup = () => {
  const state = fixture();
  const boardEl = new FakeElement("main");
  const options = { boardEl, getActiveSpace: (s) => s.spaces[0] };
  renderBoard(state, options);
  return { state, boardEl, options };
};
const cards = (boardEl) =>
  boardEl
    .querySelector(".card-list")
    .children.filter((el) => el.dataset.cardId);

test("search filters existing cards without replacing the column or card nodes", () => {
  const { state, boardEl, options } = setup();
  const before = cards(boardEl);
  const column = boardEl.firstElementChild;
  renderBoard(
    { ...state, preferences: { ...state.preferences, searchTerm: " #WORK " } },
    options,
  );
  assert.equal(boardEl.firstElementChild, column);
  assert.deepEqual(cards(boardEl), before);
  assert.equal(before[0].classList.contains("card-hidden"), false);
  assert.equal(before[1].classList.contains("card-hidden"), true);
  renderBoard(state, options);
  assert.equal(before[1].classList.contains("card-hidden"), false);
});

test("editing a card replaces only that card even when its timestamp is unchanged", () => {
  const { state, boardEl, options } = setup();
  const before = cards(boardEl);
  const next = structuredClone(state);
  Object.assign(next.spaces[0].boards[0].cards[0], {
    title: "Changed",
    done: true,
  });
  renderBoard(next, options);
  const after = cards(boardEl);
  assert.notEqual(after[0], before[0]);
  assert.equal(after[0].querySelector(".card-title").textContent, "Changed");
  assert.equal(after[0].classList.contains("is-done"), true);
  assert.equal(after[1], before[1]);
});

test("adding, removing, and reordering cards retains unaffected nodes and the drop target", () => {
  const { state, boardEl, options } = setup();
  const [a, b] = cards(boardEl);
  const indicator = boardEl.querySelector(".board-drop-indicator");
  const next = structuredClone(state);
  const board = next.spaces[0].boards[0];
  board.cards.reverse();
  board.cards.splice(1, 0, { id: "new", type: "note", title: "New" });
  renderBoard(next, { ...options, metaAction: "move-card" });
  assert.deepEqual(
    cards(boardEl).map((el) => el.dataset.cardId),
    ["card-b", "new", "card-a"],
  );
  assert.equal(cards(boardEl)[0], b);
  assert.equal(cards(boardEl)[2], a);
  const removed = structuredClone(next);
  removed.spaces[0].boards[0].cards.shift();
  renderBoard(removed, options);
  assert.equal(b.parentNode, null);
  assert.equal(cards(boardEl)[1], a);
  assert.equal(boardEl.querySelector(".card-list").children.at(-1), indicator);
});

test("board link counts and title refresh while unrelated cards remain mounted", () => {
  const { state, boardEl, options } = setup();
  const [a] = cards(boardEl);
  const next = structuredClone(state);
  const board = next.spaces[0].boards[0];
  board.name = "Renamed";
  board.cards.push({
    id: "link",
    type: "link",
    title: "Link",
    url: "https://example.com",
  });
  renderBoard(next, options);
  assert.equal(cards(boardEl)[0], a);
  assert.equal(boardEl.querySelector(".column-title").textContent, "Renamed");
  assert.equal(boardEl.querySelector(".column-sites-badge").textContent, "1");
  assert.equal(boardEl.querySelector(".column-sites").disabled, false);
  renderBoard(state, options);
  assert.equal(boardEl.querySelector(".column-sites-badge").textContent, "0");
  assert.equal(boardEl.querySelector(".column-sites").disabled, true);
});

test("search counts and cross-board banners update after changes outside the active board", () => {
  const { state, boardEl, options } = setup();
  const sidebarEl = new FakeElement("aside");
  const sidebarListEl = new FakeElement("ul");
  const filtered = {
    ...state,
    preferences: { ...state.preferences, searchTerm: "gamma" },
  };
  renderBoardSidebar(filtered, { ...options, sidebarEl, sidebarListEl });
  renderBoard(filtered, options);
  assert.equal(
    sidebarListEl.children[1].querySelector(".board-sidebar-item-count")
      .textContent,
    "1/1",
  );
  assert.equal(
    boardEl.querySelector(".board-search-banner").dataset.jumpBoardId,
    "board-b",
  );
  const next = structuredClone(filtered);
  next.spaces[0].boards[1].cards[0].title = "No match";
  renderBoardSidebar(next, { ...options, sidebarEl, sidebarListEl });
  renderBoard(next, options);
  assert.equal(
    sidebarListEl.children[1].querySelector(".board-sidebar-item-count")
      .textContent,
    "0/1",
  );
  assert.equal(boardEl.querySelector(".board-search-banner"), null);
});

test("favorites reuse unchanged output and refresh edited matches and view transitions", () => {
  const { state, boardEl, options } = setup();
  const favorites = {
    ...state,
    preferences: {
      ...state.preferences,
      viewMode: "favorites",
      searchTerm: "alpha",
    },
  };
  renderFavoritesBoard(favorites, options);
  const card = boardEl.querySelector(".card");
  renderFavoritesBoard(
    {
      ...favorites,
      preferences: { ...favorites.preferences, tabDrawerPinned: true },
    },
    options,
  );
  assert.equal(boardEl.querySelector(".card"), card);
  const next = structuredClone(favorites);
  next.spaces[0].boards[0].cards[0].title = "Edited";
  renderFavoritesBoard(next, options);
  assert.equal(boardEl.querySelector(".card"), null);
  renderBoard(state, options);
  assert.equal(cards(boardEl).length, 2);
  renderFavoritesBoard(favorites, options);
  assert.equal(boardEl.classList.contains("favorites-view"), true);
  assert.equal(boardEl.querySelector(".card").dataset.readOnly, "true");
});

test("render caches are isolated per root and space accents refresh", () => {
  const { state, options } = setup();
  const otherRoot = new FakeElement("main");
  renderBoard(state, { ...options, boardEl: otherRoot });
  assert.equal(cards(otherRoot).length, 2);
  const tabs = new FakeElement("nav");
  renderSpaceTabs(state, { spaceTabsEl: tabs });
  const next = structuredClone(state);
  next.spaces[0].accent = "#10b981";
  renderSpaceTabs(next, { spaceTabsEl: tabs });
  assert.equal(
    tabs.querySelector(".space-dot").style.backgroundColor,
    "#10b981",
  );
});

test("search reflects current card fields without retaining stale results by id", () => {
  const card = { id: "same-id", title: "Alpha", tags: ["Work"] };
  assert.equal(cardMatchesSearch(card, " ALPHA "), true);
  assert.equal(cardMatchesSearch({ ...card, title: "Beta" }, "alpha"), false);
  assert.equal(cardMatchesSearch(card, " #wor "), true);
  assert.equal(cardMatchesSearch(card, "# "), true);
});
