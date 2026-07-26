import { useEffect, useRef, useState } from 'react';
import { createRng, formatTime, shuffle } from '../../lib/random';
import type { GameDefinition, RaceGameProps, SoloGameProps } from '../types';
import { GameHud, Rules, Stat } from '../../ui/GameChrome';
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

function useAnagram(
  initial: AnagramState,
  onFinish: (correct: number, ms: number) => void,
  onProgress?: (correct: number, index: number) => void,
) {
  const [state, setState] = useState(initial);
  const [guess, setGuess] = useState('');
  const [reveal, setReveal] = useState<string | null>(null);
  const [missed, setMissed] = useState<string[]>([]);
  const done = useRef(false);
  const revealTimer = useRef<number | null>(null);

  useEffect(() => {
    setState(initial);
    setGuess('');
    setReveal(null);
    setMissed([]);
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

  const advance = (s: AnagramState, correct: number, index: number, startedAt: number) => {
    const finished = index >= ROUNDS;
    const finishedAt = finished ? Date.now() : null;
    if (finished && !done.current) {
      done.current = true;
      queueMicrotask(() => onFinish(correct, (finishedAt ?? Date.now()) - startedAt));
    } else if (onProgress) {
      queueMicrotask(() => onProgress(correct, index));
    }
    return { ...s, index, correct, startedAt, finishedAt };
  };

  const submit = () => {
    if (done.current || state.finishedAt || reveal) return;
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

  return { state, elapsed, guess, setGuess, submit, reveal, missed };
}

function Board({
  state,
  elapsed,
  guess,
  setGuess,
  onSubmit,
  reveal,
  missed,
  footer,
}: {
  state: AnagramState;
  elapsed: number;
  guess: string;
  setGuess: (v: string) => void;
  onSubmit: () => void;
  reveal: string | null;
  missed: string[];
  footer?: React.ReactNode;
}) {
  const done = state.finishedAt !== null;
  const word = state.scrambled[Math.min(state.index, ROUNDS - 1)];
  return (
    <div>
      <GameHud>
        <Stat>
          Round {Math.min(state.index + 1, ROUNDS)}/{ROUNDS}
        </Stat>
        <Stat>Correct: {state.correct}</Stat>
        <Stat>{formatTime(elapsed)}</Stat>
      </GameHud>
      <Rules text="Unscramble each word. Misses reveal the answer." />
      <div className="panel ana-card">
        {!done ? (
          <>
            <p className="ana-round muted">{reveal ? 'Answer' : 'Unscramble'}</p>
            <p className="ana-scrambled">{reveal ? reveal : word}</p>
            {reveal ? (
              <p className="muted" style={{ fontWeight: 800, textAlign: 'center' }}>
                It was {reveal}
              </p>
            ) : (
              <form
                className="stack"
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
                  autoFocus
                />
                <Button type="submit" variant="gold" block>
                  Submit
                </Button>
              </form>
            )}
          </>
        ) : (
          <>
            <p className="h3">Done! {state.correct}/{ROUNDS} correct</p>
            {missed.length ? (
              <p className="muted" style={{ marginTop: 10, fontWeight: 800 }}>
                Missed: {missed.join(', ')}
              </p>
            ) : (
              <p className="muted" style={{ marginTop: 10, fontWeight: 800 }}>
                Perfect round!
              </p>
            )}
          </>
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
  const { state, elapsed, guess, setGuess, submit, reveal, missed } = useAnagram(
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
    (correct, index) => {
      props.onLocalScore({
        primary: correct * 1000 + index,
        label: `${correct} ok · R${Math.min(index + 1, ROUNDS)}/${ROUNDS}`,
        progress: index / ROUNDS,
      });
    },
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

export const anagramSprintGame: GameDefinition<AnagramState> = {
  id: 'anagram-sprint',
  title: 'Anagram Sprint',
  blurb: 'Unscramble words against the clock.',
  emoji: '🔤',
  accent: 'var(--red)',
  modes: ['solo', 'race'],
  rules: 'Unscramble 5 words — more correct + faster wins.',
  createInitialState: (seed) => createAnagramState(seed),
  SoloView,
  RaceView,
};
