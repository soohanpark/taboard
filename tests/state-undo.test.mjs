import test from "node:test";
import assert from "node:assert/strict";
import {
  softDeleteBoard,
  softDeleteCard,
  softDeleteSpace,
  restoreDeletedBoard,
  restoreDeletedCard,
  restoreDeletedSpace,
} from "../newtab/state.js";

const makeCard = (id, title = id) => ({
  id,
  type: "note",
  title,
  note: "",
  url: "",
  tags: [],
  color: "#475569",
  favorite: false,
  done: false,
  favicon: "",
  createdAt: "2026-04-26T00:00:00.000Z",
  updatedAt: "2026-04-26T00:00:00.000Z",
});

const makeState = () => ({
  version: 1,
  spaces: [
    {
      id: "space-a",
      name: "A",
      accent: "#2563eb",
      boards: [
        {
          id: "board-a",
          name: "A1",
          cards: [makeCard("card-a")],
        },
        {
          id: "board-b",
          name: "A2",
          cards: [],
        },
      ],
    },
    {
      id: "space-b",
      name: "B",
      accent: "#10b981",
      boards: [
        {
          id: "board-c",
          name: "B1",
          cards: [],
        },
      ],
    },
  ],
  preferences: {
    activeSpaceId: "space-a",
    activeBoardId: "board-a",
    searchTerm: "",
    viewMode: "spaces",
    tabDrawerPinned: false,
    lastSyncAt: null,
  },
  lastUpdated: "2026-04-26T00:00:00.000Z",
});

test("restoring a deleted card preserves changes made after delete", () => {
  const state = makeState();
  const deletion = softDeleteCard(state, "card-a");
  const changedState = structuredClone(deletion.nextState);
  changedState.spaces[0].boards[1].cards.push(makeCard("card-b"));

  const restored = restoreDeletedCard(changedState, deletion);

  assert.deepEqual(
    restored.spaces[0].boards[0].cards.map((card) => card.id),
    ["card-a"],
  );
  assert.deepEqual(
    restored.spaces[0].boards[1].cards.map((card) => card.id),
    ["card-b"],
  );
});

test("restoring a deleted board preserves later boards and restores focus when unchanged", () => {
  const state = makeState();
  const deletion = softDeleteBoard(state, "board-a");
  const changedState = structuredClone(deletion.nextState);
  changedState.spaces[0].boards.push({
    id: "board-new",
    name: "Later board",
    cards: [],
  });

  const restored = restoreDeletedBoard(changedState, deletion);

  assert.deepEqual(
    restored.spaces[0].boards.map((board) => board.id),
    ["board-a", "board-b", "board-new"],
  );
  assert.equal(restored.preferences.activeBoardId, "board-a");
});

test("restoring a deleted space preserves later edits in remaining spaces", () => {
  const state = makeState();
  const deletion = softDeleteSpace(state, "space-a");
  const changedState = structuredClone(deletion.nextState);
  changedState.spaces[0].boards[0].cards.push(makeCard("card-later"));

  const restored = restoreDeletedSpace(changedState, deletion);

  assert.deepEqual(
    restored.spaces.map((space) => space.id),
    ["space-a", "space-b"],
  );
  assert.deepEqual(
    restored.spaces[1].boards[0].cards.map((card) => card.id),
    ["card-later"],
  );
  assert.equal(restored.preferences.activeSpaceId, "space-a");
  assert.equal(restored.preferences.activeBoardId, "board-a");
});
