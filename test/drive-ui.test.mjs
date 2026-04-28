import assert from "node:assert/strict";
import { describe, test } from "node:test";

const createElementStub = () => ({
  addEventListener() {},
  classList: {
    add() {},
    remove() {},
    toggle() {},
  },
  elements: {},
  querySelector() {
    return createElementStub();
  },
  setAttribute() {},
  textContent: "",
});

globalThis.document = {
  getElementById() {
    return createElementStub();
  },
};

const driveUi = await import("../newtab/drive-ui.js");

const card = (id, timestamp, extra = {}) => ({
  id,
  type: "link",
  title: id,
  url: `https://example.com/${id}`,
  tags: [],
  color: "#2563eb",
  favorite: false,
  done: false,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: timestamp,
  ...extra,
});

const board = (id, cards, timestamp = "2026-01-01T00:00:00.000Z") => ({
  id,
  name: id,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: timestamp,
  cards,
});

const state = (boards, timestamp) => ({
  version: 1,
  spaces: [
    {
      id: "space-1",
      name: "Space",
      accent: "#2563eb",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: timestamp,
      boards,
    },
  ],
  preferences: {
    activeSpaceId: "space-1",
    activeBoardId: boards[0]?.id ?? null,
    captureBoardId: boards[0]?.id ?? null,
    searchTerm: "",
    viewMode: "spaces",
  },
  lastUpdated: timestamp,
});

describe("Drive state merging", () => {
  test("preserves a moved card in the newer location", () => {
    assert.equal(typeof driveUi.mergeStates, "function");

    const remote = state(
      [
        board("board-a", [card("card-1", "2026-01-01T00:00:00.000Z")]),
        board("board-b", []),
      ],
      "2026-01-02T00:00:00.000Z",
    );
    const local = state(
      [
        board("board-a", []),
        board("board-b", [card("card-1", "2026-01-03T00:00:00.000Z")]),
      ],
      "2026-01-03T00:00:00.000Z",
    );

    const merged = driveUi.mergeStates(remote, local);
    const [boardA, boardB] = merged.spaces[0].boards;

    assert.deepEqual(
      boardA.cards.map((item) => item.id),
      [],
    );
    assert.deepEqual(
      boardB.cards.map((item) => item.id),
      ["card-1"],
    );
  });

  test("keeps the newer local card order when cards are reordered", () => {
    assert.equal(typeof driveUi.mergeStates, "function");

    const remote = state(
      [
        board("board-a", [
          card("card-a", "2026-01-01T00:00:00.000Z"),
          card("card-b", "2026-01-01T00:00:00.000Z"),
          card("card-c", "2026-01-01T00:00:00.000Z"),
        ]),
      ],
      "2026-01-02T00:00:00.000Z",
    );
    const local = state(
      [
        board("board-a", [
          card("card-c", "2026-01-03T00:00:00.000Z"),
          card("card-a", "2026-01-01T00:00:00.000Z"),
          card("card-b", "2026-01-01T00:00:00.000Z"),
        ]),
      ],
      "2026-01-03T00:00:00.000Z",
    );

    const merged = driveUi.mergeStates(remote, local);

    assert.deepEqual(
      merged.spaces[0].boards[0].cards.map((item) => item.id),
      ["card-c", "card-a", "card-b"],
    );
  });

  test("keeps a card edited on one side over deletion on the other", () => {
    const remote = state(
      [board("board-a", [], "2026-04-20T00:00:00.000Z")],
      "2026-04-20T00:00:00.000Z",
    );
    const local = state(
      [
        board(
          "board-a",
          [
            card("card-1", "2026-04-21T00:00:00.000Z", {
              createdAt: "2026-01-01T00:00:00.000Z",
            }),
          ],
          "2026-04-21T00:00:00.000Z",
        ),
      ],
      "2026-04-21T00:00:00.000Z",
    );

    const merged = driveUi.mergeStates(remote, local);

    assert.deepEqual(
      merged.spaces[0].boards[0].cards.map((c) => c.id),
      ["card-1"],
      "card edited locally after remote-side deletion must survive",
    );
  });

  test("connect-time merge preserves local-only data", () => {
    // First-connect scenario: remote Drive has data from Device A,
    // local has unsaved data on Device B. Old code replaceState(remote)
    // silently destroyed local. New flow must keep both.
    const remote = state(
      [board("board-remote", [card("card-remote", "2026-04-20T00:00:00.000Z")])],
      "2026-04-20T00:00:00.000Z",
    );
    remote.spaces[0].id = "space-remote";

    const local = state(
      [board("board-local", [card("card-local", "2026-04-22T00:00:00.000Z")])],
      "2026-04-22T00:00:00.000Z",
    );
    local.spaces[0].id = "space-local";

    const merged = driveUi.mergeStates(remote, local, { keepOneSided: true });
    const spaceIds = merged.spaces.map((s) => s.id).sort();
    assert.deepEqual(spaceIds, ["space-local", "space-remote"]);
  });

  test("a remote board reorder survives a local-only preference bump", () => {
    // Remote: boards reordered to [b, a] at 2026-04-22 (board.updatedAt set).
    // Local: still [a, b] at older timestamps, but state.lastUpdated bumped
    // to 2026-04-23 because user toggled tabDrawerPinned (preference-only).
    const remote = state(
      [
        board("board-b", [], "2026-04-22T00:00:00.000Z"),
        board("board-a", [], "2026-04-22T00:00:00.000Z"),
      ],
      "2026-04-22T00:00:00.000Z",
    );
    remote.spaces[0].updatedAt = "2026-04-22T00:00:00.000Z";

    const local = state(
      [
        board("board-a", [], "2026-04-20T00:00:00.000Z"),
        board("board-b", [], "2026-04-20T00:00:00.000Z"),
      ],
      "2026-04-23T00:00:00.000Z",
    );
    local.spaces[0].updatedAt = "2026-04-20T00:00:00.000Z";

    const merged = driveUi.mergeStates(remote, local);
    assert.deepEqual(
      merged.spaces[0].boards.map((b) => b.id),
      ["board-b", "board-a"],
      "remote reorder must win when only local-state.lastUpdated changed",
    );
  });

  test("favorite toggled on one side beats stale edit on the other", () => {
    const localCard = card("card-1", "2026-04-22T00:00:00.000Z", {
      favorite: true,
    });
    const remoteCard = card("card-1", "2026-04-21T00:00:00.000Z", {
      title: "Older title",
    });
    const remote = state(
      [board("board-a", [remoteCard], "2026-04-21T00:00:00.000Z")],
      "2026-04-21T00:00:00.000Z",
    );
    const local = state(
      [board("board-a", [localCard], "2026-04-22T00:00:00.000Z")],
      "2026-04-22T00:00:00.000Z",
    );

    const merged = driveUi.mergeStates(remote, local);
    assert.equal(merged.spaces[0].boards[0].cards[0].favorite, true);
    assert.equal(merged.spaces[0].boards[0].cards[0].title, "card-1");
  });

  test("keeps the newer local board and space order", () => {
    assert.equal(typeof driveUi.mergeStates, "function");

    const remote = {
      ...state(
        [board("board-a", []), board("board-b", []), board("board-c", [])],
        "2026-01-02T00:00:00.000Z",
      ),
      spaces: [
        {
          ...state([], "2026-01-02T00:00:00.000Z").spaces[0],
          id: "space-a",
          boards: [board("board-a", []), board("board-b", [])],
        },
        {
          ...state([], "2026-01-02T00:00:00.000Z").spaces[0],
          id: "space-b",
          boards: [board("board-c", [])],
        },
      ],
    };
    const local = {
      ...remote,
      spaces: [
        {
          ...remote.spaces[1],
          updatedAt: "2026-01-03T00:00:00.000Z",
          boards: [board("board-c", [], "2026-01-03T00:00:00.000Z")],
        },
        {
          ...remote.spaces[0],
          updatedAt: "2026-01-03T00:00:00.000Z",
          boards: [
            board("board-b", [], "2026-01-03T00:00:00.000Z"),
            board("board-a", []),
          ],
        },
      ],
      lastUpdated: "2026-01-03T00:00:00.000Z",
    };

    const merged = driveUi.mergeStates(remote, local);

    assert.deepEqual(
      merged.spaces.map((item) => item.id),
      ["space-b", "space-a"],
    );
    assert.deepEqual(
      merged.spaces[1].boards.map((item) => item.id),
      ["board-b", "board-a"],
    );
  });
});

describe("Drive sync error reporting", () => {
  test("immediate debounced sync failures are reported to the caller", () => {
    assert.equal(typeof driveUi.shouldRethrowSyncError, "function");

    assert.equal(
      driveUi.shouldRethrowSyncError(new Error("failed"), {
        reason: "debounced",
        throwOnError: true,
      }),
      true,
    );
  });

  test("immediate debounced sync timeouts are reported to the caller", () => {
    assert.equal(typeof driveUi.shouldRethrowSyncError, "function");

    const error = new Error("aborted");
    error.name = "AbortError";

    assert.equal(
      driveUi.shouldRethrowSyncError(error, {
        reason: "debounced",
        throwOnError: true,
      }),
      true,
    );
  });
});
