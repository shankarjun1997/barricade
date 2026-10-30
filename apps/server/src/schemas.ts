import { z } from 'zod';

export const MODE_IDS = [
  'sprint',
  'dash',
  'tempo',
  'marathon',
  'survival',
  'chaos',
  'fortress',
  'tactical',
  'custom',
] as const;

export const PlayerIdSchema = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/);
export const NameSchema = z.string().min(2).max(24);
export const CodeSchema = z.string().trim().toUpperCase().regex(/^[A-Z2-9]{6}$/);
export const ModeIdSchema = z.enum(MODE_IDS);
export const TimeControlIdSchema = z.string().min(2).max(40);
export const ClientMoveIdSchema = z.string().min(4).max(80);

export const MoveSchema = z.union([
  z.object({
    kind: z.literal('move'),
    to: z.object({ r: z.number().int().min(-1).max(64), c: z.number().int().min(-1).max(64) }),
  }),
  z.object({
    kind: z.literal('wall'),
    orientation: z.enum(['H', 'V']),
    r: z.number().int().min(-1).max(64),
    c: z.number().int().min(-1).max(64),
  }),
]);

export const PartialConfigSchema = z.object({
  size: z.number().int().min(5).max(15).optional(),
  wallsPerPlayer: z.number().int().min(0).max(24).optional(),
  firstPlayer: z.enum(['blue', 'red']).optional(),
});

export const ClientMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('hello'),
    playerId: PlayerIdSchema,
    name: NameSchema,
    token: z.string().max(128).optional(),
    version: z.number().int(),
  }),
  z.object({ type: z.literal('rename'), name: NameSchema }),
  z.object({
    type: z.literal('queue_join'),
    modeId: ModeIdSchema,
    timeControlId: TimeControlIdSchema,
  }),
  z.object({ type: z.literal('queue_leave') }),
  z.object({
    type: z.literal('room_create'),
    modeId: ModeIdSchema,
    timeControlId: TimeControlIdSchema,
    config: PartialConfigSchema.optional(),
    visibility: z.enum(['public', 'private']),
  }),
  z.object({ type: z.literal('room_join'), code: CodeSchema }),
  z.object({ type: z.literal('room_leave') }),
  z.object({
    type: z.literal('move'),
    matchId: z.string().min(4).max(80),
    move: MoveSchema,
    clientMoveId: ClientMoveIdSchema,
  }),
  z.object({ type: z.literal('resign'), matchId: z.string().min(4).max(80) }),
  z.object({ type: z.literal('draw_offer'), matchId: z.string().min(4).max(80) }),
  z.object({
    type: z.literal('draw_respond'),
    matchId: z.string().min(4).max(80),
    accept: z.boolean(),
  }),
  z.object({ type: z.literal('rematch_request'), matchId: z.string().min(4).max(80) }),
  z.object({
    type: z.literal('rematch_respond'),
    matchId: z.string().min(4).max(80),
    accept: z.boolean(),
  }),
  z.object({
    type: z.literal('chat'),
    matchId: z.string().min(4).max(80),
    optionId: z.string().min(4).max(64),
  }),
  z.object({ type: z.literal('match_leave'), matchId: z.string().min(4).max(80) }),
  z.object({ type: z.literal('ping'), t: z.number().finite() }),
]);
