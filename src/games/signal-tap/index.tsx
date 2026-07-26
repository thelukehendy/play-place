import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createRng } from '../../lib/random';
import type { GameDefinition, RaceGameProps, SoloGameProps } from '../types';
import { GameHud, Rules, Stat } from '../../ui/GameChrome';
import './SignalTap.css';

const ROUNDS = 5;
/** Extra delay added to the total for each early tap. */
const FALSE_START_PENALTY_MS = 1000;

export type SignalState = {
  seed: number;
  round: number;
  /** Sum of reaction times (+ false-start penalties). Lower is better. */
  totalMs: number;
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
    totalMs: 0,
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
  onFinish: (totalMs: number) => void,
  onProgress?: (totalMs: number, round: number) => void,
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
        const totalMs = s.totalMs + FALSE_START_PENALTY_MS;
        onProgress?.(totalMs, s.round);
        return {
          ...s,
          falseStarts: s.falseStarts + 1,
          totalMs,
        };
      }
      if (s.phase !== 'go' || !s.goAt) return s;
      const ms = Date.now() - s.goAt;
      const roundMs = [...s.roundMs, ms];
      const totalMs = s.totalMs + ms;
      const round = s.round + 1;
      onProgress?.(totalMs, round);
      if (round >= ROUNDS) {
        done.current = true;
        const finished = {
          ...s,
          totalMs,
          round,
          roundMs,
          phase: 'done' as const,
          finishedAt: Date.now(),
        };
        queueMicrotask(() => onFinish(totalMs));
        return finished;
      }
      return armRound({ ...s, totalMs, round, roundMs, phase: 'wait' }, s.startedAt ?? Date.now());
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
  onFinish: (totalMs: number) => void;
  onProgress?: (totalMs: number, round: number) => void;
  footer?: ReactNode;
}) {
  const { state, tap } = useSignal(initialState, onFinish, onProgress);

  return (
    <div>
      <GameHud>
        <Stat>Delay {state.totalMs}ms</Stat>
        <Stat>
          Round {Math.min(state.round + 1, ROUNDS)}/{ROUNDS}
        </Stat>
      </GameHud>
      <Rules text="Wait for GREEN, then tap fast. Lowest total delay wins. Early taps add 1000ms." />
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
      onFinish={(totalMs) =>
        onFinish({
          score: {
            primary: totalMs,
            label: `${totalMs}ms`,
            lowerIsBetter: true,
          },
        })
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
      onProgress={(totalMs, round) =>
        onLocalScore({
          // Inflate unfinished rounds so live standings prefer more completed rounds,
          // then lower delay. Final score (on finish) is total ms only.
          primary: totalMs + (ROUNDS - round) * 10_000,
          label: `${totalMs}ms · R${round}/${ROUNDS}`,
          lowerIsBetter: true,
          progress: round / ROUNDS,
        })
      }
      onFinish={(totalMs) =>
        onFinish({
          score: {
            primary: totalMs,
            label: `${totalMs}ms`,
            lowerIsBetter: true,
            progress: 1,
          },
        })
      }
    />
  );
}

export const signalTapGame: GameDefinition<SignalState> = {
  id: 'signal-tap',
  title: 'Signal Tap',
  blurb: 'Green means go — lowest total delay wins.',
  emoji: '🚦',
  accent: 'var(--green)',
  modes: ['solo', 'race'],
  rules: 'Wait for green, then tap. Lowest total delay wins.',
  createInitialState: (seed) => createSignalState(seed),
  SoloView,
  RaceView,
};
