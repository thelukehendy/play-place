import {
  get,
  onDisconnect,
  onValue,
  ref,
  remove,
  set,
  update,
  type Unsubscribe,
} from 'firebase/database';
import { roomCode as makeCode, randomSeed } from '../lib/random';
import type { PlayerInfo, ScoreValue } from '../games/types';
import { ensureAnonAuth, getFirebase, isFirebaseConfigured } from './firebase';

export type RoomStatus = 'lobby' | 'playing' | 'results';

export type RoomPlayer = PlayerInfo & {
  connected: boolean;
  joinedAt: number;
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
      [host.id]: { ...host, connected: true, joinedAt: Date.now() },
    },
    scores: {},
    finished: {},
    gameState: null,
    winnerId: null,
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
    room.players[player.id] = { ...player, connected: true, joinedAt: Date.now() };
    writeLocal(store);
    return room;
  }

  await ensureAnonAuth();
  const { db } = getFirebase();
  const roomRef = ref(db, `rooms/${normalized}`);
  const snap = await get(roomRef);
  if (!snap.exists()) throw new Error('Room not found. Check the code.');
  const room = snap.val() as RoomData;
  const playerRef = ref(db, `rooms/${normalized}/players/${player.id}`);
  await set(playerRef, { ...player, connected: true, joinedAt: Date.now() });
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

export async function setRoomGame(code: string, gameId: string) {
  await patchRoom(code, { gameId, status: 'lobby', scores: {}, finished: {}, gameState: null });
}

export async function startMatch(code: string, seed?: number) {
  await patchRoom(code, {
    status: 'playing',
    seed: seed ?? randomSeed(),
    scores: {},
    finished: {},
    gameState: null,
    winnerId: null,
  });
}

export async function rematch(code: string) {
  await startMatch(code, randomSeed());
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
    const connected = Object.values(room.players).filter((p) => p.connected);
    if (connected.every((p) => room.finished[p.id])) {
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
  const connected = Object.values(room.players || {}).filter((p) => p.connected);
  const finished = room.finished || {};
  if (connected.length > 0 && connected.every((p) => finished[p.id])) {
    await update(ref(db, `rooms/${normalized}`), { status: 'results' });
  }
}

export async function setSharedGameState(code: string, gameState: unknown) {
  await patchRoom(code, { gameState });
}

export async function finishTurnGame(code: string, winnerId?: string) {
  await patchRoom(code, { status: 'results', winnerId: winnerId ?? null });
}

export async function leaveRoom(code: string, playerId: string) {
  const normalized = code.trim().toUpperCase();
  if (!isFirebaseConfigured()) {
    const store = readLocal();
    const room = store[normalized];
    if (!room) return;
    delete room.players[playerId];
    if (Object.keys(room.players).length === 0) delete store[normalized];
    writeLocal(store);
    return;
  }
  const { db } = getFirebase();
  await remove(ref(db, `rooms/${normalized}/players/${playerId}`));
}

export function playersList(room: RoomData): RoomPlayer[] {
  return Object.values(room.players || {}).sort((a, b) => a.joinedAt - b.joinedAt);
}
