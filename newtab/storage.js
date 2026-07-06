const STATE_KEY = "taboard.state.v1";
const DRIVE_META_KEY = "taboard.drive.meta.v1";
const DRIVE_DIRTY_KEY = "taboard.drive.dirty.v1";

const withStorage = async (method, payload) => {
  try {
    return await new Promise((resolve, reject) => {
      if (!chrome?.storage?.local?.[method]) {
        reject(new Error("chrome.storage.local is unavailable."));
        return;
      }

      chrome.storage.local[method](payload, (result) => {
        const error = chrome.runtime?.lastError;
        if (error) {
          reject(error);
        } else {
          resolve(result);
        }
      });
    });
  } catch (err) {
    // Retry once after 100ms on failure
    await new Promise((r) => setTimeout(r, 100));
    return await new Promise((resolve, reject) => {
      if (!chrome?.storage?.local?.[method]) {
        reject(new Error("chrome.storage.local is unavailable."));
        return;
      }

      chrome.storage.local[method](payload, (result) => {
        const error = chrome.runtime?.lastError;
        if (error) {
          reject(error);
        } else {
          resolve(result);
        }
      });
    });
  }
};

export const loadStateFromStorage = async () => {
  try {
    const result = await withStorage("get", STATE_KEY);
    return result?.[STATE_KEY] ?? null;
  } catch (error) {
    console.error("Failed to load state", error);
    throw error;
  }
};

export const saveStateToStorage = async (state) => {
  try {
    await withStorage("set", { [STATE_KEY]: state });
    return { success: true };
  } catch (error) {
    console.error("Failed to persist state", error);
    return { success: false, error };
  }
};

export const loadDriveMetadata = async () => {
  try {
    const result = await withStorage("get", DRIVE_META_KEY);
    return result?.[DRIVE_META_KEY] ?? null;
  } catch (error) {
    console.error("Failed to load drive metadata", error);
    return null;
  }
};

export const saveDriveMetadata = async (meta) => {
  try {
    await withStorage("set", { [DRIVE_META_KEY]: meta });
    return { success: true };
  } catch (error) {
    console.error("Failed to persist drive metadata", error);
    return { success: false, error };
  }
};

export const clearDriveMetadata = async () => {
  try {
    await withStorage("remove", DRIVE_META_KEY);
    return { success: true };
  } catch (error) {
    console.error("Failed to clear drive metadata", error);
    return { success: false, error };
  }
};

// True while a local content change has not yet reached Drive.
export const loadDriveDirtyFlag = async () => {
  try {
    const result = await withStorage("get", DRIVE_DIRTY_KEY);
    return Boolean(result?.[DRIVE_DIRTY_KEY]);
  } catch (error) {
    console.error("Failed to load drive dirty flag", error);
    return false;
  }
};

export const saveDriveDirtyFlag = async (dirty) => {
  try {
    await withStorage("set", { [DRIVE_DIRTY_KEY]: Boolean(dirty) });
    return { success: true };
  } catch (error) {
    console.error("Failed to persist drive dirty flag", error);
    return { success: false, error };
  }
};

export const clearDriveDirtyFlag = async () => {
  try {
    await withStorage("remove", DRIVE_DIRTY_KEY);
    return { success: true };
  } catch (error) {
    console.error("Failed to clear drive dirty flag", error);
    return { success: false, error };
  }
};

// Every new-tab page is a live instance; keep their in-memory mirrors of the
// dirty flag honest when another instance writes it.
export const onDriveDirtyFlagChanged = (callback) => {
  if (!chrome?.storage?.onChanged) return;
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") return;
    if (!(DRIVE_DIRTY_KEY in changes)) return;
    callback(Boolean(changes[DRIVE_DIRTY_KEY].newValue));
  });
};
