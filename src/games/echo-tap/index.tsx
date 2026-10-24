import { useEffect, useRef, useState } from 'react';
import { createRng } from '../../lib/random';
import type { GameDefinition, RaceGameProps, SoloGameProps } from '../types';
import { GameHud, Rules, Stat } from '../../ui/GameChrome';
import { sfxBad, sfxGood, sfxPop } from '../../lib/sfx';
import './EchoTap.css';

const PADS = 4;
const TARGET_ROUNDS = 8;

export type EchoState = {
  seed: number;
  round: number;
  lives: number;
  /** Built from seed — full song of pad indices */
  sequence: number[];
  phase: 'idle' | 'listen' | 'input' | 'over';
  inputIndex: number;
  lit: number | null;
};

function buildSequence(seed: number, len: number): number[] {
  const rng = createRng(seed);
  const out: number[] = [];
  for (let i = 0; i < len; i++) out.push(Math.floor(rng() * PADS));
  return out;
}

export function createEchoState(seed: number): EchoState {
  return {
    seed,
    round: 0,
    lives: 3,
    sequence: buildSequence(seed, TARGET_ROUNDS + 4),
    phase: 'idle',
    inputIndex: 0,
    lit: null,
  };
}

function beatMs(round: number): number {
  return Math.max(220, 520 - round * 35);
}

function useEcho(
  initial: EchoState,
  onFinish: (round: number) => void,
  onProgress?: (round: number) => void,
) {
  const [state, setState] = useState(initial);
  const done = useRef(false);
  const playGen = useRef(0);

  useEffect(() => {
    setState(initial);
    done.current = false;
    playGen.current += 1;
  }, [initial]);

  const finish = (round: number) => {
    if (done.current) return;
    done.current = true;
    queueMicrotask(() => onFinish(round));
  };

  const playSequence = (round: number, sequence: number[]) => {
    const gen = ++playGen.current;
    const len = Math.min(3 + round, sequence.length);
    const ms = beatMs(round);
    setState((s) => ({ ...s, phase: 'listen', inputIndex: 0, lit: null, round }));

    let step = 0;
    const tick = () => {
      if (gen !== playGen.current) return;
      if (step >= len) {
        setState((s) => ({ ...s, phase: 'input', lit: null, inputIndex: 0 }));
        return;
      }
      const pad = sequence[step];
      setState((s) => ({ ...s, lit: pad }));
      sfxPop();
      window.setTimeout(() => {
        if (gen !== playGen.current) return;
        setState((s) => ({ ...s, lit: null }));
        step += 1;
        window.setTimeout(tick, ms * 0.35);
      }, ms);
    };
    window.setTimeout(tick, 350);
  };

  useEffect(() => {
    if (state.phase === 'idle' && !done.current) {
      playSequence(0, state.sequence);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase === 'idle', initial]);

  const tap = (pad: number) => {
    if (done.current) return;
    setState((s) => {
      if (s.phase !== 'input') return s;
      const need = s.sequence[s.inputIndex];
      const len = Math.min(3 + s.round, s.sequence.length);
      if (pad !== need) {
        sfxBad();
        const lives = s.lives - 1;
        if (lives <= 0) {
          finish(s.round);
          return { ...s, lives: 0, phase: 'over', lit: pad };
        }
        // Replay same round
        queueMicrotask(() => playSequence(s.round, s.sequence));
        return { ...s, lives, phase: 'listen', inputIndex: 0, lit: null };
      }
      sfxGood();
      const nextIdx = s.inputIndex + 1;
      if (nextIdx >= len) {
        const nextRound = s.round + 1;
        onProgress?.(nextRound);
        if (nextRound >= TARGET_ROUNDS) {
          finish(nextRound);
          return { ...s, round: nextRound, phase: 'over', inputIndex: nextIdx, lit: pad };
        }
        queueMicrotask(() => playSequence(nextRound, s.sequence));
        return { ...s, round: nextRound, phase: 'listen', inputIndex: 0, lit: pad };
      }
      return { ...s, inputIndex: nextIdx, lit: pad };
    });
    window.setTimeout(() => {
      setState((s) => (s.phase === 'input' ? { ...s, lit: null } : s));
    }, 120);
  };

  return { state, tap };
}

function Board({ state, onTap }: { state: EchoState; onTap: (i: number) => void }) {
  const status =
    state.phase === 'over'
      ? state.lives <= 0
        ? `Out! Round ${state.round}`
        : `Cleared ${state.round} rounds!`
      : state.phase === 'listen'
        ? 'Listen…'
        : state.phase === 'input'
          ? 'Your turn — copy it!'
          : 'Get ready…';

  return (
    <div className="et-wrap">
      <GameHud>
        <Stat>
          Round: {Math.min(state.round + 1, TARGET_ROUNDS)}/{TARGET_ROUNDS}
        </Stat>
        <Stat>Lives: {'❤'.repeat(Math.max(0, state.lives)) || '—'}</Stat>
      </GameHud>
      <Rules text="Watch the pads light up, then tap the same order. Speed rises each round." />
      <div className="et-pads" data-sfx="off">
        {Array.from({ length: PADS }, (_, i) => (
          <button
            key={i}
            type="button"
            className={`et-pad ${state.lit === i ? 'lit' : ''}`}
            disabled={state.phase !== 'input'}
            aria-label={`Pad ${i + 1}`}
            onClick={() => onTap(i)}
          >
            {i + 1}
          </button>
        ))}
      </div>
      <p
        className={`et-status ${
          state.phase === 'listen' ? 'listen' : state.phase === 'input' ? 'go' : ''
        }`}
      >
        {status}
      </p>
    </div>
  );
}

function SoloView({ initialState, onFinish }: SoloGameProps<EchoState>) {
  const { state, tap } = useEcho(initialState, (round) =>
    onFinish({
      score: { primary: round, label: `${round} rounds` },
      detail: round >= TARGET_ROUNDS ? 'Perfect echo!' : 'Missed a note',
    }),
  );
  return <Board state={state} onTap={tap} />;
}

function RaceView(props: RaceGameProps<EchoState>) {
  const { state, tap } = useEcho(
    props.initialState,
    (round) => {
      const payload = {
        primary: round,
        label: `${round}r`,
        progress: 1,
      };
      props.onLocalScore(payload);
      props.onFinish({ score: payload });
    },
    (round) => {
      props.onLocalScore({
        primary: round,
        label: `${round}/${TARGET_ROUNDS}`,
        progress: Math.min(1, round / TARGET_ROUNDS),
      });
    },
  );
  return <Board state={state} onTap={tap} />;
}

export const echoTapGame: GameDefinition<EchoState> = {
  id: 'echo-tap',
  title: 'Echo Tap',
  blurb: 'Copy the glowing pad rhythm. Don’t miss a beat.',
  emoji: '🎵',
  accent: 'var(--sky)',
  modes: ['solo', 'race'],
  category: 'reflex',
  restart: 'game',
  daily: false,
  howTo: [
    'Watch the pads light in order.',
    'Tap the same sequence back.',
    'Survive 8 rounds as it speeds up — most rounds wins.',
  ],
  rules: 'Copy the sequence. 3 lives. 8 rounds to clear.',
  createInitialState: (seed) => createEchoState(seed),
  SoloView,
  RaceView,
};
