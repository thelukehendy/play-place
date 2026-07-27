import {
  get,
  onDisconnect,
  onValue,
  push,
  ref,
  remove,
  set,
  update,
  type Unsubscribe,
} from 'firebase/database';
import { getGame } from '../games/registry';
import { roomCode as makeCode, randomSeed } from '../lib/random';
import type { PlayerInfo, ScoreValue } from '../games/types';
import { ensureAnonAuth, getFirebase, isFirebaseConfigured } from './firebase';

export type RoomStatus = 'lobby' | 'countdown' | 'playing' | 'results';

/** Per-player: in the live match vs back in the party lobby / browsing games. */
export type PlayerPresence = 'lobby' | 'playing';

export type RoomPlayer = PlayerInfo & {
  connected: boolean;
  joinedAt: number;
  /** Defaults to lobby for older rooms missing the field. */
  presence?: PlayerPresence;
  ready?: boolean;
};

export type RoomData = {
  code: string;
  hostId: string;
  gameId: string;
  status: RoomStatus;
  seed: number;
  createdAt: number;
  players: Record<string, RoomPlayer>;
  scores: Record<string, ScoreValue>;
  finished: Record<string, boolean>;
  /** shared state for turn-based games */
  gameState: unknown | null;
  winnerId?: string | null;
  /** Shared 3-2-1 start clock (ms epoch). */
  countdownEndsAt?: number | null;
  chat?: Record<string, ChatMessage>;
  nudges?: Record<string, Nudge>;
};

export type ChatMessage = {
  fromId: string;
  fromName: string;
  text: string;
  at: number;
};

export type Nudge = {
  fromId: string;
  fromName: string;
  at: number;
};

const LOCAL_ROOMS_KEY = 'playplace.localRooms';

/** In-memory + localStorage fallback when Firebase isn't configured (solo-friendly demo / local 2-device via same browser profile won't cross devices). */
type LocalStore = Record<string, RoomData>;

function readLocal(): LocalStore {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_ROOMS_KEY) || '{}') as LocalStore;
  } catch {
    return {};
  }
}

function writeLocal(store: LocalStore) {
  localStorage.setItem(LOCAL_ROOMS_KEY, JSON.stringify(store));
  window.dispatchEvent(new CustomEvent('playplace-local-rooms'));
}

export async function createRoom(gameId: string, host: PlayerInfo): Promise<RoomData> {
  const code = makeCode(5);
  const room: RoomData = {
    code,
    hostId: host.id,
    gameId,
    status: 'lobby',
    seed: randomSeed(),
    createdAt: Date.now(),
    players: {
      [host.id]: {
        ...host,
        connected: true,
        joinedAt: Date.now(),
        presence: 'lobby',
        ready: false,
      },
    },
    scores: {},
    finished: {},
    gameState: null,
    winnerId: null,
    countdownEndsAt: null,
  };

  if (!isFirebaseConfigured()) {
    const store = readLocal();
    store[code] = room;
    writeLocal(store);
    return room;
  }

  await ensureAnonAuth();
  const { db } = getFirebase();
  const roomRef = ref(db, `rooms/${code}`);
  await set(roomRef, room);
  const playerRef = ref(db, `rooms/${code}/players/${host.id}`);
  await onDisconnect(playerRef).update({ connected: false });
  return room;
}

export async function joinRoom(code: string, player: PlayerInfo): Promise<RoomData> {
  const normalized = code.trim().toUpperCase();

  if (!isFirebaseConfigured()) {
    const store = readLocal();
    const room = store[normalized];
    if (!room) throw new Error('Room not found. Check the code.');
    if (!room.players[player.id] && Object.keys(room.players).length >= 4) {
      throw new Error('Room is full (max 4 players).');
    }
    room.players[player.id] = {
      ...player,
      connected: true,
      joinedAt: Date.now(),
      presence: 'lobby',
      ready: false,
    };
    writeLocal(store);
    return room;
  }

  await ensureAnonAuth();
  const { db } = getFirebase();
  const roomRef = ref(db, `rooms/${normalized}`);
  const snap = await get(roomRef);
  if (!snap.exists()) throw new Error('Room not found. Check the code.');
  const room = snap.val() as RoomData;
  if (!room.players?.[player.id] && Object.keys(room.players || {}).length >= 4) {
    throw new Error('Room is full (max 4 players).');
  }
  const playerRef = ref(db, `rooms/${normalized}/players/${player.id}`);
  await set(playerRef, {
    ...player,
    connected: true,
    joinedAt: Date.now(),
    presence: 'lobby',
    ready: false,
  });
  await onDisconnect(playerRef).update({ connected: false });
  return { ...room, code: normalized };
}

export function subscribeRoom(code: string, cb: (room: RoomData | null) => void): Unsubscribe {
  const normalized = code.trim().toUpperCase();

  if (!isFirebaseConfigured()) {
    const emit = () => {
      const store = readLocal();
      cb(store[normalized] ?? null);
    };
    emit();
    const handler = () => emit();
    window.addEventListener('playplace-local-rooms', handler);
    window.addEventListener('storage', handler);
    return () => {
      window.removeEventListener('playplace-local-rooms', handler);
      window.removeEventListener('storage', handler);
    };
  }

  const { db } = getFirebase();
  const roomRef = ref(db, `rooms/${normalized}`);
  return onValue(roomRef, (snap) => {
    cb(snap.exists() ? (snap.val() as RoomData) : null);
  });
}

async function patchRoom(code: string, partial: Partial<RoomData>) {
  const normalized = code.trim().toUpperCase();
  if (!isFirebaseConfigured()) {
    const store = readLocal();
    if (!store[normalized]) return;
    store[normalized] = { ...store[normalized], ...partial };
    writeLocal(store);
    return;
  }
  const { db } = getFirebase();
  await update(ref(db, `rooms/${normalized}`), partial);
}

export function getPresence(player: RoomPlayer): PlayerPresence {
  return player.presence === 'playing' ? 'playing' : 'lobby';
}

/** Players still in the live race (opted into the match). Ignores flaky `connected`. */
export function playersInMatch(room: RoomData): RoomPlayer[] {
  return Object.values(room.players || {}).filter((p) => getPresence(p) === 'playing');
}

/** True when every player still in the match has finished — wait for all, not the first. */
export function allMatchPlayersFinished(room: RoomData): boolean {
  const racers = playersInMatch(room);
  if (racers.length === 0) return false;
  const finished = room.finished || {};
  return racers.every((p) => !!finished[p.id]);
}

export function playersList(room: RoomData): RoomPlayer[] {
  return Object.values(room.players || {}).sort((a, b) => a.joinedAt - b.joinedAt);
}

export function connectedPlayers(room: RoomData): RoomPlayer[] {
  return playersList(room).filter((p) => p.connected);
}

export function allConnectedReady(room: RoomData): boolean {
  const connected = connectedPlayers(room);
  return connected.length > 0 && connected.every((p) => !!p.ready);
}

export function hostName(room: RoomData): string {
  return room.players?.[room.hostId]?.name ?? 'Host';
}

export async function setPlayerReady(code: string, playerId: string, ready: boolean) {
  const normalized = code.trim().toUpperCase();
  if (!isFirebaseConfigured()) {
    const store = readLocal();
    const room = store[normalized];
    if (!room?.players[playerId]) return;
    room.players[playerId].ready = ready;
    if (ready && room.nudges?.[playerId]) delete room.nudges[playerId];
    writeLocal(store);
    return;
  }
  const { db } = getFirebase();
  await set(ref(db, `rooms/${normalized}/players/${playerId}/ready`), ready);
  if (ready) {
    await remove(ref(db, `rooms/${normalized}/nudges/${playerId}`));
  }
}

export async function setPlayerPresence(
  code: string,
  playerId: string,
  presence: PlayerPresence,
) {
  const normalized = code.trim().toUpperCase();
  if (!isFirebaseConfigured()) {
    const store = readLocal();
    const room = store[normalized];
    if (!room?.players[playerId]) return;
    room.players[playerId].presence = presence;
    writeLocal(store);
    return;
  }
  const { db } = getFirebase();
  await set(ref(db, `rooms/${normalized}/players/${playerId}/presence`), presence);
}

export async function setRoomGame(code: string, gameId: string) {
  const normalized = code.trim().toUpperCase();
  if (!isFirebaseConfigured()) {
    const store = readLocal();
    const room = store[normalized];
    if (!room) return;
    room.gameId = gameId;
    room.status = 'lobby';
    room.scores = {};
    room.finished = {};
    room.gameState = null;
    room.countdownEndsAt = null;
    for (const p of Object.values(room.players)) {
      p.presence = 'lobby';
      p.ready = false;
    }
    writeLocal(store);
    return;
  }

  const { db } = getFirebase();
  const snap = await get(ref(db, `rooms/${normalized}/players`));
  const players = (snap.exists() ? snap.val() : {}) as Record<string, RoomPlayer>;
  const updates: Record<string, unknown> = {
    gameId,
    status: 'lobby',
    scores: {},
    finished: {},
    gameState: null,
    countdownEndsAt: null,
  };
  for (const id of Object.keys(players)) {
    updates[`players/${id}/presence`] = 'lobby';
    updates[`players/${id}/ready`] = false;
  }
  await update(ref(db, `rooms/${normalized}`), updates);
}

/** Shared 3-2-1 then match — all devices use countdownEndsAt. */
async function beginCountdown(
  code: string,
  opts: { gameId?: string; seed?: number } = {},
) {
  const normalized = code.trim().toUpperCase();
  const nextSeed = opts.seed ?? randomSeed();
  const countdownEndsAt = Date.now() + 3000;

  if (!isFirebaseConfigured()) {
    const store = readLocal();
    const room = store[normalized];
    if (!room) return;
    if (opts.gameId) room.gameId = opts.gameId;
    room.status = 'countdown';
    room.seed = nextSeed;
    room.countdownEndsAt = countdownEndsAt;
    room.scores = {};
    room.finished = {};
    room.gameState = null;
    room.winnerId = null;
    for (const p of Object.values(room.players)) {
      p.presence = 'playing';
      p.ready = false;
    }
    writeLocal(store);
    return;
  }

  const { db } = getFirebase();
  const snap = await get(ref(db, `rooms/${normalized}/players`));
  const players = (snap.exists() ? snap.val() : {}) as Record<string, RoomPlayer>;
  const updates: Record<string, unknown> = {
    status: 'countdown',
    seed: nextSeed,
    countdownEndsAt,
    scores: {},
    finished: {},
    gameState: null,
    winnerId: null,
  };
  if (opts.gameId) updates.gameId = opts.gameId;
  for (const id of Object.keys(players)) {
    updates[`players/${id}/presence`] = 'playing';
    updates[`players/${id}/ready`] = false;
  }
  await update(ref(db, `rooms/${normalized}`), updates);
}

export async function startMatch(code: string, _seed?: number) {
  // Always mint a fresh seed — never reuse a caller-supplied board.
  await beginCountdown(code, { seed: randomSeed() });
}

/** Host picks a game and everyone jumps into the countdown together. */
export async function startPartyGame(code: string, gameId: string, _seed?: number) {
  await beginCountdown(code, { gameId, seed: randomSeed() });
}

export async function rematch(code: string) {
  await beginCountdown(code, { seed: randomSeed() });
}

/** Promote next connected player if the host fully leaves multiplayer. */
export async function leaveRoom(code: string, playerId: string) {
  const normalized = code.trim().toUpperCase();
  if (!isFirebaseConfigured()) {
    const store = readLocal();
    const room = store[normalized];
    if (!room) return;
    const wasHost = room.hostId === playerId;
    delete room.players[playerId];
    const remaining = Object.values(room.players).sort((a, b) => a.joinedAt - b.joinedAt);
    if (remaining.length === 0) {
      delete store[normalized];
    } else if (wasHost) {
      room.hostId = remaining[0].id;
    }
    writeLocal(store);
    return;
  }
  const { db } = getFirebase();
  const roomSnap = await get(ref(db, `rooms/${normalized}`));
  if (!roomSnap.exists()) return;
  const room = roomSnap.val() as RoomData;
  const wasHost = room.hostId === playerId;
  await remove(ref(db, `rooms/${normalized}/players/${playerId}`));
  const remaining = Object.values(room.players || {})
    .filter((p) => p.id !== playerId)
    .sort((a, b) => a.joinedAt - b.joinedAt);
  if (remaining.length === 0) {
    await remove(ref(db, `rooms/${normalized}`));
  } else if (wasHost) {
    await update(ref(db, `rooms/${normalized}`), { hostId: remaining[0].id });
  }
}

/** Leave the current mini-game but stay in the party. */
export async function quitMatch(code: string, playerId: string) {
  const normalized = code.trim().toUpperCase();
  await setPlayerPresence(normalized, playerId, 'lobby');

  const applyQuit = (room: RoomData): Partial<RoomData> | null => {
    const finished = { ...(room.finished || {}), [playerId]: true };
    const stillPlaying = Object.values(room.players || {}).filter(
      (p) => p.id !== playerId && getPresence(p) === 'playing',
    );
    // Quitting player already set to lobby in Firebase/local before this runs —
    // also treat them as not playing when reading a stale snapshot.
    const game = getGame(room.gameId);
    if (stillPlaying.length === 0) {
      return {
        status: 'lobby',
        scores: {},
        finished: {},
        gameState: null,
        winnerId: null,
      };
    }
    if (game?.modes.includes('turn') && stillPlaying.length < 2) {
      return {
        status: 'lobby',
        scores: {},
        finished: {},
        gameState: null,
        winnerId: null,
      };
    }
    if (stillPlaying.every((p) => finished[p.id])) {
      return { status: 'results', finished };
    }
    return { finished };
  };

  if (!isFirebaseConfigured()) {
    const store = readLocal();
    const room = store[normalized];
    if (!room) return;
    if (room.players[playerId]) room.players[playerId].presence = 'lobby';
    const patch = applyQuit(room);
    if (patch) Object.assign(room, patch);
    writeLocal(store);
    return;
  }

  const { db } = getFirebase();
  const roomSnap = await get(ref(db, `rooms/${normalized}`));
  if (!roomSnap.exists()) return;
  const room = roomSnap.val() as RoomData;
  if (room.players?.[playerId]) {
    // ensure presence is lobby on the snapshot used for decisions
    room.players[playerId] = { ...room.players[playerId], presence: 'lobby' };
  }
  const patch = applyQuit(room);
  if (patch) await update(ref(db, `rooms/${normalized}`), patch);
}

export async function updateScore(code: string, playerId: string, score: ScoreValue) {
  const normalized = code.trim().toUpperCase();
  if (!isFirebaseConfigured()) {
    const store = readLocal();
    const room = store[normalized];
    if (!room) return;
    room.scores = { ...room.scores, [playerId]: score };
    writeLocal(store);
    return;
  }
  const { db } = getFirebase();
  await set(ref(db, `rooms/${normalized}/scores/${playerId}`), score);
}

export async function markFinished(code: string, playerId: string) {
  const normalized = code.trim().toUpperCase();
  if (!isFirebaseConfigured()) {
    const store = readLocal();
    const room = store[normalized];
    if (!room) return;
    room.finished = { ...room.finished, [playerId]: true };
    // Wait for every player still in the match — not just whoever is connected
    // this instant (flaky connected flags were ending races for everyone early).
    if (allMatchPlayersFinished(room)) {
      room.status = 'results';
    }
    writeLocal(store);
    return;
  }
  const { db } = getFirebase();
  await set(ref(db, `rooms/${normalized}/finished/${playerId}`), true);
  const roomSnap = await get(ref(db, `rooms/${normalized}`));
  if (!roomSnap.exists()) return;
  const room = roomSnap.val() as RoomData;
  room.finished = { ...(room.finished || {}), [playerId]: true };
  if (allMatchPlayersFinished(room)) {
    await update(ref(db, `rooms/${normalized}`), { status: 'results' });
  }
}

export async function setSharedGameState(code: string, gameState: unknown) {
  await patchRoom(code, { gameState });
}

export async function finishTurnGame(code: string, winnerId?: string) {
  await patchRoom(code, { status: 'results', winnerId: winnerId ?? null });
}

export async function sendChatMessage(
  code: string,
  from: PlayerInfo,
  text: string,
) {
  const normalized = code.trim().toUpperCase();
  const cleaned = text.trim().slice(0, 200);
  if (!cleaned) return;
  const msg: ChatMessage = {
    fromId: from.id,
    fromName: from.name,
    text: cleaned,
    at: Date.now(),
  };
  if (!isFirebaseConfigured()) {
    const store = readLocal();
    const room = store[normalized];
    if (!room) return;
    const id = `m_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    room.chat = { ...(room.chat || {}), [id]: msg };
    // keep last ~40 messages
    const ids = Object.keys(room.chat).sort(
      (a, b) => (room.chat![a].at || 0) - (room.chat![b].at || 0),
    );
    if (ids.length > 40) {
      for (const old of ids.slice(0, ids.length - 40)) delete room.chat[old];
    }
    writeLocal(store);
    return;
  }
  const { db } = getFirebase();
  await push(ref(db, `rooms/${normalized}/chat`), msg);
}

export async function nudgePlayer(
  code: string,
  targetId: string,
  from: PlayerInfo,
) {
  const normalized = code.trim().toUpperCase();
  const nudge: Nudge = { fromId: from.id, fromName: from.name, at: Date.now() };
  if (!isFirebaseConfigured()) {
    const store = readLocal();
    const room = store[normalized];
    if (!room) return;
    room.nudges = { ...(room.nudges || {}), [targetId]: nudge };
    writeLocal(store);
    return;
  }
  const { db } = getFirebase();
  await set(ref(db, `rooms/${normalized}/nudges/${targetId}`), nudge);
}

export async function clearNudge(code: string, targetId: string) {
  const normalized = code.trim().toUpperCase();
  if (!isFirebaseConfigured()) {
    const store = readLocal();
    const room = store[normalized];
    if (!room?.nudges) return;
    delete room.nudges[targetId];
    writeLocal(store);
    return;
  }
  const { db } = getFirebase();
  await remove(ref(db, `rooms/${normalized}/nudges/${targetId}`));
}

/** Remove a stuck player from the party (host transfer applies if needed). */
export async function removePlayer(code: string, targetId: string) {
  await leaveRoom(code, targetId);
}

export function chatList(room: RoomData): (ChatMessage & { id: string })[] {
  return Object.entries(room.chat || {})
    .map(([id, m]) => ({ id, ...m }))
    .sort((a, b) => a.at - b.at);
}
