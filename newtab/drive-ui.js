import {
  getState,
  isDefaultSeedState,
  replaceState,
  updateState,
} from "./state.js";
import {
  saveStateToStorage,
  loadDriveDirtyFlag,
  saveDriveDirtyFlag,
  onDriveDirtyFlagChanged,
} from "./storage.js";
import {
  connectDrive,
  disconnectDrive,
  getDriveFileModifiedTime,
  getDriveSnapshot,
  pullFromDrive,
  pushToDrive,
  stripFavicons,
} from "./drive.js";
import { openConfirm, showSnackbar } from "./modals.js";
import {
  PERSIST_DEBOUNCE_MS,
  DRIVE_SYNC_DEBOUNCE_MS,
  DRIVE_SYNC_INTERVAL,
} from "./constants.js";

const driveControl = document.getElementById("drive-control");
const driveConnectBtn = document.getElementById("drive-connect");
const driveMenuEl = document.getElementById("drive-menu");
const driveMenuStatusEl = document.getElementById("drive-menu-status");
const driveMenuSyncBtn = document.getElementById("drive-menu-sync");
const driveMenuDisconnectBtn = document.getElementById("drive-menu-disconnect");

let saveTimer = null;
let pendingSaveState = null;
let driveTimer = null;
let driveSyncIntervalId = null;
let syncQueue = [];
let syncInFlight = false;
let isDriveSyncSuppressed = false;
// Drive is the source of truth: this is the spaces JSON we last successfully
// pulled from or pushed to Drive. Until we have a value, no push fires —
// otherwise a startup that hasn't yet pulled would overwrite Drive data.
let lastResolvedSpacesHash = null;
let pendingPushState = null;
let initialized = false;
let driveMenuOpen = false;

const SYNC_TIMEOUT_MS = 30000;

const computeSpacesHash = (state) => JSON.stringify(state?.spaces ?? []);

// Pushes strip favicons while local normalization guarantees them, so a
// remote state never hashes equal to a local one under computeSpacesHash.
// Any local-vs-remote content comparison must use this instead.
const comparableSpacesHash = (state) => computeSpacesHash(stripFavicons(state));

// Spaces hash of the last system-applied state (storage load or remote
// adopt). While pushes are gated (lastResolvedSpacesHash === null, e.g. the
// startup pull failed), edits are diffed against this baseline so the dirty
// marker still gets written and the session's changes survive the next
// Drive-first startup.
let dirtyBaselineSpacesHash = null;

// Any user structure counts as content, not just cards — adopting an empty
// remote file must never wipe a local space/board layout that has no cards yet.
const stateHasContent = (state) => (state?.spaces ?? []).length > 0;

const stateHasCards = (state) =>
  (state?.spaces ?? []).some((space) =>
    (space?.boards ?? []).some((board) => (board?.cards ?? []).length > 0),
  );

// In-memory mirror so repeated content changes don't rewrite the same value.
let driveDirtyMirror = null;
const setDirtyFlag = (dirty) => {
  if (driveDirtyMirror === dirty) return;
  driveDirtyMirror = dirty;
  saveDriveDirtyFlag(dirty);
};

// A newer edit may land while a push or pull is in flight; only clear the
// dirty marker when the current state is what Drive now holds. (A simple
// "clear after push" would drop the marker for the in-flight edit and let
// the next Drive-first startup revert it.)
const clearDirtyIfSynced = () => {
  if (computeSpacesHash(getState()) === lastResolvedSpacesHash) {
    setDirtyFlag(false);
  }
};

const formatRelativeTime = (timestamp) => {
  if (!timestamp) return "Not synced yet";
  const diff = Date.now() - timestamp;
  if (diff < 30 * 1000) return "Last synced just now";
  if (diff < 60 * 60 * 1000) {
    const minutes = Math.floor(diff / (60 * 1000));
    return `Last synced ${minutes} min${minutes === 1 ? "" : "s"} ago`;
  }
  if (diff < 24 * 60 * 60 * 1000) {
    const hours = Math.floor(diff / (60 * 60 * 1000));
    return `Last synced ${hours} hour${hours === 1 ? "" : "s"} ago`;
  }
  const days = Math.floor(diff / (24 * 60 * 60 * 1000));
  return `Last synced ${days} day${days === 1 ? "" : "s"} ago`;
};

const setDriveStatusText = (text) => {
  if (!driveMenuStatusEl) return;
  driveMenuStatusEl.textContent = text;
};

const refreshDriveStatusFromState = () => {
  const state = getState();
  const lastSyncAt = state?.preferences?.lastSyncAt ?? null;
  setDriveStatusText(formatRelativeTime(lastSyncAt));
};

const recordSyncTimestamp = () => {
  const prevSuppress = isDriveSyncSuppressed;
  isDriveSyncSuppressed = true;
  try {
    updateState((draft) => {
      if (!draft.preferences) draft.preferences = {};
      draft.preferences.lastSyncAt = Date.now();
    });
  } finally {
    isDriveSyncSuppressed = prevSuppress;
  }
  refreshDriveStatusFromState();
};

export const closeDriveMenu = () => {
  if (!driveMenuOpen) return;
  driveMenuOpen = false;
  driveMenuEl?.setAttribute("data-open", "false");
  driveMenuEl?.setAttribute("aria-hidden", "true");
  driveConnectBtn?.setAttribute("aria-expanded", "false");
};

const openDriveMenu = () => {
  if (driveMenuOpen) return;
  driveMenuOpen = true;
  driveMenuEl?.setAttribute("data-open", "true");
  driveMenuEl?.setAttribute("aria-hidden", "false");
  driveConnectBtn?.setAttribute("aria-expanded", "true");
  refreshDriveStatusFromState();
};

const toggleDriveMenu = () => {
  if (driveMenuOpen) closeDriveMenu();
  else openDriveMenu();
};

const acquireSyncMutex = () =>
  new Promise((resolve) => {
    if (!syncInFlight) {
      syncInFlight = true;
      resolve();
      return;
    }
    syncQueue.push(resolve);
  });

const releaseSyncMutex = () => {
  const next = syncQueue.shift();
  if (next) {
    next();
    return;
  }
  syncInFlight = false;
};

const runWithMutex = async (fn) => {
  await acquireSyncMutex();
  const ac = new AbortController();
  const timeoutId = setTimeout(() => ac.abort(), SYNC_TIMEOUT_MS);
  try {
    return await fn(ac.signal);
  } finally {
    clearTimeout(timeoutId);
    releaseSyncMutex();
  }
};

// Replace local state with remote, but preserve device-local UI prefs.
// Wraps replaceState in the suppress flag so the resulting state-change
// notification does not schedule a push back to Drive.
const adoptRemoteState = (remote) => {
  // Drive-first: adopting remote supersedes any not-yet-pushed local edit.
  // An armed debounce push would otherwise overwrite the just-adopted data.
  clearTimeout(driveTimer);
  pendingPushState = null;
  const local = getState();
  const localPrefs = local?.preferences ?? {};
  const remotePrefs = remote?.preferences ?? {};
  const merged = {
    ...remote,
    preferences: {
      ...remotePrefs,
      activeSpaceId:
        localPrefs.activeSpaceId ?? remotePrefs.activeSpaceId ?? null,
      activeBoardId:
        localPrefs.activeBoardId ?? remotePrefs.activeBoardId ?? null,
      searchTerm: localPrefs.searchTerm ?? "",
      viewMode: localPrefs.viewMode ?? remotePrefs.viewMode ?? "spaces",
      tabDrawerPinned:
        localPrefs.tabDrawerPinned ?? remotePrefs.tabDrawerPinned ?? false,
      lastSyncAt: localPrefs.lastSyncAt ?? remotePrefs.lastSyncAt ?? null,
    },
  };
  const prevSuppress = isDriveSyncSuppressed;
  isDriveSyncSuppressed = true;
  try {
    replaceState(merged);
  } finally {
    isDriveSyncSuppressed = prevSuppress;
  }
  lastResolvedSpacesHash = computeSpacesHash(getState());
};

export const setBootstrapSuppress = (value) => {
  isDriveSyncSuppressed = Boolean(value);
};

export const schedulePersist = (state) => {
  if (!state) return;
  // Never persist transient render metadata.
  const { meta: _meta, ...persistable } = state;
  pendingSaveState = persistable;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    pendingSaveState = null;
    saveStateToStorage(persistable);
  }, PERSIST_DEBOUNCE_MS);
};

// Write a still-debounced save immediately (e.g. on unload) instead of
// dropping it — cancelling here would lose the last user change.
export const flushPersist = () => {
  if (!pendingSaveState) return;
  clearTimeout(saveTimer);
  const state = pendingSaveState;
  pendingSaveState = null;
  saveStateToStorage(state);
};

const flushPushNow = async (immediate) => {
  const state = pendingPushState;
  pendingPushState = null;
  if (!state) return;
  try {
    await runWithMutex(async (signal) => {
      const result = await pushToDrive(state, {
        signal,
        allowInteractive: true,
      });
      lastResolvedSpacesHash = computeSpacesHash(state);
      recordSyncTimestamp();
      clearDirtyIfSynced();
      return result;
    });
    if (immediate) showSnackbar("Google Drive backup complete");
  } catch (error) {
    if (immediate && error?.name !== "AbortError") {
      // pushToDrive already surfaces a snackbar
    }
  }
};

// Called from handleStateChange on every state notification. It is the only
// caller that can trigger a Drive push, and it only does so for actual
// content (spaces) changes — not for searchTerm/viewMode/lastSyncAt churn.
export const scheduleDriveSync = (
  state,
  { immediate = false, trigger = null } = {},
) => {
  if (!state) return;
  const spacesHash = computeSpacesHash(state);
  if (isDriveSyncSuppressed) {
    // Suppressed notifications carry system-applied states (bootstrap load,
    // remote adopt) — exactly the baseline user edits are diffed against.
    dirtyBaselineSpacesHash = spacesHash;
    return;
  }
  if (getDriveSnapshot().status !== "connected") return;
  // Until we have successfully resolved Drive state (pulled or seeded),
  // never push — otherwise a fresh profile would overwrite Drive content.
  // Content edits still mark the dirty flag so a failed startup pull can't
  // silently lose the session's changes: they push once the gate opens
  // (pullDrivePeriodic) or on the next startup via push-local.
  if (lastResolvedSpacesHash === null) {
    if (
      dirtyBaselineSpacesHash !== null &&
      spacesHash !== dirtyBaselineSpacesHash
    ) {
      setDirtyFlag(true);
    }
    return;
  }

  if (spacesHash === lastResolvedSpacesHash) return;

  // Persist the unsynced-change marker immediately: if the tab closes before
  // the debounced push fires, the next startup pushes local first instead of
  // letting the Drive-first pull revert the change.
  setDirtyFlag(true);

  // Strip transient render metadata before it reaches Drive.
  const { meta: _meta, ...pushable } = state;
  pendingPushState = pushable;
  clearTimeout(driveTimer);

  if (immediate || trigger === "add-card") {
    flushPushNow(immediate);
  } else {
    driveTimer = setTimeout(() => flushPushNow(false), DRIVE_SYNC_DEBOUNCE_MS);
  }
};

// Pure decision for pullDriveOnStartup (exported for tests). Drive wins,
// with two exceptions: an empty remote is seeded from local, and a local
// change whose push never fired (dirty flag) is pushed first — but only when
// no other device has written to Drive since our last sync. Real two-sided
// conflicts stay Drive-first. Connecting over real local cards asks first.
// Deliberate: dirty with NO local content (the last action deleted every
// space) still adopts — resurrecting on restart beats silently propagating
// an accidental wipe to every synced device.
export const resolveStartupSyncAction = ({
  remoteHasContent,
  localHasContent,
  localHasCards,
  dirty,
  remoteUnchangedSinceLastSync,
  contentDiffers,
  reason,
}) => {
  if (!remoteHasContent && localHasContent) return "seed";
  if (dirty && localHasContent && remoteUnchangedSinceLastSync)
    return "push-local";
  if (reason === "connect" && localHasCards && contentDiffers)
    return "confirm-adopt";
  return "adopt";
};

// Bootstrap / connect-time pull; see resolveStartupSyncAction for the rules.
export const pullDriveOnStartup = async ({ reason = "startup" } = {}) => {
  if (getDriveSnapshot().status !== "connected") return;
  const isBackground = reason !== "connect" && reason !== "manual";

  const outcome = await runWithMutex(async (signal) => {
    const lastKnownModified = getDriveSnapshot().lastKnownDriveModifiedTime;
    const { data: remote, modifiedTime } = await pullFromDrive({
      markChecked: true,
      signal,
      allowInteractive: !isBackground,
    });

    const localState = getState();
    const action = resolveStartupSyncAction({
      remoteHasContent: stateHasContent(remote),
      localHasContent: stateHasContent(localState),
      // The untouched fresh-install template is not user content: adopting
      // over its sample cards needs no destructive-replace warning.
      localHasCards:
        stateHasCards(localState) && !isDefaultSeedState(localState),
      dirty: await loadDriveDirtyFlag(),
      remoteUnchangedSinceLastSync: Boolean(
        lastKnownModified && modifiedTime && modifiedTime <= lastKnownModified,
      ),
      contentDiffers:
        comparableSpacesHash(remote) !== comparableSpacesHash(localState),
      reason,
    });

    // The confirm dialog waits on the user; answer it outside the mutex so
    // an unanswered dialog cannot block queued background syncs.
    if (action === "confirm-adopt") return { needsConfirm: true, remote };

    if (action === "seed" || action === "push-local") {
      await pushToDrive(localState, {
        signal,
        allowInteractive: !isBackground,
      });
      lastResolvedSpacesHash = computeSpacesHash(localState);
      recordSyncTimestamp();
      if (reason === "connect" && action === "seed") {
        showSnackbar("Initial sync complete.");
      }
    } else {
      adoptRemoteState(remote);
      recordSyncTimestamp();
    }
    clearDirtyIfSynced();
    return { synced: true };
  });

  if (!outcome?.needsConfirm) return;

  const ok = await openConfirm(
    "Google Drive already has data. Replace this device's boards with the Drive version? Cancel keeps everything as-is and disconnects.",
  );
  if (!ok) {
    // Disconnect outside the mutex: disconnectDrive triggers
    // stopDriveBackgroundSync, which force-resets the mutex state.
    await disconnectDrive();
    showSnackbar("Drive connection cancelled — nothing was changed.");
    return;
  }
  await runWithMutex(async () => {
    adoptRemoteState(outcome.remote);
    recordSyncTimestamp();
    clearDirtyIfSynced();
  });
};

// Periodic background pull. Cheap modifiedTime probe gates the full
// download. If remote hasn't changed since we last touched the file,
// no body fetch happens.
export const pullDrivePeriodic = async ({ force = false } = {}) => {
  if (getDriveSnapshot().status !== "connected") return;

  // While pushes are still gated (the startup pull failed), a plain adopt
  // below would revert this session's dirty edits, and the cheap probe would
  // leave the gate closed forever on a single-device profile. Run the full
  // startup resolution instead — it consults the dirty flag, pushes local
  // when appropriate, and opens the gate.
  if (lastResolvedSpacesHash === null) {
    try {
      await pullDriveOnStartup({ reason: force ? "manual" : "periodic" });
    } catch {
      // still unreachable; retry next interval
    }
    return;
  }

  return await runWithMutex(async (signal) => {
    const snapshot = getDriveSnapshot();
    if (!force && snapshot.lastKnownDriveModifiedTime) {
      try {
        const remoteModified = await getDriveFileModifiedTime({
          signal,
          allowInteractive: false,
        });
        if (
          remoteModified &&
          remoteModified <= snapshot.lastKnownDriveModifiedTime
        ) {
          return;
        }
      } catch {
        // fall through to full pull
      }
    }

    const lastKnownModified = snapshot.lastKnownDriveModifiedTime;
    let remote;
    let modifiedTime;
    try {
      ({ data: remote, modifiedTime } = await pullFromDrive({
        markChecked: true,
        signal,
        allowInteractive: false,
      }));
    } catch {
      return;
    }

    const localState = getState();
    const remoteChanged = !(
      lastKnownModified &&
      modifiedTime &&
      modifiedTime <= lastKnownModified
    );
    const differs =
      comparableSpacesHash(remote) !== comparableSpacesHash(localState);
    if (remoteChanged && differs) {
      // Drive-first: another device wrote since our last sync.
      adoptRemoteState(remote);
    } else if (!differs) {
      // Same content, possibly different representation (favicons); anchor
      // the resolved hash to the local form scheduleDriveSync compares.
      lastResolvedSpacesHash = computeSpacesHash(localState);
    }
    // remote unchanged but local differs: an unpushed local edit and no
    // competing writer — leave it to the armed debounce push (or the next
    // startup's push-local), never adopt over it.
    clearDirtyIfSynced();
  });
};

// Manual "Sync now" button. Force-pull then push current state.
export const runManualSync = async () => {
  if (getDriveSnapshot().status !== "connected") return;
  await pullDrivePeriodic({ force: true });
  pendingPushState = getState();
  await flushPushNow(false);
};

export const startDriveBackgroundSync = () => {
  if (driveSyncIntervalId) return;
  driveSyncIntervalId = setInterval(() => {
    pullDrivePeriodic();
  }, DRIVE_SYNC_INTERVAL);
};

export const stopDriveBackgroundSync = () => {
  if (driveSyncIntervalId) {
    clearInterval(driveSyncIntervalId);
    driveSyncIntervalId = null;
  }
  clearTimeout(driveTimer);
  driveTimer = null;
  syncQueue = [];
  syncInFlight = false;
  pendingPushState = null;
};

export const cleanupDriveUI = () => {
  stopDriveBackgroundSync();
  flushPersist();
};

export const handleDriveUpdate = (snapshot) => {
  const connected = snapshot.status === "connected";
  const label = driveConnectBtn?.querySelector("span");
  if (label) {
    label.textContent = connected ? "Drive Synced" : "Google Drive Sync";
  }
  if (connected) {
    startDriveBackgroundSync();
  } else {
    stopDriveBackgroundSync();
    lastResolvedSpacesHash = null;
    // Disconnect cleared the persisted flag; unknown mirror forces the
    // next setDirtyFlag call to actually write.
    driveDirtyMirror = null;
  }
  if (driveControl) {
    driveControl.classList.toggle("connected", connected);
  }
};

export const initDriveUI = () => {
  if (initialized) return;
  initialized = true;

  // Other new-tab instances write the same flag; keep the mirror honest.
  onDriveDirtyFlagChanged((dirty) => {
    driveDirtyMirror = dirty;
  });

  driveConnectBtn?.addEventListener("click", async (event) => {
    const snapshot = getDriveSnapshot();
    if (snapshot.status === "connected") {
      event.stopPropagation();
      toggleDriveMenu();
      return;
    }
    try {
      await connectDrive();
      try {
        await pullDriveOnStartup({ reason: "connect" });
      } catch {
        // pullFromDrive already snackbar'd
      }
      if (lastResolvedSpacesHash !== null) {
        showSnackbar("Connected to Google Drive.");
      }
    } catch (error) {
      showSnackbar("Failed to connect to Drive: " + error.message);
    }
  });

  document.addEventListener("click", (event) => {
    if (!driveMenuOpen) return;
    if (driveControl?.contains(event.target)) return;
    closeDriveMenu();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && driveMenuOpen) {
      closeDriveMenu();
    }
  });

  driveMenuSyncBtn?.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (getDriveSnapshot().status !== "connected") return;
    if (driveMenuSyncBtn.disabled) return;
    driveMenuSyncBtn.disabled = true;
    const originalText = driveMenuSyncBtn.textContent;
    driveMenuSyncBtn.textContent = "Syncing...";
    setDriveStatusText("Syncing…");
    showSnackbar("Manually syncing with Google Drive...");
    try {
      await runManualSync();
      showSnackbar("Manual sync with Drive completed.");
    } catch (error) {
      showSnackbar("Drive sync failed: " + error.message);
      setDriveStatusText("Sync failed — try again");
    } finally {
      driveMenuSyncBtn.disabled = false;
      driveMenuSyncBtn.textContent = originalText;
    }
  });

  driveMenuDisconnectBtn?.addEventListener("click", async (event) => {
    event.stopPropagation();
    await disconnectDrive();
    stopDriveBackgroundSync();
    lastResolvedSpacesHash = null;
    closeDriveMenu();
    showSnackbar("Disconnected from Google Drive.");
  });

  refreshDriveStatusFromState();
};
