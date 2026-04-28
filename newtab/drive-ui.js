import { getState, replaceState, updateState } from "./state.js";
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
const driveMenuEl = document.getElementById("drive-menu");
const driveMenuStatusEl = document.getElementById("drive-menu-status");
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
let driveMenuOpen = false;

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
  // Suppress sync to avoid scheduling another Drive push just for the
  // timestamp bump (otherwise every successful sync triggers a redundant
  // follow-up push 1.5s later carrying only the new lastSyncAt).
  isDriveSyncSuppressed = true;
  try {
    updateState((draft) => {
      if (!draft.preferences) draft.preferences = {};
      draft.preferences.lastSyncAt = Date.now();
    });
  } finally {
    isDriveSyncSuppressed = false;
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
      await runDriveSync({
        reason: trigger === "add-card" ? "add-card" : "debounced",
        localState: state,
        meta,
        throwOnError: immediate,
      });
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

const cloneItem = (item) => JSON.parse(JSON.stringify(item));

const toTime = (value) => {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
};

const getItemTime = (item) =>
  toTime(item?.updatedAt) || toTime(item?.createdAt);

const getOrderedIds = (
  remoteItems = [],
  localItems = [],
  remoteLastUpdated,
  localLastUpdated,
) => {
  const remoteIds = (remoteItems ?? []).map((item) => item.id);
  const localIds = (localItems ?? []).map((item) => item.id);
  const preferLocalOrder =
    toTime(localLastUpdated) >= toTime(remoteLastUpdated);
  const preferred = preferLocalOrder ? localIds : remoteIds;
  const fallback = preferLocalOrder ? remoteIds : localIds;
  return [...new Set([...preferred, ...fallback])];
};

const indexCards = (state) => {
  const index = new Map();
  for (const space of state?.spaces ?? []) {
    for (const board of space?.boards ?? []) {
      for (const card of board?.cards ?? []) {
        index.set(card.id, card);
      }
    }
  }
  return index;
};

const shouldKeepOneSidedItem = (item, otherSideLastUpdated) => {
  const itemTime = getItemTime(item);
  const otherUpdated = toTime(otherSideLastUpdated);
  if (!itemTime || !otherUpdated) return true;
  return itemTime >= otherUpdated;
};

const shouldKeepOneSidedCard = (
  card,
  otherSideCard,
  ownSideLastUpdated,
  otherSideLastUpdated,
) => {
  if (!otherSideCard) {
    return shouldKeepOneSidedItem(card, otherSideLastUpdated);
  }

  const cardUpdated = getItemTime(card);
  const otherCardUpdated = getItemTime(otherSideCard);
  if (cardUpdated !== otherCardUpdated) {
    return cardUpdated > otherCardUpdated;
  }

  return toTime(ownSideLastUpdated) >= toTime(otherSideLastUpdated);
};

const mergeBoards = (
  remoteBoards,
  localBoards,
  remoteLastUpdated,
  localLastUpdated,
  { remoteCardIndex, localCardIndex } = {},
) => {
  const remoteBoardMap = new Map((remoteBoards ?? []).map((b) => [b.id, b]));
  const localBoardMap = new Map((localBoards ?? []).map((b) => [b.id, b]));
  const allBoardIds = getOrderedIds(
    remoteBoards,
    localBoards,
    remoteLastUpdated,
    localLastUpdated,
  );

  return allBoardIds
    .map((boardId) => {
      const remote = remoteBoardMap.get(boardId);
      const local = localBoardMap.get(boardId);
      if (!remote) {
        return shouldKeepOneSidedItem(local, remoteLastUpdated)
          ? cloneItem(local)
          : null;
      }
      if (!local) {
        return shouldKeepOneSidedItem(remote, localLastUpdated)
          ? cloneItem(remote)
          : null;
      }

      const remoteCardMap = new Map((remote.cards ?? []).map((c) => [c.id, c]));
      const localCardMap = new Map((local.cards ?? []).map((c) => [c.id, c]));
      const allCardIds = getOrderedIds(
        remote.cards,
        local.cards,
        remoteLastUpdated,
        localLastUpdated,
      );

      const mergedCards = allCardIds
        .map((cardId) => {
          const rc = remoteCardMap.get(cardId);
          const lc = localCardMap.get(cardId);
          if (!rc) {
            return shouldKeepOneSidedCard(
              lc,
              remoteCardIndex?.get(cardId),
              localLastUpdated,
              remoteLastUpdated,
            )
              ? cloneItem(lc)
              : null;
          }
          if (!lc) {
            return shouldKeepOneSidedCard(
              rc,
              localCardIndex?.get(cardId),
              remoteLastUpdated,
              localLastUpdated,
            )
              ? cloneItem(rc)
              : null;
          }

          const remoteUpdated = toTime(rc.updatedAt);
          const localUpdated = toTime(lc.updatedAt);
          return cloneItem(localUpdated >= remoteUpdated ? lc : rc);
        })
        .filter(Boolean);

      const remoteUpdated = toTime(remote.updatedAt);
      const localUpdated = toTime(local.updatedAt);
      const base = localUpdated >= remoteUpdated ? local : remote;

      return {
        ...cloneItem(base),
        cards: mergedCards,
      };
    })
    .filter(Boolean);
};

export const mergeStates = (remoteState, localState) => {
  if (!remoteState || !Array.isArray(remoteState.spaces)) return localState;
  if (!localState || !Array.isArray(localState.spaces)) return remoteState;

  const remoteSpaceMap = new Map(remoteState.spaces.map((s) => [s.id, s]));
  const localSpaceMap = new Map(localState.spaces.map((s) => [s.id, s]));
  const allSpaceIds = getOrderedIds(
    remoteState.spaces,
    localState.spaces,
    remoteState.lastUpdated,
    localState.lastUpdated,
  );
  const remoteCardIndex = indexCards(remoteState);
  const localCardIndex = indexCards(localState);

  const mergedSpaces = allSpaceIds
    .map((spaceId) => {
      const remote = remoteSpaceMap.get(spaceId);
      const local = localSpaceMap.get(spaceId);
      if (!remote) {
        return shouldKeepOneSidedItem(local, remoteState.lastUpdated)
          ? cloneItem(local)
          : null;
      }
      if (!local) {
        return shouldKeepOneSidedItem(remote, localState.lastUpdated)
          ? cloneItem(remote)
          : null;
      }

      const mergedBoards = mergeBoards(
        remote.boards,
        local.boards,
        remoteState.lastUpdated,
        localState.lastUpdated,
        { remoteCardIndex, localCardIndex },
      );

      const remoteSpaceTime = toTime(remote.updatedAt);
      const localSpaceTime = toTime(local.updatedAt);
      const baseSpace = localSpaceTime >= remoteSpaceTime ? local : remote;

      return {
        ...cloneItem(baseSpace),
        boards: mergedBoards,
      };
    })
    .filter(Boolean);

  const remoteTime = toTime(remoteState.lastUpdated);
  const localTime = toTime(localState.lastUpdated);
  const newerState = localTime >= remoteTime ? localState : remoteState;

  return {
    ...cloneItem(newerState),
    spaces: mergedSpaces,
    lastUpdated: new Date(
      Math.max(remoteTime, localTime) || Date.now(),
    ).toISOString(),
  };
};

export const shouldRethrowSyncError = (
  error,
  { reason = "interval", throwOnError = false } = {},
) =>
  Boolean(
    error &&
    (throwOnError ||
      reason === "manual" ||
      reason === "add-card" ||
      reason === "connect"),
  );

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
      if (shouldRethrowSyncError(error, { reason, throwOnError })) {
        throw error;
      }
      return;
    }
    if (shouldRethrowSyncError(error, { reason, throwOnError })) {
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

  driveConnectBtn?.addEventListener("click", async (event) => {
    const snapshot = getDriveSnapshot();
    if (snapshot.status === "connected") {
      event.stopPropagation();
      toggleDriveMenu();
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
      recordSyncTimestamp();
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
      await runDriveSync({ reason: "manual" });
      showSnackbar("Manual sync with Drive completed.");
      recordSyncTimestamp();
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
    hasPulledDriveState = false;
    closeDriveMenu();
    showSnackbar("Disconnected from Google Drive.");
  });

  refreshDriveStatusFromState();
};
