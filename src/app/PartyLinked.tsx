import { useEffect, useState } from 'react';
import { getGame } from '../games/registry';
import { ensureNickname, getOrCreatePlayerId } from '../lib/player';
import {
  getPresence,
  hostName,
  playersList,
  subscribeRoom,
  type RoomData,
} from '../multiplayer/rooms';
import { Button } from '../ui/Button';
import { Panel } from '../ui/Panel';
import { copyText } from '../lib/invite';

type Props = {
  code: string;
  onLobby: () => void;
  onQuitMultiplayer: () => void;
};

function statusLabel(room: RoomData, playerId: string): string {
  const player = room.players?.[playerId];
  if (!player) return 'Left';
  if (!player.connected) return 'Away';
  if (room.status === 'results') return player.ready ? 'Results · ready' : 'In results';
  if (room.status === 'countdown') return 'Starting…';
  if (room.status === 'lobby' || getPresence(player) === 'lobby') {
    return player.ready ? 'Lobby · ready ✓' : 'In lobby';
  }
  const game = getGame(room.gameId);
  return game ? `Playing ${game.title}` : 'Playing';
}

export function PartyLinked({ code, onLobby, onQuitMultiplayer }: Props) {
  const [room, setRoom] = useState<RoomData | null>(null);
  const [copied, setCopied] = useState(false);
  const youId = getOrCreatePlayerId();

  useEffect(() => {
    const unsub = subscribeRoom(code, setRoom);
    return () => unsub();
  }, [code]);

  const players = room ? playersList(room) : [];
  const game = room ? getGame(room.gameId) : null;
  const host = room ? hostName(room) : 'Host';

  return (
    <Panel className="join-panel" style={{ marginBottom: 12 }}>
      <p className="h3" style={{ textAlign: 'center' }}>
        Join code
      </p>
      <p className="join-code-hero">{code}</p>
      <p className="muted" style={{ margin: '0 0 10px', textAlign: 'center' }}>
        Same code for everyone — share it to add friends.
      </p>
      <Button
        variant="ghost"
        block
        onClick={async () => {
          const ok = await copyText(code);
          setCopied(ok);
        }}
      >
        {copied ? 'Code copied!' : 'Copy join code'}
      </Button>

      <p className="muted" style={{ margin: '12px 0 8px' }}>
        {room?.status === 'playing' && game
          ? `Match: ${game.emoji} ${game.title}`
          : room?.status === 'countdown' && game
            ? `Starting ${game.emoji} ${game.title}…`
            : room?.status === 'results' && game
              ? `Results: ${game.emoji} ${game.title}`
              : `${host} picks the games for this party.`}
      </p>
      {players.length ? (
        <ul style={{ paddingLeft: 18, margin: '0 0 12px', fontWeight: 700 }}>
          {players.map((p) => (
            <li key={p.id}>
              {p.name}
              {p.id === youId ? ' (you)' : ''}
              {p.id === room?.hostId ? ' 👑' : ''} —{' '}
              <span className="muted" style={{ fontWeight: 800 }}>
                {statusLabel(room!, p.id)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted" style={{ marginBottom: 12 }}>
          {ensureNickname()}, loading party…
        </p>
      )}
      <div className="stack">
        <Button variant="primary" block onClick={onLobby}>
          Lobby
        </Button>
        <Button variant="ghost" block onClick={onQuitMultiplayer}>
          Quit multiplayer
        </Button>
      </div>
    </Panel>
  );
}
