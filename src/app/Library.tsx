import { useState } from 'react';
import { GAMES } from '../games/registry';
import { Button } from '../ui/Button';
import { Panel } from '../ui/Panel';
import { PartyLinked } from './PartyLinked';
import './Library.css';

type Props = {
  onBack: () => void;
  onSolo: (gameId: string) => void;
  onCreateRoom: (gameId: string) => void;
  onJoinRoom: (code: string) => void;
  activeRoom?: string | null;
  isHost?: boolean;
  onLobby?: () => void;
  onQuitMultiplayer?: () => void;
  /** In a party: host tapping a game starts it for everyone. */
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
        setHostNote('Only the host can switch games. Hang tight!');
      }
      return;
    }
    setPicked(gameId);
  };

  return (
    <div className="library">
      <div className="library-header">
        <h2 className="h2">Game Place</h2>
        <Button variant="ghost" onClick={onBack}>
          Home
        </Button>
      </div>

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
            ? 'Tap a game to start it for everyone right away.'
            : 'Host picks the next game — you\'ll jump in automatically.'}
        </p>
      ) : null}

      <div className="game-grid">
        {GAMES.map((g) => (
          <button
            key={g.id}
            type="button"
            className="game-card"
            style={{ borderColor: 'var(--ink)', boxShadow: `0 4px 0 var(--ink)` }}
            onClick={() => pickGame(g.id)}
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
            Host a room or join with a friend&apos;s code.
          </p>
          <div className="stack">
            <Button variant="sky" block onClick={() => onCreateRoom('number-rush')}>
              Host room
            </Button>
            <div className="join-row">
              <input
                className="field"
                placeholder="CODE"
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

      {picked && !activeRoom ? (
        <div className="pick-modal" role="dialog" aria-modal="true">
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
        </div>
      ) : null}
    </div>
  );
}
