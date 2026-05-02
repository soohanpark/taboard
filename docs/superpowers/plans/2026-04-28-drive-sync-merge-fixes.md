# Drive Sync Merge Regression Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix six Drive sync correctness regressions surfaced by Codex + Claude code reviews on the `develop` branch (PR-pending) so concurrent edits stop being silently dropped during merge.

**Architecture:** Tighten `mergeStates`/helpers in `newtab/drive-ui.js` to derive merge decisions from per-item/container `updatedAt` instead of `createdAt` or whole-state `lastUpdated`; ensure every UI mutation that affects merge identity (`favorite`, `done`) bumps `card.updatedAt`; require explicit user choice before destructive first-connect overwrites; refresh `preferences.lastSyncAt` after every successful sync — and lock all of this in with regression tests.

**Tech Stack:** Vanilla ES modules, `node:test` + `node:assert`, no transpiler. Tests live in `test/` and `tests/`.

---

## Background

### Issues being addressed

| ID | Source | Severity | Title | Files |
|----|--------|----------|-------|-------|
| P1-A | Codex | Critical | One-sided items compared via `createdAt` only | `drive-ui.js:197-201` |
| P1-B | Codex | Critical | Favorite/done toggles never bump `updatedAt` | `app.js:432-446` |
| P2 | Codex | Important | Order precedence uses whole-state `lastUpdated` | `drive-ui.js:178-182` |
| C2 | Claude | Critical | First connect overwrites local data without confirm | `drive-ui.js:422-427, 502-525` |
| I1 | Claude | Important | Background sync does not refresh `preferences.lastSyncAt` | `drive-ui.js:380-454` |
| Tests | Both | — | Happy-path tests miss all of the above | `test/drive-ui.test.mjs` |

### Tasks NOT in this plan (out of scope, separate PR)
- C1 tombstone-style hard deletion safety. P1-A largely closes the same gap because once `updatedAt` is the comparator, an edit-vs-delete race resolves to "edit wins" (which is what users expect). True tombstones are a deeper redesign.
- C3 push-abort retry. Belongs in a sync-resilience pass.
- I2 global suppression flag refactor. Cosmetic.
- I7 `app.js` size split. Tracked separately.

### Convention recap
- `card.updatedAt`, `board.updatedAt`, `space.updatedAt` are ISO strings. Higher = newer.
- `state.lastUpdated` is bumped on every `updateState` and `replaceState` call — including pure preference writes (e.g. searchTerm). It is therefore unsafe to use as a tiebreaker for tree ordering.
- `state.preferences.lastSyncAt` is a number (ms epoch). Used by `formatRelativeTime`.

---

## File Plan

| File | Change |
|------|--------|
| `newtab/drive-ui.js` | Rewrite `getOrderedIds`, `shouldKeepOneSidedItem`, plumb container timestamps; add `runDriveSync` post-success `recordSyncTimestamp`; gate connect-overwrite on `openConfirm`. |
| `newtab/app.js` | In `handleCardAction`, set `target.updatedAt` for `favorite` and `toggle-done` branches. |
| `test/drive-ui.test.mjs` | Add regression tests: P1-A (edit vs delete), P1-B (favorite/done vs edit), P2 (preference-only bump preserves remote reorder). |
| `docs/superpowers/plans/2026-04-28-drive-sync-merge-fixes.md` | This plan. |

No new files. No deletions.

---

## Task 1: P1-A — one-sided items compare on `updatedAt`

**Files:**
- Modify: `newtab/drive-ui.js:167-202`
- Test: `test/drive-ui.test.mjs` (new test)

- [ ] **Step 1: Write the failing test**

Add inside `describe("Drive state merging", …)`:

```javascript
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --test-name-pattern="keeps a card edited"`
Expected: FAIL — current `shouldKeepOneSidedItem` only sees `createdAt = 2026-01-01` < `remoteLastUpdated = 2026-04-20`, drops the card.

- [ ] **Step 3: Replace `shouldKeepOneSidedItem`**

In `newtab/drive-ui.js`, replace the body of `shouldKeepOneSidedItem` (currently lines 197-202) with:

```javascript
const shouldKeepOneSidedItem = (item, otherSideLastUpdated) => {
  const itemTime = getItemTime(item);
  const otherUpdated = toTime(otherSideLastUpdated);
  if (!itemTime || !otherUpdated) return true;
  return itemTime >= otherUpdated;
};
```

`getItemTime` already prefers `updatedAt` over `createdAt`, which is exactly the semantics we want.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: 13/13 pass (12 prior + 1 new). The other one-sided test (`keeps the newer local board and space order`) must still pass — boards there carry their own `updatedAt`.

- [ ] **Step 5: Commit**

```bash
git add newtab/drive-ui.js test/drive-ui.test.mjs
git commit -m "fix(drive-sync): use updatedAt for one-sided merge decisions

Previously shouldKeepOneSidedItem compared item.createdAt against
the other side's lastUpdated, so editing a months-old card on
device A while device B deleted it silently dropped the edit.
Switch to getItemTime so the freshest mutation timestamp wins."
```

---

## Task 2: P1-B — bump `updatedAt` on favorite/done toggles

**Files:**
- Modify: `newtab/app.js:432-447`
- Test: `test/drive-ui.test.mjs` (new test)

- [ ] **Step 1: Write the failing test**

Add inside `describe("Drive state merging", …)`:

```javascript
test("favorite toggled on one side beats stale edit on the other", () => {
  // Local: card was favorited 2026-04-22 — toggle bumps updatedAt.
  // Remote: same card had its title edited 2026-04-21.
  // Merge must keep local copy (favorite=true), not remote.
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
});
```

This test passes today (because mergeStates already compares `updatedAt`) — it's a guardrail. The actual failing test for the regression is at the **app.js** level: a toggle must produce a card whose `updatedAt` advanced. That belongs in a separate test file.

- [ ] **Step 2: Add app-level regression test**

Create new test file `tests/card-action-timestamps.test.mjs`:

```javascript
import assert from "node:assert/strict";
import { describe, test } from "node:test";

// We can't load app.js (it boots the whole UI) so we test the same
// transformation as a pure helper. Mirror the app.js mutation here
// to lock in the contract: toggling favorite/done must bump updatedAt.

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
    assert.notEqual(after.updatedAt, before.updatedAt);
    assert.ok(new Date(after.updatedAt).getTime() > new Date(before.updatedAt).getTime());
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
    assert.ok(new Date(after.updatedAt).getTime() > new Date(before.updatedAt).getTime());
  });
});
```

This test is illustrative — it locks the *contract* (any toggle must bump `updatedAt`). The real fix lives in `app.js`.

- [ ] **Step 3: Patch `app.js`**

In `newtab/app.js`, replace the `favorite` and `toggle-done` branches inside `handleCardAction` (lines 432-447):

```javascript
if (action === "favorite")
  return updateState((draft) => {
    const target =
      draft.spaces[indices.spaceIdx]?.boards[indices.boardIdx]?.cards[
        indices.cardIdx
      ];
    if (target) {
      target.favorite = !target.favorite;
      target.updatedAt = new Date().toISOString();
    }
  });
if (action === "toggle-done")
  return updateState((draft) => {
    const target =
      draft.spaces[indices.spaceIdx]?.boards[indices.boardIdx]?.cards[
        indices.cardIdx
      ];
    if (target) {
      target.done = !target.done;
      target.updatedAt = new Date().toISOString();
    }
  });
```

- [ ] **Step 4: Run all tests**

Run: `npm test`
Expected: all green, including new ones.

- [ ] **Step 5: Commit**

```bash
git add newtab/app.js test/drive-ui.test.mjs tests/card-action-timestamps.test.mjs
git commit -m "fix(drive-sync): bump card.updatedAt on favorite/done toggles

Without bumping updatedAt, a fav/done toggle on device A would lose
to a stale title edit on device B during merge — same-card conflict
resolution compares card.updatedAt. Bring these mutations in line
with editCard/moveCard."
```

---

## Task 3: P2 — order precedence from container/item, not whole-state

**Files:**
- Modify: `newtab/drive-ui.js:170-183, 223-261, 306-352`
- Test: `test/drive-ui.test.mjs` (new test)

- [ ] **Step 1: Write the failing test**

Add inside `describe("Drive state merging", …)`:

```javascript
test("a remote board reorder survives a local-only preference bump", () => {
  // Remote: boards reordered to [b, a] at 2026-04-22 (board.updatedAt set).
  // Local: still [a, b] at older timestamps, but state.lastUpdated bumped
  // to 2026-04-23 because user toggled tabDrawerPinned (preference-only).
  const remote = {
    ...state(
      [
        board("board-b", [], "2026-04-22T00:00:00.000Z"),
        board("board-a", [], "2026-04-22T00:00:00.000Z"),
      ],
      "2026-04-22T00:00:00.000Z",
    ),
  };
  remote.spaces[0].updatedAt = "2026-04-22T00:00:00.000Z";

  const local = {
    ...state(
      [
        board("board-a", [], "2026-04-20T00:00:00.000Z"),
        board("board-b", [], "2026-04-20T00:00:00.000Z"),
      ],
      "2026-04-23T00:00:00.000Z", // preference-only bump
    ),
  };
  local.spaces[0].updatedAt = "2026-04-20T00:00:00.000Z";

  const merged = driveUi.mergeStates(remote, local);
  assert.deepEqual(
    merged.spaces[0].boards.map((b) => b.id),
    ["board-b", "board-a"],
    "remote reorder must win when only local-state.lastUpdated changed",
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --test-name-pattern="remote board reorder survives"`
Expected: FAIL — current `getOrderedIds` sees `localLastUpdated > remoteLastUpdated`, prefers local order.

- [ ] **Step 3: Pass container timestamps through**

In `newtab/drive-ui.js`, change `getOrderedIds` to accept a *container* timestamp (the parent that owns the ordering) and pass `space.updatedAt` / `board.updatedAt` instead of state-level `lastUpdated`. Also fall back to the max `updatedAt` among the items themselves when both containers are missing timestamps:

```javascript
const maxItemTime = (items = []) => {
  let max = 0;
  for (const item of items) {
    const t = getItemTime(item);
    if (t > max) max = t;
  }
  return max;
};

const getOrderedIds = (
  remoteItems = [],
  localItems = [],
  remoteContainerUpdated,
  localContainerUpdated,
) => {
  const remoteIds = (remoteItems ?? []).map((item) => item.id);
  const localIds = (localItems ?? []).map((item) => item.id);
  const remoteRank =
    toTime(remoteContainerUpdated) || maxItemTime(remoteItems);
  const localRank =
    toTime(localContainerUpdated) || maxItemTime(localItems);
  const preferLocalOrder = localRank >= remoteRank;
  const preferred = preferLocalOrder ? localIds : remoteIds;
  const fallback = preferLocalOrder ? remoteIds : localIds;
  return [...new Set([...preferred, ...fallback])];
};
```

- [ ] **Step 4: Update callsites**

In `mergeBoards` (the inner card list), replace:

```javascript
const allCardIds = getOrderedIds(
  remote.cards,
  local.cards,
  remoteLastUpdated,
  localLastUpdated,
);
```

with:

```javascript
const allCardIds = getOrderedIds(
  remote.cards,
  local.cards,
  remote.updatedAt,
  local.updatedAt,
);
```

In `mergeBoards`'s outer call (board list), replace:

```javascript
const allBoardIds = getOrderedIds(
  remoteBoards,
  localBoards,
  remoteLastUpdated,
  localLastUpdated,
);
```

with: (`mergeBoards` is called per space — the caller passes the space, so we now also need that space's `updatedAt`.) Refactor the signature:

```javascript
const mergeBoards = (
  remoteSpace,
  localSpace,
  remoteStateLastUpdated,
  localStateLastUpdated,
  { remoteCardIndex, localCardIndex } = {},
) => {
  const remoteBoards = remoteSpace?.boards ?? [];
  const localBoards = localSpace?.boards ?? [];
  const remoteBoardMap = new Map(remoteBoards.map((b) => [b.id, b]));
  const localBoardMap = new Map(localBoards.map((b) => [b.id, b]));
  const allBoardIds = getOrderedIds(
    remoteBoards,
    localBoards,
    remoteSpace?.updatedAt,
    localSpace?.updatedAt,
  );

  return allBoardIds
    .map((boardId) => {
      const remote = remoteBoardMap.get(boardId);
      const local = localBoardMap.get(boardId);
      if (!remote) {
        return shouldKeepOneSidedItem(local, remoteSpace?.updatedAt)
          ? cloneItem(local)
          : null;
      }
      if (!local) {
        return shouldKeepOneSidedItem(remote, localSpace?.updatedAt)
          ? cloneItem(remote)
          : null;
      }

      const remoteCardMap = new Map((remote.cards ?? []).map((c) => [c.id, c]));
      const localCardMap = new Map((local.cards ?? []).map((c) => [c.id, c]));
      const allCardIds = getOrderedIds(
        remote.cards,
        local.cards,
        remote.updatedAt,
        local.updatedAt,
      );

      const mergedCards = allCardIds
        .map((cardId) => {
          const rc = remoteCardMap.get(cardId);
          const lc = localCardMap.get(cardId);
          if (!rc) {
            return shouldKeepOneSidedCard(
              lc,
              remoteCardIndex?.get(cardId),
              local.updatedAt,
              remote.updatedAt,
            )
              ? cloneItem(lc)
              : null;
          }
          if (!lc) {
            return shouldKeepOneSidedCard(
              rc,
              localCardIndex?.get(cardId),
              remote.updatedAt,
              local.updatedAt,
            )
              ? cloneItem(rc)
              : null;
          }

          const remoteUpdated = toTime(rc.updatedAt);
          const localUpdated = toTime(lc.updatedAt);
          return cloneItem(localUpdated >= remoteUpdated ? lc : rc);
        })
        .filter(Boolean);

      const remoteUpdated = toTime(remote.updatedAt);
      const localUpdated = toTime(local.updatedAt);
      const base = localUpdated >= remoteUpdated ? local : remote;

      return {
        ...cloneItem(base),
        cards: mergedCards,
      };
    })
    .filter(Boolean);
};
```

In `mergeStates`, change the space-level call:

```javascript
const allSpaceIds = getOrderedIds(
  remoteState.spaces,
  localState.spaces,
  // No single space-list container timestamp — fall back to max(space.updatedAt).
  undefined,
  undefined,
);
```

(The new `getOrderedIds` will use `maxItemTime(spaces)` when the container timestamp is undefined, which is exactly correct: a reorder bumps at least one space's `updatedAt`.)

And the call to `mergeBoards` becomes:

```javascript
const mergedBoards = mergeBoards(
  remote,
  local,
  remoteState.lastUpdated,
  localState.lastUpdated,
  { remoteCardIndex, localCardIndex },
);
```

(The `remoteState.lastUpdated`/`localState.lastUpdated` arguments are unused after the refactor — drop them from the signature for cleanliness.)

- [ ] **Step 5: Update one-sided space comparison**

In `mergeStates`, the existing one-sided checks compare against `remoteState.lastUpdated` / `localState.lastUpdated`. After Task 1 these compare item time vs other-side state — which is fine for the *space* case because a one-sided space is a wholly absent or wholly new structure, and `state.lastUpdated` always advances on any change. Leave as-is.

- [ ] **Step 6: Run all tests**

Run: `npm test`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add newtab/drive-ui.js test/drive-ui.test.mjs
git commit -m "fix(drive-sync): order precedence from container, not state.lastUpdated

state.lastUpdated bumps on any preference write (searchTerm,
tabDrawerPinned, lastSyncAt) so it cannot represent the recency
of structural reorders. Pass space.updatedAt for board ordering,
board.updatedAt for card ordering, and fall back to max(item.updatedAt)
when comparing top-level spaces. Stops local-only preference bumps
from clobbering real remote reorders."
```

---

## Task 4: C2 — confirm before connect overwrite

**Files:**
- Modify: `newtab/drive-ui.js:380-454, 498-525`

- [ ] **Step 1: Replace `connect`-reason branch**

In `runDriveSync` (around lines 422-427), the current code unconditionally overwrites local with remote. Replace with merge-instead-of-overwrite (the merge logic is now safe for fresh-connect after Tasks 1-3):

```javascript
if (reason === "connect") {
  // Treat first connect like every other sync: merge bidirectionally.
  // The old code did a hard local→remote overwrite which silently
  // destroyed local data when the user connected to a Drive that
  // already had a TaboardSync.json from a different device.
  const mergedState = mergeStates(remoteState, resolvedLocalState);
  if (remoteState && mergedState) {
    isDriveSyncSuppressed = true;
    replaceState(mergedState, { preserveTimestamp: true });
    isDriveSyncSuppressed = false;
  }
  await pushToDrive(getState(), syncOptions);
  return;
}
```

This is the conservative fix — it eliminates the silent overwrite without introducing UI prompts mid-flow. If the user explicitly wants to discard one side, they can do that manually before connecting. Tests will lock the contract that local data survives.

- [ ] **Step 2: Add a test**

In `test/drive-ui.test.mjs`, add:

```javascript
test("connect-time merge preserves local-only data", () => {
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

  const merged = driveUi.mergeStates(remote, local);
  const spaceIds = merged.spaces.map((s) => s.id).sort();
  assert.deepEqual(spaceIds, ["space-local", "space-remote"]);
});
```

- [ ] **Step 3: Run tests**

Run: `npm test`
Expected: all green.

- [ ] **Step 4: Commit**

```bash
git add newtab/drive-ui.js test/drive-ui.test.mjs
git commit -m "fix(drive-sync): merge instead of overwrite on first connect

The old connect path called replaceState(remoteState) and skipped
the push, silently destroying any local data when a user connected
to a Drive that already had data from a different device. Run the
same merge as every other sync, then push."
```

---

## Task 5: I1 — record sync timestamp on every successful run

**Files:**
- Modify: `newtab/drive-ui.js:380-454`

- [ ] **Step 1: Patch `runDriveSync` success path**

After the successful `pushToDrive(...)` call (line ~438), add a call to `recordSyncTimestamp()` so background interval syncs and add-card immediate syncs also refresh the visible "last synced" time:

```javascript
await pushToDrive(getState(), syncOptions);
recordSyncTimestamp();
```

The connect branch above (Task 4) already returns after its push; add `recordSyncTimestamp()` there too just before the `return`:

```javascript
await pushToDrive(getState(), syncOptions);
recordSyncTimestamp();
return;
```

Then **remove** the now-redundant manual `recordSyncTimestamp()` calls in `initDriveUI` (lines 521 and 552) — they fire a second time after `runDriveSync` already recorded.

- [ ] **Step 2: Run tests**

Run: `npm test`
Expected: all green (no test asserts on this; it's UI behavior).

- [ ] **Step 3: Manually verify in browser**

Load extension, connect Drive, wait for one auto-sync interval (or trigger via menu), confirm "Last synced X mins ago" updates without manually clicking sync.

- [ ] **Step 4: Commit**

```bash
git add newtab/drive-ui.js
git commit -m "fix(drive-ui): refresh lastSyncAt after every successful sync

Background interval syncs and add-card immediate syncs were not
updating preferences.lastSyncAt, so the menu's 'Last synced X
ago' indicator would go stale even though the sync was running.
Move recordSyncTimestamp() into runDriveSync's success path."
```

---

## Task 6: Verification & push

- [ ] **Step 1: Run full test suite**

Run: `npm test`
Expected: 16+ passes, 0 fails.

- [ ] **Step 2: Lint format**

Run: `npx prettier@latest --write newtab/drive-ui.js newtab/app.js test/drive-ui.test.mjs tests/card-action-timestamps.test.mjs`
Expected: files reformatted in place.

- [ ] **Step 3: Re-run tests after format**

Run: `npm test`
Expected: still all green.

- [ ] **Step 4: Push branch**

```bash
git push -u origin fix/drive-sync-merge-regressions
```

- [ ] **Step 5: Inform user**

Stop, summarize, point to PR creation if user approves.

---

## Self-Review

- [x] **Spec coverage:** P1-A (Task 1), P1-B (Task 2), P2 (Task 3), C2 (Task 4), I1 (Task 5), tests (Tasks 1-4 each include their regression test). C1/C3/I2 explicitly out-of-scope and noted.
- [x] **Placeholder scan:** No "TBD" / "implement later". All code blocks complete.
- [x] **Type consistency:** `getItemTime`, `toTime`, `maxItemTime`, `getOrderedIds`, `mergeBoards` (refactored signature), `mergeStates`, `recordSyncTimestamp` — all named consistently across tasks. `mergeBoards` signature changes in Task 3 only — no later task references the old signature.
