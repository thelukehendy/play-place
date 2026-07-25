import { useEffect, useRef, useState } from 'react';
import { createRng, formatTime, shuffle } from '../../lib/random';
import type { GameDefinition, RaceGameProps, SoloGameProps } from '../types';
import { GameHud, Rules, Stat } from '../../ui/GameChrome';
import './NumberRush.css';

export type NumberRushState = {
  order: number[];
  next: number;
  taps: number;
  startedAt: number | null;
  finishedAt: number | null;
};

const SIZE = 25;

export function createNumberRushState(seed: number): NumberRushState {
  const rng = createRng(seed);
  const order = shuffle(
    Array.from({ length: SIZE }, (_, i) => i + 1),
    rng,
  );
  return { order, next: 1, taps: 0, startedAt: null, finishedAt: null };
}

function useNumberRush(
  initial: NumberRushState,
  onFinish: (ms: number) => void,
  onScore?: (ms: number, next: number) => void,
) {
  const [state, setState] = useState(initial);
  const finished = useRef(false);

  useEffect(() => {
    setState(initial);
    finished.current = false;
  }, [initial]);

  const elapsed = useElapsed(state.startedAt, state.finishedAt);

  const tap = (n: number) => {
    if (finished.current || n !== state.next) return;
    setState((s) => {
      const startedAt = s.startedAt ?? Date.now();
      const next = s.next + 1;
      const done = next > SIZE;
      const finishedAt = done ? Date.now() : null;
      if (done && !finished.current) {
        finished.current = true;
        const ms = (finishedAt ?? Date.now()) - startedAt;
        queueMicrotask(() => onFinish(ms));
      } else if (onScore) {
        const ms = Date.now() - startedAt;
        queueMicrotask(() => onScore(ms, next));
      }
      return {
        ...s,
        next,
        taps: s.taps + 1,
        startedAt,
        finishedAt,
      };
    });
  };

  return { state, elapsed, tap };
}

function useElapsed(startedAt: number | null, finishedAt: number | null) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!startedAt || finishedAt) return;
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, [startedAt, finishedAt]);
  if (!startedAt) return 0;
  return (finishedAt ?? now) - startedAt;
}

function Board({
  state,
  elapsed,
  onTap,
  footer,
}: {
  state: NumberRushState;
  elapsed: number;
  onTap: (n: number) => void;
  footer?: React.ReactNode;
}) {
  return (
    <div>
      <GameHud>
        <Stat>Next: {state.next > SIZE ? '✓' : state.next}</Stat>
        <Stat>{formatTime(elapsed)}</Stat>
      </GameHud>
      <Rules text="Tap numbers in order from 1 to 25 — fastest wins!" />
      <div className="nr-grid">
        {state.order.map((n) => {
          const done = n < state.next;
          const next = n === state.next;
          return (
            <button
              key={n}
              type="button"
              className={`nr-cell ${done ? 'done' : ''} ${next ? 'next' : ''}`}
              disabled={done || state.finishedAt !== null}
              onClick={() => onTap(n)}
            >
              {n}
            </button>
          );
        })}
      </div>
      {footer}
    </div>
  );
}

function SoloView({ initialState, onFinish }: SoloGameProps<NumberRushState>) {
  const { state, elapsed, tap } = useNumberRush(initialState, (ms) =>
    onFinish({
      score: { primary: ms, label: formatTime(ms), lowerIsBetter: true },
      detail: 'All numbers cleared!',
    }),
  );
  return <Board state={state} elapsed={elapsed} onTap={tap} />;
}

function RaceView({
  initialState,
  onFinish,
  onLocalScore,
}: RaceGameProps<NumberRushState>) {
  const { state, elapsed, tap } = useNumberRush(
    initialState,
    (ms) => {
      const score = {
        primary: ms,
        label: formatTime(ms),
        lowerIsBetter: true as const,
        progress: 1,
      };
      onLocalScore(score);
      onFinish({ score, detail: 'Finished!' });
    },
    (ms, next) => {
      const done = next - 1;
      onLocalScore({
        primary: SIZE + 1 - next,
        label: `${done}/${SIZE} · ${formatTime(ms)}`,
        lowerIsBetter: true,
        progress: done / SIZE,
      });
    },
  );

  return <Board state={state} elapsed={elapsed} onTap={tap} />;
}

export const numberRushGame: GameDefinition<NumberRushState> = {
  id: 'number-rush',
  title: 'Number Rush',
  blurb: 'Tap 1→25 as fast as you can.',
  emoji: '🔢',
  accent: 'var(--gold)',
  modes: ['solo', 'race'],
  rules: 'Tap numbers in order from 1 to 25 — fastest wins!',
  createInitialState: (seed) => createNumberRushState(seed),
  SoloView,
  RaceView,
};
