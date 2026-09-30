import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import { ensureNickname, getOrCreatePlayerId } from '../lib/player';
import { isFirebaseConfigured } from '../multiplayer/firebase';
import {
  createVoiceController,
  type VoiceControllerWithMembers,
  type VoiceMember,
  type VoiceStatus,
} from '../multiplayer/voice';
import { Button } from '../ui/Button';
import './PartyVoice.css';

type Props = {
  code: string;
  /** Smaller chrome for in-match. */
  compact?: boolean;
};

function statusHelp(status: VoiceStatus, holding: boolean): string {
  if (!isFirebaseConfigured()) {
    return 'Voice needs online multiplayer (this demo room is local-only).';
  }
  switch (status) {
    case 'idle':
      return 'Optional. Join voice, then hold the button to talk. Release to mute.';
    case 'joining':
      return 'Asking for mic access…';
    case 'ready':
      return 'Hold to talk. Silent mode is fine — use the volume buttons if it’s quiet.';
    case 'live':
      return holding ? 'You’re live — release to stop.' : 'Hold to talk.';
    case 'denied':
      return 'Mic blocked. In iPhone Settings → Safari → Microphone, allow access, then try again. You can still hear others if you join after allowing.';
    case 'unsupported':
      return 'This browser can’t do party voice. Use Safari or Chrome on your phone.';
    case 'offline':
      return 'Voice needs an online party connection.';
    default:
      return '';
  }
}

export function PartyVoice({ code, compact = false }: Props) {
  const self = useMemo(
    () => ({ id: getOrCreatePlayerId(), name: ensureNickname() }),
    [],
  );
  const ctrlRef = useRef<VoiceControllerWithMembers | null>(null);
  const [status, setStatus] = useState<VoiceStatus>('idle');
  const [holding, setHolding] = useState(false);
  const [members, setMembers] = useState<VoiceMember[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    const ctrl = createVoiceController(code, self, () => {
      setStatus(ctrl.getStatus());
      setHolding(ctrl.isHolding());
      setMembers(ctrl.getMembers());
    }) as VoiceControllerWithMembers;
    ctrlRef.current = ctrl;
    setStatus(ctrl.getStatus());
    return () => {
      ctrl.destroy();
      ctrlRef.current = null;
    };
  }, [code, self]);

  // Safety: if the gesture is lost (alert, scroll, OS steal), release talk.
  useEffect(() => {
    const release = () => ctrlRef.current?.releaseTalk();
    window.addEventListener('blur', release);
    window.addEventListener('mouseup', release);
    window.addEventListener('touchcancel', release);
    return () => {
      window.removeEventListener('blur', release);
      window.removeEventListener('mouseup', release);
      window.removeEventListener('touchcancel', release);
    };
  }, []);

  const inVoice = status === 'ready' || status === 'live' || status === 'joining';
  const othersTalking = members.filter((m) => m.talking && m.id !== self.id);

  const onJoin = async () => {
    setError('');
    try {
      await ctrlRef.current?.join();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const onLeave = async () => {
    setError('');
    await ctrlRef.current?.leave();
  };

  const bindPtt = {
    onPointerDown: (e: ReactPointerEvent<HTMLButtonElement>) => {
      if (!inVoice || status === 'joining') return;
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      ctrlRef.current?.pressTalk();
    },
    onPointerUp: (e: ReactPointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      ctrlRef.current?.releaseTalk();
    },
    onPointerCancel: () => ctrlRef.current?.releaseTalk(),
    onLostPointerCapture: () => ctrlRef.current?.releaseTalk(),
    onContextMenu: (e: ReactMouseEvent) => e.preventDefault(),
  };

  return (
    <div className={`party-voice${compact ? ' party-voice--compact' : ''}`}>
      <p className="party-voice-title">Party voice</p>
      <p className="party-voice-help">{statusHelp(status, holding)}</p>
      {error ? <p className="party-voice-alert">{error}</p> : null}

      {members.length ? (
        <div className="party-voice-members" aria-live="polite">
          {members.map((m) => (
            <span
              key={m.id}
              className={`party-voice-chip${m.talking ? ' is-talking' : ''}${
                m.id === self.id ? ' is-you' : ''
              }`}
            >
              <span className="party-voice-dot" aria-hidden />
              {m.name}
              {m.id === self.id ? ' (you)' : ''}
              {m.talking ? ' · talking' : ''}
            </span>
          ))}
        </div>
      ) : null}

      {!inVoice ? (
        <Button
          variant="sky"
          block
          disabled={status === 'unsupported' || status === 'offline'}
          onClick={() => void onJoin()}
        >
          {status === 'denied' ? 'Try mic again' : 'Join voice'}
        </Button>
      ) : (
        <>
          <button
            type="button"
            className={`party-voice-ptt${holding ? ' is-live' : ''}`}
            disabled={status === 'joining'}
            aria-pressed={holding}
            aria-label={holding ? 'On air, release to mute' : 'Hold to talk'}
            {...bindPtt}
          >
            {status === 'joining' ? 'Joining…' : holding ? 'On air — release' : 'Hold to talk'}
          </button>
          {othersTalking.length ? (
            <p className="party-voice-help" style={{ marginTop: 8, marginBottom: 0 }}>
              Hearing {othersTalking.map((m) => m.name).join(', ')}
            </p>
          ) : null}
          <div className="party-voice-actions">
            <Button variant="ghost" onClick={() => void onLeave()}>
              Leave voice
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
