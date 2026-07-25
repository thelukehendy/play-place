import { useEffect, useRef, useState } from 'react';
import { createRng, formatTime } from '../../lib/random';
import type { GameDefinition, RaceGameProps, SoloGameProps } from '../types';
import { GameHud, Rules, Stat } from '../../ui/GameChrome';
import './LightsOut.css';

const SIZE = 5;

export type LightsState = {
  lights: boolean[];
  taps: number;
  startedAt: number | null;
  finishedAt: number | null;
};

function idx(r: number, c: number) {
  return r * SIZE + c;
}

function toggle(lights: boolean[], i: number) {
  const next = [...lights];
  const r = Math.floor(i / SIZE);
  const c = i % SIZE;
  const flip = (x: number) => {
    if (x >= 0 && x < next.length) next[x] = !next[x];
  };
  flip(i);
  if (r > 0) flip(idx(r - 1, c));
  if (r < SIZE - 1) flip(idx(r + 1, c));
  if (c > 0) flip(idx(r, c - 1));
  if (c < SIZE - 1) flip(idx(r, c + 1));
  return next;
}

export function createLightsState(seed: number): LightsState {
  const rng = createRng(seed);
  let lights = Array.from({ length: SIZE * SIZE }, () => false);
  // Generate solvable puzzle by applying random taps to solved board
  for (let i = 0; i < SIZE * SIZE; i++) {
    if (rng() < 0.45) lights = toggle(lights, i);
  }
  if (lights.every((x) => !x)) lights = toggle(lights, 0);
  return { lights, taps: 0, startedAt: null, finishedAt: null };
}

function litCount(lights: boolean[]) {
  return lights.filter(Boolean).length;
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

function useLights(
  initial: LightsState,
  onFinish: (taps: number, ms: number) => void,
  onProgress?: (lit: number, taps: number) => void,
) {
  const [state, setState] = useState(initial);
  const done = useRef(false);
  useEffect(() => {
    setState(initial);
    done.current = false;
  }, [initial]);
  const elapsed = useElapsed(state.startedAt, state.finishedAt);

  const tap = (i: number) => {
    if (done.current || state.finishedAt) return;
    setState((s) => {
      const startedAt = s.startedAt ?? Date.now();
      const lights = toggle(s.lights, i);
      const taps = s.taps + 1;
      const won = lights.every((x) => !x);
      const finishedAt = won ? Date.now() : null;
      if (won && !done.current) {
        done.current = true;
        queueMicrotask(() => onFinish(taps, (finishedAt ?? Date.now()) - startedAt));
      } else if (onProgress) {
        queueMicrotask(() => onProgress(litCount(lights), taps));
      }
      return { lights, taps, startedAt, finishedAt };
    });
  };

  return { state, elapsed, tap };
}

function Board({
  state,
  elapsed,
  onTap,
  footer,
}: {
  state: LightsState;
  elapsed: number;
  onTap: (i: number) => void;
  footer?: React.ReactNode;
}) {
  return (
    <div>
      <GameHud>
        <Stat>Lit: {litCount(state.lights)}</Stat>
        <Stat>Taps: {state.taps}</Stat>
        <Stat>{formatTime(elapsed)}</Stat>
      </GameHud>
      <Rules text="Tap a light to flip it and its neighbors. Turn all off!" />
      <div className="lo-grid">
        {state.lights.map((on, i) => (
          <button
            key={i}
            type="button"
            className={`lo-cell ${on ? 'on' : ''}`}
            disabled={state.finishedAt !== null}
            onClick={() => onTap(i)}
            aria-label={on ? 'On' : 'Off'}
          />
        ))}
      </div>
      {footer}
    </div>
  );
}

function SoloView({ initialState, onFinish }: SoloGameProps<LightsState>) {
  const { state, elapsed, tap } = useLights(initialState, (taps, ms) =>
    onFinish({
      score: { primary: taps, label: `${taps} taps · ${formatTime(ms)}`, lowerIsBetter: true },
    }),
  );
  return <Board state={state} elapsed={elapsed} onTap={tap} />;
}

function RaceView(props: RaceGameProps<LightsState>) {
  const total = SIZE * SIZE;
  const { state, elapsed, tap } = useLights(
    props.initialState,
    (taps, ms) => {
      const score = {
        primary: taps,
        label: `${taps}t · ${formatTime(ms)}`,
        lowerIsBetter: true as const,
        progress: 1,
      };
      props.onLocalScore(score);
      props.onFinish({ score });
    },
    (lit, taps) => {
      props.onLocalScore({
        primary: lit,
        label: `${lit} lit · ${taps}t`,
        lowerIsBetter: true,
        progress: 1 - lit / total,
      });
    },
  );
  return <Board state={state} elapsed={elapsed} onTap={tap} />;
}

export const lightsOutGame: GameDefinition<LightsState> = {
  id: 'lights-out',
  title: 'Lights Out',
  blurb: 'Flip lights until none remain.',
  emoji: '💡',
  accent: 'var(--gold)',
  modes: ['solo', 'race'],
  rules: 'Tap to flip a cell and its neighbors.',
  createInitialState: (seed) => createLightsState(seed),
  SoloView,
  RaceView,
};
