/**
 * Barricade — pure, deterministic game engine.
 *
 * Coordinate system: rows 0..size-1 top → bottom, columns 0..size-1 left → right.
 * Blue starts at the bottom centre and races to row 0.
 * Red starts at the top centre and races to row (size - 1).
 *
 * Walls live on the (size-1) × (size-1) lattice between cells.
 *  - H wall anchored at (r, c) blocks vertical movement between row r/r+1,
 *    for columns c and c+1.
 *  - V wall anchored at (r, c) blocks horizontal movement between column c/c+1,
 *    for rows r and r+1.
 */

export type Player = 'blue' | 'red';
export type Orientation = 'H' | 'V';

export interface Point {
  readonly r: number;
  readonly c: number;
}

export interface Wall {
  readonly orientation: Orientation;
  readonly r: number;
  readonly c: number;
  readonly owner: Player;
}

export type PawnMove = { readonly kind: 'move'; readonly to: Point };
export type WallMove = {
  readonly kind: 'wall';
  readonly orientation: Orientation;
  readonly r: number;
  readonly c: number;
};
export type Move = PawnMove | WallMove;

export type WinReason = 'goal' | 'resign' | 'timeout' | 'forfeit';
export type DrawReason = 'repetition' | 'move-limit' | 'agreement';

export type GameResult =
  | { readonly kind: 'win'; readonly winner: Player; readonly reason: WinReason }
  | { readonly kind: 'draw'; readonly reason: DrawReason };

export interface GameConfig {
  /** Board is size × size. Validated to MIN_SIZE..MAX_SIZE. */
  readonly size: number;
  /** How many walls each player may place. */
  readonly wallsPerPlayer: number;
  /** Maximum plies before the game is drawn. 0 disables the limit. */
  readonly moveLimit: number;
  /** Which player moves first. */
  readonly firstPlayer: Player;
  /** Repetition draw threshold (occurrences of the same position). 0 disables. */
  readonly repetitionLimit: number;
}

export interface MoveRecord {
  readonly move: Move;
  readonly by: Player;
  readonly ply: number;
  /** Optional server-supplied timestamp (ms since epoch). */
  readonly at?: number;
}

export interface GameState {
  readonly config: GameConfig;
  readonly pawns: Readonly<Record<Player, Point>>;
  readonly walls: readonly Wall[];
  readonly wallsLeft: Readonly<Record<Player, number>>;
  readonly turn: Player;
  readonly ply: number;
  readonly history: readonly MoveRecord[];
  readonly result: GameResult | null;
  /** Deterministic position key → occurrence count, for repetition draws. */
  readonly positions: Readonly<Record<string, number>>;
  readonly lastMove: MoveRecord | null;
}

export interface EngineError {
  readonly code:
    | 'GAME_OVER'
    | 'NOT_YOUR_TURN'
    | 'ILLEGAL_MOVE'
    | 'OCCUPIED'
    | 'OUT_OF_BOUNDS'
    | 'BLOCKED_BY_WALL'
    | 'NO_WALLS_LEFT'
    | 'WALL_OVERLAP'
    | 'WALL_CROSSING'
    | 'WALL_OUT_OF_BOUNDS'
    | 'ROUTE_BLOCKED'
    | 'INVALID_CONFIG'
    | 'NO_LEGAL_MOVES';
  readonly message: string;
}

export type ApplyResult =
  | { readonly ok: true; readonly state: GameState }
  | { readonly ok: false; readonly error: EngineError };

export const MIN_SIZE = 5;
export const MAX_SIZE = 15;
export const DEFAULT_SIZE = 9;
export const DEFAULT_WALLS = 10;
export const DEFAULT_MOVE_LIMIT = 240;
export const DEFAULT_REPETITION_LIMIT = 3;

export const PLAYERS: readonly Player[] = ['blue', 'red'];

export function opponentOf(player: Player): Player {
  return player === 'blue' ? 'red' : 'blue';
}

export function goalRow(player: Player, size: number): number {
  return player === 'blue' ? 0 : size - 1;
}

export function startPoint(player: Player, size: number): Point {
  const mid = Math.floor(size / 2);
  return player === 'blue' ? { r: size - 1, c: mid } : { r: 0, c: mid };
}
