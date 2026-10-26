import { describe, expect, it } from 'vitest';
import {
  applyMove,
  createGame,
  createPosition,
  isGameOver,
  legalMoves,
  type GameConfig,
  type GameState,
  type Move,
} from '@barricade/engine';
import { BOT_PROFILES, chooseBotMove, evaluate, mulberry32 } from '../src/index.js';

const personalities = [
  'beginner',
  'casual',
  'intermediate',
  'advanced',
  'expert',
  'defensive',
  'aggressive',
  'unpredictable',
] as const;

function config(overrides: Partial<GameConfig> = {}): GameConfig {
  return {
    size: 7,
    wallsPerPlayer: 5,
    moveLimit: 120,
    repetitionLimit: 3,
    firstPlayer: 'blue',
    ...overrides,
  };
}

function sameMove(a: Move, b: Move): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'move' && b.kind === 'move') return a.to.r === b.to.r && a.to.c === b.to.c;
  if (a.kind === 'wall' && b.kind === 'wall') {
    return a.orientation === b.orientation && a.r === b.r && a.c === b.c;
  }
  return false;
}

describe('bot engine', () => {
  it('exposes a profile for every personality', () => {
    expect(Object.keys(BOT_PROFILES).sort()).toEqual([...personalities].sort());
  });

  it.each(personalities)('%s returns a legal move from the opening position', (personality) => {
    const state = createGame(config());
    const move = chooseBotMove(state, { personality, seed: 7 });
    expect(move).not.toBeNull();
    expect(legalMoves(state).some((m) => sameMove(m, move as Move))).toBe(true);
  });

  it('is deterministic for a fixed seed', () => {
    const state = createGame(config());
    for (const personality of personalities) {
      const a = chooseBotMove(state, { personality, seed: 99 });
      const b = chooseBotMove(state, { personality, seed: 99 });
      expect(a).toEqual(b);
    }
  });

  it('takes an immediate winning move', () => {
    const state = createPosition(config(), {
      pawns: { blue: { r: 1, c: 3 }, red: { r: 6, c: 1 } },
      walls: [],
      turn: 'blue',
    });
    const move = chooseBotMove(state, { personality: 'beginner', seed: 1 });
    expect(move).toEqual({ kind: 'move', to: { r: 0, c: 3 } });
    const applied = applyMove(state, move as Move);
    expect(applied.ok).toBe(true);
    if (applied.ok) expect(applied.state.result).toEqual({ kind: 'win', winner: 'blue', reason: 'goal' });
  });

  it('returns null once the game is over', () => {
    const base = createGame(config());
    const finished: GameState = {
      ...base,
      result: { kind: 'win', winner: 'blue', reason: 'resign' },
    };
    expect(chooseBotMove(finished)).toBeNull();
  });

  it('never produces an illegal move across a full self-play game', () => {
    let state = createGame(config({ moveLimit: 160 }));
    let guard = 0;
    while (!isGameOver(state) && guard < 400) {
      const personality = personalities[guard % personalities.length] ?? 'casual';
      const move = chooseBotMove(state, { personality, seed: 1000 + guard });
      expect(move).not.toBeNull();
      const applied = applyMove(state, move as Move);
      expect(applied.ok).toBe(true);
      if (!applied.ok) break;
      state = applied.state;
      guard++;
    }
    expect(isGameOver(state)).toBe(true);
  }, 30_000);

  it('prefers faster wins when evaluating positions', () => {
    const base = createPosition(config(), {
      pawns: { blue: { r: 1, c: 3 }, red: { r: 6, c: 1 } },
      turn: 'blue',
    });
    const profile = BOT_PROFILES.expert;
    const winning = applyMove(base, { kind: 'move', to: { r: 0, c: 3 } });
    expect(winning.ok).toBe(true);
    if (!winning.ok) return;
    expect(evaluate(winning.state, 'blue', profile)).toBeGreaterThan(500_000);
    expect(evaluate(base, 'blue', profile)).toBeGreaterThan(-500_000);
  });

  it('seeded PRNG stays in [0, 1) and repeats', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 100; i++) {
      const value = a();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
      expect(value).toBe(b());
    }
  });
});
