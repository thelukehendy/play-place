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

/** Remember avatars from the latest room snapshot so any UI can look them up by id. */
export function registerAvatars(players: Record<string, { avatar?: string }> | undefined) {
  if (!players) return;
  for (const [id, p] of Object.entries(players)) {
    if (p.avatar) registry.set(id, p.avatar);
  }
}

export function avatarOf(id: string): string {
  return registry.get(id) ?? avatarFromId(id);
}
