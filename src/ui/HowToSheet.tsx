import type { GameDefinition } from '../games/types';
import { getBest } from '../lib/bests';
import { Button } from './Button';
import { Sheet } from './Sheet';

export function HowToSheet({
  game,
  open,
  onClose,
}: {
  game: GameDefinition<never> | GameDefinition<unknown> | undefined;
  open: boolean;
  onClose: () => void;
}) {
  if (!game) return null;
  const best = getBest(game.id);
  return (
    <Sheet open={open} onClose={onClose} label={`How to play ${game.title}`}>
      <p className="h3">
        {game.emoji} {game.title}
      </p>
      <p className="muted" style={{ margin: '2px 0 10px' }}>
        How to play
      </p>
      <ol className="howto-list">
        {game.howTo.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      {best ? (
        <p className="howto-best">
          Your best: <strong>{best.label}</strong>
        </p>
      ) : null}
      <Button variant="gold" block onClick={onClose} style={{ marginTop: 12 }}>
        Got it!
      </Button>
    </Sheet>
  );
}
