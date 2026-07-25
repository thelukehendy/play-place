import { useEffect, useMemo, useRef, useState } from 'react';
import { getGame } from '../games/registry';
import type { GameFinishPayload, ScoreValue } from '../games/types';
import { ensureNickname, getOrCreatePlayerId } from '../lib/player';
import { isFirebaseConfigured } from '../multiplayer/firebase';
import {
  finishTurnGame,
  getPresence,
  markFinished,
  playersList,
  rematch,
  setRoomGame,
  setSharedGameState,
  startMatch,
  subscribeRoom,
  updateScore,
  type RoomData,
} from '../multiplayer/rooms';
import { Button } from '../ui/Button';
import { Panel } from '../ui/Panel';
import { Scoreboard } from '../ui/GameChrome';
import { GAMES } from '../games/registry';
import { copyText, roomInviteUrl, shareRoomInvite } from '../lib/invite';

type Props = {
  code: string;
  onBrowseGames: () => void;
  onQuitGame: () => void;
};

export function RoomSession({ code, onBrowseGames, onQuitGame }: Props) {
  const [room, setRoom] = useState<RoomData | null>(null);
  const [error, setError] = useState('');
  const [inviteNote, setInviteNote] = useState('');
  const player = useMemo(
    () => ({ id: getOrCreatePlayerId(), name: ensureNickname() }),
    [],
  );

  useEffect(() => {
    const unsub = subscribeRoom(code, setRoom);
    return () => unsub();
  }, [code]);

  if (error) {
    return (
      <Panel>
        <p>{error}</p>
        <Button onClick={onBrowseGames}>Games</Button>
      </Panel>
    );
  }

  if (!room) {
    return (
      <Panel>
        <p className="muted">Loading room…</p>
      </Panel>
    );
  }

  const players = playersList(room);
  const isHost = room.hostId === player.id;
  const game = getGame(room.gameId);
  const me = room.players?.[player.id];
  const myPresence = me ? getPresence(me) : 'lobby';
  // Only stay out of a live match after an explicit Quit game (presence lobby + finished).
  // Do not use presence alone — startMatch used to race status ahead of presence.
  const optedOutOfMatch =
    room.status === 'playing' &&
    myPresence === 'lobby' &&
    !!room.finished?.[player.id];

  if (room.status === 'lobby' || optedOutOfMatch) {
    return (
      <div className="stack" style={{ animation: 'pop-in 0.3s var(--bounce)' }}>
        <div className="row" style={{ color: 'var(--cream)', textShadow: '1px 1px 0 var(--ink)' }}>
          <h2 className="h2" style={{ flex: 1, color: 'var(--gold)' }}>
            Lobby · {room.code}
          </h2>
          <Button variant="ghost" onClick={onBrowseGames}>
            Games
          </Button>
        </div>
        <Panel>
          {!isFirebaseConfigured() ? (
            <p className="muted" style={{ marginBottom: 10 }}>
              Demo mode: rooms stay on this device only. Add Firebase for real friend play — see README.
            </p>
          ) : null}

          {room.status === 'playing' ? (
            <p className="muted" style={{ marginBottom: 8 }}>
              You&apos;re in the lobby. Friends still in the match keep playing — you&apos;ll see results
              when they finish, or browse games anytime.
            </p>
          ) : (
            <p className="muted" style={{ marginBottom: 8 }}>
              Party stays linked after each match. Quit multiplayer from the games screen when
              you&apos;re done.
            </p>
          )}

          <p className="h3">Share invite</p>
          <p
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '2.4rem',
              fontWeight: 800,
              letterSpacing: '0.18em',
              margin: '8px 0 12px',
              textAlign: 'center',
              color: 'var(--red)',
            }}
          >
            {room.code}
          </p>
          <p className="muted" style={{ marginBottom: 10, wordBreak: 'break-all' }}>
            {roomInviteUrl(room.code)}
          </p>
          <div className="stack">
            <Button
              variant="gold"
              block
              onClick={async () => {
                const result = await shareRoomInvite(room.code);
                setInviteNote(
                  result === 'shared'
                    ? 'Invite shared!'
                    : result === 'copied'
                      ? 'Invite link copied — friends open it to join this room.'
                      : 'Could not share. Copy the link above.',
                );
              }}
            >
              Share / copy invite link
            </Button>
            <Button
              variant="ghost"
              block
              onClick={async () => {
                const ok = await copyText(room.code);
                setInviteNote(ok ? `Code ${room.code} copied.` : 'Could not copy code.');
              }}
            >
              Copy code only
            </Button>
          </div>
          {inviteNote ? (
            <p className="muted" style={{ marginTop: 8, fontWeight: 800, color: 'var(--green-dark)' }}>
              {inviteNote}
            </p>
          ) : null}

          <div style={{ height: 14 }} />
          <p className="h3">Players</p>
          <ul style={{ paddingLeft: 18, fontWeight: 700 }}>
            {players.map((p) => {
              const presence = getPresence(p);
              let status = '';
              if (!p.connected) status = ' (away)';
              else if (room.status === 'playing' && presence === 'playing') status = ' (playing)';
              else status = ' (lobby)';
              return (
                <li key={p.id}>
                  {p.name}
                  {p.id === room.hostId ? ' 👑' : ''}
                  {p.id === player.id ? ' (you)' : ''}
                  {status}
                </li>
              );
            })}
          </ul>

          <div style={{ height: 14 }} />
          <p className="h3">Game</p>
          {room.status === 'playing' ? (
            <p style={{ fontWeight: 800, marginTop: 8 }}>
              {game?.emoji} {game?.title ?? room.gameId} — in progress
            </p>
          ) : isHost ? (
            <select
              className="field"
              value={room.gameId}
              onChange={(e) => setRoomGame(room.code, e.target.value).catch((err) => setError(String(err)))}
              style={{ marginTop: 8 }}
            >
              {GAMES.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.emoji} {g.title}
                </option>
              ))}
            </select>
          ) : (
            <p style={{ fontWeight: 800, marginTop: 8 }}>
              {game?.emoji} {game?.title ?? room.gameId}
            </p>
          )}

          <div style={{ height: 14 }} />
          {room.status === 'playing' ? (
            <Button variant="sky" block onClick={onBrowseGames}>
              Browse games
            </Button>
          ) : isHost ? (
            <Button
              variant="primary"
              block
              disabled={
                game?.modes.includes('turn')
                  ? players.filter((p) => p.connected).length < 2
                  : players.filter((p) => p.connected).length < 1
              }
              onClick={() => startMatch(room.code).catch((err) => setError(String(err)))}
            >
              Start match!
            </Button>
          ) : (
            <p className="muted">Waiting for host to start…</p>
          )}
          {room.status === 'lobby' &&
          isHost &&
          game?.modes.includes('turn') &&
          players.filter((p) => p.connected).length < 2 ? (
            <p className="muted" style={{ marginTop: 8 }}>
              Need 2 connected players for this game.
            </p>
          ) : null}

          {room.status === 'lobby' && isHost ? (
            <>
              <div style={{ height: 10 }} />
              <Button variant="sky" block onClick={onBrowseGames}>
                Browse other games
              </Button>
            </>
          ) : null}
        </Panel>
      </div>
    );
  }

  if (room.status === 'results') {
    return (
      <ResultsRoom
        room={room}
        playerId={player.id}
        isHost={isHost}
        onRematch={() => rematch(room.code).catch((err) => setError(String(err)))}
        onPickGame={() =>
          setRoomGame(room.code, room.gameId).catch((err) => setError(String(err)))
        }
        onBrowseGames={onBrowseGames}
      />
    );
  }

  if (!game) {
    return (
      <Panel>
        <p>Unknown game.</p>
        <Button onClick={onBrowseGames}>Games</Button>
      </Panel>
    );
  }

  return (
    <RoomPlay
      room={room}
      game={game}
      player={player}
      players={players.map((p) => ({ id: p.id, name: p.name }))}
      onError={setError}
      onQuitGame={onQuitGame}
    />
  );
}

function ResultsRoom({
  room,
  playerId,
  isHost,
  onRematch,
  onPickGame,
  onBrowseGames,
}: {
  room: RoomData;
  playerId: string;
  isHost: boolean;
  onRematch: () => void;
  onPickGame: () => void;
  onBrowseGames: () => void;
}) {
  const game = getGame(room.gameId);
  const players = playersList(room).map((p) => ({ id: p.id, name: p.name }));
  return (
    <div className="stack" style={{ animation: 'pop-in 0.35s var(--bounce)' }}>
      <h2
        className="h2"
        style={{
          textAlign: 'center',
          color: 'var(--gold)',
          WebkitTextStroke: '1.5px var(--ink)',
          textShadow: '2px 2px 0 var(--ink)',
        }}
      >
        Results!
      </h2>
      <Panel>
        <p className="h3" style={{ marginBottom: 10 }}>
          {game?.emoji} {game?.title}
        </p>
        <Scoreboard players={players} scores={room.scores || {}} youId={playerId} />
        <p className="muted" style={{ margin: '12px 0 0' }}>
          Party still linked in room <strong>{room.code}</strong>
        </p>
        <div style={{ height: 14 }} />
        {isHost ? (
          <div className="stack">
            <Button variant="primary" block onClick={onPickGame}>
              Pick next game
            </Button>
            <Button variant="gold" block onClick={onRematch}>
              Rematch same game
            </Button>
            <Button variant="sky" block onClick={onBrowseGames}>
              Browse all games
            </Button>
          </div>
        ) : (
          <p className="muted">Waiting for host to pick the next game…</p>
        )}
        <div style={{ height: 8 }} />
        <Button variant="ghost" block onClick={onBrowseGames}>
          Games (stay in party)
        </Button>
      </Panel>
    </div>
  );
}

function RoomPlay({
  room,
  game,
  player,
  players,
  onError,
  onQuitGame,
}: {
  room: RoomData;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  game: NonNullable<ReturnType<typeof getGame>>;
  player: { id: string; name: string };
  players: { id: string; name: string }[];
  onError: (e: string) => void;
  onQuitGame: () => void;
}) {
  const initialState = useMemo(
    () => game.createInitialState(room.seed, players),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [room.seed, room.gameId],
  );

  useEffect(() => {
    if (!game.modes.includes('turn')) return;
    if (room.gameState != null) return;
    setSharedGameState(room.code, initialState).catch((err) => onError(String(err)));
  }, [game.modes, room.gameState, room.code, initialState, onError]);

  const finishedPlayers = Object.entries(room.finished || {})
    .filter(([, v]) => v)
    .map(([id]) => id);

  // Seed a starting score so opponents appear immediately
  useEffect(() => {
    if (room.scores?.[player.id]) return;
    updateScore(room.code, player.id, {
      primary: 0,
      label: 'Playing…',
      progress: 0,
    }).catch(() => undefined);
  }, [room.code, room.scores, player.id]);

  const scoreTimer = useRef<number | null>(null);
  const pendingScore = useRef<ScoreValue | null>(null);

  const onLocalScore = (score: ScoreValue) => {
    pendingScore.current = score;
    if (scoreTimer.current) return;
    scoreTimer.current = window.setTimeout(() => {
      scoreTimer.current = null;
      const next = pendingScore.current;
      if (next) {
        updateScore(room.code, player.id, next).catch((err) => onError(String(err)));
      }
    }, 120);
  };

  useEffect(
    () => () => {
      if (scoreTimer.current) clearTimeout(scoreTimer.current);
    },
    [],
  );

  const onFinishRace = async (payload: GameFinishPayload) => {
    try {
      if (scoreTimer.current) {
        clearTimeout(scoreTimer.current);
        scoreTimer.current = null;
      }
      await updateScore(room.code, player.id, {
        ...payload.score,
        progress: 1,
      });
      await markFinished(room.code, player.id);
    } catch (err) {
      onError(String(err));
    }
  };

  const livePlayers =
    game.modes.includes('turn') ? players.slice(0, 2) : players;

  return (
    <div className="stack" style={{ animation: 'pop-in 0.3s var(--bounce)' }}>
      <div className="row" style={{ color: 'var(--cream)', textShadow: '1px 1px 0 var(--ink)' }}>
        <h2 className="h2" style={{ flex: 1, color: 'var(--gold)', fontSize: '1.3rem' }}>
          {game.emoji} {game.title}
        </h2>
        <Button variant="ghost" onClick={onQuitGame}>
          Quit game
        </Button>
      </div>
      <Panel>
        <Scoreboard
          title="Match status"
          players={livePlayers}
          scores={room.scores || {}}
          youId={player.id}
          finished={finishedPlayers}
        />
        {game.modes.includes('turn') && game.TurnView ? (
          <game.TurnView
            seed={room.seed}
            player={player}
            players={players.slice(0, 2)}
            state={(room.gameState as never) ?? initialState}
            onStateChange={(s) => {
              setSharedGameState(room.code, s).catch((err) => onError(String(err)));
              if (game.getScoresFromState) {
                const scores = game.getScoresFromState(s, players.slice(0, 2));
                Object.entries(scores).forEach(([id, score]) => {
                  updateScore(room.code, id, score).catch(() => undefined);
                });
              }
            }}
            onFinish={(payload) => {
              finishTurnGame(room.code, payload.winnerId).catch((err) => onError(String(err)));
              updateScore(room.code, player.id, {
                ...payload.score,
                progress: 1,
              }).catch(() => undefined);
            }}
          />
        ) : game.RaceView ? (
          <game.RaceView
            seed={room.seed}
            player={player}
            players={players}
            initialState={initialState}
            remoteScores={room.scores || {}}
            finishedPlayers={finishedPlayers}
            onLocalScore={onLocalScore}
            onFinish={onFinishRace}
          />
        ) : (
          <p>This game has no multiplayer view yet.</p>
        )}
      </Panel>
    </div>
  );
}
