import { describe, expect, it } from 'vitest';
import {
  MODES,
  applyMove,
  createPosition,
  legalPawnMoves,
  modeById,
  passTurn,
  shortestPath,
  startPoint,
  toGameConfig,
  validateConfig,
  type GameConfig,
  type GameState,
} from '@barricade/engine';
import {
  PUZZLES,
  createPuzzleMatch,
  dailyPuzzle,
  puzzleBudget,
  puzzleConfig,
} from '../src/lib/puzzles.js';
import {
  blueMovesPlayed,
  commitMove,
  createMatch,
  puzzleOutOfBudget,
  tickMatch,
  undoMatch,
  type ActiveMatch,
} from '../src/lib/match.js';
import { applySummary, buildSummary } from '../src/lib/settle.js';
import { defaultProfile, nextRating, validateName } from '../src/lib/profile.js';

const config: GameConfig = {
  size: 7,
  wallsPerPlayer: 5,
  moveLimit: 240,
  repetitionLimit: 3,
  firstPlayer: 'blue',
};

function names() {
  return { blue: 'Tester', red: 'Rival' };
}

describe('mode configurations', () => {
  it.each(MODES.map((mode) => mode.id))('%s produces a valid engine config', (id) => {
    const mode = modeById(id);
    expect(mode).toBeDefined();
    if (!mode) return;
    expect(validateConfig(toGameConfig(mode))).toBeNull();
  });

  it('keeps ranked barrier stock within the legal wall count', () => {
    for (const mode of MODES) {
      const max = 2 * (mode.arena.size - 1) ** 2;
      expect(mode.arena.wallsPerPlayer).toBeLessThanOrEqual(max);
    }
  });
});

describe('puzzles', () => {
  it('every puzzle has a valid position and a solvable budget', () => {
    for (const puzzle of PUZZLES) {
      const cfg = puzzleConfig(puzzle);
      let state: GameState = createPosition(cfg, {
        walls: puzzle.walls,
        turn: 'blue',
        wallsLeft: { blue: puzzle.wallsPerPlayer, red: 0 },
      });
      const budget = puzzleBudget(puzzle);
      expect(budget).toBeGreaterThan(0);

      expect(shortestPath(cfg.size, state.walls, startPoint('blue', cfg.size), 0).distance).toBeGreaterThan(0);

      let casts = 0;
      while (!state.result && casts <= budget + 1) {
        const options = legalPawnMoves(state)
          .map((to) => ({ to, distance: shortestPath(cfg.size, state.walls, to, 0).distance }))
          .sort((a, b) => a.distance - b.distance);
        const choice = options[0];
        expect(choice).toBeDefined();
        if (!choice) break;
        const applied = applyMove(state, { kind: 'move', to: choice.to });
        expect(applied.ok).toBe(true);
        if (!applied.ok) break;
        state = applied.state;
        casts += 1;
        if (!state.result) state = passTurn(state);
      }

      expect(state.result).toEqual({ kind: 'win', winner: 'blue', reason: 'goal' });
      expect(casts).toBeLessThanOrEqual(budget);
      expect(casts).toBeLessThanOrEqual(puzzleBudget(puzzle));
    }
  });

  it('daily puzzle is stable for a given UTC date', () => {
    const a = dailyPuzzle(new Date('2026-10-26T00:00:00Z'));
    const b = dailyPuzzle(new Date('2026-10-26T23:59:59Z'));
    expect(a.id).toBe(b.id);
  });

  it('creates a puzzle match with unlimited time and a cast budget', () => {
    const match = createPuzzleMatch(PUZZLES[0]!);
    expect(match.controller).toBe('puzzle');
    expect(match.initialMs).toBe(0);
    expect(match.puzzle?.maxBlueMoves).toBe(puzzleBudget(PUZZLES[0]!));
    expect(match.game.pawns.blue.r).toBe(PUZZLES[0]!.size - 1);
  });

  it('marks the budget exceeded only after the final allowed cast', () => {
    const match = createPuzzleMatch(PUZZLES[0]!);
    const budget = match.puzzle!.maxBlueMoves;
    const fakeHistory = Array.from({ length: budget }, (_, index) => ({
      move: { kind: 'move' as const, to: { r: 0, c: 0 } },
      by: 'blue' as const,
      ply: index + 1,
    }));
    const exhausted: ActiveMatch = { ...match, game: { ...match.game, history: fakeHistory } };
    expect(blueMovesPlayed(exhausted)).toBe(budget);
    expect(puzzleOutOfBudget(exhausted)).toBe(true);

    const won: ActiveMatch = {
      ...exhausted,
      game: { ...exhausted.game, result: { kind: 'win', winner: 'blue', reason: 'goal' } },
    };
    expect(puzzleOutOfBudget(won)).toBe(false);
  });
});

describe('local clocks', () => {
  it('expires a player clock and declares a timeout win for the opponent', () => {
    const match = createMatch({
      modeId: 'sprint',
      controller: 'local',
      config,
      timeControlId: 'bullet',
      names: names(),
    });
    expect(match.initialMs).toBe(15_000);
    const stale: ActiveMatch = { ...match, lastTick: Date.now() - 20_000 };
    const ticked = tickMatch(stale);
    expect(ticked.clocks.blue).toBe(0);
    expect(ticked.game.result).toEqual({ kind: 'win', winner: 'red', reason: 'timeout' });
  });

  it('adds increment to the player who moved', () => {
    const match = createMatch({
      modeId: 'dash',
      controller: 'local',
      config,
      timeControlId: 'dash-tc',
      names: names(),
    });
    expect(match.incrementMs).toBe(1000);
    const applied = commitMove(match, { kind: 'move', to: { r: 5, c: 3 } });
    expect(applied.error).toBeNull();
    expect(applied.match.clocks.blue).toBe(match.initialMs + 1000);
    expect(applied.match.game.turn).toBe('red');
  });

  it('does not tick when the clock is unlimited', () => {
    const match = createMatch({
      modeId: 'custom',
      controller: 'local',
      config,
      timeControlId: 'unlimited',
      names: names(),
    });
    const stale = { ...match, lastTick: Date.now() - 60_000 };
    const ticked = tickMatch(stale);
    expect(ticked).toBe(stale);
  });

  it('rejects duplicate move application by ply/turn', () => {
    const match = createMatch({ modeId: 'dash', controller: 'local', config, timeControlId: 'dash-tc', names: names() });
    const first = commitMove(match, { kind: 'move', to: { r: 5, c: 3 } });
    expect(first.error).toBeNull();
    const duplicate = commitMove(first.match, { kind: 'move', to: { r: 5, c: 3 } });
    expect(duplicate.error).not.toBeNull();
  });
});

describe('undo and settlement', () => {
  it('undoes a player and bot reply', () => {
    const match = createMatch({
      modeId: 'dash',
      controller: 'bot',
      config,
      timeControlId: 'dash-tc',
      names: names(),
      bot: { personality: 'casual', seed: 7, name: 'Pip', rating: 1000 },
    });
    const one = commitMove(match, { kind: 'move', to: { r: 5, c: 3 } }).match;
    const two = commitMove(one, { kind: 'move', to: { r: 1, c: 3 } }).match;
    expect(two.game.history).toHaveLength(2);
    const rewound = undoMatch(two);
    expect(rewound.game.history).toHaveLength(0);
    expect(rewound.game.turn).toBe('blue');
  });

  it('settles a match exactly once and applies Elo', () => {
    const base = createMatch({
      modeId: 'dash',
      controller: 'bot',
      config,
      timeControlId: 'dash-tc',
      names: names(),
      bot: { personality: 'intermediate', seed: 1, name: 'Kestrel', rating: 1200 },
    });
    const finished: ActiveMatch = {
      ...base,
      createdAt: Date.now() - 120_000,
      game: { ...base.game, result: { kind: 'win', winner: 'blue', reason: 'goal' }, ply: 12 },
    };

    const profile = defaultProfile();
    const summary = buildSummary(finished, profile);
    expect(summary.result).toBe('win');
    expect(summary.timeControlId).toBe('dash-tc');
    expect(summary.ratingAfter).toBeGreaterThan(profile.rating);
    expect(summary.xpEarned).toBe(120);

    const once = applySummary(profile, summary);
    const twice = applySummary(once, summary);
    expect(once.matches).toBe(1);
    expect(once.wins).toBe(1);
    expect(once.rating).toBe(summary.ratingAfter);
    expect(once.achievements['first-win']).toBeTypeOf('number');
    expect(twice).toBe(once);
  });

  it('does not change rating for local or puzzle matches', () => {
    const base = createMatch({ modeId: 'dash', controller: 'local', config, timeControlId: 'unlimited', names: names() });
    const finished: ActiveMatch = {
      ...base,
      game: { ...base.game, result: { kind: 'win', winner: 'blue', reason: 'goal' }, ply: 9 },
    };
    const profile = defaultProfile();
    const summary = buildSummary(finished, profile);
    expect(summary.ratingAfter).toBe(profile.rating);
  });

  it('computes standard Elo values', () => {
    expect(nextRating(1000, 1000, 1)).toBe(1012);
    expect(nextRating(1000, 1000, 0.5)).toBe(1000);
    expect(nextRating(1200, 1000, 0)).toBeLessThan(1200);
  });
});

describe('profile validation', () => {
  it('accepts safe display names and rejects the rest', () => {
    expect(validateName('Commander')).toBeNull();
    expect(validateName('Blue Fox_7')).toBeNull();
    expect(validateName('A')).toMatch(/at least/);
    expect(validateName('<script>')).toMatch(/Use letters/);
    expect(validateName('x'.repeat(30))).toMatch(/24/);
  });
});
