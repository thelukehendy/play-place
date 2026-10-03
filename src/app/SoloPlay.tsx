import { useEffect, useMemo, useState } from 'react';
import { getGame } from '../games/registry';
import type { GameFinishPayload } from '../games/types';
import { randomSeed } from '../lib/random';
import { ensureNickname, getOrCreatePlayerId } from '../lib/player';
import { hasSeenRules, markRulesSeen, setLastPlayed } from '../lib/seen';
import { Button } from '../ui/Button';
import { Panel } from '../ui/Panel';
import { HowToSheet } from '../ui/HowToSheet';
import { ScreenHeader } from './PartyChat';

type Props = {
  gameId: string;
  /** Changes on every Play again / library launch so a new seed is guaranteed. */
  runId: number;
  /** Fixed seed for the daily challenge (disables reshuffling). */
  fixedSeed?: number;
  onExit: () => void;
  onResults: (payload: {
    gameId: string;
    title: string;
    payload: GameFinishPayload;
  }) => void;
};

const RESTART_LABEL = {
  puzzle: 'New puzzle',
  level: 'New level',
  game: 'New game',
} as const;

export function SoloPlay({ gameId, runId, fixedSeed, onExit, onResults }: Props) {
  const game = getGame(gameId);
  /** Extra reshuffles from the in-game "New puzzle" button. */
  const [reshuffle, setReshuffle] = useState(0);
  const [showHowTo, setShowHowTo] = useState(() => !!game && !hasSeenRules(gameId));
  const seed = useMemo(
    () => fixedSeed ?? randomSeed(),
    // Intentionally re-roll whenever the run or reshuffle changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [gameId, runId, reshuffle, fixedSeed],
  );
  const player = useMemo(
    () => ({ id: getOrCreatePlayerId(), name: ensureNickname() }),
    [],
  );
  const initialState = useMemo(
    () => (game ? game.createInitialState(seed, [player]) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [seed, gameId, game],
  );

  useEffect(() => {
    setLastPlayed(gameId);
  }, [gameId]);

  if (!game || !initialState) {
    return (
      <Panel>
        <p>Game not found.</p>
        <Button onClick={onExit}>Back</Button>
      </Panel>
    );
  }

  const Solo = game.SoloView;
  const compact =
    gameId === 'anagram-sprint' || gameId === 'word-claim' || gameId === 'inertia';
  const canReshuffle = game.restart !== 'none' && fixedSeed === undefined;

  return (
    <div
      className={`stack solo-play${compact ? ' solo-play--compact' : ''}`}
      style={{ animation: 'pop-in 0.3s var(--bounce)' }}
    >
      <ScreenHeader
        title={
          <h2 className="h2" style={{ color: 'var(--gold)', WebkitTextStroke: '1px var(--ink)' }}>
            {game.emoji} {game.title}
          </h2>
        }
        action={
          <div className="header-actions">
            <Button
              variant="ghost"
              className="icon-btn"
              aria-label="How to play"
              onClick={() => setShowHowTo(true)}
            >
              ?
            </Button>
            <Button variant="ghost" onClick={onExit}>
              Exit
            </Button>
          </div>
        }
      />
      {fixedSeed !== undefined ? (
        <p className="daily-chip">📅 Daily challenge — same puzzle for everyone today</p>
      ) : null}
      <Panel className={compact ? 'solo-play-panel' : ''}>
        <Solo
          key={seed}
          seed={seed}
          player={player}
          initialState={initialState}
          onFinish={(payload) => onResults({ gameId, title: game.title, payload })}
        />
      </Panel>
      {canReshuffle ? (
        <Button variant="sky" block onClick={() => setReshuffle((n) => n + 1)}>
          {RESTART_LABEL[game.restart as keyof typeof RESTART_LABEL]}
        </Button>
      ) : null}

      <HowToSheet
        game={game}
        open={showHowTo}
        onClose={() => {
          markRulesSeen(gameId);
          setShowHowTo(false);
        }}
      />
    </div>
  );
}
