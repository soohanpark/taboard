import {
  clearDriveMetadata,
  loadDriveMetadata,
  saveDriveMetadata,
} from "./storage.js";

const FILE_NAME = "TaboardSync.json";
const DRIVE_API = "https://www.googleapis.com/drive/v3/files";
const DRIVE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3/files";
const USER_INFO_ENDPOINT = "https://www.googleapis.com/oauth2/v2/userinfo";

// TODO: Create an OAuth client ID in Google Cloud Console, then replace manifest.json oauth2.client_id with the real value.

const listeners = new Set();
let driveState = {
  status: "disconnected",
  user: null,
  fileId: null,
  lastSyncedAt: null,
  syncing: false,
  lastError: null,
};

const emit = () => {
  for (const listener of listeners) {
    listener({ ...driveState });
  }
};

const persistMeta = async () => {
  const { fileId, lastSyncedAt, user } = driveState;
  await saveDriveMetadata({ fileId, lastSyncedAt, user });
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

const fetchJson = async (url, token) => {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  if (!response.ok) {
    throw new Error(`Google API error: ${response.status}`);
  }
  return response.json();
};

const ensureDriveFile = async (token) => {
  if (driveState.fileId) {
    return driveState.fileId;
  }

  const query = encodeURIComponent(`name='${FILE_NAME}' and trashed=false`);
  const result = await fetchJson(
    `${DRIVE_API}?q=${query}&fields=files(id,name)`,
    token,
  );
  if (result?.files?.length) {
    driveState.fileId = result.files[0].id;
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

  const response = await fetch(`${DRIVE_UPLOAD_API}?uploadType=multipart`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
    },
    body,
  });

  if (!response.ok) {
    throw new Error("Failed to create Drive file.");
  }

  const created = await response.json();
  driveState.fileId = created.id;
  await persistMeta();
  return created.id;
};

const uploadData = async (token, fileId, data) => {
  const response = await fetch(
    `${DRIVE_UPLOAD_API}/${fileId}?uploadType=media`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    },
  );

  if (!response.ok) {
    throw new Error(`Failed to upload data (${response.status}).`);
  }
};

const downloadData = async (token, fileId) => {
  const response = await fetch(`${DRIVE_API}/${fileId}?alt=media`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error("Failed to download data.");
  }

  return response.json();
};

const fetchUserProfile = async (token) => {
  const profile = await fetchJson(`${USER_INFO_ENDPOINT}?alt=json`, token);
  return {
    email: profile.email,
    picture: profile.picture,
    name: profile.name ?? profile.email?.split("@")[0],
  };
};

export const initDrive = async () => {
  const meta = await loadDriveMetadata();
  if (meta?.fileId) {
    driveState = {
      ...driveState,
      status: "connected",
      fileId: meta.fileId,
      lastSyncedAt: meta.lastSyncedAt ?? null,
      user: meta.user ?? null,
    };
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
  driveState.lastError = null;
  try {
    const token = await getAuthToken(true);
    const profile = await fetchUserProfile(token);
    const fileId = await ensureDriveFile(token);
    driveState = {
      ...driveState,
      status: "connected",
      user: profile,
      fileId,
    };
    await persistMeta();
    emit();
    return { token, fileId };
  } catch (error) {
    driveState.lastError = error.message;
    emit();
    throw error;
  }
};

export const disconnectDrive = async () => {
  try {
    await clearDriveMetadata();
    driveState = {
      status: "disconnected",
      user: null,
      fileId: null,
      lastSyncedAt: null,
      syncing: false,
      lastError: null,
    };
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
    console.error("Failed to disconnect Drive", error);
  }
};

const withToken = async (interactive = false) => {
  try {
    return await getAuthToken(interactive);
  } catch (error) {
    if (!interactive) {
      return getAuthToken(true);
    }
    throw error;
  }
};

const stripFavicons = (state) => {
  if (!state) return state;
  const clone = JSON.parse(JSON.stringify(state));
  clone.spaces?.forEach((space) => {
    space.sections?.forEach((section) => {
      section.cards?.forEach((card) => {
        delete card.favicon;
      });
    });
  });
  return clone;
};

export const pushToDrive = async (state) => {
  if (driveState.status !== "connected") {
    return;
  }

  driveState.syncing = true;
  emit();

  try {
    const token = await withToken(false);
    const fileId = await ensureDriveFile(token);
    await uploadData(token, fileId, stripFavicons(state));
    driveState.lastSyncedAt = new Date().toISOString();
    driveState.syncing = false;
    driveState.lastError = null;
    await persistMeta();
    emit();
  } catch (error) {
    driveState.syncing = false;
    driveState.lastError = error.message;
    emit();
    throw error;
  }
};

export const pullFromDrive = async () => {
  if (driveState.status !== "connected") {
    throw new Error("Drive is not connected.");
  }

  driveState.syncing = true;
  emit();

  try {
    const token = await withToken(false);
    const fileId = await ensureDriveFile(token);
    const data = await downloadData(token, fileId);
    driveState.syncing = false;
    driveState.lastError = null;
    emit();
    return data;
  } catch (error) {
    driveState.syncing = false;
    driveState.lastError = error.message;
    emit();
    throw error;
  }
};
