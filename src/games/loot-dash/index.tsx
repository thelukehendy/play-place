import { useEffect, useRef, useState } from 'react';
import { createRng } from '../../lib/random';
import type { GameDefinition, RaceGameProps, SoloGameProps } from '../types';
import { GameHud, Rules, Stat } from '../../ui/GameChrome';
import { sfxBad, sfxClaim, sfxGood, sfxPop } from '../../lib/sfx';
import './LootDash.css';

const DOORS = 4;
const WAVES = 8;
const LIVES = 3;

type DoorKind = 'chest' | 'trap' | 'empty';

export type LootState = {
  seed: number;
  wave: number;
  coins: number;
  lives: number;
  /** Per-wave door layout, length WAVES * DOORS */
  layout: DoorKind[];
  revealed: DoorKind | null;
  picked: number | null;
  phase: 'pick' | 'reveal' | 'over';
};

function buildLayout(seed: number): DoorKind[] {
  const rng = createRng(seed);
  const out: DoorKind[] = [];
  for (let w = 0; w < WAVES; w++) {
    const doors: DoorKind[] = ['chest', 'chest', 'empty', 'trap'];
    for (let i = doors.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [doors[i], doors[j]] = [doors[j], doors[i]];
    }
    out.push(...doors);
  }
  return out;
}

export function createLootState(seed: number): LootState {
  return {
    seed,
    wave: 0,
    coins: 0,
    lives: LIVES,
    layout: buildLayout(seed),
    revealed: null,
    picked: null,
    phase: 'pick',
  };
}

function doorsForWave(state: LootState, wave: number): DoorKind[] {
  const start = wave * DOORS;
  return state.layout.slice(start, start + DOORS);
}

function useLoot(
  initial: LootState,
  onFinish: (coins: number, wave: number) => void,
  onProgress?: (coins: number, wave: number) => void,
) {
  const [state, setState] = useState(initial);
  const done = useRef(false);

  useEffect(() => {
    setState(initial);
    done.current = false;
  }, [initial]);

  const finish = (coins: number, wave: number) => {
    if (done.current) return;
    done.current = true;
    queueMicrotask(() => onFinish(coins, wave));
  };

  const pick = (door: number) => {
    if (done.current) return;
    setState((s) => {
      if (s.phase !== 'pick') return s;
      const kinds = doorsForWave(s, s.wave);
      const kind = kinds[door];
      let coins = s.coins;
      let lives = s.lives;
      if (kind === 'chest') {
        coins += 10 + s.wave * 2;
        sfxClaim();
      } else if (kind === 'trap') {
        lives -= 1;
        sfxBad();
      } else {
        sfxPop();
      }
      return {
        ...s,
        coins,
        lives,
        picked: door,
        revealed: kind,
        phase: 'reveal',
      };
    });
  };

  useEffect(() => {
    if (state.phase !== 'reveal') return;
    const t = window.setTimeout(() => {
      setState((s) => {
        if (s.phase !== 'reveal') return s;
        if (s.lives <= 0) {
          finish(s.coins, s.wave);
          return { ...s, phase: 'over' };
        }
        const nextWave = s.wave + 1;
        if (nextWave >= WAVES) {
          sfxGood();
          finish(s.coins, nextWave);
          return { ...s, wave: nextWave, phase: 'over', picked: null, revealed: null };
        }
        onProgress?.(s.coins, nextWave);
        return {
          ...s,
          wave: nextWave,
          phase: 'pick',
          picked: null,
          revealed: null,
        };
      });
    }, 850);
    return () => clearTimeout(t);
  }, [state.phase, state.wave, state.coins, state.lives, onProgress]);

  return { state, pick };
}

function Board({ state, onPick }: { state: LootState; onPick: (i: number) => void }) {
  const kinds = doorsForWave(state, Math.min(state.wave, WAVES - 1));
  const msg =
    state.phase === 'over'
      ? state.lives <= 0
        ? `Trapped! ${state.coins} coins`
        : `Dungeon cleared! ${state.coins} coins`
      : state.phase === 'reveal'
        ? state.revealed === 'chest'
          ? 'Loot!'
          : state.revealed === 'trap'
            ? 'Trap!'
            : 'Empty…'
        : `Wave ${state.wave + 1} — pick a door`;

  return (
    <div className="ld-wrap">
      <GameHud>
        <Stat>
          Wave: {Math.min(state.wave + 1, WAVES)}/{WAVES}
        </Stat>
        <Stat>Coins: {state.coins}</Stat>
        <Stat>Lives: {'❤'.repeat(Math.max(0, state.lives)) || '—'}</Stat>
      </GameHud>
      <Rules text="Each wave: 2 chests, 1 empty, 1 trap. Pick a door. Survive 8 waves." />
      <div className="ld-doors" data-sfx="off">
        {Array.from({ length: DOORS }, (_, i) => {
          const show = state.phase !== 'pick' && (state.picked === i || state.phase === 'over');
          const kind = show ? kinds[i] : null;
          // During reveal, show all doors briefly for fairness after pick
          const revealAll = state.phase === 'reveal';
          const shown = revealAll ? kinds[i] : kind;
          return (
            <button
              key={i}
              type="button"
              className={`ld-door ${shown ?? ''}`}
              disabled={state.phase !== 'pick'}
              aria-label={`Door ${i + 1}`}
              onClick={() => onPick(i)}
            >
              {shown === 'chest' ? '💎' : shown === 'trap' ? '💀' : shown === 'empty' ? '·' : `Door ${i + 1}`}
            </button>
          );
        })}
      </div>
      <p className="ld-msg">{msg}</p>
    </div>
  );
}

function SoloView({ initialState, onFinish }: SoloGameProps<LootState>) {
  const { state, pick } = useLoot(initialState, (coins) =>
    onFinish({ score: { primary: coins, label: `${coins} coins` } }),
  );
  return <Board state={state} onPick={pick} />;
}

function RaceView(props: RaceGameProps<LootState>) {
  const { state, pick } = useLoot(
    props.initialState,
    (coins) => {
      const payload = { primary: coins, label: `${coins}`, progress: 1 };
      props.onLocalScore(payload);
      props.onFinish({ score: payload });
    },
    (coins, wave) => {
      props.onLocalScore({
        primary: coins,
        label: `${coins} · w${wave}`,
        progress: Math.min(1, wave / WAVES),
      });
    },
  );
  return <Board state={state} onPick={pick} />;
}

export const lootDashGame: GameDefinition<LootState> = {
  id: 'loot-dash',
  title: 'Loot Dash',
  blurb: 'Pick doors for treasure — avoid the trap.',
  emoji: '💎',
  accent: 'var(--green)',
  modes: ['solo', 'race'],
  category: 'reflex',
  restart: 'game',
  daily: false,
  howTo: [
    'Each wave has four doors: two chests, one empty, one trap.',
    'Pick a door — chests pay coins, traps cost a life.',
    'Highest coins after 8 waves (or before 3 traps) wins.',
  ],
  rules: 'Pick a door each wave. Chests pay, traps hurt. 8 waves.',
  createInitialState: (seed) => createLootState(seed),
  SoloView,
  RaceView,
};
