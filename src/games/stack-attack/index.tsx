import { useEffect, useRef, useState } from 'react';
import type {
  GameDefinition,
  PlayerInfo,
  ScoreValue,
  SoloGameProps,
  TurnGameProps,
} from '../types';
import { Rules } from '../../ui/GameChrome';
import {
  TurnBanner,
  TurnRoster,
  useOutcomeSound,
  useYourTurnPing,
} from '../../ui/TurnChrome';
import { sfxBad, sfxClaim, sfxPop } from '../../lib/sfx';
import './StackAttack.css';

const COLS = 6;
const ROWS = 10;
const MAX_PLAYERS = 4;

export type StackState = {
  /** 0 empty, 1..4 seat owner */
  cells: number[];
  scores: number[];
  turn: number;
  playerCount: number;
  over: boolean;
  lastCleared: number[];
  seq: number;
};

const idx = (r: number, c: number) => r * COLS + c;

export function createStackState(_seed: number, players: PlayerInfo[]): StackState {
  const human = Math.min(MAX_PLAYERS, Math.max(1, players.length));
  const playerCount = human === 1 ? 2 : human;
  return {
    cells: Array(COLS * ROWS).fill(0),
    scores: Array(playerCount).fill(0),
    turn: 0,
    playerCount,
    over: false,
    lastCleared: [],
    seq: 0,
  };
}

function columnHeight(cells: number[], c: number): number {
  for (let r = 0; r < ROWS; r++) if (cells[idx(r, c)]) return ROWS - r;
  return 0;
}

function canDrop(cells: number[], c: number): boolean {
  return cells[idx(0, c)] === 0;
}

function dropIn(cells: number[], c: number, owner: number): { cells: number[]; at: number } | null {
  if (!canDrop(cells, c)) return null;
  const next = [...cells];
  for (let r = ROWS - 1; r >= 0; r--) {
    if (!next[idx(r, c)]) {
      next[idx(r, c)] = owner;
      return { cells: next, at: idx(r, c) };
    }
  }
  return null;
}

function findGroups(cells: number[], owner: number): number[][] {
  const seen = new Set<number>();
  const groups: number[][] = [];
  for (let i = 0; i < cells.length; i++) {
    if (cells[i] !== owner || seen.has(i)) continue;
    const stack = [i];
    const group: number[] = [];
    seen.add(i);
    while (stack.length) {
      const cur = stack.pop()!;
      group.push(cur);
      const r = Math.floor(cur / COLS);
      const c = cur % COLS;
      for (const [dr, dc] of [
        [0, 1],
        [0, -1],
        [1, 0],
        [-1, 0],
      ] as const) {
        const rr = r + dr;
        const cc = c + dc;
        if (rr < 0 || rr >= ROWS || cc < 0 || cc >= COLS) continue;
        const n = idx(rr, cc);
        if (cells[n] === owner && !seen.has(n)) {
          seen.add(n);
          stack.push(n);
        }
      }
    }
    if (group.length >= 3) groups.push(group);
  }
  return groups;
}

function applyGravity(cells: number[]): number[] {
  const next = Array(COLS * ROWS).fill(0);
  for (let c = 0; c < COLS; c++) {
    const stack: number[] = [];
    for (let r = ROWS - 1; r >= 0; r--) {
      const v = cells[idx(r, c)];
      if (v) stack.push(v);
    }
    for (let i = 0; i < stack.length; i++) {
      next[idx(ROWS - 1 - i, c)] = stack[i];
    }
  }
  return next;
}

function clearOwner(cells: number[], owner: number): { cells: number[]; cleared: number[] } {
  const groups = findGroups(cells, owner);
  if (!groups.length) return { cells, cleared: [] };
  const next = [...cells];
  const cleared: number[] = [];
  for (const g of groups) {
    for (const i of g) {
      next[i] = 0;
      cleared.push(i);
    }
  }
  return { cells: applyGravity(next), cleared };
}

function anyMoves(cells: number[]): boolean {
  for (let c = 0; c < COLS; c++) if (canDrop(cells, c)) return true;
  return false;
}

export function applyDrop(state: StackState, col: number): StackState {
  if (state.over || col < 0 || col >= COLS) return state;
  const owner = state.turn + 1;
  const dropped = dropIn(state.cells, col, owner);
  if (!dropped) return state;
  const { cells: afterClear, cleared } = clearOwner(dropped.cells, owner);
  const scores = [...state.scores];
  scores[state.turn] += cleared.length;
  const scored = cleared.length > 0;
  let turn = scored ? state.turn : (state.turn + 1) % state.playerCount;
  // Skip if somehow stuck — check board full
  const over = !anyMoves(afterClear);
  if (over) turn = state.turn;
  return {
    ...state,
    cells: afterClear,
    scores,
    turn,
    over,
    lastCleared: cleared,
    seq: state.seq + 1,
  };
}

function cpuPick(state: StackState): number {
  const me = state.turn + 1;
  let best = -1;
  let bestScore = -Infinity;
  for (let c = 0; c < COLS; c++) {
    if (!canDrop(state.cells, c)) continue;
    const dropped = dropIn(state.cells, c, me);
    if (!dropped) continue;
    const { cleared } = clearOwner(dropped.cells, me);
    const height = columnHeight(state.cells, c);
    const score = cleared.length * 10 - height + (c === 2 || c === 3 ? 0.5 : 0);
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best;
}

function Board({
  state,
  names,
  ids,
  meIndex,
  canPlay,
  onDrop,
  onNudgePlayer,
}: {
  state: StackState;
  names: string[];
  ids: (string | undefined)[];
  meIndex: number;
  canPlay: boolean;
  onDrop: (col: number) => void;
  onNudgePlayer?: (playerId: string) => void;
}) {
  const myTurn = !state.over && meIndex >= 0 && state.turn === meIndex;
  const best = Math.max(...state.scores);
  const leaders = state.scores.map((s, i) => (s === best ? i : -1)).filter((i) => i >= 0);
  const iWon = state.over && leaders.length === 1 && leaders[0] === meIndex;
  useYourTurnPing(myTurn, state.over);
  useOutcomeSound(state.over, iWon, meIndex >= 0);

  const cleared = new Set(state.lastCleared);
  const text = state.over
    ? leaders.length > 1
      ? `Tie: ${leaders.map((i) => names[i]).join(', ')}`
      : `${names[leaders[0]] ?? 'Someone'} wins!`
    : myTurn
      ? 'Your turn — drop a block'
      : `Waiting for ${names[state.turn] ?? 'player'}`;

  return (
    <div>
      <TurnRoster
        turn={state.turn}
        meIndex={meIndex}
        over={state.over}
        seats={names.map((name, i) => ({ name, id: ids[i], score: state.scores[i] ?? 0 }))}
        onSeatTap={onNudgePlayer}
      />
      <TurnBanner over={state.over} myTurn={myTurn} turnIndex={state.turn} text={text} />
      <Rules text="Drop your color. Match 3+ to clear, score, and go again." />
      <div className="sa-well" style={{ ['--cols' as string]: COLS }} data-sfx="off">
        {state.cells.map((v, i) => (
          <span
            key={i}
            className={`sa-cell ${v ? `filled seat-${v}` : ''} ${cleared.has(i) ? 'cleared' : ''}`}
          />
        ))}
      </div>
      <div className="sa-cols" data-sfx="off">
        {Array.from({ length: COLS }, (_, c) => (
          <button
            key={c}
            type="button"
            className={`sa-drop ${canPlay ? 'mine' : ''}`}
            disabled={!canPlay || !canDrop(state.cells, c) || state.over}
            aria-label={`Drop in column ${c + 1}`}
            onClick={() => onDrop(c)}
          >
            ▼
          </button>
        ))}
      </div>
    </div>
  );
}

function SoloView({ initialState, player, onFinish, onStateChange }: SoloGameProps<StackState>) {
  const [state, setState] = useState(initialState);
  const finished = useRef(false);

  useEffect(() => {
    setState(initialState);
    finished.current = false;
  }, [initialState]);

  useEffect(() => {
    if (!state.over || finished.current) return;
    finished.current = true;
    const [me, cpu] = state.scores;
    window.setTimeout(
      () =>
        onFinish({
          score: {
            primary: me,
            label: me === cpu ? `Tie ${me}-${cpu}` : me > cpu ? `You ${me}-${cpu}` : `CPU ${cpu}-${me}`,
          },
        }),
      700,
    );
  }, [state, onFinish]);

  useEffect(() => {
    if (state.over || state.turn !== 1) return;
    const t = window.setTimeout(() => {
      setState((s) => {
        if (s.over || s.turn !== 1) return s;
        const col = cpuPick(s);
        if (col < 0) return { ...s, over: true, seq: s.seq + 1 };
        const next = applyDrop(s, col);
        if (next.lastCleared.length) sfxClaim();
        else sfxPop();
        onStateChange?.(next);
        return next;
      });
    }, 500);
    return () => clearTimeout(t);
  }, [state, onStateChange]);

  const drop = (col: number) => {
    if (state.turn !== 0 || state.over) return;
    setState((s) => {
      const next = applyDrop(s, col);
      if (next === s) {
        sfxBad();
        return s;
      }
      if (next.lastCleared.length) sfxClaim();
      else sfxPop();
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
      onDrop={drop}
    />
  );
}

function TurnView({
  state,
  player,
  players,
  onStateChange,
  onFinish,
  onNudgePlayer,
}: TurnGameProps<StackState>) {
  const seats = players.slice(0, MAX_PLAYERS);
  const meIndex = seats.findIndex((p) => p.id === player.id);
  const canPlay = !state.over && meIndex >= 0 && state.turn === meIndex;

  const drop = (col: number) => {
    if (!canPlay) return;
    const next = applyDrop(state, col);
    if (next === state) {
      sfxBad();
      return;
    }
    if (next.lastCleared.length) sfxClaim();
    else sfxPop();
    onStateChange(next);
    if (next.over) {
      const best = Math.max(...next.scores);
      const winners = next.scores
        .map((s, i) => (s === best ? seats[i]?.id : null))
        .filter(Boolean) as string[];
      onFinish({
        score: { primary: next.scores[meIndex] ?? 0, label: next.scores.join('-') },
        winnerId: winners.length === 1 ? winners[0] : undefined,
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
      onDrop={drop}
      onNudgePlayer={onNudgePlayer}
    />
  );
}

function scoresFromState(state: StackState, players: PlayerInfo[]): Record<string, ScoreValue> {
  const out: Record<string, ScoreValue> = {};
  players.slice(0, state.playerCount).forEach((p, i) => {
    out[p.id] = { primary: state.scores[i] ?? 0, label: `${state.scores[i] ?? 0}` };
  });
  return out;
}

export const stackAttackGame: GameDefinition<StackState> = {
  id: 'stack-attack',
  title: 'Stack Attack',
  blurb: 'Drop blocks, match 3+, clear the well.',
  emoji: '🧱',
  accent: 'var(--gold)',
  modes: ['solo', 'turn'],
  category: 'versus',
  restart: 'game',
  daily: false,
  howTo: [
    'On your turn, drop a block of your color into a column.',
    'Match 3+ of your color (touching sides) to clear them and score — then go again.',
    'Most cleared blocks when the well fills wins.',
  ],
  rules: 'Drop your color. Match 3+ to clear, score, and play again.',
  createInitialState: createStackState,
  SoloView,
  TurnView,
  isFinished: (s) => s.over,
  getScoresFromState: scoresFromState,
};
