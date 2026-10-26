import type { ModeId } from '@barricade/engine';
import { createId } from './storage.js';

export type Controller = 'local' | 'bot' | 'puzzle';
export type Outcome = 'win' | 'loss' | 'draw';

export interface MatchSummary {
  readonly id: string;
  readonly date: number;
  readonly modeId: ModeId | 'puzzle';
  readonly controller: Controller;
  readonly size: number;
  readonly wallsPerPlayer: number;
  readonly timeControlId: string;
  readonly opponentName: string;
  readonly opponentRating: number;
  readonly opponentBot?: string;
  readonly result: Outcome;
  readonly reason: string;
  readonly plies: number;
  readonly durationMs: number;
  readonly wallsPlaced: number;
  readonly ratingBefore: number;
  readonly ratingAfter: number;
  readonly xpEarned: number;
  readonly puzzleId?: string;
}

export interface Settings {
  readonly sound: boolean;
  readonly sfxVolume: number;
  readonly musicVolume: number;
  readonly motion: 'system' | 'on' | 'off';
  readonly theme: 'charcoal' | 'contrast' | 'cool';
}

export const DEFAULT_SETTINGS: Settings = {
  sound: true,
  sfxVolume: 0.6,
  musicVolume: 0.3,
  motion: 'system',
  theme: 'charcoal',
};

export interface Profile {
  readonly version: 1;
  readonly id: string;
  readonly name: string;
  readonly createdAt: number;
  readonly xp: number;
  readonly rating: number;
  readonly bestRating: number;
  readonly matches: number;
  readonly wins: number;
  readonly losses: number;
  readonly draws: number;
  readonly streak: number;
  readonly bestStreak: number;
  readonly playtimeMs: number;
  readonly counters: {
    readonly wallsPlaced: number;
    readonly puzzlesSolved: number;
    readonly puzzlesAttempted: number;
  };
  readonly achievements: Readonly<Record<string, number>>;
  readonly history: readonly MatchSummary[];
  readonly settled: readonly string[];
}

export function defaultProfile(): Profile {
  return {
    version: 1,
    id: createId('player'),
    name: 'Commander',
    createdAt: Date.now(),
    xp: 0,
    rating: 1000,
    bestRating: 1000,
    matches: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    streak: 0,
    bestStreak: 0,
    playtimeMs: 0,
    counters: { wallsPlaced: 0, puzzlesSolved: 0, puzzlesAttempted: 0 },
    achievements: {},
    history: [],
    settled: [],
  };
}

export interface AchievementDef {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly glyph: string;
}

export const ACHIEVEMENTS: readonly AchievementDef[] = [
  { id: 'first-win', name: 'First Victory', description: 'Win your first match.', glyph: '1' },
  { id: 'hot-streak', name: 'Hot Streak', description: 'Win three matches in a row.', glyph: '3' },
  { id: 'regular', name: 'Regular', description: 'Play ten matches.', glyph: '10' },
  { id: 'wall-architect', name: 'Wall Architect', description: 'Place fifty barriers across your matches.', glyph: '50' },
  { id: 'puzzle-solver', name: 'Puzzle Solver', description: 'Solve your first puzzle.', glyph: 'P' },
  { id: 'contender', name: 'Contender', description: 'Reach a rating of 1200.', glyph: '12' },
  { id: 'iron-wall', name: 'Iron Wall', description: 'Win five matches in a row.', glyph: '5' },
  { id: 'veteran', name: 'Veteran', description: 'Play fifty matches.', glyph: 'V' },
];

export function expectedScore(rating: number, opponentRating: number): number {
  return 1 / (1 + 10 ** ((opponentRating - rating) / 400));
}

export function nextRating(rating: number, opponentRating: number, score: 0 | 0.5 | 1, k = 24): number {
  return Math.round(rating + k * (score - expectedScore(rating, opponentRating)));
}

export function levelInfo(xp: number): { level: number; current: number; next: number; progress: number } {
  const level = 1 + Math.floor(Math.sqrt(Math.max(0, xp) / 100));
  const current = 100 * (level - 1) ** 2;
  const next = 100 * level ** 2;
  const span = next - current;
  const progress = span > 0 ? Math.min(1, Math.max(0, (xp - current) / span)) : 0;
  return { level, current, next, progress };
}

export function winRate(profile: Pick<Profile, 'matches' | 'wins'>): number {
  return profile.matches > 0 ? profile.wins / profile.matches : 0;
}

export function favouriteMode(history: readonly MatchSummary[]): { label: string; count: number } | null {
  if (history.length === 0) return null;
  const counts = new Map<string, number>();
  for (const entry of history) {
    const key = String(entry.modeId);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let best = '';
  let bestCount = 0;
  for (const [key, value] of counts) {
    if (value > bestCount) {
      best = key;
      bestCount = value;
    }
  }
  if (!best) return null;
  const label = best === 'puzzle' ? 'Puzzles' : best.charAt(0).toUpperCase() + best.slice(1);
  return { label, count: bestCount };
}

export function personalBest(history: readonly MatchSummary[]): number {
  if (history.length === 0) return 0;
  return Math.max(...history.map((h) => h.durationMs));
}

export function validateName(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed.length < 2) return 'Name must be at least 2 characters.';
  if (trimmed.length > 24) return 'Name must be 24 characters or fewer.';
  if (!/^[\p{L}\p{N} _.-]+$/u.test(trimmed)) return 'Use letters, numbers, spaces, dots, dashes or underscores.';
  return null;
}
