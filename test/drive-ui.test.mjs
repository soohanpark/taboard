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

describe("resolveStartupSyncAction decision matrix", () => {
  const resolve = (overrides) =>
    driveUi.resolveStartupSyncAction({
      remoteHasContent: true,
      localHasContent: true,
      localHasCards: true,
      dirty: false,
      remoteUnchangedSinceLastSync: false,
      contentDiffers: true,
      reason: "startup",
      ...overrides,
    });

  test("fresh profile vs populated remote adopts Drive (68b19ba protection)", () => {
    assert.equal(resolve({}), "adopt");
  });

  test("empty remote is seeded from local, even structure-only local", () => {
    assert.equal(resolve({ remoteHasContent: false }), "seed");
    assert.equal(
      resolve({ remoteHasContent: false, localHasCards: false }),
      "seed",
    );
  });

  test("both sides empty is a no-op adopt", () => {
    assert.equal(
      resolve({
        remoteHasContent: false,
        localHasContent: false,
        localHasCards: false,
      }),
      "adopt",
    );
  });

  test("dirty local pushes first when no other device wrote since", () => {
    assert.equal(
      resolve({ dirty: true, remoteUnchangedSinceLastSync: true }),
      "push-local",
    );
  });

  test("dirty local loses to a remote another device updated (Drive-first)", () => {
    assert.equal(
      resolve({ dirty: true, remoteUnchangedSinceLastSync: false }),
      "adopt",
    );
  });

  test("connect over real local cards asks before adopting", () => {
    assert.equal(resolve({ reason: "connect" }), "confirm-adopt");
  });

  test("connect does not ask when content matches or local has no cards", () => {
    assert.equal(
      resolve({ reason: "connect", contentDiffers: false }),
      "adopt",
    );
    assert.equal(resolve({ reason: "connect", localHasCards: false }), "adopt");
  });
});
