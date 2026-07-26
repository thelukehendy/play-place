const STATS_KEY = 'playplace.mpStats';

export type GameStat = {
  played: number;
  wins: number;
  bestPrimary: number | null;
};

export type CareerStats = {
  matches: number;
  wins: number;
  byGame: Record<string, GameStat>;
};

const empty = (): CareerStats => ({ matches: 0, wins: 0, byGame: {} });

export function loadStats(): CareerStats {
  try {
    const raw = localStorage.getItem(STATS_KEY);
    if (!raw) return empty();
    const parsed = JSON.parse(raw) as CareerStats;
    return {
      matches: parsed.matches ?? 0,
      wins: parsed.wins ?? 0,
      byGame: parsed.byGame ?? {},
    };
  } catch {
    return empty();
  }
}

function saveStats(stats: CareerStats) {
  localStorage.setItem(STATS_KEY, JSON.stringify(stats));
}

/** Record one finished multiplayer match for the local player. */
export function recordMultiplayerResult(input: {
  gameId: string;
  primary: number;
  won: boolean;
}) {
  const stats = loadStats();
  stats.matches += 1;
  if (input.won) stats.wins += 1;
  const g = stats.byGame[input.gameId] ?? { played: 0, wins: 0, bestPrimary: null };
  g.played += 1;
  if (input.won) g.wins += 1;
  g.bestPrimary =
    g.bestPrimary == null ? input.primary : Math.max(g.bestPrimary, input.primary);
  stats.byGame[input.gameId] = g;
  saveStats(stats);
  return stats;
}
