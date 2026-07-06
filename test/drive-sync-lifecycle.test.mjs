// Lifecycle tests for the Drive dirty-flag and startup/periodic sync flows.
// Requires --experimental-test-module-mocks (wired in package.json "test").
import assert from "node:assert/strict";
import { describe, mock, test } from "node:test";

const createElementStub = () => ({
  addEventListener() {},
  classList: {
    add() {},
    remove() {},
    toggle() {},
  },
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
  addEventListener() {},
};

// --- controllable doubles -------------------------------------------------

const calls = { push: [], dirtyWrites: [] };
let snapshot = { status: "disconnected", lastKnownDriveModifiedTime: null };
let remoteFile = { data: null, modifiedTime: null, error: false };
let storedDirty = false;
let confirmAnswer = true;
let confirmCalls = 0;
const pushBlockers = [];

const makeGate = () => {
  let release;
  const promise = new Promise((resolve) => {
    release = resolve;
  });
  return { promise, release };
};

const stripFav = (state) =>
  JSON.parse(
    JSON.stringify(state, (key, value) =>
      key === "favicon" ? undefined : value,
    ),
  );

mock.module("../newtab/drive.js", {
  namedExports: {
    connectDrive: async () => {},
    disconnectDrive: async () => {
      snapshot = { status: "disconnected", lastKnownDriveModifiedTime: null };
      storedDirty = false;
    },
    getDriveFileModifiedTime: async () => remoteFile.modifiedTime,
    getDriveSnapshot: () => ({ ...snapshot }),
    pullFromDrive: async () => {
      if (remoteFile.error) throw new Error("offline");
      return {
        data: structuredClone(remoteFile.data),
        modifiedTime: remoteFile.modifiedTime,
      };
    },
    pushToDrive: async (state) => {
      calls.push.push(structuredClone(state));
      const gate = pushBlockers.shift();
      if (gate) await gate.promise;
      snapshot.lastKnownDriveModifiedTime = remoteFile.modifiedTime;
      return { modifiedTime: remoteFile.modifiedTime };
    },
    stripFavicons: stripFav,
  },
});

mock.module("../newtab/storage.js", {
  namedExports: {
    loadStateFromStorage: async () => null,
    saveStateToStorage: async () => ({ success: true }),
    loadDriveMetadata: async () => null,
    saveDriveMetadata: async () => ({ success: true }),
    clearDriveMetadata: async () => ({ success: true }),
    loadDriveDirtyFlag: async () => storedDirty,
    saveDriveDirtyFlag: async (dirty) => {
      storedDirty = Boolean(dirty);
      calls.dirtyWrites.push(Boolean(dirty));
      return { success: true };
    },
    clearDriveDirtyFlag: async () => {
      storedDirty = false;
      return { success: true };
    },
    onDriveDirtyFlagChanged: () => {},
  },
});

mock.module("../newtab/modals.js", {
  namedExports: {
    openConfirm: async () => {
      confirmCalls += 1;
      return confirmAnswer;
    },
    showSnackbar: () => {},
  },
});

const driveUi = await import("../newtab/drive-ui.js");
const {
  createDefaultState,
  getState,
  initState,
  isDefaultSeedState,
  updateState,
} = await import("../newtab/state.js");

// --- fixtures ---------------------------------------------------------------

// Key orders match normalizeState output so initState round-trips byte-equal.
const T0 = "2026-01-01T00:00:00.000Z";
const makeCard = (title, over = {}) => ({
  id: `card-${title}`,
  type: "note",
  title,
  note: "",
  url: "",
  tags: [],
  color: "#475569",
  favorite: false,
  done: false,
  favicon: "",
  createdAt: T0,
  updatedAt: T0,
  ...over,
});

const makeState = (cards) => ({
  version: 1,
  spaces: [
    {
      id: "space-test",
      name: "Work",
      accent: "#2563eb",
      createdAt: T0,
      updatedAt: T0,
      boards: [
        {
          id: "board-test",
          name: "Main",
          createdAt: T0,
          updatedAt: T0,
          cards,
        },
      ],
    },
  ],
  preferences: {
    activeSpaceId: "space-test",
    activeBoardId: "board-test",
    searchTerm: "",
    captureBoardId: "board-test",
    viewMode: "spaces",
    tabDrawerPinned: false,
    lastSyncAt: null,
  },
  lastUpdated: T0,
});

const addCard = (title) =>
  updateState((draft) => {
    draft.spaces[0].boards[0].cards.push(makeCard(title));
  });

const cardTitles = (state) =>
  (state?.spaces ?? []).flatMap((space) =>
    (space.boards ?? []).flatMap((board) =>
      (board.cards ?? []).map((card) => card.title),
    ),
  );

const settle = async () => {
  for (let i = 0; i < 10; i++) {
    await new Promise((resolve) => setImmediate(resolve));
  }
};

// drive-ui keeps module-level sync state; reset it between tests through the
// public surface (disconnect notification + a suppressed baseline reseed).
const resetHarness = (localState) => {
  driveUi.handleDriveUpdate({ status: "disconnected" });
  snapshot = { status: "connected", lastKnownDriveModifiedTime: null };
  remoteFile = { data: null, modifiedTime: null, error: false };
  calls.push.length = 0;
  calls.dirtyWrites.length = 0;
  pushBlockers.length = 0;
  storedDirty = false;
  confirmAnswer = true;
  confirmCalls = 0;
  driveUi.setBootstrapSuppress(true);
  initState(localState);
  driveUi.scheduleDriveSync(getState());
  driveUi.setBootstrapSuppress(false);
};

// --- tests -------------------------------------------------------------------

describe("dirty flag lifecycle", () => {
  test("dirty marker survives an edit landing during an in-flight push", async () => {
    resetHarness(makeState([makeCard("A0")]));
    remoteFile = {
      data: { version: 1, spaces: [], preferences: {} },
      modifiedTime: "2026-01-01T00:00:01.000Z",
    };
    await driveUi.pullDriveOnStartup({ reason: "startup" });
    assert.equal(calls.push.length, 1); // empty remote seeded from local

    const gateA = makeGate();
    const gateB = makeGate();
    pushBlockers.push(gateA, gateB);

    addCard("A");
    driveUi.scheduleDriveSync(getState(), { trigger: "add-card" });
    await settle();
    assert.equal(calls.push.length, 2); // push A in flight, blocked

    addCard("B"); // lands while A's push is still awaiting Drive
    driveUi.scheduleDriveSync(getState(), { trigger: "add-card" });
    await settle();

    gateA.release();
    await settle();
    // The pushed state (A) is stale — B exists locally, so the marker must
    // survive A's completion or a tab close now would lose B on restart.
    assert.equal(storedDirty, true);

    gateB.release();
    await settle();
    assert.equal(storedDirty, false);
    assert.equal(calls.push.length, 3);
    assert.deepEqual(cardTitles(calls.push.at(-1)), ["A0", "A", "B"]);
  });

  test("failed startup pull: edits still mark dirty, periodic tick pushes them", async () => {
    resetHarness(makeState([makeCard("A0")]));
    remoteFile = { error: true };
    await assert.rejects(driveUi.pullDriveOnStartup({ reason: "startup" }));

    // Preference churn while pushes are gated must not mark dirty.
    updateState((draft) => {
      draft.preferences.searchTerm = "query";
    });
    driveUi.scheduleDriveSync(getState());
    await settle();
    assert.equal(storedDirty, false);

    // A content edit must mark dirty even though nothing can push yet.
    addCard("B");
    driveUi.scheduleDriveSync(getState());
    await settle();
    assert.equal(storedDirty, true);
    assert.equal(calls.push.length, 0);

    // Network returns; remote untouched since our last sync. The periodic
    // tick must push the dirty local instead of adopting (which would
    // revert the whole session) or probing-and-skipping forever.
    snapshot.lastKnownDriveModifiedTime = "2026-01-01T00:00:01.000Z";
    remoteFile = {
      data: stripFav(makeState([makeCard("A0")])),
      modifiedTime: "2026-01-01T00:00:01.000Z",
    };
    await driveUi.pullDrivePeriodic();
    assert.equal(calls.push.length, 1);
    assert.deepEqual(cardTitles(calls.push[0]), ["A0", "B"]);
    assert.equal(storedDirty, false);

    // The push gate is open again for later edits.
    addCard("C");
    driveUi.scheduleDriveSync(getState(), { trigger: "add-card" });
    await settle();
    assert.equal(calls.push.length, 2);
    assert.deepEqual(cardTitles(calls.push.at(-1)), ["A0", "B", "C"]);
  });
});

describe("connect-time adopt confirmation", () => {
  test("identical content (modulo favicons) adopts without asking", async () => {
    const local = makeState([makeCard("Same")]);
    resetHarness(local);
    remoteFile = {
      data: stripFav(local),
      modifiedTime: "2026-01-01T00:00:01.000Z",
    };
    await driveUi.pullDriveOnStartup({ reason: "connect" });
    assert.equal(confirmCalls, 0);
    assert.deepEqual(cardTitles(getState()), ["Same"]);
  });

  test("differing real cards ask first; cancel disconnects and changes nothing", async () => {
    resetHarness(makeState([makeCard("Mine")]));
    remoteFile = {
      data: stripFav(makeState([makeCard("Theirs")])),
      modifiedTime: "2026-01-01T00:00:01.000Z",
    };
    confirmAnswer = false;
    await driveUi.pullDriveOnStartup({ reason: "connect" });
    assert.equal(confirmCalls, 1);
    assert.equal(snapshot.status, "disconnected");
    assert.deepEqual(cardTitles(getState()), ["Mine"]);
    assert.equal(calls.push.length, 0);
  });

  test("differing real cards ask first; accepting adopts Drive", async () => {
    resetHarness(makeState([makeCard("Mine")]));
    remoteFile = {
      data: stripFav(makeState([makeCard("Theirs")])),
      modifiedTime: "2026-01-01T00:00:01.000Z",
    };
    confirmAnswer = true;
    await driveUi.pullDriveOnStartup({ reason: "connect" });
    assert.equal(confirmCalls, 1);
    assert.deepEqual(cardTitles(getState()), ["Theirs"]);
  });

  test("untouched fresh-install template adopts Drive without asking", async () => {
    resetHarness(createDefaultState());
    remoteFile = {
      data: stripFav(makeState([makeCard("Theirs")])),
      modifiedTime: "2026-01-01T00:00:01.000Z",
    };
    await driveUi.pullDriveOnStartup({ reason: "connect" });
    assert.equal(confirmCalls, 0);
    assert.deepEqual(cardTitles(getState()), ["Theirs"]);
  });
});

describe("isDefaultSeedState", () => {
  test("matches the fresh-install template regardless of random ids", () => {
    assert.equal(isDefaultSeedState(createDefaultState()), true);
  });

  test("any user edit makes it real content", () => {
    const renamed = createDefaultState();
    renamed.spaces[0].name = "Renamed";
    assert.equal(isDefaultSeedState(renamed), false);

    const checked = createDefaultState();
    checked.spaces[0].boards[0].cards[1].done = true;
    assert.equal(isDefaultSeedState(checked), false);
  });
});
