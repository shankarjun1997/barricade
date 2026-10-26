import type { GameConfig } from './types.js';

export interface TimeControl {
  readonly id: string;
  readonly label: string;
  readonly initialMs: number;
  readonly incrementMs: number;
  readonly description: string;
  /** 0 = no clock (Unlimited). */
  readonly ranked: boolean;
}

export const TIME_CONTROLS: readonly TimeControl[] = [
  { id: 'bullet', label: 'Bullet', initialMs: 15_000, incrementMs: 0, description: '15 seconds each. Pure nerve.', ranked: true },
  { id: 'blitz', label: 'Blitz', initialMs: 30_000, incrementMs: 0, description: '30 seconds each. Fast and sharp.', ranked: true },
  { id: 'sprint-tc', label: 'Sprint', initialMs: 60_000, incrementMs: 0, description: '1 minute each. Think in beats.', ranked: true },
  { id: 'dash-tc', label: 'Dash', initialMs: 180_000, incrementMs: 1_000, description: '3 minutes + 1s per move.', ranked: true },
  { id: 'rapid', label: 'Rapid', initialMs: 300_000, incrementMs: 3_000, description: '5 minutes + 3s per move.', ranked: true },
  { id: 'classic', label: 'Classic', initialMs: 600_000, incrementMs: 0, description: '10 minutes each. Full calculation.', ranked: true },
  { id: 'correspondence', label: 'Correspondence', initialMs: 86_400_000, incrementMs: 0, description: 'One day per turn deadline.', ranked: false },
  { id: 'unlimited', label: 'Unlimited', initialMs: 0, incrementMs: 0, description: 'No competitive clock.', ranked: false },
];

export interface ArenaPreset {
  readonly size: number;
  readonly wallsPerPlayer: number;
}

export const ARENA_PRESETS: readonly { id: string; label: string; arena: ArenaPreset }[] = [
  { id: 'compact', label: 'Compact', arena: { size: 7, wallsPerPlayer: 5 } },
  { id: 'classic', label: 'Classic', arena: { size: 9, wallsPerPlayer: 10 } },
  { id: 'extended', label: 'Extended', arena: { size: 11, wallsPerPlayer: 12 } },
  { id: 'grand', label: 'Grand', arena: { size: 13, wallsPerPlayer: 16 } },
];

export type ModeId =
  | 'sprint'
  | 'dash'
  | 'tempo'
  | 'marathon'
  | 'survival'
  | 'chaos'
  | 'fortress'
  | 'tactical'
  | 'custom';

export interface ModeDefinition {
  readonly id: ModeId;
  readonly name: string;
  readonly tagline: string;
  readonly description: string;
  readonly arena: ArenaPreset;
  readonly defaultTimeControl: string;
  readonly timeControls: readonly string[];
  readonly ranked: boolean;
  readonly accent: 'green' | 'blue' | 'red' | 'gold';
  readonly modifiers: readonly string[];
}

export const MODES: readonly ModeDefinition[] = [
  {
    id: 'sprint',
    name: 'Sprint',
    tagline: 'Short, sharp, decisive.',
    description: 'Compact arena, small barrier stock, blitz clocks. A duel of instinct.',
    arena: { size: 7, wallsPerPlayer: 5 },
    defaultTimeControl: 'sprint-tc',
    timeControls: ['bullet', 'blitz', 'sprint-tc', 'dash-tc'],
    ranked: true,
    accent: 'green',
    modifiers: [],
  },
  {
    id: 'dash',
    name: 'Dash',
    tagline: 'The balanced duel.',
    description: 'Classic arena, ten barriers each, quick increment clocks. The reference ruleset.',
    arena: { size: 9, wallsPerPlayer: 10 },
    defaultTimeControl: 'dash-tc',
    timeControls: ['blitz', 'sprint-tc', 'dash-tc', 'rapid', 'classic'],
    ranked: true,
    accent: 'blue',
    modifiers: [],
  },
  {
    id: 'tempo',
    name: 'Tempo',
    tagline: 'Room to think. Room to trap.',
    description: 'Extended arena with more barriers and rapid clocks. Planning wins wars.',
    arena: { size: 11, wallsPerPlayer: 12 },
    defaultTimeControl: 'rapid',
    timeControls: ['dash-tc', 'rapid', 'classic'],
    ranked: true,
    accent: 'green',
    modifiers: [],
  },
  {
    id: 'marathon',
    name: 'Marathon',
    tagline: 'The long game.',
    description: 'Grand arena, deep barrier reserves, classic clocks. Every wall is a chapter.',
    arena: { size: 13, wallsPerPlayer: 16 },
    defaultTimeControl: 'classic',
    timeControls: ['rapid', 'classic', 'correspondence'],
    ranked: true,
    accent: 'gold',
    modifiers: [],
  },
  {
    id: 'survival',
    name: 'Survival',
    tagline: 'How long can you hold?',
    description: 'A ladder of escalating objectives. Complete each wave or start over.',
    arena: { size: 9, wallsPerPlayer: 8 },
    defaultTimeControl: 'unlimited',
    timeControls: ['unlimited'],
    ranked: false,
    accent: 'red',
    modifiers: ['wave-objectives', 'single-attempt'],
  },
  {
    id: 'chaos',
    name: 'Chaos',
    tagline: 'Unranked. Unpredictable.',
    description: 'Special tiles and rotating rule modifiers. Ratings never move here.',
    arena: { size: 9, wallsPerPlayer: 8 },
    defaultTimeControl: 'dash-tc',
    timeControls: ['blitz', 'sprint-tc', 'dash-tc', 'unlimited'],
    ranked: false,
    accent: 'red',
    modifiers: ['mystery-tiles', 'rotating-modifier'],
  },
  {
    id: 'fortress',
    name: 'Fortress',
    tagline: 'Build. Hold. Endure.',
    description: 'Expanded barrier resources reward defensive architecture and slow suffocation.',
    arena: { size: 9, wallsPerPlayer: 16 },
    defaultTimeControl: 'rapid',
    timeControls: ['dash-tc', 'rapid', 'classic'],
    ranked: true,
    accent: 'blue',
    modifiers: ['expanded-barriers'],
  },
  {
    id: 'tactical',
    name: 'Tactical',
    tagline: 'Few walls. Every one matters.',
    description: 'Limited barriers force precise placement and deliberate movement.',
    arena: { size: 9, wallsPerPlayer: 4 },
    defaultTimeControl: 'classic',
    timeControls: ['rapid', 'classic', 'correspondence'],
    ranked: true,
    accent: 'gold',
    modifiers: ['scarce-barriers'],
  },
  {
    id: 'custom',
    name: 'Custom',
    tagline: 'Set the terms.',
    description: 'Choose board size, barrier stock, clock, and format. Unranked by definition.',
    arena: { size: 9, wallsPerPlayer: 10 },
    defaultTimeControl: 'dash-tc',
    timeControls: ['bullet', 'blitz', 'sprint-tc', 'dash-tc', 'rapid', 'classic', 'correspondence', 'unlimited'],
    ranked: false,
    accent: 'green',
    modifiers: [],
  },
];

export function modeById(id: string): ModeDefinition | undefined {
  return MODES.find((m) => m.id === id);
}

export function timeControlById(id: string): TimeControl | undefined {
  return TIME_CONTROLS.find((t) => t.id === id);
}

export function toGameConfig(mode: ModeDefinition, overrides: Partial<GameConfig> = {}): GameConfig {
  return {
    size: mode.arena.size,
    wallsPerPlayer: mode.arena.wallsPerPlayer,
    moveLimit: 240,
    firstPlayer: 'blue',
    repetitionLimit: 3,
    ...overrides,
  };
}

export const BOT_PERSONALITIES = [
  { id: 'beginner', name: 'Nova', title: 'Beginner', blurb: 'Learns the ropes with you.', elo: 800, accent: 'green' },
  { id: 'casual', name: 'Pip', title: 'Casual', blurb: 'Plays for fun, still bites.', elo: 1000, accent: 'blue' },
  { id: 'intermediate', name: 'Kestrel', title: 'Intermediate', blurb: 'Solid routes, tidy walls.', elo: 1200, accent: 'blue' },
  { id: 'advanced', name: 'Vale', title: 'Advanced', blurb: 'Punishes lazy placement.', elo: 1500, accent: 'gold' },
  { id: 'expert', name: 'Obsidian', title: 'Expert', blurb: 'Calculates the whole board.', elo: 1800, accent: 'red' },
  { id: 'defensive', name: 'Bastion', title: 'Defensive', blurb: 'Builds a fortress you must break.', elo: 1350, accent: 'blue' },
  { id: 'aggressive', name: 'Ember', title: 'Aggressive', blurb: 'Attacks your route relentlessly.', elo: 1400, accent: 'red' },
  { id: 'unpredictable', name: 'Jinx', title: 'Unpredictable', blurb: 'Chaos with a plan. Probably.', elo: 1250, accent: 'gold' },
] as const;

export type BotPersonalityId = (typeof BOT_PERSONALITIES)[number]['id'];

export function botById(id: string) {
  return BOT_PERSONALITIES.find((b) => b.id === id);
}
