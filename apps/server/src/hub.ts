import { createHash, randomBytes, randomUUID } from 'node:crypto';
import {
  agreeDraw,
  applyMove,
  createGame,
  declareForfeit,
  declareTimeout,
  modeById,
  opponentOf,
  resign as engineResign,
  timeControlById,
  validateConfig,
  type GameConfig,
  type GameResult,
  type GameState,
  type ModeId,
  type Move,
  type Player,
} from '@barricade/engine';
import type {
  ClientMessage,
  LeaderboardEntry,
  LobbySnapshot,
  MatchSnapshot,
  PublicPlayer,
  QueueStatus,
  RoomSnapshot,
  RoomSummary,
  RoomVisibility,
  ServerErrorCode,
  ServerMessage,
} from '@barricade/protocol';
import { Store, type PersistedState } from './store.js';

export const RECONNECT_GRACE_MS = 60_000;
export const MATCH_RETENTION_MS = 30 * 60_000;
export const ROOM_WAITING_RETENTION_MS = 10 * 60_000;
export const DRAW_OFFER_MS = 60_000;
const MOVE_COOLDOWN_MS = 120;
const MAX_WALLS = 24;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export interface SocketHandle {
  readonly connectionId: string;
  send(message: ServerMessage): void;
  close(code: number, reason: string): void;
}

export interface ConnectInput {
  readonly playerId: string;
  readonly name: string;
  readonly token?: string;
  readonly socket: SocketHandle;
}

export type ConnectResult =
  | { ok: true; player: PublicPlayer; token: string; resumed: boolean }
  | { ok: false; code: ServerErrorCode; message: string };

interface PlayerRecord {
  id: string;
  name: string;
  tokenHash: string;
  rating: number;
  wins: number;
  losses: number;
  draws: number;
  createdAt: number;
  socket: SocketHandle | null;
  roomCode: string | null;
  matchId: string | null;
  lastMoveAt: number;
}

interface RoomRecord {
  code: string;
  hostId: string;
  guestId: string | null;
  modeId: ModeId;
  timeControlId: string;
  config: GameConfig;
  visibility: RoomVisibility;
  status: 'waiting' | 'playing' | 'finished';
  createdAt: number;
  matchId: string | null;
}

interface MatchRecord {
  id: string;
  roomCode: string | null;
  modeId: ModeId;
  timeControlId: string;
  config: GameConfig;
  game: GameState;
  blueId: string;
  redId: string;
  clocks: Record<Player, number>;
  initialMs: number;
  incrementMs: number;
  turnStartedAt: number;
  status: 'active' | 'finished';
  result: GameResult | null;
  endReason: string | null;
  ratingChanges: Record<Player, number> | null;
  createdAt: number;
  finishedAt: number | null;
  disconnects: Partial<Record<Player, number>>;
  drawOffer: { by: Player; at: number } | null;
  rematchRequests: Set<Player>;
  lastMoveIds: Partial<Record<Player, string>>;
  lastSnapshotAt: number;
  restored: boolean;
}

interface QueueEntry {
  playerId: string;
  modeId: ModeId;
  timeControlId: string;
  joinedAt: number;
}

export interface HubOptions {
  readonly now?: () => number;
  readonly graceMs?: number;
  readonly persistPath?: string | null;
  readonly persistDebounceMs?: number;
  readonly rng?: () => number;
  readonly log?: (event: string, data?: Record<string, unknown>) => void;
}

const PLAYER_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;
const NAME_RE = /^[\p{L}\p{N} _.-]+$/u;

function normalizeName(raw: string): string | null {
  const name = raw.trim().replace(/\s+/gu, ' ');
  if (name.length < 2 || name.length > 24) return null;
  if (!NAME_RE.test(name)) return null;
  return name;
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function colorOf(match: MatchRecord, playerId: string): Player | null {
  if (match.blueId === playerId) return 'blue';
  if (match.redId === playerId) return 'red';
  return null;
}

function playerIdOf(match: MatchRecord, color: Player): string {
  return color === 'blue' ? match.blueId : match.redId;
}

export class Hub {
  private readonly now: () => number;
  private readonly graceMs: number;
  private readonly persistDebounceMs: number;
  private readonly rng: () => number;
  private readonly log: (event: string, data?: Record<string, unknown>) => void;
  private readonly store: Store;

  private readonly players = new Map<string, PlayerRecord>();
  private readonly rooms = new Map<string, RoomRecord>();
  private readonly matches = new Map<string, MatchRecord>();
  private readonly queue = new Map<string, QueueEntry>();

  private persistTimer: ReturnType<typeof setTimeout> | null = null;
  private lastQueueBroadcast = 0;
  private lastLobbyBroadcast = 0;

  constructor(options: HubOptions = {}) {
    this.now = options.now ?? (() => Date.now());
    this.graceMs = options.graceMs ?? RECONNECT_GRACE_MS;
    this.persistDebounceMs = options.persistDebounceMs ?? 400;
    this.rng = options.rng ?? Math.random;
    this.log = options.log ?? (() => undefined);
    this.store = new Store(options.persistPath ?? null);
    this.restore();
  }

  // ── Connection lifecycle ──────────────────────────────────────

  connect(input: ConnectInput): ConnectResult {
    if (!PLAYER_ID_RE.test(input.playerId)) {
      return { ok: false, code: 'AUTH_FAILED', message: 'Invalid player identity.' };
    }
    const name = normalizeName(input.name);
    if (!name) {
      return { ok: false, code: 'INVALID_NAME', message: 'Names must be 2–24 characters using letters, numbers, spaces, dots, dashes or underscores.' };
    }

    const now = this.now();
    let player = this.players.get(input.playerId);
    let token: string;
    let resumed = false;

    if (player) {
      if (!input.token || hashToken(input.token) !== player.tokenHash) {
        return {
          ok: false,
          code: 'AUTH_FAILED',
          message: 'This session token is no longer valid. Clear online identity on this device to continue as a new guest.',
        };
      }
      token = input.token;
      resumed = player.matchId !== null || player.roomCode !== null;
    } else {
      token = randomBytes(24).toString('base64url');
      player = {
        id: input.playerId,
        name,
        tokenHash: hashToken(token),
        rating: 1000,
        wins: 0,
        losses: 0,
        draws: 0,
        createdAt: now,
        socket: null,
        roomCode: null,
        matchId: null,
        lastMoveAt: 0,
      };
      this.players.set(player.id, player);
    }

    if (player.socket && player.socket.connectionId !== input.socket.connectionId) {
      player.socket.send({ type: 'session_replaced' });
      player.socket.close(4001, 'Session replaced');
    }
    player.socket = input.socket;
    player.name = name;

    this.send(player.id, {
      type: 'welcome',
      player: this.publicPlayer(player.id),
      sessionToken: token,
      serverNow: now,
      resumed,
    });

    if (player.matchId) {
      const match = this.matches.get(player.matchId);
      if (match) {
        const color = colorOf(match, player.id);
        if (color && match.status === 'active') {
          delete match.disconnects[color];
          this.send(player.id, { type: 'match', match: this.snapshot(match, player.id) });
          this.notifyOpponent(match, color, `${player.name} reconnected.`, 'success');
          this.sendMatch(match);
          if (match.restored) {
            this.send(player.id, { type: 'server_restart' });
            match.restored = false;
          }
        } else {
          this.send(player.id, { type: 'match', match: this.snapshot(match, player.id) });
          this.send(player.id, { type: 'match_end', match: this.snapshot(match, player.id) });
        }
      } else {
        player.matchId = null;
      }
    }

    if (player.roomCode) {
      const room = this.rooms.get(player.roomCode);
      if (room) this.send(player.id, { type: 'room', room: this.roomSnapshot(room) });
      else player.roomCode = null;
    }

    const queued = this.queue.get(player.id);
    if (queued) this.sendQueueStatus(player.id);

    this.send(player.id, { type: 'lobby', lobby: this.lobby() });
    this.broadcastLobby();
    this.schedulePersist();
    this.log('connect', { playerId: player.id, resumed });

    return { ok: true, player: this.publicPlayer(player.id), token, resumed };
  }

  disconnect(playerId: string, connectionId: string): void {
    const player = this.players.get(playerId);
    if (!player || player.socket?.connectionId !== connectionId) return;

    player.socket = null;
    this.removeFromQueue(playerId, false);

    const now = this.now();
    if (player.matchId) {
      const match = this.matches.get(player.matchId);
      if (match) {
        const color = colorOf(match, playerId);
        if (color && match.status === 'active') {
          match.disconnects[color] = now + this.graceMs;
          this.notifyOpponent(match, color, `${player.name} disconnected. Reconnect window is open.`, 'warning');
        }
        this.sendMatch(match);
      }
    }

    if (player.roomCode) {
      const room = this.rooms.get(player.roomCode);
      if (room && room.status === 'waiting' && room.hostId === playerId) {
        this.rooms.delete(room.code);
        player.roomCode = null;
      }
    }

    this.broadcastLobby();
    this.schedulePersist();
    this.log('disconnect', { playerId });
  }

  // ── Client messages ───────────────────────────────────────────

  handle(playerId: string, message: ClientMessage): void {
    const player = this.players.get(playerId);
    if (!player || !player.socket) return;

    switch (message.type) {
      case 'hello':
        return;
      case 'ping':
        this.send(playerId, { type: 'pong', t: message.t, serverNow: this.now() });
        return;
      case 'rename':
        this.rename(player, message.name);
        return;
      case 'queue_join':
        this.joinQueue(player, message.modeId, message.timeControlId);
        return;
      case 'queue_leave':
        this.removeFromQueue(playerId, true);
        return;
      case 'room_create':
        this.createRoom(player, message.modeId, message.timeControlId, message.config, message.visibility);
        return;
      case 'room_join':
        this.joinRoom(player, message.code);
        return;
      case 'room_leave':
        this.leaveRoom(player);
        return;
      case 'move':
        this.applyClientMove(player, message.matchId, message.move, message.clientMoveId);
        return;
      case 'resign':
        this.resignMatch(player, message.matchId);
        return;
      case 'draw_offer':
        this.offerDraw(player, message.matchId);
        return;
      case 'draw_respond':
        this.respondDraw(player, message.matchId, message.accept);
        return;
      case 'rematch_request':
        this.requestRematch(player, message.matchId);
        return;
      case 'rematch_respond':
        this.respondRematch(player, message.matchId, message.accept);
        return;
      case 'match_leave':
        this.leaveMatch(player, message.matchId);
        return;
      default:
        this.sendError(playerId, 'BAD_MESSAGE', 'Unknown message type.');
    }
  }

  // ── Timer loop ────────────────────────────────────────────────

  tick(): void {
    const now = this.now();

    for (const match of [...this.matches.values()]) {
      if (match.status === 'active') {
        const current = match.game.turn;
        const currentId = playerIdOf(match, current);
        const other = opponentOf(current);
        const otherId = playerIdOf(match, other);
        const currentConnected = Boolean(this.players.get(currentId)?.socket);
        const otherConnected = Boolean(this.players.get(otherId)?.socket);

        let graceColor: Player | null = null;
        let graceAt = Number.POSITIVE_INFINITY;
        for (const color of ['blue', 'red'] as const) {
          const deadline = match.disconnects[color];
          if (deadline !== undefined && deadline < graceAt) {
            graceAt = deadline;
            graceColor = color;
          }
        }

        if (graceColor && graceAt <= now) {
          if (!currentConnected && !otherConnected) {
            this.abandonMatch(match, 'Both players left the match.');
          } else {
            this.finishMatch(match, declareForfeit(match.game, graceColor).result!, 'forfeit');
          }
          continue;
        }

        const remaining = this.remaining(match, current, now);
        if (remaining <= 0) {
          if (!currentConnected && !otherConnected) {
            this.abandonMatch(match, 'Both players were disconnected when the clock expired.');
          } else {
            this.finishMatch(match, declareTimeout(match.game, current).result!, 'timeout');
          }
          continue;
        }

        if (match.drawOffer && now - match.drawOffer.at > DRAW_OFFER_MS) {
          match.drawOffer = null;
          this.sendNotice(match, 'The draw offer expired.', 'info');
          this.sendMatch(match);
        }

        if (now - match.lastSnapshotAt >= 5000) {
          match.lastSnapshotAt = now;
          this.sendMatch(match);
        }
      } else if (match.finishedAt && now - match.finishedAt > MATCH_RETENTION_MS) {
        this.matches.delete(match.id);
        for (const id of [match.blueId, match.redId]) {
          const player = this.players.get(id);
          if (player?.matchId === match.id) player.matchId = null;
        }
      }
    }

    for (const room of [...this.rooms.values()]) {
      if (room.status === 'waiting' && now - room.createdAt > ROOM_WAITING_RETENTION_MS) {
        this.rooms.delete(room.code);
        const host = this.players.get(room.hostId);
        if (host?.roomCode === room.code) {
          host.roomCode = null;
          this.send(room.hostId, { type: 'room', room: null });
        }
        this.broadcastLobby();
      }
    }

    if (now - this.lastQueueBroadcast >= 2000) {
      this.lastQueueBroadcast = now;
      for (const playerId of this.queue.keys()) this.sendQueueStatus(playerId);
    }

    if (now - this.lastLobbyBroadcast >= 10_000) {
      this.lastLobbyBroadcast = now;
      this.broadcastLobby();
    }
  }

  // ── Read models ───────────────────────────────────────────────

  lobby(): LobbySnapshot {
    const now = this.now();
    const rooms: RoomSummary[] = [...this.rooms.values()]
      .filter((room) => room.status === 'waiting' && room.visibility === 'public')
      .filter((room) => Boolean(this.players.get(room.hostId)?.socket))
      .map((room) => {
        const host = this.players.get(room.hostId);
        return {
          code: room.code,
          hostName: host?.name ?? 'Unknown',
          hostRating: host?.rating ?? 1000,
          modeId: room.modeId,
          timeControlId: room.timeControlId,
          config: room.config,
          createdAt: room.createdAt,
        };
      })
      .sort((a, b) => b.createdAt - a.createdAt);

    return {
      online: [...this.players.values()].filter((player) => player.socket !== null).length,
      inQueue: this.queue.size,
      activeMatches: [...this.matches.values()].filter((match) => match.status === 'active').length,
      rooms,
      leaderboard: this.leaderboard(10),
      serverNow: now,
    };
  }

  leaderboard(limit = 20): LeaderboardEntry[] {
    return [...this.players.values()]
      .sort((a, b) => b.rating - a.rating || b.wins - a.wins || a.name.localeCompare(b.name))
      .slice(0, Math.max(1, Math.min(limit, 100)))
      .map((player) => ({
        id: player.id,
        name: player.name,
        rating: player.rating,
        wins: player.wins,
        losses: player.losses,
        draws: player.draws,
      }));
  }

  stats(): { online: number; activeMatches: number; rooms: number; queued: number } {
    return {
      online: [...this.players.values()].filter((player) => player.socket !== null).length,
      activeMatches: [...this.matches.values()].filter((match) => match.status === 'active').length,
      rooms: [...this.rooms.values()].filter((room) => room.status === 'waiting').length,
      queued: this.queue.size,
    };
  }

  flush(): void {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
    this.store.save(this.toPersisted());
  }

  // ── Actions ───────────────────────────────────────────────────

  private rename(player: PlayerRecord, rawName: string): void {
    const name = normalizeName(rawName);
    if (!name) {
      this.sendError(player.id, 'INVALID_NAME', 'Names must be 2–24 characters using letters, numbers, spaces, dots, dashes or underscores.');
      return;
    }
    player.name = name;
    this.send(player.id, { type: 'notice', kind: 'success', message: 'Name updated.' });
    this.broadcastLobby();
    for (const match of this.matches.values()) {
      if (match.blueId === player.id || match.redId === player.id) this.sendMatch(match);
    }
    for (const room of this.rooms.values()) {
      if (room.hostId === player.id || room.guestId === player.id) this.sendRoom(room);
    }
    this.schedulePersist();
  }

  private joinQueue(player: PlayerRecord, modeId: ModeId, timeControlId: string): void {
    if (player.matchId) {
      const match = this.matches.get(player.matchId);
      if (match?.status === 'active') {
        this.sendError(player.id, 'ALREADY_IN_MATCH', 'Finish or resign your active match first.');
        return;
      }
      player.matchId = null;
    }
    if (player.roomCode) {
      this.sendError(player.id, 'ALREADY_IN_MATCH', 'Leave your room before joining global matchmaking.');
      return;
    }
    const validated = this.validateSetup(modeId, timeControlId);
    if ('error' in validated) {
      this.sendError(player.id, 'INVALID_CONFIG', validated.error);
      return;
    }

    this.queue.set(player.id, {
      playerId: player.id,
      modeId,
      timeControlId,
      joinedAt: this.now(),
    });
    this.sendQueueStatus(player.id);
    this.tryPairQueue();
    this.broadcastLobby();
    this.schedulePersist();
  }

  private tryPairQueue(): void {
    const now = this.now();
    const entries = [...this.queue.values()].sort((a, b) => a.joinedAt - b.joinedAt);

    for (let i = 0; i < entries.length; i++) {
      const a = entries[i];
      if (!a || !this.queue.has(a.playerId)) continue;
      for (let j = i + 1; j < entries.length; j++) {
        const b = entries[j];
        if (!b || !this.queue.has(b.playerId)) continue;
        if (a.modeId !== b.modeId || a.timeControlId !== b.timeControlId) continue;
        const playerA = this.players.get(a.playerId);
        const playerB = this.players.get(b.playerId);
        if (!playerA?.socket || !playerB?.socket) continue;

        const waitSeconds = (now - Math.min(a.joinedAt, b.joinedAt)) / 1000;
        const tolerance = Math.min(1200, 200 + waitSeconds * 50);
        if (Math.abs(playerA.rating - playerB.rating) > tolerance) continue;

        const setup = this.validateSetup(a.modeId, a.timeControlId);
        if ('error' in setup) continue;

        this.queue.delete(a.playerId);
        this.queue.delete(b.playerId);
        this.sendQueueStatus(a.playerId);
        this.sendQueueStatus(b.playerId);

        this.startMatch({
          modeId: a.modeId,
          timeControlId: a.timeControlId,
          config: setup.config,
          blueId: a.playerId,
          redId: b.playerId,
          roomCode: null,
        });
        this.send(`${a.playerId}`, { type: 'notice', kind: 'success', message: `Matched with ${playerB.name}.` });
        this.send(`${b.playerId}`, { type: 'notice', kind: 'success', message: `Matched with ${playerA.name}.` });
        this.broadcastLobby();
        return;
      }
    }
  }

  private removeFromQueue(playerId: string, notify: boolean): void {
    if (!this.queue.delete(playerId)) return;
    if (notify) this.sendQueueStatus(playerId);
    for (const id of this.queue.keys()) this.sendQueueStatus(id);
    this.broadcastLobby();
    this.schedulePersist();
  }

  private createRoom(
    player: PlayerRecord,
    modeId: ModeId,
    timeControlId: string,
    partial: Partial<GameConfig> | undefined,
    visibility: RoomVisibility,
  ): void {
    if (player.matchId) {
      const match = this.matches.get(player.matchId);
      if (match?.status === 'active') {
        this.sendError(player.id, 'ALREADY_IN_MATCH', 'Finish your active match first.');
        return;
      }
      player.matchId = null;
    }
    if (player.roomCode) {
      this.sendError(player.id, 'ALREADY_IN_MATCH', 'Leave your current room first.');
      return;
    }
    this.removeFromQueue(player.id, true);

    const setup = this.validateSetup(modeId, timeControlId, partial);
    if ('error' in setup) {
      this.sendError(player.id, 'INVALID_CONFIG', setup.error);
      return;
    }

    const code = this.newRoomCode();
    const room: RoomRecord = {
      code,
      hostId: player.id,
      guestId: null,
      modeId,
      timeControlId,
      config: setup.config,
      visibility,
      status: 'waiting',
      createdAt: this.now(),
      matchId: null,
    };
    this.rooms.set(code, room);
    player.roomCode = code;
    this.sendRoom(room);
    this.broadcastLobby();
    this.schedulePersist();
    this.log('room_create', { code, hostId: player.id, visibility });
  }

  private joinRoom(player: PlayerRecord, rawCode: string): void {
    const code = rawCode.trim().toUpperCase();
    const room = this.rooms.get(code);
    if (!room) {
      this.sendError(player.id, 'ROOM_NOT_FOUND', 'That room code does not exist.');
      return;
    }
    if (room.status !== 'waiting') {
      this.sendError(player.id, 'ROOM_STARTED', 'That room has already started.');
      return;
    }
    if (room.guestId) {
      this.sendError(player.id, 'ROOM_FULL', 'That room is full.');
      return;
    }
    if (room.hostId === player.id) {
      this.sendRoom(room);
      return;
    }
    if (player.matchId) {
      const active = this.matches.get(player.matchId);
      if (active?.status === 'active') {
        this.sendError(player.id, 'ALREADY_IN_MATCH', 'Finish your active match first.');
        return;
      }
      player.matchId = null;
    }
    if (player.roomCode) {
      this.sendError(player.id, 'ALREADY_IN_MATCH', 'Leave your current room first.');
      return;
    }
    this.removeFromQueue(player.id, true);

    const host = this.players.get(room.hostId);
    if (!host?.socket) {
      this.sendError(player.id, 'ROOM_NOT_FOUND', 'The host is not connected.');
      return;
    }

    room.guestId = player.id;
    room.status = 'playing';
    player.roomCode = room.code;
    host.roomCode = room.code;

    this.startMatch({
      modeId: room.modeId,
      timeControlId: room.timeControlId,
      config: room.config,
      blueId: room.hostId,
      redId: player.id,
      roomCode: room.code,
    });
    this.sendRoom(room);
    this.sendNoticeTo(room.hostId, `${player.name} joined the room.`, 'success');
    this.broadcastLobby();
    this.schedulePersist();
  }

  private leaveRoom(player: PlayerRecord): void {
    if (!player.roomCode) {
      this.send(player.id, { type: 'room', room: null });
      return;
    }
    const room = this.rooms.get(player.roomCode);
    if (!room) {
      player.roomCode = null;
      this.send(player.id, { type: 'room', room: null });
      return;
    }
    if (room.status === 'playing') {
      this.sendError(player.id, 'ALREADY_IN_MATCH', 'Resign or finish the match before leaving the room.');
      return;
    }

    player.roomCode = null;
    this.send(player.id, { type: 'room', room: null });

    if (room.status === 'waiting') {
      this.rooms.delete(room.code);
    } else {
      const host = this.players.get(room.hostId);
      const guest = room.guestId ? this.players.get(room.guestId) : undefined;
      if (!host?.roomCode && !guest?.roomCode) this.rooms.delete(room.code);
    }
    this.broadcastLobby();
    this.schedulePersist();
  }

  private startMatch(input: {
    modeId: ModeId;
    timeControlId: string;
    config: GameConfig;
    blueId: string;
    redId: string;
    roomCode: string | null;
  }): MatchRecord {
    const tc = timeControlById(input.timeControlId);
    const initialMs = tc?.initialMs ?? 0;
    const now = this.now();
    const game = createGame(input.config);

    const match: MatchRecord = {
      id: `m_${randomUUID()}`,
      roomCode: input.roomCode,
      modeId: input.modeId,
      timeControlId: input.timeControlId,
      config: input.config,
      game,
      blueId: input.blueId,
      redId: input.redId,
      clocks: { blue: initialMs, red: initialMs },
      initialMs,
      incrementMs: tc?.incrementMs ?? 0,
      turnStartedAt: now,
      status: 'active',
      result: null,
      endReason: null,
      ratingChanges: null,
      createdAt: now,
      finishedAt: null,
      disconnects: {},
      drawOffer: null,
      rematchRequests: new Set(),
      lastMoveIds: {},
      lastSnapshotAt: now,
      restored: false,
    };

    this.matches.set(match.id, match);
    for (const id of [input.blueId, input.redId]) {
      const player = this.players.get(id);
      if (player) player.matchId = match.id;
    }
    if (input.roomCode) {
      const room = this.rooms.get(input.roomCode);
      if (room) {
        room.status = 'playing';
        room.matchId = match.id;
      }
    }

    if (input.roomCode) {
      const room = this.rooms.get(input.roomCode);
      if (room) this.sendRoom(room);
    }
    this.sendMatch(match);
    this.broadcastLobby();
    this.schedulePersist();
    this.log('match_start', {
      matchId: match.id,
      modeId: match.modeId,
      size: match.config.size,
      roomCode: match.roomCode,
    });
    return match;
  }

  private applyClientMove(player: PlayerRecord, matchId: string, move: Move, clientMoveId: string): void {
    const match = this.matches.get(matchId);
    if (!match) {
      this.sendError(player.id, 'MATCH_NOT_FOUND', 'Match not found.');
      return;
    }
    const color = colorOf(match, player.id);
    if (!color) {
      this.sendError(player.id, 'MATCH_NOT_FOUND', 'You are not part of this match.');
      return;
    }
    if (match.status !== 'active') {
      this.send(player.id, { type: 'match_end', match: this.snapshot(match, player.id) });
      return;
    }
    if (match.lastMoveIds[color] === clientMoveId) {
      // Idempotent retry: resend the authoritative state without applying again.
      this.send(player.id, { type: 'match', match: this.snapshot(match, player.id) });
      return;
    }
    if (match.game.turn !== color) {
      this.sendError(player.id, 'NOT_YOUR_TURN', 'It is not your turn.');
      return;
    }
    const now = this.now();
    if (now - player.lastMoveAt < MOVE_COOLDOWN_MS) {
      this.sendError(player.id, 'RATE_LIMITED', 'Slow down — moves are being submitted too quickly.');
      return;
    }
    player.lastMoveAt = now;

    const remaining = this.remaining(match, color, now);
    if (remaining <= 0) {
      this.finishMatch(match, declareTimeout(match.game, color).result!, 'timeout');
      return;
    }

    const applied = applyMove(match.game, move, now);
    if (!applied.ok) {
      this.sendError(player.id, 'ILLEGAL_MOVE', applied.error.message);
      return;
    }

    match.game = applied.state;
    match.clocks[color] = remaining + match.incrementMs;
    match.turnStartedAt = now;
    match.lastMoveIds[color] = clientMoveId;
    match.drawOffer = null;
    match.lastSnapshotAt = now;

    if (applied.state.result) {
      this.finishMatch(match, applied.state.result, applied.state.result.reason);
      return;
    }

    this.sendMatch(match);
    this.schedulePersist();
  }

  private resignMatch(player: PlayerRecord, matchId: string): void {
    const match = this.matches.get(matchId);
    if (!match || match.status !== 'active') {
      this.sendError(player.id, 'MATCH_NOT_FOUND', 'That match is not active.');
      return;
    }
    const color = colorOf(match, player.id);
    if (!color) {
      this.sendError(player.id, 'MATCH_NOT_FOUND', 'You are not part of this match.');
      return;
    }
    this.finishMatch(match, engineResign(match.game, color).result!, 'resign');
  }

  private offerDraw(player: PlayerRecord, matchId: string): void {
    const match = this.matches.get(matchId);
    if (!match || match.status !== 'active') {
      this.sendError(player.id, 'MATCH_NOT_FOUND', 'That match is not active.');
      return;
    }
    const color = colorOf(match, player.id);
    if (!color) return;
    if (match.drawOffer && match.drawOffer.by !== color) {
      this.sendError(player.id, 'BAD_MESSAGE', 'Your opponent has already offered a draw.');
      return;
    }
    match.drawOffer = { by: color, at: this.now() };
    this.send(opponentId(match, color), {
      type: 'draw_offer',
      matchId,
      from: this.publicPlayer(player.id),
    });
    this.sendMatch(match);
    this.schedulePersist();
  }

  private respondDraw(player: PlayerRecord, matchId: string, accept: boolean): void {
    const match = this.matches.get(matchId);
    if (!match || match.status !== 'active' || !match.drawOffer) {
      this.sendError(player.id, 'MATCH_NOT_FOUND', 'There is no open draw offer.');
      return;
    }
    const color = colorOf(match, player.id);
    if (!color || match.drawOffer.by === color) {
      this.sendError(player.id, 'BAD_MESSAGE', 'You cannot respond to your own offer.');
      return;
    }
    if (accept) {
      this.finishMatch(match, agreeDraw(match.game).result!, 'agreement');
    } else {
      match.drawOffer = null;
      this.sendNotice(match, 'The draw offer was declined.', 'info');
      this.sendMatch(match);
      this.schedulePersist();
    }
  }

  private requestRematch(player: PlayerRecord, matchId: string): void {
    const match = this.matches.get(matchId);
    if (!match) {
      this.sendError(player.id, 'MATCH_NOT_FOUND', 'Match not found.');
      return;
    }
    if (match.status !== 'finished') {
      this.sendError(player.id, 'BAD_MESSAGE', 'Finish the match before requesting a rematch.');
      return;
    }
    const color = colorOf(match, player.id);
    if (!color) return;
    const blue = this.players.get(match.blueId);
    const red = this.players.get(match.redId);
    if (!blue?.socket || !red?.socket) {
      this.sendError(player.id, 'NOT_CONNECTED', 'Both players must be connected for a rematch.');
      return;
    }

    match.rematchRequests.add(color);
    const requestedBy = [...match.rematchRequests].map((requestedColor) =>
      this.publicPlayer(playerIdOf(match, requestedColor)),
    );
    for (const id of [match.blueId, match.redId]) {
      this.send(id, { type: 'rematch_state', matchId, requestedBy });
    }

    if (match.rematchRequests.size === 2) {
      this.createRematch(match);
    }
    this.schedulePersist();
  }

  private respondRematch(player: PlayerRecord, matchId: string, accept: boolean): void {
    const match = this.matches.get(matchId);
    if (!match || match.status !== 'finished') return;
    const color = colorOf(match, player.id);
    if (!color) return;

    if (!accept) {
      match.rematchRequests.clear();
      for (const id of [match.blueId, match.redId]) {
        this.send(id, { type: 'rematch_state', matchId, requestedBy: [] });
        this.send(id, { type: 'notice', kind: 'info', message: 'The rematch was declined.' });
      }
      return;
    }

    match.rematchRequests.add(color);
    if (match.rematchRequests.size === 2) {
      this.createRematch(match);
    } else {
      const requestedBy = [...match.rematchRequests].map((c) => this.publicPlayer(playerIdOf(match, c)));
      for (const id of [match.blueId, match.redId]) {
        this.send(id, { type: 'rematch_state', matchId, requestedBy });
      }
    }
  }

  private createRematch(previous: MatchRecord): void {
    const now = this.now();
    for (const id of [previous.blueId, previous.redId]) {
      const player = this.players.get(id);
      if (player) player.matchId = null;
    }
    if (previous.roomCode) {
      const room = this.rooms.get(previous.roomCode);
      if (room) {
        room.status = 'waiting';
        room.matchId = null;
      }
    }
    previous.rematchRequests.clear();

    this.startMatch({
      modeId: previous.modeId,
      timeControlId: previous.timeControlId,
      config: previous.config,
      blueId: previous.redId,
      redId: previous.blueId,
      roomCode: previous.roomCode,
    });
    this.notifyOpponent(previous, 'blue', 'Rematch started with colours swapped.', 'success');
    this.sendNoticeTo(previous.blueId, 'Rematch started with colours swapped.', 'success');
    this.log('rematch', { previousMatchId: previous.id, at: now });
  }

  private leaveMatch(player: PlayerRecord, matchId: string): void {
    const match = this.matches.get(matchId);
    if (!match) {
      player.matchId = null;
      return;
    }
    if (match.status === 'active') {
      this.sendError(player.id, 'ALREADY_IN_MATCH', 'Resign before leaving an active match.');
      return;
    }
    if (player.matchId === matchId) player.matchId = null;
    if (player.roomCode) {
      const room = this.rooms.get(player.roomCode);
      if (room?.status === 'finished') {
        player.roomCode = null;
        this.send(player.id, { type: 'room', room: null });
        const host = this.players.get(room.hostId);
        const guest = room.guestId ? this.players.get(room.guestId) : undefined;
        if (!host?.roomCode && !guest?.roomCode) this.rooms.delete(room.code);
      }
    }
    this.broadcastLobby();
    this.schedulePersist();
  }

  // ── Match lifecycle ───────────────────────────────────────────

  private remaining(match: MatchRecord, color: Player, now: number): number {
    const base = match.clocks[color];
    if (match.status !== 'active' || match.game.turn !== color) return Math.max(0, base);
    return Math.max(0, base - (now - match.turnStartedAt));
  }

  private finishMatch(match: MatchRecord, result: GameResult, endReason: string): void {
    if (match.status === 'finished') return;
    const now = this.now();
    match.clocks = {
      blue: this.remaining(match, 'blue', now),
      red: this.remaining(match, 'red', now),
    };
    match.status = 'finished';
    match.result = result;
    match.endReason = endReason;
    match.finishedAt = now;
    match.drawOffer = null;
    match.disconnects = {};
    match.rematchRequests.clear();

    if (endReason !== 'abandoned') {
      this.applyRatings(match, result);
    }

    if (match.roomCode) {
      const room = this.rooms.get(match.roomCode);
      if (room) room.status = 'finished';
    }

    this.sendMatchEnd(match);
    this.broadcastLobby();
    this.persistNow();
    this.log('match_end', {
      matchId: match.id,
      endReason,
      winner: result.kind === 'win' ? result.winner : 'draw',
    });
  }

  private abandonMatch(match: MatchRecord, message: string): void {
    if (match.status === 'finished') return;
    const now = this.now();
    match.clocks = {
      blue: this.remaining(match, 'blue', now),
      red: this.remaining(match, 'red', now),
    };
    match.status = 'finished';
    match.result = null;
    match.endReason = 'abandoned';
    match.finishedAt = now;
    match.drawOffer = null;
    match.disconnects = {};
    if (match.roomCode) {
      const room = this.rooms.get(match.roomCode);
      if (room) room.status = 'finished';
    }
    this.sendMatchEnd(match);
    this.sendNotice(match, message, 'warning');
    this.broadcastLobby();
    this.persistNow();
  }

  private applyRatings(match: MatchRecord, result: GameResult): void {
    const blue = this.players.get(match.blueId);
    const red = this.players.get(match.redId);
    if (!blue || !red) return;

    const blueScore = result.kind === 'draw' ? 0.5 : result.winner === 'blue' ? 1 : 0;
    const redScore = 1 - blueScore;
    const expectedBlue = 1 / (1 + 10 ** ((red.rating - blue.rating) / 400));
    const newBlue = Math.round(blue.rating + 24 * (blueScore - expectedBlue));
    const newRed = Math.round(red.rating + 24 * (redScore - (1 - expectedBlue)));

    match.ratingChanges = { blue: newBlue - blue.rating, red: newRed - red.rating };
    blue.rating = newBlue;
    red.rating = newRed;

    if (result.kind === 'draw') {
      blue.draws += 1;
      red.draws += 1;
    } else if (result.winner === 'blue') {
      blue.wins += 1;
      red.losses += 1;
    } else {
      red.wins += 1;
      blue.losses += 1;
    }
  }

  // ── Serialization ─────────────────────────────────────────────

  private publicPlayer(id: string): PublicPlayer {
    const player = this.players.get(id);
    if (!player) {
      return { id, name: 'Unknown', rating: 1000, wins: 0, losses: 0, draws: 0 };
    }
    return {
      id: player.id,
      name: player.name,
      rating: player.rating,
      wins: player.wins,
      losses: player.losses,
      draws: player.draws,
    };
  }

  private snapshot(match: MatchRecord, viewerId: string): MatchSnapshot {
    const now = this.now();
    const youAre = colorOf(match, viewerId) ?? 'blue';
    return {
      id: match.id,
      roomCode: match.roomCode,
      modeId: match.modeId,
      timeControlId: match.timeControlId,
      config: match.config,
      game: match.game,
      blue: this.publicPlayer(match.blueId),
      red: this.publicPlayer(match.redId),
      clocks: {
        blue: this.remaining(match, 'blue', now),
        red: this.remaining(match, 'red', now),
      },
      initialMs: match.initialMs,
      incrementMs: match.incrementMs,
      serverNow: now,
      status: match.status,
      result: match.result,
      endReason: match.endReason,
      ratingChanges: match.ratingChanges,
      youAre,
      presence: {
        blue: {
          connected: Boolean(this.players.get(match.blueId)?.socket),
          reconnectDeadline: match.disconnects.blue ?? null,
        },
        red: {
          connected: Boolean(this.players.get(match.redId)?.socket),
          reconnectDeadline: match.disconnects.red ?? null,
        },
      },
      drawOfferBy: match.drawOffer?.by ?? null,
      rematchRequests: [...match.rematchRequests].map((color) => this.publicPlayer(playerIdOf(match, color))),
      createdAt: match.createdAt,
    };
  }

  private roomSnapshot(room: RoomRecord): RoomSnapshot {
    return {
      code: room.code,
      modeId: room.modeId,
      timeControlId: room.timeControlId,
      config: room.config,
      visibility: room.visibility,
      host: this.publicPlayer(room.hostId),
      guest: room.guestId ? this.publicPlayer(room.guestId) : null,
      status: room.status,
      createdAt: room.createdAt,
      matchId: room.matchId,
    };
  }

  // ── Messaging helpers ────────────────────────────────────────

  private send(playerId: string, message: ServerMessage): void {
    this.players.get(playerId)?.socket?.send(message);
  }

  private sendError(playerId: string, code: ServerErrorCode, message: string): void {
    this.send(playerId, { type: 'error', code, message });
  }

  private sendNoticeTo(playerId: string, message: string, kind: 'info' | 'success' | 'warning' | 'error'): void {
    this.send(playerId, { type: 'notice', kind, message });
  }

  private sendNotice(match: MatchRecord, message: string, kind: 'info' | 'success' | 'warning' | 'error'): void {
    for (const id of [match.blueId, match.redId]) this.sendNoticeTo(id, message, kind);
  }

  private notifyOpponent(
    match: MatchRecord,
    actorColor: Player,
    message: string,
    kind: 'info' | 'success' | 'warning' | 'error',
  ): void {
    this.sendNoticeTo(opponentId(match, actorColor), message, kind);
  }

  private sendMatch(match: MatchRecord): void {
    for (const id of [match.blueId, match.redId]) {
      this.send(id, { type: 'match', match: this.snapshot(match, id) });
    }
  }

  private sendMatchEnd(match: MatchRecord): void {
    for (const id of [match.blueId, match.redId]) {
      this.send(id, { type: 'match_end', match: this.snapshot(match, id) });
    }
  }

  private sendRoom(room: RoomRecord): void {
    const snapshot = this.roomSnapshot(room);
    this.send(room.hostId, { type: 'room', room: snapshot });
    if (room.guestId) this.send(room.guestId, { type: 'room', room: snapshot });
  }

  private sendQueueStatus(playerId: string): void {
    this.send(playerId, { type: 'queue', queue: this.queueStatus(playerId) });
  }

  private queueStatus(playerId: string): QueueStatus {
    const entry = this.queue.get(playerId);
    if (!entry) return { state: 'idle' };
    const sorted = [...this.queue.values()].sort((a, b) => a.joinedAt - b.joinedAt);
    const position = sorted.findIndex((item) => item.playerId === playerId) + 1;
    return {
      state: 'queued',
      modeId: entry.modeId,
      timeControlId: entry.timeControlId,
      position,
      waitMs: this.now() - entry.joinedAt,
    };
  }

  private broadcastLobby(): void {
    const lobby = this.lobby();
    for (const player of this.players.values()) {
      player.socket?.send({ type: 'lobby', lobby });
    }
  }

  // ── Validation and small helpers ─────────────────────────────

  private validateSetup(
    modeId: ModeId,
    timeControlId: string,
    partial?: Partial<GameConfig>,
  ): { mode: NonNullable<ReturnType<typeof modeById>>; config: GameConfig } | { error: string } {
    const mode = modeById(modeId);
    if (!mode) return { error: 'Unknown game mode.' };
    const tc = timeControlById(timeControlId);
    if (!tc) return { error: 'Unknown time control.' };
    if (!mode.timeControls.includes(tc.id)) {
      return { error: `${mode.name} does not support the ${tc.label} clock.` };
    }

    const custom = mode.id === 'custom';
    const size = custom ? partial?.size ?? mode.arena.size : mode.arena.size;
    const walls = custom ? partial?.wallsPerPlayer ?? mode.arena.wallsPerPlayer : mode.arena.wallsPerPlayer;
    const maxWalls = Math.min(MAX_WALLS, 2 * (size - 1) * (size - 1));

    if (!Number.isInteger(size) || size < 5 || size > 15) {
      return { error: 'Board size must be between 5 and 15.' };
    }
    if (!Number.isInteger(walls) || walls < 0 || walls > maxWalls) {
      return { error: `Barriers must be between 0 and ${maxWalls} for a ${size}×${size} board.` };
    }

    const config: GameConfig = {
      size,
      wallsPerPlayer: walls,
      moveLimit: 240,
      repetitionLimit: 3,
      firstPlayer: 'blue',
    };
    const invalid = validateConfig(config);
    if (invalid) return { error: invalid };
    return { mode, config };
  }

  private newRoomCode(): string {
    for (let attempt = 0; attempt < 100; attempt++) {
      let code = '';
      for (let i = 0; i < 6; i++) {
        const index = Math.floor(this.rng() * CODE_ALPHABET.length);
        code += CODE_ALPHABET[index] ?? CODE_ALPHABET[0];
      }
      if (!this.rooms.has(code)) return code;
    }
    return `R${Date.now().toString(36).slice(-5).toUpperCase()}`;
  }

  // ── Persistence ──────────────────────────────────────────────

  private schedulePersist(): void {
    if (this.persistTimer) return;
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      this.store.save(this.toPersisted());
    }, this.persistDebounceMs);
    this.persistTimer.unref?.();
  }

  private persistNow(): void {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
    this.store.save(this.toPersisted());
  }

  private toPersisted(): PersistedState {
    return {
      version: 1,
      savedAt: this.now(),
      players: [...this.players.values()].map((player) => ({
        id: player.id,
        name: player.name,
        tokenHash: player.tokenHash,
        rating: player.rating,
        wins: player.wins,
        losses: player.losses,
        draws: player.draws,
        createdAt: player.createdAt,
      })),
      rooms: [...this.rooms.values()].map((room) => ({ ...room })),
      matches: [...this.matches.values()].map((match) => ({
        id: match.id,
        roomCode: match.roomCode,
        modeId: match.modeId,
        timeControlId: match.timeControlId,
        config: match.config,
        game: match.game,
        blueId: match.blueId,
        redId: match.redId,
        clocks: { ...match.clocks },
        initialMs: match.initialMs,
        incrementMs: match.incrementMs,
        turnStartedAt: match.turnStartedAt,
        status: match.status,
        result: match.result,
        endReason: match.endReason,
        ratingChanges: match.ratingChanges,
        createdAt: match.createdAt,
        finishedAt: match.finishedAt,
        lastMoveIds: { ...match.lastMoveIds },
      })),
    };
  }

  private restore(): void {
    const state = this.store.load();
    if (!state) return;
    const savedAt = state.savedAt;
    const now = this.now();

    for (const persisted of state.players) {
      this.players.set(persisted.id, {
        ...persisted,
        socket: null,
        roomCode: null,
        matchId: null,
        lastMoveAt: 0,
      });
    }

    for (const persisted of state.rooms) {
      this.rooms.set(persisted.code, { ...persisted });
      const host = this.players.get(persisted.hostId);
      if (host && persisted.status === 'waiting') host.roomCode = persisted.code;
    }

    for (const persisted of state.matches) {
      const active = persisted.status === 'active';
      const match: MatchRecord = {
        id: persisted.id,
        roomCode: persisted.roomCode,
        modeId: persisted.modeId,
        timeControlId: persisted.timeControlId,
        config: persisted.config,
        game: persisted.game,
        blueId: persisted.blueId,
        redId: persisted.redId,
        clocks: { ...persisted.clocks },
        initialMs: persisted.initialMs,
        incrementMs: persisted.incrementMs,
        turnStartedAt: active ? persisted.turnStartedAt + (now - savedAt) : persisted.turnStartedAt,
        status: persisted.status,
        result: persisted.result,
        endReason: persisted.endReason,
        ratingChanges: persisted.ratingChanges,
        createdAt: persisted.createdAt,
        finishedAt: persisted.finishedAt,
        disconnects: active ? { blue: now + this.graceMs, red: now + this.graceMs } : {},
        drawOffer: null,
        rematchRequests: new Set(),
        lastMoveIds: { ...persisted.lastMoveIds },
        lastSnapshotAt: 0,
        restored: active,
      };
      this.matches.set(match.id, match);
      if (active) {
        const blue = this.players.get(match.blueId);
        const red = this.players.get(match.redId);
        if (blue) {
          blue.matchId = match.id;
          if (match.roomCode) blue.roomCode = match.roomCode;
        }
        if (red) {
          red.matchId = match.id;
          if (match.roomCode) red.roomCode = match.roomCode;
        }
      }
    }

    this.log('restore', {
      players: this.players.size,
      rooms: this.rooms.size,
      matches: this.matches.size,
    });
  }
}

function opponentId(match: MatchRecord, color: Player): string {
  return color === 'blue' ? match.redId : match.blueId;
}
