import { createRng } from '../../lib/random';

export const ROUNDS = 5;
export const UNDO_COST = 8;
export const DEATH_COST = 30;
export const GEM_SCORE = 20;
export const CLEAR_BONUS = 50;

/** Floor terrain — gems sit on top via `hasGem`. */
export type CellKind = 'empty' | 'wall' | 'mine' | 'stop' | 'mover';

export type Dir = { dr: number; dc: number };

export const DIRS: Dir[] = [
  { dr: -1, dc: -1 },
  { dr: -1, dc: 0 },
  { dr: -1, dc: 1 },
  { dr: 0, dc: -1 },
  { dr: 0, dc: 1 },
  { dr: 1, dc: -1 },
  { dr: 1, dc: 0 },
  { dr: 1, dc: 1 },
];

export type RoundConfig = {
  size: number;
  gems: number;
  mines: number;
  stops: number;
  wallChance: number;
  movers: number;
};

export function configForRound(round: number): RoundConfig {
  const table: RoundConfig[] = [
    { size: 6, gems: 3, mines: 2, stops: 3, wallChance: 0.1, movers: 0 },
    { size: 7, gems: 4, mines: 4, stops: 4, wallChance: 0.14, movers: 0 },
    { size: 8, gems: 5, mines: 6, stops: 5, wallChance: 0.18, movers: 0 },
    { size: 8, gems: 6, mines: 7, stops: 6, wallChance: 0.2, movers: 1 },
    { size: 9, gems: 7, mines: 9, stops: 7, wallChance: 0.22, movers: 2 },
  ];
  return table[Math.min(round, table.length - 1)];
}

export type InertiaRound = {
  size: number;
  cells: CellKind[];
  /** Parallel to cells — true where a gem sits (including on stoppers). */
  hasGem: boolean[];
  ball: number;
  patrols: number[][];
  patrolAt: number[];
};

export function idx(r: number, c: number, size: number) {
  return r * size + c;
}

export function rc(i: number, size: number) {
  return { r: Math.floor(i / size), c: i % size };
}

export function inBounds(r: number, c: number, size: number) {
  return r >= 0 && c >= 0 && r < size && c < size;
}

export function cloneBoard(b: InertiaRound): InertiaRound {
  return {
    size: b.size,
    cells: [...b.cells],
    hasGem: [...b.hasGem],
    ball: b.ball,
    patrols: b.patrols.map((p) => [...p]),
    patrolAt: [...b.patrolAt],
  };
}

export function countGems(hasGem: boolean[]) {
  return hasGem.reduce((n, g) => n + (g ? 1 : 0), 0);
}

export function shuffleInPlace<T>(arr: T[], rng: () => number) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Slide until wall / stopper / death. Collect gems along the way. */
export function simulateSlide(board: InertiaRound, dir: Dir) {
  const { size, cells, hasGem } = board;
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
    if (hasGem[ni]) collected.push(ni);
    // Perforated anchors stop the ball (gems on them are collected first).
    if (kind === 'stop') break;
  }

  return {
    land: idx(r, c, size),
    collected,
    death,
    steps,
  };
}

export function dirFromTap(ball: number, target: number, size: number): Dir | null {
  const a = rc(ball, size);
  const b = rc(target, size);
  const dr = Math.sign(b.r - a.r);
  const dc = Math.sign(b.c - a.c);
  if (dr === 0 && dc === 0) return null;
  return { dr, dc };
}

export function advanceMovers(board: InertiaRound): { board: InertiaRound; hitBall: boolean } {
  if (!board.patrols.length) return { board, hitBall: false };
  const next = cloneBoard(board);
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
    if (next.cells[cell] === 'empty') next.cells[cell] = 'mover';
    else if (next.hasGem[cell] || next.cells[cell] === 'stop') {
      const back = (at - 1 + path.length) % path.length;
      next.patrolAt[p] = back;
      const prev = path[back];
      if (next.cells[prev] === 'empty') next.cells[prev] = 'mover';
    }
  }
  return { board: next, hitBall };
}

/**
 * BFS over (position, remaining-gem bitmask).
 * Movers are treated as static hazards for solvability (boards keep movers off the solution).
 */
export function isSolvable(board: InertiaRound): boolean {
  const gemCells: number[] = [];
  for (let i = 0; i < board.hasGem.length; i++) {
    if (board.hasGem[i]) gemCells.push(i);
  }
  const n = gemCells.length;
  if (n === 0) return true;
  if (n > 12) return false;

  const bitOf = new Map<number, number>();
  gemCells.forEach((cell, bit) => bitOf.set(cell, bit));

  const fullMask = (1 << n) - 1;
  const startKey = board.ball * (fullMask + 1) + fullMask;
  const seen = new Set<number>([startKey]);
  const queue: { pos: number; mask: number }[] = [{ pos: board.ball, mask: fullMask }];

  // Working board clone for slides with gem mask applied
  const work = cloneBoard(board);

  while (queue.length) {
    const { pos, mask } = queue.shift()!;
    if (mask === 0) return true;

    for (let i = 0; i < work.hasGem.length; i++) {
      const bit = bitOf.get(i);
      work.hasGem[i] = bit !== undefined ? (mask & (1 << bit)) !== 0 : false;
    }
    work.ball = pos;

    for (const dir of DIRS) {
      const res = simulateSlide(work, dir);
      if (res.death || res.steps === 0) continue;

      let nextMask = mask;
      for (const g of res.collected) {
        const bit = bitOf.get(g);
        if (bit !== undefined) nextMask &= ~(1 << bit);
      }
      const key = res.land * (fullMask + 1) + nextMask;
      if (seen.has(key)) continue;
      seen.add(key);
      queue.push({ pos: res.land, mask: nextMask });
      if (nextMask === 0) return true;
    }
  }
  return false;
}

function emptyInterior(cells: CellKind[], size: number, exclude?: number) {
  const out: number[] = [];
  for (let i = 0; i < cells.length; i++) {
    if (cells[i] !== 'empty') continue;
    if (exclude !== undefined && i === exclude) continue;
    const { r, c } = rc(i, size);
    if (r === 0 || c === 0 || r === size - 1 || c === size - 1) continue;
    out.push(i);
  }
  return out;
}

function pathCells(from: number, dir: Dir, steps: number, size: number): number[] {
  const out: number[] = [];
  let { r, c } = rc(from, size);
  for (let s = 0; s < steps; s++) {
    r += dir.dr;
    c += dir.dc;
    out.push(idx(r, c, size));
  }
  return out;
}

/** Guaranteed-completable corridor fallback. */
function buildFallback(cfg: RoundConfig, rng: () => number): InertiaRound {
  const size = cfg.size;
  const cells: CellKind[] = Array.from({ length: size * size }, () => 'wall');
  const hasGem: boolean[] = Array.from({ length: size * size }, () => false);

  // Open a plus corridor through the interior
  const mid = Math.floor(size / 2);
  for (let r = 1; r < size - 1; r++) cells[idx(r, mid, size)] = 'empty';
  for (let c = 1; c < size - 1; c++) cells[idx(mid, c, size)] = 'empty';

  const ball = idx(mid, 1, size);
  cells[ball] = 'empty';

  // Place stoppers along the arms so the ball can pivot
  const stopSpots = [
    idx(mid, Math.floor(size / 3), size),
    idx(mid, Math.floor((2 * size) / 3), size),
    idx(Math.floor(size / 3), mid, size),
    idx(Math.floor((2 * size) / 3), mid, size),
  ].filter((i) => i !== ball && cells[i] === 'empty');

  for (const i of stopSpots.slice(0, Math.max(2, cfg.stops))) {
    cells[i] = 'stop';
  }

  // Gems on empty/stop cells away from ball
  const gemPool = emptyInterior(cells, size, ball).concat(
    cells.map((k, i) => (k === 'stop' && i !== ball ? i : -1)).filter((i) => i >= 0),
  );
  shuffleInPlace(gemPool, rng);
  const unique = [...new Set(gemPool)];
  for (let g = 0; g < Math.min(cfg.gems, unique.length); g++) {
    hasGem[unique[g]] = true;
  }

  // A couple of mines in corners of open cells far from path center — skip if would break
  const board: InertiaRound = {
    size,
    cells,
    hasGem,
    ball,
    patrols: [],
    patrolAt: [],
  };

  if (!isSolvable(board)) {
    // Strip mines/walls extras — already open; place gems on stops only
    for (let i = 0; i < hasGem.length; i++) hasGem[i] = false;
    const stops = cells.map((k, i) => (k === 'stop' ? i : -1)).filter((i) => i >= 0);
    for (let g = 0; g < Math.min(cfg.gems, stops.length); g++) hasGem[stops[g]] = true;
    if (countGems(hasGem) === 0 && stops[0] !== undefined) hasGem[stops[0]] = true;
  }

  return board;
}

/**
 * Construct a board by carving a real solution (slides + anchor landings),
 * then sprinkle extras and verify with BFS.
 */
function tryBuildRound(rng: () => number, cfg: RoundConfig): InertiaRound | null {
  const size = cfg.size;
  const cells: CellKind[] = Array.from({ length: size * size }, () => 'empty');
  const hasGem: boolean[] = Array.from({ length: size * size }, () => false);

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (r === 0 || c === 0 || r === size - 1 || c === size - 1) {
        cells[idx(r, c, size)] = 'wall';
      }
    }
  }

  // Sparse interior walls
  for (let r = 1; r < size - 1; r++) {
    for (let c = 1; c < size - 1; c++) {
      if (rng() < cfg.wallChance) cells[idx(r, c, size)] = 'wall';
    }
  }

  // Carve openings so the board isn't sealed
  for (let k = 0; k < 4 + cfg.size; k++) {
    const r = 1 + Math.floor(rng() * (size - 2));
    const c = 1 + Math.floor(rng() * (size - 2));
    cells[idx(r, c, size)] = 'empty';
    for (const d of DIRS) {
      const nr = r + d.dr;
      const nc = c + d.dc;
      if (inBounds(nr, nc, size) && nr > 0 && nc > 0 && nr < size - 1 && nc < size - 1) {
        if (rng() < 0.75) cells[idx(nr, nc, size)] = 'empty';
      }
    }
  }

  const pool = emptyInterior(cells, size);
  if (pool.length < cfg.gems + 4) return null;
  shuffleInPlace(pool, rng);
  const ball = pool[0];

  const solution = new Set<number>([ball]);
  const forcedStops = new Set<number>();
  let pos = ball;
  let gemsPlaced = 0;

  const probe: InertiaRound = {
    size,
    cells,
    hasGem,
    ball: pos,
    patrols: [],
    patrolAt: [],
  };

  // Build a solution by chaining slides; place anchors where we want mid-corridor landings.
  for (let attempt = 0; attempt < 80 && gemsPlaced < cfg.gems; attempt++) {
    probe.ball = pos;
    const dirs = shuffleInPlace([...DIRS], rng);
    let placed = false;

    for (const dir of dirs) {
      // Natural slide (current stops already on board)
      const natural = simulateSlide(probe, dir);
      if (natural.death || natural.steps === 0) continue;

      let landSteps = natural.steps;
      let useAnchor = false;

      // Often land on an anchor before the wall so later pivots are possible
      if (natural.steps >= 2 && rng() < 0.7) {
        landSteps = 1 + Math.floor(rng() * (natural.steps - 1));
        useAnchor = true;
      }

      const path = pathCells(pos, dir, landSteps, size);
      const land = path[path.length - 1];
      if (land === pos) continue;
      if (cells[land] === 'wall' || cells[land] === 'mine') continue;

      // Clear path terrain for the slide
      for (const cell of path) {
        if (cells[cell] === 'wall' || cells[cell] === 'mine') {
          cells[cell] = 'empty';
        }
      }

      if (useAnchor) {
        cells[land] = 'stop';
        forcedStops.add(land);
      } else if (cells[land] !== 'stop' && cells[land] !== 'empty') {
        // Natural wall-stop landing — keep floor open
        cells[land] = 'empty';
      }

      // Place a gem on this slide (prefer mid-path, allow on stop)
      const gemChoices = path.filter((i) => i !== ball);
      if (!gemChoices.length) continue;
      const gemCell = gemChoices[Math.floor(rng() * gemChoices.length)];
      if (!hasGem[gemCell]) {
        hasGem[gemCell] = true;
        gemsPlaced++;
      }

      for (const cell of path) solution.add(cell);
      solution.add(land);
      pos = land;
      placed = true;
      break;
    }

    if (!placed) {
      // Nudge: clear a random neighbor of pos and try again
      const { r, c } = rc(pos, size);
      const d = DIRS[Math.floor(rng() * DIRS.length)];
      const nr = r + d.dr;
      const nc = c + d.dc;
      if (inBounds(nr, nc, size) && nr > 0 && nc > 0 && nr < size - 1 && nc < size - 1) {
        cells[idx(nr, nc, size)] = 'empty';
      }
    }
  }

  if (gemsPlaced < cfg.gems) {
    // Fill remaining gems on solution cells
    const extras = [...solution].filter((i) => i !== ball && !hasGem[i] && cells[i] !== 'wall');
    shuffleInPlace(extras, rng);
    for (const i of extras) {
      if (gemsPlaced >= cfg.gems) break;
      hasGem[i] = true;
      gemsPlaced++;
    }
  }

  if (gemsPlaced < Math.max(1, Math.ceil(cfg.gems * 0.6))) return null;

  // Extra sparse anchors (not on every cell — like the reference)
  let stopsLeft = Math.max(0, cfg.stops - forcedStops.size);
  const stopCand = emptyInterior(cells, size, ball).filter((i) => !forcedStops.has(i));
  shuffleInPlace(stopCand, rng);
  for (const i of stopCand) {
    if (stopsLeft <= 0) break;
    // Prefer cells that are on or near the solution so they help play
    if (!solution.has(i) && rng() < 0.45) continue;
    cells[i] = 'stop';
    stopsLeft--;
  }

  // Mines off the solution path
  let minesLeft = cfg.mines;
  const mineCand = emptyInterior(cells, size, ball).filter((i) => !solution.has(i) && !hasGem[i]);
  shuffleInPlace(mineCand, rng);
  for (const i of mineCand) {
    if (minesLeft <= 0) break;
    const { r, c } = rc(i, size);
    const { r: br, c: bc } = rc(ball, size);
    if (Math.abs(r - br) + Math.abs(c - bc) <= 1) continue;
    cells[i] = 'mine';
    minesLeft--;
  }

  // Moving mines — only on non-solution empties
  const patrols: number[][] = [];
  const patrolAt: number[] = [];
  let moversLeft = cfg.movers;
  const moverStarts = emptyInterior(cells, size, ball).filter((i) => !solution.has(i) && !hasGem[i]);
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
      if (cells[pi] !== 'empty' || solution.has(pi) || hasGem[pi]) break;
      path.push(pi);
    }
    if (path.length < 2) continue;
    const loop = [...path, ...path.slice(0, -1).reverse()];
    cells[path[0]] = 'mover';
    patrols.push(loop);
    patrolAt.push(0);
    moversLeft--;
  }

  const board: InertiaRound = { size, cells, hasGem, ball, patrols, patrolAt };
  if (!isSolvable(board)) return null;
  return board;
}

export function buildRound(seed: number, round: number): InertiaRound {
  const cfg = configForRound(round);
  const base = seed ^ Math.imul(round + 1, 0x9e3779b9);

  for (let attempt = 0; attempt < 120; attempt++) {
    const rng = createRng((base + attempt * 0x85ebca6b) >>> 0);
    const board = tryBuildRound(rng, cfg);
    if (board && countGems(board.hasGem) > 0 && isSolvable(board)) {
      return board;
    }
  }

  const rng = createRng((base ^ 0xdeadbeef) >>> 0);
  const fallback = buildFallback(cfg, rng);
  // Last resort: keep regenerating fallback variants
  for (let i = 0; i < 40; i++) {
    const b = buildFallback(cfg, createRng((base + i * 9973) >>> 0));
    if (isSolvable(b) && countGems(b.hasGem) > 0) return b;
  }
  return fallback;
}
