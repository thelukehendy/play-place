import { useMemo, useState } from 'react';
import { getGame } from '../games/registry';
import type { GameFinishPayload } from '../games/types';
import { randomSeed } from '../lib/random';
import { ensureNickname, getOrCreatePlayerId } from '../lib/player';
import { Button } from '../ui/Button';
import { Panel } from '../ui/Panel';

type Props = {
  gameId: string;
  onExit: () => void;
  onResults: (payload: {
    gameId: string;
    title: string;
    payload: GameFinishPayload;
  }) => void;
};

export function SoloPlay({ gameId, onExit, onResults }: Props) {
  const game = getGame(gameId);
  const [seed, setSeed] = useState(() => randomSeed());
  const player = useMemo(
    () => ({ id: getOrCreatePlayerId(), name: ensureNickname() }),
    [],
  );
  const initialState = useMemo(
    () => (game ? game.createInitialState(seed, [player]) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [seed, gameId, game],
  );

  if (!game || !initialState) {
    return (
      <Panel>
        <p>Game not found.</p>
        <Button onClick={onExit}>Back</Button>
      </Panel>
    );
  }

  const Solo = game.SoloView;

  return (
    <div className="stack" style={{ animation: 'pop-in 0.3s var(--bounce)' }}>
      <div className="row" style={{ color: 'var(--cream)', textShadow: '1px 1px 0 var(--ink)' }}>
        <h2
          className="h2"
          style={{
            flex: 1,
            color: 'var(--gold)',
            WebkitTextStroke: '1px var(--ink)',
          }}
        >
          {game.emoji} {game.title}
        </h2>
        <Button variant="ghost" onClick={onExit}>
          Exit
        </Button>
      </div>
      <Panel>
        <Solo
          seed={seed}
          player={player}
          initialState={initialState}
          onFinish={(payload) => onResults({ gameId, title: game.title, payload })}
        />
      </Panel>
      <Button variant="sky" block onClick={() => setSeed(randomSeed())}>
        New puzzle
      </Button>
    </div>
  );
}
