import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createRng } from '../../lib/random';
import type { GameDefinition, RaceGameProps, SoloGameProps } from '../types';
import { GameHud, Rules, Stat } from '../../ui/GameChrome';
import './WhackGrid.css';

const GRID = 9;
const COLORS = ['#e52521', '#049cd8', '#43b047', '#f5c518', '#9b59b6'];

export type WhackState = {
  seed: number;
  hits: number;
  active: number | null;
  activeColor: string;
  startedAt: number | null;
  finishedAt: number | null;
};

export function createWhackState(seed: number): WhackState {
  return {
    seed,
    hits: 0,
    active: null,
    activeColor: COLORS[0],
    startedAt: null,
    finishedAt: null,
  };
}

/** 0 = easy … 1 = max intensity — ramps with consecutive hits */
function difficultyLevel(hits: number): number {
  return Math.min(1, hits / 28);
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
  onFinish: (hits: number) => void,
  onProgress?: (hits: number) => void,
) {
  const [state, setState] = useState(initial);
  const done = useRef(false);
  const rng = useRef(createRng(initial.seed));
  const spawnTimer = useRef<number | null>(null);

  useEffect(() => {
    setState(initial);
    done.current = false;
    rng.current = createRng(initial.seed);
    if (spawnTimer.current) clearTimeout(spawnTimer.current);
  }, [initial]);

  useEffect(
    () => () => {
      if (spawnTimer.current) clearTimeout(spawnTimer.current);
    },
    [],
  );

  const finish = (hits: number) => {
    if (done.current) return;
    done.current = true;
    if (spawnTimer.current) clearTimeout(spawnTimer.current);
    queueMicrotask(() => onFinish(hits));
  };

  const scheduleNextFrom = (snapshot: WhackState) => {
    if (spawnTimer.current) clearTimeout(spawnTimer.current);
    const level = difficultyLevel(snapshot.hits);
    const { spawnDelay } = timingsFor(level, rng.current);

    spawnTimer.current = window.setTimeout(() => {
      setState((s) => {
        if (s.finishedAt || done.current) return s;

        // A target still active when the next should spawn = a miss → end run
        if (s.active !== null) {
          const ended = { ...s, active: null, finishedAt: Date.now() };
          finish(ended.hits);
          return ended;
        }

        const liveLevel = difficultyLevel(s.hits);
        const live = timingsFor(liveLevel, rng.current);
        let nextIdx = Math.floor(rng.current() * GRID);
        if (nextIdx === s.active) nextIdx = (nextIdx + 1) % GRID;
        const color = COLORS[Math.floor(rng.current() * COLORS.length)];
        const next = {
          ...s,
          active: nextIdx,
          activeColor: color,
        };

        spawnTimer.current = window.setTimeout(() => {
          setState((cur) => {
            if (cur.finishedAt || cur.active !== nextIdx || done.current) return cur;
            // Target expired without a hit → end run
            const ended = {
              ...cur,
              active: null,
              finishedAt: Date.now(),
            };
            finish(ended.hits);
            return ended;
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
      };
      setState(next);
      scheduleNextFrom(next);
      return;
    }

    setState((s) => {
      if (s.finishedAt || s.active === null) return s;
      if (index !== s.active) {
        // Wrong cell = miss → end run
        const ended = {
          ...s,
          active: null,
          finishedAt: Date.now(),
        };
        finish(ended.hits);
        return ended;
      }
      if (spawnTimer.current) clearTimeout(spawnTimer.current);
      const next = {
        ...s,
        hits: s.hits + 1,
        active: null,
      };
      onProgress?.(next.hits);
      scheduleNextFrom(next);
      return next;
    });
  };

  const level = difficultyLevel(state.hits);
  const heat = Math.round(1 + level * 9);

  return { state, heat, tap: startOrTap };
}

function Board({
  state,
  heat,
  onTap,
  footer,
}: {
  state: WhackState;
  heat: number;
  onTap: (i: number) => void;
  footer?: ReactNode;
}) {
  return (
    <div>
      <GameHud>
        <Stat>Hits: {state.hits}</Stat>
        <Stat>Heat: {heat}/10</Stat>
      </GameHud>
      <Rules text="Tap glowing blocks before they vanish. One miss ends the run — most hits wins!" />
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
  const { state, heat, tap } = useWhack(initialState, (hits) =>
    onFinish({ score: { primary: hits, label: `${hits} hits` } }),
  );
  return <Board state={state} heat={heat} onTap={tap} />;
}

function RaceView(props: RaceGameProps<WhackState>) {
  const { state, heat, tap } = useWhack(
    props.initialState,
    (hits) => {
      const s = { primary: hits, label: `${hits} hits`, progress: 1 };
      props.onLocalScore(s);
      props.onFinish({ score: s });
    },
    (hits) => {
      props.onLocalScore({
        primary: hits,
        label: `${hits} hits`,
        progress: Math.min(0.95, hits / 25),
      });
    },
  );
  return <Board state={state} heat={heat} onTap={tap} />;
}

export const whackGridGame: GameDefinition<WhackState> = {
  id: 'whack-grid',
  title: 'Whack Grid',
  blurb: 'How many can you hit before you miss?',
  emoji: '🔨',
  accent: 'var(--red)',
  modes: ['solo', 'race'],
  rules: 'Tap targets before they vanish. One miss ends the run!',
  createInitialState: (seed) => createWhackState(seed),
  SoloView,
  RaceView,
};
