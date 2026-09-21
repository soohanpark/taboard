import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(
  new URL("../newtab/index.html", import.meta.url),
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
