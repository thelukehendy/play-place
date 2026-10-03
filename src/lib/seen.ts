const KEY = 'playplace.seenRules';

function load(): string[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]') as string[];
  } catch {
    return [];
  }
}

export function hasSeenRules(gameId: string): boolean {
  return load().includes(gameId);
}

export function markRulesSeen(gameId: string) {
  const seen = load();
  if (seen.includes(gameId)) return;
  try {
    localStorage.setItem(KEY, JSON.stringify([...seen, gameId]));
  } catch {
    /* ignore */
  }
}

const LAST_KEY = 'playplace.lastPlayed';

export function getLastPlayed(): string | null {
  try {
    return localStorage.getItem(LAST_KEY);
  } catch {
    return null;
  }
}

export function setLastPlayed(gameId: string) {
  try {
    localStorage.setItem(LAST_KEY, gameId);
  } catch {
    /* ignore */
  }
}
