import { useEffect, useRef, useState } from 'react';
import { createRng, shuffle } from '../../lib/random';
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
import { sfxBad, sfxClaim } from '../../lib/sfx';
import './MemoryDuel.css';

const ICONS = ['⭐', '🍄', '🪙', '🌈', '⚡', '🔥', '🐢', '🎲'];
const MAX_PLAYERS = 4;
const MISMATCH_MS = 1100;

export type DuelState = {
  cards: string[];
  /** 0 = still hidden, 1..4 = seat that matched the pair */
  owner: number[];
  /** Currently face-up unmatched cards (0–2). */
  flipped: number[];
  turn: number;
  playerCount: number;
  over: boolean;
  seq: number;
};

export function createDuelState(seed: number, players: PlayerInfo[]): DuelState {
  const rng = createRng(seed);
  const cards = shuffle([...ICONS, ...ICONS], rng);
  const human = Math.min(MAX_PLAYERS, Math.max(1, players.length));
  return {
    cards,
    owner: cards.map(() => 0),
    flipped: [],
    turn: 0,
    playerCount: human === 1 ? 2 : human,
    over: false,
    seq: 0,
  };
}

function pairsBySeat(state: DuelState): number[] {
  const out = Array.from({ length: state.playerCount }, () => 0);
  for (const o of state.owner) if (o >= 1 && o <= state.playerCount) out[o - 1] += 0.5;
  return out;
}

export function flipCard(state: DuelState, i: number): DuelState {
  if (state.over || state.owner[i] || state.flipped.includes(i) || state.flipped.length >= 2) {
    return state;
  }
  const flipped = [...state.flipped, i];
  if (flipped.length === 1) return { ...state, flipped, seq: state.seq + 1 };
  const [a, b] = flipped;
  if (state.cards[a] === state.cards[b]) {
    const owner = [...state.owner];
    owner[a] = state.turn + 1;
    owner[b] = state.turn + 1;
    return {
      ...state,
      owner,
      flipped: [],
      over: owner.every(Boolean),
      seq: state.seq + 1,
    };
  }
  return { ...state, flipped, seq: state.seq + 1 };
}

/** Hide a mismatched pair and pass the turn. */
export function resolveMismatch(state: DuelState): DuelState {
  if (state.flipped.length !== 2) return state;
  return {
    ...state,
    flipped: [],
    turn: (state.turn + 1) % state.playerCount,
    seq: state.seq + 1,
  };
}

function isMismatch(s: DuelState) {
  return s.flipped.length === 2 && s.cards[s.flipped[0]] !== s.cards[s.flipped[1]];
}

function leaders(state: DuelState): number[] {
  const pairs = pairsBySeat(state);
  const best = Math.max(...pairs);
  return pairs.map((p, i) => (p === best ? i : -1)).filter((i) => i >= 0);
}

function Board({
  state,
  names,
  ids,
  meIndex,
  canPlay,
  onFlip,
}: {
  state: DuelState;
  names: string[];
  ids: (string | undefined)[];
  meIndex: number;
  canPlay: boolean;
  onFlip: (i: number) => void;
}) {
  const pairs = pairsBySeat(state);
  const myTurn = !state.over && meIndex >= 0 && state.turn === meIndex;
  const lead = leaders(state);
  const iWon = state.over && lead.length === 1 && lead[0] === meIndex;
  useYourTurnPing(myTurn, state.over);
  useOutcomeSound(state.over, iWon, meIndex >= 0);

  const text = state.over
    ? lead.length > 1
      ? `Tie: ${lead.map((i) => names[i]).join(', ')}`
      : `${names[lead[0]] ?? 'Someone'} wins!`
    : myTurn
      ? state.flipped.length === 1
        ? 'Pick a second card'
        : 'Your turn — flip a card'
      : `Waiting for ${names[state.turn] ?? 'player'}`;

  return (
    <div>
      <TurnRoster
        turn={state.turn}
        meIndex={meIndex}
        over={state.over}
        seats={names.map((name, i) => ({ name, id: ids[i], score: pairs[i] ?? 0 }))}
      />
      <TurnBanner over={state.over} myTurn={myTurn} turnIndex={state.turn} text={text} />
      <Rules text="Match a pair to score and go again. Most pairs wins." />
      <div className={`md-grid ${canPlay ? 'can-play' : ''}`} data-sfx="off">
        {state.cards.map((icon, i) => {
          const o = state.owner[i];
          const up = !!o || state.flipped.includes(i);
          const bad = up && !o && isMismatch(state);
          return (
            <button
              key={i}
              type="button"
              className={`md-card ${up ? 'up' : ''} ${o ? `owned seat-${o}` : ''} ${bad ? 'bad' : ''}`}
              disabled={!canPlay || up || state.flipped.length >= 2}
              aria-label={up ? `Card ${icon}` : 'Hidden card'}
              onClick={() => onFlip(i)}
            >
              <span className="md-face">{up ? icon : '?'}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Auto-hide mismatches. Any client may do it; non-turn clients wait a beat longer. */
function useMismatchResolver(
  state: DuelState,
  isTurnPlayer: boolean,
  apply: (next: DuelState) => void,
) {
  const applyRef = useRef(apply);
  applyRef.current = apply;
  useEffect(() => {
    if (state.over || !isMismatch(state)) return;
    const t = window.setTimeout(
      () => applyRef.current(resolveMismatch(state)),
      MISMATCH_MS + (isTurnPlayer ? 0 : 700),
    );
    return () => clearTimeout(t);
  }, [state, isTurnPlayer]);
}

/* ---------- Solo vs CPU ---------- */

function SoloView({ initialState, player, onFinish }: SoloGameProps<DuelState>) {
  const [state, setState] = useState(initialState);
  /** What the CPU "remembers": card index → icon. */
  const memory = useRef<Map<number, string>>(new Map());
  const finished = useRef(false);

  useEffect(() => {
    setState(initialState);
    memory.current = new Map();
    finished.current = false;
  }, [initialState]);

  useMismatchResolver(state, true, (next) => setState(next));

  useEffect(() => {
    if (!state.over || finished.current) return;
    finished.current = true;
    const [me, cpu] = pairsBySeat(state);
    window.setTimeout(
      () =>
        onFinish({
          score: {
            primary: me,
            label: me === cpu ? `Tie ${me}-${cpu}` : me > cpu ? `You ${me}-${cpu}` : `CPU ${cpu}-${me}`,
          },
        }),
      1000,
    );
  }, [state, onFinish]);

  // CPU brain
  useEffect(() => {
    if (state.over || state.turn !== 1 || isMismatch(state)) return;
    const t = window.setTimeout(() => {
      setState((s) => {
        if (s.over || s.turn !== 1 || isMismatch(s)) return s;
        const hidden = s.owner.map((o, i) => (o ? -1 : i)).filter((i) => i >= 0);
        let pick: number | undefined;
        if (s.flipped.length === 0) {
          const byIcon = new Map<string, number[]>();
          memory.current.forEach((icon, i) => {
            if (s.owner[i]) return;
            byIcon.set(icon, [...(byIcon.get(icon) ?? []), i]);
          });
          const known = [...byIcon.values()].find((arr) => arr.length >= 2);
          if (known && Math.random() < 0.75) pick = known[0];
          else {
            const unseen = hidden.filter((i) => !memory.current.has(i));
            const pool = unseen.length ? unseen : hidden;
            pick = pool[Math.floor(Math.random() * pool.length)];
          }
        } else {
          const first = s.flipped[0];
          const icon = s.cards[first];
          const match = [...memory.current.entries()].find(
            ([i, ic]) => ic === icon && i !== first && !s.owner[i],
          );
          if (match && Math.random() < 0.75) pick = match[0];
          else {
            const unseen = hidden.filter((i) => i !== first && !memory.current.has(i));
            const pool = unseen.length ? unseen : hidden.filter((i) => i !== first);
            pick = pool[Math.floor(Math.random() * pool.length)];
          }
        }
        if (pick === undefined) return s;
        memory.current.set(pick, s.cards[pick]);
        return flipCard(s, pick);
      });
    }, 750);
    return () => clearTimeout(t);
  }, [state]);

  const flip = (i: number) => {
    if (state.turn !== 0 || state.over || isMismatch(state)) return;
    const next = flipCard(state, i);
    if (next === state) return;
    memory.current.set(i, state.cards[i]);
    if (next.flipped.length === 0 && next.owner[i]) sfxClaim();
    else if (isMismatch(next)) sfxBad();
    setState(next);
  };

  return (
    <Board
      state={state}
      names={[player.name, 'CPU']}
      ids={[player.id, undefined]}
      meIndex={0}
      canPlay={state.turn === 0 && !state.over && !isMismatch(state)}
      onFlip={flip}
    />
  );
}

/* ---------- Multiplayer ---------- */

function TurnView({ state, player, players, onStateChange, onFinish }: TurnGameProps<DuelState>) {
  const seats = players.slice(0, MAX_PLAYERS);
  const meIndex = seats.findIndex((p) => p.id === player.id);
  const myTurn = !state.over && meIndex >= 0 && state.turn === meIndex;
  const canPlay = myTurn && !isMismatch(state);

  const finishIfOver = (next: DuelState) => {
    if (!next.over) return;
    const pairs = pairsBySeat(next);
    const best = Math.max(...pairs);
    const winners = pairs.map((p, i) => (p === best ? seats[i]?.id : null)).filter(Boolean) as string[];
    onFinish({
      score: { primary: pairs[meIndex] ?? 0, label: pairs.join('-') },
      winnerId: winners.length === 1 ? winners[0] : undefined,
    });
  };

  useMismatchResolver(state, myTurn, (next) => onStateChange(next));

  const flip = (i: number) => {
    if (!canPlay) return;
    const next = flipCard(state, i);
    if (next === state) return;
    if (next.flipped.length === 0 && next.owner[i]) sfxClaim();
    else if (isMismatch(next)) sfxBad();
    onStateChange(next);
    finishIfOver(next);
  };

  return (
    <Board
      state={state}
      names={seats.map((p, i) => p.name || `P${i + 1}`)}
      ids={seats.map((p) => p.id)}
      meIndex={meIndex}
      canPlay={canPlay}
      onFlip={flip}
    />
  );
}

export const memoryDuelGame: GameDefinition<DuelState> = {
  id: 'memory-duel',
  title: 'Memory Duel',
  blurb: 'Take turns flipping — steal the pairs.',
  emoji: '🧠',
  accent: 'var(--sky)',
  modes: ['solo', 'turn'],
  category: 'versus',
  restart: 'game',
  daily: false,
  howTo: [
    'On your turn, flip two cards.',
    'Match a pair to keep it and go again.',
    'No match? They flip back and the next player goes. Most pairs wins.',
  ],
  rules: 'Flip two cards per turn. Matches score and keep your turn.',
  createInitialState: createDuelState,
  SoloView,
  TurnView,
  isFinished: (s) => s.over,
  getScoresFromState: (s, players) => {
    const pairs = pairsBySeat(s);
    const done = pairs.reduce((a, b) => a + b, 0);
    const out: Record<string, ScoreValue> = {};
    players.slice(0, s.playerCount).forEach((p, i) => {
      out[p.id] = {
        primary: pairs[i] ?? 0,
        label: `${pairs[i] ?? 0} pairs`,
        progress: done / ICONS.length,
      };
    });
    return out;
  },
};
