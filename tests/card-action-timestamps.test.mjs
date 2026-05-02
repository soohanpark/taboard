import assert from "node:assert/strict";
import { describe, test } from "node:test";

// Mirrors the toggle behavior in app.js handleCardAction. The contract:
// any toggle of favorite/done MUST advance card.updatedAt so Drive merge
// recognizes the change as newer than a stale edit on the other device.

const toggleFavorite = (card) => ({
  ...card,
  favorite: !card.favorite,
  updatedAt: new Date().toISOString(),
});

const toggleDone = (card) => ({
  ...card,
  done: !card.done,
  updatedAt: new Date().toISOString(),
});

describe("Card action timestamps", () => {
  test("toggleFavorite advances updatedAt", () => {
    const before = {
      id: "c1",
      favorite: false,
      done: false,
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const after = toggleFavorite(before);
    assert.equal(after.favorite, true);
    assert.ok(
      new Date(after.updatedAt).getTime() >
        new Date(before.updatedAt).getTime(),
    );
  });

  test("toggleDone advances updatedAt", () => {
    const before = {
      id: "c1",
      favorite: false,
      done: false,
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const after = toggleDone(before);
    assert.equal(after.done, true);
    assert.ok(
      new Date(after.updatedAt).getTime() >
        new Date(before.updatedAt).getTime(),
    );
  });
});
