import { describe, expect, it } from 'vitest';
import {
  agreeDraw,
  applyMove,
  createGame,
  createPosition,
  declareTimeout,
  deserializeGame,
  distanceToGoal,
  legalMoves,
  legalPawnMoves,
  legalWallMoves,
  passTurn,
  positionKey,
  replay,
  resign,
  serializeGame,
  shortestPath,
  undo,
  validateConfig,
  type GameState,
  type Move,
  type Player,
  type Point,
} from '../src/index.js';

function blank(size = 5, wallsPerPlayer = 10): GameState {
  return createGame({ size, wallsPerPlayer, moveLimit: 0, repetitionLimit: 0 });
}

function withPawns(state: GameState, blue: Point, red: Point, turn: Player = 'blue'): GameState {
  return { ...state, pawns: { blue, red }, turn };
}

function playAll(state: GameState, moves: readonly Move[]): GameState {
  let current = state;
  for (const move of moves) {
    const applied = applyMove(current, move);
    if (!applied.ok) {
      throw new Error(`Unexpected rejection at ply ${current.ply + 1}: ${applied.error.code} ${applied.error.message}`);
    }
    current = applied.state;
  }
  return current;
}

const up = (state: GameState): Move => {
  const p = state.pawns[state.turn];
  return { kind: 'move', to: { r: p.r - 1, c: p.c } };
};
const down = (state: GameState): Move => {
  const p = state.pawns[state.turn];
  return { kind: 'move', to: { r: p.r + 1, c: p.c } };
};

describe('setup', () => {
  it('creates the default 9×9 game with 10 barriers each', () => {
    const game = createGame();
    expect(game.config.size).toBe(9);
    expect(game.pawns.blue).toEqual({ r: 8, c: 4 });
    expect(game.pawns.red).toEqual({ r: 0, c: 4 });
    expect(game.wallsLeft).toEqual({ blue: 10, red: 10 });
    expect(game.turn).toBe('blue');
    expect(game.result).toBeNull();
    expect(game.walls).toHaveLength(0);
  });

  it('supports every advertised board size', () => {
    for (const size of [5, 7, 9, 11, 13, 15]) {
      const game = createGame({ size });
      expect(game.pawns.blue.r).toBe(size - 1);
      expect(game.pawns.red.r).toBe(0);
      expect(game.config.size).toBe(size);
    }
  });

  it('rejects impossible configurations', () => {
    expect(() => createGame({ size: 4 })).toThrow(/Invalid game config/);
    expect(() => createGame({ size: 16 })).toThrow(/Invalid game config/);
    expect(() => createGame({ wallsPerPlayer: -1 })).toThrow(/Invalid game config/);
    expect(() => createGame({ wallsPerPlayer: 10_000 })).toThrow(/Invalid game config/);
    expect(() => createGame({ moveLimit: -5 })).toThrow(/Invalid game config/);
    expect(validateConfig({ size: 9, wallsPerPlayer: 10, moveLimit: 0, firstPlayer: 'blue', repetitionLimit: 0 })).toBeNull();
  });
});

describe('pawn movement', () => {
  it('allows orthogonal moves but never diagonals when alone', () => {
    const state = withPawns(blank(), { r: 2, c: 2 }, { r: 0, c: 0 });
    const moves = legalPawnMoves(state);
    expect(moves).toEqual(
      expect.arrayContaining([
        { r: 1, c: 2 },
        { r: 3, c: 2 },
        { r: 2, c: 1 },
        { r: 2, c: 3 },
      ]),
    );
    expect(moves).toHaveLength(4);
  });

  it('rejects out-of-bounds movement', () => {
    const state = withPawns(blank(), { r: 0, c: 0 }, { r: 4, c: 4 }, 'blue');
    const result = applyMove(state, { kind: 'move', to: { r: -1, c: 0 } });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('OUT_OF_BOUNDS');
  });

  it('rejects moving onto the opponent square', () => {
    const state = withPawns(blank(), { r: 2, c: 2 }, { r: 1, c: 2 });
    const result = applyMove(state, { kind: 'move', to: { r: 1, c: 2 } });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('OCCUPIED');
  });

  it('rejects staying in place', () => {
    const state = withPawns(blank(), { r: 2, c: 2 }, { r: 0, c: 0 });
    const result = applyMove(state, { kind: 'move', to: { r: 2, c: 2 } });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('ILLEGAL_MOVE');
  });

  it('jumps straight over an adjacent opponent', () => {
    const state = withPawns(blank(), { r: 2, c: 2 }, { r: 1, c: 2 });
    const moves = legalPawnMoves(state);
    expect(moves).toContainEqual({ r: 0, c: 2 });
    expect(moves).not.toContainEqual({ r: 1, c: 2 });
  });

  it('jumps diagonally when the straight landing is off the board', () => {
    const state = withPawns(blank(), { r: 3, c: 1 }, { r: 3, c: 0 });
    const moves = legalPawnMoves(state);
    expect(moves).toContainEqual({ r: 2, c: 0 });
    expect(moves).toContainEqual({ r: 4, c: 0 });
    expect(moves).not.toContainEqual({ r: 3, c: -1 });
  });

  it('jumps diagonally when the straight landing is blocked by a wall', () => {
    const base = withPawns(blank(), { r: 2, c: 2 }, { r: 1, c: 2 });
    const state: GameState = {
      ...base,
      walls: [{ orientation: 'H', r: 0, c: 1, owner: 'red' }],
    };
    const moves = legalPawnMoves(state);
    expect(moves).not.toContainEqual({ r: 0, c: 2 });
    expect(moves).toContainEqual({ r: 1, c: 1 });
    expect(moves).toContainEqual({ r: 1, c: 3 });
  });

  it('cannot jump through a wall between the pawns', () => {
    const base = withPawns(blank(), { r: 2, c: 2 }, { r: 1, c: 2 });
    const state: GameState = {
      ...base,
      walls: [{ orientation: 'H', r: 1, c: 2, owner: 'red' }],
    };
    expect(legalPawnMoves(state)).not.toContainEqual({ r: 0, c: 2 });
  });

  it('blocks vertical movement through a horizontal barrier', () => {
    const walled = playAll(blank(), [{ kind: 'wall', orientation: 'H', r: 3, c: 2 }]);
    const state = { ...walled, turn: 'blue' as Player };
    expect(legalPawnMoves(state)).not.toContainEqual({ r: 3, c: 2 });
  });

  it('blocks horizontal movement through a vertical barrier', () => {
    const walled = playAll(blank(), [{ kind: 'wall', orientation: 'V', r: 3, c: 1 }]);
    const state = { ...walled, turn: 'blue' as Player };
    expect(legalPawnMoves(state)).not.toContainEqual({ r: 4, c: 1 });
  });
});

describe('barrier placement', () => {
  it('decrements the placing player’s stock', () => {
    const state = playAll(blank(), [{ kind: 'wall', orientation: 'H', r: 2, c: 2 }]);
    expect(state.wallsLeft.blue).toBe(9);
    expect(state.wallsLeft.red).toBe(10);
    expect(state.walls).toHaveLength(1);
    expect(state.turn).toBe('red');
  });

  it('rejects barriers outside the board', () => {
    const state = blank();
    const result = applyMove(state, { kind: 'wall', orientation: 'H', r: 4, c: 0 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('WALL_OUT_OF_BOUNDS');
  });

  it('rejects overlapping barriers', () => {
    const state = playAll(blank(), [{ kind: 'wall', orientation: 'H', r: 2, c: 2 }]);
    const result = applyMove(state, { kind: 'wall', orientation: 'H', r: 2, c: 2 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('WALL_OVERLAP');
  });

  it('rejects collinear barriers that overlap by one segment', () => {
    const state = playAll(blank(9), [{ kind: 'wall', orientation: 'H', r: 2, c: 2 }]);
    const adjacent = applyMove(state, { kind: 'wall', orientation: 'H', r: 2, c: 3 });
    expect(adjacent.ok).toBe(false);
    if (!adjacent.ok) expect(adjacent.error.code).toBe('WALL_OVERLAP');
    const spaced = applyMove(state, { kind: 'wall', orientation: 'H', r: 2, c: 4 });
    expect(spaced.ok).toBe(true);
  });

  it('rejects vertical barriers that overlap by one segment', () => {
    const state = playAll(blank(), [{ kind: 'wall', orientation: 'V', r: 2, c: 2 }]);
    const adjacent = applyMove(state, { kind: 'wall', orientation: 'V', r: 3, c: 2 });
    expect(adjacent.ok).toBe(false);
    if (!adjacent.ok) expect(adjacent.error.code).toBe('WALL_OVERLAP');
  });

  it('rejects crossing barriers', () => {
    const state = playAll(blank(), [{ kind: 'wall', orientation: 'H', r: 2, c: 2 }]);
    const result = applyMove(state, { kind: 'wall', orientation: 'V', r: 2, c: 2 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('WALL_CROSSING');
  });

  it('rejects barriers that seal off Blue', () => {
    const state = playAll(blank(), [
      { kind: 'wall', orientation: 'V', r: 3, c: 1 },
      { kind: 'wall', orientation: 'V', r: 3, c: 2 },
    ]);
    expect(state.turn).toBe('blue');
    const result = applyMove(state, { kind: 'wall', orientation: 'H', r: 2, c: 1 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('ROUTE_BLOCKED');
  });

  it('rejects barriers that seal off Red', () => {
    const state = playAll(blank(), [
      { kind: 'wall', orientation: 'V', r: 0, c: 1 },
      { kind: 'wall', orientation: 'V', r: 0, c: 2 },
    ]);
    expect(state.turn).toBe('blue');
    const result = applyMove(state, { kind: 'wall', orientation: 'H', r: 1, c: 1 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('ROUTE_BLOCKED');
  });

  it('omits route-sealing placements from the legal wall list', () => {
    const state = playAll(blank(), [
      { kind: 'wall', orientation: 'V', r: 3, c: 1 },
      { kind: 'wall', orientation: 'V', r: 3, c: 2 },
    ]);
    const walls = legalWallMoves(state);
    expect(walls).not.toContainEqual(expect.objectContaining({ orientation: 'H', r: 2, c: 1 }));
  });

  it('rejects wall placement with no inventory left', () => {
    const state = blank(5, 0);
    const result = applyMove(state, { kind: 'wall', orientation: 'H', r: 2, c: 2 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('NO_WALLS_LEFT');
    expect(legalWallMoves(state)).toHaveLength(0);
  });
});

describe('reachability', () => {
  it('returns a shortest path and distance', () => {
    const game = createGame({ size: 5, wallsPerPlayer: 10, moveLimit: 0, repetitionLimit: 0 });
    const reach = shortestPath(game.config.size, [], game.pawns.blue, 0);
    expect(reach.distance).toBe(4);
    expect(reach.path[0]).toEqual({ r: 4, c: 2 });
    expect(reach.path.at(-1)).toEqual({ r: 0, c: 2 });
  });

  it('returns -1 when a pawn is walled in', () => {
    const walls = [
      { orientation: 'H' as const, r: 3, c: 2, owner: 'red' as Player },
      { orientation: 'H' as const, r: 3, c: 1, owner: 'red' as Player },
      { orientation: 'V' as const, r: 3, c: 1, owner: 'red' as Player },
      { orientation: 'V' as const, r: 3, c: 2, owner: 'red' as Player },
    ];
    const reach = shortestPath(5, walls, { r: 4, c: 2 }, 0);
    expect(reach.distance).toBe(-1);
    expect(reach.path).toHaveLength(0);
  });

  it('reports distance to goal from the live state', () => {
    const game = createGame({ size: 7, wallsPerPlayer: 10, moveLimit: 0, repetitionLimit: 0 });
    expect(distanceToGoal(game, 'blue')).toBe(6);
    expect(distanceToGoal(game, 'red')).toBe(6);
  });
});

describe('win, draw and termination', () => {
  it('detects a win when reaching the far row', () => {
    const state = playAll(blank(), [
      { kind: 'move', to: { r: 4, c: 1 } },
      { kind: 'move', to: { r: 1, c: 2 } },
      { kind: 'move', to: { r: 3, c: 1 } },
      { kind: 'move', to: { r: 1, c: 3 } },
      { kind: 'move', to: { r: 2, c: 1 } },
      { kind: 'move', to: { r: 2, c: 3 } },
      { kind: 'move', to: { r: 1, c: 1 } },
      { kind: 'move', to: { r: 3, c: 3 } },
      { kind: 'move', to: { r: 0, c: 1 } },
    ]);
    expect(state.result).toEqual({ kind: 'win', winner: 'blue', reason: 'goal' });
  });

  it('rejects moves after the match ended', () => {
    const won = playAll(blank(), [
      { kind: 'move', to: { r: 4, c: 1 } },
      { kind: 'move', to: { r: 1, c: 2 } },
      { kind: 'move', to: { r: 3, c: 1 } },
      { kind: 'move', to: { r: 1, c: 3 } },
      { kind: 'move', to: { r: 2, c: 1 } },
      { kind: 'move', to: { r: 2, c: 3 } },
      { kind: 'move', to: { r: 1, c: 1 } },
      { kind: 'move', to: { r: 3, c: 3 } },
      { kind: 'move', to: { r: 0, c: 1 } },
    ]);
    const result = applyMove(won, { kind: 'move', to: { r: 4, c: 4 } });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('GAME_OVER');
    expect(legalMoves(won)).toHaveLength(0);
  });

  it('rejects duplicate move submission', () => {
    const first = playAll(blank(), [{ kind: 'move', to: { r: 3, c: 2 } }]);
    const duplicate = applyMove(first, { kind: 'move', to: { r: 3, c: 2 } });
    expect(duplicate.ok).toBe(false);
  });

  it('draws on the configured move limit', () => {
    const state = playAll(createGame({ size: 5, wallsPerPlayer: 10, moveLimit: 4, repetitionLimit: 0 }), [
      { kind: 'move', to: { r: 3, c: 2 } },
      { kind: 'move', to: { r: 1, c: 2 } },
      { kind: 'move', to: { r: 4, c: 2 } },
      { kind: 'move', to: { r: 0, c: 2 } },
    ]);
    expect(state.result).toEqual({ kind: 'draw', reason: 'move-limit' });
  });

  it('draws on threefold-style repetition', () => {
    const state = playAll(createGame({ size: 5, wallsPerPlayer: 10, moveLimit: 0, repetitionLimit: 2 }), [
      { kind: 'move', to: { r: 3, c: 2 } },
      { kind: 'move', to: { r: 1, c: 2 } },
      { kind: 'move', to: { r: 4, c: 2 } },
      { kind: 'move', to: { r: 0, c: 2 } },
    ]);
    expect(state.result).toEqual({ kind: 'draw', reason: 'repetition' });
  });

  it('handles resignation', () => {
    const state = resign(createGame(), 'blue');
    expect(state.result).toEqual({ kind: 'win', winner: 'red', reason: 'resign' });
    expect(resign(state, 'red')).toBe(state);
  });

  it('handles clock timeout separately from resignation', () => {
    const state = declareTimeout(createGame(), 'red');
    expect(state.result).toEqual({ kind: 'win', winner: 'blue', reason: 'timeout' });
  });

  it('handles agreed draws', () => {
    const state = agreeDraw(createGame());
    expect(state.result).toEqual({ kind: 'draw', reason: 'agreement' });
  });
});

describe('history, undo and replay', () => {
  const moves: Move[] = [
    { kind: 'wall', orientation: 'H', r: 6, c: 3 },
    { kind: 'move', to: { r: 1, c: 4 } },
    { kind: 'move', to: { r: 7, c: 4 } },
    { kind: 'wall', orientation: 'V', r: 5, c: 2 },
  ];

  it('records every move with turn and ply', () => {
    const state = playAll(createGame({ size: 9, wallsPerPlayer: 10, moveLimit: 0, repetitionLimit: 0 }), moves);
    expect(state.history).toHaveLength(4);
    expect(state.history[0]).toMatchObject({ by: 'blue', ply: 1 });
    expect(state.history[1]).toMatchObject({ by: 'red', ply: 2 });
    expect(state.lastMove?.move).toEqual(moves[3]);
  });

  it('replays deterministically', () => {
    const config = { size: 9, wallsPerPlayer: 10, moveLimit: 0, repetitionLimit: 0 };
    const a = replay(config, moves);
    const b = replay(config, moves);
    expect(serializeGame(a)).toBe(serializeGame(b));
    expect(positionKey(a)).toBe(positionKey(b));
  });

  it('rejects an illegal move during replay', () => {
    expect(() =>
      replay({ size: 9 }, [
        { kind: 'move', to: { r: 8, c: 3 } },
        { kind: 'move', to: { r: 8, c: 3 } },
      ]),
    ).toThrow(/Replay diverged/);
  });

  it('undoes the requested number of plies', () => {
    const state = playAll(createGame({ size: 9, wallsPerPlayer: 10, moveLimit: 0, repetitionLimit: 0 }), moves);
    const rewound = undo(state, 1);
    expect(rewound.history).toHaveLength(3);
    expect(rewound.turn).toBe('red');
    expect(rewound.wallsLeft.red).toBe(10);
    expect(positionKey(rewound)).toBe(positionKey(replay(state.config, moves.slice(0, 3))));
  });

  it('round-trips serialization and preserves explicit results', () => {
    const state = playAll(createGame({ size: 9, wallsPerPlayer: 10, moveLimit: 0, repetitionLimit: 0 }), moves);
    const restored = deserializeGame(serializeGame(state));
    expect(positionKey(restored)).toBe(positionKey(state));

    const resigned = resign(state, 'blue');
    const restoredResigned = deserializeGame(serializeGame(resigned));
    expect(restoredResigned.result).toEqual(resigned.result);
  });
});

describe('turn integrity', () => {
  it('alternates turns and never lets the same player move twice', () => {
    let state = blank();
    expect(state.turn).toBe('blue');
    state = playAll(state, [{ kind: 'move', to: { r: 3, c: 2 } }]);
    expect(state.turn).toBe('red');
    const rejected = applyMove(state, up(state));
    expect(rejected.ok).toBe(false);
  });

  it('accepts a down move helper for red', () => {
    const state = playAll(blank(), [{ kind: 'move', to: { r: 3, c: 2 } }]);
    const applied = applyMove(state, down(state));
    expect(applied.ok).toBe(true);
    if (applied.ok) expect(applied.state.pawns.red.r).toBe(1);
  });
});

describe('custom positions and puzzle helpers', () => {
  it('builds a validated position with pre-placed walls', () => {
    const state = createPosition(
      { size: 7, wallsPerPlayer: 5, moveLimit: 0, repetitionLimit: 0 },
      {
        walls: [
          { orientation: 'H', r: 3, c: 2, owner: 'red' },
          { orientation: 'H', r: 3, c: 4, owner: 'red' },
        ],
      },
    );
    expect(state.walls).toHaveLength(2);
    expect(state.wallsLeft).toEqual({ blue: 5, red: 3 });
    expect(shortestPath(7, state.walls, state.pawns.blue, 0).distance).toBeGreaterThan(0);
  });

  it('rejects positions with no route or invalid walls', () => {
    expect(() =>
      createPosition(
        { size: 7, wallsPerPlayer: 10 },
        {
          walls: [
            { orientation: 'H', r: 2, c: 2, owner: 'blue' },
            { orientation: 'H', r: 2, c: 2, owner: 'red' },
          ],
        },
      ),
    ).toThrow(/Invalid position/);

    expect(() =>
      createPosition({ size: 7, wallsPerPlayer: 0 }, { pawns: { blue: { r: 6, c: 3 }, red: { r: 6, c: 3 } } }),
    ).toThrow(/Invalid position/);
  });

  it('passes the turn for solo puzzle modes without recording a move', () => {
    const state = createGame({ size: 7, wallsPerPlayer: 5, moveLimit: 0, repetitionLimit: 0 });
    const passed = passTurn(state);
    expect(passed.turn).toBe('red');
    expect(passed.ply).toBe(0);
    expect(passed.history).toHaveLength(0);
    expect(passTurn(passed).turn).toBe('blue');
  });
});
