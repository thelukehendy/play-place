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
  onLobby?: () => void;
  onQuitMultiplayer?: () => void;
  onPlayInRoom?: (gameId: string) => void;
};

export function Library({
  onBack,
  onSolo,
  onCreateRoom,
  onJoinRoom,
  activeRoom,
  onLobby,
  onQuitMultiplayer,
  onPlayInRoom,
}: Props) {
  const [code, setCode] = useState('');
  const [picked, setPicked] = useState<string | null>(null);

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

      <div className="game-grid">
        {GAMES.map((g) => (
          <button
            key={g.id}
            type="button"
            className="game-card"
            style={{ borderColor: 'var(--ink)', boxShadow: `0 4px 0 var(--ink)` }}
            onClick={() => setPicked(g.id)}
          >
            <span className="emoji" aria-hidden>
              {g.emoji}
            </span>
            <span className="title">{g.title}</span>
            <span className="blurb">{g.blurb}</span>
          </button>
        ))}
      </div>

      {picked ? (
        <Panel className="join-panel">
          <p className="h3">{GAMES.find((g) => g.id === picked)?.title}</p>
          <p className="muted" style={{ marginTop: 4, marginBottom: 12 }}>
            {GAMES.find((g) => g.id === picked)?.blurb}
          </p>
          <div className="stack">
            <Button variant="gold" block onClick={() => onSolo(picked)}>
              Play Solo
            </Button>
            {activeRoom && onPlayInRoom ? (
              <Button
                variant="primary"
                block
                onClick={() => {
                  onPlayInRoom(picked);
                  setPicked(null);
                }}
              >
                Play with party
              </Button>
            ) : (
              <Button variant="sky" block onClick={() => onCreateRoom(picked)}>
                Create Room
              </Button>
            )}
            <Button variant="ghost" block onClick={() => setPicked(null)}>
              Cancel
            </Button>
          </div>
        </Panel>
      ) : null}

      {!activeRoom && !picked ? (
        <Panel className="join-panel">
          <p className="h3">Multiplayer</p>
          <p className="muted" style={{ margin: '4px 0 12px' }}>
            Create a room for any game above, or join a friend&apos;s code.
          </p>
          <div className="stack">
            <Button
              variant="sky"
              block
              onClick={() => onCreateRoom('number-rush')}
            >
              Create room
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
    </div>
  );
}
