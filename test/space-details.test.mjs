import test from "node:test";
import assert from "node:assert/strict";
import {
  applySpaceDetails,
  getAccentTextColor,
  getRandomAccent,
  SPACE_ACCENT_PALETTE,
} from "../newtab/state.js";

test("space details update the name and selected accent together", () => {
  const space = {
    id: "space-a",
    name: "Personal",
    accent: "#2563eb",
    updatedAt: "2026-09-20T00:00:00.000Z",
  };

  const updated = applySpaceDetails(
    space,
    { name: "Studio", accent: "#ec4899" },
    "2026-09-21T00:00:00.000Z",
  );

  assert.equal(updated, true);
  assert.deepEqual(space, {
    id: "space-a",
    name: "Studio",
    accent: "#ec4899",
    updatedAt: "2026-09-21T00:00:00.000Z",
  });
});

test("space details preserve the current accent when a value is unsupported", () => {
  const space = {
    id: "space-a",
    name: "Personal",
    accent: "#10b981",
  };

  applySpaceDetails(space, { name: "Work", accent: "invalid" }, "now");

  assert.equal(space.name, "Work");
  assert.equal(space.accent, "#10b981");
});

test("random space accents always come from the editable palette", () => {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    assert.ok(SPACE_ACCENT_PALETTE.includes(getRandomAccent()));
  }
});

test("every editable accent receives readable button text", () => {
  const luminance = (hex) => {
    const [red, green, blue] = hex.match(/[0-9a-f]{2}/gi).map((channel) => {
      const value = Number.parseInt(channel, 16) / 255;
      return value <= 0.04045
        ? value / 12.92
        : ((value + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  };

  for (const accent of SPACE_ACCENT_PALETTE) {
    const text = getAccentTextColor(accent);
    const lighter = Math.max(luminance(accent), luminance(text));
    const darker = Math.min(luminance(accent), luminance(text));
    assert.ok(
      (lighter + 0.05) / (darker + 0.05) >= 4.5,
      `${accent} must keep button text readable`,
    );
  }
});
