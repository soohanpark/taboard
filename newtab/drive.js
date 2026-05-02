import {
  clearDriveMetadata,
  loadDriveMetadata,
  saveDriveMetadata,
} from "./storage.js";
import { showSnackbar } from "./modals.js";

const FILE_NAME = "TaboardSync.json";
const DRIVE_API = "https://www.googleapis.com/drive/v3/files";
const DRIVE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3/files";
const USER_INFO_ENDPOINT = "https://www.googleapis.com/oauth2/v2/userinfo";

// TODO: Create an OAuth client ID in Google Cloud Console, then replace manifest.json oauth2.client_id with the real value.

const listeners = new Set();
const INITIAL_DRIVE_STATE = Object.freeze({
  status: "disconnected",
  user: null,
  fileId: null,
  lastSyncedAt: null,
  lastCheckedAt: null,
  lastKnownDriveModifiedTime: null,
  syncing: false,
  lastError: null,
});

let driveState = { ...INITIAL_DRIVE_STATE };

const setDriveState = (patch) => {
  driveState = { ...driveState, ...patch };
};

const emit = () => {
  const snapshot = Object.freeze({ ...driveState });
  for (const listener of listeners) {
    listener(snapshot);
  }
};

const persistMeta = async () => {
  const {
    fileId,
    lastSyncedAt,
    lastCheckedAt,
    user,
    lastKnownDriveModifiedTime,
  } = driveState;
  await saveDriveMetadata({
    fileId,
    lastSyncedAt,
    lastCheckedAt,
    user,
    lastKnownDriveModifiedTime,
  });
};

const getAuthToken = (interactive = false) =>
  new Promise((resolve, reject) => {
    if (!chrome?.identity?.getAuthToken) {
      reject(new Error("chrome.identity API is unavailable."));
      return;
    }

    chrome.identity.getAuthToken({ interactive }, (token) => {
      const error = chrome.runtime?.lastError;
      if (error || !token) {
        reject(error ?? new Error("Failed to acquire auth token."));
      } else {
        resolve(token);
      }
    });
  });

const createDriveError = (message, { status = null, cause = null } = {}) => {
  const error = new Error(message);
  if (status !== null) {
    error.status = status;
  }
  if (cause) {
    error.cause = cause;
  }
  return error;
};

const fetchJson = async (url, options = {}, signal = null) => {
  const fetchOptions = { ...options };
  fetchOptions.headers = {
    ...(options.headers ?? {}),
  };
  if (signal) {
    fetchOptions.signal = signal;
  }

  let response;
  try {
    response = await fetch(url, fetchOptions);
  } catch (error) {
    if (error?.name === "AbortError") {
      throw error;
    }
    throw createDriveError("Network error while contacting Google Drive.", {
      cause: error,
    });
  }

  if (!response.ok) {
    throw createDriveError(`Google API error: ${response.status}`, {
      status: response.status,
    });
  }

  return response.json();
};

const isTransientError = (error) => {
  if (!error) return false;
  if (error.name === "AbortError") return false;
  if (typeof error.status === "number" && error.status >= 500) return true;
  const message = String(error.message ?? "").toLowerCase();
  return (
    error.name === "NetworkError" ||
    error.name === "TypeError" ||
    message.includes("network")
  );
};

const withRetry = async (fn, maxRetries = 1, delayMs = 2000) => {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt < maxRetries && isTransientError(error)) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }
      throw error;
    }
  }
};

const ensureDriveFile = async (token, signal = null) => {
  if (driveState.fileId) {
    return driveState.fileId;
  }

  const query = encodeURIComponent(`name='${FILE_NAME}' and trashed=false`);
  const result = await fetchJson(
    `${DRIVE_API}?q=${query}&fields=files(id,name)`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
    signal,
  );
  if (result?.files?.length) {
    setDriveState({ fileId: result.files[0].id });
    await persistMeta();
    return driveState.fileId;
  }

  const metadata = {
    name: FILE_NAME,
    mimeType: "application/json",
  };

  const boundary = `taboard-${Date.now()}`;
  const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(
    metadata,
  )}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(
    {
      version: 1,
      spaces: [],
      preferences: {},
    },
  )}\r\n--${boundary}--`;

  const created = await fetchJson(
    `${DRIVE_UPLOAD_API}?uploadType=multipart`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body,
    },
    signal,
  );
  setDriveState({ fileId: created.id });
  await persistMeta();
  return created.id;
};

const uploadData = async (token, fileId, data, signal = null) => {
  let response;
  try {
    response = await fetch(
      `${DRIVE_UPLOAD_API}/${fileId}?uploadType=media&fields=modifiedTime`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
        signal,
      },
    );
  } catch (error) {
    if (error?.name === "AbortError") {
      throw error;
    }
    throw createDriveError("Network error while uploading Drive data.", {
      cause: error,
    });
  }

  if (!response.ok) {
    if (response.status === 404) {
      setDriveState({ fileId: null });
    }
    throw createDriveError(`Failed to upload data (${response.status}).`, {
      status: response.status,
    });
  }

  try {
    const json = await response.json();
    return { modifiedTime: json?.modifiedTime ?? null };
  } catch {
    return { modifiedTime: null };
  }
};

const fetchModifiedTime = async (token, fileId, signal = null) => {
  const json = await fetchJson(
    `${DRIVE_API}/${fileId}?fields=modifiedTime`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
    signal,
  );
  return json?.modifiedTime ?? null;
};

const downloadData = async (token, fileId, signal = null) => {
  try {
    return await fetchJson(
      `${DRIVE_API}/${fileId}?alt=media`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
      signal,
    );
  } catch (error) {
    if (error?.status === 404) {
      setDriveState({ fileId: null });
    }
    throw error;
  }
};

const fetchUserProfile = async (token, signal = null) => {
  const profile = await fetchJson(
    `${USER_INFO_ENDPOINT}?alt=json`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
    signal,
  );
  return {
    email: profile.email,
    picture: profile.picture,
    name: profile.name ?? profile.email?.split("@")[0],
  };
};

export const initDrive = async () => {
  const meta = await loadDriveMetadata();
  if (meta?.fileId) {
    setDriveState({
      status: "connected",
      fileId: meta.fileId,
      lastSyncedAt: meta.lastSyncedAt ?? null,
      lastCheckedAt: meta.lastCheckedAt ?? null,
      lastKnownDriveModifiedTime: meta.lastKnownDriveModifiedTime ?? null,
      user: meta.user ?? null,
    });
    emit();
  }
};

export const subscribeDrive = (listener) => {
  listeners.add(listener);
  listener({ ...driveState });
  return () => listeners.delete(listener);
};

export const getDriveSnapshot = () => ({ ...driveState });

export const connectDrive = async () => {
  setDriveState({ lastError: null });
  try {
    const token = await getAuthToken(true);
    const profile = await fetchUserProfile(token);
    const fileId = await ensureDriveFile(token);
    setDriveState({
      status: "connected",
      user: profile,
      fileId,
    });
    await persistMeta();
    emit();
    return { token, fileId };
  } catch (error) {
    setDriveState({ lastError: error.message });
    emit();
    showSnackbar("Failed to connect to Drive: " + error.message);
    throw error;
  }
};

export const disconnectDrive = async () => {
  try {
    await clearDriveMetadata();
    setDriveState(INITIAL_DRIVE_STATE);
    emit();

    if (chrome?.identity?.getAuthToken) {
      chrome.identity.getAuthToken({ interactive: false }, (token) => {
        if (chrome.runtime?.lastError || !token) {
          return;
        }
        fetch("https://oauth2.googleapis.com/revoke", {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({ token }),
        }).finally(() => {
          chrome.identity.removeCachedAuthToken({ token });
        });
      });
    }
  } catch (error) {
    showSnackbar("Failed to disconnect Drive.");
  }
};

const removeCachedToken = (token) =>
  new Promise((resolve) => {
    if (!chrome?.identity?.removeCachedAuthToken) {
      resolve();
      return;
    }
    chrome.identity.removeCachedAuthToken({ token }, () => resolve());
  });

const withFreshToken = async (fn, allowInteractive = true) => {
  let token;
  try {
    token = await getAuthToken(false);
  } catch {
    if (!allowInteractive) {
      throw createDriveError(
        "Auth token unavailable. Re-authenticate manually.",
      );
    }
    token = await getAuthToken(true);
  }
  try {
    return await fn(token);
  } catch (error) {
    if (error?.status === 401) {
      await removeCachedToken(token);
      if (!allowInteractive) {
        throw createDriveError(
          "Auth token expired. Re-authenticate manually.",
          { status: 401, cause: error },
        );
      }
      const freshToken = await getAuthToken(true);
      return await fn(freshToken);
    }
    throw error;
  }
};

const stripFavicons = (state) => {
  if (!state) return state;
  return JSON.parse(
    JSON.stringify(state, (key, value) =>
      key === "favicon" ? undefined : value,
    ),
  );
};

export const pushToDrive = async (state, options = {}) => {
  if (driveState.status !== "connected") {
    return { modifiedTime: null };
  }

  const { signal = null, allowInteractive = true } = options;

  setDriveState({ syncing: true });
  emit();

  try {
    const result = await withRetry(async () => {
      return await withFreshToken(async (token) => {
        const fileId = await ensureDriveFile(token, signal);
        return await uploadData(token, fileId, stripFavicons(state), signal);
      }, allowInteractive);
    });
    const modifiedTime = result?.modifiedTime ?? null;
    setDriveState({
      lastSyncedAt: new Date().toISOString(),
      lastKnownDriveModifiedTime:
        modifiedTime ?? driveState.lastKnownDriveModifiedTime,
      syncing: false,
      lastError: null,
    });
    await persistMeta();
    emit();
    return { modifiedTime };
  } catch (error) {
    setDriveState({ syncing: false, lastError: error.message });
    emit();
    showSnackbar("Drive sync failed: " + error.message);
    throw error;
  }
};

export const pullFromDrive = async (options = {}) => {
  if (driveState.status !== "connected") {
    throw new Error("Drive is not connected.");
  }

  const { signal = null, allowInteractive = true } = options;

  setDriveState({ syncing: true });
  emit();

  try {
    const result = await withRetry(async () => {
      return await withFreshToken(async (token) => {
        const fileId = await ensureDriveFile(token, signal);
        const data = await downloadData(token, fileId, signal);
        const modifiedTime = await fetchModifiedTime(token, fileId, signal);
        return { data, modifiedTime };
      }, allowInteractive);
    });
    const { data, modifiedTime } = result;
    if (!data || typeof data !== "object" || !Array.isArray(data.spaces)) {
      throw createDriveError("Invalid data format received from Drive.");
    }
    const patch = {
      syncing: false,
      lastError: null,
      lastKnownDriveModifiedTime:
        modifiedTime ?? driveState.lastKnownDriveModifiedTime,
    };
    if (options.markChecked) {
      patch.lastCheckedAt = new Date().toISOString();
    }
    setDriveState(patch);
    await persistMeta();
    emit();
    return { data, modifiedTime };
  } catch (error) {
    setDriveState({ syncing: false, lastError: error.message });
    emit();
    showSnackbar("Failed to load Drive data: " + error.message);
    throw error;
  }
};

export const getDriveFileModifiedTime = async (options = {}) => {
  if (driveState.status !== "connected") return null;
  const { signal = null, allowInteractive = false } = options;
  return await withFreshToken(async (token) => {
    const fileId = await ensureDriveFile(token, signal);
    return fetchModifiedTime(token, fileId, signal);
  }, allowInteractive);
};
