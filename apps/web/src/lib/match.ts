import {
  applyMove,
  createGame,
  declareTimeout,
  passTurn,
  replay,
  timeControlById,
  validateConfig,
  wallPlacementError,
  type BotPersonalityId,
  type GameConfig,
  type GameState,
  type ModeId,
  type Move,
  type Player,
  type TimeControl,
} from '@barricade/engine';
import type { Controller } from './profile.js';
import { createId, loadJSON, removeKey, saveJSON } from './storage.js';

export interface MatchBot {
  readonly personality: BotPersonalityId;
  readonly seed: number;
  readonly name: string;
  readonly rating: number;
}

export interface MatchPuzzle {
  readonly id: string;
  readonly title: string;
  readonly maxBlueMoves: number;
}

export interface ActiveMatch {
  readonly id: string;
  readonly createdAt: number;
  readonly modeId: ModeId | 'puzzle';
  readonly controller: Controller;
  readonly game: GameState;
  readonly initialMs: number;
  readonly incrementMs: number;
  readonly timeControlId: string;
  readonly clocks: Readonly<Record<Player, number>>;
  readonly names: Readonly<Record<Player, string>>;
  readonly bot?: MatchBot;
  readonly allowUndo: boolean;
  readonly undoPlies: number;
  readonly lastTick: number;
  readonly puzzle?: MatchPuzzle;
  readonly failed?: boolean;
}

export interface MatchSetup {
  readonly modeId: ModeId | 'puzzle';
  readonly controller: Controller;
  readonly config: GameConfig;
  readonly timeControlId?: string;
  readonly names: { readonly blue: string; readonly red: string };
  readonly bot?: MatchBot;
  readonly puzzle?: MatchPuzzle;
}

const KEY = 'activeMatch.v1';
const SETUP_KEY = 'lastSetup.v1';

export function timeControlFor(id: string | undefined): TimeControl {
  return timeControlById(id ?? 'unlimited') ?? timeControlById('unlimited')!;
}

export function createMatch(setup: MatchSetup): ActiveMatch {
  const tc = timeControlFor(setup.timeControlId);
  const game = createGame(setup.config);
  const initial = tc.initialMs > 0 ? tc.initialMs : 0;
  saveJSON(SETUP_KEY, setup);
  return {
    id: createId('match'),
    createdAt: Date.now(),
    modeId: setup.modeId,
    controller: setup.controller,
    game,
    initialMs: initial,
    incrementMs: tc.incrementMs,
    timeControlId: tc.id,
    clocks: { blue: initial, red: initial },
    names: setup.names,
    bot: setup.bot,
    allowUndo: true,
    undoPlies: setup.controller === 'bot' ? 2 : 1,
    lastTick: Date.now(),
    puzzle: setup.puzzle,
  };
}

export function clocksRunning(match: ActiveMatch): boolean {
  return match.initialMs > 0 && !match.game.result;
}

/** Deduct real elapsed time from the player on the clock. Server does this online. */
export function tickMatch(match: ActiveMatch, now = Date.now()): ActiveMatch {
  if (!clocksRunning(match)) return match;

  const elapsed = now - match.lastTick;
  if (elapsed < 60) return match;

  const player = match.game.turn;
  const remaining = Math.max(0, (match.clocks[player] ?? 0) - elapsed);
  const clocks = { ...match.clocks, [player]: remaining };
  let game = match.game;
  if (remaining <= 0) {
    game = declareTimeout(game, player);
  }
  return { ...match, clocks, game, lastTick: now };
}

export interface CommitResult {
  readonly match: ActiveMatch;
  readonly error: string | null;
}

export function commitMove(match: ActiveMatch, move: Move, now = Date.now()): CommitResult {
  const applied = applyMove(match.game, move, now);
  if (!applied.ok) return { match, error: applied.error.message };

  const mover = match.game.turn;
  const clocks = { ...match.clocks };
  if (match.initialMs > 0) {
    clocks[mover] = Math.max(0, (clocks[mover] ?? 0) + match.incrementMs);
  }

  return {
    match: {
      ...match,
      game: applied.state,
      clocks,
      lastTick: now,
      failed: false,
    },
    error: null,
  };
}

export function passPuzzleOpponent(match: ActiveMatch): ActiveMatch {
  if (match.controller !== 'puzzle' || match.game.result || match.game.turn !== 'red') return match;
  return { ...match, game: passTurn(match.game) };
}

export function undoMatch(match: ActiveMatch): ActiveMatch {
  if (match.game.result || match.game.history.length === 0) return match;
  const plies = match.undoPlies;
  const keep = Math.max(0, match.game.history.length - plies);
  const moves = match.game.history.slice(0, keep).map((record) => record.move);
  const game = replay(match.game.config, moves);
  return { ...match, game, lastTick: Date.now(), failed: false };
}

export function blueMovesPlayed(match: ActiveMatch): number {
  return match.game.history.filter((record) => record.by === 'blue').length;
}

export function puzzleOutOfBudget(match: ActiveMatch): boolean {
  if (!match.puzzle) return false;
  if (match.game.result?.kind === 'win' && match.game.result.winner === 'blue') return false;
  return blueMovesPlayed(match) >= match.puzzle.maxBlueMoves;
}

export function saveMatch(match: ActiveMatch): void {
  saveJSON(KEY, match);
}

export function loadMatch(): ActiveMatch | null {
  const value = loadJSON<ActiveMatch | null>(KEY, null);
  if (!value || typeof value !== 'object') return null;
  if (!value.game || typeof value.game !== 'object') return null;
  if (!value.game.config || !value.game.pawns) return null;
  if (validateConfig(value.game.config) !== null) return null;
  const size = value.game.config.size;
  for (const pawn of [value.game.pawns.blue, value.game.pawns.red]) {
    if (!pawn || pawn.r < 0 || pawn.r >= size || pawn.c < 0 || pawn.c >= size) return null;
  }
  if (!Array.isArray(value.game.history) || !Array.isArray(value.game.walls)) return null;
  const seen: typeof value.game.walls = [];
  for (const wall of value.game.walls) {
    if (!wall || !['H', 'V'].includes(wall.orientation)) return null;
    if (wallPlacementError(size, seen, wall.orientation, wall.r, wall.c) !== null) return null;
    seen.push(wall);
  }
  return value;
}

export function clearMatch(): void {
  removeKey(KEY);
}

export function loadSetup(): MatchSetup | null {
  const value = loadJSON<MatchSetup | null>(SETUP_KEY, null);
  if (!value || !value.config) return null;
  return value;
}
