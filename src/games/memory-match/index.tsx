import { useEffect, useRef, useState } from 'react';
import { createRng, formatTime, shuffle } from '../../lib/random';
import type { GameDefinition, RaceGameProps, SoloGameProps } from '../types';
import { GameHud, Rules, Stat } from '../../ui/GameChrome';
import './MemoryMatch.css';

const ICONS = ['⭐', '🔴', '🟦', '🟩', '🟨', '🟤', '⚡', '🌈'];

export type MemoryState = {
  cards: string[];
  matched: boolean[];
  flipped: number[];
  moves: number;
  startedAt: number | null;
  finishedAt: number | null;
  lock: boolean;
};

export function createMemoryState(seed: number): MemoryState {
  const rng = createRng(seed);
  const cards = shuffle([...ICONS, ...ICONS], rng);
  return {
    cards,
    matched: cards.map(() => false),
    flipped: [],
    moves: 0,
    startedAt: null,
    finishedAt: null,
    lock: false,
  };
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

function useMemory(
  initial: MemoryState,
  onFinish: (ms: number, moves: number) => void,
  onProgress?: (matched: number, moves: number, ms: number) => void,
) {
  const [state, setState] = useState(initial);
  const done = useRef(false);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    setState(initial);
    done.current = false;
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, [initial]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const elapsed = useElapsed(state.startedAt, state.finishedAt);

  const flip = (index: number) => {
    setState((s) => {
      if (s.lock || s.finishedAt || s.matched[index] || s.flipped.includes(index)) return s;
      if (s.flipped.length >= 2) return s;
      const startedAt = s.startedAt ?? Date.now();
      const flipped = [...s.flipped, index];
      if (flipped.length < 2) {
        return { ...s, flipped, startedAt };
      }
      const [a, b] = flipped;
      const match = s.cards[a] === s.cards[b];
      const moves = s.moves + 1;
      if (match) {
        const matched = s.matched.map((m, i) => m || i === a || i === b);
        const all = matched.every(Boolean);
        const finishedAt = all ? Date.now() : null;
        if (all && !done.current) {
          done.current = true;
          const ms = (finishedAt ?? Date.now()) - startedAt;
          queueMicrotask(() => onFinish(ms, moves));
        } else if (onProgress) {
          const count = matched.filter(Boolean).length / 2;
          queueMicrotask(() => onProgress(count, moves, Date.now() - startedAt));
        }
        return { ...s, flipped: [], matched, moves, startedAt, finishedAt, lock: false };
      }
      const t = window.setTimeout(() => {
        setState((cur) => ({ ...cur, flipped: [], lock: false }));
      }, 650);
      timers.current.push(t);
      if (onProgress) {
        const count = s.matched.filter(Boolean).length / 2;
        queueMicrotask(() => onProgress(count, moves, Date.now() - startedAt));
      }
      return { ...s, flipped, moves, startedAt, lock: true };
    });
  };

  return { state, elapsed, flip };
}

function Board({
  state,
  elapsed,
  onFlip,
  footer,
}: {
  state: MemoryState;
  elapsed: number;
  onFlip: (i: number) => void;
  footer?: React.ReactNode;
}) {
  const pairs = state.matched.filter(Boolean).length / 2;
  return (
    <div>
      <GameHud>
        <Stat>Pairs: {pairs}/8</Stat>
        <Stat>Moves: {state.moves}</Stat>
        <Stat>{formatTime(elapsed)}</Stat>
      </GameHud>
      <Rules text="Flip two cards — match all pairs!" />
      <div className="mem-grid">
        {state.cards.map((icon, i) => {
          const show = state.matched[i] || state.flipped.includes(i);
          return (
            <button
              key={i}
              type="button"
              className={`mem-card ${show ? 'face' : ''} ${state.matched[i] ? 'matched' : ''}`}
              disabled={show || state.lock || state.finishedAt !== null}
              onClick={() => onFlip(i)}
            >
              {show ? icon : '?'}
            </button>
          );
        })}
      </div>
      {footer}
    </div>
  );
}

function SoloView({ initialState, onFinish }: SoloGameProps<MemoryState>) {
  const { state, elapsed, flip } = useMemory(initialState, (ms, moves) =>
    onFinish({
      score: { primary: moves, label: `${moves} moves · ${formatTime(ms)}`, lowerIsBetter: true },
    }),
  );
  return <Board state={state} elapsed={elapsed} onFlip={flip} />;
}

function RaceView(props: RaceGameProps<MemoryState>) {
  const { state, elapsed, flip } = useMemory(
    props.initialState,
    (ms, moves) => {
      const score = {
        primary: moves,
        label: `${moves}m · ${formatTime(ms)}`,
        lowerIsBetter: true as const,
        progress: 1,
      };
      props.onLocalScore(score);
      props.onFinish({ score });
    },
    (matched, moves) => {
      props.onLocalScore({
        primary: 8 - matched,
        label: `${matched}/8 · ${moves}m`,
        lowerIsBetter: true,
        progress: matched / 8,
      });
    },
  );
  return <Board state={state} elapsed={elapsed} onFlip={flip} />;
}

export const memoryMatchGame: GameDefinition<MemoryState> = {
  id: 'memory-match',
  title: 'Memory Match',
  blurb: 'Flip cards, find pairs.',
  emoji: '🃏',
  accent: 'var(--red)',
  modes: ['solo', 'race'],
  rules: 'Match all pairs in as few moves as you can.',
  createInitialState: (seed) => createMemoryState(seed),
  SoloView,
  RaceView,
};
