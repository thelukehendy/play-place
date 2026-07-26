import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createRng, formatTime, shuffle } from '../../lib/random';
import type { GameDefinition, RaceGameProps, SoloGameProps } from '../types';
import { GameHud, Rules, Stat } from '../../ui/GameChrome';
import { Button } from '../../ui/Button';
import { isScrabbleWord, loadWordDict } from './dictionary';
import './WordClaim.css';

const LETTERS =
  'AAAAAAAAABBCCDDDDEEEEEEEEEEEFFGGGHHIIIIIIIIIJKLLLLMMNNNNNNOOOOOOOOPPQRRRRRRSSSSTTTTTTUUUUVVWWXYYZ';

export type WordClaimState = {
  letters: string[];
  found: string[];
  score: number;
  startedAt: number | null;
  endsAt: number;
  finishedAt: number | null;
};

const DURATION = 60_000;

export function createWordClaimState(seed: number): WordClaimState {
  const rng = createRng(seed);
  const pool = LETTERS.split('');
  let letters = shuffle(pool, rng).slice(0, 16);
  const vowels = 'AEIOU';
  // Ensure at least 5 vowels for playable boards
  let vowelCount = letters.filter((c) => vowels.includes(c)).length;
  for (let i = 0; i < letters.length && vowelCount < 5; i++) {
    if (!vowels.includes(letters[i])) {
      letters[i] = vowels[Math.floor(rng() * vowels.length)];
      vowelCount++;
    }
  }
  letters = shuffle(letters, rng);
  return {
    letters,
    found: [],
    score: 0,
    startedAt: null,
    endsAt: 0,
    finishedAt: null,
  };
}

type Flash = { kind: 'ok' | 'bad'; text: string } | null;

function useWordClaim(
  initial: WordClaimState,
  onFinish: (score: number, words: number) => void,
  onProgress?: (score: number, words: number) => void,
) {
  const [state, setState] = useState(initial);
  const [picked, setPicked] = useState<number[]>([]);
  const [flash, setFlash] = useState<Flash>(null);
  const done = useRef(false);
  const [now, setNow] = useState(Date.now());
  const [dictReady, setDictReady] = useState(false);
  const flashTimer = useRef<number | null>(null);

  useEffect(() => {
    setState(initial);
    setPicked([]);
    setFlash(null);
    done.current = false;
  }, [initial]);

  useEffect(() => {
    let cancelled = false;
    loadWordDict()
      .then(() => {
        if (!cancelled) setDictReady(true);
      })
      .catch(() => {
        if (!cancelled) setDictReady(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, []);

  useEffect(() => () => {
    if (flashTimer.current) clearTimeout(flashTimer.current);
  }, []);

  useEffect(() => {
    if (!state.startedAt || state.finishedAt || done.current) return;
    if (now >= state.endsAt) {
      done.current = true;
      setState((s) => ({ ...s, finishedAt: s.endsAt }));
      queueMicrotask(() => onFinish(state.score, state.found.length));
    }
  }, [now, state, onFinish]);

  const showFlash = (kind: 'ok' | 'bad', text: string) => {
    setFlash({ kind, text });
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setFlash(null), 900);
  };

  const remaining = state.startedAt
    ? Math.max(0, (state.finishedAt ?? state.endsAt) - now)
    : DURATION;

  const word = picked.map((i) => state.letters[i]).join('');

  const ensureStarted = () => {
    setState((s) => {
      if (s.startedAt) return s;
      const startedAt = Date.now();
      return { ...s, startedAt, endsAt: startedAt + DURATION };
    });
  };

  const toggle = (i: number) => {
    if (state.finishedAt) return;
    ensureStarted();
    setPicked((p) => (p.includes(i) ? p.filter((x) => x !== i) : [...p, i]));
  };

  const clearPick = () => setPicked([]);

  const submit = () => {
    if (state.finishedAt || word.length < 2) return;
    if (!dictReady) {
      showFlash('bad', 'Loading dictionary…');
      return;
    }
    ensureStarted();
    if (state.found.includes(word)) {
      showFlash('bad', `Already claimed: ${word}`);
      setPicked([]);
      return;
    }
    if (!isScrabbleWord(word)) {
      showFlash('bad', `Not a Scrabble word: ${word}`);
      setPicked([]);
      return;
    }
    const points = word.length >= 5 ? word.length * 2 : word.length;
    showFlash('ok', `+${points} ${word}`);
    setState((s) => {
      const score = s.score + points;
      const found = [...s.found, word];
      if (onProgress) queueMicrotask(() => onProgress(score, found.length));
      return { ...s, score, found };
    });
    setPicked([]);
  };

  return { state, remaining, word, picked, flash, toggle, clearPick, submit, dictReady };
}

function Board({
  state,
  remaining,
  word,
  picked,
  flash,
  onToggle,
  onClear,
  onSubmit,
  footer,
}: {
  state: WordClaimState;
  remaining: number;
  word: string;
  picked: number[];
  flash: Flash;
  onToggle: (i: number) => void;
  onClear: () => void;
  onSubmit: () => void;
  footer?: ReactNode;
}) {
  return (
    <div>
      <GameHud>
        <Stat>Score: {state.score}</Stat>
        <Stat>Words: {state.found.length}</Stat>
        <Stat>{formatTime(remaining)}</Stat>
      </GameHud>
      <Rules text="Scrabble-legal words only (2+ letters). 60 seconds!" />
      <div className={`wc-flash ${flash ? flash.kind : ''}`} role="status" aria-live="polite">
        {flash ? flash.text : '\u00A0'}
      </div>
      <p className={`wc-word ${flash?.kind === 'ok' ? 'ok' : ''} ${flash?.kind === 'bad' ? 'bad' : ''}`}>
        {word || '· · ·'}
      </p>
      <div className="wc-grid">
        {state.letters.map((L, i) => (
          <button
            key={i}
            type="button"
            className={`wc-letter ${picked.includes(i) ? 'on' : ''}`}
            disabled={state.finishedAt !== null}
            onClick={() => onToggle(i)}
          >
            {L}
          </button>
        ))}
      </div>
      <div className="row">
        <Button variant="ghost" onClick={onClear} disabled={!!state.finishedAt}>
          Clear
        </Button>
        <Button variant="gold" onClick={onSubmit} disabled={!!state.finishedAt || word.length < 2}>
          Claim
        </Button>
      </div>
      <div className="wc-found">
        {state.found.map((w) => (
          <span key={w} className="wc-chip">
            {w}
          </span>
        ))}
      </div>
      {footer}
    </div>
  );
}

function SoloView({ initialState, onFinish }: SoloGameProps<WordClaimState>) {
  const ctx = useWordClaim(initialState, (score, words) =>
    onFinish({ score: { primary: score, label: `${score} pts · ${words} words` } }),
  );
  return <Board {...bind(ctx)} />;
}

function RaceView(props: RaceGameProps<WordClaimState>) {
  const ctx = useWordClaim(
    props.initialState,
    (score, words) => {
      const s = { primary: score, label: `${score} pts · ${words}w`, progress: 1 };
      props.onLocalScore(s);
      props.onFinish({ score: s });
    },
    (score, words) => {
      props.onLocalScore({
        primary: score,
        label: `${score} pts · ${words}w`,
        progress: Math.min(1, words / 12),
      });
    },
  );
  return <Board {...bind(ctx)} />;
}

function bind(ctx: ReturnType<typeof useWordClaim>) {
  return {
    state: ctx.state,
    remaining: ctx.remaining,
    word: ctx.word,
    picked: ctx.picked,
    flash: ctx.flash,
    onToggle: ctx.toggle,
    onClear: ctx.clearPick,
    onSubmit: ctx.submit,
  };
}

export const wordClaimGame: GameDefinition<WordClaimState> = {
  id: 'word-claim',
  title: 'Word Claim',
  blurb: 'Grab words from a letter grid.',
  emoji: '📝',
  accent: 'var(--gold)',
  modes: ['solo', 'race'],
  rules: 'Build Scrabble-legal words in 60s. Longer words score more!',
  createInitialState: (seed) => createWordClaimState(seed),
  SoloView,
  RaceView,
};
