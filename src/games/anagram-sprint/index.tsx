import { useEffect, useRef, useState } from 'react';
import { createRng, formatTime, shuffle } from '../../lib/random';
import type {
  GameDefinition,
  PlayerInfo,
  RaceGameProps,
  ScoreValue,
  SoloGameProps,
} from '../types';
import { GameHud, Stat } from '../../ui/GameChrome';
import { Button } from '../../ui/Button';
import './AnagramSprint.css';

const WORDS = [
  'ACTOR',
  'AIRPORT',
  'ANDROID',
  'APPLE',
  'ARMOR',
  'ARTIST',
  'ATHLETE',
  'ATTIC',
  'AUTUMN',
  'AVENUE',
  'AXLE',
  'BACON',
  'BAGEL',
  'BAKERY',
  'BANANA',
  'BASEMENT',
  'BATTERY',
  'BEACH',
  'BERRY',
  'BLAST',
  'BLOCK',
  'BRANCH',
  'BRAVE',
  'BREAD',
  'BREEZY',
  'BRICK',
  'BRIDGE',
  'BROTHER',
  'BUILDER',
  'BUTTER',
  'BUTTON',
  'CAMEL',
  'CAMERA',
  'CAMPING',
  'CANDY',
  'CANYON',
  'CASTLE',
  'CHEER',
  'CHEESE',
  'CHEETAH',
  'CHEST',
  'CHIMNEY',
  'CHORUS',
  'CIPHER',
  'CIRCUIT',
  'CLAP',
  'CLEVER',
  'CLOSET',
  'CLOUD',
  'CLOUDY',
  'CLUB',
  'COACH',
  'CODE',
  'COFFEE',
  'COMET',
  'COOKIE',
  'CORAL',
  'CORNER',
  'COUSIN',
  'CREAM',
  'CROWD',
  'CROWN',
  'CRYSTAL',
  'CURTAIN',
  'CYBORG',
  'DANCE',
  'DESERT',
  'DIAMOND',
  'DOCTOR',
  'DOLPHIN',
  'DONUT',
  'DOOR',
  'DRAGON',
  'DRIVER',
  'DRONE',
  'DRUM',
  'EAGLE',
  'EMERALD',
  'EMPIRE',
  'ENERGY',
  'ENGINE',
  'EVENING',
  'FABLE',
  'FAMILY',
  'FARMER',
  'FESTIVAL',
  'FISHING',
  'FLASH',
  'FLOWER',
  'FLUTE',
  'FOGGY',
  'FORCE',
  'FOREST',
  'FRIEND',
  'FRIES',
  'FROSTY',
  'FUNNY',
  'GALAXY',
  'GAME',
  'GARAGE',
  'GARDEN',
  'GATHER',
  'GEAR',
  'GOLDEN',
  'GORILLA',
  'GRAPE',
  'GROUP',
  'GUITAR',
  'HAPPY',
  'HARBOR',
  'HAWK',
  'HERO',
  'HIKING',
  'HOLIDAY',
  'HONEY',
  'HORSE',
  'HOUSE',
  'ISLAND',
  'JOYFUL',
  'JUICE',
  'JUMP',
  'KIND',
  'KINGDOM',
  'KITCHEN',
  'KITTEN',
  'KNIGHT',
  'KOALA',
  'LAKE',
  'LASER',
  'LAUGH',
  'LEAF',
  'LEGEND',
  'LEMON',
  'LEVEL',
  'LEVER',
  'LIBRARY',
  'LION',
  'LLAMA',
  'LOCK',
  'LOUD',
  'LUCKY',
  'MAGIC',
  'MAGNET',
  'MANGO',
  'MARKET',
  'MEADOW',
  'MELODY',
  'MELON',
  'METEOR',
  'MIDNIGHT',
  'MONKEY',
  'MORNING',
  'MOTION',
  'MOTOR',
  'MOUSE',
  'MOVIE',
  'MUFFIN',
  'MUSEUM',
  'MUSIC',
  'MYTH',
  'NEBULA',
  'NEIGHBOR',
  'NOVEL',
  'OCEAN',
  'OLIVE',
  'ORANGE',
  'ORBIT',
  'PANDA',
  'PANTHER',
  'PARADE',
  'PARENT',
  'PARTY',
  'PASTA',
  'PEACH',
  'PEBBLE',
  'PETAL',
  'PIANO',
  'PICNIC',
  'PILOT',
  'PIPE',
  'PIZZA',
  'PLANET',
  'PLAY',
  'PLAYER',
  'POEM',
  'PONY',
  'POWER',
  'PULLEY',
  'PUPPY',
  'PURPLE',
  'PUZZLE',
  'QUEST',
  'QUIET',
  'RABBIT',
  'RACE',
  'RAINBOW',
  'RAINY',
  'RHYTHM',
  'RIDDLE',
  'RIVER',
  'ROBIN',
  'ROBOT',
  'ROCKET',
  'ROOF',
  'ROOT',
  'ROUND',
  'SAILING',
  'SAILOR',
  'SALAD',
  'SAND',
  'SAPPHIRE',
  'SCHOOL',
  'SCORE',
  'SECRET',
  'SHAKE',
  'SHARK',
  'SHELL',
  'SHIELD',
  'SILVER',
  'SINGER',
  'SISTER',
  'SKATING',
  'SKIING',
  'SMART',
  'SMILE',
  'SNOWY',
  'SODA',
  'SOLDIER',
  'SPARROW',
  'SPEED',
  'SPICE',
  'SPRING',
  'STADIUM',
  'STAGE',
  'STAR',
  'STATION',
  'STEAK',
  'STONE',
  'STORMY',
  'STORY',
  'STREET',
  'SUGAR',
  'SUMMER',
  'SUNNY',
  'SUNRISE',
  'SUNSET',
  'SUPER',
  'SURFING',
  'SUSHI',
  'SWIFT',
  'SWITCH',
  'SWORD',
  'TACOS',
  'TEACHER',
  'TEAM',
  'THEATER',
  'THUNDER',
  'TICKET',
  'TIDE',
  'TIGER',
  'TOAST',
  'TOWER',
  'TREASURE',
  'TREE',
  'TRUMPET',
  'TUNNEL',
  'VALLEY',
  'VILLAIN',
  'VIOLIN',
  'WATER',
  'WAVE',
  'WEEKEND',
  'WHALE',
  'WHEEL',
  'WINDOW',
  'WINNER',
  'WINTER',
  'WRITER',
  'YOGURT',
  'ZEBRA',
];

const ROUNDS = 6;

export type AnagramState = {
  words: string[];
  scrambled: string[];
  index: number;
  correct: number;
  startedAt: number | null;
  finishedAt: number | null;
};

type RaceSync = {
  playerId: string;
  players: PlayerInfo[];
  remoteScores: Record<string, ScoreValue | undefined>;
  finishedPlayers: string[];
};

function scrambleWord(word: string, rng: () => number) {
  let chars = word.split('');
  for (let i = 0; i < 10; i++) {
    chars = shuffle(chars, rng);
    if (chars.join('') !== word) break;
  }
  return chars.join('');
}

export function createAnagramState(seed: number): AnagramState {
  const rng = createRng(seed);
  const words = shuffle(WORDS, rng).slice(0, ROUNDS);
  const scrambled = words.map((w) => scrambleWord(w, rng));
  return {
    words,
    scrambled,
    index: 0,
    correct: 0,
    startedAt: null,
    finishedAt: null,
  };
}

function useElapsed(startedAt: number | null, finishedAt: number | null) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!startedAt || finishedAt) return;
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, [startedAt, finishedAt]);
  if (!startedAt) return 0;
  return (finishedAt ?? now) - startedAt;
}

/** Has every race opponent completed at least `completed` words? */
function peersCompletedWords(sync: RaceSync, completed: number): boolean {
  const need = completed / ROUNDS;
  return sync.players.every((p) => {
    if (p.id === sync.playerId) return true;
    if (sync.finishedPlayers.includes(p.id)) return true;
    const prog = sync.remoteScores[p.id]?.progress ?? 0;
    return prog + 1e-9 >= need;
  });
}

function waitingSummary(sync: RaceSync, completed: number) {
  const need = completed / ROUNDS;
  const doneNames: string[] = [];
  const waitingNames: string[] = [];
  for (const p of sync.players) {
    const local = p.id === sync.playerId;
    const prog = local ? need : (sync.remoteScores[p.id]?.progress ?? 0);
    const done = local || sync.finishedPlayers.includes(p.id) || prog + 1e-9 >= need;
    if (done) doneNames.push(local ? 'You' : p.name);
    else waitingNames.push(p.name);
  }
  return { doneNames, waitingNames };
}

function useAnagram(
  initial: AnagramState,
  onFinish: (correct: number, ms: number) => void,
  onProgress?: (correct: number, completedWords: number) => void,
  sync?: RaceSync,
) {
  const [state, setState] = useState(initial);
  const [guess, setGuess] = useState('');
  const [reveal, setReveal] = useState<string | null>(null);
  const [missed, setMissed] = useState<string[]>([]);
  /** Words completed locally; when set, gate the next word until peers catch up. */
  const [awaitingPeersAt, setAwaitingPeersAt] = useState<number | null>(null);
  const done = useRef(false);
  const revealTimer = useRef<number | null>(null);

  useEffect(() => {
    setState(initial);
    setGuess('');
    setReveal(null);
    setMissed([]);
    setAwaitingPeersAt(null);
    done.current = false;
    if (revealTimer.current) clearTimeout(revealTimer.current);
  }, [initial]);

  useEffect(
    () => () => {
      if (revealTimer.current) clearTimeout(revealTimer.current);
    },
    [],
  );

  const elapsed = useElapsed(state.startedAt, state.finishedAt);

  // Race: release the next word only when everyone has finished this one.
  useEffect(() => {
    if (!sync || awaitingPeersAt === null) return;
    if (awaitingPeersAt >= ROUNDS) return; // match over locally — stay on done screen
    if (!peersCompletedWords(sync, awaitingPeersAt)) return;
    setAwaitingPeersAt(null);
  }, [sync, awaitingPeersAt]);

  const advance = (s: AnagramState, correct: number, index: number, startedAt: number) => {
    const finished = index >= ROUNDS;
    const finishedAt = finished ? Date.now() : null;
    if (finished && !done.current) {
      done.current = true;
      queueMicrotask(() => onFinish(correct, (finishedAt ?? Date.now()) - startedAt));
    } else if (onProgress) {
      queueMicrotask(() => onProgress(correct, index));
    }
    if (sync) {
      // Gate the next scrambled word until every player finishes this round.
      queueMicrotask(() => setAwaitingPeersAt(index));
    }
    return { ...s, index, correct, startedAt, finishedAt };
  };

  const submit = () => {
    if (done.current || state.finishedAt || reveal) return;
    if (awaitingPeersAt !== null && awaitingPeersAt < ROUNDS) return;
    const answer = guess.trim().toUpperCase();
    if (!answer) return;
    const target = state.words[state.index];
    const ok = answer === target;
    setGuess('');

    if (ok) {
      setState((s) => {
        const startedAt = s.startedAt ?? Date.now();
        return advance(s, s.correct + 1, s.index + 1, startedAt);
      });
      return;
    }

    // Wrong — reveal the spelling, then move on.
    setReveal(target);
    setMissed((m) => [...m, target]);
    if (revealTimer.current) clearTimeout(revealTimer.current);
    revealTimer.current = window.setTimeout(() => {
      setReveal(null);
      setState((s) => {
        const startedAt = s.startedAt ?? Date.now();
        return advance(s, s.correct, s.index + 1, startedAt);
      });
    }, 1400);
  };

  // While gated mid-match, suppress the next word until peers catch up.
  const gated =
    !!sync &&
    awaitingPeersAt !== null &&
    awaitingPeersAt < ROUNDS &&
    !peersCompletedWords(sync, awaitingPeersAt);

  const waitingMatchEnd =
    !!sync && !!state.finishedAt && !peersCompletedWords(sync, ROUNDS);

  return {
    state,
    elapsed,
    guess,
    setGuess,
    submit,
    reveal,
    missed,
    gated,
    waitingMatchEnd,
    awaitingPeersAt,
    sync,
  };
}

function Board({
  state,
  elapsed,
  guess,
  setGuess,
  onSubmit,
  reveal,
  missed,
  gated,
  waitingMatchEnd,
  awaitingPeersAt,
  sync,
  footer,
}: {
  state: AnagramState;
  elapsed: number;
  guess: string;
  setGuess: (v: string) => void;
  onSubmit: () => void;
  reveal: string | null;
  missed: string[];
  gated?: boolean;
  waitingMatchEnd?: boolean;
  awaitingPeersAt?: number | null;
  sync?: RaceSync;
  footer?: React.ReactNode;
}) {
  const done = state.finishedAt !== null;
  const word = state.scrambled[Math.min(state.index, ROUNDS - 1)];
  const showWait = !!(gated || waitingMatchEnd);
  const waitMeta =
    sync && awaitingPeersAt != null
      ? waitingSummary(sync, awaitingPeersAt)
      : sync && waitingMatchEnd
        ? waitingSummary(sync, ROUNDS)
        : null;

  return (
    <div className="ana-board">
      <GameHud>
        <Stat>
          {gated && awaitingPeersAt != null
            ? `${awaitingPeersAt}/${ROUNDS}`
            : `${Math.min(state.index + 1, ROUNDS)}/${ROUNDS}`}
        </Stat>
        <Stat>✓ {state.correct}</Stat>
        <Stat>{formatTime(elapsed)}</Stat>
      </GameHud>
      <div className="ana-play">
        {showWait ? (
          <div className="ana-wait">
            <p className="h3" style={{ margin: 0 }}>
              {waitingMatchEnd ? 'You finished!' : 'Word done!'}
            </p>
            <p className="ana-reveal-note">
              {waitingMatchEnd
                ? 'Waiting for everyone to finish the round…'
                : 'Waiting for everyone before the next word…'}
            </p>
            {waitMeta?.waitingNames.length ? (
              <p className="ana-wait-peers">Still going: {waitMeta.waitingNames.join(', ')}</p>
            ) : (
              <p className="ana-wait-peers">Almost…</p>
            )}
          </div>
        ) : !done ? (
          <>
            <p className="ana-scrambled">{reveal ? reveal : word}</p>
            {reveal ? (
              <p className="ana-reveal-note">It was {reveal}</p>
            ) : (
              <form
                className="ana-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  onSubmit();
                }}
              >
                <input
                  className="field ana-input"
                  value={guess}
                  onChange={(e) => setGuess(e.target.value)}
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder="YOUR GUESS"
                  enterKeyHint="done"
                  autoComplete="off"
                  autoFocus
                />
                <Button type="submit" variant="gold" block className="ana-submit">
                  Submit
                </Button>
              </form>
            )}
          </>
        ) : (
          <div className="ana-done">
            <p className="h3" style={{ margin: 0 }}>
              Done! {state.correct}/{ROUNDS}
            </p>
            <p className="ana-reveal-note">
              {missed.length ? `Missed: ${missed.join(', ')}` : 'Perfect round!'}
            </p>
          </div>
        )}
      </div>
      {footer}
    </div>
  );
}

function SoloView({ initialState, onFinish }: SoloGameProps<AnagramState>) {
  const { state, elapsed, guess, setGuess, submit, reveal, missed } = useAnagram(
    initialState,
    (correct, ms) =>
      onFinish({
        score: {
          primary: correct * 100000 - ms,
          label: `${correct}/${ROUNDS} · ${formatTime(ms)}`,
        },
      }),
  );
  return (
    <Board
      state={state}
      elapsed={elapsed}
      guess={guess}
      setGuess={setGuess}
      onSubmit={submit}
      reveal={reveal}
      missed={missed}
    />
  );
}

function RaceView(props: RaceGameProps<AnagramState>) {
  const sync: RaceSync = {
    playerId: props.player.id,
    players: props.players,
    remoteScores: props.remoteScores,
    finishedPlayers: props.finishedPlayers,
  };

  const {
    state,
    elapsed,
    guess,
    setGuess,
    submit,
    reveal,
    missed,
    gated,
    waitingMatchEnd,
    awaitingPeersAt,
  } = useAnagram(
    props.initialState,
    (correct, ms) => {
      const score = {
        primary: correct * 100000 - ms,
        label: `${correct}/${ROUNDS} · ${formatTime(ms)}`,
        progress: 1,
      };
      props.onLocalScore(score);
      props.onFinish({ score });
    },
    (correct, completedWords) => {
      props.onLocalScore({
        primary: correct * 1000 + completedWords,
        label: `${correct} ok · ${completedWords}/${ROUNDS}`,
        progress: completedWords / ROUNDS,
      });
    },
    sync,
  );

  return (
    <Board
      state={state}
      elapsed={elapsed}
      guess={guess}
      setGuess={setGuess}
      onSubmit={submit}
      reveal={reveal}
      missed={missed}
      gated={gated}
      waitingMatchEnd={waitingMatchEnd}
      awaitingPeersAt={awaitingPeersAt}
      sync={sync}
    />
  );
}

export const anagramSprintGame: GameDefinition<AnagramState> = {
  id: 'anagram-sprint',
  title: 'Anagram Sprint',
  blurb: 'Unscramble words against the clock.',
  emoji: '🔤',
  accent: 'var(--red)',
  modes: ['solo', 'race'],
  rules: 'Unscramble each word. In a party, everyone finishes a word before the next one.',
  createInitialState: (seed) => createAnagramState(seed),
  SoloView,
  RaceView,
};
