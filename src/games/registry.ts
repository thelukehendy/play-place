import { numberRushGame } from './number-rush';
import { slideRaceGame } from './slide-race';
import { memoryMatchGame } from './memory-match';
import { colorFloodGame } from './color-flood';
import { signalTapGame } from './signal-tap';
import { pipeConnectGame } from './pipe-connect';
import { anagramSprintGame } from './anagram-sprint';
import { wordClaimGame } from './word-claim';
import { dotsBoxesGame } from './dots-boxes';
import { whackGridGame } from './whack-grid';
import type { GameDefinition } from './types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const GAMES: GameDefinition<any>[] = [
  numberRushGame,
  slideRaceGame,
  memoryMatchGame,
  colorFloodGame,
  signalTapGame,
  pipeConnectGame,
  anagramSprintGame,
  wordClaimGame,
  dotsBoxesGame,
  whackGridGame,
];

export function getGame(id: string) {
  return GAMES.find((g) => g.id === id);
}

export type { GameDefinition } from './types';
