import assert from "node:assert/strict";
import { describe, test } from "node:test";

const createElementStub = () => ({
  addEventListener() {},
  classList: {
    add() {},
    remove() {},
    toggle() {},
  },
  elements: {},
  querySelector() {
    return createElementStub();
  },
  setAttribute() {},
  textContent: "",
});

globalThis.document = {
  getElementById() {
    return createElementStub();
  },
  addEventListener() {},
};

globalThis.chrome = {};

const driveUi = await import("../newtab/drive-ui.js");

describe("drive-ui Drive-first API", () => {
  test("exposes the new public surface", () => {
    assert.equal(typeof driveUi.scheduleDriveSync, "function");
    assert.equal(typeof driveUi.pullDriveOnStartup, "function");
    assert.equal(typeof driveUi.pullDrivePeriodic, "function");
    assert.equal(typeof driveUi.runManualSync, "function");
    assert.equal(typeof driveUi.setBootstrapSuppress, "function");
    assert.equal(typeof driveUi.startDriveBackgroundSync, "function");
    assert.equal(typeof driveUi.stopDriveBackgroundSync, "function");
    assert.equal(typeof driveUi.handleDriveUpdate, "function");
    assert.equal(typeof driveUi.schedulePersist, "function");
  });

  test("legacy merge-based helpers are removed", () => {
    // The bidirectional merge logic was the source of the
    // new-browser-overwrites-Drive bug and is intentionally gone.
    assert.equal(driveUi.mergeStates, undefined);
    assert.equal(driveUi.shouldRethrowSyncError, undefined);
  });

  test("setBootstrapSuppress is callable without throwing", () => {
    assert.doesNotThrow(() => driveUi.setBootstrapSuppress(true));
    assert.doesNotThrow(() => driveUi.setBootstrapSuppress(false));
  });
});
