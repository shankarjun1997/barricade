import {
  createPosition,
  shortestPath,
  startPoint,
  type GameConfig,
  type Wall,
} from '@barricade/engine';
import { createMatch, type ActiveMatch } from './match.js';
import type { Profile } from './profile.js';

export interface PuzzleDef {
  readonly id: string;
  readonly title: string;
  readonly difficulty: 1 | 2 | 3;
  readonly description: string;
  readonly hint: string;
  readonly size: number;
  readonly wallsPerPlayer: number;
  readonly walls: readonly Wall[];
  readonly slack: number;
}

const wall = (orientation: 'H' | 'V', r: number, c: number, owner: 'blue' | 'red' = 'red'): Wall => ({
  orientation,
  r,
  c,
  owner,
});

export const PUZZLES: readonly PuzzleDef[] = [
  {
    id: 'open-road',
    title: 'Open Road',
    difficulty: 1,
    description: 'No walls, no excuses. Reach the home space in the minimum number of casts.',
    hint: 'Move straight up the board. Every sideways step costs you.',
    size: 7,
    wallsPerPlayer: 0,
    walls: [],
    slack: 0,
  },
  {
    id: 'around-the-wall',
    title: 'Around the Wall',
    difficulty: 2,
    description: 'A wall spans the middle. Find the gap and keep your move count tight.',
    hint: 'The left flank is one square shorter than the right. Count before you commit.',
    size: 7,
    wallsPerPlayer: 0,
    walls: [wall('H', 3, 2), wall('H', 3, 4)],
    slack: 1,
  },
  {
    id: 'gateway',
    title: 'Gateway',
    difficulty: 2,
    description: 'A long wall with narrow doors. Route through the opening without wasting casts.',
    hint: 'Aim for column A or the far right edge.',
    size: 9,
    wallsPerPlayer: 0,
    walls: [wall('H', 4, 1), wall('H', 4, 3)],
    slack: 1,
  },
  {
    id: 'ziggurat',
    title: 'Ziggurat',
    difficulty: 3,
    description: 'Staggered walls force a switchback climb. Efficiency is everything.',
    hint: 'Move sideways early, then commit to a clean vertical lane.',
    size: 11,
    wallsPerPlayer: 0,
    walls: [
      wall('H', 8, 3),
      wall('H', 8, 5),
      wall('V', 5, 1),
      wall('V', 5, 6),
      wall('H', 3, 1),
      wall('H', 3, 3),
    ],
    slack: 2,
  },
  {
    id: 'gauntlet',
    title: 'Gauntlet',
    difficulty: 3,
    description: 'Three walls, three decisions. Take the shortest legal corridor across the grand board.',
    hint: 'The centre lane looks tempting, but the second wall closes it. Scan the edges first.',
    size: 13,
    wallsPerPlayer: 0,
    walls: [
      wall('H', 10, 2),
      wall('H', 10, 4),
      wall('H', 10, 6),
      wall('H', 6, 0),
      wall('H', 6, 2),
      wall('H', 6, 4),
      wall('H', 2, 7),
      wall('H', 2, 9),
      wall('H', 2, 11),
    ],
    slack: 2,
  },
];

export function puzzleById(id: string): PuzzleDef | undefined {
  return PUZZLES.find((puzzle) => puzzle.id === id);
}

export function puzzleConfig(def: PuzzleDef): GameConfig {
  return {
    size: def.size,
    wallsPerPlayer: def.wallsPerPlayer,
    moveLimit: 0,
    repetitionLimit: 0,
    firstPlayer: 'blue',
  };
}

export function puzzleBudget(def: PuzzleDef): number {
  const config = puzzleConfig(def);
  const position = createPosition(config, {
    walls: def.walls,
    wallsLeft: { blue: def.wallsPerPlayer, red: 0 },
  });
  const distance = shortestPath(config.size, position.walls, startPoint('blue', config.size), 0).distance;
  return Math.max(1, distance) + def.slack;
}

export function createPuzzleMatch(def: PuzzleDef): ActiveMatch {
  const config = puzzleConfig(def);
  const base = createMatch({
    modeId: 'puzzle',
    controller: 'puzzle',
    config,
    timeControlId: 'unlimited',
    names: { blue: 'You', red: 'Puzzle' },
    puzzle: { id: def.id, title: def.title, maxBlueMoves: puzzleBudget(def) },
  });
  return {
    ...base,
    game: createPosition(config, {
      walls: def.walls,
      turn: 'blue',
      wallsLeft: { blue: def.wallsPerPlayer, red: 0 },
    }),
  };
}

export function dayNumber(date = new Date()): number {
  return Math.floor(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / 86_400_000);
}

export function dailyPuzzle(date = new Date()): PuzzleDef {
  const index = dayNumber(date) % PUZZLES.length;
  return PUZZLES[index] ?? PUZZLES[0]!;
}

export function solvedPuzzles(profile: Profile): Set<string> {
  const solved = new Set<string>();
  for (const entry of profile.history) {
    if (entry.controller === 'puzzle' && entry.result === 'win' && entry.puzzleId) {
      solved.add(entry.puzzleId);
    }
  }
  return solved;
}
