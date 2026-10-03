import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { GAMES, getGame } from '../games/registry';
import type { GameCategory } from '../games/types';
import { Button } from '../ui/Button';
import { Panel } from '../ui/Panel';
import { PartyLinked } from './PartyLinked';
import { ScreenHeader } from './PartyChat';
import { getOrCreatePlayerId } from '../lib/player';
import {
  suggestGame,
  suggestionTally,
  subscribeRoom,
  type RoomData,
} from '../multiplayer/rooms';
import { loadWordDict } from '../games/word-claim/dictionary';
import { getAllBests } from '../lib/bests';
import { getDailyStatus } from '../lib/daily';
import { getLastPlayed } from '../lib/seen';
import { SettingsSheet } from '../ui/SettingsSheet';
import './Library.css';

const SECTIONS: { id: GameCategory; emoji: string; title: string; sub: string }[] = [
  { id: 'versus', emoji: '⚔️', title: 'Head-to-head', sub: 'take turns' },
  { id: 'reflex', emoji: '⚡', title: 'Reflex', sub: 'fast fingers' },
  { id: 'puzzle', emoji: '🧩', title: 'Puzzle', sub: 'think it through' },
  { id: 'words', emoji: '🔤', title: 'Words', sub: 'letters & luck' },
];

type Props = {
  onBack: () => void;
  onSolo: (gameId: string) => void;
  onDaily: () => void;
  onCreateRoom: (gameId: string) => void;
  onJoinRoom: (code: string) => void;
  activeRoom?: string | null;
  isHost?: boolean;
  hostDisplayName?: string;
  onLobby?: () => void;
  onQuitMultiplayer?: () => void;
  /** Host confirmed start (or set game when not everyone ready). */
  onPlayInRoom?: (gameId: string, opts?: { start: boolean }) => void;
  onStats: () => void;
};

export function Library({
  onBack,
  onSolo,
  onDaily,
  onCreateRoom,
  onJoinRoom,
  activeRoom,
  isHost,
  onLobby,
  onQuitMultiplayer,
  onPlayInRoom,
  onStats,
}: Props) {
  const [code, setCode] = useState('');
  const [picked, setPicked] = useState<string | null>(null);
  const [confirmStart, setConfirmStart] = useState<string | null>(null);
  const [hostNote, setHostNote] = useState('');
  const [room, setRoom] = useState<RoomData | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const youId = getOrCreatePlayerId();
  const bests = getAllBests();
  const daily = getDailyStatus();
  const dailyGame = getGame(daily.gameId);

  useEffect(() => {
    void loadWordDict().catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!activeRoom) {
      setRoom(null);
      return;
    }
    return subscribeRoom(activeRoom, setRoom);
  }, [activeRoom]);

  const tallies = room ? suggestionTally(room) : [];
  const mySuggestion = room?.suggestions?.[youId];

  const pickGame = (gameId: string) => {
    setHostNote('');
    if (activeRoom && onPlayInRoom) {
      if (isHost) {
        setConfirmStart(gameId);
      } else {
        suggestGame(activeRoom, youId, gameId)
          .then(() => {
            const g = getGame(gameId);
            setHostNote(`Suggested ${g?.emoji ?? ''} ${g?.title ?? gameId} to the host.`);
          })
          .catch(() => setHostNote('Could not send suggestion.'));
      }
      return;
    }
    setPicked(gameId);
  };

  const confirmGame = getGame(confirmStart || '');

  const randomGameId = () => {
    const last = getLastPlayed();
    const pool = GAMES.filter((g) => g.id !== last);
    return pool[Math.floor(Math.random() * pool.length)].id;
  };

  const quickPlay = () => {
    const last = getLastPlayed();
    const pool = GAMES.filter((g) => g.id !== last && g.modes.includes('solo'));
    onSolo(pool[Math.floor(Math.random() * pool.length)].id);
  };

  return (
    <div className="library">
      <ScreenHeader
        title={<h2 className="h2">Game Place</h2>}
        action={
          <div className="header-actions">
            <Button
              variant="ghost"
              className="icon-btn"
              aria-label="Settings"
              onClick={() => setShowSettings(true)}
            >
              ⚙
            </Button>
            <Button variant="ghost" onClick={onBack}>
              Home
            </Button>
          </div>
        }
      />

      {activeRoom && onLobby && onQuitMultiplayer ? (
        <PartyLinked
          code={activeRoom}
          onLobby={onLobby}
          onQuitMultiplayer={onQuitMultiplayer}
        />
      ) : null}

      {hostNote ? (
        <p className="muted" style={{ fontWeight: 800, marginBottom: 10 }}>
          {hostNote}
        </p>
      ) : null}

      {activeRoom ? (
        <p className="muted" style={{ fontWeight: 800, marginBottom: 10 }}>
          {isHost
            ? 'Tap a game — you’ll confirm before anything starts.'
            : 'Tap a game to suggest it. Host picks when to start.'}
        </p>
      ) : null}

      {activeRoom && tallies.length ? (
        <Panel style={{ marginBottom: 12 }}>
          <p className="h3" style={{ marginBottom: 6 }}>
            Party wants
          </p>
          <ul style={{ margin: 0, paddingLeft: 18, fontWeight: 700 }}>
            {tallies.map((t) => {
              const g = getGame(t.gameId);
              return (
                <li key={t.gameId}>
                  {g?.emoji} {g?.title ?? t.gameId} — {t.count}{' '}
                  {t.count === 1 ? 'vote' : 'votes'}
                  <span className="muted"> ({t.names.join(', ')})</span>
                </li>
              );
            })}
          </ul>
        </Panel>
      ) : null}

      {!activeRoom ? (
        <div className="stack library-hero">
          {dailyGame ? (
            <button type="button" className="daily-card" onClick={onDaily}>
              <span className="daily-card-emoji" aria-hidden>
                {dailyGame.emoji}
              </span>
              <span className="daily-card-text">
                <span className="daily-card-kicker">📅 Daily challenge</span>
                <span className="daily-card-title">{dailyGame.title}</span>
                <span className="daily-card-sub">
                  {daily.today ? `Today: ${daily.today.label}` : 'Same puzzle for everyone today'}
                  {daily.streak > 0 ? ` · 🔥 ${daily.streak}` : ''}
                </span>
              </span>
              <span className={`daily-card-cta ${daily.today ? 'done' : ''}`}>
                {daily.today ? '✓' : 'Play'}
              </span>
            </button>
          ) : null}

          <div className="hero-row">
            <Button variant="primary" block onClick={quickPlay}>
              ⚡ Quick play
            </Button>
            <Button variant="sky" block onClick={() => onCreateRoom(getLastPlayed() ?? 'number-rush')}>
              👥 Host room
            </Button>
          </div>

          <div className="join-row">
            <input
              className="field"
              placeholder="JOIN CODE"
              aria-label="Join code"
              maxLength={6}
              inputMode="text"
              autoCapitalize="characters"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && code.trim().length >= 4) {
                  onJoinRoom(code.trim());
                }
              }}
            />
            <Button
              variant="green"
              disabled={code.trim().length < 4}
              onClick={() => onJoinRoom(code.trim())}
            >
              Join
            </Button>
          </div>
        </div>
      ) : isHost && onPlayInRoom ? (
        <Button
          variant="gold"
          block
          style={{ marginBottom: 12 }}
          onClick={() => setConfirmStart(randomGameId())}
        >
          🎲 Surprise us
        </Button>
      ) : null}

      {SECTIONS.map((section) => {
        const games = GAMES.filter((g) => g.category === section.id);
        if (!games.length) return null;
        return (
          <section key={section.id} className="game-section">
            <h3 className="game-section-title">
              <span aria-hidden>{section.emoji}</span> {section.title}
              <span className="game-section-sub">{section.sub}</span>
            </h3>
            <div className="game-grid">
              {games.map((g) => {
                const voted = mySuggestion === g.id;
                const best = bests[g.id];
                return (
                  <button
                    key={g.id}
                    type="button"
                    className={`game-card ${voted ? 'game-card-voted' : ''}`}
                    style={{ ['--accent' as string]: g.accent }}
                    onClick={() => pickGame(g.id)}
                  >
                    <span className="emoji" aria-hidden>
                      {g.emoji}
                    </span>
                    <span className="title">{g.title}</span>
                    <span className="blurb">
                      {activeRoom && !isHost
                        ? voted
                          ? 'Your suggestion ✓'
                          : 'Tap to suggest'
                        : g.blurb}
                    </span>
                    {!activeRoom && best ? (
                      <span className="best-chip">🏆 {best.label}</span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}

      <div style={{ height: 12 }} />
      <Button variant="ghost" block onClick={onStats}>
        Stats
      </Button>

      {picked && !activeRoom
        ? createPortal(
            <div
              className="pick-modal"
              role="dialog"
              aria-modal="true"
              onClick={(e) => {
                if (e.target === e.currentTarget) setPicked(null);
              }}
            >
              <Panel className="pick-sheet">
                <p className="h3">{GAMES.find((g) => g.id === picked)?.title}</p>
                <p className="muted" style={{ marginTop: 4, marginBottom: 12 }}>
                  {GAMES.find((g) => g.id === picked)?.blurb}
                </p>
                <div className="stack">
                  <Button
                    variant="gold"
                    block
                    onClick={() => {
                      onSolo(picked);
                      setPicked(null);
                    }}
                  >
                    Play Solo
                  </Button>
                  <Button
                    variant="sky"
                    block
                    onClick={() => {
                      onCreateRoom(picked);
                      setPicked(null);
                    }}
                  >
                    Host multiplayer
                  </Button>
                  <Button variant="ghost" block onClick={() => setPicked(null)}>
                    Cancel
                  </Button>
                </div>
              </Panel>
            </div>,
            document.body,
          )
        : null}

      {confirmStart && confirmGame && onPlayInRoom
        ? createPortal(
            <div
              className="pick-modal"
              role="dialog"
              aria-modal="true"
              onClick={(e) => {
                if (e.target === e.currentTarget) setConfirmStart(null);
              }}
            >
              <Panel className="pick-sheet">
                <p className="h3">
                  {confirmGame.emoji} {confirmGame.title}
                </p>
                <p className="muted" style={{ marginTop: 4, marginBottom: 12 }}>
                  Start this for the whole party? Everyone online who’s ready will jump in.
                </p>
                <div className="stack">
                  <Button
                    variant="primary"
                    block
                    onClick={() => {
                      onPlayInRoom(confirmStart, { start: true });
                      setConfirmStart(null);
                    }}
                  >
                    Start match
                  </Button>
                  <Button
                    variant="sky"
                    block
                    onClick={() => {
                      onPlayInRoom(confirmStart, { start: false });
                      setConfirmStart(null);
                    }}
                  >
                    Just set game
                  </Button>
                  <Button variant="ghost" block onClick={() => setConfirmStart(null)}>
                    Cancel
                  </Button>
                </div>
              </Panel>
            </div>,
            document.body,
          )
        : null}

      <SettingsSheet open={showSettings} onClose={() => setShowSettings(false)} />
    </div>
  );
}
