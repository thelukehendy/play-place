import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createRng, formatTime } from '../../lib/random';
import type { GameDefinition, RaceGameProps, SoloGameProps } from '../types';
import { GameHud, Rules, Stat } from '../../ui/GameChrome';
import './SlideRace.css';

const N = 4;
const TOTAL = N * N;

export type SlideState = {
  tiles: number[]; // 0 = empty
  moves: number;
  startedAt: number | null;
  finishedAt: number | null;
};

function isSolved(tiles: number[]) {
  for (let i = 0; i < TOTAL - 1; i++) {
    if (tiles[i] !== i + 1) return false;
  }
  return tiles[TOTAL - 1] === 0;
}

function inversions(tiles: number[]) {
  const arr = tiles.filter((t) => t !== 0);
  let inv = 0;
  for (let i = 0; i < arr.length; i++) {
    for (let j = i + 1; j < arr.length; j++) {
      if (arr[i] > arr[j]) inv++;
    }
  }
  return inv;
}

function blankRowFromBottom(tiles: number[]) {
  const idx = tiles.indexOf(0);
  const rowFromTop = Math.floor(idx / N);
  return N - rowFromTop;
}

function isSolvable(tiles: number[]) {
  const inv = inversions(tiles);
  if (N % 2 === 1) return inv % 2 === 0;
  return (inv + blankRowFromBottom(tiles)) % 2 === 1;
}

export function createSlideState(seed: number): SlideState {
  const rng = createRng(seed);
  let tiles = Array.from({ length: TOTAL }, (_, i) => (i + 1) % TOTAL);
  let lastEmpty = tiles.indexOf(0);
  for (let i = 0; i < 180; i++) {
    const empty = tiles.indexOf(0);
    let neighbors = neighborsOf(empty).filter((n) => n !== lastEmpty);
    if (neighbors.length === 0) neighbors = neighborsOf(empty);
    const pick = neighbors[Math.floor(rng() * neighbors.length)];
    lastEmpty = empty;
    tiles = swap(tiles, empty, pick);
  }
  if (isSolved(tiles)) {
    const empty = tiles.indexOf(0);
    tiles = swap(tiles, empty, neighborsOf(empty)[0]);
  }
  if (!isSolvable(tiles)) {
    return createSlideState(seed ^ 0x9e3779b9);
  }
  return { tiles, moves: 0, startedAt: null, finishedAt: null };
}

function neighborsOf(index: number) {
  const r = Math.floor(index / N);
  const c = index % N;
  const out: number[] = [];
  if (r > 0) out.push(index - N);
  if (r < N - 1) out.push(index + N);
  if (c > 0) out.push(index - 1);
  if (c < N - 1) out.push(index + 1);
  return out;
}

function swap(tiles: number[], a: number, b: number) {
  const next = [...tiles];
  [next[a], next[b]] = [next[b], next[a]];
  return next;
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

function useSlide(
  initial: SlideState,
  onFinish: (ms: number, moves: number) => void,
  onProgress?: (ms: number, moves: number, solvedCount: number) => void,
) {
  const [state, setState] = useState(initial);
  const done = useRef(false);

  useEffect(() => {
    setState(initial);
    done.current = false;
  }, [initial]);

  const elapsed = useElapsed(state.startedAt, state.finishedAt);

  const click = (index: number) => {
    if (done.current) return;
    setState((s) => {
      if (s.finishedAt) return s;
      const empty = s.tiles.indexOf(0);
      if (!neighborsOf(empty).includes(index)) return s;
      const startedAt = s.startedAt ?? Date.now();
      const tiles = swap(s.tiles, empty, index);
      const moves = s.moves + 1;
      const solved = isSolved(tiles);
      const finishedAt = solved ? Date.now() : null;
      if (solved && !done.current) {
        done.current = true;
        const ms = (finishedAt ?? Date.now()) - startedAt;
        queueMicrotask(() => onFinish(ms, moves));
      } else if (onProgress) {
        const correct = tiles.filter((t, i) =>
          i === TOTAL - 1 ? t === 0 : t === i + 1,
        ).length;
        queueMicrotask(() => onProgress(Date.now() - startedAt, moves, correct));
      }
      return { tiles, moves, startedAt, finishedAt };
    });
  };

  return { state, elapsed, click };
}

function Board({
  state,
  elapsed,
  onClick,
}: {
  state: SlideState;
  elapsed: number;
  onClick: (i: number) => void;
  footer?: ReactNode;
}) {
  const empty = state.tiles.indexOf(0);
  const movable = new Set(neighborsOf(empty));

  // Position map: tile value -> board index (skip 0)
  const positions = state.tiles
    .map((t, i) => ({ t, i }))
    .filter((x) => x.t !== 0);

  return (
    <div>
      <GameHud>
        <Stat>Moves: {state.moves}</Stat>
        <Stat>{formatTime(elapsed)}</Stat>
      </GameHud>
      <Rules text="Tap a tile beside the gap — it slides into place. Order 1–15!" />
      <div className="slide-board" style={{ ['--n' as string]: N }}>
        <div
          className="slide-empty"
          style={
            {
              ['--c' as string]: empty % N,
              ['--r' as string]: Math.floor(empty / N),
            } as CSSProperties
          }
        />
        {positions.map(({ t, i }) => {
          const canMove = movable.has(i) && !state.finishedAt;
          return (
            <button
              key={t}
              type="button"
              className={`slide-tile ${canMove ? 'can-move' : ''}`}
              style={
                {
                  ['--c' as string]: i % N,
                  ['--r' as string]: Math.floor(i / N),
                } as CSSProperties
              }
              disabled={!canMove}
              onClick={() => onClick(i)}
            >
              {t}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SoloView({ initialState, onFinish }: SoloGameProps<SlideState>) {
  const { state, elapsed, click } = useSlide(initialState, (ms, moves) =>
    onFinish({
      score: { primary: ms, label: `${formatTime(ms)} · ${moves} moves`, lowerIsBetter: true },
    }),
  );
  return <Board state={state} elapsed={elapsed} onClick={click} />;
}

function RaceView(props: RaceGameProps<SlideState>) {
  const { state, elapsed, click } = useSlide(
    props.initialState,
    (ms, moves) => {
      const score = {
        primary: ms,
        label: `${formatTime(ms)} · ${moves}m`,
        lowerIsBetter: true as const,
        progress: 1,
      };
      props.onLocalScore(score);
      props.onFinish({ score });
    },
    (_ms, moves, correct) => {
      props.onLocalScore({
        primary: TOTAL - correct,
        label: `${correct}/${TOTAL} · ${moves}m`,
        lowerIsBetter: true,
        progress: correct / TOTAL,
      });
    },
  );

  return <Board state={state} elapsed={elapsed} onClick={click} />;
}

export const slideRaceGame: GameDefinition<SlideState> = {
  id: 'slide-race',
  title: 'Slide Race',
  blurb: 'Race the classic 15-puzzle.',
  emoji: '🧩',
  accent: 'var(--sky)',
  modes: ['solo', 'race'],
  rules: 'Tap a tile beside the gap to slide it. Fastest clear wins!',
  createInitialState: (seed) => createSlideState(seed),
  SoloView,
  RaceView,
};
