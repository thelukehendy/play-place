import { GAMES, getGame } from '../games/registry';
import { loadStats } from '../lib/stats';
import { Button } from '../ui/Button';
import { Panel } from '../ui/Panel';

type Props = {
  onBack: () => void;
};

export function Stats({ onBack }: Props) {
  const stats = loadStats();
  const rows = GAMES.map((g) => ({
    game: g,
    stat: stats.byGame[g.id],
  })).filter((r) => r.stat && r.stat.played > 0);

  return (
    <div className="library" style={{ animation: 'pop-in 0.35s var(--bounce)' }}>
      <div className="library-header">
        <h2 className="h2">Stats</h2>
        <Button variant="ghost" onClick={onBack}>
          Games
        </Button>
      </div>

      <Panel>
        <p className="h3">Your multiplayer record</p>
        <p style={{ fontWeight: 800, margin: '6px 0 0' }}>
          Matches: {stats.matches} · Wins: {stats.wins}
        </p>
        {rows.length === 0 ? (
          <p className="muted" style={{ marginTop: 8 }}>
            Play a party match to fill this up.
          </p>
        ) : (
          <ul style={{ paddingLeft: 18, fontWeight: 700, margin: '10px 0 0' }}>
            {rows.map(({ game, stat }) => (
              <li key={game.id} style={{ marginBottom: 6 }}>
                {game.emoji} {game.title} — {stat!.played} played, {stat!.wins} wins
                {stat!.bestPrimary != null ? ` · best ${stat!.bestPrimary}` : ''}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <div style={{ height: 12 }} />
      <Panel>
        <p className="h3">Recent party matches</p>
        <p className="muted" style={{ margin: '4px 0 12px' }}>
          Everyone who played, with their scores.
        </p>
        {stats.recent.length === 0 ? (
          <p className="muted">No party matches saved yet.</p>
        ) : (
          <div className="stack">
            {stats.recent.map((m) => {
              const game = getGame(m.gameId);
              return (
                <div key={`${m.at}-${m.code}-${m.gameId}`} style={{ marginBottom: 4 }}>
                  <p style={{ fontWeight: 800, marginBottom: 4 }}>
                    {game?.emoji ?? '🎮'} {game?.title ?? m.gameId}{' '}
                    <span className="muted">· {m.code}</span>
                  </p>
                  <ul style={{ paddingLeft: 18, margin: 0, fontWeight: 700 }}>
                    {m.players.map((p, i) => (
                      <li key={`${p.name}-${i}`}>
                        {p.name}
                        {p.won ? ' 🏆' : ''} — {p.label ?? p.primary}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </Panel>
    </div>
  );
}
