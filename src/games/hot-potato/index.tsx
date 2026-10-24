import { useEffect, useRef, useState } from 'react';
import { createRng, formatTime } from '../../lib/random';
import type { GameDefinition, RaceGameProps, SoloGameProps } from '../types';
import { GameHud, Rules, Stat } from '../../ui/GameChrome';
import { sfxBad, sfxGood } from '../../lib/sfx';
import './HotPotato.css';

const GRID = 16;
const LIVES = 3;
const DURATION = 45_000;

export type PotatoState = {
  seed: number;
  score: number;
  lives: number;
  hot: number;
  startedAt: number | null;
  endsAt: number;
  finishedAt: number | null;
  flashMiss: number | null;
};

export function createPotatoState(seed: number): PotatoState {
  const rng = createRng(seed);
  return {
    seed,
    score: 0,
    lives: LIVES,
    hot: Math.floor(rng() * GRID),
    startedAt: null,
    endsAt: 0,
    finishedAt: null,
    flashMiss: null,
  };
}

function hopMs(startedAt: number, now: number, score: number): number {
  const t = (now - startedAt) / 1000;
  const base = 1100 - Math.min(700, t * 12 + score * 18);
  return Math.max(320, base);
}

function usePotato(
  initial: PotatoState,
  onFinish: (score: number, lives: number) => void,
  onProgress?: (score: number, lives: number) => void,
) {
  const [state, setState] = useState(initial);
  const done = useRef(false);
  const rng = useRef(createRng(initial.seed ^ 0x51));
  const hopTimer = useRef<number | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    setState(initial);
    done.current = false;
    rng.current = createRng(initial.seed ^ 0x51);
    if (hopTimer.current) clearTimeout(hopTimer.current);
  }, [initial]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, []);

  useEffect(
    () => () => {
      if (hopTimer.current) clearTimeout(hopTimer.current);
    },
    [],
  );

  const finish = (s: PotatoState) => {
    if (done.current) return;
    done.current = true;
    if (hopTimer.current) clearTimeout(hopTimer.current);
    queueMicrotask(() => onFinish(s.score, s.lives));
  };

  const scheduleHop = (snapshot: PotatoState) => {
    if (hopTimer.current) clearTimeout(hopTimer.current);
    if (!snapshot.startedAt || snapshot.finishedAt) return;
    const delay = hopMs(snapshot.startedAt, Date.now(), snapshot.score);
    hopTimer.current = window.setTimeout(() => {
      setState((s) => {
        if (s.finishedAt || done.current) return s;
        // Missed the potato — it hopped away
        const lives = s.lives - 1;
        const nextHot = (s.hot + 1 + Math.floor(rng.current() * (GRID - 1))) % GRID;
        sfxBad();
        const next: PotatoState = {
          ...s,
          lives,
          hot: nextHot,
          flashMiss: s.hot,
          finishedAt: lives <= 0 ? Date.now() : null,
        };
        onProgress?.(next.score, next.lives);
        if (next.finishedAt) finish(next);
        else scheduleHop(next);
        window.setTimeout(() => {
          setState((cur) => (cur.flashMiss === s.hot ? { ...cur, flashMiss: null } : cur));
        }, 180);
        return next;
      });
    }, delay);
  };

  useEffect(() => {
    if (!state.startedAt || state.finishedAt || done.current) return;
    if (now >= state.endsAt) {
      setState((s) => {
        const next = { ...s, finishedAt: s.endsAt };
        finish(next);
        return next;
      });
    }
  }, [now, state.startedAt, state.endsAt, state.finishedAt]);

  const tap = (i: number) => {
    if (done.current) return;
    setState((s) => {
      if (s.finishedAt) return s;
      const startedAt = s.startedAt ?? Date.now();
      const endsAt = s.startedAt ? s.endsAt : startedAt + DURATION;
      const base = { ...s, startedAt, endsAt };

      if (i !== base.hot) {
        sfxBad();
        const lives = base.lives - 1;
        const next: PotatoState = {
          ...base,
          lives,
          flashMiss: i,
          finishedAt: lives <= 0 ? Date.now() : null,
        };
        onProgress?.(next.score, next.lives);
        if (next.finishedAt) finish(next);
        else {
          scheduleHop(next);
          window.setTimeout(() => {
            setState((cur) => (cur.flashMiss === i ? { ...cur, flashMiss: null } : cur));
          }, 180);
        }
        return next;
      }

      sfxGood();
      const score = base.score + 1;
      const nextHot = (base.hot + 1 + Math.floor(rng.current() * (GRID - 1))) % GRID;
      const next: PotatoState = { ...base, score, hot: nextHot, flashMiss: null };
      onProgress?.(next.score, next.lives);
      scheduleHop(next);
      return next;
    });
  };

  // Auto-start so the potato hops without waiting for a first tap
  useEffect(() => {
    if (state.startedAt || state.finishedAt || done.current) return;
    const startedAt = Date.now();
    const next = { ...state, startedAt, endsAt: startedAt + DURATION };
    setState(next);
    scheduleHop(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);

  const left = state.startedAt ? Math.max(0, (state.finishedAt ?? state.endsAt) - now) : DURATION;

  return { state, left, tap };
}

function Board({
  state,
  left,
  onTap,
}: {
  state: PotatoState;
  left: number;
  onTap: (i: number) => void;
}) {
  const over = !!state.finishedAt;
  return (
    <div className="hp-wrap">
      <GameHud>
        <Stat>Hits: {state.score}</Stat>
        <Stat>Lives: {'❤'.repeat(Math.max(0, state.lives)) || '—'}</Stat>
        <Stat>{formatTime(left)}</Stat>
      </GameHud>
      <Rules text="Tap the glowing potato before it hops. Wrong tap or timeout costs a life." />
      <div className="hp-grid" data-sfx="off">
        {Array.from({ length: GRID }, (_, i) => (
          <button
            key={i}
            type="button"
            className={`hp-cell ${state.hot === i && !over ? 'hot' : ''} ${
              state.flashMiss === i ? 'miss' : ''
            }`}
            disabled={over}
            aria-label={state.hot === i ? 'Hot potato' : `Cell ${i + 1}`}
            onClick={() => onTap(i)}
          >
            {state.hot === i && !over ? '🔥' : ''}
          </button>
        ))}
      </div>
      {over ? (
        <p className="hp-over">
          {state.lives <= 0 ? 'Burned out!' : 'Time!'} {state.score} hits
        </p>
      ) : null}
    </div>
  );
}

function SoloView({ initialState, onFinish }: SoloGameProps<PotatoState>) {
  const { state, left, tap } = usePotato(initialState, (score) =>
    onFinish({ score: { primary: score, label: `${score} hits` } }),
  );
  return <Board state={state} left={left} onTap={tap} />;
}

function RaceView(props: RaceGameProps<PotatoState>) {
  const { state, left, tap } = usePotato(
    props.initialState,
    (score) => {
      const payload = { primary: score, label: `${score}`, progress: 1 };
      props.onLocalScore(payload);
      props.onFinish({ score: payload });
    },
    (score, lives) => {
      props.onLocalScore({
        primary: score,
        label: `${score} · ${lives}❤`,
        progress: Math.min(1, score / 25),
      });
    },
  );
  return <Board state={state} left={left} onTap={tap} />;
}

export const hotPotatoGame: GameDefinition<PotatoState> = {
  id: 'hot-potato',
  title: 'Hot Potato',
  blurb: 'Tap the glowing cell before it hops away.',
  emoji: '🔥',
  accent: 'var(--gold)',
  modes: ['solo', 'race'],
  category: 'reflex',
  restart: 'game',
  daily: false,
  howTo: [
    'A glowing potato hops around the 4×4 grid.',
    'Tap it before it jumps — wrong taps or timeouts cost a life.',
    'Most hits in 45 seconds (or before 3 misses) wins.',
  ],
  rules: 'Tap the hot cell before it hops. 3 lives · 45 seconds.',
  createInitialState: (seed) => createPotatoState(seed),
  SoloView,
  RaceView,
};
