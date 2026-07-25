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

export type DotsState = {
  h: (0 | 1 | 2)[];
  v: (0 | 1 | 2)[];
  boxes: (0 | 1 | 2)[];
  turn: 0 | 1;
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

export function createDotsState(_seed: number, _players: PlayerInfo[]): DotsState {
  return {
    h: Array(hCount()).fill(0),
    v: Array(vCount()).fill(0),
    boxes: Array(boxCount()).fill(0),
    turn: 0,
    over: false,
  };
}

function claimBoxes(
  h: (0 | 1 | 2)[],
  v: (0 | 1 | 2)[],
  boxes: (0 | 1 | 2)[],
  owner: 1 | 2,
): { boxes: (0 | 1 | 2)[]; gained: number } {
  const next = [...boxes] as (0 | 1 | 2)[];
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
  owner: 1 | 2,
): DotsState {
  if (state.over) return state;
  if (kind === 'h' && state.h[index]) return state;
  if (kind === 'v' && state.v[index]) return state;
  const h = [...state.h] as (0 | 1 | 2)[];
  const v = [...state.v] as (0 | 1 | 2)[];
  if (kind === 'h') h[index] = owner;
  else v[index] = owner;
  const { boxes, gained } = claimBoxes(h, v, state.boxes, owner);
  const filled = boxes.every((b) => b !== 0);
  const turn = gained > 0 ? state.turn : (((state.turn + 1) % 2) as 0 | 1);
  return { h, v, boxes, turn, over: filled };
}

function scores(state: DotsState): [number, number] {
  let a = 0;
  let b = 0;
  for (const x of state.boxes) {
    if (x === 1) a++;
    if (x === 2) b++;
  }
  return [a, b];
}

function cpuMove(state: DotsState): DotsState {
  const owner: 1 | 2 = 2;
  for (let i = 0; i < state.h.length; i++) {
    if (state.h[i]) continue;
    const next = applyEdge(state, 'h', i, owner);
    if (scores(next)[1] > scores(state)[1]) return next;
  }
  for (let i = 0; i < state.v.length; i++) {
    if (state.v[i]) continue;
    const next = applyEdge(state, 'v', i, owner);
    if (scores(next)[1] > scores(state)[1]) return next;
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

function Board({
  state,
  p1Name,
  p2Name,
  canPlay,
  onEdge,
}: {
  state: DotsState;
  p1Name: string;
  p2Name: string;
  canPlay: boolean;
  onEdge: (kind: 'h' | 'v', index: number) => void;
}) {
  const [s1, s2] = scores(state);
  return (
    <div>
      <GameHud>
        <Stat>
          {p1Name}: {s1}
        </Stat>
        <Stat>
          {p2Name}: {s2}
        </Stat>
      </GameHud>
      <Rules text="Claim lines. Complete a box to go again." />
      <p className="dab-turn">
        {state.over
          ? s1 === s2
            ? 'Tie!'
            : s1 > s2
              ? `${p1Name} wins!`
              : `${p2Name} wins!`
          : `Turn: ${state.turn === 0 ? p1Name : p2Name}`}
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
                      className={`dab-h ${owner ? 'on' : ''} ${owner === 1 ? 'p1' : ''} ${
                        owner === 2 ? 'p2' : ''
                      }`}
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
                        className={`dab-v ${owner ? 'on' : ''} ${owner === 1 ? 'p1' : ''} ${
                          owner === 2 ? 'p2' : ''
                        }`}
                        disabled={!canPlay || !!owner || state.over}
                        onClick={() => onEdge('v', vi)}
                        aria-label="Vertical line"
                      />
                      <div className={`dab-box ${box === 1 ? 'p1' : ''} ${box === 2 ? 'p2' : ''}`}>
                        {box === 1 ? 'P1' : box === 2 ? 'P2' : ''}
                      </div>
                      {c === GRID - 1 ? (
                        <button
                          type="button"
                          className={`dab-v ${state.v[vi + 1] ? 'on' : ''} ${
                            state.v[vi + 1] === 1 ? 'p1' : ''
                          } ${state.v[vi + 1] === 2 ? 'p2' : ''}`}
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
          const [a, b] = scores(next);
          queueMicrotask(() =>
            onFinish({
              score: {
                primary: a,
                label: a === b ? `Tie ${a}-${b}` : a > b ? `You ${a}-${b}` : `CPU ${b}-${a}`,
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
        const [a, b] = scores(next);
        queueMicrotask(() =>
          onFinish({
            score: {
              primary: a,
              label: a === b ? `Tie ${a}-${b}` : a > b ? `You ${a}-${b}` : `CPU ${b}-${a}`,
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
      p1Name={player.name}
      p2Name="CPU"
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
  const meIndex = players.findIndex((p) => p.id === player.id);
  const myOwner = (meIndex === 0 ? 1 : 2) as 1 | 2;
  const canPlay = !state.over && state.turn === meIndex;

  const play = (kind: 'h' | 'v', index: number) => {
    if (!canPlay) return;
    const next = applyEdge(state, kind, index, myOwner);
    onStateChange(next);
    if (next.over) {
      const [a, b] = scores(next);
      const winnerId = a === b ? undefined : a > b ? players[0]?.id : players[1]?.id;
      onFinish({
        score: {
          primary: meIndex === 0 ? a : b,
          label: `${a}-${b}`,
        },
        winnerId,
      });
    }
  };

  return (
    <Board
      state={state}
      p1Name={players[0]?.name ?? 'P1'}
      p2Name={players[1]?.name ?? 'P2'}
      canPlay={canPlay}
      onEdge={play}
    />
  );
}

export const dotsBoxesGame: GameDefinition<DotsState> = {
  id: 'dots-boxes',
  title: 'Dots & Boxes',
  blurb: 'Classic line-claiming duel.',
  emoji: '⬜',
  accent: 'var(--sky)',
  modes: ['solo', 'turn'],
  rules: 'Take turns claiming lines. Box = extra turn.',
  createInitialState: createDotsState,
  SoloView,
  TurnView,
  isFinished: (s) => s.over,
  getScoresFromState: (s, players) => {
    const [a, b] = scores(s);
    const filled = a + b;
    const out: Record<string, ScoreValue> = {};
    if (players[0])
      out[players[0].id] = {
        primary: a,
        label: `${a} boxes`,
        progress: filled / 9,
      };
    if (players[1])
      out[players[1].id] = {
        primary: b,
        label: `${b} boxes`,
        progress: filled / 9,
      };
    return out;
  },
};
