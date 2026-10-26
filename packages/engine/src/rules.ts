import type {
  ApplyResult,
  EngineError,
  GameConfig,
  GameResult,
  GameState,
  Move,
  MoveRecord,
  Player,
  Point,
  Wall,
  WallMove,
} from './types.js';
import {
  DEFAULT_MOVE_LIMIT,
  DEFAULT_REPETITION_LIMIT,
  DEFAULT_SIZE,
  DEFAULT_WALLS,
  opponentOf,
  goalRow,
  startPoint,
} from './types.js';
import {
  DIRECTIONS,
  WALL_DIRECTIONS,
  inBounds,
  pointKey,
  samePoint,
  shortestPath,
  validateConfig,
  wallBlocks,
  wallPlacementError,
} from './geometry.js';

export const DEFAULT_CONFIG: GameConfig = {
  size: DEFAULT_SIZE,
  wallsPerPlayer: DEFAULT_WALLS,
  moveLimit: DEFAULT_MOVE_LIMIT,
  firstPlayer: 'blue',
  repetitionLimit: DEFAULT_REPETITION_LIMIT,
};

export function createGame(partial: Partial<GameConfig> = {}): GameState {
  const config: GameConfig = { ...DEFAULT_CONFIG, ...partial };
  const problem = validateConfig(config);
  if (problem) throw new Error(`Invalid game config: ${problem}`);

  const pawns = {
    blue: startPoint('blue', config.size),
    red: startPoint('red', config.size),
  };
  const wallsLeft = {
    blue: config.wallsPerPlayer,
    red: config.wallsPerPlayer,
  };
  const state: GameState = {
    config,
    pawns,
    walls: [],
    wallsLeft,
    turn: config.firstPlayer,
    ply: 0,
    history: [],
    result: null,
    positions: {},
    lastMove: null,
  };
  return {
    ...state,
    positions: { [positionKey(state)]: 1 },
  };
}

export interface PositionSetup {
  readonly pawns?: Partial<Record<Player, Point>>;
  readonly walls?: readonly Wall[];
  readonly wallsLeft?: Partial<Record<Player, number>>;
  readonly turn?: Player;
}

/**
 * Build a validated custom starting position (puzzles, tutorials, tests).
 * Every wall must be legal in isolation and both pawns must retain a route.
 */
export function createPosition(partial: Partial<GameConfig> = {}, setup: PositionSetup = {}): GameState {
  const base = createGame(partial);
  const pawns: Record<Player, Point> = {
    blue: setup.pawns?.blue ?? base.pawns.blue,
    red: setup.pawns?.red ?? base.pawns.red,
  };
  if (!inBounds(base.config.size, pawns.blue) || !inBounds(base.config.size, pawns.red)) {
    throw new Error('Invalid position: a pawn is outside the board.');
  }
  if (samePoint(pawns.blue, pawns.red)) {
    throw new Error('Invalid position: both pawns occupy the same square.');
  }

  const walls: Wall[] = [];
  for (const wall of setup.walls ?? []) {
    if (wallPlacementError(base.config.size, walls, wall.orientation, wall.r, wall.c) !== null) {
      throw new Error('Invalid position: barriers overlap, cross, or fall outside the board.');
    }
    walls.push({ ...wall });
  }

  const wallsLeft = {
    blue: setup.wallsLeft?.blue ?? base.config.wallsPerPlayer - walls.filter((w) => w.owner === 'blue').length,
    red: setup.wallsLeft?.red ?? base.config.wallsPerPlayer - walls.filter((w) => w.owner === 'red').length,
  };
  if (wallsLeft.blue < 0 || wallsLeft.red < 0) {
    throw new Error('Invalid position: more barriers placed than the player owns.');
  }

  if (shortestPath(base.config.size, walls, pawns.blue, goalRow('blue', base.config.size)).path.length === 0) {
    throw new Error('Invalid position: Blue has no route to the goal.');
  }
  if (shortestPath(base.config.size, walls, pawns.red, goalRow('red', base.config.size)).path.length === 0) {
    throw new Error('Invalid position: Red has no route to the goal.');
  }

  const state: GameState = {
    config: base.config,
    pawns,
    walls,
    wallsLeft,
    turn: setup.turn ?? base.config.firstPlayer,
    ply: 0,
    history: [],
    result: null,
    positions: {},
    lastMove: null,
  };
  return { ...state, positions: { [positionKey(state)]: 1 } };
}

/** Puzzle/tutorial-only: hand the turn over without a move. Never used online. */
export function passTurn(state: GameState): GameState {
  if (state.result) return state;
  return { ...state, turn: opponentOf(state.turn) };
}

function error(code: EngineError['code'], message: string): ApplyResult {
  return { ok: false, error: { code, message } };
}

export function positionKey(state: Pick<GameState, 'config' | 'pawns' | 'walls' | 'wallsLeft' | 'turn'>): string {
  const walls = [...state.walls]
    .map((w) => `${w.orientation}${w.r}${w.c}`)
    .sort()
    .join('|');
  return `${state.config.size}:${state.turn}:${state.pawns.blue.r},${state.pawns.blue.c}:${state.pawns.red.r},${state.pawns.red.c}:${state.wallsLeft.blue},${state.wallsLeft.red}:${walls}`;
}

/** All pawn destinations for `player`, including straight and diagonal jumps. */
export function legalPawnMoves(state: GameState, player: Player = state.turn): Point[] {
  const { size } = state.config;
  const me = state.pawns[player];
  const opp = state.pawns[opponentOf(player)];
  const moves: Point[] = [];

  for (const dir of DIRECTIONS) {
    const target: Point = { r: me.r + dir.r, c: me.c + dir.c };
    if (!inBounds(size, target)) continue;
    if (wallBlocks(state.walls, me, target)) continue;

    if (!samePoint(target, opp)) {
      moves.push(target);
      continue;
    }

    // Opponent is adjacent: attempt a straight jump first.
    const beyond: Point = { r: opp.r + dir.r, c: opp.c + dir.c };
    if (inBounds(size, beyond) && !wallBlocks(state.walls, opp, beyond)) {
      moves.push(beyond);
      continue;
    }

    // Straight jump blocked by an edge or wall: diagonal jumps around the opponent.
    const perpendiculars: Point[] =
      dir.r !== 0
        ? [
            { r: 0, c: -1 },
            { r: 0, c: 1 },
          ]
        : [
            { r: -1, c: 0 },
            { r: 1, c: 0 },
          ];
    for (const p of perpendiculars) {
      const dest: Point = { r: opp.r + p.r, c: opp.c + p.c };
      if (!inBounds(size, dest)) continue;
      if (!samePoint(dest, me) && !moves.some((m) => samePoint(m, dest))) {
        moves.push(dest);
      }
    }
  }

  return moves;
}

/**
 * All legal wall placements. A wall is rejected if it overlaps, crosses, is
 * out of bounds, exceeds the player's inventory, or severs every route for
 * either player.
 */
export function legalWallMoves(state: GameState, player: Player = state.turn): WallMove[] {
  if (state.wallsLeft[player] <= 0) return [];
  const { size } = state.config;
  const moves: WallMove[] = [];

  for (let r = 0; r < size - 1; r++) {
    for (let c = 0; c < size - 1; c++) {
      for (const orientation of WALL_DIRECTIONS) {
        if (wallPlacementError(size, state.walls, orientation, r, c) !== null) continue;
        const wall: Wall = { orientation, r, c, owner: player };
        const walls = [...state.walls, wall];
        if (!shortestPath(size, walls, state.pawns.blue, goalRow('blue', size)).path.length) continue;
        if (!shortestPath(size, walls, state.pawns.red, goalRow('red', size)).path.length) continue;
        moves.push({ kind: 'wall', orientation, r, c });
      }
    }
  }

  return moves;
}

export function legalMoves(state: GameState, player: Player = state.turn): Move[] {
  if (state.result) return [];
  const pawnMoves: Move[] = legalPawnMoves(state, player).map((to) => ({ kind: 'move', to }));
  return [...pawnMoves, ...legalWallMoves(state, player)];
}

export function isLegalMove(state: GameState, move: Move): boolean {
  if (state.result) return false;
  if (move.kind === 'move') {
    return legalPawnMoves(state).some((p) => samePoint(p, move.to));
  }
  if (state.wallsLeft[state.turn] <= 0) return false;
  if (wallPlacementError(state.config.size, state.walls, move.orientation, move.r, move.c) !== null) {
    return false;
  }
  const wall: Wall = { orientation: move.orientation, r: move.r, c: move.c, owner: state.turn };
  const walls = [...state.walls, wall];
  return (
    shortestPath(state.config.size, walls, state.pawns.blue, goalRow('blue', state.config.size)).path.length > 0 &&
    shortestPath(state.config.size, walls, state.pawns.red, goalRow('red', state.config.size)).path.length > 0
  );
}

export function applyMove(state: GameState, move: Move, at?: number): ApplyResult {
  if (state.result) return error('GAME_OVER', 'This match has already ended.');

  const player = state.turn;
  const other = opponentOf(player);

  if (move.kind === 'move') {
    const legal = legalPawnMoves(state, player).some((p) => samePoint(p, move.to));
    if (!legal) {
      if (!inBounds(state.config.size, move.to)) return error('OUT_OF_BOUNDS', 'That square is outside the board.');
      if (samePoint(move.to, state.pawns[other])) return error('OCCUPIED', 'That square is occupied.');
      if (move.to.r === state.pawns[player].r && move.to.c === state.pawns[player].c) {
        return error('ILLEGAL_MOVE', 'You must move to a different square.');
      }
      return error('ILLEGAL_MOVE', 'That move is not legal.');
    }

    const pawns = { ...state.pawns, [player]: { ...move.to } };
    const wins = move.to.r === goalRow(player, state.config.size);
    return finish(state, {
      pawns,
      walls: state.walls,
      wallsLeft: state.wallsLeft,
      turn: other,
      result: wins ? { kind: 'win', winner: player, reason: 'goal' } : null,
      move,
      by: player,
      at,
    });
  }

  // Wall placement.
  if (state.wallsLeft[player] <= 0) return error('NO_WALLS_LEFT', 'You have no barriers left.');
  const placement = wallPlacementError(state.config.size, state.walls, move.orientation, move.r, move.c);
  if (placement === 'WALL_OUT_OF_BOUNDS') return error('WALL_OUT_OF_BOUNDS', 'That barrier is outside the board.');
  if (placement === 'WALL_OVERLAP') return error('WALL_OVERLAP', 'A barrier already occupies that position.');
  if (placement === 'WALL_CROSSING') return error('WALL_CROSSING', 'That barrier would cross another barrier.');

  const wall: Wall = { orientation: move.orientation, r: move.r, c: move.c, owner: player };
  const walls = [...state.walls, wall];
  const size = state.config.size;
  if (shortestPath(size, walls, state.pawns.blue, goalRow('blue', size)).path.length === 0) {
    return error('ROUTE_BLOCKED', 'That barrier would seal off Blue completely.');
  }
  if (shortestPath(size, walls, state.pawns.red, goalRow('red', size)).path.length === 0) {
    return error('ROUTE_BLOCKED', 'That barrier would seal off Red completely.');
  }

  const wallsLeft = { ...state.wallsLeft, [player]: state.wallsLeft[player] - 1 };
  return finish(state, {
    pawns: state.pawns,
    walls,
    wallsLeft,
    turn: other,
    result: null,
    move,
    by: player,
    at,
  });
}

function finish(
  state: GameState,
  next: {
    pawns: Readonly<Record<Player, Point>>;
    walls: readonly Wall[];
    wallsLeft: Readonly<Record<Player, number>>;
    turn: Player;
    result: GameResult | null;
    move: Move;
    by: Player;
    at?: number;
  },
): ApplyResult {
  const ply = state.ply + 1;
  const record: MoveRecord = {
    move: next.move,
    by: next.by,
    ply,
    ...(next.at !== undefined ? { at: next.at } : {}),
  };

  const partial: GameState = {
    config: state.config,
    pawns: next.pawns,
    walls: next.walls,
    wallsLeft: next.wallsLeft,
    turn: next.turn,
    ply,
    history: [...state.history, record],
    result: next.result,
    positions: state.positions,
    lastMove: record,
  };

  let result = next.result;
  let positions = state.positions;

  if (!result) {
    const key = positionKey(partial);
    const count = (state.positions[key] ?? 0) + 1;
    positions = { ...state.positions, [key]: count };

    const repetitionLimit = state.config.repetitionLimit;
    if (repetitionLimit > 0 && count >= repetitionLimit) {
      result = { kind: 'draw', reason: 'repetition' };
    } else if (state.config.moveLimit > 0 && ply >= state.config.moveLimit) {
      result = { kind: 'draw', reason: 'move-limit' };
    }
  }

  return {
    ok: true,
    state: { ...partial, result, positions },
  };
}

/** Rebuild a state from its config plus a move list. Throws on any illegal move. */
export function replay(config: Partial<GameConfig>, moves: readonly Move[]): GameState {
  let state = createGame(config);
  for (const move of moves) {
    const applied = applyMove(state, move);
    if (!applied.ok) {
      throw new Error(`Replay diverged on ply ${state.ply + 1}: ${applied.error.message}`);
    }
    state = applied.state;
  }
  return state;
}

/** Rewind `plies` moves (local/puzzle use only — never authoritative online). */
export function undo(state: GameState, plies = 1): GameState {
  const keep = Math.max(0, state.history.length - Math.max(1, plies));
  const moves = state.history.slice(0, keep).map((h) => h.move);
  return replay(state.config, moves);
}

export function resign(state: GameState, player: Player): GameState {
  if (state.result) return state;
  return {
    ...state,
    result: { kind: 'win', winner: opponentOf(player), reason: 'resign' },
  };
}

/** Clock layer calls this when a player's authoritative clock expires. */
export function declareTimeout(state: GameState, player: Player): GameState {
  if (state.result) return state;
  return {
    ...state,
    result: { kind: 'win', winner: opponentOf(player), reason: 'timeout' },
  };
}

export function declareForfeit(state: GameState, player: Player): GameState {
  if (state.result) return state;
  return {
    ...state,
    result: { kind: 'win', winner: opponentOf(player), reason: 'forfeit' },
  };
}

export function agreeDraw(state: GameState): GameState {
  if (state.result) return state;
  return { ...state, result: { kind: 'draw', reason: 'agreement' } };
}

export function isGameOver(state: GameState): boolean {
  return state.result !== null;
}

export function distanceToGoal(state: GameState, player: Player): number {
  return shortestPath(
    state.config.size,
    state.walls,
    state.pawns[player],
    goalRow(player, state.config.size),
  ).distance;
}

export function serializeGame(state: GameState): string {
  return JSON.stringify(state);
}

export function deserializeGame(raw: string): GameState {
  const parsed = JSON.parse(raw) as GameState;
  const problem = validateConfig(parsed.config);
  if (problem) throw new Error(`Corrupt game state: ${problem}`);
  const rebuilt = replay(parsed.config, parsed.history.map((h) => h.move));
  // Preserve any externally attached result (resign/timeout/draw) that a
  // replay of moves alone cannot reconstruct.
  if (parsed.result && !rebuilt.result) {
    return { ...rebuilt, result: parsed.result };
  }
  return rebuilt;
}
