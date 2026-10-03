import { useEffect, useState } from 'react';
import { Button } from '../ui/Button';
import { Panel } from '../ui/Panel';
import { Confetti } from '../ui/Confetti';
import type { GameFinishPayload } from '../games/types';
import type { SoloRecord } from '../lib/bests';
import type { DailyRecord } from '../lib/daily';
import { getGame } from '../games/registry';
import { copyText } from '../lib/invite';
import { sfxBest, sfxFinish } from '../lib/sfx';
import { ScreenHeader } from './PartyChat';

export type SoloResult = {
  gameId: string;
  title: string;
  payload: GameFinishPayload;
  record: SoloRecord;
  daily?: DailyRecord & { dateKey: string };
};

type Props = {
  result: SoloResult;
  onAgain: () => void;
  onLibrary: () => void;
};

function appUrl(): string {
  const url = new URL(window.location.href);
  url.search = '';
  url.hash = '';
  return url.toString();
}

async function shareScore(result: SoloResult): Promise<'shared' | 'copied' | 'failed'> {
  const game = getGame(result.gameId);
  const daily = result.daily ? ` (Daily ${result.daily.dateKey})` : '';
  const text = `${game?.emoji ?? '🎮'} ${result.title}${daily}: ${result.payload.score.label} — can you beat it?`;
  const url = appUrl();
  if (navigator.share) {
    try {
      await navigator.share({ title: 'Play Place', text, url });
      return 'shared';
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return 'failed';
    }
  }
  return (await copyText(`${text} ${url}`)) ? 'copied' : 'failed';
}

export function Results({ result, onAgain, onLibrary }: Props) {
  const { payload, record, daily } = result;
  const [note, setNote] = useState('');
  const celebrate = record.isNewBest && !record.isFirst;

  useEffect(() => {
    if (celebrate) sfxBest();
    else sfxFinish();
  }, [celebrate]);

  const headline = record.isFirst
    ? 'First one in the books!'
    : record.isNewBest
      ? 'New personal best!'
      : 'Nice run!';

  return (
    <div
      className="stack"
      style={{
        flex: 1,
        justifyContent: 'center',
        animation: 'pop-in 0.4s var(--bounce)',
      }}
    >
      {celebrate ? <Confetti /> : null}
      <ScreenHeader
        title={
          <h2
            className="h2"
            style={{
              color: 'var(--gold)',
              WebkitTextStroke: '1.5px var(--ink)',
              paintOrder: 'stroke fill',
              textShadow: '2px 2px 0 var(--ink)',
            }}
          >
            {headline}
          </h2>
        }
        action={
          <Button variant="ghost" onClick={onLibrary}>
            Games
          </Button>
        }
      />
      <Panel style={{ textAlign: 'center' }}>
        <p className="h3">{result.title}</p>
        <p
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '2rem',
            fontWeight: 800,
            margin: '12px 0 6px',
            color: 'var(--red)',
          }}
        >
          {payload.score.label}
        </p>
        {celebrate ? <p className="result-badge">🏆 New best</p> : null}
        {!record.isNewBest && record.prev ? (
          <p className="muted">Your best: {record.prev.label}</p>
        ) : null}
        {record.isNewBest && record.prev ? (
          <p className="muted">Previous best: {record.prev.label}</p>
        ) : null}
        {payload.detail ? <p className="muted">{payload.detail}</p> : null}
        {daily ? (
          <p className="result-daily">
            📅 Daily done · 🔥 {daily.streak}-day streak
            {daily.isBest && daily.prev ? ' · new daily best!' : ''}
          </p>
        ) : null}
        <p className="muted" style={{ fontSize: '0.8rem', marginTop: 6 }}>
          Run #{record.plays} on this game
        </p>
        <div className="stack" style={{ marginTop: 16 }}>
          {daily ? null : (
            <Button variant="primary" block onClick={onAgain}>
              Play again
            </Button>
          )}
          <Button
            variant={daily ? 'primary' : 'gold'}
            block
            onClick={async () => {
              const res = await shareScore(result);
              setNote(
                res === 'shared' ? 'Shared!' : res === 'copied' ? 'Copied to clipboard.' : '',
              );
            }}
          >
            Share my score
          </Button>
          {note ? (
            <p className="muted" style={{ fontWeight: 800, color: 'var(--green-dark)' }}>
              {note}
            </p>
          ) : null}
          <Button variant="sky" block onClick={onLibrary}>
            All games
          </Button>
        </div>
      </Panel>
    </div>
  );
}
