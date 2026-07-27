import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createRng, formatTime } from '../../lib/random';
import type { GameDefinition, RaceGameProps, SoloGameProps } from '../types';
import { GameHud, Rules, Stat } from '../../ui/GameChrome';
import { Button } from '../../ui/Button';
import { haptic, sfxFinish, sfxTap } from '../../lib/sfx';
import './Inertia.css';

const ROUNDS = 5;
const UNDO_COST = 8;
const DEATH_COST = 30;
const GEM_SCORE = 20;
const CLEAR_BONUS = 50;

type CellKind = 'empty' | 'wall' | 'gem' | 'mine' | 'stop' | 'mover';

type Dir = { dr: number; dc: number };

const DIRS: Dir[] = [
  { dr: -1, dc: -1 },
  { dr: -1, dc: 0 },
  { dr: -1, dc: 1 },
  { dr: 0, dc: -1 },
  { dr: 0, dc: 1 },
  { dr: 1, dc: -1 },
  { dr: 1, dc: 0 },
  { dr: 1, dc: 1 },
];

type RoundConfig = {
  size: number;
  gems: number;
  mines: number;
  stops: number;
  wallChance: number;
  movers: number;
};

function configForRound(round: number): RoundConfig {
  // round is 0-based
  const table: RoundConfig[] = [
    { size: 6, gems: 3, mines: 2, stops: 3, wallChance: 0.12, movers: 0 },
    { size: 7, gems: 4, mines: 4, stops: 4, wallChance: 0.16, movers: 0 },
    { size: 8, gems: 5, mines: 6, stops: 5, wallChance: 0.2, movers: 0 },
    { size: 8, gems: 6, mines: 7, stops: 6, wallChance: 0.22, movers: 1 },
    { size: 9, gems: 7, mines: 9, stops: 7, wallChance: 0.24, movers: 2 },
  ];
  return table[Math.min(round, table.length - 1)];
}

export type InertiaRound = {
  size: number;
  cells: CellKind[];
  ball: number;
  /** Patrol loops for moving mines (cell indices). */
  patrols: number[][];
  /** Index into each patrol. */
  patrolAt: number[];
};

export type InertiaState = {
  seed: number;
  round: number;
  score: number;
  undos: number;
  deaths: number;
  moves: number;
  gemsLeft: number;
  board: InertiaRound;
  /** Snapshots for undo (board + ball + gemsLeft). */
  history: { board: InertiaRound; gemsLeft: number }[];
  status: 'play' | 'dead' | 'clear' | 'done';
  startedAt: number | null;
  finishedAt: number | null;
  flash: string | null;
};

function idx(r: number, c: number, size: number) {
  return r * size + c;
}

function rc(i: number, size: number) {
  return { r: Math.floor(i / size), c: i % size };
}

function inBounds(r: number, c: number, size: number) {
  return r >= 0 && c >= 0 && r < size && c < size;
}

function cloneBoard(b: InertiaRound): InertiaRound {
  return {
    size: b.size,
    cells: [...b.cells],
    ball: b.ball,
    patrols: b.patrols.map((p) => [...p]),
    patrolAt: [...b.patrolAt],
  };
}

/** Slide until wall / stopper / death. Collect gems along the way. */
function simulateSlide(board: InertiaRound, dir: Dir) {
  const { size, cells } = board;
  let { r, c } = rc(board.ball, size);
  const collected: number[] = [];
  let death = false;
  let steps = 0;

  while (true) {
    const nr = r + dir.dr;
    const nc = c + dir.dc;
    if (!inBounds(nr, nc, size)) break;
    const ni = idx(nr, nc, size);
    const kind = cells[ni];
    if (kind === 'wall') break;

    r = nr;
    c = nc;
    steps++;

    if (kind === 'mine' || kind === 'mover') {
      death = true;
      break;
    }
    if (kind === 'gem') collected.push(ni);
    if (kind === 'stop') break;
  }

  return {
    land: idx(r, c, size),
    collected,
    death,
    steps,
  };
}

function dirFromTap(ball: number, target: number, size: number): Dir | null {
  const a = rc(ball, size);
  const b = rc(target, size);
  const dr = Math.sign(b.r - a.r);
  const dc = Math.sign(b.c - a.c);
  if (dr === 0 && dc === 0) return null;
  return { dr, dc };
}

function countGems(cells: CellKind[]) {
  return cells.reduce((n, c) => n + (c === 'gem' ? 1 : 0), 0);
}

function advanceMovers(board: InertiaRound): { board: InertiaRound; hitBall: boolean } {
  if (!board.patrols.length) return { board, hitBall: false };
  const next = cloneBoard(board);
  // Clear current mover marks
  for (let i = 0; i < next.cells.length; i++) {
    if (next.cells[i] === 'mover') next.cells[i] = 'empty';
  }
  let hitBall = false;
  for (let p = 0; p < next.patrols.length; p++) {
    const path = next.patrols[p];
    if (path.length < 2) continue;
    const at = (next.patrolAt[p] + 1) % path.length;
    next.patrolAt[p] = at;
    const cell = path[at];
    if (cell === next.ball) hitBall = true;
    // Don't overwrite walls/stops/gems/mines
    if (next.cells[cell] === 'empty') next.cells[cell] = 'mover';
    else if (next.cells[cell] === 'gem') {
      // Mover skips gem cells — stay put this beat
      const back = (at - 1 + path.length) % path.length;
      next.patrolAt[p] = back;
      const prev = path[back];
      if (next.cells[prev] === 'empty') next.cells[prev] = 'mover';
    }
  }
  return { board: next, hitBall };
}

function buildRound(seed: number, round: number): InertiaRound {
  const rng = createRng(seed ^ Math.imul(round + 1, 0x9e3779b9));
  const cfg = configForRound(round);
  const size = cfg.size;
  const cells: CellKind[] = Array.from({ length: size * size }, () => 'empty');

  // Border walls
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (r === 0 || c === 0 || r === size - 1 || c === size - 1) {
        cells[idx(r, c, size)] = 'wall';
      }
    }
  }

  // Interior walls — denser on later rounds, keep some corridors open
  for (let r = 1; r < size - 1; r++) {
    for (let c = 1; c < size - 1; c++) {
      if (rng() < cfg.wallChance) cells[idx(r, c, size)] = 'wall';
    }
  }

  // Ensure a sparse lattice of openings (carve plus-shapes)
  for (let k = 0; k < 3 + round; k++) {
    const r = 1 + Math.floor(rng() * (size - 2));
    const c = 1 + Math.floor(rng() * (size - 2));
    cells[idx(r, c, size)] = 'empty';
    for (const d of DIRS) {
      const nr = r + d.dr;
      const nc = c + d.dc;
      if (inBounds(nr, nc, size) && !(nr === 0 || nc === 0 || nr === size - 1 || nc === size - 1)) {
        if (rng() < 0.7) cells[idx(nr, nc, size)] = 'empty';
      }
    }
  }

  // Ball start — interior empty
  let ball = idx(1, 1, size);
  const empties = () =>
    cells
      .map((k, i) => (k === 'empty' ? i : -1))
      .filter((i) => i >= 0);
  {
    const pool = empties();
    ball = pool[Math.floor(rng() * pool.length)] ?? ball;
  }

  // Place stoppers
  let stopsLeft = cfg.stops;
  const stopPool = empties().filter((i) => i !== ball);
  for (const i of shuffleInPlace(stopPool, rng)) {
    if (stopsLeft <= 0) break;
    cells[i] = 'stop';
    stopsLeft--;
  }

  // Probe reachable slides from ball (no mines yet) to place gems on traveled cells
  const traveled = new Set<number>([ball]);
  const reachablePos = new Set<number>([ball]);
  const queue = [ball];
  const probeCells = [...cells];

  while (queue.length) {
    const pos = queue.shift()!;
    for (const dir of DIRS) {
      const fake: InertiaRound = {
        size,
        cells: probeCells,
        ball: pos,
        patrols: [],
        patrolAt: [],
      };
      const res = simulateSlide(fake, dir);
      if (res.death || res.steps === 0) continue;
      // mark path
      let { r, c } = rc(pos, size);
      for (let s = 0; s < res.steps; s++) {
        r += dir.dr;
        c += dir.dc;
        traveled.add(idx(r, c, size));
      }
      if (!reachablePos.has(res.land)) {
        reachablePos.add(res.land);
        queue.push(res.land);
      }
    }
  }

  // Place gems on traveled empty/stop cells (not ball)
  const gemCandidates = [...traveled].filter(
    (i) => i !== ball && (cells[i] === 'empty' || cells[i] === 'stop'),
  );
  shuffleInPlace(gemCandidates, rng);
  let gemsToPlace = Math.min(cfg.gems, gemCandidates.length);
  // If not enough traveled cells, carve a few more empties near ball
  if (gemsToPlace < cfg.gems) {
    for (const i of empties()) {
      if (gemCandidates.includes(i) || i === ball) continue;
      gemCandidates.push(i);
      if (gemCandidates.length >= cfg.gems) break;
    }
    gemsToPlace = Math.min(cfg.gems, gemCandidates.length);
  }
  for (let g = 0; g < gemsToPlace; g++) {
    const i = gemCandidates[g];
    if (cells[i] === 'stop') {
      // Keep stopper under gem? Prefer convert to gem (stop not needed)
      cells[i] = 'gem';
    } else {
      cells[i] = 'gem';
    }
  }

  // Mines on empty cells that look tempting but aren't required — prefer cells
  // adjacent to traveled path but not the only route (just empty non-traveled first)
  const mineCandidates = cells
    .map((k, i) => (k === 'empty' && i !== ball ? i : -1))
    .filter((i) => i >= 0);
  // Prefer off-path
  mineCandidates.sort((a, b) => {
    const ta = traveled.has(a) ? 1 : 0;
    const tb = traveled.has(b) ? 1 : 0;
    return ta - tb || (rng() < 0.5 ? -1 : 1);
  });
  let minesLeft = cfg.mines;
  for (const i of mineCandidates) {
    if (minesLeft <= 0) break;
    // Don't mine-lock the start neighborhood completely
    const { r, c } = rc(i, size);
    const { r: br, c: bc } = rc(ball, size);
    if (Math.abs(r - br) + Math.abs(c - bc) <= 1) continue;
    cells[i] = 'mine';
    minesLeft--;
  }

  // Moving mines: short patrols on empty runs (later rounds)
  const patrols: number[][] = [];
  const patrolAt: number[] = [];
  let moversLeft = cfg.movers;
  const moverStarts = cells
    .map((k, i) => (k === 'empty' && i !== ball ? i : -1))
    .filter((i) => i >= 0);
  shuffleInPlace(moverStarts, rng);
  for (const start of moverStarts) {
    if (moversLeft <= 0) break;
    const { r, c } = rc(start, size);
    const horiz = rng() < 0.5;
    const path: number[] = [];
    for (let step = 0; step <= 3; step++) {
      const rr = horiz ? r : r + step;
      const cc = horiz ? c + step : c;
      if (!inBounds(rr, cc, size)) break;
      const pi = idx(rr, cc, size);
      if (cells[pi] !== 'empty') break;
      path.push(pi);
    }
    if (path.length < 2) continue;
    const loop = [...path, ...path.slice(0, -1).reverse()];
    cells[path[0]] = 'mover';
    patrols.push(loop);
    patrolAt.push(0);
    moversLeft--;
  }

  // Safety: if zero gems, force one next to a reachable empty
  if (countGems(cells) === 0) {
    for (const i of traveled) {
      if (i !== ball && cells[i] === 'empty') {
        cells[i] = 'gem';
        break;
      }
    }
  }

  return { size, cells, ball, patrols, patrolAt };
}

function shuffleInPlace<T>(arr: T[], rng: () => number) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function createInertiaState(seed: number): InertiaState {
  const board = buildRound(seed, 0);
  return {
    seed,
    round: 0,
    score: 0,
    undos: 0,
    deaths: 0,
    moves: 0,
    gemsLeft: countGems(board.cells),
    board,
    history: [],
    status: 'play',
    startedAt: null,
    finishedAt: null,
    flash: null,
  };
}

function roundProgress(state: InertiaState) {
  const total = Math.max(1, configForRound(state.round).gems);
  const collected = Math.max(0, total - state.gemsLeft);
  const within = Math.min(1, collected / total);
  return Math.min(0.99, (state.round + within) / ROUNDS);
}

function scoreLabel(state: InertiaState) {
  return `${state.score} pts · R${Math.min(state.round + 1, ROUNDS)}/${ROUNDS}`;
}

function useInertia(
  initial: InertiaState,
  onFinish: (score: number, detail: string) => void,
  onProgress?: (state: InertiaState) => void,
) {
  const [state, setState] = useState(initial);
  const done = useRef(false);
  const flashTimer = useRef<number | null>(null);

  useEffect(() => {
    setState(initial);
    done.current = false;
  }, [initial]);

  useEffect(
    () => () => {
      if (flashTimer.current) clearTimeout(flashTimer.current);
    },
    [],
  );

  const emit = (next: InertiaState) => {
    onProgress?.(next);
  };

  const tapCell = (target: number) => {
    if (done.current) return;
    setState((s) => {
      if (s.status !== 'play' || s.finishedAt) return s;
      const dir = dirFromTap(s.board.ball, target, s.board.size);
      if (!dir) return s;

      const preview = simulateSlide(s.board, dir);
      if (preview.steps === 0) return s;

      const startedAt = s.startedAt ?? Date.now();
      const history = [
        ...s.history,
        { board: cloneBoard(s.board), gemsLeft: s.gemsLeft },
      ].slice(-30);

      if (preview.death) {
        haptic([30, 40, 30]);
        const board = cloneBoard(s.board);
        board.ball = preview.land;
        const score = Math.max(0, s.score - DEATH_COST);
        const next: InertiaState = {
          ...s,
          startedAt,
          board,
          score,
          deaths: s.deaths + 1,
          moves: s.moves + 1,
          status: 'dead',
          history,
          flash: `Boom! −${DEATH_COST}`,
        };
        queueMicrotask(() => emit(next));
        return next;
      }

      const board = cloneBoard(s.board);
      for (const g of preview.collected) board.cells[g] = 'empty';
      board.ball = preview.land;
      const gemsGot = preview.collected.length;
      let gemsLeft = s.gemsLeft - gemsGot;
      let score = s.score + gemsGot * GEM_SCORE;
      let status: InertiaState['status'] = 'play';
      let flashText: string | null = gemsGot ? `+${gemsGot * GEM_SCORE}` : null;

      // Advance movers after a successful slide
      const moved = advanceMovers(board);
      Object.assign(board, moved.board);
      if (moved.hitBall) {
        haptic([30, 40, 30]);
        score = Math.max(0, score - DEATH_COST);
        const next: InertiaState = {
          ...s,
          startedAt,
          board,
          score,
          deaths: s.deaths + 1,
          moves: s.moves + 1,
          gemsLeft,
          history,
          status: 'dead',
          flash: `Caught! −${DEATH_COST}`,
        };
        queueMicrotask(() => emit(next));
        return next;
      }

      sfxTap();
      if (gemsLeft <= 0) {
        const bonus = CLEAR_BONUS + s.round * 10;
        score += bonus;
        flashText = `Clear! +${bonus}`;
        status = 'clear';
        haptic([12, 20, 12]);
      }

      const next: InertiaState = {
        ...s,
        startedAt,
        board,
        score,
        gemsLeft: Math.max(0, gemsLeft),
        moves: s.moves + 1,
        history,
        status,
        flash: flashText,
      };
      queueMicrotask(() => emit(next));
      return next;
    });
  };

  const undo = () => {
    setState((s) => {
      if (s.status === 'done' || s.finishedAt) return s;
      if (!s.history.length) return s;
      const history = [...s.history];
      const prev = history.pop()!;
      const score = Math.max(0, s.score - UNDO_COST);
      haptic(10);
      const next: InertiaState = {
        ...s,
        board: cloneBoard(prev.board),
        gemsLeft: prev.gemsLeft,
        history,
        score,
        undos: s.undos + 1,
        status: 'play',
        flash: `Undo −${UNDO_COST}`,
      };
      queueMicrotask(() => emit(next));
      return next;
    });
  };

  const restartRound = () => {
    setState((s) => {
      if (s.status === 'done' || s.finishedAt) return s;
      const board = buildRound(s.seed, s.round);
      // Slight seed tweak so restart isn't identical to death reset of same layout
      // — actually same round+seed is same layout; that's OK (learn the puzzle).
      const score = Math.max(0, s.score - DEATH_COST);
      haptic(20);
      const next: InertiaState = {
        ...s,
        board,
        gemsLeft: countGems(board.cells),
        history: [],
        score,
        deaths: s.deaths + (s.status === 'dead' ? 0 : 1),
        status: 'play',
        flash: `Restart −${DEATH_COST}`,
        startedAt: s.startedAt ?? Date.now(),
      };
      // If already dead, death was already charged — only charge restart when from play
      if (s.status === 'dead') {
        next.score = s.score; // already paid on death; restart is free recovery
        next.flash = 'Try again!';
        next.deaths = s.deaths;
      }
      queueMicrotask(() => emit(next));
      return next;
    });
  };

  const nextRound = () => {
    setState((s) => {
      if (s.status !== 'clear') return s;
      const round = s.round + 1;
      if (round >= ROUNDS) {
        done.current = true;
        const finishedAt = Date.now();
        const next: InertiaState = {
          ...s,
          status: 'done',
          finishedAt,
          flash: 'All clear!',
          round: ROUNDS - 1,
        };
        sfxFinish();
        queueMicrotask(() => {
          emit(next);
          onFinish(
            next.score,
            `${next.moves} moves · ${next.undos} undos · ${next.deaths} deaths`,
          );
        });
        return next;
      }
      const board = buildRound(s.seed, round);
      const next: InertiaState = {
        ...s,
        round,
        board,
        gemsLeft: countGems(board.cells),
        history: [],
        status: 'play',
        flash: `Round ${round + 1}!`,
      };
      queueMicrotask(() => emit(next));
      return next;
    });
  };

  // Auto-advance shortly after clear so race doesn't stall
  useEffect(() => {
    if (state.status !== 'clear') return;
    const t = window.setTimeout(() => nextRound(), 900);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.status, state.round]);

  return { state, tapCell, undo, restartRound, nextRound };
}

function cellClass(kind: CellKind, isBall: boolean) {
  if (isBall) return 'inertia-cell ball';
  return `inertia-cell ${kind}`;
}

function Board({
  state,
  onTap,
  onUndo,
  onRestart,
  footer,
}: {
  state: InertiaState;
  onTap: (i: number) => void;
  onUndo: () => void;
  onRestart: () => void;
  footer?: ReactNode;
}) {
  const elapsed =
    state.startedAt && !state.finishedAt
      ? Date.now() - state.startedAt
      : state.startedAt && state.finishedAt
        ? state.finishedAt - state.startedAt
        : 0;
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!state.startedAt || state.finishedAt) return;
    const id = setInterval(() => setTick((t) => t + 1), 200);
    return () => clearInterval(id);
  }, [state.startedAt, state.finishedAt]);

  const size = state.board.size;
  const dead = state.status === 'dead';
  const cleared = state.status === 'clear';
  const done = state.status === 'done';

  return (
    <div className="inertia-board">
      <GameHud>
        <Stat>{state.score} pts</Stat>
        <Stat>
          R{Math.min(state.round + 1, ROUNDS)}/{ROUNDS}
        </Stat>
        <Stat>{state.gemsLeft} gems</Stat>
        <Stat>{formatTime(elapsed)}</Stat>
      </GameHud>
      <Rules text="Tap a direction — the ball slides until it stops. Grab gems, dodge mines!" />
      {state.flash ? <p className="inertia-flash">{state.flash}</p> : <p className="inertia-flash idle">&nbsp;</p>}

      <div
        className={`inertia-grid ${dead ? 'dead' : ''} ${cleared ? 'clear' : ''}`}
        style={{ gridTemplateColumns: `repeat(${size}, 1fr)` }}
      >
        {state.board.cells.map((kind, i) => {
          const isBall = state.board.ball === i;
          return (
            <button
              key={i}
              type="button"
              className={`${cellClass(kind, isBall)}${dead && isBall ? ' doomed' : ''}`}
              disabled={done || cleared || dead}
              onClick={() => onTap(i)}
              aria-label={
                isBall
                  ? 'Ball'
                  : kind === 'gem'
                    ? 'Gem'
                    : kind === 'mine' || kind === 'mover'
                      ? 'Mine'
                      : kind === 'wall'
                        ? 'Wall'
                        : kind === 'stop'
                          ? 'Stop'
                          : 'Empty'
              }
            >
              {isBall ? <span className="inertia-ball" /> : null}
              {!isBall && kind === 'gem' ? <span className="inertia-gem" /> : null}
              {!isBall && (kind === 'mine' || kind === 'mover') ? (
                <span className={`inertia-mine ${kind === 'mover' ? 'mover' : ''}`} />
              ) : null}
              {!isBall && kind === 'stop' ? <span className="inertia-stop" /> : null}
              {!isBall && kind === 'empty' ? <span className="inertia-pad" /> : null}
            </button>
          );
        })}
      </div>

      <div className="inertia-actions">
        <Button variant="ghost" onClick={onUndo} disabled={done || !state.history.length || cleared}>
          Undo (−{UNDO_COST})
        </Button>
        <Button variant="sky" onClick={onRestart} disabled={done || cleared}>
          {dead ? 'Retry' : `Restart (−${DEATH_COST})`}
        </Button>
      </div>

      {dead ? (
        <p className="inertia-hint">Hit a mine — Retry the round (layout stays so you can learn it).</p>
      ) : null}
      {cleared ? <p className="inertia-hint">Round clear! Next puzzle incoming…</p> : null}
      {done ? (
        <p className="inertia-hint">
          Finished — {state.moves} moves · {state.undos} undos · {state.deaths} deaths
        </p>
      ) : null}
      {footer}
    </div>
  );
}

function SoloView({ initialState, onFinish }: SoloGameProps<InertiaState>) {
  const { state, tapCell, undo, restartRound } = useInertia(initialState, (score, detail) =>
    onFinish({
      score: { primary: score, label: `${score} pts` },
      detail,
    }),
  );
  return <Board state={state} onTap={tapCell} onUndo={undo} onRestart={restartRound} />;
}

function RaceView(props: RaceGameProps<InertiaState>) {
  const { state, tapCell, undo, restartRound } = useInertia(
    props.initialState,
    (score, detail) => {
      const s = {
        primary: score,
        label: `${score} pts`,
        progress: 1,
      };
      props.onLocalScore(s);
      props.onFinish({ score: s, detail });
    },
    (live) => {
      props.onLocalScore({
        primary: live.score,
        label: scoreLabel(live),
        progress: live.status === 'done' ? 1 : roundProgress(live),
      });
    },
  );
  return <Board state={state} onTap={tapCell} onUndo={undo} onRestart={restartRound} />;
}

export const inertiaGame: GameDefinition<InertiaState> = {
  id: 'inertia',
  title: 'Inertia',
  blurb: 'Slide the ball — grab gems, dodge mines.',
  emoji: '🟢',
  accent: 'var(--green)',
  modes: ['solo', 'race'],
  rules: 'Tap to slide. Collect every gem. Mines end the round.',
  createInitialState: (seed) => createInertiaState(seed),
  SoloView,
  RaceView,
};
