import { useEffect, useState } from 'react';
import type {
  GameDefinition,
  PlayerInfo,
  ScoreValue,
  SoloGameProps,
  TurnGameProps,
} from '../types';
import { GameHud, Rules, Stat } from '../../ui/GameChrome';
import './DotsBoxes.css';

const GRID = 3; // 3x3 boxes => 4x4 dots
const MAX_PLAYERS = 4;

export type DotsState = {
  /** 0 = empty, 1..4 = player owner */
  h: number[];
  v: number[];
  boxes: number[];
  turn: number;
  playerCount: number;
  over: boolean;
};

function hCount() {
  return (GRID + 1) * GRID;
}
function vCount() {
  return GRID * (GRID + 1);
}
function boxCount() {
  return GRID * GRID;
}

export function createDotsState(_seed: number, players: PlayerInfo[]): DotsState {
  const human = Math.min(MAX_PLAYERS, Math.max(1, players.length));
  // Solo (1 human) always includes a CPU seat.
  const playerCount = human === 1 ? 2 : human;
  return {
    h: Array(hCount()).fill(0),
    v: Array(vCount()).fill(0),
    boxes: Array(boxCount()).fill(0),
    turn: 0,
    playerCount,
    over: false,
  };
}

function claimBoxes(
  h: number[],
  v: number[],
  boxes: number[],
  owner: number,
): { boxes: number[]; gained: number } {
  const next = [...boxes];
  let gained = 0;
  for (let r = 0; r < GRID; r++) {
    for (let c = 0; c < GRID; c++) {
      const bi = r * GRID + c;
      if (next[bi]) continue;
      const top = h[r * GRID + c];
      const bottom = h[(r + 1) * GRID + c];
      const left = v[r * (GRID + 1) + c];
      const right = v[r * (GRID + 1) + c + 1];
      if (top && bottom && left && right) {
        next[bi] = owner;
        gained++;
      }
    }
  }
  return { boxes: next, gained };
}

function applyEdge(
  state: DotsState,
  kind: 'h' | 'v',
  index: number,
  owner: number,
): DotsState {
  if (state.over) return state;
  if (kind === 'h' && state.h[index]) return state;
  if (kind === 'v' && state.v[index]) return state;
  const h = [...state.h];
  const v = [...state.v];
  if (kind === 'h') h[index] = owner;
  else v[index] = owner;
  const { boxes, gained } = claimBoxes(h, v, state.boxes, owner);
  const filled = boxes.every((b) => b !== 0);
  const turn =
    gained > 0 ? state.turn : (state.turn + 1) % state.playerCount;
  return { ...state, h, v, boxes, turn, over: filled };
}

function scoreList(state: DotsState): number[] {
  const scores = Array.from({ length: state.playerCount }, () => 0);
  for (const x of state.boxes) {
    if (x >= 1 && x <= state.playerCount) scores[x - 1]++;
  }
  return scores;
}

function cpuMove(state: DotsState): DotsState {
  const owner = 2; // CPU is always seat 2 in solo
  for (let i = 0; i < state.h.length; i++) {
    if (state.h[i]) continue;
    const next = applyEdge(state, 'h', i, owner);
    if (scoreList(next)[1] > scoreList(state)[1]) return next;
  }
  for (let i = 0; i < state.v.length; i++) {
    if (state.v[i]) continue;
    const next = applyEdge(state, 'v', i, owner);
    if (scoreList(next)[1] > scoreList(state)[1]) return next;
  }
  const freeH = state.h.map((x, i) => (!x ? i : -1)).filter((i) => i >= 0);
  const freeV = state.v.map((x, i) => (!x ? i : -1)).filter((i) => i >= 0);
  if (freeV.length && (freeH.length === 0 || Math.random() < 0.5)) {
    return applyEdge(state, 'v', freeV[Math.floor(Math.random() * freeV.length)], owner);
  }
  if (freeH.length) {
    return applyEdge(state, 'h', freeH[Math.floor(Math.random() * freeH.length)], owner);
  }
  return state;
}

const OWNER_CLASS = ['', 'p1', 'p2', 'p3', 'p4'];

function Board({
  state,
  names,
  canPlay,
  onEdge,
}: {
  state: DotsState;
  names: string[];
  canPlay: boolean;
  onEdge: (kind: 'h' | 'v', index: number) => void;
}) {
  const scores = scoreList(state);
  const best = Math.max(...scores);
  const leaders = scores
    .map((s, i) => (s === best ? names[i] : null))
    .filter(Boolean) as string[];

  return (
    <div>
      <GameHud>
        {names.map((n, i) => (
          <Stat key={n + i}>
            {n}: {scores[i] ?? 0}
          </Stat>
        ))}
      </GameHud>
      <Rules text="Claim lines. Complete a box to go again. 1–4 players." />
      <p className="dab-turn">
        {state.over
          ? leaders.length > 1
            ? `Tie: ${leaders.join(', ')}`
            : `${leaders[0] ?? 'Someone'} wins!`
          : `Turn: ${names[state.turn] ?? `P${state.turn + 1}`}`}
      </p>
      <div className="dab-board">
        {Array.from({ length: GRID + 1 }, (_, r) => (
          <div key={`hr-${r}`}>
            <div className="dab-row">
              {Array.from({ length: GRID }, (_, c) => {
                const hi = r * GRID + c;
                const owner = state.h[hi];
                return (
                  <div key={`h-${hi}`} className="dab-row" style={{ flex: 1 }}>
                    <div className="dab-dot" />
                    <button
                      type="button"
                      className={`dab-h ${owner ? 'on' : ''} ${OWNER_CLASS[owner] ?? ''}`}
                      disabled={!canPlay || !!owner || state.over}
                      onClick={() => onEdge('h', hi)}
                      aria-label="Horizontal line"
                    />
                    {c === GRID - 1 ? <div className="dab-dot" /> : null}
                  </div>
                );
              })}
            </div>
            {r < GRID ? (
              <div className="dab-row">
                {Array.from({ length: GRID }, (_, c) => {
                  const vi = r * (GRID + 1) + c;
                  const owner = state.v[vi];
                  const box = state.boxes[r * GRID + c];
                  return (
                    <div key={`vr-${vi}`} className="dab-row" style={{ flex: 1 }}>
                      <button
                        type="button"
                        className={`dab-v ${owner ? 'on' : ''} ${OWNER_CLASS[owner] ?? ''}`}
                        disabled={!canPlay || !!owner || state.over}
                        onClick={() => onEdge('v', vi)}
                        aria-label="Vertical line"
                      />
                      <div className={`dab-box ${OWNER_CLASS[box] ?? ''}`}>
                        {box ? `P${box}` : ''}
                      </div>
                      {c === GRID - 1 ? (
                        <button
                          type="button"
                          className={`dab-v ${state.v[vi + 1] ? 'on' : ''} ${
                            OWNER_CLASS[state.v[vi + 1]] ?? ''
                          }`}
                          disabled={!canPlay || !!state.v[vi + 1] || state.over}
                          onClick={() => onEdge('v', vi + 1)}
                          aria-label="Vertical line"
                        />
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function SoloView({ initialState, player, onFinish, onStateChange }: SoloGameProps<DotsState>) {
  const [state, setState] = useState(initialState);

  useEffect(() => {
    setState(initialState);
  }, [initialState]);

  useEffect(() => {
    if (state.over || state.turn !== 1) return;
    const t = window.setTimeout(() => {
      setState((s) => {
        const next = cpuMove(s);
        onStateChange?.(next);
        if (next.over) {
          const scores = scoreList(next);
          queueMicrotask(() =>
            onFinish({
              score: {
                primary: scores[0],
                label:
                  scores[0] === scores[1]
                    ? `Tie ${scores[0]}-${scores[1]}`
                    : scores[0] > scores[1]
                      ? `You ${scores[0]}-${scores[1]}`
                      : `CPU ${scores[1]}-${scores[0]}`,
              },
            }),
          );
        }
        return next;
      });
    }, 400);
    return () => clearTimeout(t);
  }, [state, onFinish, onStateChange]);

  const play = (kind: 'h' | 'v', index: number) => {
    if (state.turn !== 0 || state.over) return;
    setState((s) => {
      const next = applyEdge(s, kind, index, 1);
      onStateChange?.(next);
      if (next.over) {
        const scores = scoreList(next);
        queueMicrotask(() =>
          onFinish({
            score: {
              primary: scores[0],
              label:
                scores[0] === scores[1]
                  ? `Tie ${scores[0]}-${scores[1]}`
                  : scores[0] > scores[1]
                    ? `You ${scores[0]}-${scores[1]}`
                    : `CPU ${scores[1]}-${scores[0]}`,
            },
          }),
        );
      }
      return next;
    });
  };

  return (
    <Board
      state={state}
      names={[player.name, 'CPU']}
      canPlay={state.turn === 0 && !state.over}
      onEdge={play}
    />
  );
}

function TurnView({
  state,
  player,
  players,
  onStateChange,
  onFinish,
}: TurnGameProps<DotsState>) {
  const seats = players.slice(0, MAX_PLAYERS);
  const meIndex = seats.findIndex((p) => p.id === player.id);
  const myOwner = meIndex + 1;
  const canPlay = !state.over && meIndex >= 0 && state.turn === meIndex;

  const play = (kind: 'h' | 'v', index: number) => {
    if (!canPlay) return;
    const next = applyEdge(state, kind, index, myOwner);
    onStateChange(next);
    if (next.over) {
      const scores = scoreList(next);
      const best = Math.max(...scores);
      const winners = scores
        .map((s, i) => (s === best ? seats[i]?.id : null))
        .filter(Boolean) as string[];
      onFinish({
        score: {
          primary: scores[meIndex] ?? 0,
          label: scores.join('-'),
        },
        winnerId: winners.length === 1 ? winners[0] : undefined,
      });
    }
  };

  return (
    <Board
      state={state}
      names={seats.map((p, i) => p.name || `P${i + 1}`)}
      canPlay={canPlay}
      onEdge={play}
    />
  );
}

export const dotsBoxesGame: GameDefinition<DotsState> = {
  id: 'dots-boxes',
  title: 'Dots & Boxes',
  blurb: 'Classic line-claiming for 1–4 players.',
  emoji: '⬜',
  accent: 'var(--sky)',
  modes: ['solo', 'turn'],
  rules: 'Take turns claiming lines. Box = extra turn. Supports up to 4 players.',
  createInitialState: createDotsState,
  SoloView,
  TurnView,
  isFinished: (s) => s.over,
  getScoresFromState: (s, players) => {
    const scores = scoreList(s);
    const filled = scores.reduce((a, b) => a + b, 0);
    const out: Record<string, ScoreValue> = {};
    players.slice(0, s.playerCount).forEach((p, i) => {
      out[p.id] = {
        primary: scores[i] ?? 0,
        label: `${scores[i] ?? 0} boxes`,
        progress: filled / 9,
      };
    });
    return out;
  },
};
