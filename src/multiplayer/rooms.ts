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
import { compareScores, type PlayerInfo, type ScoreValue } from '../games/types';
import { getMyAvatar } from '../lib/avatars';
import { getOrCreatePlayerId } from '../lib/player';
import { ensureAnonAuth, getFirebase, isFirebaseConfigured } from './firebase';

export type RoomStatus = 'lobby' | 'countdown' | 'playing' | 'results';

/** Per-player: in the live match vs back in the party lobby / browsing games. */
export type PlayerPresence = 'lobby' | 'playing';

export type RoomPlayer = PlayerInfo & {
  connected: boolean;
  joinedAt: number;
  /** Heartbeat timestamp — used to detect frozen tabs. */
  lastSeenAt?: number;
  /** Defaults to lobby for older rooms missing the field. */
  presence?: PlayerPresence;
  ready?: boolean;
  /** Emoji avatar chosen on the home screen. */
  avatar?: string;
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
  /** Soft notices (join/leave/host) for toasts — pruned. */
  notices?: Record<string, RoomNotice>;
  /** Guest game wishes — playerId → gameId. */
  suggestions?: Record<string, string>;
  /** Latest quick emoji reaction per player. */
  reactions?: Record<string, Reaction>;
  /** Running party standings across games. */
  series?: { rounds?: Record<string, SeriesRound> };
};

export type Reaction = { emoji: string; at: number };

export type SeriesRound = {
  gameId: string;
  at: number;
  pts: Record<string, number>;
  names: Record<string, string>;
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
  text?: string;
};

export type RoomNotice = {
  kind: 'join' | 'leave' | 'kick' | 'host' | 'forfeit' | 'reconnect';
  text: string;
  at: number;
  /** Optional player the notice is about */
  playerId?: string;
};

const LOCAL_ROOMS_KEY = 'playplace.localRooms';
export const MAX_PLAYERS = 4;

/**
 * Soft away: connected but heartbeat stale (typical iPhone lock / app switch).
 * Hard away: connected:false from pagehide / long background.
 */
export const SOFT_AWAY_MS = 45_000;
export const HARD_AWAY_MS = 20_000;
/** @deprecated alias — soft threshold for UI “away” labels */
export const AWAY_MS = SOFT_AWAY_MS;
/** Promote a new host when the current host has been away this long. */
export const HOST_AWAY_MS = 40_000;
/** Auto-forfeit a race participant after hard/soft away this long. */
export const MATCH_FORFEIT_MS = 55_000;
/** Turn-based games get a longer forfeit grace (thinking + lock screen). */
export const TURN_FORFEIT_MS = 100_000;
/** Auto-prune ghost players (fully leave) after being away this long. */
export const PRUNE_AWAY_MS = 180_000;
export const HEARTBEAT_MS = 4_000;
export const NUDGE_REMOVE_MS = 6_000;

/** In-memory + localStorage fallback when Firebase isn't configured. */
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

function nowMs() {
  return Date.now();
}

function playerPayload(
  player: PlayerInfo,
  extras: Partial<RoomPlayer> = {},
): RoomPlayer {
  const t = nowMs();
  const localId = getOrCreatePlayerId();
  return {
    ...player,
    connected: true,
    joinedAt: t,
    lastSeenAt: t,
    presence: 'lobby',
    ready: false,
    ...(player.id === localId ? { avatar: getMyAvatar(localId) } : {}),
    ...extras,
  };
}

async function armDisconnect(code: string, playerId: string) {
  if (!isFirebaseConfigured()) return;
  const { db } = getFirebase();
  const playerRef = ref(db, `rooms/${code}/players/${playerId}`);
  try {
    await onDisconnect(playerRef).cancel();
  } catch {
    /* no prior handler */
  }
  await onDisconnect(playerRef).update({
    connected: false,
    lastSeenAt: nowMs(),
  });
}

async function pushNotice(code: string, notice: Omit<RoomNotice, 'at'> & { at?: number }) {
  const normalized = code.trim().toUpperCase();
  const entry: RoomNotice = { ...notice, at: notice.at ?? nowMs() };
  if (!isFirebaseConfigured()) {
    const store = readLocal();
    const room = store[normalized];
    if (!room) return;
    const id = `n_${entry.at}_${Math.random().toString(36).slice(2, 6)}`;
    room.notices = { ...(room.notices || {}), [id]: entry };
    const ids = Object.keys(room.notices).sort(
      (a, b) => (room.notices![a].at || 0) - (room.notices![b].at || 0),
    );
    if (ids.length > 20) {
      for (const old of ids.slice(0, ids.length - 20)) delete room.notices[old];
    }
    writeLocal(store);
    return;
  }
  const { db } = getFirebase();
  const noticeRef = push(ref(db, `rooms/${normalized}/notices`));
  await set(noticeRef, entry);
}

export async function createRoom(gameId: string, host: PlayerInfo): Promise<RoomData> {
  const code = makeCode(5);
  const room: RoomData = {
    code,
    hostId: host.id,
    gameId,
    status: 'lobby',
    seed: randomSeed(),
    createdAt: nowMs(),
    players: {
      [host.id]: playerPayload(host, { presence: 'lobby', ready: false }),
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
  await armDisconnect(code, host.id);
  return room;
}

export async function joinRoom(code: string, player: PlayerInfo): Promise<RoomData> {
  const normalized = code.trim().toUpperCase();

  if (!isFirebaseConfigured()) {
    const store = readLocal();
    const room = store[normalized];
    if (!room) throw new Error('Room not found. Check the code.');
    const existing = room.players[player.id];
    if (!existing && Object.keys(room.players).length >= MAX_PLAYERS) {
      throw new Error(`Room is full (max ${MAX_PLAYERS} players).`);
    }
    const midMatch = isMatchLive(room);
    const reconnecting =
      !!existing &&
      getPresence(existing) === 'playing' &&
      midMatch &&
      !room.finished?.[player.id];
    const wasAway = existing && !isPlayerOnline(existing, nowMs());
    room.players[player.id] = playerPayload(player, {
      joinedAt: existing?.joinedAt ?? nowMs(),
      presence: reconnecting ? 'playing' : 'lobby',
      ready: false,
    });
    writeLocal(store);
    if (!existing) {
      void pushNotice(normalized, {
        kind: 'join',
        text: `${player.name} joined`,
        playerId: player.id,
      });
    } else if (wasAway || reconnecting) {
      void pushNotice(normalized, {
        kind: 'reconnect',
        text: `${player.name} is back`,
        playerId: player.id,
      });
    }
    return room;
  }

  await ensureAnonAuth();
  const { db } = getFirebase();
  const roomRef = ref(db, `rooms/${normalized}`);
  const snap = await get(roomRef);
  if (!snap.exists()) throw new Error('Room not found. Check the code.');
  const room = snap.val() as RoomData;
  const existing = room.players?.[player.id];
  if (!existing && Object.keys(room.players || {}).length >= MAX_PLAYERS) {
    throw new Error(`Room is full (max ${MAX_PLAYERS} players).`);
  }
  const midMatch = isMatchLive(room);
  const reconnecting =
    !!existing &&
    getPresence(existing) === 'playing' &&
    midMatch &&
    !room.finished?.[player.id];
  const wasAway = existing && !isPlayerOnline(existing, nowMs());
  const playerRef = ref(db, `rooms/${normalized}/players/${player.id}`);
  await set(
    playerRef,
    playerPayload(player, {
      joinedAt: existing?.joinedAt ?? nowMs(),
      presence: reconnecting ? 'playing' : 'lobby',
      ready: false,
    }),
  );
  await armDisconnect(normalized, player.id);
  if (!existing) {
    await pushNotice(normalized, {
      kind: 'join',
      text: `${player.name} joined`,
      playerId: player.id,
    });
  } else if (wasAway || reconnecting) {
    await pushNotice(normalized, {
      kind: 'reconnect',
      text: `${player.name} is back`,
      playerId: player.id,
    });
  }
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

export function isPlayerOnline(player: RoomPlayer, now = nowMs()): boolean {
  const seen = player.lastSeenAt ?? player.joinedAt ?? 0;
  const stale = seen ? now - seen : 0;
  if (!player.connected) {
    // Hard disconnect — brief grace so flickers don't flash "away".
    return stale < 2_000;
  }
  // Soft: still connected but heartbeat paused (lock screen).
  return stale <= SOFT_AWAY_MS;
}

export function playerAwayMs(player: RoomPlayer, now = nowMs()): number {
  const seen = player.lastSeenAt ?? player.joinedAt ?? now;
  return Math.max(0, now - seen);
}

/** True only after shared countdown promotes — avoids clock-skew early starts. */
export function isMatchLive(room: RoomData, _now = nowMs()): boolean {
  return room.status === 'playing';
}

export function matchForfeitMs(room: RoomData): number {
  const game = getGame(room.gameId);
  return game?.modes.includes('turn') ? TURN_FORFEIT_MS : MATCH_FORFEIT_MS;
}

export function isCountdownActive(room: RoomData, now = nowMs()): boolean {
  if (room.status !== 'countdown') return false;
  const ends = room.countdownEndsAt ?? 0;
  return ends > 0 && now < ends;
}

/** Player is currently racing/playing in the live match. */
export function isInLiveMatch(room: RoomData, playerId: string, now = nowMs()): boolean {
  const p = room.players?.[playerId];
  if (!p) return false;
  if (!isMatchLive(room, now) && !isCountdownActive(room, now)) return false;
  return getPresence(p) === 'playing';
}

/** Opted out / spectating while others finish the match. */
export function hasOptedOutOfMatch(room: RoomData, playerId: string, now = nowMs()): boolean {
  const p = room.players?.[playerId];
  if (!p) return false;
  if (!(room.status === 'playing' || room.status === 'countdown')) return false;
  if (isCountdownActive(room, now)) return false;
  return getPresence(p) === 'lobby';
}

/** Players still in the live race (opted into the match). */
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

export function onlinePlayers(room: RoomData, now = nowMs()): RoomPlayer[] {
  return playersList(room).filter((p) => isPlayerOnline(p, now));
}

/** @deprecated use onlinePlayers — kept for call sites that meant "can ready / start". */
export function connectedPlayers(room: RoomData): RoomPlayer[] {
  return onlinePlayers(room);
}

export function allConnectedReady(room: RoomData, now = nowMs()): boolean {
  const online = onlinePlayers(room, now);
  return online.length > 0 && online.every((p) => !!p.ready);
}

export function hostName(room: RoomData): string {
  return room.players?.[room.hostId]?.name ?? 'Host';
}

export function pickNextHost(room: RoomData, excludeId?: string, now = nowMs()): RoomPlayer | null {
  const online = onlinePlayers(room, now).filter((p) => p.id !== excludeId);
  if (online.length) return online[0];
  const any = playersList(room).filter((p) => p.id !== excludeId);
  return any[0] ?? null;
}

export async function setPlayerReady(code: string, playerId: string, ready: boolean) {
  const normalized = code.trim().toUpperCase();
  if (!isFirebaseConfigured()) {
    const store = readLocal();
    const room = store[normalized];
    if (!room?.players[playerId]) return;
    room.players[playerId].ready = ready;
    room.players[playerId].lastSeenAt = nowMs();
    room.players[playerId].connected = true;
    if (ready && room.nudges?.[playerId]) delete room.nudges[playerId];
    writeLocal(store);
    return;
  }
  const { db } = getFirebase();
  await update(ref(db, `rooms/${normalized}/players/${playerId}`), {
    ready,
    lastSeenAt: nowMs(),
    connected: true,
  });
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
    room.players[playerId].lastSeenAt = nowMs();
    writeLocal(store);
    return;
  }
  const { db } = getFirebase();
  await update(ref(db, `rooms/${normalized}/players/${playerId}`), {
    presence,
    lastSeenAt: nowMs(),
  });
}

export async function heartbeat(code: string, playerId: string) {
  const normalized = code.trim().toUpperCase();
  const t = nowMs();
  if (!isFirebaseConfigured()) {
    const store = readLocal();
    const room = store[normalized];
    if (!room?.players[playerId]) return;
    room.players[playerId].connected = true;
    room.players[playerId].lastSeenAt = t;
    writeLocal(store);
    return;
  }
  const { db } = getFirebase();
  await update(ref(db, `rooms/${normalized}/players/${playerId}`), {
    connected: true,
    lastSeenAt: t,
  });
}

/** Mark local disconnect promptly (demo mode / tab hide). */
export async function markDisconnected(code: string, playerId: string) {
  const normalized = code.trim().toUpperCase();
  const t = nowMs();
  if (!isFirebaseConfigured()) {
    const store = readLocal();
    const room = store[normalized];
    if (!room?.players[playerId]) return;
    room.players[playerId].connected = false;
    room.players[playerId].lastSeenAt = t;
    writeLocal(store);
    return;
  }
  const { db } = getFirebase();
  await update(ref(db, `rooms/${normalized}/players/${playerId}`), {
    connected: false,
    lastSeenAt: t,
  });
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
    room.suggestions = {};
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
    suggestions: null,
  };
  for (const id of Object.keys(players)) {
    updates[`players/${id}/presence`] = 'lobby';
    updates[`players/${id}/ready`] = false;
  }
  await update(ref(db, `rooms/${normalized}`), updates);
}

/** Shared 3-2-1 then match — only online players enter the race. */
async function beginCountdown(
  code: string,
  opts: { gameId?: string; seed?: number } = {},
) {
  const normalized = code.trim().toUpperCase();
  const nextSeed = opts.seed ?? randomSeed();
  const countdownEndsAt = nowMs() + 3000;
  const t = nowMs();

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
    room.suggestions = {};
    for (const p of Object.values(room.players)) {
      const online = isPlayerOnline(p, t);
      p.presence = online ? 'playing' : 'lobby';
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
    suggestions: null,
  };
  if (opts.gameId) updates.gameId = opts.gameId;
  for (const [id, p] of Object.entries(players)) {
    const online = isPlayerOnline(p, t);
    updates[`players/${id}/presence`] = online ? 'playing' : 'lobby';
    updates[`players/${id}/ready`] = false;
  }
  await update(ref(db, `rooms/${normalized}`), updates);
}

export async function startMatch(code: string, _seed?: number) {
  await beginCountdown(code, { seed: randomSeed() });
}

/** Host picks a game and everyone jumps into the countdown together. */
export async function startPartyGame(code: string, gameId: string, _seed?: number) {
  await beginCountdown(code, { gameId, seed: randomSeed() });
}

export async function rematch(code: string) {
  await beginCountdown(code, { seed: randomSeed() });
}

export async function promoteCountdownToPlaying(code: string) {
  const normalized = code.trim().toUpperCase();
  if (!isFirebaseConfigured()) {
    const store = readLocal();
    const room = store[normalized];
    if (!room || room.status !== 'countdown') return;
    const ends = room.countdownEndsAt ?? 0;
    if (ends && nowMs() < ends) return;
    room.status = 'playing';
    writeLocal(store);
    return;
  }
  const { db } = getFirebase();
  const snap = await get(ref(db, `rooms/${normalized}`));
  if (!snap.exists()) return;
  const room = snap.val() as RoomData;
  if (room.status !== 'countdown') return;
  const ends = room.countdownEndsAt ?? 0;
  if (ends && nowMs() < ends) return;
  await update(ref(db, `rooms/${normalized}`), { status: 'playing' });
}

export async function transferHost(code: string, newHostId: string) {
  const normalized = code.trim().toUpperCase();
  if (!isFirebaseConfigured()) {
    const store = readLocal();
    const room = store[normalized];
    if (!room?.players[newHostId]) return;
    if (room.hostId === newHostId) return;
    room.hostId = newHostId;
    writeLocal(store);
    void pushNotice(normalized, {
      kind: 'host',
      text: `${room.players[newHostId].name} is now host`,
      playerId: newHostId,
    });
    return;
  }
  const { db } = getFirebase();
  const snap = await get(ref(db, `rooms/${normalized}/players/${newHostId}`));
  if (!snap.exists()) return;
  const name = (snap.val() as RoomPlayer).name;
  await update(ref(db, `rooms/${normalized}`), { hostId: newHostId });
  await pushNotice(normalized, {
    kind: 'host',
    text: `${name} is now host`,
    playerId: newHostId,
  });
}

/** Promote next online player if the host fully leaves multiplayer. */
export async function leaveRoom(code: string, playerId: string, opts?: { kicked?: boolean }) {
  const normalized = code.trim().toUpperCase();
  if (!isFirebaseConfigured()) {
    const store = readLocal();
    const room = store[normalized];
    if (!room) return;
    const leaving = room.players[playerId];
    const name = leaving?.name ?? 'Someone';
    const wasHost = room.hostId === playerId;
    delete room.players[playerId];
    if (room.nudges?.[playerId]) delete room.nudges[playerId];
    if (room.finished) delete room.finished[playerId];
    if (room.scores) delete room.scores[playerId];
    const remaining = Object.values(room.players).sort((a, b) => a.joinedAt - b.joinedAt);
    if (remaining.length === 0) {
      delete store[normalized];
      writeLocal(store);
      return;
    }
    if (wasHost) {
      const next = pickNextHost(room, playerId);
      if (next) room.hostId = next.id;
    }
    // If leavers was mid-match, re-check match end.
    const patch = matchAftermathAfterLoss(room, playerId);
    if (patch) Object.assign(room, patch);
    writeLocal(store);
    void pushNotice(normalized, {
      kind: opts?.kicked ? 'kick' : 'leave',
      text: opts?.kicked ? `${name} was removed` : `${name} left`,
      playerId,
    });
    if (wasHost && room.hostId !== playerId) {
      void pushNotice(normalized, {
        kind: 'host',
        text: `${room.players[room.hostId]?.name ?? 'Someone'} is now host`,
        playerId: room.hostId,
      });
    }
    return;
  }

  const { db } = getFirebase();
  const roomSnap = await get(ref(db, `rooms/${normalized}`));
  if (!roomSnap.exists()) return;
  const room = roomSnap.val() as RoomData;
  const leaving = room.players?.[playerId];
  const name = leaving?.name ?? 'Someone';
  const wasHost = room.hostId === playerId;

  try {
    await onDisconnect(ref(db, `rooms/${normalized}/players/${playerId}`)).cancel();
  } catch {
    /* ignore */
  }
  await remove(ref(db, `rooms/${normalized}/players/${playerId}`));
  await remove(ref(db, `rooms/${normalized}/nudges/${playerId}`));
  await remove(ref(db, `rooms/${normalized}/finished/${playerId}`));
  await remove(ref(db, `rooms/${normalized}/scores/${playerId}`));

  const remainingIds = Object.keys(room.players || {}).filter((id) => id !== playerId);
  if (remainingIds.length === 0) {
    await remove(ref(db, `rooms/${normalized}`));
    return;
  }

  const updates: Record<string, unknown> = {};
  if (wasHost) {
    const next = pickNextHost(
      {
        ...room,
        players: Object.fromEntries(
          remainingIds.map((id) => [id, room.players[id]]),
        ),
      },
      playerId,
    );
    if (next) updates.hostId = next.id;
  }

  // Snapshot with player removed for aftermath
  const after: RoomData = {
    ...room,
    players: Object.fromEntries(remainingIds.map((id) => [id, room.players[id]])),
    hostId: (updates.hostId as string) || room.hostId,
  };
  const patch = matchAftermathAfterLoss(after, playerId);
  if (patch) Object.assign(updates, patch);

  if (Object.keys(updates).length) {
    await update(ref(db, `rooms/${normalized}`), updates);
  }

  await pushNotice(normalized, {
    kind: opts?.kicked ? 'kick' : 'leave',
    text: opts?.kicked ? `${name} was removed` : `${name} left`,
    playerId,
  });
  if (wasHost && updates.hostId) {
    const hostPlayer = room.players[updates.hostId as string];
    await pushNotice(normalized, {
      kind: 'host',
      text: `${hostPlayer?.name ?? 'Someone'} is now host`,
      playerId: updates.hostId as string,
    });
  }
}

function matchAftermathAfterLoss(room: RoomData, lostPlayerId: string): Partial<RoomData> | null {
  if (!(room.status === 'playing' || room.status === 'countdown')) return null;
  if (isCountdownActive(room)) {
    // lost already removed from players when called from leaveRoom
    const still = playersInMatch(room);
    if (still.length === 0) {
      return {
        status: 'lobby',
        scores: {},
        finished: {},
        gameState: null,
        winnerId: null,
        countdownEndsAt: null,
      };
    }
    return null;
  }

  const stillPlaying = playersInMatch(room);
  const game = getGame(room.gameId);
  if (stillPlaying.length === 0) {
    return {
      status: 'lobby',
      scores: {},
      finished: {},
      gameState: null,
      winnerId: null,
      countdownEndsAt: null,
    };
  }
  if (game?.modes.includes('turn') && stillPlaying.length < 2) {
    return {
      status: 'lobby',
      scores: {},
      finished: {},
      gameState: null,
      winnerId: null,
      countdownEndsAt: null,
    };
  }
  const finished = { ...(room.finished || {}) };
  delete finished[lostPlayerId];
  if (stillPlaying.every((p) => finished[p.id])) {
    return { status: 'results', finished };
  }
  return null;
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
    const game = getGame(room.gameId);
    if (stillPlaying.length === 0) {
      return {
        status: 'lobby',
        scores: {},
        finished: {},
        gameState: null,
        winnerId: null,
        countdownEndsAt: null,
      };
    }
    if (game?.modes.includes('turn') && stillPlaying.length < 2) {
      return {
        status: 'lobby',
        scores: {},
        finished: {},
        gameState: null,
        winnerId: null,
        countdownEndsAt: null,
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
    room.players[playerId] = { ...room.players[playerId], presence: 'lobby' };
  }
  const patch = applyQuit(room);
  if (patch) await update(ref(db, `rooms/${normalized}`), patch);
}

/** Mark a stuck/away racer as finished and out of the match. */
export async function forfeitMatchPlayer(code: string, playerId: string) {
  const normalized = code.trim().toUpperCase();

  if (!isFirebaseConfigured()) {
    const store = readLocal();
    const room = store[normalized];
    if (!room?.players[playerId]) return;
    if (getPresence(room.players[playerId]) !== 'playing') return;
    const name = room.players[playerId].name;
    room.players[playerId].presence = 'lobby';
    room.finished = { ...(room.finished || {}), [playerId]: true };
    room.scores = {
      ...(room.scores || {}),
      [playerId]: room.scores?.[playerId] ?? {
        primary: 0,
        label: 'Away',
        progress: 1,
      },
    };
    const patch = (() => {
      const stillPlaying = Object.values(room.players).filter(
        (p) => p.id !== playerId && getPresence(p) === 'playing',
      );
      const game = getGame(room.gameId);
      if (stillPlaying.length === 0) {
        return {
          status: 'lobby' as const,
          scores: {},
          finished: {},
          gameState: null,
          winnerId: null,
          countdownEndsAt: null,
        };
      }
      if (game?.modes.includes('turn') && stillPlaying.length < 2) {
        return {
          status: 'lobby' as const,
          scores: {},
          finished: {},
          gameState: null,
          winnerId: null,
          countdownEndsAt: null,
        };
      }
      if (stillPlaying.every((p) => room.finished[p.id])) {
        return { status: 'results' as const };
      }
      return null;
    })();
    if (patch) Object.assign(room, patch);
    writeLocal(store);
    void pushNotice(normalized, {
      kind: 'forfeit',
      text: `${name} left the match (away)`,
      playerId,
    });
    return;
  }

  const { db } = getFirebase();
  const roomSnap = await get(ref(db, `rooms/${normalized}`));
  if (!roomSnap.exists()) return;
  const room = roomSnap.val() as RoomData;
  const target = room.players?.[playerId];
  if (!target || getPresence(target) !== 'playing') return;

  const finished = { ...(room.finished || {}), [playerId]: true };
  const scores = {
    ...(room.scores || {}),
    [playerId]: room.scores?.[playerId] ?? {
      primary: 0,
      label: 'Away',
      progress: 1,
    },
  };
  const updates: Record<string, unknown> = {
    [`players/${playerId}/presence`]: 'lobby',
    finished,
    scores,
  };

  const stillPlaying = Object.values(room.players || {}).filter(
    (p) => p.id !== playerId && getPresence(p) === 'playing',
  );
  const game = getGame(room.gameId);
  if (stillPlaying.length === 0 || (game?.modes.includes('turn') && stillPlaying.length < 2)) {
    updates.status = 'lobby';
    updates.scores = {};
    updates.finished = {};
    updates.gameState = null;
    updates.winnerId = null;
    updates.countdownEndsAt = null;
  } else if (stillPlaying.every((p) => finished[p.id])) {
    updates.status = 'results';
  }

  await update(ref(db, `rooms/${normalized}`), updates);
  await pushNotice(normalized, {
    kind: 'forfeit',
    text: `${target.name} left the match (away)`,
    playerId,
  });
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
  const normalized = code.trim().toUpperCase();
  const nextSeq =
    gameState &&
    typeof gameState === 'object' &&
    typeof (gameState as { seq?: unknown }).seq === 'number'
      ? ((gameState as { seq: number }).seq as number)
      : null;

  if (nextSeq != null) {
    // Reject stale turn writes (last-write-wins races on laggy phones).
    if (!isFirebaseConfigured()) {
      const store = readLocal();
      const room = store[normalized];
      if (!room) return;
      const cur = room.gameState as { seq?: number } | null;
      if (cur && typeof cur.seq === 'number' && nextSeq <= cur.seq) return;
      room.gameState = gameState;
      writeLocal(store);
      return;
    }
    const { db } = getFirebase();
    const snap = await get(ref(db, `rooms/${normalized}/gameState`));
    const cur = snap.exists() ? (snap.val() as { seq?: number }) : null;
    if (cur && typeof cur.seq === 'number' && nextSeq <= cur.seq) return;
  }

  await patchRoom(code, { gameState });
}

export async function suggestGame(code: string, playerId: string, gameId: string) {
  const normalized = code.trim().toUpperCase();
  if (!isFirebaseConfigured()) {
    const store = readLocal();
    const room = store[normalized];
    if (!room) return;
    room.suggestions = { ...(room.suggestions || {}), [playerId]: gameId };
    writeLocal(store);
    return;
  }
  const { db } = getFirebase();
  await set(ref(db, `rooms/${normalized}/suggestions/${playerId}`), gameId);
}

export async function clearSuggestions(code: string) {
  const normalized = code.trim().toUpperCase();
  if (!isFirebaseConfigured()) {
    const store = readLocal();
    const room = store[normalized];
    if (!room) return;
    room.suggestions = {};
    writeLocal(store);
    return;
  }
  const { db } = getFirebase();
  await remove(ref(db, `rooms/${normalized}/suggestions`));
}

export function suggestionTally(
  room: RoomData,
): { gameId: string; count: number; names: string[] }[] {
  const votes = room.suggestions || {};
  const byGame: Record<string, string[]> = {};
  for (const [pid, gameId] of Object.entries(votes)) {
    const name = room.players?.[pid]?.name ?? 'Someone';
    (byGame[gameId] ||= []).push(name);
  }
  return Object.entries(byGame)
    .map(([gameId, names]) => ({ gameId, count: names.length, names }))
    .sort((a, b) => b.count - a.count || a.gameId.localeCompare(b.gameId));
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
    at: nowMs(),
  };
  if (!isFirebaseConfigured()) {
    const store = readLocal();
    const room = store[normalized];
    if (!room) return;
    if (!room.players[from.id]) return;
    const id = `m_${nowMs()}_${Math.random().toString(36).slice(2, 7)}`;
    room.chat = { ...(room.chat || {}), [id]: msg };
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
  const meSnap = await get(ref(db, `rooms/${normalized}/players/${from.id}`));
  if (!meSnap.exists()) return;
  await push(ref(db, `rooms/${normalized}/chat`), msg);
}

export async function nudgePlayer(
  code: string,
  targetId: string,
  from: PlayerInfo,
  text = 'Ready to go?',
) {
  const normalized = code.trim().toUpperCase();
  const nudge: Nudge = {
    fromId: from.id,
    fromName: from.name,
    at: nowMs(),
    text: text.slice(0, 80),
  };
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
  await leaveRoom(code, targetId, { kicked: true });
}

export function chatList(room: RoomData): (ChatMessage & { id: string })[] {
  return Object.entries(room.chat || {})
    .map(([id, m]) => ({ id, ...m }))
    .sort((a, b) => a.at - b.at);
}

export function noticeList(room: RoomData): (RoomNotice & { id: string })[] {
  return Object.entries(room.notices || {})
    .map(([id, n]) => ({ id, ...n }))
    .sort((a, b) => a.at - b.at);
}

/**
 * Idempotent room health pass — any online client may run this.
 * Handles: countdown→playing, host transfer, match forfeits, ghost prune.
 */
export async function reconcileRoom(code: string, actorId: string): Promise<void> {
  const normalized = code.trim().toUpperCase();
  const t = nowMs();

  const run = async (room: RoomData): Promise<void> => {
    if (!room.players?.[actorId]) return;
    if (!isPlayerOnline(room.players[actorId], t)) return;

    // 1) Countdown → playing
    if (room.status === 'countdown') {
      const ends = room.countdownEndsAt ?? 0;
      if (ends && t >= ends) {
        await promoteCountdownToPlaying(normalized);
        room = { ...room, status: 'playing' };
      }
    }

    // 2) Host transfer if host is away
    const host = room.players[room.hostId];
    const hostMissing = !host;
    const hostAwayLong = hostMissing || playerAwayMs(host, t) >= HOST_AWAY_MS;
    if (hostAwayLong) {
      const next = pickNextHost(room, room.hostId, t);
      if (next && next.id !== room.hostId) {
        // Oldest online player performs the transfer to reduce write races.
        if (onlinePlayers(room, t)[0]?.id === actorId) {
          await transferHost(normalized, next.id);
          room = { ...room, hostId: next.id };
        }
      }
    }

    // 3) Forfeit away match participants
    if (room.status === 'playing' || (room.status === 'countdown' && !isCountdownActive(room, t))) {
      for (const p of playersInMatch(room)) {
        if (p.id === actorId) continue;
        if (isPlayerOnline(p, t)) continue;
        const need = matchForfeitMs(room);
        if (playerAwayMs(p, t) < need) continue;
        // Soft-away (still connected) needs the full grace; hard disconnect too.
        const leader = onlinePlayers(room, t)[0];
        if (leader && leader.id === actorId) {
          await forfeitMatchPlayer(normalized, p.id);
        }
      }
    }

    // 4) Prune long-away ghosts (not during active countdown)
    if (room.status === 'lobby' || room.status === 'results') {
      const leader = onlinePlayers(room, t)[0];
      if (leader && leader.id === actorId) {
        for (const p of playersList(room)) {
          if (p.id === actorId) continue;
          if (isPlayerOnline(p, t)) continue;
          if (playerAwayMs(p, t) < PRUNE_AWAY_MS) continue;
          await leaveRoom(normalized, p.id, { kicked: true });
        }
      }
    }
  };

  if (!isFirebaseConfigured()) {
    const store = readLocal();
    const room = store[normalized];
    if (!room) return;
    await run(room);
    return;
  }

  const { db } = getFirebase();
  const snap = await get(ref(db, `rooms/${normalized}`));
  if (!snap.exists()) return;
  await run(snap.val() as RoomData);
}

export const REACTION_MS = 4_000;
export const REACTION_EMOJIS = ['👏', '😂', '😮', '🔥', '💀', '❤️'];

export async function sendReaction(code: string, playerId: string, emoji: string) {
  const normalized = code.trim().toUpperCase();
  const entry: Reaction = { emoji, at: nowMs() };
  if (!isFirebaseConfigured()) {
    const store = readLocal();
    const room = store[normalized];
    if (!room) return;
    room.reactions = { ...(room.reactions || {}), [playerId]: entry };
    writeLocal(store);
    return;
  }
  const { db } = getFirebase();
  await set(ref(db, `rooms/${normalized}/reactions/${playerId}`), entry);
}

const PLACE_POINTS = [3, 2, 1, 1];

/** Placement points for a finished match (ties share the better place). */
export function computeRoundPoints(room: RoomData): Record<string, number> | null {
  const scores = room.scores || {};
  const ids = Object.keys(scores).filter((id) => room.players?.[id]);
  if (ids.length === 0) return null;
  const ranked = [...ids].sort((a, b) => {
    if (room.winnerId) {
      if (a === room.winnerId) return -1;
      if (b === room.winnerId) return 1;
    }
    return compareScores(scores[a], scores[b]);
  });
  const pts: Record<string, number> = {};
  let place = 0;
  ranked.forEach((id, i) => {
    if (i > 0) {
      const prev = ranked[i - 1];
      const tied =
        !room.winnerId && compareScores(scores[prev], scores[id]) === 0;
      if (!tied) place = i;
    }
    pts[id] = PLACE_POINTS[Math.min(place, PLACE_POINTS.length - 1)];
  });
  return pts;
}

/** Idempotent: every client writes the same deterministic round, keyed by match seed. */
export async function recordSeriesRound(code: string, room: RoomData) {
  const normalized = code.trim().toUpperCase();
  const key = String(room.seed);
  if (room.series?.rounds?.[key]) return;
  const pts = computeRoundPoints(room);
  if (!pts) return;
  const names: Record<string, string> = {};
  for (const id of Object.keys(pts)) names[id] = room.players?.[id]?.name ?? 'Player';
  const round: SeriesRound = { gameId: room.gameId, at: nowMs(), pts, names };
  if (!isFirebaseConfigured()) {
    const store = readLocal();
    const live = store[normalized];
    if (!live) return;
    live.series = { rounds: { ...(live.series?.rounds || {}), [key]: round } };
    writeLocal(store);
    return;
  }
  const { db } = getFirebase();
  await set(ref(db, `rooms/${normalized}/series/rounds/${key}`), round);
}

export async function resetSeries(code: string) {
  const normalized = code.trim().toUpperCase();
  if (!isFirebaseConfigured()) {
    const store = readLocal();
    const room = store[normalized];
    if (!room) return;
    room.series = { rounds: {} };
    writeLocal(store);
    return;
  }
  const { db } = getFirebase();
  await remove(ref(db, `rooms/${normalized}/series`));
}

export type SeriesRow = {
  id: string;
  name: string;
  pts: number;
  wins: number;
};

export function seriesRounds(room: RoomData): SeriesRound[] {
  return Object.values(room.series?.rounds || {}).sort((a, b) => a.at - b.at);
}

export function seriesStandings(room: RoomData): SeriesRow[] {
  const rows: Record<string, SeriesRow> = {};
  for (const round of seriesRounds(room)) {
    const top = Math.max(...Object.values(round.pts));
    for (const [id, p] of Object.entries(round.pts)) {
      const row = (rows[id] ||= {
        id,
        name: room.players?.[id]?.name ?? round.names[id] ?? 'Player',
        pts: 0,
        wins: 0,
      });
      row.pts += p;
      if (p === top && top === PLACE_POINTS[0]) row.wins += 1;
    }
  }
  return Object.values(rows).sort((a, b) => b.pts - a.pts || b.wins - a.wins);
}
