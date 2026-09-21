import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  getNextThemePreference,
  normalizeThemePreference,
  resolveTheme,
} from "../newtab/theme.js";

const html = await readFile(
  new URL("../newtab/index.html", import.meta.url),
  "utf8",
);
const css = await readFile(
  new URL("../newtab/style.css", import.meta.url),
  "utf8",
);

test("theme preference defaults to the system setting", () => {
  assert.equal(normalizeThemePreference(null), "system");
  assert.equal(normalizeThemePreference("unknown"), "system");
  assert.equal(resolveTheme("system", false), "light");
  assert.equal(resolveTheme("system", true), "dark");
});

test("theme control cycles through system, light, and dark", () => {
  assert.equal(getNextThemePreference("system"), "light");
  assert.equal(getNextThemePreference("light"), "dark");
  assert.equal(getNextThemePreference("dark"), "system");
});

test("theme switcher is accessible and both explicit themes are styled", () => {
  assert.match(html, /id="theme-toggle"/);
  assert.match(html, /aria-label="Theme: System\. Switch to Light"/);
  assert.match(html, /src="theme\.js"/);
  assert.match(css, /html\[data-theme="dark"\]/);
  assert.match(css, /--bg-page:[\s\S]*#f1f3f6/);
  assert.doesNotMatch(css, /@media \(prefers-color-scheme: dark\)/);
});

test("legacy dark styles cannot override the transparent board column", () => {
  assert.match(css, /:where\(html\[data-theme="dark"\]\)/);
  assert.match(css, /\.column\s*\{[\s\S]*?background:\s*transparent/);
});
