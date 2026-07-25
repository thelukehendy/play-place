import { useCallback, useEffect, useState } from 'react';
import { Home } from './Home';
import { Library } from './Library';
import { SoloPlay } from './SoloPlay';
import { RoomSession } from './RoomSession';
import { Results } from './Results';
import { createRoom, joinRoom, leaveRoom, setRoomGame } from '../multiplayer/rooms';
import { ensureNickname, getOrCreatePlayerId } from '../lib/player';
import type { GameFinishPayload } from '../games/types';
import { Panel } from '../ui/Panel';
import { Button } from '../ui/Button';

const ACTIVE_ROOM_KEY = 'playplace.activeRoom';

type Screen =
  | { name: 'home' }
  | { name: 'library' }
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
  const [screen, setScreen] = useState<Screen>({ name: 'home' });
  const [roomCode, setRoomCode] = useState<string | null>(
    () => readRoomFromUrl() ?? readStoredRoom(),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const goLibrary = useCallback(() => setScreen({ name: 'library' }), []);
  const goHome = useCallback(() => setScreen({ name: 'home' }), []);

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
    localStorage.removeItem(ACTIVE_ROOM_KEY);
    const url = new URL(window.location.href);
    url.searchParams.delete('room');
    window.history.replaceState({}, '', url.toString());
  }, []);

  useEffect(() => {
    const code = readRoomFromUrl() ?? readStoredRoom();
    if (!code) return;
    let cancelled = false;
    (async () => {
      setBusy(true);
      try {
        const player = { id: getOrCreatePlayerId(), name: ensureNickname() };
        await joinRoom(code, player);
        if (!cancelled) {
          bindRoom(code);
          setScreen({ name: 'room' });
        }
      } catch (err) {
        if (!cancelled) {
          clearRoomBinding();
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // only on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    setScreen({ name: 'home' });
    if (code) {
      try {
        await leaveRoom(code, playerId);
      } catch {
        /* ignore */
      }
    }
  };

  const playInRoom = async (gameId: string) => {
    if (!roomCode) return;
    setBusy(true);
    setError('');
    try {
      await setRoomGame(roomCode, gameId);
      setScreen({ name: 'room' });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
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

      {busy && screen.name === 'home' ? (
        <Panel>
          <p className="muted">Joining room…</p>
        </Panel>
      ) : null}

      {screen.name === 'home' ? (
        <Home
          onPlay={goLibrary}
          activeRoom={roomCode}
          onReturnToRoom={() => setScreen({ name: 'room' })}
          onQuitMultiplayer={quitMultiplayer}
          onCreateRoom={() => handleCreate('number-rush')}
          onJoinRoom={handleJoin}
          busy={busy}
        />
      ) : null}

      {screen.name === 'library' ? (
        <Library
          onBack={goHome}
          onSolo={(gameId) => setScreen({ name: 'solo', gameId, key: Date.now() })}
          onCreateRoom={handleCreate}
          onJoinRoom={handleJoin}
          activeRoom={roomCode}
          onReturnToRoom={() => setScreen({ name: 'room' })}
          onPlayInRoom={playInRoom}
        />
      ) : null}

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
          code={roomCode}
          onHome={goHome}
          onBrowseGames={goLibrary}
        />
      ) : null}
    </div>
  );
}
