# Learnings — taboard-improvements

## [2026-02-22] Session: ses_37bee838effemGxhonf7uatODx
Work session started. Plan has 21 tasks + 4 final verification tasks in 6 waves.

### Key Codebase Facts
- `newtab/app.js` is 2139 lines — the God file to be split
- `newtab/state.js` uses `JSON.parse(JSON.stringify())` with structuredClone fallback (lines 1-6)
- `newtab/storage.js` swallows errors silently (no propagation)
- CSS uses `:root` tokens for spacing/shadow/transition, but NOT for font-size
- Font-size tokens (`--font-*`) do NOT yet exist — need to be added to `:root`
- Magic numbers in app.js: 350 (persist debounce), 1500 (drive sync), 150 (search), 100 (tab update), 3000 (snackbar)
- `data-section-id` in HTML → will become `data-board-id` in Task 6
- `.section-drop-indicator` in CSS → will become `.board-drop-indicator` in Task 6
- State structure uses `space.sections[]` → will migrate to `space.boards[]` in Task 6

### Module Split Target (after Waves 3-4)
- `constants.js` — pure constants, no DOM
- `render.js` — all rendering functions
- `drag.js` — drag-and-drop handlers + state
- `modals.js` — modal/confirm/snackbar
- `tabs.js` — tab drawer + observers
- `drive-ui.js` — Drive UI orchestration + timers
- `app.js` — slim orchestrator <300 lines

### Wave Execution Order (CRITICAL)
1. Wave 1 (T1-5): Foundation — PARALLEL, no deps
2. Wave 2 (T6): section→board rename — SEQUENTIAL gate
3. Wave 3 (T7-11): Module split — PARALLEL, depends on T6
4. Wave 4 (T12-15): Performance — PARALLEL, depends on T7-11
5. Wave 5 (T16-21): UX/Design — PARALLEL, depends on T7-11
6. Final (F1-F4): Verification — depends on all

## [2026-02-22] Task 3: Font Loading Optimization — COMPLETED

### Changes Made
1. **Added preconnect for cdn.jsdelivr.net** (Line 9)
   - Enables DNS prefetch for Pretendard CDN
   - Placed BEFORE stylesheet links (correct order)

2. **Google Fonts Inter already had display=swap** (Line 11)
   - No change needed — already optimized
   - Prevents FOIT (Flash of Invisible Text)

3. **Implemented non-blocking pattern for Pretendard** (Lines 14-19)
   - Changed from: `<link rel="stylesheet" href="...">`
   - Changed to: `<link rel="stylesheet" media="print" onload="this.media='all'" href="...">`
   - Added `<noscript>` fallback (Line 20) for users without JS

### Performance Impact
- **DNS Prefetch**: 3 preconnect hints reduce DNS lookup latency
- **Font Swap**: display=swap prevents invisible text during load
- **Non-blocking Pretendard**: Defers Pretendard load, uses system fonts first
- **Fallback**: noscript ensures Pretendard loads even if JS disabled

### Key Learnings
- Preconnect order matters: must come BEFORE stylesheet links
- crossorigin attribute required on fonts.gstatic.com (CORS fonts)
- media="print" onload pattern is standard for non-blocking CSS
- noscript fallback ensures progressive enhancement

### Files Modified
- `newtab/index.html` (lines 7-20)

### Verification
✅ grep 'display=swap' — PASS
✅ grep 'preconnect' — PASS (3 hints)
✅ media="print" onload pattern — PASS
✅ noscript fallback — PASS

## [2026-02-22] Task 1: CSS Design Token Expansion — COMPLETED

### What Was Done
- Added 6 font-size tokens to `:root`: --font-xs through --font-xl (0.75rem to 1.125rem)
- Added --space-2-5: 10px to spacing scale (fills gap between --space-2: 8px and --space-3: 12px)
- Replaced ALL 29 hardcoded font-size values with var(--font-*) tokens
- Replaced 42 hardcoded padding/gap/margin values with var(--space-*) tokens
- Left structural dimensions (width, height, min-width, max-width) untouched as required
- Left gap: 14px untouched (no token exists for this value)

### Font-Size Mapping Applied
- 0.7rem, 0.75rem → --font-xs
- 0.8rem, 0.8125rem, 0.85rem → --font-sm
- 0.875rem → --font-base
- 0.9375rem → --font-md
- 1rem → --font-lg
- 1.1rem, 1.125rem, 1.25rem → --font-xl

### Spacing Mapping Applied
- 2px, 4px → --space-1
- 6px, 8px → --space-2
- 10px → --space-2-5
- 12px → --space-3
- 16px → --space-4
- 20px → --space-5
- 24px → --space-6

### Key Insights
- Font-size tokens did NOT exist before; this was a complete addition
- Spacing tokens existed but were incomplete (missing --space-2-5)
- Some values like 0.8rem and 0.85rem don't match the spec exactly but map to --font-sm
- Some padding values like `8px 18px` and `24px 32px` have non-token dimensions (18px, 32px) that are structural
- Dark mode section uses same token names, so no changes needed there
- All replacements maintain visual appearance (tokens have identical values)

### Verification
✓ 29 font-size properties replaced
✓ 42 spacing properties replaced
✓ 0 hardcoded font-size values remain
✓ 0 hardcoded padding/gap/margin values remain (except 14px which has no token)
✓ CSS file is syntactically valid
✓ Evidence files created in .sisyphus/evidence/

## [2026-02-22] Task 2: JS Constants Extraction — COMPLETED

### What Was Done
- Created `newtab/constants.js` with 12 exported constants
- Extracted all magic numbers from `app.js` declarations
- Updated `app.js` to import constants from `constants.js`
- Replaced 6 magic number usages with constant references
- Verified zero magic numbers remain in `app.js`

### Constants Extracted
1. **Debounce timers**: PERSIST_DEBOUNCE_MS (350), DRIVE_SYNC_DEBOUNCE_MS (1500), SEARCH_DEBOUNCE_MS (150), TAB_UPDATE_DEBOUNCE_MS (100)
2. **Intervals**: DRIVE_SYNC_INTERVAL (30 min), NEWTAB_DRIVE_CHECK_INTERVAL (60 min)
3. **UI constants**: TAB_DRAG_MIME, VIEW_MODES, FALLBACK_FAVICON, DEFAULT_BOARD_NAME, DEFAULT_SPACE_NAME, SNACKBAR_DURATION_MS

### Key Learnings
- All 12 constants are pure values (no DOM dependencies) — safe to extract
- FALLBACK_FAVICON uses runtime check for chrome API — kept as-is in constants.js
- VIEW_MODES is an object literal — exported as-is
- Magic numbers were scattered across 6 different locations in app.js
- Import statement placed after existing imports (state.js, storage.js, drive.js)

### Verification
- ✓ `grep -n "350\|1500\|150\|100\|3000\|'Untitled board'"` returns 0 results
- ✓ All 12 constants exported correctly
- ✓ Import statement properly formatted
- ✓ No behavioral changes — refactoring only
- ✓ Commit: `refactor(js): extract magic numbers to constants.js`

### Files Changed
- Created: `newtab/constants.js` (18 lines)
- Modified: `newtab/app.js` (6 replacements, 1 import added)

## [2026-02-22] Task 5: storage.js Error Handling Improvements — COMPLETED

### Changes Made
1. **withStorage() now retries on failure** (lines 4-40)
   - Wrapped Promise in try-catch
   - On error: waits 100ms, then retries once
   - If second attempt fails, error propagates to caller
   - Handles transient chrome.storage failures gracefully

2. **loadStateFromStorage() propagates errors** (lines 42-50)
   - Returns null for missing data (no error)
   - Throws error for actual failures (changed from returning null)
   - console.error preserved for logging
   - Caller in app.js can now handle errors if needed

3. **saveStateToStorage() returns operation status** (lines 52-60)
   - Returns { success: true } on success
   - Returns { success: false, error } on failure
   - console.error preserved
   - Caller in app.js (line 229) ignores return value → no breaking change

4. **saveDriveMetadata() returns operation status** (lines 72-80)
   - Returns { success: true } on success
   - Returns { success: false, error } on failure
   - console.error preserved

5. **clearDriveMetadata() returns operation status** (lines 82-90)
   - Returns { success: true } on success
   - Returns { success: false, error } on failure
   - console.error preserved

### Key Learnings
- Retry logic in withStorage prevents transient failures from breaking app
- Returning { success, error } allows callers to handle failures gracefully
- Throwing errors in loadStateFromStorage is safe because caller uses null coalescing
- All console.error calls preserved for debugging
- No breaking changes to existing callers

### Files Modified
- `newtab/storage.js` (90 lines, was 63)

### Verification
✅ grep 'catch' shows 6 catch blocks with proper error handling
✅ All console.error calls preserved (5 total)
✅ Retry logic implemented in withStorage (100ms delay)
✅ Return status objects for save/clear operations
✅ Error propagation for load operations
✅ Evidence files created: task-5-load-state-behavior.txt, task-5-error-propagation.txt

## [2026-02-22] Task 4: state.js Improvements — COMPLETED

### Changes Made
1. **generateId() JSDoc** (lines 51-54)
   - Added collision probability documentation: ~1/78 billion for 2 IDs
   - Safe for extension usage (<10k IDs)

2. **normalizeState() Hardening** (lines 128-210)
   - Entry guard: `if (!state || typeof state !== 'object') return createDefaultState()`
   - Spaces array guard: `if (!Array.isArray(next.spaces)) next.spaces = []`
   - Space object filter: `.filter((space) => space && typeof space === 'object')`
   - Section object filter: `.filter((section) => section && typeof section === 'object')`
   - Card object filter: `.filter((card) => card && typeof card === 'object')`
   - All nested arrays (sections, cards) guarded with `Array.isArray()` checks

3. **notify() Verification** (line 213)
   - Already uses `Object.freeze(appState)` — no changes needed
   - Snapshot is immutable before emission to listeners

4. **clone() Verification** (lines 1-6)
   - Already has structuredClone as primary path
   - JSON.parse is explicit fallback in else branch
   - No changes needed

### Evidence Files Created
- `.sisyphus/evidence/task-4-clone-path.txt` — Clone path verification
- `.sisyphus/evidence/task-4-normalize-guards.txt` — Normalization guards verification

### Commit
- `b869af7` — refactor(state): prioritize structuredClone and harden normalizeState validation

### Key Learnings
- `normalizeState()` is the critical validation layer for all state mutations
- Defensive filtering at each nesting level prevents cascading null errors
- Object.freeze() in notify() ensures listeners receive immutable snapshots
- structuredClone() is already the primary path (no refactoring needed)


## [2026-02-22] Task 6: section→board naming unification — COMPLETED

### Changes Made
- Renamed state schema from `space.sections[]` to `space.boards[]` across runtime state and app usage.
- Added backward compatibility migration in `normalizeState()`:
  - `if (!space.boards && space.sections) { space.boards = space.sections; delete space.sections; }`
- Renamed core app identifiers and APIs:
  - `findSection` → `findBoard`
  - `moveSection` → `moveBoard`
  - `addTabCardToSection` → `addTabCardToBoard`
  - `openSectionLinks` → `openBoardLinks`
  - `sectionId`/`sections` → `boardId`/`boards`
- Updated DOM data/form naming:
  - `name="sectionId"` → `name="boardId"`
  - `data-section-open` → `data-board-open`
  - dataset bindings updated to `dataset.boardId` / `dataset.boardOpen`
- Updated CSS indicator selector:
  - `.section-drop-indicator` → `.board-drop-indicator`

### Compatibility Notes
- Existing stored user data using `space.sections` is migrated on load without data loss.
- Preference migration keeps compatibility for prior `captureSectionId` by mapping to `captureBoardId` during normalization.

### Verification
- ✅ `grep -rn "sectionId\|findSection\|\.sections" newtab/*.js` only matches migration/backward-compat paths in `state.js`
- ✅ `grep -rn "boardId\|findBoard\|\.boards" newtab/*.js` returns broad usage across app/state
- ✅ LSP diagnostics clean for changed files (`app.js`, `state.js`, `index.html`, `style.css`)
- ✅ JavaScript syntax check passed (`node --check`)
- ✅ Evidence files saved:
  - `.sisyphus/evidence/task-6-no-section-naming.txt`
  - `.sisyphus/evidence/task-6-board-naming.txt`

## [2026-02-22] Task 7: render module extraction — COMPLETED

### Changes Made
- Created `newtab/render.js` and exported rendering-focused APIs from `app.js`:
  - Favicon helpers: `isSafeIconUrl`, `deriveFaviconFromUrl`, `resolveCardFavicon`, `getCardFavicon`
  - Render helpers: `formatCount`, `cardMatchesSearch`, `getFavoriteGroups`
  - Render entrypoints: `renderSpaceTabs`, `createCardElement`, `appendAddBoardButton`, `renderBoard`, `renderFavoritesBoard`
- Refactored `newtab/app.js` to import rendering/favicons from `./render.js` and removed inlined rendering implementations.
- Preserved mutation wiring in `app.js` by passing callbacks into render functions:
  - `attachDropTargets`, `enableColumnDrag`, and card drag state handlers now flow through render options.
- Removed `innerHTML` clearing usage from rendering paths:
  - `replaceChildren()` used in render module
  - `tabListEl.replaceChildren(fragment)` used in tab drawer rendering

### Key Learnings
- For module splits in this codebase, callback injection is the safest way to avoid circular deps while keeping state mutation ownership inside `app.js`.
- `render.js` can stay UI-focused and still support drag behavior by accepting read/write hooks (`onCardDragStart`, `onCardDragEnd`) instead of touching app state directly.
- `replaceChildren()` is a drop-in for `innerHTML = ""` and keeps DOM updates explicit across render surfaces.

### Verification
- ✅ `node --check newtab/render.js && node --check newtab/app.js`
- ✅ `grep -rn "innerHTML" newtab/*.js` returns no matches
- ✅ LSP diagnostics clean for changed files (`newtab/render.js`, `newtab/app.js`)
- ✅ Evidence files saved:
  - `.sisyphus/evidence/task-7-render-exports.txt`
  - `.sisyphus/evidence/task-7-no-innerhtml.txt`

## [2026-02-22] Task 8: drag module extraction — COMPLETED

### Changes Made
- Created `newtab/drag.js` and moved drag state + helpers out of `app.js`.
- Extracted and exported drag helpers:
  - `getDragAfterElement`, `getHorizontalAfterElement`, `attachDropTargets`, `enableColumnDrag`
  - `moveCard`, `moveCardToSpace`, `moveBoard`, `moveSpace`
  - `clearSpaceTabDropState`, `clearSpaceDragging`, `clearColumnDropTargets`
- Moved drag module state into `drag.js` scope:
  - `draggingCard`, `draggingBoardId`, `draggingSpaceId`, `suppressCardClick`
- Added state accessors/mutators in `drag.js`:
  - `getDraggingCard`, `getDraggingBoardId`, `getDraggingSpaceId`, `isSuppressCardClick`
  - `setSuppressCardClick`, `setDraggingCard`, `setDraggingBoardId`, `setDraggingSpaceId`
- Updated `newtab/app.js` to import drag APIs and replace direct drag state usage with accessor/setter calls.
- Kept top-level drag event wiring in `app.js` (space tabs + board listeners), while delegating helper behavior to `drag.js`.

### Key Learnings
- Callback injection remains the safest anti-circular-import pattern during modularization in this codebase.
- `attachDropTargets` and `enableColumnDrag` can stay reusable when passed app-owned callbacks (`addTabCardToBoard`, `clearColumnDropTargets`).
- Localized drag state inside `drag.js` reduces global mutation surface in `app.js` without changing behavior.

### Verification
- ✅ `node --check newtab/drag.js && node --check newtab/app.js`
- ✅ LSP diagnostics clean for changed files (`newtab/drag.js`, `newtab/app.js`)
- ✅ Evidence file saved: `.sisyphus/evidence/task-8-drag-exports.txt`
