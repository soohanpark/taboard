import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(
  new URL("../newtab/index.html", import.meta.url),
  "utf8",
);
const css = await readFile(
  new URL("../newtab/style.css", import.meta.url),
  "utf8",
);
const modals = await readFile(
  new URL("../newtab/modals.js", import.meta.url),
  "utf8",
);
const render = await readFile(
  new URL("../newtab/render.js", import.meta.url),
  "utf8",
);

test("card editor exposes card types as an accessible segmented choice", () => {
  assert.doesNotMatch(html, /<select[^>]*name="type"/);
  assert.match(html, /<fieldset class="card-type-field">/);
  assert.match(html, /type="radio" name="type" value="link"/);
  assert.match(html, /type="radio" name="type" value="note"/);
  assert.match(html, /type="radio" name="type" value="todo"/);
});

test("search uses one integrated control without a separate focus button", () => {
  assert.match(
    html,
    /<div class="search-control" id="search-control" role="search">/,
  );
  assert.match(html, /class="search-icon"/);
  assert.match(html, /id="search-shortcut"/);
  assert.match(html, /id="search-clear"/);
  assert.doesNotMatch(html, /id="search-focus"/);
});

test("brand lockup uses the packaged extension logo", () => {
  assert.match(html, /src="\.\.\/icons\/icon32\.png"/);
});

test("header keeps one GitHub destination without a duplicate action button", () => {
  assert.match(
    html,
    /class="brand-lockup"[\s\S]*href="https:\/\/github\.com\/soohanpark\/taboard"/,
  );
  assert.doesNotMatch(html, /class="icon-button github-button"/);
});

test("hidden search affordances stay out of layout", () => {
  assert.match(
    css,
    /\.search-shortcut\[hidden\],[\s\S]*\.search-clear\[hidden\]/,
  );
});

test("collapsed board sidebar reserves space for its expand control", () => {
  assert.match(
    css,
    /\.board-sidebar-collapsed \+ \.board-detail \.column-header[\s\S]*padding-inline-start:\s*42px/,
  );
});

test("button hierarchy distinguishes primary, secondary, and danger actions", () => {
  assert.match(html, /class="button-primary">Save<\/button>/);
  assert.match(html, /class="ghost-button button-secondary"/);
  assert.match(html, /class="button-danger-solid"/);
  assert.match(css, /--button-height:\s*42px/);
  assert.match(css, /--button-danger:/);
});

test("creation controls keep compact intentional geometry", () => {
  assert.match(css, /#add-space-tab[\s\S]*white-space:\s*nowrap/);
  assert.match(css, /\.add-card-wrapper[\s\S]*width:\s*fit-content/);
  assert.match(css, /\.add-card[\s\S]*min-width:\s*126px/);
});

test("dark favorites selection keeps a high-contrast dedicated treatment", () => {
  assert.match(
    css,
    /html\[data-theme="dark"\] \.space-tab-favorites\.active[\s\S]*background:\s*linear-gradient[\s\S]*color:\s*#2b1c00/,
  );
});

test("icon-only dynamic buttons expose accessible names", () => {
  assert.match(render, /setAttribute\("aria-label", "Favorites"\)/);
  assert.match(render, /setAttribute\("aria-label", "Create space"\)/);
  assert.match(render, /setAttribute\("aria-label", "Delete board"\)/);
});

test("modal buttons receive trapped focus and restore their launch point", () => {
  assert.match(modals, /focusModal\(confirmModalEl, confirmCancelBtn\)/);
  assert.match(modals, /const keepFocusInModal = \(event\) =>/);
  assert.match(modals, /restoreModalFocus\(confirmModalEl\)/);
  assert.match(
    css,
    /:focus-visible[\s\S]*outline:\s*2px solid var\(--button-focus\)/,
  );
});
