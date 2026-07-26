import { useEffect, useMemo, useRef, useState } from 'react';
import { getGame } from '../games/registry';
import type { GameFinishPayload, ScoreValue } from '../games/types';
import { ensureNickname, getOrCreatePlayerId } from '../lib/player';
import { isFirebaseConfigured } from '../multiplayer/firebase';
import {
  allConnectedReady,
  clearNudge,
  finishTurnGame,
  getPresence,
  hostName,
  markFinished,
  nudgePlayer,
  playersList,
  rematch,
  removePlayer,
  setPlayerReady,
  setSharedGameState,
  startMatch,
  subscribeRoom,
  updateScore,
  type RoomData,
  type RoomPlayer,
} from '../multiplayer/rooms';
import { Button } from '../ui/Button';
import { Panel } from '../ui/Panel';
import { Scoreboard } from '../ui/GameChrome';
import { GAMES } from '../games/registry';
import { copyText, roomInviteUrl, shareRoomInvite } from '../lib/invite';
import { recordMultiplayerMatch } from '../lib/stats';
import { sfxCountdown, sfxFinish, sfxGo, sfxReady } from '../lib/sfx';

const NUDGE_REMOVE_MS = 6000;

type Props = {
  code: string;
  onBrowseGames: () => void;
  onQuitGame: () => void;
  onHostPickGame: (gameId: string) => void;
};

function useNow(active: boolean, intervalMs = 100) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [active, intervalMs]);
  return now;
}

export function RoomSession({ code, onBrowseGames, onQuitGame, onHostPickGame }: Props) {
  const [room, setRoom] = useState<RoomData | null>(null);
  const [error, setError] = useState('');
  const [inviteNote, setInviteNote] = useState('');
  const player = useMemo(
    () => ({ id: getOrCreatePlayerId(), name: ensureNickname() }),
    [],
  );
  const now = useNow(!!room && (room.status === 'countdown' || room.status === 'playing'));

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
  const optedOutOfMatch =
    room.status === 'playing' &&
    myPresence === 'lobby' &&
    !!room.finished?.[player.id];

  const countdownEnds = room.countdownEndsAt ?? 0;
  const inCountdown = room.status === 'countdown' && now < countdownEnds;
  const matchLive =
    room.status === 'playing' || (room.status === 'countdown' && now >= countdownEnds);

  if (inCountdown && game) {
    return (
      <CountdownScreen
        room={room}
        gameTitle={`${game.emoji} ${game.title}`}
        endsAt={countdownEnds}
        now={now}
      />
    );
  }

  if (room.status === 'lobby' || optedOutOfMatch) {
    const readyOk = allConnectedReady(room);
    const amReady = !!me?.ready;
    return (
      <div className="stack" style={{ animation: 'pop-in 0.3s var(--bounce)' }}>
        <div className="row" style={{ color: 'var(--cream)', textShadow: '1px 1px 0 var(--ink)' }}>
          <h2 className="h2" style={{ flex: 1, color: 'var(--gold)' }}>
            Party lobby
          </h2>
          <Button variant="ghost" onClick={onBrowseGames}>
            Games
          </Button>
        </div>
        <Panel>
          {!isFirebaseConfigured() ? (
            <p className="muted" style={{ marginBottom: 10 }}>
              Demo mode: rooms stay on this device only.
            </p>
          ) : null}

          <p className="h3" style={{ textAlign: 'center' }}>
            Join code
          </p>
          <p className="join-code-hero">{room.code}</p>
          <p className="muted" style={{ marginBottom: 10, wordBreak: 'break-all', textAlign: 'center' }}>
            Friends enter this same code — or open {roomInviteUrl(room.code)}
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
                      ? 'Invite link copied.'
                      : 'Could not share.',
                );
              }}
            >
              Share invite
            </Button>
            <Button
              variant="ghost"
              block
              onClick={async () => {
                const ok = await copyText(room.code);
                setInviteNote(ok ? `Join code ${room.code} copied.` : 'Could not copy.');
              }}
            >
              Copy join code
            </Button>
          </div>
          {inviteNote ? (
            <p className="muted" style={{ marginTop: 8, fontWeight: 800, color: 'var(--green-dark)' }}>
              {inviteNote}
            </p>
          ) : null}

          <div style={{ height: 14 }} />
          <p className="h3">Players</p>
          <ReadyPlayerList
            room={room}
            youId={player.id}
            onError={setError}
          />

          <div style={{ height: 12 }} />
          <Button
            variant={amReady ? 'green' : 'sky'}
            block
            onClick={() => {
              sfxReady();
              setPlayerReady(room.code, player.id, !amReady).catch((err) => setError(String(err)));
            }}
          >
            {amReady ? 'Ready!' : 'Ready?'}
          </Button>

          <div style={{ height: 14 }} />
          <p className="h3">Game</p>
          <p className="muted" style={{ margin: '4px 0 8px' }}>
            {isHost
              ? 'You pick the games for the party.'
              : `${hostName(room)} picks the games — hang tight.`}
          </p>
          {room.status === 'playing' ? (
            <p style={{ fontWeight: 800 }}>
              {game?.emoji} {game?.title ?? room.gameId} — in progress
            </p>
          ) : isHost ? (
            <select
              className="field"
              value={room.gameId}
              onChange={(e) => {
                if (!readyOk) {
                  setError('Everyone must ready up before starting.');
                  return;
                }
                onHostPickGame(e.target.value);
              }}
              style={{ marginTop: 4 }}
            >
              {GAMES.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.emoji} {g.title}
                </option>
              ))}
            </select>
          ) : (
            <p style={{ fontWeight: 800 }}>
              {game?.emoji} {game?.title ?? room.gameId}
            </p>
          )}

          <div style={{ height: 14 }} />
          {room.status === 'playing' ? (
            <Button variant="sky" block onClick={onBrowseGames}>
              Browse games
            </Button>
          ) : isHost ? (
            <>
              {!readyOk ? (
                <p className="muted" style={{ marginBottom: 8 }}>
                  Waiting for everyone to ready up before start.
                </p>
              ) : null}
              <Button
                variant="primary"
                block
                disabled={!readyOk}
                onClick={() => {
                  if (!readyOk) return;
                  startMatch(room.code).catch((err) => setError(String(err)));
                }}
              >
                Start match!
              </Button>
            </>
          ) : (
            <p className="muted">Waiting for {hostName(room)} to start…</p>
          )}
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
        onRematch={() => {
          if (!allConnectedReady(room)) {
            setError('Everyone must ready up for a rematch.');
            return;
          }
          rematch(room.code).catch((err) => setError(String(err)));
        }}
        onPickGame={(gameId) => onHostPickGame(gameId)}
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

  if (!matchLive && room.status !== 'playing') {
    return (
      <Panel>
        <p className="muted">Getting ready…</p>
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

function ReadyPlayerList({
  room,
  youId,
  onError,
}: {
  room: RoomData;
  youId: string;
  onError?: (msg: string) => void;
}) {
  const players = playersList(room);
  const you = useMemo(
    () => ({ id: youId, name: ensureNickname() }),
    [youId],
  );
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);

  return (
    <ul style={{ paddingLeft: 0, listStyle: 'none', fontWeight: 700, margin: 0 }}>
      {players.map((p: RoomPlayer) => {
        const presence = getPresence(p);
        let status = '';
        if (!p.connected) status = 'away';
        else if (room.status === 'playing' && presence === 'playing') status = 'playing';
        else status = p.ready ? 'Ready!' : 'not ready';
        const nudge = room.nudges?.[p.id];
        const nudgedAgo = nudge ? now - nudge.at : 0;
        const canRemove =
          !p.ready &&
          p.connected &&
          p.id !== youId &&
          !!nudge &&
          (nudge.fromId === youId || room.hostId === youId) &&
          nudgedAgo >= NUDGE_REMOVE_MS;

        return (
          <li key={p.id} style={{ marginBottom: 8 }}>
            <button
              type="button"
              className="ready-name-btn"
              disabled={p.id === youId || !!p.ready || !p.connected}
              onClick={() => {
                if (p.id === youId || p.ready) return;
                nudgePlayer(room.code, p.id, you).catch((err) => onError?.(String(err)));
              }}
            >
              {p.name}
              {p.id === room.hostId ? ' 👑' : ''}
              {p.id === youId ? ' (you)' : ''}
              <span className="muted"> — {status}</span>
            </button>
            {!p.ready && p.id !== youId && p.connected ? (
              <p className="muted" style={{ fontSize: '0.8rem', margin: '2px 0 0 4px' }}>
                Tap name to nudge “Ready to go?”
              </p>
            ) : null}
            {canRemove ? (
              <Button
                variant="ghost"
                block
                style={{ marginTop: 4 }}
                onClick={() => {
                  removePlayer(room.code, p.id)
                    .then(() => clearNudge(room.code, p.id))
                    .catch((err) => onError?.(String(err)));
                }}
              >
                Remove {p.name}
              </Button>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

function CountdownScreen({
  room,
  gameTitle,
  endsAt,
  now,
}: {
  room: RoomData;
  gameTitle: string;
  endsAt: number;
  now: number;
}) {
  const left = Math.max(0, Math.ceil((endsAt - now) / 1000));
  const last = useRef<number | null>(null);
  useEffect(() => {
    if (left !== last.current) {
      last.current = left;
      if (left > 0) sfxCountdown(left);
      else sfxGo();
    }
  }, [left]);

  return (
    <div className="stack" style={{ animation: 'pop-in 0.25s var(--bounce)' }}>
      <Panel style={{ textAlign: 'center', padding: '28px 16px' }}>
        <p className="h3">{gameTitle}</p>
        <p className="muted" style={{ margin: '8px 0 4px' }}>
          Join code {room.code}
        </p>
        <p
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '4.5rem',
            fontWeight: 800,
            margin: '12px 0',
            color: 'var(--red)',
          }}
        >
          {left > 0 ? left : 'GO!'}
        </p>
        <p className="muted" style={{ fontWeight: 800 }}>
          Everyone starts together
        </p>
      </Panel>
    </div>
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
  onPickGame: (gameId: string) => void;
  onBrowseGames: () => void;
}) {
  const game = getGame(room.gameId);
  const players = playersList(room);
  const boardPlayers = players.map((p) => ({ id: p.id, name: p.name }));
  const readyOk = allConnectedReady(room);
  const me = room.players?.[playerId];
  const amReady = !!me?.ready;

  useEffect(() => {
    const scores = room.scores || {};
    if (!Object.keys(scores).length) return;
    const key = `playplace.recorded.${room.code}.${room.seed}.${room.gameId}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, '1');
    sfxFinish();
    recordMultiplayerMatch({
      gameId: room.gameId,
      code: room.code,
      localPlayerId: playerId,
      winnerId: room.winnerId,
      players: players.map((p) => ({
        id: p.id,
        name: p.name,
        primary: scores[p.id]?.primary ?? 0,
        label: scores[p.id]?.label,
      })),
    });
  }, [room, playerId, players]);

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
        <Scoreboard players={boardPlayers} scores={room.scores || {}} youId={playerId} />
        <p className="muted" style={{ margin: '12px 0 0', textAlign: 'center' }}>
          Join code <strong>{room.code}</strong> · party still linked
        </p>

        <div style={{ height: 12 }} />
        <p className="h3">Ready for next?</p>
        <ReadyPlayerList room={room} youId={playerId} />
        <div style={{ height: 10 }} />
        <Button
          variant={amReady ? 'green' : 'sky'}
          block
          onClick={() => {
            sfxReady();
            setPlayerReady(room.code, playerId, !amReady).catch(() => undefined);
          }}
        >
          {amReady ? 'Ready!' : 'Ready?'}
        </Button>

        <div style={{ height: 14 }} />
        {isHost ? (
          <div className="stack">
            <p className="muted">
              You pick the next game
              {!readyOk ? ' — wait for everyone to ready up.' : '.'}
            </p>
            <select
              className="field"
              defaultValue={room.gameId}
              disabled={!readyOk}
              onChange={(e) => onPickGame(e.target.value)}
            >
              {GAMES.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.emoji} {g.title}
                </option>
              ))}
            </select>
            <Button variant="gold" block disabled={!readyOk} onClick={onRematch}>
              Rematch
            </Button>
            <Button variant="ghost" block onClick={onBrowseGames}>
              Browse games
            </Button>
          </div>
        ) : (
          <div className="stack">
            <p className="muted">
              {hostName(room)} picks the next game. You stay in the party.
            </p>
            <Button variant="ghost" block onClick={onBrowseGames}>
              Browse games
            </Button>
          </div>
        )}
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
    () => game.createInitialState(room.seed, players.slice(0, 4)),
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

  const livePlayers = players.slice(0, 4);

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
      <p className="muted" style={{ textAlign: 'center', fontWeight: 800, marginTop: -4 }}>
        Join code {room.code}
      </p>
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
            players={players.slice(0, 4)}
            state={(room.gameState as never) ?? initialState}
            onStateChange={(s) => {
              setSharedGameState(room.code, s).catch((err) => onError(String(err)));
              if (game.getScoresFromState) {
                const scores = game.getScoresFromState(s, players.slice(0, 4));
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
            players={livePlayers}
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
