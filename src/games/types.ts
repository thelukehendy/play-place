import type { ComponentType } from 'react';

export type GameMode = 'solo' | 'race' | 'turn';

export type PlayerInfo = {
  id: string;
  name: string;
};

export type ScoreValue = {
  /** Higher is better unless lowerIsBetter */
  primary: number;
  label: string;
  lowerIsBetter?: boolean;
  /** 0–1 progress toward finish, for live multiplayer bars */
  progress?: number;
};

export type GameFinishPayload = {
  score: ScoreValue;
  detail?: string;
};

export type SoloGameProps<S> = {
  seed: number;
  player: PlayerInfo;
  initialState: S;
  onFinish: (payload: GameFinishPayload) => void;
  onStateChange?: (state: S) => void;
};

export type RaceGameProps<S> = {
  seed: number;
  player: PlayerInfo;
  players: PlayerInfo[];
  initialState: S;
  remoteScores: Record<string, ScoreValue | undefined>;
  onLocalScore: (score: ScoreValue) => void;
  onFinish: (payload: GameFinishPayload) => void;
  finishedPlayers: string[];
};

export type TurnGameProps<S> = {
  seed: number;
  player: PlayerInfo;
  players: PlayerInfo[];
  state: S;
  onStateChange: (state: S) => void;
  onFinish: (payload: GameFinishPayload & { winnerId?: string }) => void;
};

export type GameDefinition<S = unknown> = {
  id: string;
  title: string;
  blurb: string;
  emoji: string;
  accent: string;
  modes: GameMode[];
  /** one-line rule shown in-game */
  rules: string;
  createInitialState: (seed: number, players: PlayerInfo[]) => S;
  SoloView: ComponentType<SoloGameProps<S>>;
  RaceView?: ComponentType<RaceGameProps<S>>;
  TurnView?: ComponentType<TurnGameProps<S>>;
  /** for turn-based: derive scores from shared state */
  getScoresFromState?: (state: S, players: PlayerInfo[]) => Record<string, ScoreValue>;
  isFinished?: (state: S) => boolean;
};

export function compareScores(a: ScoreValue, b: ScoreValue): number {
  const lower = a.lowerIsBetter || b.lowerIsBetter;
  if (lower) return a.primary - b.primary;
  return b.primary - a.primary;
}
