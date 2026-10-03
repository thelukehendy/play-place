import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  GameDefinition,
  PlayerInfo,
  ScoreValue,
  SoloGameProps,
  TurnGameProps,
} from '../types';
import { Rules } from '../../ui/GameChrome';
import {
  SEAT_GLYPHS,
  TurnBanner,
  TurnRoster,
  useOutcomeSound,
  useYourTurnPing,
} from '../../ui/TurnChrome';
import { sfxBad, sfxPop } from '../../lib/sfx';
import './ConnectFour.css';

const COLS = 7;
const ROWS = 6;
const MAX_PLAYERS = 4;

export type C4State = {
  /** 0 = empty, 1..4 = seat owner */
  cells: number[];
  turn: number;
  playerCount: number;
  over: boolean;
  /** Winning seat (1..4) or 0 for none / draw. */
  winner: number;
  win: number[];
  last: number;
  seq: number;
};

const idx = (r: number, c: number) => r * COLS + c;

export function createC4State(_seed: number, players: PlayerInfo[]): C4State {
  const human = Math.min(MAX_PLAYERS, Math.max(1, players.length));
  return {
    cells: Array(COLS * ROWS).fill(0),
    turn: 0,
    playerCount: human === 1 ? 2 : human,
    over: false,
    winner: 0,
    win: [],
    last: -1,
    seq: 0,
  };
}

function dropRow(cells: number[], col: number): number {
  for (let r = ROWS - 1; r >= 0; r--) if (!cells[idx(r, col)]) return r;
  return -1;
}

const DIRS: [number, number][] = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1],
];

function findWin(cells: number[], r: number, c: number): number[] | null {
  const owner = cells[idx(r, c)];
  if (!owner) return null;
  for (const [dr, dc] of DIRS) {
    const line = [idx(r, c)];
    for (const sign of [1, -1]) {
      let rr = r + dr * sign;
      let cc = c + dc * sign;
      while (rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS && cells[idx(rr, cc)] === owner) {
        line.push(idx(rr, cc));
        rr += dr * sign;
        cc += dc * sign;
      }
    }
    if (line.length >= 4) return line;
  }
  return null;
}

export function applyDrop(state: C4State, col: number): C4State {
  if (state.over) return state;
  const r = dropRow(state.cells, col);
  if (r < 0) return state;
  const owner = state.turn + 1;
  const cells = [...state.cells];
  cells[idx(r, col)] = owner;
  const win = findWin(cells, r, col);
  const full = cells.every(Boolean);
  return {
    ...state,
    cells,
    turn: win || full ? state.turn : (state.turn + 1) % state.playerCount,
    over: !!win || full,
    winner: win ? owner : 0,
    win: win ?? [],
    last: idx(r, col),
    seq: state.seq + 1,
  };
}

/* ---------- CPU (seat 2 in solo) ---------- */

function windowsScore(cells: number[], me: number, opp: number): number {
  let score = 0;
  const check = (a: number, b: number, c: number, d: number) => {
    const w = [cells[a], cells[b], cells[c], cells[d]];
    const mine = w.filter((x) => x === me).length;
    const theirs = w.filter((x) => x === opp).length;
    if (mine && theirs) return;
    if (mine === 4) score += 1000;
    else if (mine === 3) score += 12;
    else if (mine === 2) score += 3;
    if (theirs === 3) score -= 14;
    else if (theirs === 2) score -= 3;
  };
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) {
      if (c + 3 < COLS) check(idx(r, c), idx(r, c + 1), idx(r, c + 2), idx(r, c + 3));
      if (r + 3 < ROWS) check(idx(r, c), idx(r + 1, c), idx(r + 2, c), idx(r + 3, c));
      if (r + 3 < ROWS && c + 3 < COLS)
        check(idx(r, c), idx(r + 1, c + 1), idx(r + 2, c + 2), idx(r + 3, c + 3));
      if (r + 3 < ROWS && c - 3 >= 0)
        check(idx(r, c), idx(r + 1, c - 1), idx(r + 2, c - 2), idx(r + 3, c - 3));
    }
  for (let r = 0; r < ROWS; r++) {
    if (cells[idx(r, 3)] === me) score += 3;
    else if (cells[idx(r, 3)] === opp) score -= 3;
  }
  return score;
}

function search(
  cells: number[],
  depth: number,
  alpha: number,
  beta: number,
  maximizing: boolean,
  me: number,
  opp: number,
): number {
  const order = [3, 2, 4, 1, 5, 0, 6];
  const moves = order.filter((c) => dropRow(cells, c) >= 0);
  if (moves.length === 0) return 0;
  if (depth === 0) return windowsScore(cells, me, opp);
  let best = maximizing ? -Infinity : Infinity;
  for (const c of moves) {
    const r = dropRow(cells, c);
    const who = maximizing ? me : opp;
    cells[idx(r, c)] = who;
    let val: number;
    if (findWin(cells, r, c)) val = (maximizing ? 1 : -1) * (100000 + depth);
    else val = search(cells, depth - 1, alpha, beta, !maximizing, me, opp);
    cells[idx(r, c)] = 0;
    if (maximizing) {
      best = Math.max(best, val);
      alpha = Math.max(alpha, val);
    } else {
      best = Math.min(best, val);
      beta = Math.min(beta, val);
    }
    if (beta <= alpha) break;
  }
  return best;
}

export function cpuColumn(state: C4State): number {
  const me = state.turn + 1;
  const opp = me === 1 ? 2 : 1;
  const cells = [...state.cells];
  const moves = [3, 2, 4, 1, 5, 0, 6].filter((c) => dropRow(cells, c) >= 0);
  if (Math.random() < 0.1) return moves[Math.floor(Math.random() * moves.length)];
  let bestCol = moves[0];
  let bestVal = -Infinity;
  for (const c of moves) {
    const r = dropRow(cells, c);
    cells[idx(r, c)] = me;
    const val = findWin(cells, r, c)
      ? 1e7
      : search(cells, 4, -Infinity, Infinity, false, me, opp);
    cells[idx(r, c)] = 0;
    if (val > bestVal) {
      bestVal = val;
      bestCol = c;
    }
  }
  return bestCol;
}

/* ---------- UI ---------- */

function Board({
  state,
  names,
  ids,
  meIndex,
  canPlay,
  onDrop,
}: {
  state: C4State;
  names: string[];
  ids: (string | undefined)[];
  meIndex: number;
  canPlay: boolean;
  onDrop: (col: number) => void;
}) {
  const myTurn = !state.over && meIndex >= 0 && state.turn === meIndex;
  const iWon = state.over && state.winner > 0 && state.winner - 1 === meIndex;
  useYourTurnPing(myTurn, state.over);
  useOutcomeSound(state.over, iWon, meIndex >= 0);

  const discs = state.cells.filter(Boolean).length;
  const turnName = names[state.turn] ?? `P${state.turn + 1}`;
  const text = state.over
    ? state.winner
      ? `${names[state.winner - 1] ?? 'Someone'} connects four!`
      : "It's a draw!"
    : myTurn
      ? 'Your turn — drop a disc'
      : `Waiting for ${turnName}`;

  return (
    <div>
      <TurnRoster
        showGlyph
        turn={state.turn}
        meIndex={meIndex}
        over={state.over}
        seats={names.map((name, i) => ({ name, id: ids[i] }))}
      />
      <TurnBanner over={state.over} myTurn={myTurn} turnIndex={state.turn} text={text} />
      <Rules text="Drop discs. First to connect four in a row wins." />
      <div
        className={`c4-board ${canPlay ? 'can-play' : ''}`}
        role="group"
        aria-label={`Connect Four board, ${discs} discs played`}
        data-sfx="off"
      >
        {Array.from({ length: COLS }, (_, c) => {
          const full = dropRow(state.cells, c) < 0;
          return (
            <button
              key={c}
              type="button"
              className="c4-col"
              disabled={!canPlay || full}
              aria-label={`Drop in column ${c + 1}`}
              onClick={() => onDrop(c)}
            >
              {Array.from({ length: ROWS }, (_, r) => {
                const i = idx(r, c);
                const v = state.cells[i];
                return (
                  <span key={r} className="c4-slot">
                    {v ? (
                      <span
                        className={`c4-disc seat-${v} ${i === state.last ? 'drop' : ''} ${
                          state.win.includes(i) ? 'win' : ''
                        }`}
                        style={{ ['--drop' as string]: r + 1 }}
                      >
                        {SEAT_GLYPHS[v - 1]}
                      </span>
                    ) : null}
                  </span>
                );
              })}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function scoreLabel(state: C4State, meIdx: number, cpu: boolean): string {
  if (!state.winner) return 'Draw';
  if (state.winner - 1 === meIdx) return cpu ? 'You win!' : 'Winner!';
  return cpu ? 'CPU wins' : 'Lost';
}

function SoloView({ initialState, player, onFinish, onStateChange }: SoloGameProps<C4State>) {
  const [state, setState] = useState(initialState);
  const finished = useRef(false);

  useEffect(() => {
    setState(initialState);
    finished.current = false;
  }, [initialState]);

  const finish = (s: C4State) => {
    if (finished.current) return;
    finished.current = true;
    const won = s.winner === 1;
    window.setTimeout(
      () =>
        onFinish({
          score: {
            primary: won ? 1 : 0,
            label: scoreLabel(s, 0, true),
          },
          detail: won ? 'Four in a row!' : s.winner ? 'The CPU got you this time.' : undefined,
        }),
      900,
    );
  };

  useEffect(() => {
    if (state.over) {
      finish(state);
      return;
    }
    if (state.turn !== 1) return;
    const t = window.setTimeout(() => {
      setState((s) => {
        if (s.over || s.turn !== 1) return s;
        const next = applyDrop(s, cpuColumn(s));
        onStateChange?.(next);
        return next;
      });
    }, 550);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const play = (col: number) => {
    if (state.turn !== 0 || state.over) return;
    if (dropRow(state.cells, col) < 0) {
      sfxBad();
      return;
    }
    sfxPop();
    setState((s) => {
      const next = applyDrop(s, col);
      onStateChange?.(next);
      return next;
    });
  };

  return (
    <Board
      state={state}
      names={[player.name, 'CPU']}
      ids={[player.id, undefined]}
      meIndex={0}
      canPlay={state.turn === 0 && !state.over}
      onDrop={play}
    />
  );
}

function TurnView({ state: rawState, player, players, onStateChange, onFinish }: TurnGameProps<C4State>) {
  const state = useMemo(() => ({ ...rawState, win: rawState.win ?? [] }), [rawState]);
  const seats = players.slice(0, MAX_PLAYERS);
  const meIndex = seats.findIndex((p) => p.id === player.id);
  const canPlay = !state.over && meIndex >= 0 && state.turn === meIndex;

  const play = (col: number) => {
    if (!canPlay) return;
    if (dropRow(state.cells, col) < 0) {
      sfxBad();
      return;
    }
    sfxPop();
    const next = applyDrop(state, col);
    onStateChange(next);
    if (next.over) {
      const winnerId = next.winner ? seats[next.winner - 1]?.id : undefined;
      onFinish({
        score: { primary: next.winner - 1 === meIndex ? 1 : 0, label: scoreLabel(next, meIndex, false) },
        winnerId,
      });
    }
  };

  return (
    <Board
      state={state}
      names={seats.map((p, i) => p.name || `P${i + 1}`)}
      ids={seats.map((p) => p.id)}
      meIndex={meIndex}
      canPlay={canPlay}
      onDrop={play}
    />
  );
}

export const connectFourGame: GameDefinition<C4State> = {
  id: 'connect-four',
  title: 'Connect Four',
  blurb: 'Drop discs, line up four.',
  emoji: '🔴',
  accent: 'var(--red)',
  modes: ['solo', 'turn'],
  category: 'versus',
  restart: 'game',
  daily: false,
  howTo: [
    'Tap a column to drop your disc to the bottom.',
    'Line up four of your discs in a row, column or diagonal.',
    'Block your opponent — first to four wins. 2–4 players.',
  ],
  rules: 'Drop discs; first to connect four wins. Supports 2–4 players.',
  createInitialState: createC4State,
  SoloView,
  TurnView,
  isFinished: (s) => s.over,
  getScoresFromState: (s, players) => {
    const out: Record<string, ScoreValue> = {};
    const discs = s.cells.filter(Boolean).length;
    players.slice(0, s.playerCount).forEach((p, i) => {
      const mine = s.cells.filter((x) => x === i + 1).length;
      out[p.id] = s.over
        ? { primary: s.winner === i + 1 ? 1 : 0, label: s.winner === i + 1 ? 'Winner!' : s.winner ? 'Lost' : 'Draw', progress: 1 }
        : { primary: 0, label: `${mine} discs`, progress: discs / (COLS * ROWS) };
    });
    return out;
  },
};
