import { GAMES } from '../games/registry';
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
        <p className="h3">Multiplayer career</p>
        <p className="muted" style={{ margin: '6px 0 12px' }}>
          Wins and scores from party matches on this device.
        </p>
        <p style={{ fontWeight: 800, marginBottom: 6 }}>
          Matches: {stats.matches} · Wins: {stats.wins}
        </p>
        {rows.length === 0 ? (
          <p className="muted">Play a multiplayer match to fill this up.</p>
        ) : (
          <ul style={{ paddingLeft: 18, fontWeight: 700, margin: 0 }}>
            {rows.map(({ game, stat }) => (
              <li key={game.id} style={{ marginBottom: 8 }}>
                {game.emoji} {game.title} — {stat!.played} played, {stat!.wins} wins
                {stat!.bestPrimary != null ? ` · best ${stat!.bestPrimary}` : ''}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
