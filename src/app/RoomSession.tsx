import { useEffect, useMemo, useRef, useState } from 'react';
import { getGame } from '../games/registry';
import type { GameFinishPayload, ScoreValue } from '../games/types';
import { ensureNickname, getOrCreatePlayerId } from '../lib/player';
import { isFirebaseConfigured } from '../multiplayer/firebase';
import {
  NUDGE_REMOVE_MS,
  allConnectedReady,
  clearNudge,
  finishTurnGame,
  getPresence,
  hasOptedOutOfMatch,
  hostName,
  isCountdownActive,
  isMatchLive,
  isPlayerOnline,
  markFinished,
  nudgePlayer,
  playersList,
  rematch,
  removePlayer,
  setPlayerReady,
  setSharedGameState,
  startMatch,
  subscribeRoom,
  suggestionTally,
  transferHost,
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
import { ScreenHeader } from './PartyChat';

type Props = {
  code: string;
  onBrowseGames: () => void;
  onQuitGame: () => void;
  onLeaveParty: () => void;
  onHostPickGame: (gameId: string, opts?: { start: boolean }) => void;
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

export function RoomSession({
  code,
  onBrowseGames,
  onQuitGame,
  onLeaveParty,
  onHostPickGame,
}: Props) {
  const [room, setRoom] = useState<RoomData | null>(null);
  const [error, setError] = useState('');
  const [inviteNote, setInviteNote] = useState('');
  const player = useMemo(
    () => ({ id: getOrCreatePlayerId(), name: ensureNickname() }),
    [],
  );
  const now = useNow(
    !!room &&
      (room.status === 'countdown' ||
        room.status === 'playing' ||
        room.status === 'lobby' ||
        room.status === 'results'),
    room?.status === 'countdown' || room?.status === 'playing' ? 100 : 500,
  );

  useEffect(() => {
    const unsub = subscribeRoom(code, setRoom);
    return () => unsub();
  }, [code]);

  if (error) {
    return (
      <div className="stack">
        <ScreenHeader
          title={<h2 className="h2" style={{ color: 'var(--gold)' }}>Party</h2>}
          action={
            <Button variant="ghost" onClick={onBrowseGames}>
              Games
            </Button>
          }
        />
        <Panel>
          <p>{error}</p>
          <Button onClick={onBrowseGames}>Games</Button>
        </Panel>
      </div>
    );
  }

  if (!room) {
    return (
      <div className="stack">
        <ScreenHeader
          title={<h2 className="h2" style={{ color: 'var(--gold)' }}>Party</h2>}
          action={
            <Button variant="ghost" onClick={onBrowseGames}>
              Games
            </Button>
          }
        />
        <Panel>
          <p className="muted">Loading room…</p>
        </Panel>
      </div>
    );
  }

  const players = playersList(room);
  const isHost = room.hostId === player.id;
  const game = getGame(room.gameId);
  const me = room.players?.[player.id];
  const optedOutOfMatch = hasOptedOutOfMatch(room, player.id, now);
  const countdownActive = isCountdownActive(room, now);
  const waitingForSharedGo =
    room.status === 'countdown' &&
    !countdownActive &&
    !!me &&
    getPresence(me) === 'playing';
  const matchLive = isMatchLive(room, now);

  // Hold on countdown / GO until status flips to playing (shared start).
  if ((countdownActive || waitingForSharedGo) && game) {
    return (
      <CountdownScreen
        room={room}
        gameTitle={`${game.emoji} ${game.title}`}
        endsAt={room.countdownEndsAt ?? 0}
        now={now}
        waitingForGo={waitingForSharedGo}
      />
    );
  }

  if (room.status === 'lobby' || optedOutOfMatch) {
    const readyOk = allConnectedReady(room, now);
    const amReady = !!me?.ready;
    return (
      <div className="stack" style={{ animation: 'pop-in 0.3s var(--bounce)' }}>
        <ScreenHeader
          title={
            <h2 className="h2" style={{ color: 'var(--gold)' }}>
              Party lobby
            </h2>
          }
          action={
            <Button variant="ghost" onClick={onBrowseGames}>
              Games
            </Button>
          }
        />
        <Panel>
          {!isFirebaseConfigured() ? (
            <p className="muted" style={{ marginBottom: 10 }}>
              Demo mode: rooms stay on this device only.
            </p>
          ) : null}

          {optedOutOfMatch ? (
            <>
              <p style={{ fontWeight: 800, marginBottom: 10, color: 'var(--green-dark)' }}>
                You left the match — hang in the lobby while others finish.
              </p>
              <Scoreboard
                compact
                title="Live match"
                players={players
                  .filter((p) => getPresence(p) === 'playing' || !!room.finished?.[p.id])
                  .map((p) => ({ id: p.id, name: p.name }))}
                scores={room.scores || {}}
                youId={player.id}
                finished={Object.entries(room.finished || {})
                  .filter(([, v]) => v)
                  .map(([id]) => id)}
              />
              <div style={{ height: 10 }} />
            </>
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
            now={now}
            onError={setError}
          />

          {!optedOutOfMatch ? (
            <>
              <div style={{ height: 12 }} />
              <Button
                variant={amReady ? 'green' : 'sky'}
                block
                onClick={() => {
                  sfxReady();
                  setPlayerReady(room.code, player.id, !amReady).catch((err) =>
                    setError(String(err)),
                  );
                }}
              >
                {amReady ? 'Ready!' : 'Ready?'}
              </Button>
            </>
          ) : null}

          <div style={{ height: 14 }} />
          <p className="h3">Game</p>
          <p className="muted" style={{ margin: '4px 0 8px' }}>
            {isHost
              ? 'You pick the games for the party.'
              : `${hostName(room)} picks the games — hang tight.`}
          </p>
          {matchLive && optedOutOfMatch ? (
            <p style={{ fontWeight: 800 }}>
              {game?.emoji} {game?.title ?? room.gameId} — in progress
            </p>
          ) : isHost ? (
            <>
              <select
                className="field"
                value={room.gameId}
                onChange={(e) => onHostPickGame(e.target.value, { start: false })}
                style={{ marginTop: 4 }}
              >
                {GAMES.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.emoji} {g.title}
                  </option>
                ))}
              </select>
              {suggestionTally(room).length ? (
                <p className="muted" style={{ marginTop: 8, fontWeight: 700 }}>
                  Votes:{' '}
                  {suggestionTally(room)
                    .map((t) => {
                      const g = getGame(t.gameId);
                      return `${g?.emoji ?? ''} ${g?.title ?? t.gameId} (${t.count})`;
                    })
                    .join(' · ')}
                </p>
              ) : null}
            </>
          ) : (
            <p style={{ fontWeight: 800 }}>
              {game?.emoji} {game?.title ?? room.gameId}
            </p>
          )}

          <div style={{ height: 14 }} />
          {matchLive && optedOutOfMatch ? (
            <Button variant="sky" block onClick={onBrowseGames}>
              Browse games
            </Button>
          ) : isHost ? (
            <>
              {!readyOk ? (
                <p className="muted" style={{ marginBottom: 8 }}>
                  Waiting for everyone online to ready up before start.
                </p>
              ) : null}
              <Button
                variant="primary"
                block
                disabled={!readyOk}
                onClick={() => {
                  if (!readyOk) return;
                  if (
                    !window.confirm(
                      `Start ${game?.title ?? 'this game'} for the whole party?`,
                    )
                  ) {
                    return;
                  }
                  startMatch(room.code).catch((err) => setError(String(err)));
                }}
              >
                Start match!
              </Button>
            </>
          ) : (
            <p className="muted">Waiting for {hostName(room)} to start…</p>
          )}

          <div style={{ height: 14 }} />
          <Button variant="ghost" block onClick={onLeaveParty}>
            Leave party
          </Button>
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
        now={now}
        onRematch={() => {
          if (!allConnectedReady(room, now)) {
            setError('Everyone online must ready up for a rematch.');
            return;
          }
          rematch(room.code).catch((err) => setError(String(err)));
        }}
        onPickGame={(gameId) => onHostPickGame(gameId, { start: false })}
        onBrowseGames={onBrowseGames}
        onLeaveParty={onLeaveParty}
        onError={setError}
      />
    );
  }

  if (!game) {
    return (
      <div className="stack">
        <ScreenHeader
          title={<h2 className="h2" style={{ color: 'var(--gold)' }}>Party</h2>}
          action={
            <Button variant="ghost" onClick={onBrowseGames}>
              Games
            </Button>
          }
        />
        <Panel>
          <p>Unknown game.</p>
          <Button onClick={onBrowseGames}>Games</Button>
        </Panel>
      </div>
    );
  }

  // Late joiner / spectator: presence lobby during live match (without finished yet)
  if (matchLive && me && getPresence(me) === 'lobby') {
    return (
      <div className="stack" style={{ animation: 'pop-in 0.3s var(--bounce)' }}>
        <ScreenHeader
          title={
            <h2 className="h2" style={{ color: 'var(--gold)' }}>
              Party lobby
            </h2>
          }
          action={
            <Button variant="ghost" onClick={onBrowseGames}>
              Games
            </Button>
          }
        />
        <Panel>
          <p style={{ fontWeight: 800, marginBottom: 10 }}>
            {game.emoji} {game.title} is in progress
          </p>
          <p className="muted" style={{ marginBottom: 12 }}>
            You joined mid-match — you&apos;ll play the next one. Spectate scores below.
          </p>
          <Scoreboard
            compact
            title="Live match"
            players={players
              .filter((p) => getPresence(p) === 'playing' || !!room.finished?.[p.id])
              .map((p) => ({ id: p.id, name: p.name }))}
            scores={room.scores || {}}
            youId={player.id}
            finished={Object.entries(room.finished || {})
              .filter(([, v]) => v)
              .map(([id]) => id)}
          />
          <div style={{ height: 12 }} />
          <ReadyPlayerList room={room} youId={player.id} now={now} onError={setError} />
          <div style={{ height: 12 }} />
          <Button variant="sky" block onClick={onBrowseGames}>
            Browse games
          </Button>
          <Button variant="ghost" block onClick={onLeaveParty}>
            Leave party
          </Button>
        </Panel>
      </div>
    );
  }

  if (!matchLive && room.status !== 'playing') {
    return (
      <div className="stack">
        <ScreenHeader
          title={<h2 className="h2" style={{ color: 'var(--gold)' }}>Party</h2>}
          action={
            <Button variant="ghost" onClick={onBrowseGames}>
              Games
            </Button>
          }
        />
        <Panel>
          <p className="muted">Getting ready…</p>
        </Panel>
      </div>
    );
  }

  return (
    <RoomPlay
      room={room}
      game={game}
      player={player}
      players={players
        .filter((p) => getPresence(p) === 'playing')
        .map((p) => ({ id: p.id, name: p.name }))}
      onError={setError}
      onQuitGame={onQuitGame}
    />
  );
}

function playerStatusLabel(room: RoomData, p: RoomPlayer, now: number): string {
  if (!isPlayerOnline(p, now)) return 'away';
  if (isCountdownActive(room, now)) {
    return getPresence(p) === 'playing' ? 'starting…' : 'sitting out';
  }
  if (isMatchLive(room, now)) {
    if (getPresence(p) === 'playing') {
      return room.finished?.[p.id] ? 'finished' : 'playing';
    }
    return 'in lobby';
  }
  if (room.status === 'results') return p.ready ? 'Ready!' : 'not ready';
  return p.ready ? 'Ready!' : 'not ready';
}

function ReadyPlayerList({
  room,
  youId,
  now,
  onError,
}: {
  room: RoomData;
  youId: string;
  now: number;
  onError?: (msg: string) => void;
}) {
  const players = playersList(room);
  const you = useMemo(
    () => ({ id: youId, name: ensureNickname() }),
    [youId],
  );
  const isHost = room.hostId === youId;

  return (
    <ul style={{ paddingLeft: 0, listStyle: 'none', fontWeight: 700, margin: 0 }}>
      {players.map((p: RoomPlayer) => {
        const online = isPlayerOnline(p, now);
        const status = playerStatusLabel(room, p, now);
        const nudge = room.nudges?.[p.id];
        const nudgedAgo = nudge ? now - nudge.at : 0;
        const canNudge =
          online && !p.ready && p.id !== youId && (room.status === 'lobby' || room.status === 'results');
        const canRemoveAfterNudge =
          canNudge &&
          !!nudge &&
          (nudge.fromId === youId || isHost) &&
          nudgedAgo >= NUDGE_REMOVE_MS;
        const canRemoveAway = isHost && !online && p.id !== youId;
        const canMakeHost = isHost && online && p.id !== youId;

        return (
          <li key={p.id} style={{ marginBottom: 10 }}>
            <button
              type="button"
              className="ready-name-btn"
              disabled={!canNudge}
              onClick={() => {
                if (!canNudge) return;
                nudgePlayer(room.code, p.id, you).catch((err) => onError?.(String(err)));
              }}
            >
              {p.name}
              {p.id === room.hostId ? ' 👑' : ''}
              {p.id === youId ? ' (you)' : ''}
              <span className="muted"> — {status}</span>
            </button>
            {canNudge ? (
              <p className="muted" style={{ fontSize: '0.8rem', margin: '2px 0 0 4px' }}>
                Tap name to nudge “Ready to go?”
              </p>
            ) : null}
            {canRemoveAway ? (
              <Button
                variant="ghost"
                block
                style={{ marginTop: 4 }}
                onClick={() => {
                  removePlayer(room.code, p.id).catch((err) => onError?.(String(err)));
                }}
              >
                Remove {p.name} (away)
              </Button>
            ) : null}
            {canRemoveAfterNudge ? (
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
            {canMakeHost ? (
              <Button
                variant="ghost"
                block
                style={{ marginTop: 4 }}
                onClick={() => {
                  transferHost(room.code, p.id).catch((err) => onError?.(String(err)));
                }}
              >
                Make {p.name} host
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
  waitingForGo = false,
}: {
  room: RoomData;
  gameTitle: string;
  endsAt: number;
  now: number;
  waitingForGo?: boolean;
}) {
  const left = waitingForGo ? 0 : Math.max(0, Math.ceil((endsAt - now) / 1000));
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
      <ScreenHeader
        title={
          <h2 className="h2" style={{ color: 'var(--gold)' }}>
            Get ready
          </h2>
        }
      />
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
          {waitingForGo ? 'Syncing phones…' : 'Everyone starts together'}
        </p>
      </Panel>
    </div>
  );
}

function ResultsRoom({
  room,
  playerId,
  isHost,
  now,
  onRematch,
  onPickGame,
  onBrowseGames,
  onLeaveParty,
  onError,
}: {
  room: RoomData;
  playerId: string;
  isHost: boolean;
  now: number;
  onRematch: () => void;
  onPickGame: (gameId: string) => void;
  onBrowseGames: () => void;
  onLeaveParty: () => void;
  onError: (msg: string) => void;
}) {
  const game = getGame(room.gameId);
  const players = playersList(room);
  const boardPlayers = players.map((p) => ({ id: p.id, name: p.name }));
  const readyOk = allConnectedReady(room, now);
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
      <ScreenHeader
        title={
          <h2
            className="h2"
            style={{
              color: 'var(--gold)',
              WebkitTextStroke: '1.5px var(--ink)',
              textShadow: '2px 2px 0 var(--ink)',
            }}
          >
            Results!
          </h2>
        }
        action={
          <Button variant="ghost" onClick={onBrowseGames}>
            Games
          </Button>
        }
      />
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
        <ReadyPlayerList room={room} youId={playerId} now={now} onError={onError} />
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
            {readyOk ? (
              <Button variant="primary" block onClick={onRematch}>
                Play again — {game?.emoji} {game?.title}
              </Button>
            ) : (
              <p className="muted">
                Wait for everyone online to ready up, then Play again.
              </p>
            )}
            <p className="muted" style={{ marginTop: 4 }}>
              Or switch games:
            </p>
            <select
              className="field"
              defaultValue={room.gameId}
              onChange={(e) => onPickGame(e.target.value)}
            >
              {GAMES.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.emoji} {g.title}
                </option>
              ))}
            </select>
            <Button
              variant="gold"
              block
              disabled={!readyOk}
              onClick={() => {
                if (!readyOk) return;
                onRematch();
              }}
            >
              Rematch
            </Button>
            <Button variant="ghost" block onClick={onBrowseGames}>
              Browse games
            </Button>
            <Button variant="ghost" block onClick={onLeaveParty}>
              Leave party
            </Button>
          </div>
        ) : (
          <div className="stack">
            <p className="muted">
              {readyOk
                ? `Ready! Waiting for ${hostName(room)} to tap Play again.`
                : `${hostName(room)} picks the next game. Ready up when you are.`}
            </p>
            <Button variant="ghost" block onClick={onBrowseGames}>
              Browse games
            </Button>
            <Button variant="ghost" block onClick={onLeaveParty}>
              Leave party
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
    const delay = score.progress !== undefined && score.progress < 1 ? 40 : 120;
    if (scoreTimer.current) {
      clearTimeout(scoreTimer.current);
      scoreTimer.current = null;
    }
    scoreTimer.current = window.setTimeout(() => {
      scoreTimer.current = null;
      const next = pendingScore.current;
      if (next) {
        updateScore(room.code, player.id, next).catch((err) => onError(String(err)));
      }
    }, delay);
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
  const turnState = room.gameState as { turn?: number } | null;
  const turnIdx = typeof turnState?.turn === 'number' ? turnState.turn : -1;
  const turnPlayer = turnIdx >= 0 ? livePlayers[turnIdx] : null;
  const myTurn = !!turnPlayer && turnPlayer.id === player.id;
  const canNudgeTurn =
    game.modes.includes('turn') && !!turnPlayer && !myTurn && !room.finished?.[player.id];

  return (
    <div className="stack room-play" style={{ animation: 'pop-in 0.3s var(--bounce)' }}>
      <ScreenHeader
        title={
          <h2 className="h2" style={{ color: 'var(--gold)' }}>
            {game.emoji} {game.title}
          </h2>
        }
        action={
          <Button variant="ghost" onClick={onQuitGame}>
            Quit game
          </Button>
        }
      />
      <Panel className="room-play-panel">
        <Scoreboard
          compact
          title="Match status"
          players={livePlayers}
          scores={room.scores || {}}
          youId={player.id}
          finished={finishedPlayers}
        />
        {canNudgeTurn && turnPlayer ? (
          <Button
            variant="sky"
            block
            style={{ marginBottom: 8 }}
            onClick={() => {
              nudgePlayer(room.code, turnPlayer.id, player, 'Your turn!').catch((err) =>
                onError(String(err)),
              );
            }}
          >
            Nudge {turnPlayer.name} — your turn!
          </Button>
        ) : null}
        <p className="muted" style={{ fontSize: '0.8rem', margin: '0 0 8px', textAlign: 'center' }}>
          Quit game keeps you in the party lobby
        </p>
        {game.modes.includes('turn') && game.TurnView ? (
          <game.TurnView
            key={`${room.gameId}-${room.seed}`}
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
            key={`${room.gameId}-${room.seed}`}
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
