import type {
  GameConfig,
  GameResult,
  GameState,
  ModeId,
  Move,
  Player,
} from '@barricade/engine';

export const PROTOCOL_VERSION = 1;

export type RoomVisibility = 'public' | 'private';

export interface PublicPlayer {
  readonly id: string;
  readonly name: string;
  readonly rating: number;
  readonly wins: number;
  readonly losses: number;
  readonly draws: number;
}

export interface PresenceInfo {
  readonly connected: boolean;
  /** Server timestamp (ms) after which the player forfeits. Null while connected. */
  readonly reconnectDeadline: number | null;
}

export interface RoomSnapshot {
  readonly code: string;
  readonly modeId: ModeId;
  readonly timeControlId: string;
  readonly config: GameConfig;
  readonly visibility: RoomVisibility;
  readonly host: PublicPlayer;
  readonly guest: PublicPlayer | null;
  readonly status: 'waiting' | 'playing' | 'finished';
  readonly createdAt: number;
  readonly matchId: string | null;
}

export interface RoomSummary {
  readonly code: string;
  readonly hostName: string;
  readonly hostRating: number;
  readonly modeId: ModeId;
  readonly timeControlId: string;
  readonly config: GameConfig;
  readonly createdAt: number;
}

export interface LeaderboardEntry {
  readonly id: string;
  readonly name: string;
  readonly rating: number;
  readonly wins: number;
  readonly losses: number;
  readonly draws: number;
}

export interface LobbySnapshot {
  readonly online: number;
  readonly inQueue: number;
  readonly activeMatches: number;
  readonly rooms: readonly RoomSummary[];
  readonly leaderboard: readonly LeaderboardEntry[];
  readonly serverNow: number;
}

export interface QueueStatus {
  readonly state: 'idle' | 'queued';
  readonly modeId?: ModeId;
  readonly timeControlId?: string;
  readonly position?: number;
  readonly waitMs?: number;
}

export interface MatchSnapshot {
  readonly id: string;
  readonly roomCode: string | null;
  readonly modeId: ModeId;
  readonly timeControlId: string;
  readonly config: GameConfig;
  readonly game: GameState;
  readonly blue: PublicPlayer;
  readonly red: PublicPlayer;
  /** Remaining clock per player at `serverNow`. */
  readonly clocks: Record<Player, number>;
  readonly initialMs: number;
  readonly incrementMs: number;
  readonly serverNow: number;
  readonly status: 'active' | 'finished';
  readonly result: GameResult | null;
  readonly endReason: string | null;
  readonly ratingChanges: Record<Player, number> | null;
  readonly youAre: Player;
  readonly presence: Record<Player, PresenceInfo>;
  readonly drawOfferBy: Player | null;
  readonly rematchRequests: readonly PublicPlayer[];
  readonly createdAt: number;
}

export type ClientMessage =
  | { type: 'hello'; playerId: string; name: string; token?: string; version: number }
  | { type: 'rename'; name: string }
  | { type: 'queue_join'; modeId: ModeId; timeControlId: string }
  | { type: 'queue_leave' }
  | {
      type: 'room_create';
      modeId: ModeId;
      timeControlId: string;
      config?: Partial<GameConfig>;
      visibility: RoomVisibility;
    }
  | { type: 'room_join'; code: string }
  | { type: 'room_leave' }
  | { type: 'move'; matchId: string; move: Move; clientMoveId: string }
  | { type: 'resign'; matchId: string }
  | { type: 'draw_offer'; matchId: string }
  | { type: 'draw_respond'; matchId: string; accept: boolean }
  | { type: 'rematch_request'; matchId: string }
  | { type: 'rematch_respond'; matchId: string; accept: boolean }
  | { type: 'match_leave'; matchId: string }
  | { type: 'ping'; t: number };

export type ServerErrorCode =
  | 'BAD_MESSAGE'
  | 'AUTH_FAILED'
  | 'INVALID_NAME'
  | 'INVALID_CONFIG'
  | 'ALREADY_IN_MATCH'
  | 'ALREADY_QUEUED'
  | 'ROOM_NOT_FOUND'
  | 'ROOM_FULL'
  | 'ROOM_STARTED'
  | 'MATCH_NOT_FOUND'
  | 'NOT_YOUR_TURN'
  | 'ILLEGAL_MOVE'
  | 'RATE_LIMITED'
  | 'NOT_CONNECTED'
  | 'SERVER_ERROR';

export type ServerMessage =
  | { type: 'welcome'; player: PublicPlayer; sessionToken: string; serverNow: number; resumed: boolean }
  | { type: 'error'; code: ServerErrorCode; message: string; requestId?: string }
  | { type: 'lobby'; lobby: LobbySnapshot }
  | { type: 'queue'; queue: QueueStatus }
  | { type: 'room'; room: RoomSnapshot | null }
  | { type: 'match'; match: MatchSnapshot }
  | { type: 'match_end'; match: MatchSnapshot }
  | { type: 'draw_offer'; matchId: string; from: PublicPlayer }
  | { type: 'rematch_state'; matchId: string; requestedBy: readonly PublicPlayer[] }
  | { type: 'notice'; kind: 'info' | 'success' | 'warning' | 'error'; message: string }
  | { type: 'pong'; t: number; serverNow: number }
  | { type: 'session_replaced' }
  | { type: 'server_restart' };

export function isClientMessage(value: unknown): value is ClientMessage {
  return Boolean(value && typeof value === 'object' && typeof (value as { type?: unknown }).type === 'string');
}
