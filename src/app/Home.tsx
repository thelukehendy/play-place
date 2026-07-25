import { useState } from 'react';
import { Button } from '../ui/Button';
import { Panel } from '../ui/Panel';
import { ensureNickname, getNickname, setNickname } from '../lib/player';
import './Home.css';

type Props = {
  onPlay: () => void;
  activeRoom?: string | null;
  onReturnToRoom?: () => void;
  onQuitMultiplayer?: () => void;
  onCreateRoom?: () => void;
  onJoinRoom?: (code: string) => void;
  busy?: boolean;
};

export function Home({
  onPlay,
  activeRoom,
  onReturnToRoom,
  onQuitMultiplayer,
  onCreateRoom,
  onJoinRoom,
  busy,
}: Props) {
  const [nick, setNick] = useState(() => ensureNickname());
  const [joinCode, setJoinCode] = useState('');

  const saveNick = () => {
    const v = nick.trim() || getNickname();
    setNickname(v);
    setNick(v);
    return v;
  };

  return (
    <div className="home">
      <div className="home-sky">
        <div className="home-blocks" aria-hidden>
          <div className="toy-block" />
          <div className="toy-block" />
          <div className="toy-block" />
          <div className="toy-block" />
        </div>
        <h1 className="h1">Play Place</h1>
        <p className="home-tag">Mini-games. Big grins. Phone-ready fun.</p>
        <div className="home-pipe" aria-hidden />
      </div>

      {activeRoom ? (
        <Panel className="party-panel">
          <p className="h3">Party linked</p>
          <p className="muted" style={{ margin: '4px 0 10px' }}>
            You&apos;re still in room <strong>{activeRoom}</strong> with your friends.
          </p>
          <div className="stack">
            <Button variant="primary" block onClick={onReturnToRoom} disabled={busy}>
              Back to room
            </Button>
            <Button variant="ghost" block onClick={onQuitMultiplayer} disabled={busy}>
              Quit multiplayer
            </Button>
          </div>
        </Panel>
      ) : null}

      <Panel>
        <label className="stack">
          <span className="h3">Your nickname</span>
          <div className="nick-row">
            <input
              className="field"
              value={nick}
              maxLength={16}
              onChange={(e) => setNick(e.target.value)}
              onBlur={saveNick}
            />
          </div>
        </label>
        <div style={{ height: 12 }} />
        <Button
          variant={activeRoom ? 'sky' : 'primary'}
          block
          disabled={busy}
          onClick={() => {
            saveNick();
            onPlay();
          }}
        >
          {activeRoom ? 'Browse games' : "Let's Play!"}
        </Button>
      </Panel>

      {!activeRoom ? (
        <Panel className="home-multi">
          <p className="h3">Play with friends</p>
          <p className="muted" style={{ margin: '4px 0 12px' }}>
            Create a room and share the link, or join with a code.
          </p>
          <div className="stack">
            <Button
              variant="sky"
              block
              disabled={busy}
              onClick={() => {
                saveNick();
                onCreateRoom?.();
              }}
            >
              Create room
            </Button>
            <div className="join-row">
              <input
                className="field"
                placeholder="ROOM CODE"
                maxLength={6}
                value={joinCode}
                disabled={busy}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && joinCode.trim().length >= 4) {
                    saveNick();
                    onJoinRoom?.(joinCode.trim());
                  }
                }}
              />
              <Button
                variant="green"
                disabled={busy || joinCode.trim().length < 4}
                onClick={() => {
                  saveNick();
                  onJoinRoom?.(joinCode.trim());
                }}
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
