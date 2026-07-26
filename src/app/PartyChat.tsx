import { useEffect, useMemo, useRef, useState } from 'react';
import { ensureNickname, getOrCreatePlayerId } from '../lib/player';
import {
  chatList,
  sendChatMessage,
  subscribeRoom,
  type ChatMessage,
  type RoomData,
} from '../multiplayer/rooms';
import { Button } from '../ui/Button';
import { sfxTap } from '../lib/sfx';
import './PartyChat.css';

const TOAST_MS = 2500;
const NUDGE_TOAST_MS = 2500;

type Props = {
  code: string;
};

function useVisibleFrame(active: boolean) {
  const [frame, setFrame] = useState(() => ({
    top: 0,
    height: typeof window !== 'undefined' ? window.innerHeight : 600,
  }));

  useEffect(() => {
    if (!active) return;
    const sync = () => {
      const vv = window.visualViewport;
      if (vv) {
        setFrame({ top: vv.offsetTop, height: vv.height });
      } else {
        setFrame({ top: 0, height: window.innerHeight });
      }
    };
    sync();
    const vv = window.visualViewport;
    vv?.addEventListener('resize', sync);
    vv?.addEventListener('scroll', sync);
    window.addEventListener('resize', sync);
    return () => {
      vv?.removeEventListener('resize', sync);
      vv?.removeEventListener('scroll', sync);
      window.removeEventListener('resize', sync);
    };
  }, [active]);

  return frame;
}

export function PartyChatChrome({ code }: Props) {
  const [room, setRoom] = useState<RoomData | null>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [toasts, setToasts] = useState<(ChatMessage & { id: string })[]>([]);
  const seen = useRef<Set<string>>(new Set());
  const bootstrapped = useRef(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const frame = useVisibleFrame(open);
  const player = useMemo(
    () => ({ id: getOrCreatePlayerId(), name: ensureNickname() }),
    [],
  );

  useEffect(() => {
    bootstrapped.current = false;
    seen.current = new Set();
    setToasts([]);
    const unsub = subscribeRoom(code, setRoom);
    return () => unsub();
  }, [code]);

  const messages = room ? chatList(room) : [];

  useEffect(() => {
    if (!messages.length) {
      bootstrapped.current = true;
      return;
    }
    if (!bootstrapped.current) {
      messages.forEach((m) => seen.current.add(m.id));
      bootstrapped.current = true;
      return;
    }
    const fresh = messages.filter((m) => !seen.current.has(m.id));
    fresh.forEach((m) => seen.current.add(m.id));
    const incoming = fresh.filter((m) => m.fromId !== player.id);
    if (!incoming.length) return;
    setToasts((t) => [...t, ...incoming].slice(-4));
    incoming.forEach((m) => {
      window.setTimeout(() => {
        setToasts((t) => t.filter((x) => x.id !== m.id));
      }, TOAST_MS);
    });
  }, [messages, player.id]);

  useEffect(() => {
    if (!open) return;
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
    // Focus after layout so the sheet is on-screen above the keyboard.
    const t = window.setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [open, messages.length]);

  const myNudgeAt = room?.nudges?.[player.id]?.at;
  const myNudgeFrom = room?.nudges?.[player.id]?.fromName;
  useEffect(() => {
    if (!myNudgeAt || !myNudgeFrom) return;
    const id = `nudge-${myNudgeAt}`;
    if (seen.current.has(id)) return;
    seen.current.add(id);
    setToasts((t) =>
      [
        ...t,
        {
          id,
          fromId: 'nudge',
          fromName: myNudgeFrom,
          text: 'Ready to go?',
          at: myNudgeAt,
        },
      ].slice(-4),
    );
    window.setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== id));
    }, NUDGE_TOAST_MS);
  }, [myNudgeAt, myNudgeFrom]);

  const send = async () => {
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    sfxTap();
    try {
      await sendChatMessage(code, player, text);
    } catch {
      /* ignore */
    }
  };

  return (
    <>
      <div className="chat-toasts" aria-live="polite">
        {toasts.map((m) => (
          <div key={m.id} className="chat-toast">
            <strong>{m.fromName}</strong>: {m.text}
          </div>
        ))}
      </div>

      {!open ? (
        <button
          type="button"
          className="chat-fab"
          onClick={() => {
            sfxTap();
            setOpen(true);
          }}
          aria-label="Open party chat"
        >
          Chat
        </button>
      ) : null}

      {open ? (
        <div
          className="chat-overlay"
          role="dialog"
          aria-modal="true"
          style={{ top: frame.top, height: frame.height }}
        >
          <div className="chat-sheet">
            <div className="chat-sheet-head">
              <p className="h3" style={{ margin: 0 }}>
                Party chat
              </p>
              <Button
                variant="ghost"
                onClick={() => {
                  setOpen(false);
                  setDraft('');
                }}
              >
                Close
              </Button>
            </div>
            <div className="chat-list" ref={listRef}>
              {messages.length === 0 ? (
                <p className="muted" style={{ fontWeight: 700 }}>
                  Say hi — everyone in the party sees it.
                </p>
              ) : (
                messages.map((m) => (
                  <div
                    key={m.id}
                    className={`chat-bubble ${m.fromId === player.id ? 'mine' : ''}`}
                  >
                    <span className="chat-who">{m.fromName}</span>
                    <span className="chat-text">{m.text}</span>
                  </div>
                ))
              )}
            </div>
            <form
              className="chat-compose"
              onSubmit={(e) => {
                e.preventDefault();
                void send();
              }}
            >
              <input
                ref={inputRef}
                className="field"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Message the party…"
                maxLength={200}
                enterKeyHint="send"
                autoComplete="off"
                autoCorrect="off"
              />
              <Button type="submit" variant="primary" disabled={!draft.trim()}>
                Send
              </Button>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
