import type { GameConfig, Orientation, Point, Wall } from './types.js';
import { MAX_SIZE, MIN_SIZE } from './types.js';

export const DIRECTIONS: readonly Point[] = [
  { r: -1, c: 0 },
  { r: 1, c: 0 },
  { r: 0, c: -1 },
  { r: 0, c: 1 },
];

export function inBounds(size: number, p: Point): boolean {
  return p.r >= 0 && p.r < size && p.c >= 0 && p.c < size;
}

export function samePoint(a: Point, b: Point): boolean {
  return a.r === b.r && a.c === b.c;
}

export function pointKey(p: Point): string {
  return `${p.r},${p.c}`;
}

export const WALL_DIRECTIONS: readonly Orientation[] = ['H', 'V'];

/** A wall must have its anchor inside the (size-1)² lattice. */
export function wallAnchorInBounds(size: number, orientation: Orientation, r: number, c: number): boolean {
  return r >= 0 && r < size - 1 && c >= 0 && c < size - 1;
}

/**
 * Does a wall block movement between two orthogonally-adjacent cells?
 * `to` must be exactly one orthogonal step from `from`.
 */
export function wallBlocks(walls: readonly Wall[], from: Point, to: Point): boolean {
  const dr = to.r - from.r;
  const dc = to.c - from.c;
  const top = Math.min(from.r, to.r);
  const left = Math.min(from.c, to.c);

  if (dr !== 0) {
    // Vertical movement across a horizontal line.
    if (Math.abs(dr) !== 1 || dc !== 0) return false;
    return walls.some(
      (w) =>
        w.orientation === 'H' &&
        w.r === top &&
        (w.c === left || w.c === left - 1),
    );
  }

  if (dc !== 0) {
    // Horizontal movement across a vertical line.
    if (Math.abs(dc) !== 1 || dr !== 0) return false;
    return walls.some(
      (w) =>
        w.orientation === 'V' &&
        w.c === left &&
        (w.r === top || w.r === top - 1),
    );
  }

  return false;
}

export type WallPlacementError = 'WALL_OUT_OF_BOUNDS' | 'WALL_OVERLAP' | 'WALL_CROSSING' | null;

export function wallPlacementError(
  size: number,
  walls: readonly Wall[],
  orientation: Orientation,
  r: number,
  c: number,
): WallPlacementError {
  if (!wallAnchorInBounds(size, orientation, r, c)) return 'WALL_OUT_OF_BOUNDS';
  // Walls span two cells along their line, so collinear walls anchored one
  // segment apart overlap even when their anchors differ.
  const overlaps = walls.some((w) => {
    if (w.orientation !== orientation) return false;
    return orientation === 'H'
      ? w.r === r && Math.abs(w.c - c) < 2
      : w.c === c && Math.abs(w.r - r) < 2;
  });
  if (overlaps) return 'WALL_OVERLAP';
  // A horizontal and vertical wall sharing an anchor cross in the centre.
  if (walls.some((w) => w.orientation !== orientation && w.r === r && w.c === c)) {
    return 'WALL_CROSSING';
  }
  return null;
}

export interface Reachability {
  /** Distance in orthogonal steps from the pawn to its goal row, -1 if unreachable. */
  readonly distance: number;
  /** Shortest path (inclusive of start, exclusive of goal row cells) or empty. */
  readonly path: readonly Point[];
}

/**
 * Breadth-first shortest path from `from` to any cell in the player's goal row.
 * Walls block edges, never cells. Complexity O(size²).
 */
export function shortestPath(
  size: number,
  walls: readonly Wall[],
  from: Point,
  targetRow: number,
): Reachability {
  if (from.r === targetRow) return { distance: 0, path: [from] };

  const total = size * size;
  const dist = new Int32Array(total).fill(-1);
  const prev = new Int32Array(total).fill(-1);
  const start = from.r * size + from.c;
  dist[start] = 0;

  const queue: number[] = [start];
  let head = 0;

  while (head < queue.length) {
    const index = queue[head++];
    if (index === undefined) break;
    const r = Math.floor(index / size);
    const c = index % size;

    if (r === targetRow) {
      // Reconstruct the path.
      const path: Point[] = [];
      let cursor = index;
      while (cursor !== -1) {
        path.push({ r: Math.floor(cursor / size), c: cursor % size });
        cursor = prev[cursor] ?? -1;
      }
      path.reverse();
      return { distance: dist[index] ?? -1, path };
    }

    const current = { r, c };
    for (const d of DIRECTIONS) {
      const next = { r: r + d.r, c: c + d.c };
      if (!inBounds(size, next)) continue;
      if (wallBlocks(walls, current, next)) continue;
      const ni = next.r * size + next.c;
      if (dist[ni] !== -1) continue;
      dist[ni] = (dist[index] ?? 0) + 1;
      prev[ni] = index;
      queue.push(ni);
    }
  }

  return { distance: -1, path: [] };
}

export function hasPath(size: number, walls: readonly Wall[], from: Point, targetRow: number): boolean {
  return shortestPath(size, walls, from, targetRow).distance !== -1;
}

export function validateConfig(config: GameConfig): string | null {
  if (!Number.isInteger(config.size) || config.size < MIN_SIZE || config.size > MAX_SIZE) {
    return `Board size must be an integer between ${MIN_SIZE} and ${MAX_SIZE}.`;
  }
  if (!Number.isInteger(config.wallsPerPlayer) || config.wallsPerPlayer < 0) {
    return 'Wall count must be a non-negative integer.';
  }
  if (config.wallsPerPlayer > 2 * (config.size - 1) * (config.size - 1)) {
    return 'Wall count exceeds the number of wall positions on this board.';
  }
  if (!Number.isInteger(config.moveLimit) || config.moveLimit < 0) {
    return 'Move limit must be a non-negative integer (0 disables it).';
  }
  if (!Number.isInteger(config.repetitionLimit) || config.repetitionLimit < 0) {
    return 'Repetition limit must be a non-negative integer (0 disables it).';
  }
  if (config.firstPlayer !== 'blue' && config.firstPlayer !== 'red') {
    return 'First player must be blue or red.';
  }
  return null;
}
