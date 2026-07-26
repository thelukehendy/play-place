const STATS_KEY = 'playplace.mpStats';

export type GameStat = {
  played: number;
  wins: number;
  bestPrimary: number | null;
};

export type MatchPlayerStat = {
  name: string;
  primary: number;
  label?: string;
  won: boolean;
};

export type MatchRecord = {
  at: number;
  gameId: string;
  code: string;
  players: MatchPlayerStat[];
};

export type CareerStats = {
  matches: number;
  wins: number;
  byGame: Record<string, GameStat>;
  recent: MatchRecord[];
};

const empty = (): CareerStats => ({ matches: 0, wins: 0, byGame: {}, recent: [] });

export function loadStats(): CareerStats {
  try {
    const raw = localStorage.getItem(STATS_KEY);
    if (!raw) return empty();
    const parsed = JSON.parse(raw) as CareerStats;
    return {
      matches: parsed.matches ?? 0,
      wins: parsed.wins ?? 0,
      byGame: parsed.byGame ?? {},
      recent: parsed.recent ?? [],
    };
  } catch {
    return empty();
  }
}

function saveStats(stats: CareerStats) {
  localStorage.setItem(STATS_KEY, JSON.stringify(stats));
}

/** Record a finished multiplayer match with every player's score. */
export function recordMultiplayerMatch(input: {
  gameId: string;
  code: string;
  localPlayerId: string;
  players: { id: string; name: string; primary: number; label?: string }[];
  winnerId?: string | null;
}) {
  const stats = loadStats();
  const primaries = input.players.map((p) => p.primary);
  const best = primaries.length ? Math.max(...primaries) : 0;
  const topIds = input.players.filter((p) => p.primary === best).map((p) => p.id);
  const soleWinner =
    input.winnerId || (topIds.length === 1 ? topIds[0] : undefined);

  const local = input.players.find((p) => p.id === input.localPlayerId);
  const localWon = !!local && local.id === soleWinner;

  stats.matches += 1;
  if (localWon) stats.wins += 1;

  if (local) {
    const g = stats.byGame[input.gameId] ?? { played: 0, wins: 0, bestPrimary: null };
    g.played += 1;
    if (localWon) g.wins += 1;
    g.bestPrimary =
      g.bestPrimary == null ? local.primary : Math.max(g.bestPrimary, local.primary);
    stats.byGame[input.gameId] = g;
  }

  const record: MatchRecord = {
    at: Date.now(),
    gameId: input.gameId,
    code: input.code,
    players: input.players.map((p) => ({
      name: p.name,
      primary: p.primary,
      label: p.label,
      won: p.id === soleWinner,
    })),
  };
  stats.recent = [record, ...stats.recent].slice(0, 25);
  saveStats(stats);
  return stats;
}
