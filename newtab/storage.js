const STATE_KEY = "taboard.state.v1";
const DRIVE_META_KEY = "taboard.drive.meta.v1";

const withStorage = (method, payload) =>
  new Promise((resolve, reject) => {
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

export const loadStateFromStorage = async () => {
  try {
    const result = await withStorage("get", STATE_KEY);
    return result?.[STATE_KEY] ?? null;
  } catch (error) {
    console.error("Failed to load state", error);
    return null;
  }
};

export const saveStateToStorage = async (state) => {
  try {
    await withStorage("set", { [STATE_KEY]: state });
  } catch (error) {
    console.error("Failed to persist state", error);
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
  } catch (error) {
    console.error("Failed to persist drive metadata", error);
  }
};

export const clearDriveMetadata = async () => {
  try {
    await withStorage("remove", DRIVE_META_KEY);
  } catch (error) {
    console.error("Failed to clear drive metadata", error);
  }
};
