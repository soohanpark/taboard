import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
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
  for (const id of [
    "tab-strip",
    "tab-drawer",
    "board-primary",
    "board-secondary",
  ]) {
    assert.match(svg, new RegExp(`id=["']${id}["']`));
  }
});

test("tracked and local manifests declare every generated icon", async () => {
  const files = ["manifest.example.json"];
  try {
    await access(path.join(root, "manifest.json"));
    files.push("manifest.json");
  } catch {
    // A clean checkout intentionally excludes the OAuth-bearing local manifest.
  }
  for (const file of files) {
    const manifest = JSON.parse(await readFile(path.join(root, file), "utf8"));
    assert.deepEqual(manifest.icons, {
      16: "icons/icon16.png",
      32: "icons/icon32.png",
      48: "icons/icon48.png",
      128: "icons/icon128.png",
    });
  }
});

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
  assert.ok(
    captureScenarios.every(({ state, tabs }) => state && tabs.length >= 3),
  );
  assert.equal(
    captureScenarios.find(({ id }) => id === "search")?.afterRender,
    null,
  );
  assert.equal(
    captureScenarios.find(({ id }) => id === "local-first-sync")?.afterRender,
    "open-drive-menu",
  );
  assert.ok(captureScenarios.every(({ now }) => Number.isFinite(now)));
  const syncScenario = captureScenarios.find(
    ({ id }) => id === "local-first-sync",
  );
  assert.equal(
    syncScenario.now - syncScenario.state.preferences.lastSyncAt,
    20 * 60 * 1000,
  );
});

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

test("store and README marketing images are opaque RGB PNGs", async () => {
  const files = [
    "store-assets/screenshots/01-overview.png",
    "store-assets/screenshots/02-save-tabs.png",
    "store-assets/screenshots/03-card-types.png",
    "store-assets/screenshots/04-search.png",
    "store-assets/screenshots/05-local-first-sync.png",
    "store-assets/promo/small-promo-440x280.png",
    "store-assets/promo/marquee-1400x560.png",
    "icons/banner.png",
  ];
  for (const file of files) {
    assert.equal((await readPng(file)).colorType, 2, `${file} must be RGB`);
  }
});

test("capture bootstrap disables motion for deterministic screenshots", async () => {
  const bootstrap = await readFile(
    path.join(root, "store-assets/source/capture-bootstrap.js"),
    "utf8",
  );
  assert.match(bootstrap, /transition-duration:\s*0s\s*!important/);
  assert.match(bootstrap, /animation-duration:\s*0s\s*!important/);
});
