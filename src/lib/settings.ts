const KEY = 'playplace.settings';

export type ThemeMode = 'auto' | 'light' | 'night';

export type Settings = {
  sound: boolean;
  haptics: boolean;
  theme: ThemeMode;
  colorblind: boolean;
};

const DEFAULTS: Settings = {
  sound: true,
  haptics: true,
  theme: 'auto',
  colorblind: false,
};

let cache: Settings | null = null;
const listeners = new Set<() => void>();

export function getSettings(): Settings {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    cache = { ...DEFAULTS, ...(raw ? (JSON.parse(raw) as Partial<Settings>) : {}) };
  } catch {
    cache = { ...DEFAULTS };
  }
  return cache;
}

export function updateSettings(patch: Partial<Settings>) {
  cache = { ...getSettings(), ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    /* ignore */
  }
  applySettings();
  listeners.forEach((fn) => fn());
}

export function subscribeSettings(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function applySettings() {
  const s = getSettings();
  const root = document.documentElement;
  root.dataset.theme = s.theme;
  root.dataset.cb = s.colorblind ? 'on' : 'off';
}
