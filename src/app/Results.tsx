import { Button } from '../ui/Button';
import { Panel } from '../ui/Panel';
import type { GameFinishPayload } from '../games/types';

type Props = {
  title: string;
  payload: GameFinishPayload;
  onAgain: () => void;
  onLibrary: () => void;
};

export function Results({ title, payload, onAgain, onLibrary }: Props) {
  return (
    <div
      className="stack"
      style={{
        flex: 1,
        justifyContent: 'center',
        animation: 'pop-in 0.4s var(--bounce)',
      }}
    >
      <h2
        className="h2"
        style={{
          textAlign: 'center',
          color: 'var(--gold)',
          WebkitTextStroke: '1.5px var(--ink)',
          paintOrder: 'stroke fill',
          textShadow: '2px 2px 0 var(--ink)',
          fontSize: '2rem',
        }}
      >
        Nice run!
      </h2>
      <Panel style={{ textAlign: 'center' }}>
        <p className="h3">{title}</p>
        <p
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '2rem',
            fontWeight: 800,
            margin: '12px 0',
            color: 'var(--red)',
          }}
        >
          {payload.score.label}
        </p>
        {payload.detail ? <p className="muted">{payload.detail}</p> : null}
        <div className="stack" style={{ marginTop: 16 }}>
          <Button variant="primary" block onClick={onAgain}>
            Play again
          </Button>
          <Button variant="sky" block onClick={onLibrary}>
            All games
          </Button>
        </div>
      </Panel>
    </div>
  );
}
