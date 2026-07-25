import { useEffect, useState } from 'react';
import { getGame } from '../games/registry';
import { ensureNickname, getOrCreatePlayerId } from '../lib/player';
import {
  getPresence,
  playersList,
  subscribeRoom,
  type RoomData,
} from '../multiplayer/rooms';
import { Button } from '../ui/Button';
import { Panel } from '../ui/Panel';

type Props = {
  code: string;
  onLobby: () => void;
  onQuitMultiplayer: () => void;
};

function statusLabel(room: RoomData, playerId: string): string {
  const player = room.players?.[playerId];
  if (!player) return 'Left';
  if (!player.connected) return 'Away';
  if (room.status === 'results') return 'In results';
  if (room.status === 'lobby' || getPresence(player) === 'lobby') return 'In lobby';
  const game = getGame(room.gameId);
  return game ? `Playing ${game.title}` : 'Playing';
}

export function PartyLinked({ code, onLobby, onQuitMultiplayer }: Props) {
  const [room, setRoom] = useState<RoomData | null>(null);
  const youId = getOrCreatePlayerId();

  useEffect(() => {
    const unsub = subscribeRoom(code, setRoom);
    return () => unsub();
  }, [code]);

  const players = room ? playersList(room) : [];
  const game = room ? getGame(room.gameId) : null;

  return (
    <Panel className="join-panel" style={{ marginBottom: 12 }}>
      <p className="h3">Party linked · {code}</p>
      <p className="muted" style={{ margin: '4px 0 10px' }}>
        {room?.status === 'playing' && game
          ? `Match in progress: ${game.emoji} ${game.title}`
          : room?.status === 'results' && game
            ? `Results ready: ${game.emoji} ${game.title}`
            : 'You stay linked until you quit multiplayer.'}
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
