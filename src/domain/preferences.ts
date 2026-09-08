export type UiTheme = 'system' | 'dark' | 'light';
export type GlobalPreferences = {
  theme: UiTheme;
  reduceMotion: boolean;
  showTooltips: boolean;
  confirmDiscardExport: boolean;
};

const storageKey = 'usesuno-mv-preferences';
export const defaultPreferences: GlobalPreferences = {
  theme: 'system',
  reduceMotion: false,
  showTooltips: true,
  confirmDiscardExport: true,
};

export function loadPreferences(): GlobalPreferences {
  try { return { ...defaultPreferences, ...JSON.parse(localStorage.getItem(storageKey) || '{}') }; }
  catch { return defaultPreferences; }
}

export function savePreferences(value: GlobalPreferences) {
  localStorage.setItem(storageKey, JSON.stringify(value));
}

export function applyPreferences(value: GlobalPreferences) {
  const dark = value.theme === 'dark' || (value.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.uiTheme = dark ? 'dark' : 'light';
  document.documentElement.dataset.reduceMotion = value.reduceMotion ? 'true' : 'false';
  document.documentElement.dataset.tooltips = value.showTooltips ? 'true' : 'false';
}
