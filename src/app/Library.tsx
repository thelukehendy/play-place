import { useState } from 'react';
import { createPortal } from 'react-dom';
import { GAMES } from '../games/registry';
import { Button } from '../ui/Button';
import { Panel } from '../ui/Panel';
import { PartyLinked } from './PartyLinked';
import { ScreenHeader } from './PartyChat';
import './Library.css';

type Props = {
  onBack: () => void;
  onSolo: (gameId: string) => void;
  onCreateRoom: (gameId: string) => void;
  onJoinRoom: (code: string) => void;
  activeRoom?: string | null;
  isHost?: boolean;
  hostDisplayName?: string;
  onLobby?: () => void;
  onQuitMultiplayer?: () => void;
  onPlayInRoom?: (gameId: string) => void;
  onStats: () => void;
};

export function Library({
  onBack,
  onSolo,
  onCreateRoom,
  onJoinRoom,
  activeRoom,
  isHost,
  hostDisplayName,
  onLobby,
  onQuitMultiplayer,
  onPlayInRoom,
  onStats,
}: Props) {
  const [code, setCode] = useState('');
  const [picked, setPicked] = useState<string | null>(null);
  const [hostNote, setHostNote] = useState('');

  const pickGame = (gameId: string) => {
    setHostNote('');
    if (activeRoom && onPlayInRoom) {
      if (isHost) {
        onPlayInRoom(gameId);
      } else {
        setHostNote(
          `${hostDisplayName ?? 'The host'} picks the games. You're along for the ride!`,
        );
      }
      return;
    }
    setPicked(gameId);
  };

  return (
    <div className="library">
      <ScreenHeader
        title={<h2 className="h2">Game Place</h2>}
        action={
          <Button variant="ghost" onClick={onBack}>
            Home
          </Button>
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
            ? 'Tap a game to set it for the party (everyone must be ready to start).'
            : `${hostDisplayName ?? 'Host'} is selecting games — your grid is view-only.`}
        </p>
      ) : null}

      <div className={`game-grid ${activeRoom && !isHost ? 'game-grid-locked' : ''}`}>
        {GAMES.map((g) => (
          <button
            key={g.id}
            type="button"
            className={`game-card ${activeRoom && !isHost ? 'game-card-locked' : ''}`}
            style={{ borderColor: 'var(--ink)', boxShadow: `0 4px 0 var(--ink)` }}
            onClick={() => pickGame(g.id)}
            aria-disabled={!!(activeRoom && !isHost)}
          >
            <span className="emoji" aria-hidden>
              {g.emoji}
            </span>
            <span className="title">{g.title}</span>
            <span className="blurb">{g.blurb}</span>
          </button>
        ))}
      </div>

      {!activeRoom ? (
        <Panel className="join-panel">
          <p className="h3">Multiplayer</p>
          <p className="muted" style={{ margin: '4px 0 12px' }}>
            Host a room or join with the same join code your friends see.
          </p>
          <div className="stack">
            <Button variant="sky" block onClick={() => onCreateRoom('number-rush')}>
              Host room
            </Button>
            <div className="join-row">
              <input
                className="field"
                placeholder="JOIN CODE"
                maxLength={6}
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
        </Panel>
      ) : null}

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
    </div>
  );
}
