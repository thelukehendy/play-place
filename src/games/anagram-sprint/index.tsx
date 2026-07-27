import { useEffect, useRef, useState } from 'react';
import { createRng, formatTime, shuffle } from '../../lib/random';
import { haptic } from '../../lib/sfx';
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

/** Pool of words with exactly one Scrabble anagram (avoids alternate valid answers). */
const WORDS = [
  'AIRPORT',
  'ANDROID',
  'ARMOR',
  'ATHLETE',
  'AUTUMN',
  'AVENUE',
  'BAKERY',
  'BANANA',
  'BASEMENT',
  'BATTERY',
  'BEACH',
  'BERRY',
  'BLOCK',
  'BRANCH',
  'BRAVE',
  'BREEZY',
  'BRICK',
  'BROTHER',
  'BUTTER',
  'BUTTON',
  'CAMERA',
  'CAMPING',
  'CANDY',
  'CANYON',
  'CHEER',
  'CHEESE',
  'CHEETAH',
  'CHIMNEY',
  'CHORUS',
  'CIRCUIT',
  'CLAP',
  'CLEVER',
  'CLOUDY',
  'CLUB',
  'COACH',
  'COFFEE',
  'COOKIE',
  'CORNER',
  'COUSIN',
  'CROWD',
  'CROWN',
  'CRYSTAL',
  'CURTAIN',
  'CYBORG',
  'DIAMOND',
  'DOCTOR',
  'DOLPHIN',
  'DONUT',
  'DRAGON',
  'DRIVER',
  'DRUM',
  'EMERALD',
  'ENGINE',
  'EVENING',
  'FABLE',
  'FAMILY',
  'FESTIVAL',
  'FISHING',
  'FLASH',
  'FLUTE',
  'FOGGY',
  'FORCE',
  'FROSTY',
  'FUNNY',
  'GALAXY',
  'GARAGE',
  'GATHER',
  'GORILLA',
  'GROUP',
  'GUITAR',
  'HAPPY',
  'HARBOR',
  'HAWK',
  'HIKING',
  'HONEY',
  'HOUSE',
  'ISLAND',
  'JOYFUL',
  'JUICE',
  'JUMP',
  'KINGDOM',
  'KITTEN',
  'KNIGHT',
  'KOALA',
  'LAUGH',
  'LEGEND',
  'LEVEL',
  'LIBRARY',
  'LLAMA',
  'LOCK',
  'LOUD',
  'LUCKY',
  'MAGNET',
  'MARKET',
  'MEADOW',
  'MELODY',
  'MIDNIGHT',
  'MONKEY',
  'MORNING',
  'MOTION',
  'MOTOR',
  'MOVIE',
  'MUFFIN',
  'MUSEUM',
  'MUSIC',
  'MYTH',
  'NEIGHBOR',
  'NOVEL',
  'ORBIT',
  'PANDA',
  'PANTHER',
  'PARADE',
  'PARTY',
  'PEBBLE',
  'PIANO',
  'PICNIC',
  'PILOT',
  'PIPE',
  'PIZZA',
  'PONY',
  'POWER',
  'PULLEY',
  'PUPPY',
  'PUZZLE',
  'QUEST',
  'RABBIT',
  'RAINBOW',
  'RAINY',
  'RHYTHM',
  'RIVER',
  'ROBIN',
  'ROBOT',
  'ROCKET',
  'ROOF',
  'ROUND',
  'SAILOR',
  'SALAD',
  'SAPPHIRE',
  'SKIING',
  'SNOWY',
  'SPARROW',
  'SPRING',
  'STADIUM',
  'STATION',
  'STORMY',
  'SUMMER',
  'SUNNY',
  'SURFING',
  'SUSHI',
  'SWIFT',
  'SWITCH',
  'THUNDER',
  'TICKET',
  'TIGER',
  'TRUMPET',
  'TUNNEL',
  'VALLEY',
  'VILLAIN',
  'VIOLIN',
  'WAVE',
  'WEEKEND',
  'WHEEL',
  'WINDOW',
  'WINNER',
  'WRITER',
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

/** True when every other player has finished the full word set. */
function peersFinishedRound(sync: RaceSync): boolean {
  return sync.players.every((p) => {
    if (p.id === sync.playerId) return true;
    if (sync.finishedPlayers.includes(p.id)) return true;
    return (sync.remoteScores[p.id]?.progress ?? 0) + 1e-9 >= 1;
  });
}

function stillPlayingNames(sync: RaceSync): string[] {
  return sync.players
    .filter((p) => {
      if (p.id === sync.playerId) return false;
      if (sync.finishedPlayers.includes(p.id)) return false;
      return (sync.remoteScores[p.id]?.progress ?? 0) + 1e-9 < 1;
    })
    .map((p) => p.name);
}

function useAnagram(
  initial: AnagramState,
  onFinish: (correct: number, ms: number) => void,
  onProgress?: (correct: number, completedWords: number) => void,
  sync?: RaceSync,
) {
  const [state, setState] = useState(initial);
  const [guess, setGuess] = useState('');
  /** Missed-word reveal (red). */
  const [reveal, setReveal] = useState<string | null>(null);
  /** Correct-word flash (green). */
  const [success, setSuccess] = useState<string | null>(null);
  const [missed, setMissed] = useState<string[]>([]);
  const done = useRef(false);
  const stepTimer = useRef<number | null>(null);

  useEffect(() => {
    setState(initial);
    setGuess('');
    setReveal(null);
    setSuccess(null);
    setMissed([]);
    done.current = false;
    if (stepTimer.current) clearTimeout(stepTimer.current);
  }, [initial]);

  useEffect(
    () => () => {
      if (stepTimer.current) clearTimeout(stepTimer.current);
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
    if (done.current || state.finishedAt || reveal || success) return;
    const answer = guess.trim().toUpperCase();
    if (!answer) return;
    const target = state.words[state.index];
    const ok = answer === target;
    setGuess('');

    if (ok) {
      haptic([10, 30, 10]);
      setSuccess(target);
      if (stepTimer.current) clearTimeout(stepTimer.current);
      stepTimer.current = window.setTimeout(() => {
        setSuccess(null);
        setState((s) => {
          const startedAt = s.startedAt ?? Date.now();
          return advance(s, s.correct + 1, s.index + 1, startedAt);
        });
      }, 750);
      return;
    }

    // Wrong — reveal the spelling, then move on.
    setReveal(target);
    setMissed((m) => [...m, target]);
    if (stepTimer.current) clearTimeout(stepTimer.current);
    stepTimer.current = window.setTimeout(() => {
      setReveal(null);
      setState((s) => {
        const startedAt = s.startedAt ?? Date.now();
        return advance(s, s.correct, s.index + 1, startedAt);
      });
    }, 1400);
  };

  // Only wait after the full set of words — not between each word.
  const waitingMatchEnd = !!sync && !!state.finishedAt && !peersFinishedRound(sync);

  return {
    state,
    elapsed,
    guess,
    setGuess,
    submit,
    reveal,
    success,
    missed,
    waitingMatchEnd,
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
  success,
  missed,
  waitingMatchEnd,
  sync,
  footer,
}: {
  state: AnagramState;
  elapsed: number;
  guess: string;
  setGuess: (v: string) => void;
  onSubmit: () => void;
  reveal: string | null;
  success: string | null;
  missed: string[];
  waitingMatchEnd?: boolean;
  sync?: RaceSync;
  footer?: React.ReactNode;
}) {
  const done = state.finishedAt !== null;
  const word = state.scrambled[Math.min(state.index, ROUNDS - 1)];
  const waitingNames = sync && waitingMatchEnd ? stillPlayingNames(sync) : [];
  const locked = !!(reveal || success);

  return (
    <div className="ana-board">
      <GameHud>
        <Stat>
          {Math.min(state.index + 1, ROUNDS)}/{ROUNDS}
        </Stat>
        <Stat>✓ {state.correct}</Stat>
        <Stat>{formatTime(elapsed)}</Stat>
      </GameHud>
      <div className="ana-play">
        {waitingMatchEnd ? (
          <div className="ana-wait">
            <p className="h3" style={{ margin: 0 }}>
              You finished!
            </p>
            <p className="ana-reveal-note">
              Done! {state.correct}/{ROUNDS}
              {missed.length ? ` · Missed: ${missed.join(', ')}` : ' · Perfect!'}
            </p>
            <p className="ana-reveal-note">Waiting for everyone to finish the round…</p>
            {waitingNames.length ? (
              <p className="ana-wait-peers">Still going: {waitingNames.join(', ')}</p>
            ) : (
              <p className="ana-wait-peers">Almost…</p>
            )}
          </div>
        ) : !done ? (
          <>
            <p
              className={`ana-scrambled${success ? ' ana-scrambled--ok' : ''}${
                reveal ? ' ana-scrambled--miss' : ''
              }`}
            >
              {success || reveal || word}
            </p>
            {success ? (
              <p className="ana-ok-note">Nice! ✓</p>
            ) : reveal ? (
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
                  disabled={locked}
                />
                <Button type="submit" variant="gold" block className="ana-submit" disabled={locked}>
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
  const { state, elapsed, guess, setGuess, submit, reveal, success, missed } = useAnagram(
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
      success={success}
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

  const { state, elapsed, guess, setGuess, submit, reveal, success, missed, waitingMatchEnd } =
    useAnagram(
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
      success={success}
      missed={missed}
      waitingMatchEnd={waitingMatchEnd}
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
  rules: 'Unscramble all words. In a party, results wait until everyone finishes the round.',
  createInitialState: (seed) => createAnagramState(seed),
  SoloView,
  RaceView,
};
