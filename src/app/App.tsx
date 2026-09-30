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
  isCountdownActive,
  isMatchLive,
  joinRoom,
  leaveRoom,
  quitMatch,
  setRoomGame,
  startPartyGame,
  subscribeRoom,
  type RoomData,
} from '../multiplayer/rooms';
import { usePartyLifecycle } from '../multiplayer/usePartyLifecycle';
import { useWakeLock } from '../multiplayer/useWakeLock';
import { ensureNickname, getOrCreatePlayerId } from '../lib/player';
import { randomSeed } from '../lib/random';
import type { GameFinishPayload } from '../games/types';
import { Panel } from '../ui/Panel';
import { Button } from '../ui/Button';
import { PartyChatProvider } from './PartyChat';
import { PartyVoice } from './PartyVoice';
import { loadWordDict } from '../games/word-claim/dictionary';
import { clearOwnVoice } from '../multiplayer/voice';

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
  const [partyNote, setPartyNote] = useState('');

  const goLibrary = useCallback(() => setScreen({ name: 'library' }), []);
  const goHome = useCallback(() => setScreen({ name: 'welcome' }), []);

  usePartyLifecycle(roomCode);

  const meInMatch = (() => {
    if (!roomSnap || !roomCode) return false;
    const me = roomSnap.players?.[getOrCreatePlayerId()];
    if (!me || getPresence(me) !== 'playing') return false;
    return isCountdownActive(roomSnap) || isMatchLive(roomSnap);
  })();
  useWakeLock(meInMatch);

  useEffect(() => {
    void loadWordDict().catch(() => undefined);
  }, []);

  useEffect(() => {
    const lock =
      screen.name === 'room' &&
      !!roomSnap &&
      (roomSnap.status === 'playing' || roomSnap.status === 'countdown');
    document.body.classList.toggle('match-lock-scroll', lock);
    return () => document.body.classList.remove('match-lock-scroll');
  }, [screen.name, roomSnap]);

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

  // Live party sync: jump into matches only when you're actually playing.
  useEffect(() => {
    if (!roomCode) return;
    const playerId = getOrCreatePlayerId();
    return subscribeRoom(roomCode, (room) => {
      setRoomSnap(room);

      if (!room) {
        clearRoomBinding();
        setPartyNote('Party ended.');
        setScreen({ name: 'library' });
        return;
      }

      if (!room.players?.[playerId]) {
        clearRoomBinding();
        setPartyNote('You were removed from the party.');
        setScreen({ name: 'library' });
        return;
      }

      const me = room.players[playerId];
      const inMatchSeat = getPresence(me) === 'playing';

      if ((isCountdownActive(room) || isMatchLive(room)) && inMatchSeat) {
        // Stable across countdown→playing so the game view does not remount.
        setMatchKey(`${room.gameId}:${room.seed}`);
        setScreen((current) => (current.name === 'room' ? current : { name: 'room' }));
        return;
      }

      if (room.status === 'results') {
        setMatchKey(`${room.gameId}:${room.seed}:results`);
        setScreen((current) => (current.name === 'room' ? current : { name: 'room' }));
      }
    });
  }, [roomCode, clearRoomBinding]);

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
    setPartyNote('');
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
    setPartyNote('');
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
    setPartyNote('');
    setScreen({ name: 'library' });
    if (code) {
      try {
        await clearOwnVoice(code, playerId);
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
    // Stay linked; lobby UI shows opted-out state (or library until next pull).
    setScreen({ name: 'room' });
  };

  const playInRoom = async (gameId: string, opts?: { start: boolean }) => {
    if (!roomCode) return;
    setBusy(true);
    setError('');
    try {
      const shouldStart =
        opts?.start === true ||
        (opts?.start !== false && !!roomSnap && allConnectedReady(roomSnap));
      if (shouldStart) {
        if (roomSnap && !allConnectedReady(roomSnap)) {
          setError('Everyone online must ready up before starting.');
          return;
        }
        await startPartyGame(roomCode, gameId);
      } else {
        await setRoomGame(roomCode, gameId);
      }
      setScreen({ name: 'room' });
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

  const showVoice =
    !!roomCode && (screen.name === 'room' || screen.name === 'library');

  return (
    <PartyChatProvider code={showPartyChat ? roomCode : null}>
      <div className="app-shell">
        {showVoice && roomCode ? (
          <PartyVoice
            code={roomCode}
            compact={
              screen.name === 'room' &&
              !!roomSnap &&
              (roomSnap.status === 'playing' || roomSnap.status === 'countdown')
            }
          />
        ) : null}

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

        {partyNote && !error ? (
          <Panel>
            <p style={{ fontWeight: 800, marginBottom: 10 }}>{partyNote}</p>
            <Button variant="ghost" block onClick={() => setPartyNote('')}>
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
            onSolo={(gameId) => setScreen({ name: 'solo', gameId, key: randomSeed() })}
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
            runId={screen.key}
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
              setScreen({ name: 'solo', gameId: screen.gameId, key: randomSeed() })
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
            onLeaveParty={quitMultiplayer}
            onHostPickGame={playInRoom}
          />
        ) : null}
      </div>
    </PartyChatProvider>
  );
}
