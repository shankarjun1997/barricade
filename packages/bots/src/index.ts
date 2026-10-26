import {
  applyMove,
  goalRow,
  legalPawnMoves,
  legalWallMoves,
  opponentOf,
  shortestPath,
  type BotPersonalityId,
  type GameState,
  type Move,
  type Player,
  type Point,
} from '@barricade/engine';

export interface BotProfile {
  readonly depth: number;
  readonly noise: number;
  readonly wallLimit: number;
  readonly aggression: number;
  readonly pathWeight: number;
  readonly wallValue: number;
  readonly randomWalls: boolean;
}

export const BOT_PROFILES: Record<BotPersonalityId, BotProfile> = {
  beginner: { depth: 0, noise: 70, wallLimit: 2, aggression: 0.6, pathWeight: 1, wallValue: 1.2, randomWalls: true },
  casual: { depth: 1, noise: 24, wallLimit: 3, aggression: 0.8, pathWeight: 1, wallValue: 1.1, randomWalls: true },
  intermediate: { depth: 2, noise: 8, wallLimit: 4, aggression: 1, pathWeight: 1.05, wallValue: 1, randomWalls: false },
  advanced: { depth: 2, noise: 3, wallLimit: 6, aggression: 1.15, pathWeight: 1.05, wallValue: 0.9, randomWalls: false },
  expert: { depth: 3, noise: 0, wallLimit: 7, aggression: 1.1, pathWeight: 1.1, wallValue: 0.85, randomWalls: false },
  defensive: { depth: 2, noise: 5, wallLimit: 5, aggression: 0.6, pathWeight: 1.35, wallValue: 1.2, randomWalls: false },
  aggressive: { depth: 2, noise: 4, wallLimit: 7, aggression: 1.45, pathWeight: 0.95, wallValue: 0.75, randomWalls: false },
  unpredictable: { depth: 1, noise: 40, wallLimit: 4, aggression: 1.1, pathWeight: 1, wallValue: 1, randomWalls: true },
};

export interface BotOptions {
  readonly personality?: BotPersonalityId;
  readonly seed?: number;
  /** Safety valve for pathological searches. */
  readonly maxNodes?: number;
}

const INF = 1_000_000;

/** Deterministic PRNG so bot decisions can be reproduced from a seed. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function centerDistance(size: number, p: Point): number {
  const mid = (size - 1) / 2;
  return Math.abs(p.r - mid) + Math.abs(p.c - mid);
}

function resultScore(state: GameState, bot: Player): number {
  if (!state.result) return 0;
  if (state.result.kind === 'draw') return 0;
  if (state.result.winner === bot) return INF - state.ply;
  return -INF + state.ply;
}

export function evaluate(state: GameState, bot: Player, profile: BotProfile): number {
  if (state.result) return resultScore(state, bot);

  const opponent = opponentOf(bot);
  const size = state.config.size;
  const myPath = shortestPath(size, state.walls, state.pawns[bot], goalRow(bot, size));
  const oppPath = shortestPath(size, state.walls, state.pawns[opponent], goalRow(opponent, size));

  if (myPath.distance === -1) return -INF + state.ply;
  if (oppPath.distance === -1) return INF - state.ply;

  let score = (oppPath.distance * profile.aggression - myPath.distance * profile.pathWeight) * 12;
  score += (state.wallsLeft[bot] - state.wallsLeft[opponent]) * profile.wallValue * 2;
  score += (legalPawnMoves(state, bot).length - legalPawnMoves(state, opponent).length) * 0.4;
  score += (centerDistance(size, state.pawns[opponent]) - centerDistance(size, state.pawns[bot])) * 0.15;
  return score;
}

function wallCandidatesForPath(state: GameState, target: Player): Move[] {
  const size = state.config.size;
  const path = shortestPath(size, state.walls, state.pawns[target], goalRow(target, size)).path;
  const anchors = new Map<string, Move>();

  const add = (orientation: 'H' | 'V', r: number, c: number) => {
    if (r < 0 || c < 0 || r >= size - 1 || c >= size - 1) return;
    anchors.set(`${orientation}${r},${c}`, { kind: 'wall', orientation, r, c });
  };

  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i];
    const b = path[i + 1];
    if (!a || !b) continue;
    if (a.r !== b.r) {
      const top = Math.min(a.r, b.r);
      add('H', top, a.c);
      add('H', top, a.c - 1);
    } else {
      const left = Math.min(a.c, b.c);
      add('V', a.r, left);
      add('V', a.r - 1, left);
    }
  }

  const legal = legalWallMoves(state);
  const legalKeys = new Set(legal.map((m) => `${m.orientation}${m.r},${m.c}`));
  return [...anchors.values()].filter(
    (m) => m.kind === 'wall' && legalKeys.has(`${m.orientation}${m.r},${m.c}`),
  );
}

function orderedCandidates(state: GameState, profile: BotProfile, rng: () => number): Move[] {
  const pawnMoves = legalPawnMoves(state).map<Move>((to) => ({ kind: 'move', to }));
  const opponent = opponentOf(state.turn);

  const scoring = (move: Move): number => {
    if (move.kind === 'move') {
      const goal = goalRow(state.turn, state.config.size);
      if (move.to.r === goal) return 1_000_000;
      const size = state.config.size;
      const dist = shortestPath(size, state.walls, move.to, goal).distance;
      return 10_000 - dist * 40;
    }
    const applied = applyMove(state, move);
    if (!applied.ok) return -1;
    const oppDist = shortestPath(
      state.config.size,
      applied.state.walls,
      applied.state.pawns[opponent],
      goalRow(opponent, state.config.size),
    ).distance;
    return oppDist * 55 - state.ply;
  };

  pawnMoves.sort((a, b) => scoring(b) - scoring(a));

  if (state.wallsLeft[state.turn] <= 0) return pawnMoves;

  const focused = wallCandidatesForPath(state, opponent);
  const shuffled = focused
    .map((move) => ({ move, order: rng() }))
    .sort((a, b) => a.order - b.order)
    .map((entry) => entry.move);

  const ranked = [...shuffled].sort((a, b) => scoring(b) - scoring(a)).slice(0, profile.wallLimit);

  if (profile.randomWalls) {
    const all = legalWallMoves(state);
    if (all.length > 0) {
      const pick = all[Math.floor(rng() * all.length)];
      if (pick && !ranked.some((m) => sameMove(m, pick))) ranked.push(pick);
    }
  }

  return [...pawnMoves, ...ranked];
}

function sameMove(a: Move, b: Move): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'move' && b.kind === 'move') return a.to.r === b.to.r && a.to.c === b.to.c;
  if (a.kind === 'wall' && b.kind === 'wall') {
    return a.orientation === b.orientation && a.r === b.r && a.c === b.c;
  }
  return false;
}

interface SearchContext {
  readonly bot: Player;
  readonly profile: BotProfile;
  readonly rng: () => number;
  readonly maxNodes: number;
  nodes: number;
}

function minimax(
  state: GameState,
  depth: number,
  alpha: number,
  beta: number,
  ctx: SearchContext,
): number {
  ctx.nodes++;
  if (state.result) return resultScore(state, ctx.bot);
  if (depth <= 0 || ctx.nodes > ctx.maxNodes) return evaluate(state, ctx.bot, ctx.profile);

  const maximizing = state.turn === ctx.bot;
  const moves = orderedCandidates(state, ctx.profile, ctx.rng);

  if (maximizing) {
    let best = -Infinity;
    for (const move of moves) {
      const applied = applyMove(state, move);
      if (!applied.ok) continue;
      const score = minimax(applied.state, depth - 1, alpha, beta, ctx);
      if (score > best) best = score;
      if (best > alpha) alpha = best;
      if (alpha >= beta) break;
    }
    return best === -Infinity ? evaluate(state, ctx.bot, ctx.profile) : best;
  }

  let best = Infinity;
  for (const move of moves) {
    const applied = applyMove(state, move);
    if (!applied.ok) continue;
    const score = minimax(applied.state, depth - 1, alpha, beta, ctx);
    if (score < best) best = score;
    if (best < beta) beta = best;
    if (alpha >= beta) break;
  }
  return best === Infinity ? evaluate(state, ctx.bot, ctx.profile) : best;
}

/**
 * Choose a legal move for the player whose turn it is.
 * Pure function: identical state + seed + personality always yields the same move.
 */
export function chooseBotMove(state: GameState, options: BotOptions = {}): Move | null {
  if (state.result) return null;
  const personality = options.personality ?? 'casual';
  const profile = BOT_PROFILES[personality];
  const rng = mulberry32(options.seed ?? 1);
  const bot = state.turn;

  const moves = orderedCandidates(state, profile, rng);
  if (moves.length === 0) return null;

  // Always take a win that is available right now.
  for (const move of moves) {
    const applied = applyMove(state, move);
    if (applied.ok && applied.state.result?.kind === 'win' && applied.state.result.winner === bot) {
      return move;
    }
  }

  if (profile.depth === 0) {
    const pool = moves.slice(0, Math.max(1, Math.ceil(moves.length / 2)));
    return pool[Math.floor(rng() * pool.length)] ?? moves[0] ?? null;
  }

  const ctx: SearchContext = {
    bot,
    profile,
    rng,
    maxNodes: options.maxNodes ?? 6000,
    nodes: 0,
  };

  let best: Move | null = null;
  let bestScore = -Infinity;

  for (const move of moves) {
    const applied = applyMove(state, move);
    if (!applied.ok) continue;
    const score =
      minimax(applied.state, profile.depth - 1, -Infinity, Infinity, ctx) +
      (rng() - 0.5) * profile.noise;
    if (score > bestScore) {
      bestScore = score;
      best = move;
    }
  }

  return best ?? moves[0] ?? null;
}
