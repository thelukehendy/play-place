import { useState } from 'react';
import { Button } from '../ui/Button';
import { Panel } from '../ui/Panel';
import { ensureNickname, getNickname, setNickname } from '../lib/player';
import './Home.css';

type Props = {
  onPlay: () => void;
  activeRoom?: string | null;
  onLobby?: () => void;
  onQuitMultiplayer?: () => void;
};

export function Home({
  onPlay,
  activeRoom,
  onLobby,
  onQuitMultiplayer,
}: Props) {
  const [nick, setNick] = useState(() => ensureNickname());

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
            You&apos;re still in room <strong>{activeRoom}</strong>. Open games to see who&apos;s
            playing or in the lobby.
          </p>
          <div className="stack">
            <Button
              variant="primary"
              block
              onClick={() => {
                setNickname(nick);
                onPlay();
              }}
            >
              Browse games
            </Button>
            {onLobby ? (
              <Button variant="sky" block onClick={onLobby}>
                Lobby
              </Button>
            ) : null}
            {onQuitMultiplayer ? (
              <Button variant="ghost" block onClick={onQuitMultiplayer}>
                Quit multiplayer
              </Button>
            ) : null}
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
              onBlur={() => {
                const v = nick.trim() || getNickname();
                setNickname(v);
                setNick(v);
              }}
            />
          </div>
        </label>
        {!activeRoom ? (
          <>
            <div style={{ height: 12 }} />
            <Button
              variant="primary"
              block
              onClick={() => {
                setNickname(nick);
                onPlay();
              }}
            >
              Let&apos;s Play!
            </Button>
          </>
        ) : null}
      </Panel>
    </div>
  );
}
