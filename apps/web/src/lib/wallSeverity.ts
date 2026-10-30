import {
  goalRow,
  legalPawnMoves,
  shortestPath,
  type GameState,
  type Orientation,
  type Player,
  type Wall,
} from '@barricade/engine';

export type WallSeverity = 0 | 1 | 2 | 3;

export interface WallImpact {
  readonly severity: WallSeverity;
  readonly pathDelta: number;
  readonly safeMovesLost: number;
}

export const WALL_SEVERITY_LABELS = ['Minor', 'Light', 'Strong', 'Critical'] as const;

/**
 * How much a candidate wall hurts the opponent's likely next moves.
 * "Likely" = legal pawn moves that shorten the opponent's shortest path.
 */
export function wallImpact(
  state: GameState,
  orientation: Orientation,
  r: number,
  c: number,
  owner: Player,
): WallImpact {
  const opponent: Player = owner === 'blue' ? 'red' : 'blue';
  const { size } = state.config;
  const goal = goalRow(opponent, size);
  const before = shortestPath(size, state.walls, state.pawns[opponent], goal);
  const wall: Wall = { orientation, r, c, owner };
  const walls = [...state.walls, wall];
  const after = shortestPath(size, walls, state.pawns[opponent], goal);
  const pathDelta =
    before.distance >= 0 && after.distance >= 0 ? Math.max(0, after.distance - before.distance) : 0;
  const safeMovesLost = Math.max(0, safeMoves(state, opponent) - safeMoves({ ...state, walls }, opponent));
  const severity: WallSeverity =
    pathDelta >= 2 || safeMovesLost >= 3
      ? 3
      : pathDelta >= 1 || safeMovesLost >= 2
        ? 2
        : safeMovesLost >= 1
          ? 1
          : 0;
  return { severity, pathDelta, safeMovesLost };
}

function safeMoves(state: GameState, player: Player): number {
  const { size } = state.config;
  const goal = goalRow(player, size);
  const distance = shortestPath(size, state.walls, state.pawns[player], goal).distance;
  if (distance < 0) return 0;
  let count = 0;
  for (const to of legalPawnMoves(state, player)) {
    const next = shortestPath(size, state.walls, to, goal).distance;
    if (next >= 0 && next < distance) count += 1;
  }
  return count;
}

export function wallImpactLabel(impact: WallImpact): string {
  const parts = [`${WALL_SEVERITY_LABELS[impact.severity]} block`];
  if (impact.pathDelta > 0) parts.push(`+${impact.pathDelta} steps`);
  if (impact.safeMovesLost > 0) parts.push(`${impact.safeMovesLost} likely moves cut`);
  return parts.join(' · ');
}
