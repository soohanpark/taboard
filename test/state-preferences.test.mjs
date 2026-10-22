import test from "node:test";
import assert from "node:assert/strict";
import {
  createDefaultState,
  getState,
  initState,
  subscribe,
  updatePreferences,
  updateState,
} from "../newtab/state.js";

test("preference updates preserve content and earlier snapshots", () => {
  const snapshots = [];
  const unsubscribe = subscribe((state) => snapshots.push(state));
  try {
    initState(createDefaultState());
    const initial = snapshots.at(-1);
    updatePreferences({ searchTerm: "reading", tabDrawerPinned: true });
    const updated = snapshots.at(-1);
    assert.equal(updated.spaces, initial.spaces);
    assert.equal(initial.preferences.searchTerm, "");
    assert.equal(updated.preferences.searchTerm, "reading");
    assert.equal(updated.preferences.tabDrawerPinned, true);
    assert.notEqual(updated.preferences, initial.preferences);
    updateState((draft) => {
      draft.spaces[0].name = "Changed";
    });
    assert.notEqual(snapshots.at(-1).spaces, updated.spaces);
    assert.notEqual(initial.spaces[0].name, "Changed");
    const external = getState();
    external.spaces[0].name = "External mutation";
    assert.equal(getState().spaces[0].name, "Changed");
  } finally {
    unsubscribe();
  }
});

test("unchanged preferences do not emit redundant state updates", () => {
  initState(createDefaultState());
  let notifications = 0;
  const unsubscribe = subscribe(() => {
    notifications += 1;
  });
  try {
    updatePreferences({ searchTerm: "", tabDrawerPinned: false });
    assert.equal(notifications, 0);
    updatePreferences({ searchTerm: "new" });
    updatePreferences({ searchTerm: "new" });
    assert.equal(notifications, 1);
  } finally {
    unsubscribe();
  }
});
