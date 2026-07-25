const NICK_KEY = 'playplace.nickname';
const ID_KEY = 'playplace.playerId';

const ADJECTIVES = [
  'Speedy',
  'Bouncy',
  'Lucky',
  'Sunny',
  'Zesty',
  'Brave',
  'Sparkly',
  'Jumpy',
  'Happy',
  'Wild',
];
const NOUNS = [
  'Block',
  'Star',
  'Pipe',
  'Coin',
  'Cloud',
  'Brick',
  'Bean',
  'Bolt',
  'Duck',
  'Fox',
];

export function getOrCreatePlayerId(): string {
  let id = localStorage.getItem(ID_KEY);
  if (!id) {
    id = `p_${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(ID_KEY, id);
  }
  return id;
}

export function getNickname(): string {
  return localStorage.getItem(NICK_KEY) ?? '';
}

export function setNickname(name: string) {
  localStorage.setItem(NICK_KEY, name.trim().slice(0, 16));
}

export function randomNickname(): string {
  const a = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const n = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  const num = Math.floor(Math.random() * 90) + 10;
  return `${a}${n}${num}`;
}

export function ensureNickname(): string {
  let nick = getNickname();
  if (!nick) {
    nick = randomNickname();
    setNickname(nick);
  }
  return nick;
}
