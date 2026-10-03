import { GAMES } from '../games/registry';
import type { ScoreValue } from '../games/types';
import { hashString } from './random';
import { isBetter } from './bests';

const KEY = 'playplace.daily';

type DayEntry = { primary: number; label: string; lowerIsBetter: boolean };

type Store = {
  days: Record<string, Record<string, DayEntry>>;
  lastDay: string | null;
  streak: number;
  bestStreak: number;
};

function empty(): Store {
  return { days: {}, lastDay: null, streak: 0, bestStreak: 0 };
}

function load(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty();
    return { ...empty(), ...(JSON.parse(raw) as Partial<Store>) };
  } catch {
    return empty();
  }
}

function save(store: Store) {
  const keys = Object.keys(store.days).sort();
  for (const k of keys.slice(0, Math.max(0, keys.length - 14))) delete store.days[k];
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    /* ignore */
  }
}

/** UTC date so everybody gets the same puzzle on the same day. */
export function todayKey(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

function yesterdayOf(key: string): string {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export function dailyGameId(dateKey = todayKey()): string {
  const pool = GAMES.filter((g) => g.daily).map((g) => g.id);
  return pool[hashString(`playplace-daily-${dateKey}`) % pool.length];
}

export function dailySeed(dateKey = todayKey(), gameId = dailyGameId(dateKey)): number {
  return (hashString(`${dateKey}:${gameId}`) || 1) >>> 0;
}

export type DailyStatus = {
  dateKey: string;
  gameId: string;
  today: DayEntry | null;
  streak: number;
  bestStreak: number;
};

export function getDailyStatus(dateKey = todayKey()): DailyStatus {
  const store = load();
  const gameId = dailyGameId(dateKey);
  const alive =
    store.lastDay === dateKey || store.lastDay === yesterdayOf(dateKey) ? store.streak : 0;
  return {
    dateKey,
    gameId,
    today: store.days[dateKey]?.[gameId] ?? null,
    streak: alive,
    bestStreak: store.bestStreak,
  };
}

export type DailyRecord = {
  isBest: boolean;
  streak: number;
  firstToday: boolean;
  prev: DayEntry | null;
};

export function recordDaily(dateKey: string, gameId: string, score: ScoreValue): DailyRecord {
  const store = load();
  const day = (store.days[dateKey] ||= {});
  const prev = day[gameId] ?? null;
  const lower = !!score.lowerIsBetter;
  const isBest = !prev || isBetter(score.primary, prev.primary, lower);
  const firstToday = store.lastDay !== dateKey;
  if (isBest) day[gameId] = { primary: score.primary, label: score.label, lowerIsBetter: lower };
  if (firstToday) {
    store.streak = store.lastDay === yesterdayOf(dateKey) ? store.streak + 1 : 1;
    store.lastDay = dateKey;
    store.bestStreak = Math.max(store.bestStreak, store.streak);
  }
  save(store);
  return { isBest, streak: store.streak, firstToday, prev };
}
