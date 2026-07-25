import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { PlayerInfo, ScoreValue } from '../games/types';
import './GameChrome.css';

export function GameHud({ children }: { children: ReactNode }) {
  return <div className="game-hud">{children}</div>;
}

export function Stat({ children }: { children: ReactNode }) {
  return <div className="stat">{children}</div>;
}

export function Rules({ text }: { text: string }) {
  return <p className="game-rules">{text}</p>;
}

function ScoreRow({
  player,
  score,
  you,
  done,
}: {
  player: PlayerInfo;
  score?: ScoreValue;
  you: boolean;
  done: boolean;
}) {
  const prev = useRef(score?.label);
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    if (score?.label && score.label !== prev.current) {
      prev.current = score.label;
      setFlash(true);
      const t = window.setTimeout(() => setFlash(false), 450);
      return () => clearTimeout(t);
    }
    prev.current = score?.label;
  }, [score?.label]);

  const progress =
    typeof score?.progress === 'number'
      ? Math.max(0, Math.min(1, score.progress))
      : done
        ? 1
        : undefined;

  return (
    <div className={`score-row ${you ? 'you' : ''} ${done ? 'done' : ''} ${flash ? 'flash' : ''}`}>
      <div className="score-main">
        <span className="score-name">
          {player.name}
          {you ? ' (you)' : ''}
        </span>
        <span className="score-status">
          {done ? 'Done ✓' : score ? score.label : 'Waiting…'}
        </span>
      </div>
      {progress !== undefined ? (
        <div className="score-bar" aria-hidden>
          <div className="score-bar-fill" style={{ width: `${progress * 100}%` }} />
        </div>
      ) : (
        <div className="score-bar idle" aria-hidden>
          <div className="score-bar-fill" style={{ width: done ? '100%' : '0%' }} />
        </div>
      )}
    </div>
  );
}

export function Scoreboard({
  players,
  scores,
  youId,
  finished = [],
  title = 'Live scores',
}: {
  players: PlayerInfo[];
  scores: Record<string, ScoreValue | undefined>;
  youId: string;
  finished?: string[];
  title?: string;
}) {
  const sorted = [...players].sort((a, b) => {
    const aDone = finished.includes(a.id) ? 0 : 1;
    const bDone = finished.includes(b.id) ? 0 : 1;
    if (aDone !== bDone) return aDone - bDone;
    const sa = scores[a.id];
    const sb = scores[b.id];
    if (!sa && !sb) return 0;
    if (!sa) return 1;
    if (!sb) return -1;
    const lower = sa.lowerIsBetter || sb.lowerIsBetter;
    return lower ? sa.primary - sb.primary : sb.primary - sa.primary;
  });

  return (
    <div className="scoreboard">
      <div className="scoreboard-title">{title}</div>
      {sorted.map((p) => (
        <ScoreRow
          key={p.id}
          player={p}
          score={scores[p.id]}
          you={p.id === youId}
          done={finished.includes(p.id)}
        />
      ))}
    </div>
  );
}
