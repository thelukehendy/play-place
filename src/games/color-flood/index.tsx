import { useEffect, useRef, useState } from 'react';
import { createRng, formatTime } from '../../lib/random';
import type { GameDefinition, RaceGameProps, SoloGameProps } from '../types';
import { GameHud, Rules, Stat } from '../../ui/GameChrome';
import './ColorFlood.css';

const COLORS = ['#e52521', '#049cd8', '#43b047', '#f5c518', '#8b5a2b', '#9b59b6'];
const SIZE = 8;

export type FloodState = {
  grid: number[];
  moves: number;
  startedAt: number | null;
  finishedAt: number | null;
};

export function createFloodState(seed: number): FloodState {
  const rng = createRng(seed);
  const grid = Array.from({ length: SIZE * SIZE }, () => Math.floor(rng() * COLORS.length));
  return { grid, moves: 0, startedAt: null, finishedAt: null };
}

function floodFill(grid: number[], color: number): number[] {
  const start = grid[0];
  if (start === color) return grid;
  const next = [...grid];
  const stack = [0];
  const seen = new Set<number>();
  while (stack.length) {
    const i = stack.pop()!;
    if (seen.has(i) || next[i] !== start) continue;
    seen.add(i);
    next[i] = color;
    const r = Math.floor(i / SIZE);
    const c = i % SIZE;
    if (r > 0) stack.push(i - SIZE);
    if (r < SIZE - 1) stack.push(i + SIZE);
    if (c > 0) stack.push(i - 1);
    if (c < SIZE - 1) stack.push(i + 1);
  }
  return next;
}

function filledCount(grid: number[]) {
  const c = grid[0];
  return grid.filter((x) => x === c).length;
}

function isWon(grid: number[]) {
  return grid.every((x) => x === grid[0]);
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

function useFlood(
  initial: FloodState,
  onFinish: (moves: number, ms: number) => void,
  onProgress?: (filled: number, moves: number) => void,
) {
  const [state, setState] = useState(initial);
  const done = useRef(false);
  useEffect(() => {
    setState(initial);
    done.current = false;
  }, [initial]);
  const elapsed = useElapsed(state.startedAt, state.finishedAt);

  const pick = (color: number) => {
    if (done.current || state.finishedAt || color === state.grid[0]) return;
    setState((s) => {
      const startedAt = s.startedAt ?? Date.now();
      const grid = floodFill(s.grid, color);
      const moves = s.moves + 1;
      const won = isWon(grid);
      const finishedAt = won ? Date.now() : null;
      if (won && !done.current) {
        done.current = true;
        queueMicrotask(() => onFinish(moves, (finishedAt ?? Date.now()) - startedAt));
      } else if (onProgress) {
        queueMicrotask(() => onProgress(filledCount(grid), moves));
      }
      return { grid, moves, startedAt, finishedAt };
    });
  };

  return { state, elapsed, pick };
}

function Board({
  state,
  elapsed,
  onPick,
  footer,
}: {
  state: FloodState;
  elapsed: number;
  onPick: (c: number) => void;
  footer?: React.ReactNode;
}) {
  return (
    <div>
      <GameHud>
        <Stat>Moves: {state.moves}</Stat>
        <Stat>Filled: {filledCount(state.grid)}/{SIZE * SIZE}</Stat>
        <Stat>{formatTime(elapsed)}</Stat>
      </GameHud>
      <Rules text="Flood from the top-left until one color remains." />
      <div className="flood-grid" style={{ gridTemplateColumns: `repeat(${SIZE}, 1fr)` }}>
        {state.grid.map((c, i) => (
          <div key={i} className="flood-cell" style={{ background: COLORS[c] }} />
        ))}
      </div>
      <div className="flood-palette">
        {COLORS.map((hex, i) => (
          <button
            key={hex}
            type="button"
            className="flood-swatch"
            style={{ background: hex }}
            disabled={state.finishedAt !== null}
            onClick={() => onPick(i)}
            aria-label={`Color ${i + 1}`}
          />
        ))}
      </div>
      {footer}
    </div>
  );
}

function SoloView({ initialState, onFinish }: SoloGameProps<FloodState>) {
  const { state, elapsed, pick } = useFlood(initialState, (moves, ms) =>
    onFinish({
      score: { primary: moves, label: `${moves} moves · ${formatTime(ms)}`, lowerIsBetter: true },
    }),
  );
  return <Board state={state} elapsed={elapsed} onPick={pick} />;
}

function RaceView(props: RaceGameProps<FloodState>) {
  const total = SIZE * SIZE;
  const { state, elapsed, pick } = useFlood(
    props.initialState,
    (moves, ms) => {
      const score = {
        primary: moves,
        label: `${moves}m · ${formatTime(ms)}`,
        lowerIsBetter: true as const,
        progress: 1,
      };
      props.onLocalScore(score);
      props.onFinish({ score });
    },
    (filled, moves) => {
      props.onLocalScore({
        primary: total - filled,
        label: `${filled}/${total} · ${moves}m`,
        lowerIsBetter: true,
        progress: filled / total,
      });
    },
  );
  return <Board state={state} elapsed={elapsed} onPick={pick} />;
}

export const colorFloodGame: GameDefinition<FloodState> = {
  id: 'color-flood',
  title: 'Color Flood',
  blurb: 'Flood the board in few moves.',
  emoji: '🎨',
  accent: 'var(--green)',
  modes: ['solo', 'race'],
  rules: 'Tap colors to flood from the corner.',
  createInitialState: (seed) => createFloodState(seed),
  SoloView,
  RaceView,
};
