import type { ScoreValue } from '../games/types';

const KEY = 'playplace.bests';

export type Best = {
  primary: number;
  label: string;
  lowerIsBetter: boolean;
  at: number;
  plays: number;
};

type Store = Record<string, Best>;

function load(): Store {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}') as Store;
  } catch {
    return {};
  }
}

function save(store: Store) {
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    /* ignore */
  }
}

export function isBetter(next: number, prev: number, lowerIsBetter: boolean): boolean {
  return lowerIsBetter ? next < prev : next > prev;
}

export function getBest(gameId: string): Best | null {
  return load()[gameId] ?? null;
}

export function getAllBests(): Store {
  return load();
}

export type SoloRecord = {
  isNewBest: boolean;
  isFirst: boolean;
  prev: Best | null;
  plays: number;
};

/** Record a finished solo run. Call exactly once per run. */
export function recordSolo(gameId: string, score: ScoreValue): SoloRecord {
  const store = load();
  const prev = store[gameId] ?? null;
  const lower = !!score.lowerIsBetter;
  const isFirst = !prev;
  const isNewBest = !prev || isBetter(score.primary, prev.primary, lower);
  const plays = (prev?.plays ?? 0) + 1;
  store[gameId] = isNewBest
    ? { primary: score.primary, label: score.label, lowerIsBetter: lower, at: Date.now(), plays }
    : { ...prev!, plays };
  save(store);
  return { isNewBest, isFirst, prev, plays };
}
