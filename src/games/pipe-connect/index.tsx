import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createRng, formatTime } from '../../lib/random';
import type { GameDefinition, RaceGameProps, SoloGameProps } from '../types';
import { GameHud, Rules, Stat } from '../../ui/GameChrome';
import './PipeConnect.css';

const SIZE = 4;

/** Directions: 0=N, 1=E, 2=S, 3=W */
type Dir = 0 | 1 | 2 | 3;

type PipeKind = 'I' | 'L' | 'T' | 'X';

type Cell = {
  kind: PipeKind;
  /** clockwise quarter-turns from the canonical orientation */
  rot: number;
  fixed?: boolean;
};

export type PipeState = {
  cells: Cell[];
  startedAt: number | null;
  finishedAt: number | null;
  rotations: number;
};

/** Canonical openings for rot=0 */
const OPENINGS: Record<PipeKind, Dir[]> = {
  I: [0, 2], // N–S
  L: [0, 1], // N–E
  T: [0, 1, 2], // N–E–S (misses W)
  X: [0, 1, 2, 3],
};

const OPPOSITE: Record<Dir, Dir> = { 0: 2, 1: 3, 2: 0, 3: 1 };

function openings(cell: Cell): Dir[] {
  return OPENINGS[cell.kind].map((d) => ((d + cell.rot) % 4) as Dir);
}

function neighborIndex(i: number, dir: Dir): number {
  const r = Math.floor(i / SIZE);
  const c = i % SIZE;
  if (dir === 0) return r > 0 ? i - SIZE : -1;
  if (dir === 1) return c < SIZE - 1 ? i + 1 : -1;
  if (dir === 2) return r < SIZE - 1 ? i + SIZE : -1;
  return c > 0 ? i - 1 : -1;
}

function connectedFromStart(cells: Cell[]): Set<number> {
  const seen = new Set<number>();
  const stack = [0];
  while (stack.length) {
    const i = stack.pop()!;
    if (seen.has(i)) continue;
    seen.add(i);
    for (const dir of openings(cells[i])) {
      const j = neighborIndex(i, dir);
      if (j < 0) continue;
      if (!openings(cells[j]).includes(OPPOSITE[dir])) continue;
      stack.push(j);
    }
  }
  return seen;
}

function reachesEnd(cells: Cell[]): boolean {
  return connectedFromStart(cells).has(SIZE * SIZE - 1);
}

/** Build a pipe cell that opens exactly in the given directions (2–4 dirs). */
function cellFromConnections(dirs: Dir[]): Cell {
  const unique = [...new Set(dirs)] as Dir[];
  const set = new Set(unique);
  const count = set.size;

  if (count >= 4) return { kind: 'X', rot: 0 };

  if (count === 3) {
    for (let miss = 0; miss < 4; miss++) {
      if (!set.has(miss as Dir)) {
        // Canonical T misses W (3). After rot r, miss becomes (3+r)%4.
        const rot = (miss - 3 + 4) % 4;
        return { kind: 'T', rot };
      }
    }
  }

  if (count === 2) {
    const [a, b] = unique.sort((x, y) => x - y);
    if (Math.abs(a - b) === 2) {
      return { kind: 'I', rot: a === 0 || a === 2 ? 0 : 1 };
    }
    for (let rot = 0; rot < 4; rot++) {
      const got = new Set(OPENINGS.L.map((d) => (d + rot) % 4));
      if (got.has(a) && got.has(b)) return { kind: 'L', rot };
    }
  }

  // Single opening: pair it with an opposite so we get a straight stub
  if (count === 1) {
    const d = unique[0];
    return cellFromConnections([d, OPPOSITE[d]]);
  }

  return { kind: 'I', rot: 0 };
}

function snakePath(): number[] {
  const path: number[] = [];
  for (let r = 0; r < SIZE; r++) {
    if (r % 2 === 0) {
      for (let c = 0; c < SIZE; c++) path.push(r * SIZE + c);
    } else {
      for (let c = SIZE - 1; c >= 0; c--) path.push(r * SIZE + c);
    }
  }
  return path;
}

function randomPath(rng: () => number): number[] {
  const start = 0;
  const end = SIZE * SIZE - 1;
  const path: number[] = [];
  const visited = new Set<number>();

  function dfs(i: number): boolean {
    visited.add(i);
    path.push(i);
    if (i === end) return true;
    const dirs: Dir[] = [0, 1, 2, 3];
    for (let a = dirs.length - 1; a > 0; a--) {
      const b = Math.floor(rng() * (a + 1));
      [dirs[a], dirs[b]] = [dirs[b], dirs[a]];
    }
    // Prefer moving toward bottom-right
    dirs.sort((a, b) => {
      const bias = (d: Dir) => (d === 1 || d === 2 ? 0 : 1);
      return bias(a) - bias(b);
    });
    for (const d of dirs) {
      const j = neighborIndex(i, d);
      if (j < 0 || visited.has(j)) continue;
      if (dfs(j)) return true;
    }
    path.pop();
    visited.delete(i);
    return false;
  }

  if (!dfs(start)) return snakePath();
  return [...path];
}

function buildSolvedCells(path: number[], rng: () => number): Cell[] {
  const start = 0;
  const end = SIZE * SIZE - 1;
  const pathSet = new Set(path);
  const needed: Dir[][] = Array.from({ length: SIZE * SIZE }, () => []);

  for (let p = 0; p < path.length - 1; p++) {
    const a = path[p];
    const b = path[p + 1];
    for (const d of [0, 1, 2, 3] as Dir[]) {
      if (neighborIndex(a, d) === b) {
        needed[a].push(d);
        needed[b].push(OPPOSITE[d]);
        break;
      }
    }
  }

  // Source/sink so terminals always have 2 openings (solvable + readable)
  needed[start].push(3); // inlet from the west
  needed[end].push(1); // outlet to the east

  const cells: Cell[] = Array.from({ length: SIZE * SIZE }, (_, i) => {
    if (pathSet.has(i)) {
      return cellFromConnections(needed[i]);
    }
    const kinds: PipeKind[] = ['I', 'L'];
    return {
      kind: kinds[Math.floor(rng() * kinds.length)],
      rot: Math.floor(rng() * 4),
    };
  });

  cells[start] = { ...cells[start], fixed: true };
  cells[end] = { ...cells[end], fixed: true };
  return cells;
}

/**
 * Guaranteed-solvable generator:
 * 1) Build a real start→end path and matching pipes
 * 2) Verify the solved board flows
 * 3) Scramble only rotatable tiles (kinds unchanged → always rotatable back)
 */
export function createPipeState(seed: number): PipeState {
  const rng = createRng(seed);

  let cells: Cell[] | null = null;
  for (let attempt = 0; attempt < 8; attempt++) {
    const path = attempt === 0 ? randomPath(rng) : attempt < 4 ? randomPath(rng) : snakePath();
    const candidate = buildSolvedCells(path, rng);
    if (reachesEnd(candidate)) {
      cells = candidate;
      break;
    }
  }
  if (!cells) {
    cells = buildSolvedCells(snakePath(), rng);
  }

  // Final safety: if somehow still broken, force a minimal straight corridor on row 0 + last col
  if (!reachesEnd(cells)) {
    const path = [...Array.from({ length: SIZE }, (_, c) => c), ...Array.from(
      { length: SIZE - 1 },
      (_, r) => (r + 1) * SIZE + (SIZE - 1),
    )];
    cells = buildSolvedCells(path, rng);
  }

  // Scramble rotatable tiles — never change kind, so solution always exists
  for (let i = 0; i < cells.length; i++) {
    if (cells[i].fixed) continue;
    let extra = 1 + Math.floor(rng() * 3);
    // Straight pipes look identical every 2 turns — ensure a visible scramble
    if (cells[i].kind === 'I' && extra % 2 === 0) extra = (extra % 4) + 1;
    cells[i] = { ...cells[i], rot: (cells[i].rot + extra) % 4 };
  }

  return { cells, startedAt: null, finishedAt: null, rotations: 0 };
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

function usePipes(
  initial: PipeState,
  onFinish: (rots: number, ms: number) => void,
  onProgress?: (flow: number, rots: number) => void,
) {
  const [state, setState] = useState(initial);
  const done = useRef(false);
  useEffect(() => {
    setState(initial);
    done.current = false;
  }, [initial]);
  const elapsed = useElapsed(state.startedAt, state.finishedAt);
  const flow = connectedFromStart(state.cells);
  const goal = SIZE * SIZE - 1;

  const rotate = (i: number) => {
    if (done.current || state.cells[i].fixed) return;
    setState((s) => {
      if (s.finishedAt) return s;
      const startedAt = s.startedAt ?? Date.now();
      const cells = s.cells.map((c, idx) =>
        idx === i ? { ...c, rot: (c.rot + 1) % 4 } : c,
      );
      const rotations = s.rotations + 1;
      const open = connectedFromStart(cells);
      const won = open.has(goal);
      const finishedAt = won ? Date.now() : null;
      if (won && !done.current) {
        done.current = true;
        queueMicrotask(() => onFinish(rotations, (finishedAt ?? Date.now()) - startedAt));
      } else if (onProgress) {
        queueMicrotask(() => onProgress(open.size, rotations));
      }
      return { cells, startedAt, finishedAt, rotations };
    });
  };

  return { state, elapsed, flow, rotate };
}

function PipeGlyph({ cell, flowing }: { cell: Cell; flowing: boolean }) {
  const open = new Set(openings(cell));
  return (
    <span className={`pipe-glyph ${flowing ? 'on' : ''}`} aria-hidden>
      <span className={`arm n ${open.has(0) ? 'open' : ''}`} />
      <span className={`arm e ${open.has(1) ? 'open' : ''}`} />
      <span className={`arm s ${open.has(2) ? 'open' : ''}`} />
      <span className={`arm w ${open.has(3) ? 'open' : ''}`} />
      <span className="hub" />
    </span>
  );
}

function Board({
  state,
  elapsed,
  flow,
  onRotate,
  footer,
}: {
  state: PipeState;
  elapsed: number;
  flow: Set<number>;
  onRotate: (i: number) => void;
  footer?: ReactNode;
}) {
  const goal = SIZE * SIZE - 1;
  return (
    <div>
      <GameHud>
        <Stat>
          Flow: {flow.size}
          {flow.has(goal) ? ' ✓' : ''}
        </Stat>
        <Stat>Turns: {state.rotations}</Stat>
        <Stat>{formatTime(elapsed)}</Stat>
      </GameHud>
      <Rules text="Tap pipes to rotate. Connect green START to gold END — every puzzle is solvable." />
      <div className="pipe-grid" style={{ gridTemplateColumns: `repeat(${SIZE}, 1fr)` }}>
        {state.cells.map((cell, i) => {
          const isStart = i === 0;
          const isEnd = i === goal;
          return (
            <button
              key={i}
              type="button"
              className={`pipe-cell ${flow.has(i) ? 'flow' : ''} ${isStart ? 'start' : ''} ${
                isEnd ? 'end' : ''
              }`}
              disabled={!!cell.fixed || state.finishedAt !== null}
              onClick={() => onRotate(i)}
              aria-label={
                isStart ? 'Start' : isEnd ? 'End' : `Pipe ${cell.kind}, rotate`
              }
            >
              <PipeGlyph cell={cell} flowing={flow.has(i)} />
              {isStart ? <span className="pipe-label">S</span> : null}
              {isEnd ? <span className="pipe-label">E</span> : null}
            </button>
          );
        })}
      </div>
      {footer}
    </div>
  );
}

function SoloView({ initialState, onFinish }: SoloGameProps<PipeState>) {
  const { state, elapsed, flow, rotate } = usePipes(initialState, (rots, ms) =>
    onFinish({
      score: { primary: rots, label: `${rots} turns · ${formatTime(ms)}`, lowerIsBetter: true },
    }),
  );
  return <Board state={state} elapsed={elapsed} flow={flow} onRotate={rotate} />;
}

function RaceView(props: RaceGameProps<PipeState>) {
  const total = SIZE * SIZE;
  const { state, elapsed, flow, rotate } = usePipes(
    props.initialState,
    (rots, ms) => {
      const score = {
        primary: rots,
        label: `${rots}t · ${formatTime(ms)}`,
        lowerIsBetter: true as const,
        progress: 1,
      };
      props.onLocalScore(score);
      props.onFinish({ score });
    },
    (flowCount, rots) => {
      props.onLocalScore({
        primary: total - flowCount,
        label: `${flowCount} flow · ${rots}t`,
        lowerIsBetter: true,
        progress: flowCount / total,
      });
    },
  );
  return <Board state={state} elapsed={elapsed} flow={flow} onRotate={rotate} />;
}

export const pipeConnectGame: GameDefinition<PipeState> = {
  id: 'pipe-connect',
  title: 'Pipe Connect',
  blurb: 'Rotate pipes to link start to end.',
  emoji: '🔧',
  accent: 'var(--brick)',
  modes: ['solo', 'race'],
  rules: 'Rotate pipes until water flows from S to E.',
  createInitialState: (seed) => createPipeState(seed),
  SoloView,
  RaceView,
};
