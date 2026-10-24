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
import './ClaimCrown.css';

const N = 5;
const TOTAL = N * N;
const MAX_PLAYERS = 4;

export type CrownState = {
  /** 0 empty, 1..4 seat */
  cells: number[];
  turn: number;
  playerCount: number;
  over: boolean;
  seq: number;
};

export function createCrownState(_seed: number, players: PlayerInfo[]): CrownState {
  const human = Math.min(MAX_PLAYERS, Math.max(1, players.length));
  return {
    cells: Array(TOTAL).fill(0),
    turn: 0,
    playerCount: human === 1 ? 2 : human,
    over: false,
    seq: 0,
  };
}

function neighbors(i: number): number[] {
  const r = Math.floor(i / N);
  const c = i % N;
  const out: number[] = [];
  if (r > 0) out.push(i - N);
  if (r < N - 1) out.push(i + N);
  if (c > 0) out.push(i - 1);
  if (c < N - 1) out.push(i + 1);
  return out;
}

function countOwned(cells: number[], owner: number): number {
  return cells.filter((v) => v === owner).length;
}

function hasAny(cells: number[], owner: number): boolean {
  return cells.some((v) => v === owner);
}

function legalMoves(state: CrownState, owner: number): number[] {
  const moves: number[] = [];
  const started = hasAny(state.cells, owner);
  for (let i = 0; i < TOTAL; i++) {
    if (state.cells[i]) continue;
    if (!started || neighbors(i).some((n) => state.cells[n] === owner)) moves.push(i);
  }
  return moves;
}

/** Bonus when the new tile touches 2+ of your tiles (closing / reinforcing). */
function isBonusClaim(cells: number[], i: number, owner: number): boolean {
  return neighbors(i).filter((n) => cells[n] === owner).length >= 2;
}

export function applyClaim(state: CrownState, i: number): CrownState {
  if (state.over || state.cells[i]) return state;
  const owner = state.turn + 1;
  const legal = legalMoves(state, owner);
  if (!legal.includes(i)) return state;
  const cells = [...state.cells];
  const bonus = isBonusClaim(cells, i, owner);
  cells[i] = owner;
  const full = cells.every(Boolean);
  // If next player has no moves but board not full, skip until someone can or all stuck
  let turn = bonus && !full ? state.turn : (state.turn + 1) % state.playerCount;
  if (!full) {
    let guard = 0;
    while (legalMoves({ ...state, cells, turn }, turn + 1).length === 0 && guard < state.playerCount) {
      turn = (turn + 1) % state.playerCount;
      guard++;
    }
    if (guard >= state.playerCount && legalMoves({ ...state, cells, turn }, turn + 1).length === 0) {
      return { ...state, cells, turn: state.turn, over: true, seq: state.seq + 1 };
    }
  }
  return {
    ...state,
    cells,
    turn: full ? state.turn : turn,
    over: full,
    seq: state.seq + 1,
  };
}

function scoresOf(state: CrownState): number[] {
  return Array.from({ length: state.playerCount }, (_, i) => countOwned(state.cells, i + 1));
}

function cpuPick(state: CrownState): number {
  const owner = state.turn + 1;
  const moves = legalMoves(state, owner);
  if (!moves.length) return -1;
  let best = moves[0];
  let bestScore = -Infinity;
  for (const m of moves) {
    const bonus = isBonusClaim(state.cells, m, owner) ? 5 : 0;
    const center = 2 - Math.abs(Math.floor(m / N) - 2) - Math.abs((m % N) - 2);
    const score = bonus + center + neighbors(m).filter((n) => !state.cells[n]).length * 0.3;
    if (score > bestScore) {
      bestScore = score;
      best = m;
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
  onClaim,
  onNudgePlayer,
}: {
  state: CrownState;
  names: string[];
  ids: (string | undefined)[];
  meIndex: number;
  canPlay: boolean;
  onClaim: (i: number) => void;
  onNudgePlayer?: (playerId: string) => void;
}) {
  const scores = scoresOf(state);
  const myTurn = !state.over && meIndex >= 0 && state.turn === meIndex;
  const best = Math.max(...scores);
  const leaders = scores.map((s, i) => (s === best ? i : -1)).filter((i) => i >= 0);
  const iWon = state.over && leaders.length === 1 && leaders[0] === meIndex;
  useYourTurnPing(myTurn, state.over);
  useOutcomeSound(state.over, iWon, meIndex >= 0);

  const owner = state.turn + 1;
  const legal = canPlay ? new Set(legalMoves(state, owner)) : new Set<number>();

  const text = state.over
    ? leaders.length > 1
      ? `Tie: ${leaders.map((i) => names[i]).join(', ')}`
      : `${names[leaders[0]] ?? 'Someone'} takes the crown!`
    : myTurn
      ? 'Claim an adjacent tile'
      : `Waiting for ${names[state.turn] ?? 'player'}`;

  return (
    <div>
      <TurnRoster
        turn={state.turn}
        meIndex={meIndex}
        over={state.over}
        seats={names.map((name, i) => ({ name, id: ids[i], score: scores[i] ?? 0 }))}
        onSeatTap={onNudgePlayer}
      />
      <TurnBanner over={state.over} myTurn={myTurn} turnIndex={state.turn} text={text} />
      <Rules text="Claim empty tiles next to yours. Touch 2+ of yours = bonus turn. Most tiles wins." />
      <div className="cc-map" style={{ ['--n' as string]: N }} data-sfx="off">
        {state.cells.map((v, i) => (
          <button
            key={i}
            type="button"
            className={`cc-tile ${v ? `seat-${v}` : `open ${legal.has(i) ? 'can' : ''}`}`}
            disabled={!canPlay || !legal.has(i) || state.over}
            aria-label={v ? `Owned by seat ${v}` : legal.has(i) ? 'Claim tile' : 'Blocked'}
            onClick={() => onClaim(i)}
          >
            {v ? '' : legal.has(i) ? '+' : ''}
          </button>
        ))}
      </div>
    </div>
  );
}

function SoloView({ initialState, player, onFinish, onStateChange }: SoloGameProps<CrownState>) {
  const [state, setState] = useState(initialState);
  const finished = useRef(false);

  useEffect(() => {
    setState(initialState);
    finished.current = false;
  }, [initialState]);

  useEffect(() => {
    if (!state.over || finished.current) return;
    finished.current = true;
    const [me, cpu] = scoresOf(state);
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
        const pick = cpuPick(s);
        if (pick < 0) return { ...s, over: true, seq: s.seq + 1 };
        const next = applyClaim(s, pick);
        if (next !== s) sfxPop();
        onStateChange?.(next);
        return next;
      });
    }, 450);
    return () => clearTimeout(t);
  }, [state, onStateChange]);

  const claim = (i: number) => {
    if (state.turn !== 0 || state.over) return;
    setState((s) => {
      const next = applyClaim(s, i);
      if (next === s) {
        sfxBad();
        return s;
      }
      if (isBonusClaim(s.cells, i, 1)) sfxClaim();
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
      onClaim={claim}
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
}: TurnGameProps<CrownState>) {
  const seats = players.slice(0, MAX_PLAYERS);
  const meIndex = seats.findIndex((p) => p.id === player.id);
  const canPlay = !state.over && meIndex >= 0 && state.turn === meIndex;

  const claim = (i: number) => {
    if (!canPlay) return;
    const next = applyClaim(state, i);
    if (next === state) {
      sfxBad();
      return;
    }
    if (isBonusClaim(state.cells, i, meIndex + 1)) sfxClaim();
    else sfxPop();
    onStateChange(next);
    if (next.over) {
      const scores = scoresOf(next);
      const best = Math.max(...scores);
      const winners = scores
        .map((s, i) => (s === best ? seats[i]?.id : null))
        .filter(Boolean) as string[];
      onFinish({
        score: { primary: scores[meIndex] ?? 0, label: scores.join('-') },
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
      onClaim={claim}
      onNudgePlayer={onNudgePlayer}
    />
  );
}

function scoresFromState(state: CrownState, players: PlayerInfo[]): Record<string, ScoreValue> {
  const scores = scoresOf(state);
  const out: Record<string, ScoreValue> = {};
  players.slice(0, state.playerCount).forEach((p, i) => {
    out[p.id] = { primary: scores[i] ?? 0, label: `${scores[i] ?? 0}` };
  });
  return out;
}

export const claimCrownGame: GameDefinition<CrownState> = {
  id: 'claim-crown',
  title: 'Claim the Crown',
  blurb: 'Grab territory on a 5×5 map. Most tiles wins.',
  emoji: '👑',
  accent: 'var(--gold)',
  modes: ['solo', 'turn'],
  category: 'versus',
  restart: 'game',
  daily: false,
  howTo: [
    'First claim anywhere; after that, only tiles touching yours.',
    'Claim a tile that already touches two of yours for a bonus turn.',
    'When the board fills, most tiles wins the crown.',
  ],
  rules: 'Claim adjacent empty tiles. Touch 2+ of yours = bonus turn.',
  createInitialState: createCrownState,
  SoloView,
  TurnView,
  isFinished: (s) => s.over,
  getScoresFromState: scoresFromState,
};
