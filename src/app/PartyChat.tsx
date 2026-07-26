import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
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

type ChatCtx = {
  openChat: () => void;
  enabled: boolean;
};

const PartyChatContext = createContext<ChatCtx>({
  openChat: () => undefined,
  enabled: false,
});

export function usePartyChat() {
  return useContext(PartyChatContext);
}

/** In-flow Chat control for headers — never fixed/overlapping. */
export function ChatButton() {
  const { openChat, enabled } = usePartyChat();
  if (!enabled) return null;
  return (
    <Button
      variant="gold"
      className="chat-header-btn"
      onClick={() => {
        sfxTap();
        openChat();
      }}
      aria-label="Open party chat"
    >
      Chat
    </Button>
  );
}

/**
 * Header row: title | Chat (party) | action.
 * Flex + shrink-safe title so buttons never overlap.
 */
export function ScreenHeader({
  title,
  action,
}: {
  title: ReactNode;
  action?: ReactNode;
}) {
  const { enabled } = usePartyChat();
  return (
    <header className={`screen-header${enabled ? ' screen-header--party' : ''}`}>
      <div className="screen-header-title">{title}</div>
      {enabled ? <ChatButton /> : null}
      {action ? <div className="screen-header-action">{action}</div> : null}
    </header>
  );
}

type ProviderProps = {
  code: string | null;
  children: ReactNode;
};

export function PartyChatProvider({ code, children }: ProviderProps) {
  const [room, setRoom] = useState<RoomData | null>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [toasts, setToasts] = useState<(ChatMessage & { id: string })[]>([]);
  /** Fixed sheet height in px, captured when opening (before keyboard). */
  const [sheetPx, setSheetPx] = useState(280);
  const seen = useRef<Set<string>>(new Set());
  const bootstrapped = useRef(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollLockY = useRef(0);
  const player = useMemo(
    () => ({ id: getOrCreatePlayerId(), name: ensureNickname() }),
    [],
  );

  useEffect(() => {
    if (!code) {
      setRoom(null);
      setOpen(false);
      setToasts([]);
      bootstrapped.current = false;
      seen.current = new Set();
      return;
    }
    // New room/session: forget prior messages so history never toasts as "new".
    bootstrapped.current = false;
    seen.current = new Set();
    setToasts([]);
    setRoom(null);
    const unsub = subscribeRoom(code, setRoom);
    return () => unsub();
  }, [code]);

  const messages = room && code ? chatList(room) : [];

  // Seed "seen" from the first real room snapshot only — never toast history.
  useEffect(() => {
    if (!code || !room) return;
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
  }, [messages, player.id, code, room]);

  // Freeze page + sheet geometry while chat is open. Counter iOS visualViewport
  // pan on #root so the sheet and the game behind stay vertically still.
  useEffect(() => {
    if (!open) return;

    // Keep the whole sheet in the upper portion so the keyboard never covers the input.
    const h = Math.min(Math.round(window.innerHeight * 0.42), 360);
    setSheetPx(Math.max(240, h));

    scrollLockY.current = window.scrollY || window.pageYOffset || 0;
    const body = document.body;
    const html = document.documentElement;
    const root = document.getElementById('root');
    const prevBody = body.style.cssText;
    const prevHtml = html.style.cssText;
    const prevRoot = root?.style.cssText ?? '';

    body.style.cssText = [
      'position:fixed',
      'width:100%',
      `top:-${scrollLockY.current}px`,
      'left:0',
      'right:0',
      'overflow:hidden',
      'touch-action:none',
    ].join(';');
    html.style.cssText = 'overflow:hidden;height:100%;';
    if (root) {
      root.style.overflow = 'hidden';
      root.style.height = '100%';
      root.style.touchAction = 'none';
    }

    const pinViewport = () => {
      window.scrollTo(0, 0);
      const vv = window.visualViewport;
      if (!root) return;
      if (!vv) {
        root.style.transform = '';
        return;
      }
      // Cancel iOS visual-viewport pan so fixed UI + game stay put on screen.
      const y = vv.offsetTop || 0;
      const x = vv.offsetLeft || 0;
      root.style.transform = y || x ? `translate(${x}px, ${y}px)` : '';
    };

    pinViewport();
    window.addEventListener('scroll', pinViewport, { passive: true });
    const vv = window.visualViewport;
    vv?.addEventListener('scroll', pinViewport, { passive: true });
    vv?.addEventListener('resize', pinViewport, { passive: true });

    return () => {
      window.removeEventListener('scroll', pinViewport);
      vv?.removeEventListener('scroll', pinViewport);
      vv?.removeEventListener('resize', pinViewport);
      body.style.cssText = prevBody;
      html.style.cssText = prevHtml;
      if (root) root.style.cssText = prevRoot;
      window.scrollTo(0, scrollLockY.current);
    };
  }, [open]);

  // Do not auto-focus on open — focusing the field is what triggers the iOS pan.

  // Keep list scrolled to latest without touching focus/layout.
  useEffect(() => {
    if (!open) return;
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [open, messages.length]);

  const myNudgeAt = room?.nudges?.[player.id]?.at;
  const myNudgeFrom = room?.nudges?.[player.id]?.fromName;
  useEffect(() => {
    if (!code || !myNudgeAt || !myNudgeFrom) return;
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
  }, [myNudgeAt, myNudgeFrom, code]);

  const openChat = useCallback(() => setOpen(true), []);
  const ctx = useMemo(
    () => ({ openChat, enabled: !!code }),
    [openChat, code],
  );

  const send = async () => {
    if (!code) return;
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    sfxTap();
    inputRef.current?.focus({ preventScroll: true });
    try {
      await sendChatMessage(code, player, text);
    } catch {
      /* ignore */
    }
    inputRef.current?.focus({ preventScroll: true });
  };

  const closeChat = () => {
    setOpen(false);
    setDraft('');
  };

  const pinRootNow = () => {
    window.scrollTo(0, 0);
    const root = document.getElementById('root');
    const vv = window.visualViewport;
    if (!root) return;
    if (!vv) {
      root.style.transform = '';
      return;
    }
    const y = vv.offsetTop || 0;
    const x = vv.offsetLeft || 0;
    root.style.transform = y || x ? `translate(${x}px, ${y}px)` : '';
  };

  const onFieldFocus = () => {
    // Re-pin immediately on focus — iOS pans asynchronously after this.
    pinRootNow();
    window.requestAnimationFrame(pinRootNow);
    window.setTimeout(pinRootNow, 50);
    window.setTimeout(pinRootNow, 150);
    window.setTimeout(pinRootNow, 300);
  };

  return (
    <PartyChatContext.Provider value={ctx}>
      {children}

      {code ? (
        <div className="chat-toasts" aria-live="polite">
          {toasts.map((m) => (
            <div key={m.id} className="chat-toast">
              <strong>{m.fromName}</strong>: {m.text}
            </div>
          ))}
        </div>
      ) : null}

      {code && open ? (
        <div
          className="chat-overlay"
          role="dialog"
          aria-modal="true"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeChat();
          }}
        >
          <div
            className="chat-sheet"
            style={{ height: sheetPx, maxHeight: sheetPx }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="chat-sheet-head">
              <p className="h3" style={{ margin: 0 }}>
                Party chat
              </p>
              <Button variant="ghost" onClick={closeChat}>
                Close
              </Button>
            </div>
            {/* Composer at the TOP so iOS never needs to pan the viewport to
                keep the caret above the keyboard. */}
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
                onPointerDown={(e) => {
                  // Take focus ourselves with preventScroll so Safari does not
                  // vertically pan the page to the caret.
                  e.preventDefault();
                  inputRef.current?.focus({ preventScroll: true });
                  onFieldFocus();
                }}
                onFocus={onFieldFocus}
                placeholder="Message the party…"
                maxLength={200}
                enterKeyHint="send"
                autoComplete="off"
                autoCorrect="off"
                inputMode="text"
              />
              <Button
                type="submit"
                variant="primary"
                disabled={!draft.trim()}
                onMouseDown={(e) => {
                  e.preventDefault();
                }}
              >
                Send
              </Button>
            </form>
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
          </div>
        </div>
      ) : null}
    </PartyChatContext.Provider>
  );
}
