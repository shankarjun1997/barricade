import { type ActiveMatch } from './match.js';
import {
  nextRating,
  type MatchSummary,
  type Outcome,
  type Profile,
} from './profile.js';
import { loadJSON, saveJSON } from './storage.js';

export const RESULT_KEY = 'lastResult.v1';

export function buildSummary(match: ActiveMatch, profile: Profile): MatchSummary {
  const durationMs = Math.max(1000, Math.min(Date.now() - match.createdAt, 6 * 60 * 60 * 1000));
  const wallsPlaced = match.game.history.filter((record) => record.move.kind === 'wall').length;

  let outcome: Outcome = 'draw';
  let reason = 'agreement';

  if (match.failed) {
    outcome = 'loss';
    reason = 'budget';
  } else if (match.game.result) {
    reason = match.game.result.reason;
    if (match.game.result.kind === 'draw') {
      outcome = 'draw';
    } else {
      outcome = match.game.result.winner === 'blue' ? 'win' : 'loss';
    }
  }

  const rated = match.controller === 'bot' && Boolean(match.bot);
  const opponentRating = match.bot?.rating ?? profile.rating;
  const ratingAfter = rated
    ? nextRating(profile.rating, opponentRating, outcome === 'win' ? 1 : outcome === 'loss' ? 0 : 0.5)
    : profile.rating;

  let xpEarned = 0;
  if (match.controller === 'puzzle') {
    xpEarned = outcome === 'win' ? 100 : 20;
  } else if (outcome === 'win') {
    xpEarned = match.controller === 'bot' ? 120 : 80;
  } else if (outcome === 'draw') {
    xpEarned = 60;
  } else {
    xpEarned = 40;
  }

  return {
    id: match.id,
    date: Date.now(),
    modeId: match.modeId,
    controller: match.controller,
    size: match.game.config.size,
    wallsPerPlayer: match.game.config.wallsPerPlayer,
    timeControlId: match.timeControlId,
    opponentName: match.names.red,
    opponentRating,
    ...(match.bot ? { opponentBot: match.bot.personality } : {}),
    result: outcome,
    reason,
    plies: match.game.ply,
    durationMs,
    wallsPlaced,
    ratingBefore: profile.rating,
    ratingAfter,
    xpEarned,
    ...(match.puzzle ? { puzzleId: match.puzzle.id } : {}),
  };
}

export function applySummary(profile: Profile, summary: MatchSummary): Profile {
  if (profile.settled.includes(summary.id)) return profile;

  const wins = profile.wins + (summary.result === 'win' ? 1 : 0);
  const losses = profile.losses + (summary.result === 'loss' ? 1 : 0);
  const draws = profile.draws + (summary.result === 'draw' ? 1 : 0);
  const streak = summary.result === 'win' ? profile.streak + 1 : summary.result === 'loss' ? 0 : profile.streak;

  const next: Profile = {
    ...profile,
    xp: profile.xp + summary.xpEarned,
    rating: summary.ratingAfter,
    bestRating: Math.max(profile.bestRating, summary.ratingAfter),
    matches: profile.matches + 1,
    wins,
    losses,
    draws,
    streak,
    bestStreak: Math.max(profile.bestStreak, streak),
    playtimeMs: profile.playtimeMs + summary.durationMs,
    counters: {
      wallsPlaced: profile.counters.wallsPlaced + summary.wallsPlaced,
      puzzlesSolved: profile.counters.puzzlesSolved + (summary.controller === 'puzzle' && summary.result === 'win' ? 1 : 0),
      puzzlesAttempted: profile.counters.puzzlesAttempted + (summary.controller === 'puzzle' ? 1 : 0),
    },
    history: [summary, ...profile.history].slice(0, 100),
    settled: [...profile.settled, summary.id].slice(-300),
  };

  return { ...next, achievements: evaluateAchievements(next) };
}

export function evaluateAchievements(profile: Profile): Record<string, number> {
  const unlocked: Record<string, number> = { ...profile.achievements };
  const stamp = Date.now();
  const unlock = (id: string, condition: boolean) => {
    if (condition && unlocked[id] === undefined) unlocked[id] = stamp;
  };

  unlock('first-win', profile.wins >= 1);
  unlock('hot-streak', profile.bestStreak >= 3);
  unlock('regular', profile.matches >= 10);
  unlock('wall-architect', profile.counters.wallsPlaced >= 50);
  unlock('puzzle-solver', profile.counters.puzzlesSolved >= 1);
  unlock('contender', profile.rating >= 1200);
  unlock('iron-wall', profile.bestStreak >= 5);
  unlock('veteran', profile.matches >= 50);

  return unlocked;
}

export function saveLastResult(summary: MatchSummary): void {
  saveJSON(RESULT_KEY, summary);
}

export function loadLastResult(): MatchSummary | null {
  return loadJSON<MatchSummary | null>(RESULT_KEY, null);
}
