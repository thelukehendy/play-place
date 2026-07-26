import { useEffect, useState } from 'react';
import { Button } from '../ui/Button';
import { Panel } from '../ui/Panel';
import { ensureNickname, getNickname, setNickname } from '../lib/player';
import './Home.css';

type Props = {
  invited: boolean;
  onContinue: (nickname: string) => void;
};

/** Splash → nickname (after 1s) → continue into library or invite lobby. */
export function Welcome({ invited, onContinue }: Props) {
  const [showNick, setShowNick] = useState(false);
  const [nick, setNick] = useState(() => ensureNickname());

  useEffect(() => {
    const t = window.setTimeout(() => setShowNick(true), 1000);
    return () => clearTimeout(t);
  }, []);

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

      {showNick ? (
        <Panel className="welcome-nick">
          {invited ? (
            <p className="muted" style={{ marginBottom: 10 }}>
              You&apos;ve been invited to a party — pick a nickname, then jump in.
            </p>
          ) : null}
          <label className="stack">
            <span className="h3">Your nickname</span>
            <div className="nick-row">
              <input
                className="field"
                value={nick}
                maxLength={16}
                autoFocus
                onChange={(e) => setNick(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const v = nick.trim() || getNickname() || ensureNickname();
                    setNickname(v);
                    onContinue(v);
                  }
                }}
              />
            </div>
          </label>
          <div style={{ height: 12 }} />
          <Button
            variant="primary"
            block
            onClick={() => {
              const v = nick.trim() || getNickname() || ensureNickname();
              setNickname(v);
              onContinue(v);
            }}
          >
            {invited ? 'Join party' : "Let's Play!"}
          </Button>
        </Panel>
      ) : (
        <p className="muted" style={{ textAlign: 'center', fontWeight: 800 }}>
          Loading the fun…
        </p>
      )}
    </div>
  );
}
