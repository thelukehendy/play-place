import { useEffect, useRef, useState, type ReactNode } from 'react';
import { formatTime } from '../../lib/random';
import type { GameDefinition, RaceGameProps, SoloGameProps } from '../types';
import { GameHud, Rules, Stat } from '../../ui/GameChrome';
import { Button } from '../../ui/Button';
import { haptic, sfxFinish, sfxTap } from '../../lib/sfx';
import {
  ROUNDS,
  UNDO_COST,
  DEATH_COST,
  GEM_SCORE,
  CLEAR_BONUS,
  type CellKind,
  type InertiaRound,
  buildRound,
  cloneBoard,
  countGems,
  dirFromTap,
  simulateSlide,
  advanceMovers,
  configForRound,
} from './engine';
import './Inertia.css';

export type { InertiaRound } from './engine';
export { buildRound, isSolvable } from './engine';

export type InertiaState = {
  seed: number;
  round: number;
  score: number;
  undos: number;
  deaths: number;
  moves: number;
  gemsLeft: number;
  board: InertiaRound;
  history: { board: InertiaRound; gemsLeft: number }[];
  status: 'play' | 'dead' | 'clear' | 'done';
  startedAt: number | null;
  finishedAt: number | null;
  flash: string | null;
};

export function createInertiaState(seed: number): InertiaState {
  const board = buildRound(seed, 0);
  return {
    seed,
    round: 0,
    score: 0,
    undos: 0,
    deaths: 0,
    moves: 0,
    gemsLeft: countGems(board.hasGem),
    board,
    history: [],
    status: 'play',
    startedAt: null,
    finishedAt: null,
    flash: null,
  };
}

function roundProgress(state: InertiaState) {
  const total = Math.max(1, configForRound(state.round).gems);
  const collected = Math.max(0, total - state.gemsLeft);
  const within = Math.min(1, collected / total);
  return Math.min(0.99, (state.round + within) / ROUNDS);
}

function scoreLabel(state: InertiaState) {
  return `${state.score} pts · R${Math.min(state.round + 1, ROUNDS)}/${ROUNDS}`;
}

function useInertia(
  initial: InertiaState,
  onFinish: (score: number, detail: string) => void,
  onProgress?: (state: InertiaState) => void,
) {
  const [state, setState] = useState(initial);
  const done = useRef(false);
  const flashTimer = useRef<number | null>(null);

  useEffect(() => {
    setState(initial);
    done.current = false;
  }, [initial]);

  useEffect(
    () => () => {
      if (flashTimer.current) clearTimeout(flashTimer.current);
    },
    [],
  );

  const emit = (next: InertiaState) => {
    onProgress?.(next);
  };

  const tapCell = (target: number) => {
    if (done.current) return;
    setState((s) => {
      if (s.status !== 'play' || s.finishedAt) return s;
      const dir = dirFromTap(s.board.ball, target, s.board.size);
      if (!dir) return s;

      const preview = simulateSlide(s.board, dir);
      if (preview.steps === 0) return s;

      const startedAt = s.startedAt ?? Date.now();
      const history = [
        ...s.history,
        { board: cloneBoard(s.board), gemsLeft: s.gemsLeft },
      ].slice(-30);

      if (preview.death) {
        haptic([30, 40, 30]);
        const board = cloneBoard(s.board);
        board.ball = preview.land;
        const score = Math.max(0, s.score - DEATH_COST);
        const next: InertiaState = {
          ...s,
          startedAt,
          board,
          score,
          deaths: s.deaths + 1,
          moves: s.moves + 1,
          status: 'dead',
          history,
          flash: `Boom! −${DEATH_COST}`,
        };
        queueMicrotask(() => emit(next));
        return next;
      }

      const board = cloneBoard(s.board);
      for (const g of preview.collected) board.hasGem[g] = false;
      board.ball = preview.land;
      const gemsGot = preview.collected.length;
      let gemsLeft = s.gemsLeft - gemsGot;
      let score = s.score + gemsGot * GEM_SCORE;
      let status: InertiaState['status'] = 'play';
      let flashText: string | null = gemsGot ? `+${gemsGot * GEM_SCORE}` : null;

      const moved = advanceMovers(board);
      Object.assign(board, moved.board);
      if (moved.hitBall) {
        haptic([30, 40, 30]);
        score = Math.max(0, score - DEATH_COST);
        const next: InertiaState = {
          ...s,
          startedAt,
          board,
          score,
          deaths: s.deaths + 1,
          moves: s.moves + 1,
          gemsLeft,
          history,
          status: 'dead',
          flash: `Caught! −${DEATH_COST}`,
        };
        queueMicrotask(() => emit(next));
        return next;
      }

      sfxTap();
      if (gemsLeft <= 0) {
        const bonus = CLEAR_BONUS + s.round * 10;
        score += bonus;
        flashText = `Clear! +${bonus}`;
        status = 'clear';
        haptic([12, 20, 12]);
      }

      const next: InertiaState = {
        ...s,
        startedAt,
        board,
        score,
        gemsLeft: Math.max(0, gemsLeft),
        moves: s.moves + 1,
        history,
        status,
        flash: flashText,
      };
      queueMicrotask(() => emit(next));
      return next;
    });
  };

  const undo = () => {
    setState((s) => {
      if (s.status === 'done' || s.finishedAt) return s;
      if (!s.history.length) return s;
      const history = [...s.history];
      const prev = history.pop()!;
      const score = Math.max(0, s.score - UNDO_COST);
      haptic(10);
      const next: InertiaState = {
        ...s,
        board: cloneBoard(prev.board),
        gemsLeft: prev.gemsLeft,
        history,
        score,
        undos: s.undos + 1,
        status: 'play',
        flash: `Undo −${UNDO_COST}`,
      };
      queueMicrotask(() => emit(next));
      return next;
    });
  };

  const restartRound = () => {
    setState((s) => {
      if (s.status === 'done' || s.finishedAt) return s;
      const board = buildRound(s.seed, s.round);
      const score = Math.max(0, s.score - DEATH_COST);
      haptic(20);
      const next: InertiaState = {
        ...s,
        board,
        gemsLeft: countGems(board.hasGem),
        history: [],
        score,
        deaths: s.deaths + (s.status === 'dead' ? 0 : 1),
        status: 'play',
        flash: `Restart −${DEATH_COST}`,
        startedAt: s.startedAt ?? Date.now(),
      };
      if (s.status === 'dead') {
        next.score = s.score;
        next.flash = 'Try again!';
        next.deaths = s.deaths;
      }
      queueMicrotask(() => emit(next));
      return next;
    });
  };

  const nextRound = () => {
    setState((s) => {
      if (s.status !== 'clear') return s;
      const round = s.round + 1;
      if (round >= ROUNDS) {
        done.current = true;
        const finishedAt = Date.now();
        const next: InertiaState = {
          ...s,
          status: 'done',
          finishedAt,
          flash: 'All clear!',
          round: ROUNDS - 1,
        };
        sfxFinish();
        queueMicrotask(() => {
          emit(next);
          onFinish(
            next.score,
            `${next.moves} moves · ${next.undos} undos · ${next.deaths} deaths`,
          );
        });
        return next;
      }
      const board = buildRound(s.seed, round);
      const next: InertiaState = {
        ...s,
        round,
        board,
        gemsLeft: countGems(board.hasGem),
        history: [],
        status: 'play',
        flash: `Round ${round + 1}!`,
      };
      queueMicrotask(() => emit(next));
      return next;
    });
  };

  useEffect(() => {
    if (state.status !== 'clear') return;
    const t = window.setTimeout(() => nextRound(), 900);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.status, state.round]);

  return { state, tapCell, undo, restartRound, nextRound };
}

function cellClass(kind: CellKind, isBall: boolean, hasGem: boolean) {
  if (isBall) return 'inertia-cell ball';
  const gem = hasGem ? ' has-gem' : '';
  return `inertia-cell ${kind}${gem}`;
}

function Board({
  state,
  onTap,
  onUndo,
  onRestart,
  footer,
}: {
  state: InertiaState;
  onTap: (i: number) => void;
  onUndo: () => void;
  onRestart: () => void;
  footer?: ReactNode;
}) {
  const elapsed =
    state.startedAt && !state.finishedAt
      ? Date.now() - state.startedAt
      : state.startedAt && state.finishedAt
        ? state.finishedAt - state.startedAt
        : 0;
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!state.startedAt || state.finishedAt) return;
    const id = setInterval(() => setTick((t) => t + 1), 200);
    return () => clearInterval(id);
  }, [state.startedAt, state.finishedAt]);

  const size = state.board.size;
  const dead = state.status === 'dead';
  const cleared = state.status === 'clear';
  const done = state.status === 'done';

  return (
    <div className="inertia-board">
      <GameHud>
        <Stat>{state.score} pts</Stat>
        <Stat>
          R{Math.min(state.round + 1, ROUNDS)}/{ROUNDS}
        </Stat>
        <Stat>{state.gemsLeft} gems</Stat>
        <Stat>{formatTime(elapsed)}</Stat>
      </GameHud>
      <Rules text="Tap to slide — dashed rings stop you. Grab every gem!" />
      {state.flash ? <p className="inertia-flash">{state.flash}</p> : <p className="inertia-flash idle">&nbsp;</p>}

      <div
        className={`inertia-grid ${dead ? 'dead' : ''} ${cleared ? 'clear' : ''}`}
        style={{
          gridTemplateColumns: `repeat(${size}, 1fr)`,
          gridTemplateRows: `repeat(${size}, 1fr)`,
        }}
      >
        {state.board.cells.map((kind, i) => {
          const isBall = state.board.ball === i;
          const gem = state.board.hasGem[i];
          return (
            <button
              key={i}
              type="button"
              className={`${cellClass(kind, isBall, gem)}${dead && isBall ? ' doomed' : ''}`}
              disabled={done || cleared || dead}
              onClick={() => onTap(i)}
              aria-label={
                isBall
                  ? 'Ball'
                  : gem
                    ? kind === 'stop'
                      ? 'Gem on stop'
                      : 'Gem'
                    : kind === 'mine' || kind === 'mover'
                      ? 'Mine'
                      : kind === 'wall'
                        ? 'Wall'
                        : kind === 'stop'
                          ? 'Stop'
                          : 'Empty'
              }
            >
              {isBall ? <span className="inertia-ball" /> : null}
              {!isBall && kind === 'stop' ? <span className="inertia-stop" /> : null}
              {!isBall && gem ? <span className="inertia-gem" /> : null}
              {!isBall && (kind === 'mine' || kind === 'mover') ? (
                <span className={`inertia-mine ${kind === 'mover' ? 'mover' : ''}`} />
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="inertia-actions">
        <Button variant="ghost" onClick={onUndo} disabled={done || !state.history.length || cleared}>
          Undo (−{UNDO_COST})
        </Button>
        <Button variant="sky" onClick={onRestart} disabled={done || cleared}>
          {dead ? 'Retry' : `Restart (−${DEATH_COST})`}
        </Button>
      </div>

      {dead ? (
        <p className="inertia-hint">Hit a mine — Retry the round (layout stays so you can learn it).</p>
      ) : null}
      {cleared ? <p className="inertia-hint">Round clear! Next puzzle incoming…</p> : null}
      {done ? (
        <p className="inertia-hint">
          Finished — {state.moves} moves · {state.undos} undos · {state.deaths} deaths
        </p>
      ) : null}
      {footer}
    </div>
  );
}

function SoloView({ initialState, onFinish }: SoloGameProps<InertiaState>) {
  const { state, tapCell, undo, restartRound } = useInertia(initialState, (score, detail) =>
    onFinish({
      score: { primary: score, label: `${score} pts` },
      detail,
    }),
  );
  return <Board state={state} onTap={tapCell} onUndo={undo} onRestart={restartRound} />;
}

function RaceView(props: RaceGameProps<InertiaState>) {
  const { state, tapCell, undo, restartRound } = useInertia(
    props.initialState,
    (score, detail) => {
      const s = {
        primary: score,
        label: `${score} pts`,
        progress: 1,
      };
      props.onLocalScore(s);
      props.onFinish({ score: s, detail });
    },
    (live) => {
      props.onLocalScore({
        primary: live.score,
        label: scoreLabel(live),
        progress: live.status === 'done' ? 1 : roundProgress(live),
      });
    },
  );
  return <Board state={state} onTap={tapCell} onUndo={undo} onRestart={restartRound} />;
}

export const inertiaGame: GameDefinition<InertiaState> = {
  id: 'inertia',
  title: 'Inertia',
  blurb: 'Slide the ball — grab gems, dodge mines.',
  emoji: '🟢',
  accent: 'var(--green)',
  modes: ['solo', 'race'],
  rules: 'Tap to slide. Dashed rings are anchors that stop you. Collect every gem.',
  createInitialState: (seed) => createInertiaState(seed),
  SoloView,
  RaceView,
};
