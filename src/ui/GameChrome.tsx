import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { PlayerInfo, ScoreValue } from '../games/types';
import { avatarOf } from '../lib/avatars';
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
  turn,
  tappable,
  onTap,
  extra,
  reaction,
}: {
  player: PlayerInfo;
  score?: ScoreValue;
  you: boolean;
  done: boolean;
  turn: boolean;
  tappable: boolean;
  onTap?: () => void;
  extra?: ReactNode;
  reaction?: string;
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

  const body = (
    <>
      <div className="score-main">
        <span className="score-name">
          <span className="score-avatar" aria-hidden>
            {avatarOf(player.id)}
          </span>
          {player.name}
          {you ? ' (you)' : ''}
          {turn ? ' · turn' : ''}
          {reaction ? (
            <span className="score-reaction" key={reaction} aria-label="reaction">
              {reaction}
            </span>
          ) : null}
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
    </>
  );

  return (
    <div
      className={`score-row ${you ? 'you' : ''} ${done ? 'done' : ''} ${turn ? 'turn' : ''} ${flash ? 'flash' : ''} ${tappable ? 'tappable' : ''}`}
    >
      {tappable ? (
        <button
          type="button"
          className="score-row-btn"
          onClick={onTap}
          aria-label={`Nudge ${player.name}`}
        >
          {body}
        </button>
      ) : (
        body
      )}
      {extra}
    </div>
  );
}

export function Scoreboard({
  players,
  scores,
  youId,
  finished = [],
  title = 'Live scores',
  compact = false,
  turnPlayerId = null,
  onPlayerTap,
  canTapPlayer,
  renderRowExtra,
  footerHint,
  reactions,
}: {
  players: PlayerInfo[];
  scores: Record<string, ScoreValue | undefined>;
  youId: string;
  finished?: string[];
  title?: string;
  compact?: boolean;
  turnPlayerId?: string | null;
  onPlayerTap?: (playerId: string) => void;
  canTapPlayer?: (playerId: string) => boolean;
  renderRowExtra?: (playerId: string) => ReactNode;
  footerHint?: string;
  reactions?: Record<string, string>;
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
    <div className={`scoreboard${compact ? ' scoreboard--compact' : ''}`}>
      {!compact ? <div className="scoreboard-title">{title}</div> : null}
      {sorted.map((p) => {
        const tappable = !!onPlayerTap && (canTapPlayer ? canTapPlayer(p.id) : p.id !== youId);
        return (
          <ScoreRow
            key={p.id}
            player={p}
            score={scores[p.id]}
            you={p.id === youId}
            done={finished.includes(p.id)}
            turn={!!turnPlayerId && p.id === turnPlayerId}
            tappable={tappable}
            onTap={tappable ? () => onPlayerTap?.(p.id) : undefined}
            extra={renderRowExtra?.(p.id)}
            reaction={reactions?.[p.id]}
          />
        );
      })}
      {footerHint ? <p className="scoreboard-hint">{footerHint}</p> : null}
    </div>
  );
}
