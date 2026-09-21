const THEME_STORAGE_KEY = "taboard.theme.v1";

export const THEME_PREFERENCES = Object.freeze(["system", "light", "dark"]);

export const normalizeThemePreference = (value) =>
  THEME_PREFERENCES.includes(value) ? value : "system";

export const resolveTheme = (preference, prefersDark = false) => {
  const normalized = normalizeThemePreference(preference);
  if (normalized === "system") return prefersDark ? "dark" : "light";
  return normalized;
};

export const getNextThemePreference = (preference) => {
  const index = THEME_PREFERENCES.indexOf(normalizeThemePreference(preference));
  return THEME_PREFERENCES[(index + 1) % THEME_PREFERENCES.length];
};

const listeners = new Set();
const hasWindow = typeof window !== "undefined";
const hasDocument = typeof document !== "undefined";
const colorSchemeQuery = hasWindow
  ? window.matchMedia?.("(prefers-color-scheme: dark)")
  : null;

const readStoredPreference = () => {
  if (!hasWindow) return "system";
  try {
    return normalizeThemePreference(
      window.localStorage.getItem(THEME_STORAGE_KEY),
    );
  } catch (error) {
    console.warn("Could not read the theme preference.", error);
    return "system";
  }
};

let preference = readStoredPreference();

export const getThemeSnapshot = () => ({
  preference,
  resolved: resolveTheme(preference, Boolean(colorSchemeQuery?.matches)),
});

const applyTheme = () => {
  const snapshot = getThemeSnapshot();
  if (hasDocument) {
    const root = document.documentElement;
    root.dataset.theme = snapshot.resolved;
    root.dataset.themePreference = snapshot.preference;
    root.style.colorScheme = snapshot.resolved;
  }
  listeners.forEach((listener) => listener(snapshot));
  return snapshot;
};

const persistPreference = () => {
  if (!hasWindow) return;
  try {
    if (preference === "system") {
      window.localStorage.removeItem(THEME_STORAGE_KEY);
    } else {
      window.localStorage.setItem(THEME_STORAGE_KEY, preference);
    }
  } catch (error) {
    console.warn("Could not save the theme preference.", error);
  }
};

export const setThemePreference = (nextPreference, options = {}) => {
  preference = normalizeThemePreference(nextPreference);
  if (options.persist !== false) persistPreference();
  return applyTheme();
};

export const cycleThemePreference = () =>
  setThemePreference(getNextThemePreference(preference));

export const subscribeTheme = (listener) => {
  listeners.add(listener);
  listener(getThemeSnapshot());
  return () => listeners.delete(listener);
};

const handleSystemThemeChange = () => {
  if (preference === "system") applyTheme();
};

if (colorSchemeQuery?.addEventListener) {
  colorSchemeQuery.addEventListener("change", handleSystemThemeChange);
} else {
  colorSchemeQuery?.addListener?.(handleSystemThemeChange);
}

if (hasWindow) {
  window.addEventListener("storage", (event) => {
    if (event.key !== THEME_STORAGE_KEY) return;
    preference = normalizeThemePreference(event.newValue);
    applyTheme();
  });
}

applyTheme();
