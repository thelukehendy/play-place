import { useEffect, useRef, useState } from 'react';
import { createRng } from '../../lib/random';
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

function useFlood(
  initial: FloodState,
  onFinish: (moves: number) => void,
  onProgress?: (filled: number, moves: number) => void,
) {
  const [state, setState] = useState(initial);
  const done = useRef(false);
  useEffect(() => {
    setState(initial);
    done.current = false;
  }, [initial]);

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
        queueMicrotask(() => onFinish(moves));
      } else if (onProgress) {
        queueMicrotask(() => onProgress(filledCount(grid), moves));
      }
      return { grid, moves, startedAt, finishedAt };
    });
  };

  return { state, pick };
}

function Board({
  state,
  onPick,
  footer,
}: {
  state: FloodState;
  onPick: (c: number) => void;
  footer?: React.ReactNode;
}) {
  return (
    <div>
      <GameHud>
        <Stat>Taps: {state.moves}</Stat>
        <Stat>
          Filled: {filledCount(state.grid)}/{SIZE * SIZE}
        </Stat>
      </GameHud>
      <Rules text="Flood from the top-left. Fewest taps wins — speed does not matter." />
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
  const { state, pick } = useFlood(initialState, (moves) =>
    onFinish({
      score: { primary: moves, label: `${moves} taps`, lowerIsBetter: true },
    }),
  );
  return <Board state={state} onPick={pick} />;
}

function RaceView(props: RaceGameProps<FloodState>) {
  const total = SIZE * SIZE;
  const { state, pick } = useFlood(
    props.initialState,
    (moves) => {
      const score = {
        primary: moves,
        label: `${moves} taps`,
        lowerIsBetter: true as const,
        progress: 1,
      };
      props.onLocalScore(score);
      props.onFinish({ score });
    },
    (filled, moves) => {
      props.onLocalScore({
        // Live standings: cells left. Final score (on finish) is taps only.
        primary: total - filled,
        label: `${filled}/${total} · ${moves} taps`,
        lowerIsBetter: true,
        progress: filled / total,
      });
    },
  );
  return <Board state={state} onPick={pick} />;
}

export const colorFloodGame: GameDefinition<FloodState> = {
  id: 'color-flood',
  title: 'Color Flood',
  blurb: 'Flood the board in fewest taps.',
  emoji: '🎨',
  accent: 'var(--green)',
  modes: ['solo', 'race'],
  rules: 'Tap colors to flood from the corner. Fewest taps wins.',
  createInitialState: (seed) => createFloodState(seed),
  SoloView,
  RaceView,
};
