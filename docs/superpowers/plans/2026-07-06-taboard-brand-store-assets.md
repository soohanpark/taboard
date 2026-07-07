# Taboard Brand and Store Assets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Taboard's extension icon and README banner with the approved Control Deck identity, then generate a complete, verified Chrome Web Store image set from real Taboard UI captures.

**Architecture:** Keep the brand geometry in a deterministic SVG master and export exact-size PNG files with a small Node/FFmpeg asset pipeline. Capture the real new-tab application through a local HTTP server that injects an isolated Chrome API mock and synthetic demo state before loading the unchanged production modules; compose those captures into branded, full-bleed store screenshots. Validate every raster's PNG signature, dimensions, transparency contract, manifest references, and scenario metadata with Node's built-in test runner.

**Tech Stack:** SVG, Node.js ES modules and built-in test runner, FFmpeg SVG rasterization, headless Google Chrome, existing vanilla JS/CSS extension UI.

---

## File Map

- Create `icons/source/control-deck.svg`: editable canonical icon geometry and palette.
- Create `scripts/generate-brand-assets.mjs`: render icon sizes, README banner, promo tiles, and framed store screenshots from SVG templates.
- Create `scripts/store-capture-scenarios.mjs`: single source of truth for five synthetic capture states and English headlines.
- Create `scripts/capture-store-assets.mjs`: serve the repository with capture-only bootstrap injection and run headless Chrome for each scenario.
- Create `store-assets/source/capture-bootstrap.js`: browser-side Chrome API mock and synthetic state selection.
- Create `store-assets/README.md`: upload mapping and regeneration commands.
- Create `test/brand-assets.test.mjs`: dimensions, alpha, palette, manifest, and store output contract tests.
- Modify `package.json`: add reproducible asset commands without changing the extension runtime.
- Modify `manifest.json`: declare the new 32 px icon.
- Modify `manifest.example.json`: mirror the 32 px declaration.
- Replace `icons/origin.png`, `icons/icon16.png`, `icons/icon48.png`, `icons/icon128.png`, and `icons/banner.png`.
- Create `icons/icon32.png`.
- Create `store-assets/screenshots/01-overview.png` through `05-local-first-sync.png`.
- Create `store-assets/promo/small-promo-440x280.png` and `store-assets/promo/marquee-1400x560.png`.

Raw browser captures go under ignored `store-assets/.work/` and are never treated as deliverables.

### Task 1: Lock the icon and raster contracts with tests

**Files:**
- Create: `test/brand-assets.test.mjs`
- Modify: `package.json`

- [ ] **Step 1: Add a PNG contract helper and failing icon tests**

Create a test file that parses the PNG IHDR without adding dependencies:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");

const readPng = async (relativePath) => {
  const bytes = await readFile(path.join(root, relativePath));
  assert.deepEqual(
    [...bytes.subarray(0, 8)],
    [137, 80, 78, 71, 13, 10, 26, 10],
    `${relativePath} must be PNG`,
  );
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
    colorType: bytes[25],
  };
};

test("extension icons have exact dimensions and alpha", async () => {
  for (const size of [16, 32, 48, 128]) {
    const png = await readPng(`icons/icon${size}.png`);
    assert.deepEqual([png.width, png.height], [size, size]);
    assert.ok([4, 6].includes(png.colorType), `icon${size}.png needs alpha`);
  }
  const origin = await readPng("icons/origin.png");
  assert.deepEqual([origin.width, origin.height], [1024, 1024]);
});

test("brand master contains the approved palette and control-deck parts", async () => {
  const svg = await readFile(
    path.join(root, "icons/source/control-deck.svg"),
    "utf8",
  );
  for (const color of ["#0B1324", "#2F6BFF", "#F7FAFF"]) {
    assert.match(svg, new RegExp(color, "i"));
  }
  for (const id of ["tab-strip", "tab-drawer", "board-primary", "board-secondary"]) {
    assert.match(svg, new RegExp(`id=["']${id}["']`));
  }
});

test("both manifests declare every generated icon", async () => {
  for (const file of ["manifest.json", "manifest.example.json"]) {
    const manifest = JSON.parse(await readFile(path.join(root, file), "utf8"));
    assert.deepEqual(manifest.icons, {
      16: "icons/icon16.png",
      32: "icons/icon32.png",
      48: "icons/icon48.png",
      128: "icons/icon128.png",
    });
  }
});
```

- [ ] **Step 2: Add asset commands to `package.json`**

Keep the existing test script and add:

```json
"assets:generate": "node scripts/generate-brand-assets.mjs",
"assets:capture": "node scripts/capture-store-assets.mjs",
"assets:verify": "node --test test/brand-assets.test.mjs"
```

- [ ] **Step 3: Run the icon contract tests and confirm the intended failure**

Run: `npm run assets:verify`

Expected: FAIL because `icons/source/control-deck.svg` and `icons/icon32.png` do not exist and the manifests do not declare size 32.

### Task 2: Implement the Control Deck master and static asset renderer

**Files:**
- Create: `icons/source/control-deck.svg`
- Create: `scripts/generate-brand-assets.mjs`
- Modify: `manifest.json`
- Modify: `manifest.example.json`
- Replace: `icons/origin.png`
- Replace: `icons/icon16.png`
- Create: `icons/icon32.png`
- Replace: `icons/icon48.png`
- Replace: `icons/icon128.png`
- Replace: `icons/banner.png`
- Create: `store-assets/promo/small-promo-440x280.png`
- Create: `store-assets/promo/marquee-1400x560.png`

- [ ] **Step 1: Author the canonical SVG**

Use a `128×128` viewBox. Center a `96×96` rounded-square visual area at `(16,16)`. Add exactly four named foreground parts:

```svg
<rect id="tab-strip" x="36" y="35" width="56" height="13" rx="4" fill="#2F6BFF"/>
<rect id="tab-drawer" x="36" y="55" width="17" height="38" rx="4" fill="#F7FAFF"/>
<rect id="board-primary" x="60" y="55" width="32" height="15" rx="4" fill="#F7FAFF"/>
<rect id="board-secondary" x="60" y="78" width="32" height="15" rx="4" fill="#2F6BFF"/>
```

The background is a rounded rectangle from `(16,16)` to `(112,112)` using the Midnight gradient, and the rest of the canvas is transparent.

- [ ] **Step 2: Implement deterministic SVG templates and FFmpeg export**

`scripts/generate-brand-assets.mjs` must:

1. Resolve the repository root from `import.meta.dirname`.
2. Verify `/opt/homebrew/bin/ffmpeg` or `ffmpeg` is available with `spawnSync`.
3. Create required output directories with `mkdir({ recursive: true })`.
4. Rasterize SVG files with `ffmpeg -y -i <svg> -frames:v 1 <png>`.
5. Render `origin.png` at 1024×1024 and icon PNGs at 16, 32, 48, and 128 px.
6. Use a simplified flat background for the 16 px export while keeping identical foreground geometry.
7. Render the 1024×358 README banner with the icon, `Taboard`, and `Tabs, organized.`
8. Render the 440×280 small promo with the icon, `Taboard`, and `Tabs, organized.`
9. Render the 1400×560 marquee with `Taboard`, `Make every tab count.`, and the first real UI capture when available; until capture generation, render only the brand side and fail clearly if the final command is invoked without the capture.

Use system sans-serif fallbacks in SVG (`-apple-system, BlinkMacSystemFont, Arial, sans-serif`) and no remote resources.

- [ ] **Step 3: Add the 32 px icon to both manifests**

The icon object in each manifest becomes:

```json
"icons": {
  "16": "icons/icon16.png",
  "32": "icons/icon32.png",
  "48": "icons/icon48.png",
  "128": "icons/icon128.png"
}
```

- [ ] **Step 4: Generate static assets**

Run: `npm run assets:generate -- --static-only`

Expected: icon files, README banner, and small promo are written; the command exits 0 without requiring browser captures.

- [ ] **Step 5: Run icon and manifest tests**

Run: `npm run assets:verify`

Expected: icon, palette, source geometry, and manifest tests PASS; store screenshot tests have not been added yet.

- [ ] **Step 6: Inspect icon outputs**

Use the image viewer on `icons/icon16.png`, `icons/icon48.png`, `icons/icon128.png`, and `icons/banner.png`. Confirm the four panels stay distinct, no edge is clipped, and the icon remains identifiable against both white and `#20242D` backgrounds.

- [ ] **Step 7: Commit the identity assets**

```bash
git add package.json manifest.json manifest.example.json icons scripts/generate-brand-assets.mjs test/brand-assets.test.mjs store-assets/promo/small-promo-440x280.png
git commit -m "feat: replace taboard brand icon"
```

### Task 3: Build the real-UI capture harness

**Files:**
- Create: `scripts/store-capture-scenarios.mjs`
- Create: `scripts/capture-store-assets.mjs`
- Create: `store-assets/source/capture-bootstrap.js`
- Modify: `test/brand-assets.test.mjs`

- [ ] **Step 1: Add failing scenario metadata tests**

Append a test that imports `captureScenarios` and asserts the stable story:

```js
test("store capture scenarios cover the approved five-part story", async () => {
  const { captureScenarios } = await import(
    "../scripts/store-capture-scenarios.mjs"
  );
  assert.deepEqual(
    captureScenarios.map(({ id, headline }) => [id, headline]),
    [
      ["overview", "Your new tab, under control."],
      ["save-tabs", "Turn open tabs into useful cards."],
      ["card-types", "Organize links, notes, and todos."],
      ["search", "Find anything across every space."],
      ["local-first-sync", "Local first. Backed up when you choose."],
    ],
  );
  assert.ok(captureScenarios.every(({ state, tabs }) => state && tabs.length >= 3));
});
```

- [ ] **Step 2: Run the scenario test and confirm failure**

Run: `npm run assets:verify`

Expected: FAIL with module-not-found for `scripts/store-capture-scenarios.mjs`.

- [ ] **Step 3: Define five deterministic synthetic scenarios**

Export `captureScenarios` with these fields for every entry:

```js
{
  id,
  filename,
  headline,
  supportingCopy,
  state,
  tabs,
  afterRender,
}
```

Use stable IDs and timestamps, two spaces named `Focus` and `Personal`, boards named `Research queue`, `Today`, and `Ideas`, and realistic but fictional links, notes, and todos. Set `tabDrawerPinned: true` for `save-tabs`, `searchTerm: "research"` for `search`, and `afterRender: "open-drive-menu"` for `local-first-sync`. Do not include real email addresses, account names, browsing history, OAuth tokens, or user data.

- [ ] **Step 4: Implement the capture bootstrap**

Before `newtab/app.js` loads, `capture-bootstrap.js` must parse `?capture=<id>`, obtain the matching serialized scenario exposed by the local server, and define `globalThis.chrome` with:

- `runtime.lastError` and `runtime.getURL()`.
- callback-style `storage.local.get/set/remove` backed by the scenario state.
- no-op `storage.onChanged` listener registration.
- callback-style `tabs.query/update/remove/create/group` using the scenario tabs.
- no-op tab event listener objects for every event used in `newtab/tabs.js`.
- `windows.getCurrent`, `tabGroups.update`, and disconnected `identity.getAuthToken` behavior.

After the app renders, execute the scenario's `afterRender` action. For `open-drive-menu`, click `#drive-connect`. Set `document.documentElement.dataset.captureReady = "true"` only after fonts and two animation frames settle.

- [ ] **Step 5: Implement the local server and Chrome runner**

`capture-store-assets.mjs` must:

1. Bind an ephemeral localhost port.
2. Serve repository files with explicit MIME types.
3. Intercept `/newtab/index.html`, inject the capture bootstrap and scenario JSON before `app.js`, and otherwise preserve the production markup.
4. Launch `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome` with an isolated temporary profile, `--headless=new`, `--hide-scrollbars`, `--force-device-scale-factor=1`, `--window-size=1280,620`, and `--virtual-time-budget=2500`.
5. Capture each scenario to `store-assets/.work/<filename>.png`.
6. Close the server and remove the temporary Chrome profile in `finally`.
7. Reject non-zero Chrome exits, missing screenshots, unexpected dimensions, page errors, and any request outside localhost except the existing optional font request, which may fail without blocking capture.

- [ ] **Step 6: Run the capture harness**

Run: `npm run assets:capture -- --raw-only`

Expected: five 1280×620 raw UI captures appear under `store-assets/.work/`, all using synthetic data.

- [ ] **Step 7: Inspect all raw captures**

Confirm the captures are the actual current Taboard UI, contain no personal information, and show the intended states. If a state cannot be represented by the real application, adjust only the scenario or after-render action—never draw a fictional UI state.

- [ ] **Step 8: Run automated tests**

Run: `npm run assets:verify`

Expected: scenario metadata and existing brand tests PASS.

- [ ] **Step 9: Commit the capture harness**

```bash
git add scripts/store-capture-scenarios.mjs scripts/capture-store-assets.mjs store-assets/source/capture-bootstrap.js test/brand-assets.test.mjs package.json
git commit -m "build: add store screenshot capture harness"
```

### Task 4: Compose and verify the final Chrome Web Store set

**Files:**
- Modify: `scripts/generate-brand-assets.mjs`
- Modify: `test/brand-assets.test.mjs`
- Create: `store-assets/screenshots/01-overview.png`
- Create: `store-assets/screenshots/02-save-tabs.png`
- Create: `store-assets/screenshots/03-card-types.png`
- Create: `store-assets/screenshots/04-search.png`
- Create: `store-assets/screenshots/05-local-first-sync.png`
- Create: `store-assets/promo/marquee-1400x560.png`

- [ ] **Step 1: Add failing final-output dimension tests**

Append exact contracts:

```js
test("Chrome Web Store outputs have exact dimensions", async () => {
  const expected = new Map([
    ["store-assets/screenshots/01-overview.png", [1280, 800]],
    ["store-assets/screenshots/02-save-tabs.png", [1280, 800]],
    ["store-assets/screenshots/03-card-types.png", [1280, 800]],
    ["store-assets/screenshots/04-search.png", [1280, 800]],
    ["store-assets/screenshots/05-local-first-sync.png", [1280, 800]],
    ["store-assets/promo/small-promo-440x280.png", [440, 280]],
    ["store-assets/promo/marquee-1400x560.png", [1400, 560]],
    ["icons/banner.png", [1024, 358]],
  ]);
  for (const [file, dimensions] of expected) {
    const png = await readPng(file);
    assert.deepEqual([png.width, png.height], dimensions, file);
  }
});
```

- [ ] **Step 2: Confirm the final-output test fails**

Run: `npm run assets:verify`

Expected: FAIL because the five final screenshots and marquee do not exist.

- [ ] **Step 3: Implement screenshot composition**

Extend `generate-brand-assets.mjs` to create a 1280×800 full-bleed SVG for each scenario:

- Midnight gradient background.
- `TABOARD` eyebrow in cobalt.
- Approved headline and at most one supporting line.
- The corresponding 1280×620 raw capture placed at `x=40`, `y=148`, `width=1200`, with square outer image corners and a subtle border/shadow inside the full-bleed canvas.
- No badges, ratings, rankings, testimonials, or unsupported claims.

Embed raw captures as base64 data URIs so FFmpeg rendering has no external asset resolution dependency.

- [ ] **Step 4: Implement the marquee composition**

Render a 1400×560 full-bleed image with the Control Deck icon and wordmark on the left, `Make every tab count.`, and the overview raw capture on the right. Keep copy under two short lines and ensure the UI remains identifiable at half size.

- [ ] **Step 5: Generate final outputs**

Run: `npm run assets:capture`

Expected: the harness refreshes raw captures, invokes the generator, and writes all five screenshots plus both promotional images.

- [ ] **Step 6: Run dimension and contract tests**

Run: `npm run assets:verify`

Expected: all asset tests PASS.

- [ ] **Step 7: Verify downscaled presentation**

Use FFmpeg to create temporary 640×400 screenshot previews and half-size promo previews under `/private/tmp/taboard-asset-review/`. Inspect the first and fifth screenshot, small promo, and marquee with the image viewer. Confirm headline readability, product dominance, edge definition, and brand consistency.

- [ ] **Step 8: Commit final store assets**

```bash
git add scripts/generate-brand-assets.mjs test/brand-assets.test.mjs store-assets/screenshots store-assets/promo icons/banner.png
git commit -m "feat: add Chrome Web Store image set"
```

### Task 5: Document, rebuild the graph, and perform final verification

**Files:**
- Create: `store-assets/README.md`
- Modify: `graphify-out/` only if the mandated graph rebuild produces tracked changes.

- [ ] **Step 1: Document upload mapping and regeneration**

`store-assets/README.md` must list:

- Store icon: `../icons/icon128.png`.
- Screenshot upload order 01 through 05.
- Small promo and marquee file paths.
- `npm run assets:capture` as the complete regeneration command.
- `npm run assets:verify` as the validation command.
- A warning that `.work/` contains disposable synthetic captures and must not be uploaded.

- [ ] **Step 2: Ignore raw capture artifacts**

Add `store-assets/.work/` to `.gitignore` if repository status shows it as untracked. Do not add or modify rules for the user's unrelated `.memsearch/` or `.superpowers/` directories.

- [ ] **Step 3: Rebuild the project graph after script code changes**

Run:

```bash
python3 -c "from graphify.watch import _rebuild_code; from pathlib import Path; _rebuild_code(Path('.'))"
```

Expected: graph rebuild completes successfully. Review generated changes before staging them.

- [ ] **Step 4: Run the full repository test suite**

Run: `npm test`

Expected: all existing and new tests PASS.

- [ ] **Step 5: Run asset regeneration and verification from a clean raw-capture directory**

Remove only `store-assets/.work/`, then run:

```bash
npm run assets:capture
npm run assets:verify
```

Expected: all uploadable assets are recreated and every contract passes.

- [ ] **Step 6: Validate repository state and manifest JSON**

Run:

```bash
node -e "JSON.parse(require('fs').readFileSync('manifest.json')); JSON.parse(require('fs').readFileSync('manifest.example.json'))"
git diff --check
git status --short --branch
```

Expected: valid JSON, no whitespace errors, current branch is `feat/taboard-brand-assets`, and only intended implementation files are modified or staged. `.memsearch/` and `.superpowers/` remain untouched and untracked.

- [ ] **Step 7: Perform final visual review**

Inspect all icon sizes, the README banner, all five screenshots, the small promo, and the marquee. Check small-size legibility, synthetic-only content, correct copy, no clipping, no unexpected font substitution, and no mismatch with the current Taboard UI.

- [ ] **Step 8: Commit documentation and any verified graph changes**

```bash
git add .gitignore store-assets/README.md graphify-out
git commit -m "docs: document store asset publishing"
```

If `.gitignore` or `graphify-out/` has no intended change, omit that path from `git add` rather than creating a no-op edit.

