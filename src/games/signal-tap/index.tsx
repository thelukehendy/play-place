import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createRng, formatTime } from '../../lib/random';
import type { GameDefinition, RaceGameProps, SoloGameProps } from '../types';
import { GameHud, Rules, Stat } from '../../ui/GameChrome';
import './SignalTap.css';

const ROUNDS = 5;

export type SignalState = {
  seed: number;
  round: number;
  score: number; // lower ms total is better — we store points = speed score
  falseStarts: number;
  phase: 'wait' | 'go' | 'result' | 'done';
  waitUntil: number;
  goAt: number | null;
  roundMs: number[];
  startedAt: number | null;
  finishedAt: number | null;
};

export function createSignalState(seed: number): SignalState {
  return {
    seed,
    round: 0,
    score: 0,
    falseStarts: 0,
    phase: 'wait',
    waitUntil: 0,
    goAt: null,
    roundMs: [],
    startedAt: null,
    finishedAt: null,
  };
}

function useSignal(
  initial: SignalState,
  onFinish: (score: number, avgMs: number) => void,
  onProgress?: (score: number, round: number) => void,
) {
  const [state, setState] = useState(initial);
  const done = useRef(false);
  const rng = useRef(createRng(initial.seed));
  const waitTimer = useRef<number | null>(null);

  useEffect(() => {
    setState(initial);
    done.current = false;
    rng.current = createRng(initial.seed);
    if (waitTimer.current) clearTimeout(waitTimer.current);
  }, [initial]);

  useEffect(
    () => () => {
      if (waitTimer.current) clearTimeout(waitTimer.current);
    },
    [],
  );

  const armRound = (s: SignalState, startedAt: number) => {
    if (waitTimer.current) clearTimeout(waitTimer.current);
    const delay = 900 + Math.floor(rng.current() * 2200);
    const waitUntil = Date.now() + delay;
    waitTimer.current = window.setTimeout(() => {
      setState((cur) => {
        if (cur.finishedAt || cur.phase === 'done') return cur;
        return { ...cur, phase: 'go', goAt: Date.now() };
      });
    }, delay);
    return { ...s, phase: 'wait' as const, waitUntil, goAt: null, startedAt };
  };

  useEffect(() => {
    if (state.startedAt || state.finishedAt || done.current) return;
    setState((s) => armRound({ ...s, startedAt: Date.now() }, Date.now()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tap = () => {
    if (done.current || state.finishedAt) return;
    setState((s) => {
      if (s.phase === 'wait') {
        return { ...s, falseStarts: s.falseStarts + 1, score: Math.max(0, s.score - 5) };
      }
      if (s.phase !== 'go' || !s.goAt) return s;
      const ms = Date.now() - s.goAt;
      const gained = Math.max(1, 40 - Math.floor(ms / 25));
      const roundMs = [...s.roundMs, ms];
      const score = s.score + gained;
      const round = s.round + 1;
      onProgress?.(score, round);
      if (round >= ROUNDS) {
        done.current = true;
        const avg = Math.round(roundMs.reduce((a, b) => a + b, 0) / roundMs.length);
        const finished = {
          ...s,
          score,
          round,
          roundMs,
          phase: 'done' as const,
          finishedAt: Date.now(),
        };
        queueMicrotask(() => onFinish(score, avg));
        return finished;
      }
      return armRound({ ...s, score, round, roundMs, phase: 'wait' }, s.startedAt ?? Date.now());
    });
  };

  return { state, tap };
}

function View({
  initialState,
  onFinish,
  onProgress,
  footer,
}: {
  initialState: SignalState;
  onFinish: (score: number, avgMs: number) => void;
  onProgress?: (score: number, round: number) => void;
  footer?: ReactNode;
}) {
  const { state, tap } = useSignal(initialState, onFinish, onProgress);
  const elapsed =
    state.startedAt && !state.finishedAt
      ? Date.now() - state.startedAt
      : state.startedAt && state.finishedAt
        ? state.finishedAt - state.startedAt
        : 0;

  return (
    <div>
      <GameHud>
        <Stat>Score {state.score}</Stat>
        <Stat>
          Round {Math.min(state.round + 1, ROUNDS)}/{ROUNDS}
        </Stat>
        <Stat>{formatTime(elapsed)}</Stat>
      </GameHud>
      <Rules text="Wait for GREEN, then tap fast. Early taps cost points." />
      <button
        type="button"
        className={`signal-pad signal-${state.phase}`}
        onClick={tap}
        disabled={state.phase === 'done'}
      >
        {state.phase === 'wait' && 'Wait…'}
        {state.phase === 'go' && 'GO!'}
        {state.phase === 'done' && 'Done!'}
        {state.phase === 'result' && '…'}
      </button>
      <p className="signal-meta">
        False starts: {state.falseStarts}
        {state.roundMs.length
          ? ` · Last ${state.roundMs[state.roundMs.length - 1]}ms`
          : ''}
      </p>
      {footer}
    </div>
  );
}

function SoloView({ initialState, onFinish }: SoloGameProps<SignalState>) {
  return (
    <View
      initialState={initialState}
      onFinish={(score, avg) =>
        onFinish({ score: { primary: score, label: `${score} pts · avg ${avg}ms` } })
      }
    />
  );
}

function RaceView({
  initialState,
  onFinish,
  onLocalScore,
}: RaceGameProps<SignalState>) {
  return (
    <View
      initialState={initialState}
      onProgress={(score, round) =>
        onLocalScore({
          primary: score,
          label: `R${round}/${ROUNDS}`,
          progress: round / ROUNDS,
        })
      }
      onFinish={(score, avg) =>
        onFinish({
          score: { primary: score, label: `${score} pts · avg ${avg}ms`, progress: 1 },
        })
      }
    />
  );
}

export const signalTapGame: GameDefinition<SignalState> = {
  id: 'signal-tap',
  title: 'Signal Tap',
  blurb: 'Green means go — fastest taps win.',
  emoji: '🚦',
  accent: 'var(--green)',
  modes: ['solo', 'race'],
  rules: 'Wait for green, then tap. False starts lose points. Best total wins.',
  createInitialState: (seed) => createSignalState(seed),
  SoloView,
  RaceView,
};
