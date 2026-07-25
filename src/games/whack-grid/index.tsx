import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createRng, formatTime } from '../../lib/random';
import type { GameDefinition, RaceGameProps, SoloGameProps } from '../types';
import { GameHud, Rules, Stat } from '../../ui/GameChrome';
import './WhackGrid.css';

const GRID = 9;
const DURATION = 30_000;
const COLORS = ['#e52521', '#049cd8', '#43b047', '#f5c518', '#9b59b6'];

export type WhackState = {
  seed: number;
  score: number;
  hits: number;
  misses: number;
  active: number | null;
  activeColor: string;
  startedAt: number | null;
  endsAt: number;
  finishedAt: number | null;
};

export function createWhackState(seed: number): WhackState {
  return {
    seed,
    score: 0,
    hits: 0,
    misses: 0,
    active: null,
    activeColor: COLORS[0],
    startedAt: null,
    endsAt: 0,
    finishedAt: null,
  };
}

/** 0 = easy … 1 = max intensity */
function difficultyLevel(startedAt: number | null, hits: number, now: number): number {
  if (!startedAt) return 0;
  const timeFrac = Math.min(1, (now - startedAt) / DURATION);
  const hitFrac = Math.min(1, hits / 28);
  return Math.min(1, timeFrac * 0.75 + hitFrac * 0.35);
}

function timingsFor(level: number, rng: () => number) {
  const spawnDelay = Math.round(480 - level * 340 + rng() * (80 - level * 40));
  const visibleMs = Math.round(950 - level * 580 + rng() * (60 - level * 30));
  return {
    spawnDelay: Math.max(90, spawnDelay),
    visibleMs: Math.max(280, visibleMs),
  };
}

function useWhack(
  initial: WhackState,
  onFinish: (score: number, hits: number) => void,
  onProgress?: (score: number, hits: number) => void,
) {
  const [state, setState] = useState(initial);
  const done = useRef(false);
  const rng = useRef(createRng(initial.seed));
  const spawnTimer = useRef<number | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    setState(initial);
    done.current = false;
    rng.current = createRng(initial.seed);
    if (spawnTimer.current) clearTimeout(spawnTimer.current);
  }, [initial]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, []);

  useEffect(
    () => () => {
      if (spawnTimer.current) clearTimeout(spawnTimer.current);
    },
    [],
  );

  const finish = (s: WhackState) => {
    if (done.current) return;
    done.current = true;
    if (spawnTimer.current) clearTimeout(spawnTimer.current);
    queueMicrotask(() => onFinish(s.score, s.hits));
  };

  useEffect(() => {
    if (!state.startedAt || state.finishedAt || done.current) return;
    if (now >= state.endsAt) {
      setState((s) => {
        const next = { ...s, finishedAt: s.endsAt, active: null };
        finish(next);
        return next;
      });
    }
  }, [now, state.startedAt, state.endsAt, state.finishedAt]);

  const scheduleNextFrom = (snapshot: WhackState) => {
    if (spawnTimer.current) clearTimeout(spawnTimer.current);
    const level = difficultyLevel(snapshot.startedAt, snapshot.hits, Date.now());
    const { spawnDelay } = timingsFor(level, rng.current);

    spawnTimer.current = window.setTimeout(() => {
      setState((s) => {
        if (s.finishedAt || done.current) return s;
        const liveLevel = difficultyLevel(s.startedAt, s.hits, Date.now());
        const live = timingsFor(liveLevel, rng.current);

        let score = s.score;
        let misses = s.misses;
        if (s.active !== null) {
          misses += 1;
          score = Math.max(0, score - 1);
        }
        let nextIdx = Math.floor(rng.current() * GRID);
        if (nextIdx === s.active) nextIdx = (nextIdx + 1) % GRID;
        const color = COLORS[Math.floor(rng.current() * COLORS.length)];
        const next = {
          ...s,
          score,
          misses,
          active: nextIdx,
          activeColor: color,
        };

        spawnTimer.current = window.setTimeout(() => {
          setState((cur) => {
            if (cur.finishedAt || cur.active !== nextIdx) return cur;
            const missed = {
              ...cur,
              active: null,
              misses: cur.misses + 1,
              score: Math.max(0, cur.score - 1),
            };
            onProgress?.(missed.score, missed.hits);
            scheduleNextFrom(missed);
            return missed;
          });
        }, live.visibleMs);

        return next;
      });
    }, spawnDelay);
  };

  const startOrTap = (index: number) => {
    if (done.current || state.finishedAt) return;

    if (!state.startedAt) {
      const startedAt = Date.now();
      const next = {
        ...state,
        startedAt,
        endsAt: startedAt + DURATION,
      };
      setState(next);
      scheduleNextFrom(next);
      return;
    }

    setState((s) => {
      if (s.finishedAt || s.active === null) return s;
      if (index !== s.active) {
        const next = {
          ...s,
          misses: s.misses + 1,
          score: Math.max(0, s.score - 1),
        };
        onProgress?.(next.score, next.hits);
        return next;
      }
      if (spawnTimer.current) clearTimeout(spawnTimer.current);
      const next = {
        ...s,
        hits: s.hits + 1,
        score: s.score + 2,
        active: null,
      };
      onProgress?.(next.score, next.hits);
      scheduleNextFrom(next);
      return next;
    });
  };

  const remaining = state.startedAt
    ? Math.max(0, (state.finishedAt ?? state.endsAt) - now)
    : DURATION;

  const level = difficultyLevel(state.startedAt, state.hits, now);
  const heat = Math.round(1 + level * 9);

  return { state, remaining, heat, tap: startOrTap };
}

function Board({
  state,
  remaining,
  heat,
  onTap,
  footer,
}: {
  state: WhackState;
  remaining: number;
  heat: number;
  onTap: (i: number) => void;
  footer?: ReactNode;
}) {
  return (
    <div>
      <GameHud>
        <Stat>Score: {state.score}</Stat>
        <Stat>Heat: {heat}/10</Stat>
        <Stat>{formatTime(remaining)}</Stat>
      </GameHud>
      <Rules text="Tap glowing blocks before they vanish — gets faster the longer you last!" />
      {!state.startedAt ? (
        <button type="button" className="whack-start" onClick={() => onTap(0)}>
          Tap to start!
        </button>
      ) : null}
      <div className="whack-grid">
        {Array.from({ length: GRID }, (_, i) => {
          const on = state.active === i;
          return (
            <button
              key={i}
              type="button"
              className={`whack-cell ${on ? 'on' : ''}`}
              style={on ? { background: state.activeColor } : undefined}
              disabled={state.finishedAt !== null}
              onClick={() => onTap(i)}
              aria-label={on ? 'Hit target' : 'Empty'}
            />
          );
        })}
      </div>
      {footer}
    </div>
  );
}

function SoloView({ initialState, onFinish }: SoloGameProps<WhackState>) {
  const { state, remaining, heat, tap } = useWhack(initialState, (score, hits) =>
    onFinish({ score: { primary: score, label: `${score} pts · ${hits} hits` } }),
  );
  return <Board state={state} remaining={remaining} heat={heat} onTap={tap} />;
}

function RaceView(props: RaceGameProps<WhackState>) {
  const { state, remaining, heat, tap } = useWhack(
    props.initialState,
    (score, hits) => {
      const s = { primary: score, label: `${score} pts · ${hits}h`, progress: 1 };
      props.onLocalScore(s);
      props.onFinish({ score: s });
    },
    (score, hits) => {
      props.onLocalScore({
        primary: score,
        label: `${score} pts · ${hits}h`,
        progress: Math.min(0.95, hits / 25),
      });
    },
  );
  return <Board state={state} remaining={remaining} heat={heat} onTap={tap} />;
}

export const whackGridGame: GameDefinition<WhackState> = {
  id: 'whack-grid',
  title: 'Whack Grid',
  blurb: 'Smash glowing blocks before they vanish.',
  emoji: '🔨',
  accent: 'var(--red)',
  modes: ['solo', 'race'],
  rules: 'Tap fast — heat rises and targets get quicker!',
  createInitialState: (seed) => createWhackState(seed),
  SoloView,
  RaceView,
};
