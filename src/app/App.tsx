import { useCallback, useEffect, useRef, useState } from 'react';
import { Welcome } from './Welcome';
import { Library } from './Library';
import { SoloPlay } from './SoloPlay';
import { RoomSession } from './RoomSession';
import { Results } from './Results';
import { Stats } from './Stats';
import {
  allConnectedReady,
  createRoom,
  getPresence,
  joinRoom,
  leaveRoom,
  quitMatch,
  setRoomGame,
  startPartyGame,
  subscribeRoom,
  type RoomData,
} from '../multiplayer/rooms';
import { ensureNickname, getOrCreatePlayerId } from '../lib/player';
import type { GameFinishPayload } from '../games/types';
import { Panel } from '../ui/Panel';
import { Button } from '../ui/Button';
import { PartyChatProvider } from './PartyChat';

const ACTIVE_ROOM_KEY = 'playplace.activeRoom';

type Screen =
  | { name: 'welcome' }
  | { name: 'library' }
  | { name: 'stats' }
  | { name: 'solo'; gameId: string; key: number }
  | { name: 'room' }
  | {
      name: 'results';
      gameId: string;
      title: string;
      payload: GameFinishPayload;
    };

function readRoomFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search);
  const room = params.get('room');
  return room ? room.toUpperCase() : null;
}

function readStoredRoom(): string | null {
  try {
    const v = localStorage.getItem(ACTIVE_ROOM_KEY);
    return v ? v.toUpperCase() : null;
  } catch {
    return null;
  }
}

export function App() {
  const inviteCode = useRef(readRoomFromUrl()).current;
  const [screen, setScreen] = useState<Screen>({ name: 'welcome' });
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [roomSnap, setRoomSnap] = useState<RoomData | null>(null);
  const [matchKey, setMatchKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const goLibrary = useCallback(() => setScreen({ name: 'library' }), []);
  const goHome = useCallback(() => setScreen({ name: 'welcome' }), []);

  const bindRoom = useCallback((code: string) => {
    const normalized = code.toUpperCase();
    setRoomCode(normalized);
    localStorage.setItem(ACTIVE_ROOM_KEY, normalized);
    const url = new URL(window.location.href);
    url.searchParams.set('room', normalized);
    window.history.replaceState({}, '', url.toString());
  }, []);

  const clearRoomBinding = useCallback(() => {
    setRoomCode(null);
    setRoomSnap(null);
    setMatchKey('');
    localStorage.removeItem(ACTIVE_ROOM_KEY);
    const url = new URL(window.location.href);
    url.searchParams.delete('room');
    window.history.replaceState({}, '', url.toString());
  }, []);

  // Live party sync: jump everyone into the same match / results.
  useEffect(() => {
    if (!roomCode) return;
    const playerId = getOrCreatePlayerId();
    return subscribeRoom(roomCode, (room) => {
      setRoomSnap(room);
      if (!room) return;

      if (room.status === 'playing' || room.status === 'countdown') {
        const me = room.players?.[playerId];
        const optedOut =
          !!me &&
          room.status === 'playing' &&
          getPresence(me) === 'lobby' &&
          !!room.finished?.[playerId];
        if (optedOut) return;
        setMatchKey(`${room.gameId}:${room.seed}:${room.status}`);
        setScreen((current) => (current.name === 'room' ? current : { name: 'room' }));
        return;
      }

      if (room.status === 'results') {
        setMatchKey(`${room.gameId}:${room.seed}:results`);
        setScreen((current) => (current.name === 'room' ? current : { name: 'room' }));
      }
    });
  }, [roomCode]);

  const finishWelcome = async () => {
    ensureNickname();
    const code = inviteCode ?? readStoredRoom();
    if (inviteCode) {
      setBusy(true);
      setError('');
      try {
        const player = { id: getOrCreatePlayerId(), name: ensureNickname() };
        await joinRoom(inviteCode, player);
        bindRoom(inviteCode);
        setScreen({ name: 'room' });
      } catch (err) {
        clearRoomBinding();
        setError(err instanceof Error ? err.message : String(err));
        setScreen({ name: 'library' });
      } finally {
        setBusy(false);
      }
      return;
    }
    if (code) {
      // Restore party link quietly, then show games list.
      setBusy(true);
      try {
        const player = { id: getOrCreatePlayerId(), name: ensureNickname() };
        await joinRoom(code, player);
        bindRoom(code);
      } catch {
        clearRoomBinding();
      } finally {
        setBusy(false);
      }
    }
    setScreen({ name: 'library' });
  };

  const handleCreate = async (gameId: string) => {
    setBusy(true);
    setError('');
    try {
      const player = { id: getOrCreatePlayerId(), name: ensureNickname() };
      const room = await createRoom(gameId, player);
      bindRoom(room.code);
      setScreen({ name: 'room' });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleJoin = async (code: string) => {
    setBusy(true);
    setError('');
    try {
      const player = { id: getOrCreatePlayerId(), name: ensureNickname() };
      const room = await joinRoom(code, player);
      bindRoom(room.code);
      setScreen({ name: 'room' });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const quitMultiplayer = async () => {
    const code = roomCode;
    const playerId = getOrCreatePlayerId();
    clearRoomBinding();
    setScreen({ name: 'library' });
    if (code) {
      try {
        await leaveRoom(code, playerId);
      } catch {
        /* ignore */
      }
    }
  };

  const quitGame = async () => {
    const code = roomCode;
    if (!code) {
      setScreen({ name: 'library' });
      return;
    }
    try {
      await quitMatch(code, getOrCreatePlayerId());
    } catch {
      /* still leave the match UI */
    }
    setScreen({ name: 'library' });
  };

  const playInRoom = async (gameId: string) => {
    if (!roomCode) return;
    setBusy(true);
    setError('');
    try {
      if (roomSnap && !allConnectedReady(roomSnap)) {
        await setRoomGame(roomCode, gameId);
        setScreen({ name: 'room' });
      } else {
        await startPartyGame(roomCode, gameId);
        setScreen({ name: 'room' });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const playerId = getOrCreatePlayerId();
  const isHost = !!(roomSnap && roomSnap.hostId === playerId);
  const hostDisplayName = roomSnap?.players?.[roomSnap.hostId]?.name ?? 'Host';

  const showPartyChat = !!roomCode && screen.name !== 'welcome';

  useEffect(() => {
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, [screen.name]);

  return (
    <PartyChatProvider code={showPartyChat ? roomCode : null}>
      <div className="app-shell">
        {error ? (
          <Panel>
            <p style={{ fontWeight: 800, marginBottom: 10 }}>{error}</p>
            <Button
              variant="ghost"
              block
              onClick={() => {
                setError('');
                setScreen({ name: 'library' });
              }}
            >
              OK
            </Button>
          </Panel>
        ) : null}

        {busy && screen.name === 'welcome' ? (
          <Panel>
            <p className="muted">Joining room…</p>
          </Panel>
        ) : null}

        {screen.name === 'welcome' ? (
          <Welcome invited={!!inviteCode} onContinue={() => finishWelcome()} />
        ) : null}

        {screen.name === 'library' ? (
          <Library
            onBack={goHome}
            onSolo={(gameId) => setScreen({ name: 'solo', gameId, key: Date.now() })}
            onCreateRoom={handleCreate}
            onJoinRoom={handleJoin}
            activeRoom={roomCode}
            isHost={isHost}
            hostDisplayName={hostDisplayName}
            onLobby={() => setScreen({ name: 'room' })}
            onQuitMultiplayer={quitMultiplayer}
            onPlayInRoom={playInRoom}
            onStats={() => setScreen({ name: 'stats' })}
          />
        ) : null}

        {screen.name === 'stats' ? <Stats onBack={goLibrary} /> : null}

        {screen.name === 'solo' ? (
          <SoloPlay
            key={screen.key}
            gameId={screen.gameId}
            onExit={goLibrary}
            onResults={({ gameId, title, payload }) =>
              setScreen({ name: 'results', gameId, title, payload })
            }
          />
        ) : null}

        {screen.name === 'results' ? (
          <Results
            title={screen.title}
            payload={screen.payload}
            onAgain={() =>
              setScreen({ name: 'solo', gameId: screen.gameId, key: Date.now() })
            }
            onLibrary={goLibrary}
          />
        ) : null}

        {screen.name === 'room' && roomCode ? (
          <RoomSession
            key={matchKey || roomCode}
            code={roomCode}
            onBrowseGames={goLibrary}
            onQuitGame={quitGame}
            onHostPickGame={playInRoom}
          />
        ) : null}
      </div>
    </PartyChatProvider>
  );
}
