import { hashString } from './random';

const KEY = 'playplace.avatar';

export const AVATARS = ['🦊', '🐼', '🐸', '🐙', '🦄', '🐯', '🐵', '🐧', '🦖', '🐝', '🐳', '🦉'];

export function avatarFromId(id: string): string {
  return AVATARS[hashString(id) % AVATARS.length];
}

export function getMyAvatar(playerId: string): string {
  try {
    const v = localStorage.getItem(KEY);
    if (v && AVATARS.includes(v)) return v;
  } catch {
    /* ignore */
  }
  return avatarFromId(playerId);
}

export function setMyAvatar(avatar: string) {
  try {
    localStorage.setItem(KEY, avatar);
  } catch {
    /* ignore */
  }
}

const registry = new Map<string, string>();

/** Prefer a free emoji when joining a room so two friends never look identical. */
export function pickUniqueAvatar(
  playerId: string,
  taken: Iterable<string | undefined>,
): string {
  const used = new Set([...taken].filter(Boolean) as string[]);
  const preferred = getMyAvatar(playerId);
  if (!used.has(preferred)) return preferred;
  for (const a of AVATARS) {
    if (!used.has(a)) return a;
  }
  return preferred;
}

/** Remember avatars from the latest room snapshot so any UI can look them up by id. */
export function registerAvatars(
  players: Record<string, { avatar?: string }> | undefined,
) {
  if (!players) return;
  for (const [id, p] of Object.entries(players)) {
    registry.set(id, p.avatar || avatarFromId(id));
  }
}

export function avatarOf(id: string): string {
  return registry.get(id) ?? avatarFromId(id);
}
