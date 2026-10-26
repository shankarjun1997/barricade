import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { GameConfig, GameResult, GameState, ModeId } from '@barricade/engine';
import type { RoomVisibility } from '@barricade/protocol';

export interface PersistedPlayer {
  readonly id: string;
  readonly name: string;
  readonly tokenHash: string;
  readonly rating: number;
  readonly wins: number;
  readonly losses: number;
  readonly draws: number;
  readonly createdAt: number;
}

export interface PersistedRoom {
  readonly code: string;
  readonly hostId: string;
  readonly guestId: string | null;
  readonly modeId: ModeId;
  readonly timeControlId: string;
  readonly config: GameConfig;
  readonly visibility: RoomVisibility;
  readonly status: 'waiting' | 'playing' | 'finished';
  readonly createdAt: number;
  readonly matchId: string | null;
}

export interface PersistedMatch {
  readonly id: string;
  readonly roomCode: string | null;
  readonly modeId: ModeId;
  readonly timeControlId: string;
  readonly config: GameConfig;
  readonly game: GameState;
  readonly blueId: string;
  readonly redId: string;
  readonly clocks: { readonly blue: number; readonly red: number };
  readonly initialMs: number;
  readonly incrementMs: number;
  readonly turnStartedAt: number;
  readonly status: 'active' | 'finished';
  readonly result: GameResult | null;
  readonly endReason: string | null;
  readonly ratingChanges: { readonly blue: number; readonly red: number } | null;
  readonly createdAt: number;
  readonly finishedAt: number | null;
  readonly lastMoveIds: { readonly blue?: string; readonly red?: string };
}

export interface PersistedState {
  readonly version: 1;
  readonly savedAt: number;
  readonly players: readonly PersistedPlayer[];
  readonly rooms: readonly PersistedRoom[];
  readonly matches: readonly PersistedMatch[];
}

/** Tiny JSON store. Swap for PostgreSQL behind the same interface when scaling. */
export class Store {
  constructor(private readonly path: string | null) {}

  load(): PersistedState | null {
    if (!this.path) return null;
    try {
      const raw = readFileSync(this.path, 'utf8');
      const parsed = JSON.parse(raw) as PersistedState;
      if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.players)) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  save(state: PersistedState): void {
    if (!this.path) return;
    try {
      mkdirSync(dirname(this.path), { recursive: true });
      const tmp = `${this.path}.tmp`;
      writeFileSync(tmp, JSON.stringify(state), 'utf8');
      renameSync(tmp, this.path);
    } catch {
      // Persistence must never take the game server down.
    }
  }
}
