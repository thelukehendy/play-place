import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { createRng, formatTime } from '../../lib/random';
import type { GameDefinition, RaceGameProps, SoloGameProps } from '../types';
import { GameHud, Rules, Stat } from '../../ui/GameChrome';
import { sfxBad, sfxClaim, sfxGood, sfxPop } from '../../lib/sfx';
import './DuoDrop.css';

const COLS = 10;
const ROWS = 16;
/** Race / score target — first to this many lines (or most before top-out). */
const LINE_GOAL = 12;

type Cell = number; // 0 empty, 1..7 piece color
type PieceId = 0 | 1 | 2 | 3 | 4 | 5 | 6;

const SHAPES: number[][][] = [
  // I
  [
    [0, 0, 0, 0],
    [1, 1, 1, 1],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ],
  // O
  [
    [1, 1],
    [1, 1],
  ],
  // T
  [
    [0, 1, 0],
    [1, 1, 1],
    [0, 0, 0],
  ],
  // L
  [
    [0, 0, 1],
    [1, 1, 1],
    [0, 0, 0],
  ],
  // J
  [
    [1, 0, 0],
    [1, 1, 1],
    [0, 0, 0],
  ],
  // S
  [
    [0, 1, 1],
    [1, 1, 0],
    [0, 0, 0],
  ],
  // Z
  [
    [1, 1, 0],
    [0, 1, 1],
    [0, 0, 0],
  ],
];

const COLORS = [
  '#049cd8', // I sky
  '#f5c518', // O gold
  '#9b59b6', // T purple
  '#e67e22', // L orange
  '#2980b9', // J blue
  '#43b047', // S green
  '#e52521', // Z red
];

export type DropState = {
  seed: number;
  grid: Cell[];
  bag: PieceId[];
  bagIndex: number;
  cur: PieceId;
  next: PieceId;
  rot: number;
  x: number;
  y: number;
  lines: number;
  score: number;
  startedAt: number | null;
  finishedAt: number | null;
  topOut: boolean;
};

function emptyGrid(): Cell[] {
  return Array(COLS * ROWS).fill(0);
}

function rotateMatrix(m: number[][]): number[][] {
  const n = m.length;
  const out = Array.from({ length: n }, () => Array(n).fill(0));
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) out[c][n - 1 - r] = m[r][c];
  }
  return out;
}

function shapeOf(id: PieceId, rot: number): number[][] {
  let m = SHAPES[id].map((row) => [...row]);
  // Normalize to square for rotation
  const n = Math.max(m.length, m[0].length);
  while (m.length < n) m.push(Array(m[0].length).fill(0));
  m = m.map((row) => {
    while (row.length < n) row.push(0);
    return row;
  });
  for (let i = 0; i < (rot % 4); i++) m = rotateMatrix(m);
  return m;
}

function refillBag(rng: () => number): PieceId[] {
  const bag: PieceId[] = [0, 1, 2, 3, 4, 5, 6];
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }
  return bag;
}

export function createDropState(seed: number): DropState {
  const rng = createRng(seed);
  let bag = refillBag(rng);
  const cur = bag[0];
  const next = bag[1];
  return {
    seed,
    grid: emptyGrid(),
    bag,
    bagIndex: 2,
    cur,
    next,
    rot: 0,
    x: 3,
    y: 0,
    lines: 0,
    score: 0,
    startedAt: null,
    finishedAt: null,
    topOut: false,
  };
}

function cellsOf(id: PieceId, rot: number, x: number, y: number): { c: number; r: number }[] {
  const m = shapeOf(id, rot);
  const out: { c: number; r: number }[] = [];
  for (let r = 0; r < m.length; r++) {
    for (let c = 0; c < m[r].length; c++) {
      if (m[r][c]) out.push({ c: x + c, r: y + r });
    }
  }
  return out;
}

function fits(grid: Cell[], id: PieceId, rot: number, x: number, y: number): boolean {
  for (const p of cellsOf(id, rot, x, y)) {
    if (p.c < 0 || p.c >= COLS || p.r >= ROWS) return false;
    if (p.r < 0) continue;
    if (grid[p.r * COLS + p.c]) return false;
  }
  return true;
}

function lockPiece(state: DropState): DropState {
  const grid = [...state.grid];
  for (const p of cellsOf(state.cur, state.rot, state.x, state.y)) {
    if (p.r < 0) {
      return { ...state, grid, finishedAt: Date.now(), topOut: true };
    }
    grid[p.r * COLS + p.c] = state.cur + 1;
  }
  // clear lines
  let cleared = 0;
  const nextGrid: Cell[] = [];
  for (let r = 0; r < ROWS; r++) {
    const row = grid.slice(r * COLS, r * COLS + COLS);
    if (row.every((v) => v)) {
      cleared++;
    } else {
      nextGrid.push(...row);
    }
  }
  while (nextGrid.length < COLS * ROWS) nextGrid.unshift(0);
  const lineScores = [0, 100, 300, 500, 800];
  const lines = state.lines + cleared;
  const score = state.score + (lineScores[cleared] ?? 800) + 2;
  if (cleared) sfxClaim();
  else sfxPop();

  let bag = state.bag;
  let bagIndex = state.bagIndex;
  if (bagIndex >= bag.length) {
    bag = refillBag(createRng(state.seed ^ (lines * 997) ^ score ^ 13));
    bagIndex = 0;
  }
  const newCur = state.next;
  const newNext = bag[bagIndex] as PieceId;
  bagIndex += 1;

  const spawned: DropState = {
    ...state,
    grid: nextGrid,
    bag,
    bagIndex,
    cur: newCur,
    next: newNext,
    rot: 0,
    x: 3,
    y: 0,
    lines,
    score,
  };
  if (!fits(nextGrid, spawned.cur, 0, 3, 0)) {
    return { ...spawned, finishedAt: Date.now(), topOut: true };
  }
  if (lines >= LINE_GOAL) {
    return { ...spawned, finishedAt: Date.now(), topOut: false };
  }
  return spawned;
}

/** Gravity interval from elapsed play time — always falling; ramps ~30s–3min. */
function gravityMs(elapsedMs: number): number {
  const s = elapsedMs / 1000;
  if (s < 15) return 580;
  if (s < 35) return 420;
  if (s < 60) return 300;
  if (s < 90) return 200;
  if (s < 130) return 140;
  if (s < 170) return 100;
  return 70;
}

function ghostY(state: DropState): number {
  let y = state.y;
  while (fits(state.grid, state.cur, state.rot, state.x, y + 1)) y++;
  return y;
}

function Board({
  state,
  elapsed,
  onLeft,
  onRight,
  onRotate,
  onHardDrop,
}: {
  state: DropState;
  elapsed: number;
  onLeft: () => void;
  onRight: () => void;
  onRotate: () => void;
  onHardDrop: () => void;
}) {
  const gy = ghostY(state);
  const live = new Set(
    cellsOf(state.cur, state.rot, state.x, state.y)
      .filter((p) => p.r >= 0)
      .map((p) => p.r * COLS + p.c),
  );
  const ghost = new Set(
    cellsOf(state.cur, state.rot, state.x, gy)
      .filter((p) => p.r >= 0)
      .map((p) => p.r * COLS + p.c),
  );
  const nextShape = shapeOf(state.next, 0);
  const over = !!state.finishedAt;

  return (
    <div className="dd-wrap">
      <GameHud>
        <Stat>
          Lines: {state.lines}/{LINE_GOAL}
        </Stat>
        <Stat>Score: {state.score}</Stat>
        <Stat>{formatTime(elapsed)}</Stat>
      </GameHud>
      <Rules text="Pieces always fall. Drop slams them down. Speeds up over time." />
      <div className="dd-stage">
        <div
          className="dd-board"
          role="grid"
          aria-label="Duo Drop board"
          data-sfx="off"
        >
          {Array.from({ length: COLS * ROWS }, (_, i) => {
            const locked = state.grid[i];
            const isLive = live.has(i);
            const isGhost = !isLive && ghost.has(i);
            const colorIdx = isLive ? state.cur : locked - 1;
            return (
              <span
                key={i}
                className={`dd-cell ${locked || isLive ? 'on' : ''} ${isGhost ? 'ghost' : ''}`}
                style={
                  locked || isLive
                    ? ({ ['--c' as string]: COLORS[Math.max(0, colorIdx)] } as CSSProperties)
                    : undefined
                }
              />
            );
          })}
        </div>
        <div className="dd-side">
          <div className="dd-next">
            <div className="dd-next-label">Next</div>
            <div className="dd-next-grid">
              {Array.from({ length: 8 }, (_, i) => {
                const r = Math.floor(i / 4);
                const c = i % 4;
                const on = nextShape[r]?.[c] === 1;
                return (
                  <span
                    key={i}
                    className={`dd-next-cell ${on ? 'on' : ''}`}
                    style={on ? ({ ['--c' as string]: COLORS[state.next] } as CSSProperties) : undefined}
                  />
                );
              })}
            </div>
          </div>
          <div className="dd-stat">{Math.round(1000 / gravityMs(elapsed))}×</div>
        </div>
      </div>
      {!over ? (
        <div className="dd-controls" data-sfx="off">
          <button type="button" className="dd-btn" aria-label="Move left" onClick={onLeft}>
            ◀
          </button>
          <button type="button" className="dd-btn rot" aria-label="Rotate" onClick={onRotate}>
            ↻
          </button>
          <button type="button" className="dd-btn" aria-label="Move right" onClick={onRight}>
            ▶
          </button>
          <button type="button" className="dd-btn drop" aria-label="Hard drop" onClick={onHardDrop}>
            ▼ Drop
          </button>
        </div>
      ) : (
        <p className="dd-over">
          {state.topOut ? 'Topped out!' : 'Goal hit!'} {state.lines} lines · {state.score} pts
        </p>
      )}
    </div>
  );
}

function useDuoDrop(
  initial: DropState,
  onFinish: (lines: number, score: number, ms: number, topOut: boolean) => void,
  onProgress?: (lines: number, score: number) => void,
) {
  const [state, setState] = useState(initial);
  const done = useRef(false);
  const stateRef = useRef(state);
  const onFinishRef = useRef(onFinish);
  const onProgressRef = useRef(onProgress);
  const [now, setNow] = useState(Date.now());

  stateRef.current = state;
  onFinishRef.current = onFinish;
  onProgressRef.current = onProgress;

  useEffect(() => {
    setState(initial);
    done.current = false;
  }, [initial]);

  useEffect(() => {
    if (!state.startedAt || state.finishedAt) return;
    const id = window.setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, [state.startedAt, state.finishedAt]);

  const elapsed = state.startedAt ? (state.finishedAt ?? now) - state.startedAt : 0;

  const finishIfNeeded = (locked: DropState) => {
    onProgressRef.current?.(locked.lines, locked.score);
    if (locked.finishedAt && !done.current) {
      done.current = true;
      const playMs = (locked.finishedAt ?? Date.now()) - (locked.startedAt ?? Date.now());
      queueMicrotask(() =>
        onFinishRef.current(locked.lines, locked.score, playMs, locked.topOut),
      );
    }
  };

  // Continuous gravity — one timeout chain for the whole run (always falling).
  useEffect(() => {
    done.current = false;
    let cancelled = false;
    let timeoutId = 0;

    setState((s) => (s.startedAt ? s : { ...s, startedAt: Date.now() }));

    const stepGravity = () => {
      if (cancelled || done.current) return;
      setState((s) => {
        if (s.finishedAt || done.current) return s;
        const cur = s.startedAt ? s : { ...s, startedAt: Date.now() };
        if (fits(cur.grid, cur.cur, cur.rot, cur.x, cur.y + 1)) {
          return { ...cur, y: cur.y + 1 };
        }
        const locked = lockPiece(cur);
        finishIfNeeded(locked);
        return locked;
      });
    };

    const loop = () => {
      if (cancelled || done.current) return;
      const s = stateRef.current;
      if (s.finishedAt) return;
      const startedAt = s.startedAt ?? Date.now();
      const ms = gravityMs(Date.now() - startedAt);
      timeoutId = window.setTimeout(() => {
        stepGravity();
        loop();
      }, ms);
    };
    loop();

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);

  const ensureStart = (s: DropState): DropState =>
    s.startedAt ? s : { ...s, startedAt: Date.now() };

  const left = () => {
    if (done.current) return;
    setState((s) => {
      if (s.finishedAt) return s;
      const cur = ensureStart(s);
      if (!fits(cur.grid, cur.cur, cur.rot, cur.x - 1, cur.y)) {
        sfxBad();
        return cur;
      }
      sfxPop();
      return { ...cur, x: cur.x - 1 };
    });
  };
  const right = () => {
    if (done.current) return;
    setState((s) => {
      if (s.finishedAt) return s;
      const cur = ensureStart(s);
      if (!fits(cur.grid, cur.cur, cur.rot, cur.x + 1, cur.y)) {
        sfxBad();
        return cur;
      }
      sfxPop();
      return { ...cur, x: cur.x + 1 };
    });
  };
  const rotate = () => {
    if (done.current) return;
    setState((s) => {
      if (s.finishedAt) return s;
      const cur = ensureStart(s);
      const rot = (cur.rot + 1) % 4;
      const kicks = [0, -1, 1, -2, 2];
      for (const k of kicks) {
        if (fits(cur.grid, cur.cur, rot, cur.x + k, cur.y)) {
          sfxGood();
          return { ...cur, rot, x: cur.x + k };
        }
      }
      sfxBad();
      return cur;
    });
  };
  /** Instant lock at the ghost position — one tap. */
  const hardDrop = () => {
    if (done.current) return;
    setState((s) => {
      if (s.finishedAt) return s;
      const cur = ensureStart(s);
      const y = ghostY(cur);
      const dropped = Math.max(0, y - cur.y);
      const next = { ...cur, y, score: cur.score + dropped * 2 };
      const locked = lockPiece(next);
      finishIfNeeded(locked);
      return locked;
    });
  };

  return { state, elapsed, left, right, rotate, hardDrop };
}

function SoloView({ initialState, onFinish }: SoloGameProps<DropState>) {
  const { state, elapsed, left, right, rotate, hardDrop } = useDuoDrop(
    initialState,
    (lines, score, playMs, topOut) =>
      onFinish({
        score: {
          primary: score,
          label: `${lines} lines · ${score} pts · ${formatTime(playMs)}`,
        },
        detail: topOut ? 'Topped out' : 'Cleared the goal!',
      }),
  );
  return (
    <Board
      state={state}
      elapsed={elapsed}
      onLeft={left}
      onRight={right}
      onRotate={rotate}
      onHardDrop={hardDrop}
    />
  );
}

function RaceView(props: RaceGameProps<DropState>) {
  const { state, elapsed, left, right, rotate, hardDrop } = useDuoDrop(
    props.initialState,
    (lines, score, _ms, topOut) => {
      const payload = {
        primary: score,
        label: `${lines}L · ${score}`,
        progress: 1,
      };
      props.onLocalScore(payload);
      props.onFinish({
        score: payload,
        detail: topOut ? 'Topped out' : 'Goal!',
      });
    },
    (lines, score) => {
      props.onLocalScore({
        primary: score,
        label: `${lines}/${LINE_GOAL}`,
        progress: Math.min(1, lines / LINE_GOAL),
      });
    },
  );
  return (
    <Board
      state={state}
      elapsed={elapsed}
      onLeft={left}
      onRight={right}
      onRotate={rotate}
      onHardDrop={hardDrop}
    />
  );
}

export const duoDropGame: GameDefinition<DropState> = {
  id: 'duo-drop',
  title: 'Duo Drop',
  blurb: 'Phone Tetris — clear 12 lines before you top out.',
  emoji: '🟦',
  accent: 'var(--sky)',
  modes: ['solo', 'race'],
  category: 'reflex',
  restart: 'game',
  daily: false,
  howTo: [
    '◀ ▶ move, ↻ rotate, ▼ Drop slams the piece to the floor.',
    'Pieces always fall on their own — faster as time goes on.',
    'Clear 12 lines (or most before topping out). Typical games last ~30s–3min.',
  ],
  rules: 'Pieces always fall. Drop = slam down. Clear 12 lines.',
  createInitialState: (seed) => createDropState(seed),
  SoloView,
  RaceView,
};
