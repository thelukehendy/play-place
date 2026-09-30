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
import { createPortal } from 'react-dom';
import { ensureNickname, getOrCreatePlayerId } from '../lib/player';
import {
  chatList,
  noticeList,
  sendChatMessage,
  subscribeRoom,
  type ChatMessage,
  type RoomData,
  type RoomNotice,
} from '../multiplayer/rooms';
import { Button } from '../ui/Button';
import { sfxTap } from '../lib/sfx';
import './PartyChat.css';

const TOAST_MS = 2500;
const NUDGE_TOAST_MS = 2500;

type ChatCtx = {
  openChat: () => void;
  enabled: boolean;
  unread: number;
};

const PartyChatContext = createContext<ChatCtx>({
  openChat: () => undefined,
  enabled: false,
  unread: 0,
});

export function usePartyChat() {
  return useContext(PartyChatContext);
}

/** In-flow Chat control for headers — never fixed/overlapping. */
export function ChatButton() {
  const { openChat, enabled, unread } = usePartyChat();
  if (!enabled) return null;
  return (
    <Button
      variant="gold"
      className="chat-header-btn"
      onClick={() => {
        sfxTap();
        openChat();
      }}
      aria-label={unread ? `Open party chat, ${unread} new` : 'Open party chat'}
    >
      Chat
      {unread > 0 ? <span className="chat-unread-badge">{unread > 9 ? '9+' : unread}</span> : null}
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

type Frame = { top: number; left: number; width: number; height: number };

function readFrame(): Frame {
  const vv = window.visualViewport;
  if (vv) {
    return {
      top: vv.offsetTop,
      left: vv.offsetLeft,
      width: vv.width,
      height: vv.height,
    };
  }
  return {
    top: 0,
    left: 0,
    width: window.innerWidth,
    height: window.innerHeight,
  };
}

export function PartyChatProvider({ code, children }: ProviderProps) {
  const [room, setRoom] = useState<RoomData | null>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [unread, setUnread] = useState(0);
  const [toasts, setToasts] = useState<(ChatMessage & { id: string })[]>([]);
  /** Visible viewport frame — updated every animation frame while chat is open. */
  const [frame, setFrame] = useState<Frame>(() =>
    typeof window !== 'undefined'
      ? readFrame()
      : { top: 0, left: 0, width: 390, height: 700 },
  );
  /** Sheet height captured once on open from the pre-keyboard viewport. */
  const sheetPx = useRef(280);
  const seen = useRef<Set<string>>(new Set());
  const seenNotices = useRef<Set<string>>(new Set());
  const bootstrapped = useRef(false);
  const noticesBootstrapped = useRef(false);
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
      setUnread(0);
      bootstrapped.current = false;
      noticesBootstrapped.current = false;
      seen.current = new Set();
      seenNotices.current = new Set();
      return;
    }
    bootstrapped.current = false;
    noticesBootstrapped.current = false;
    seen.current = new Set();
    seenNotices.current = new Set();
    setToasts([]);
    setUnread(0);
    setRoom(null);
    const unsub = subscribeRoom(code, setRoom);
    return () => unsub();
  }, [code]);

  const messages = room && code ? chatList(room) : [];
  const notices = room && code ? noticeList(room) : [];

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
    if (!open) setUnread((u) => Math.min(99, u + incoming.length));
    setToasts((t) => [...t, ...incoming].slice(-4));
    incoming.forEach((m) => {
      window.setTimeout(() => {
        setToasts((t) => t.filter((x) => x.id !== m.id));
      }, TOAST_MS);
    });
  }, [messages, player.id, code, room, open]);

  useEffect(() => {
    if (!code || !room) return;
    if (!noticesBootstrapped.current) {
      notices.forEach((n) => seenNotices.current.add(n.id));
      noticesBootstrapped.current = true;
      return;
    }
    const fresh = notices.filter((n) => !seenNotices.current.has(n.id));
    fresh.forEach((n) => seenNotices.current.add(n.id));
    // Skip notices about yourself (you already know you left / were made host locally).
    const incoming = fresh.filter((n) => n.playerId !== player.id);
    if (!incoming.length) return;
    const asToasts = incoming.map((n: RoomNotice & { id: string }) => ({
      id: n.id,
      fromId: 'system',
      fromName: 'Party',
      text: n.text,
      at: n.at,
    }));
    setToasts((t) => [...t, ...asToasts].slice(-4));
    asToasts.forEach((m) => {
      window.setTimeout(() => {
        setToasts((t) => t.filter((x) => x.id !== m.id));
      }, TOAST_MS);
    });
  }, [notices, player.id, code, room]);

  // While chat is open: lock document scroll and continuously pin the portal to
  // the *visual* viewport so iOS keyboard pan cannot slide anything vertically.
  useEffect(() => {
    if (!open) return;

    const preKeyboard = window.visualViewport?.height ?? window.innerHeight;
    sheetPx.current = Math.max(240, Math.min(Math.round(preKeyboard * 0.4), 340));

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
    html.style.overflow = 'hidden';
    if (root) {
      root.style.overflow = 'hidden';
      root.style.touchAction = 'none';
    }

    let raf = 0;
    let lastKey = '';
    const tick = () => {
      const next = readFrame();
      const key = `${next.top}|${next.left}|${next.width}|${next.height}`;
      if (key !== lastKey) {
        lastKey = key;
        setFrame(next);
        // Cancel layout-viewport pan on the app so the game stays put too.
        if (root) {
          root.style.transform =
            next.top || next.left
              ? `translate(${next.left}px, ${next.top}px)`
              : '';
        }
      }
      if (window.scrollY !== 0) window.scrollTo(0, 0);
      raf = window.requestAnimationFrame(tick);
    };
    setFrame(readFrame());
    raf = window.requestAnimationFrame(tick);

    return () => {
      window.cancelAnimationFrame(raf);
      body.style.cssText = prevBody;
      html.style.cssText = prevHtml;
      if (root) root.style.cssText = prevRoot;
      window.scrollTo(0, scrollLockY.current);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [open, messages.length]);

  const myNudgeAt = room?.nudges?.[player.id]?.at;
  const myNudgeFrom = room?.nudges?.[player.id]?.fromName;
  const myNudgeText = room?.nudges?.[player.id]?.text;
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
          text: myNudgeText || 'Ready to go?',
          at: myNudgeAt,
        },
      ].slice(-4),
    );
    window.setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== id));
    }, NUDGE_TOAST_MS);
  }, [myNudgeAt, myNudgeFrom, myNudgeText, code]);

  const openChat = useCallback(() => {
    setOpen(true);
    setUnread(0);
  }, []);
  const ctx = useMemo(
    () => ({ openChat, enabled: !!code, unread }),
    [openChat, code, unread],
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

  // Fixed height from open — do not shrink with the keyboard (avoids vertical jump).
  const sheetHeight = Math.min(sheetPx.current, Math.max(200, frame.height - 24));

  const overlay =
    code && open
      ? createPortal(
          <div
            className="chat-overlay"
            role="dialog"
            aria-modal="true"
            style={{
              top: frame.top,
              left: frame.left,
              width: frame.width,
              height: frame.height,
            }}
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) closeChat();
            }}
          >
            <div
              className="chat-sheet"
              style={{ height: sheetHeight, maxHeight: sheetHeight }}
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
                    e.preventDefault();
                    inputRef.current?.focus({ preventScroll: true });
                  }}
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
                  onMouseDown={(e) => e.preventDefault()}
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
          </div>,
          document.body,
        )
      : null;

  const toastNode =
    code && toasts.length
      ? createPortal(
          <div
            className="chat-toasts"
            aria-live="polite"
            style={{ top: frame.top + 12 + 48 }}
          >
            {toasts.map((m) => (
              <div key={m.id} className="chat-toast">
                <strong>{m.fromName}</strong>: {m.text}
              </div>
            ))}
          </div>,
          document.body,
        )
      : null;

  return (
    <PartyChatContext.Provider value={ctx}>
      {children}
      {toastNode}
      {overlay}
    </PartyChatContext.Provider>
  );
}
