import { getState, replaceState } from "./state.js";
import { saveStateToStorage } from "./storage.js";
import {
  connectDrive,
  disconnectDrive,
  getDriveSnapshot,
  pullFromDrive,
  pushToDrive,
} from "./drive.js";
import { showSnackbar } from "./modals.js";
import {
  PERSIST_DEBOUNCE_MS,
  DRIVE_SYNC_DEBOUNCE_MS,
  DRIVE_SYNC_INTERVAL,
  NEWTAB_DRIVE_CHECK_INTERVAL,
} from "./constants.js";

const driveControl = document.getElementById("drive-control");
const driveConnectBtn = document.getElementById("drive-connect");
const driveMenuSyncBtn = document.getElementById("drive-menu-sync");
const driveMenuDisconnectBtn = document.getElementById("drive-menu-disconnect");

let saveTimer = null;
let driveTimer = null;
let driveSyncIntervalId = null;
let syncQueue = [];
let syncInFlight = false;
let isDriveSyncSuppressed = false;
let hasPulledDriveState = false;
let initialized = false;

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

export const schedulePersist = (state) => {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveStateToStorage(state), PERSIST_DEBOUNCE_MS);
};

export const scheduleDriveSync = (
  state,
  { immediate = false, trigger = null, meta = null } = {},
) => {
  if (isDriveSyncSuppressed) {
    return;
  }

  const driveSnapshot = getDriveSnapshot();
  if (driveSnapshot.status !== "connected") {
    return;
  }

  clearTimeout(driveTimer);
  const executor = async () => {
    try {
      await runDriveSync({ reason: "debounced", localState: state, meta });
      if (immediate) showSnackbar("Google Drive backup complete");
    } catch {
      // runDriveSync handles its own error reporting
    }
  };

  if (immediate || trigger === "add-card") {
    executor();
  } else {
    driveTimer = setTimeout(executor, DRIVE_SYNC_DEBOUNCE_MS);
  }
};

const shouldKeepOneSidedItem = (item, otherSideLastUpdated) => {
  const itemCreated = item.createdAt ? new Date(item.createdAt).getTime() : 0;
  const otherUpdated = otherSideLastUpdated
    ? new Date(otherSideLastUpdated).getTime()
    : 0;
  if (!itemCreated || !otherUpdated) return true;
  return itemCreated >= otherUpdated;
};

const mergeBoards = (
  remoteBoards,
  localBoards,
  remoteLastUpdated,
  localLastUpdated,
) => {
  const remoteBoardMap = new Map((remoteBoards ?? []).map((b) => [b.id, b]));
  const localBoardMap = new Map((localBoards ?? []).map((b) => [b.id, b]));
  const allBoardIds = [
    ...new Set([...remoteBoardMap.keys(), ...localBoardMap.keys()]),
  ];

  return allBoardIds
    .map((boardId) => {
      const remote = remoteBoardMap.get(boardId);
      const local = localBoardMap.get(boardId);
      if (!remote) {
        return shouldKeepOneSidedItem(local, remoteLastUpdated)
          ? JSON.parse(JSON.stringify(local))
          : null;
      }
      if (!local) {
        return shouldKeepOneSidedItem(remote, localLastUpdated)
          ? JSON.parse(JSON.stringify(remote))
          : null;
      }

      const remoteCardMap = new Map((remote.cards ?? []).map((c) => [c.id, c]));
      const localCardMap = new Map((local.cards ?? []).map((c) => [c.id, c]));
      const allCardIds = [
        ...new Set([...remoteCardMap.keys(), ...localCardMap.keys()]),
      ];

      const mergedCards = allCardIds
        .map((cardId) => {
          const rc = remoteCardMap.get(cardId);
          const lc = localCardMap.get(cardId);
          if (!rc) {
            return shouldKeepOneSidedItem(lc, remoteLastUpdated)
              ? JSON.parse(JSON.stringify(lc))
              : null;
          }
          if (!lc) {
            return shouldKeepOneSidedItem(rc, localLastUpdated)
              ? JSON.parse(JSON.stringify(rc))
              : null;
          }

          const remoteUpdated = rc.updatedAt
            ? new Date(rc.updatedAt).getTime()
            : 0;
          const localUpdated = lc.updatedAt
            ? new Date(lc.updatedAt).getTime()
            : 0;
          return JSON.parse(
            JSON.stringify(localUpdated >= remoteUpdated ? lc : rc),
          );
        })
        .filter(Boolean);

      const remoteUpdated = remote.updatedAt
        ? new Date(remote.updatedAt).getTime()
        : 0;
      const localUpdated = local.updatedAt
        ? new Date(local.updatedAt).getTime()
        : 0;
      const base = localUpdated >= remoteUpdated ? local : remote;

      return {
        ...JSON.parse(JSON.stringify(base)),
        cards: mergedCards,
      };
    })
    .filter(Boolean);
};

const mergeStates = (remoteState, localState) => {
  if (!remoteState || !Array.isArray(remoteState.spaces)) return localState;
  if (!localState || !Array.isArray(localState.spaces)) return remoteState;

  const remoteSpaceMap = new Map(remoteState.spaces.map((s) => [s.id, s]));
  const localSpaceMap = new Map(localState.spaces.map((s) => [s.id, s]));
  const allSpaceIds = [
    ...new Set([...remoteSpaceMap.keys(), ...localSpaceMap.keys()]),
  ];

  const mergedSpaces = allSpaceIds
    .map((spaceId) => {
      const remote = remoteSpaceMap.get(spaceId);
      const local = localSpaceMap.get(spaceId);
      if (!remote) {
        return shouldKeepOneSidedItem(local, remoteState.lastUpdated)
          ? JSON.parse(JSON.stringify(local))
          : null;
      }
      if (!local) {
        return shouldKeepOneSidedItem(remote, localState.lastUpdated)
          ? JSON.parse(JSON.stringify(remote))
          : null;
      }

      const mergedBoards = mergeBoards(
        remote.boards,
        local.boards,
        remoteState.lastUpdated,
        localState.lastUpdated,
      );

      const remoteSpaceTime = remote.updatedAt
        ? new Date(remote.updatedAt).getTime()
        : 0;
      const localSpaceTime = local.updatedAt
        ? new Date(local.updatedAt).getTime()
        : 0;
      const baseSpace = localSpaceTime >= remoteSpaceTime ? local : remote;

      return {
        ...JSON.parse(JSON.stringify(baseSpace)),
        boards: mergedBoards,
      };
    })
    .filter(Boolean);

  const remoteTime = remoteState.lastUpdated
    ? new Date(remoteState.lastUpdated).getTime()
    : 0;
  const localTime = localState.lastUpdated
    ? new Date(localState.lastUpdated).getTime()
    : 0;
  const newerState = localTime >= remoteTime ? localState : remoteState;

  return {
    ...JSON.parse(JSON.stringify(newerState)),
    spaces: mergedSpaces,
    lastUpdated: new Date(
      Math.max(remoteTime, localTime) || Date.now(),
    ).toISOString(),
  };
};

const runDriveSync = async ({
  reason = "interval",
  localState = null,
  meta = null,
  throwOnError = false,
} = {}) => {
  const snapshot = getDriveSnapshot();
  if (snapshot.status !== "connected") return;

  if (reason === "newtab") {
    const lastCheckedAt = snapshot.lastCheckedAt
      ? new Date(snapshot.lastCheckedAt).getTime()
      : 0;
    if (
      lastCheckedAt &&
      Date.now() - lastCheckedAt < NEWTAB_DRIVE_CHECK_INTERVAL
    ) {
      return;
    }
  }

  await acquireSyncMutex();

  const syncAbortController = new AbortController();
  const timeoutId = setTimeout(() => {
    syncAbortController.abort();
  }, 30000);

  try {
    const isBackground = reason === "interval" || reason === "newtab";
    const syncOptions = {
      signal: syncAbortController.signal,
      allowInteractive: !isBackground,
    };

    const remoteState = await pullFromDrive({
      markChecked: reason === "newtab",
      ...syncOptions,
    });

    const resolvedLocalState = localState ?? getState();

    if (reason === "connect" && remoteState) {
      isDriveSyncSuppressed = true;
      replaceState(remoteState, { preserveTimestamp: true });
      isDriveSyncSuppressed = false;
      return;
    }

    const mergedState = mergeStates(remoteState, resolvedLocalState);
    const hasChanges =
      JSON.stringify(mergedState) !== JSON.stringify(resolvedLocalState);

    if (hasChanges) {
      isDriveSyncSuppressed = true;
      replaceState(mergedState);
      isDriveSyncSuppressed = false;
    }
    await pushToDrive(getState(), syncOptions);
  } catch (error) {
    if (error?.name === "AbortError") {
      showSnackbar("Drive sync timed out. Will retry later.");
      return;
    }
    if (
      throwOnError ||
      reason === "manual" ||
      reason === "add-card" ||
      reason === "connect"
    ) {
      throw error;
    }
  } finally {
    clearTimeout(timeoutId);
    releaseSyncMutex();
  }
};

export const startDriveBackgroundSync = () => {
  if (driveSyncIntervalId) return;
  driveSyncIntervalId = setInterval(() => {
    runDriveSync({ reason: "interval" });
  }, DRIVE_SYNC_INTERVAL);
  runDriveSync({ reason: "newtab" });
};

export const stopDriveBackgroundSync = () => {
  if (driveSyncIntervalId) {
    clearInterval(driveSyncIntervalId);
    driveSyncIntervalId = null;
  }
  clearTimeout(driveTimer);
  clearTimeout(saveTimer);
  driveTimer = null;
  saveTimer = null;
  syncQueue = [];
  syncInFlight = false;
};

export const cleanupDriveUI = () => {
  stopDriveBackgroundSync();
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
    hasPulledDriveState = false;
  }
  if (driveControl) {
    driveControl.classList.toggle("connected", connected);
  }
};

export const initDriveUI = () => {
  if (initialized) return;
  initialized = true;

  driveConnectBtn?.addEventListener("click", async () => {
    const snapshot = getDriveSnapshot();
    if (snapshot.status === "connected") {
      return;
    }
    try {
      await connectDrive();
      if (!hasPulledDriveState) {
        try {
          await runDriveSync({ reason: "connect" });
          hasPulledDriveState = true;
        } catch {
          // pull failure already reported via showSnackbar in pullFromDrive
        }
      }
      showSnackbar("Connected to Google Drive.");
      scheduleDriveSync(getState(), { immediate: true });
    } catch (error) {
      showSnackbar("Failed to connect to Drive: " + error.message);
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
    showSnackbar("Manually syncing with Google Drive...");
    try {
      await runDriveSync({ reason: "manual" });
      showSnackbar("Manual sync with Drive completed.");
    } catch (error) {
      showSnackbar("Drive sync failed: " + error.message);
    } finally {
      driveMenuSyncBtn.disabled = false;
      driveMenuSyncBtn.textContent = originalText;
    }
  });

  driveMenuDisconnectBtn?.addEventListener("click", async (event) => {
    event.stopPropagation();
    await disconnectDrive();
    stopDriveBackgroundSync();
    hasPulledDriveState = false;
    showSnackbar("Disconnected from Google Drive.");
  });
};
