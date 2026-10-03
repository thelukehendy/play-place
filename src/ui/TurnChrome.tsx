import { useEffect, useRef } from 'react';
import { avatarOf } from '../lib/avatars';
import { sfxLose, sfxReady, sfxWin } from '../lib/sfx';
import './TurnChrome.css';

export const SEAT_GLYPHS = ['●', '■', '▲', '★'];

export type Seat = {
  id?: string;
  name: string;
  score?: number | string;
  avatar?: string;
};

export function TurnRoster({
  seats,
  turn,
  meIndex,
  over,
  showGlyph = false,
}: {
  seats: Seat[];
  turn: number;
  meIndex: number;
  over: boolean;
  showGlyph?: boolean;
}) {
  return (
    <div className="tc-roster" role="list" aria-label="Players">
      {seats.map((s, i) => {
        const active = !over && turn === i;
        const isYou = meIndex === i;
        return (
          <div
            key={`${s.id ?? s.name}-${i}`}
            role="listitem"
            className={`tc-seat seat-${i + 1} ${active ? 'is-turn' : ''} ${isYou ? 'is-you' : ''}`}
          >
            <span className="tc-avatar" aria-hidden>
              {s.avatar ?? (s.id ? avatarOf(s.id) : '🤖')}
            </span>
            <span className="tc-name">
              {showGlyph ? <span className="tc-glyph">{SEAT_GLYPHS[i]} </span> : null}
              {s.name}
              {isYou ? ' (you)' : ''}
            </span>
            {s.score !== undefined ? <span className="tc-score">{s.score}</span> : null}
            {active ? <span className="tc-badge">Turn</span> : null}
          </div>
        );
      })}
    </div>
  );
}

export function TurnBanner({
  over,
  myTurn,
  turnIndex,
  text,
}: {
  over: boolean;
  myTurn: boolean;
  turnIndex: number;
  text: string;
}) {
  return (
    <div
      className={`tc-banner seat-${turnIndex + 1} ${over ? 'is-over' : myTurn ? 'is-mine' : 'is-theirs'}`}
      role="status"
      aria-live="polite"
    >
      {text}
    </div>
  );
}

/** Soft ping when the turn passes to you. */
export function useYourTurnPing(myTurn: boolean, over: boolean) {
  const prev = useRef(myTurn);
  useEffect(() => {
    if (myTurn && !prev.current && !over) sfxReady();
    prev.current = myTurn;
  }, [myTurn, over]);
}

/** Win / lose jingle exactly once when the game ends. */
export function useOutcomeSound(over: boolean, iWon: boolean, seated: boolean) {
  const played = useRef(false);
  useEffect(() => {
    if (!over) {
      played.current = false;
      return;
    }
    if (played.current || !seated) return;
    played.current = true;
    if (iWon) sfxWin();
    else sfxLose();
  }, [over, iWon, seated]);
}
