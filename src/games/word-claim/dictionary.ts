/** Scrabble-style lexicon (Collins/SOWPODS open word list), lazy-loaded. */

let dict: Set<string> | null = null;
let loading: Promise<Set<string>> | null = null;

function dictUrl() {
  const base = import.meta.env.BASE_URL || './';
  return `${base}scrabble-words.txt`;
}

export async function loadWordDict(): Promise<Set<string>> {
  if (dict) return dict;
  if (!loading) {
    loading = (async () => {
      const res = await fetch(dictUrl());
      if (!res.ok) throw new Error('Could not load word dictionary');
      const text = await res.text();
      dict = new Set(
        text
          .split(/\s+/)
          .map((w) => w.trim().toUpperCase())
          .filter((w) => w.length >= 2 && w.length <= 15 && /^[A-Z]+$/.test(w)),
      );
      return dict;
    })();
  }
  return loading;
}

export function isLoadedWordDict(): boolean {
  return !!dict;
}

/** Sync check — returns false until dictionary has loaded. */
export function isScrabbleWord(word: string): boolean {
  if (!dict) return false;
  return dict.has(word.trim().toUpperCase());
}
