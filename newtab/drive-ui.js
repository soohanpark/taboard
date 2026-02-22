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
let driveSyncInFlight = false;
let suppressNextDriveSync = false;
let hasPulledDriveState = false;
let initialized = false;

let driveCallbacks = {
  findCardContext: () => ({ card: null }),
};

export const schedulePersist = (state) => {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveStateToStorage(state), PERSIST_DEBOUNCE_MS);
};

export const scheduleDriveSync = (
  state,
  { immediate = false, trigger = null, meta = null } = {},
) => {
  if (suppressNextDriveSync) {
    suppressNextDriveSync = false;
    return;
  }

  const driveSnapshot = getDriveSnapshot();
  if (driveSnapshot.status !== "connected") {
    return;
  }

  clearTimeout(driveTimer);
  const executor = async () => {
    try {
      if (trigger === "add-card") {
        await runDriveSync({ reason: "add-card", localState: state, meta });
        return;
      }
      await pushToDrive(state);
      if (immediate) showSnackbar("Google Drive backup complete");
    } catch (error) {
      console.error(error);
      showSnackbar("Drive sync failed: " + error.message);
    }
  };

  if (immediate || trigger === "add-card") {
    executor();
  } else {
    driveTimer = setTimeout(executor, DRIVE_SYNC_DEBOUNCE_MS);
  }
};

const mergeAddedCardsIntoRemote = (remoteState, localState, addedCards = []) => {
  if (!remoteState || !localState || !Array.isArray(addedCards)) {
    return remoteState;
  }

  const merged = JSON.parse(JSON.stringify(remoteState));

  const remoteHasCard = (cardId) => {
    if (!cardId) return false;
    return merged.spaces?.some((space) =>
      space.boards?.some((board) =>
        board.cards?.some((card) => card.id === cardId),
      ),
    );
  };

  addedCards.forEach((entry) => {
    const cardId = entry?.id;
    if (!cardId || remoteHasCard(cardId)) return;

    const { card } = driveCallbacks.findCardContext(localState, {
      spaceId: entry.spaceId ?? null,
      boardId: entry.boardId ?? null,
      cardId,
    });
    if (!card) return;

    let targetSpace =
      merged.spaces?.find((space) => space.id === entry.spaceId) ??
      merged.spaces?.[0] ??
      null;
    if (!targetSpace) return;

    let targetBoard =
      targetSpace.boards?.find((board) => board.id === entry.boardId) ??
      targetSpace.boards?.[0] ??
      null;
    if (!targetBoard) return;

    if (!Array.isArray(targetBoard.cards)) {
      targetBoard.cards = [];
    }
    targetBoard.cards.unshift(JSON.parse(JSON.stringify(card)));
  });

  return merged;
};

const runDriveSync = async ({
  reason = "interval",
  localState = null,
  meta = null,
  throwOnError = false,
} = {}) => {
  const snapshot = getDriveSnapshot();
  if (driveSyncInFlight || snapshot.status !== "connected") return;

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

  driveSyncInFlight = true;
  try {
    const remoteState = await pullFromDrive({
      markChecked: reason === "newtab",
    });
    const resolvedLocalState = localState ?? getState();

    if (reason === "connect" && remoteState) {
      suppressNextDriveSync = true;
      replaceState(remoteState, { preserveTimestamp: true });
      return;
    }

    const remoteTime = remoteState?.lastUpdated
      ? new Date(remoteState.lastUpdated).getTime()
      : 0;
    const localTime = resolvedLocalState?.lastUpdated
      ? new Date(resolvedLocalState.lastUpdated).getTime()
      : 0;
    if (remoteState && remoteTime > localTime) {
      if (reason === "add-card" && meta?.addedCards?.length) {
        const mergedState = mergeAddedCardsIntoRemote(
          remoteState,
          resolvedLocalState,
          meta.addedCards,
        );
        suppressNextDriveSync = true;
        replaceState(mergedState);
        await pushToDrive(mergedState);
      } else {
        suppressNextDriveSync = true;
        replaceState(remoteState, { preserveTimestamp: true });
      }
    } else {
      await pushToDrive(resolvedLocalState);
    }
  } catch (error) {
    console.error("Google Drive sync failed", error);
    if (
      throwOnError ||
      reason === "manual" ||
      reason === "add-card" ||
      reason === "connect"
    ) {
      throw error;
    }
  } finally {
    driveSyncInFlight = false;
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
  driveSyncInFlight = false;
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

export const initDriveUI = (callbacks = {}) => {
  driveCallbacks = {
    ...driveCallbacks,
    ...callbacks,
  };

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
        } catch (error) {
          console.error("Failed to pull Drive data", error);
          showSnackbar("Failed to load Drive data: " + error.message);
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
    showSnackbar("Manually syncing with Google Drive...");
    try {
      await runDriveSync({ reason: "manual" });
      showSnackbar("Manual sync with Drive completed.");
    } catch (error) {
      showSnackbar("Drive sync failed: " + error.message);
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
