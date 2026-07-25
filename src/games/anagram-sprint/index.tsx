import { useEffect, useRef, useState } from 'react';
import { createRng, formatTime, shuffle } from '../../lib/random';
import type { GameDefinition, RaceGameProps, SoloGameProps } from '../types';
import { GameHud, Rules, Stat } from '../../ui/GameChrome';
import { Button } from '../../ui/Button';
import './AnagramSprint.css';

const WORDS = [
  'CLOUD', 'BRICK', 'PIPE', 'STAR', 'JUMP', 'RACE', 'PLAY', 'GAME',
  'BLOCK', 'SPEED', 'PUZZLE', 'FLASH', 'BLAST', 'POWER', 'LUCKY',
  'ROUND', 'QUEST', 'SCORE', 'LEVEL', 'PARTY', 'MAGIC', 'SUPER',
];

const ROUNDS = 5;

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
  const done = useRef(false);
  useEffect(() => {
    setState(initial);
    setGuess('');
    done.current = false;
  }, [initial]);
  const elapsed = useElapsed(state.startedAt, state.finishedAt);

  const submit = () => {
    if (done.current || state.finishedAt) return;
    const answer = guess.trim().toUpperCase();
    if (!answer) return;
    setState((s) => {
      const startedAt = s.startedAt ?? Date.now();
      const ok = answer === s.words[s.index];
      const correct = s.correct + (ok ? 1 : 0);
      const index = s.index + 1;
      const finished = index >= ROUNDS;
      const finishedAt = finished ? Date.now() : null;
      if (finished && !done.current) {
        done.current = true;
        queueMicrotask(() => onFinish(correct, (finishedAt ?? Date.now()) - startedAt));
      } else if (onProgress) {
        queueMicrotask(() => onProgress(correct, index));
      }
      return { ...s, index, correct, startedAt, finishedAt };
    });
    setGuess('');
  };

  return { state, elapsed, guess, setGuess, submit };
}

function Board({
  state,
  elapsed,
  guess,
  setGuess,
  onSubmit,
  footer,
}: {
  state: AnagramState;
  elapsed: number;
  guess: string;
  setGuess: (v: string) => void;
  onSubmit: () => void;
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
      <Rules text="Unscramble each word. Same list for everyone!" />
      <div className="panel ana-card">
        {!done ? (
          <>
            <p className="ana-round muted">Unscramble</p>
            <p className="ana-scrambled">{word}</p>
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
          </>
        ) : (
          <p className="h3">Done! {state.correct}/{ROUNDS} correct</p>
        )}
      </div>
      {footer}
    </div>
  );
}

function SoloView({ initialState, onFinish }: SoloGameProps<AnagramState>) {
  const { state, elapsed, guess, setGuess, submit } = useAnagram(initialState, (correct, ms) =>
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
    />
  );
}

function RaceView(props: RaceGameProps<AnagramState>) {
  const { state, elapsed, guess, setGuess, submit } = useAnagram(
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
