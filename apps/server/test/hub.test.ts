import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { MatchSnapshot, ServerMessage } from '@barricade/protocol';
import { Hub, type ConnectResult, type SocketHandle } from '../src/hub.js';

const T0 = 1_700_000_000_000;

class FakeClient {
  messages: ServerMessage[] = [];
  socket: SocketHandle;
  closeInfo: { code: number; reason: string } | null = null;
  sessionToken = '';

  constructor(
    readonly id: string,
    public name: string,
  ) {
    this.socket = this.makeSocket();
  }

  private makeSocket(): SocketHandle {
    const connectionId = randomUUID();
    return {
      connectionId,
      send: (message) => {
        if (message.type === 'welcome') this.sessionToken = message.sessionToken;
        this.messages.push(message);
      },
      close: (code, reason) => {
        this.closeInfo = { code, reason };
      },
    };
  }

  connect(hub: Hub, token?: string): ConnectResult {
    this.socket = this.makeSocket();
    return hub.connect({
      playerId: this.id,
      name: this.name,
      ...(token ? { token } : {}),
      socket: this.socket,
    });
  }

  reconnect(hub: Hub): ConnectResult {
    return this.connect(hub, this.sessionToken);
  }

  clear(): void {
    this.messages = [];
  }

  last<T extends ServerMessage['type']>(type: T): Extract<ServerMessage, { type: T }> | undefined {
    for (let i = this.messages.length - 1; i >= 0; i--) {
      const message = this.messages[i];
      if (message?.type === type) return message as Extract<ServerMessage, { type: T }>;
    }
    return undefined;
  }

  match(): MatchSnapshot | undefined {
    for (let i = this.messages.length - 1; i >= 0; i--) {
      const message = this.messages[i];
      if (message?.type === 'match' || message?.type === 'match_end') return message.match;
    }
    return undefined;
  }

  errors(): string[] {
    return this.messages
      .filter((message): message is Extract<ServerMessage, { type: 'error' }> => message.type === 'error')
      .map((message) => message.code);
  }
}

function makeHub(nowRef: { value: number }, overrides: Partial<ConstructorParameters<typeof Hub>[0]> = {}): Hub {
  return new Hub({
    now: () => nowRef.value,
    graceMs: 5000,
    persistPath: null,
    rng: mulberry(42),
    ...overrides,
  });
}

function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function roomMatch(hub: Hub, nowRef: { value: number }) {
  const a = new FakeClient('player_alpha', 'Alpha');
  const b = new FakeClient('player_beta', 'Beta');
  const ra = a.connect(hub);
  const rb = b.connect(hub);
  expect(ra.ok && rb.ok).toBe(true);
  a.clear();
  b.clear();

  hub.handle(a.id, {
    type: 'room_create',
    modeId: 'dash',
    timeControlId: 'dash-tc',
    visibility: 'private',
  });
  const roomMessage = a.last('room');
  expect(roomMessage?.room).toBeTruthy();
  const code = roomMessage!.room!.code;

  hub.handle(b.id, { type: 'room_join', code });
  nowRef.value += 200;

  const blue = a.match();
  const red = b.match();
  expect(blue).toBeTruthy();
  expect(red).toBeTruthy();
  expect(blue!.id).toBe(red!.id);
  expect(blue!.youAre).toBe('blue');
  expect(red!.youAre).toBe('red');
  return { a, b, code, match: blue!, tokenA: ra.ok ? ra.token : '', tokenB: rb.ok ? rb.token : '' };
}

describe('identity', () => {
  it('registers guests with a stable token and validates identity/name', () => {
    const now = { value: T0 };
    const hub = makeHub(now);
    const bad = new FakeClient('short', 'Valid');
    expect(bad.connect(hub)).toMatchObject({ ok: false, code: 'AUTH_FAILED' });

    const client = new FakeClient('player_alpha', 'A');
    expect(client.connect(hub)).toMatchObject({ ok: false, code: 'INVALID_NAME' });
    client.name = 'Alpha';
    const result = client.connect(hub);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.player.name).toBe('Alpha');
    expect(result.player.rating).toBe(1000);
    expect(result.token.length).toBeGreaterThan(20);

    const wrong = client.connect(hub, 'not-the-token');
    expect(wrong).toMatchObject({ ok: false, code: 'AUTH_FAILED' });

    const resumed = client.connect(hub, result.token);
    expect(resumed).toMatchObject({ ok: true, resumed: false });
  });

  it('replaces a duplicate session without letting the old close event disconnect the new one', () => {
    const now = { value: T0 };
    const hub = makeHub(now);
    const a = new FakeClient('player_alpha', 'Alpha');
    const b = new FakeClient('player_beta', 'Beta');
    a.connect(hub);
    b.connect(hub);
    const token = a.sessionToken;
    const oldConnectionId = a.socket.connectionId;

    const again = a.connect(hub, token);
    expect(again.ok).toBe(true);
    expect(a.closeInfo?.code).toBe(4001);
    expect(hub.stats().online).toBe(2);

    // Simulate the superseded socket closing late.
    hub.disconnect(a.id, oldConnectionId);
    expect(hub.stats().online).toBe(2);
  });

  it('renames safely and rejects invalid names', () => {
    const now = { value: T0 };
    const hub = makeHub(now);
    const a = new FakeClient('player_alpha', 'Alpha');
    a.connect(hub);
    hub.handle(a.id, { type: 'rename', name: 'Ace' });
    expect(hub.leaderboard(1)[0]?.name).toBe('Ace');
    hub.handle(a.id, { type: 'rename', name: '<script>' });
    expect(a.errors()).toContain('INVALID_NAME');
    expect(hub.leaderboard(1)[0]?.name).toBe('Ace');
  });
});

describe('rooms', () => {
  it('creates a private room, joins by code, and starts an authoritative match', () => {
    const now = { value: T0 };
    const hub = makeHub(now);
    const { a, b, code, match } = roomMatch(hub, now);
    expect(code).toMatch(/^[A-Z2-9]{6}$/);
    expect(match.roomCode).toBe(code);
    expect(match.status).toBe('active');
    expect(match.game.config.size).toBe(9);
    expect(match.blue.name).toBe('Alpha');
    expect(match.red.name).toBe('Beta');
    expect(a.last('room')?.room?.status).toBe('playing');
    expect(b.last('room')?.room?.status).toBe('playing');
  });

  it('publishes public rooms in the lobby and rejects invalid joins', () => {
    const now = { value: T0 };
    const hub = makeHub(now);
    const a = new FakeClient('player_alpha', 'Alpha');
    const b = new FakeClient('player_beta', 'Beta');
    a.connect(hub);
    b.connect(hub);
    a.clear();
    b.clear();

    hub.handle(a.id, { type: 'room_create', modeId: 'dash', timeControlId: 'dash-tc', visibility: 'public' });
    const code = a.last('room')!.room!.code;
    const lobby = hub.lobby();
    expect(lobby.rooms.some((room) => room.code === code)).toBe(true);

    hub.handle(b.id, { type: 'room_join', code: 'AAAAAA' });
    expect(b.errors()).toContain('ROOM_NOT_FOUND');

    hub.handle(b.id, { type: 'room_join', code });
    hub.handle(b.id, { type: 'room_join', code });
    expect(b.errors()).toContain('ROOM_STARTED');
  });

  it('removes a waiting room when the host disconnects', () => {
    const now = { value: T0 };
    const hub = makeHub(now);
    const a = new FakeClient('player_alpha', 'Alpha');
    a.connect(hub);
    hub.handle(a.id, { type: 'room_create', modeId: 'dash', timeControlId: 'dash-tc', visibility: 'public' });
    expect(hub.lobby().rooms).toHaveLength(1);
    hub.disconnect(a.id, a.socket.connectionId);
    expect(hub.lobby().rooms).toHaveLength(0);
  });

  it('validates custom arenas and mode/time combinations', () => {
    const now = { value: T0 };
    const hub = makeHub(now);
    const a = new FakeClient('player_alpha', 'Alpha');
    a.connect(hub);
    a.clear();

    hub.handle(a.id, {
      type: 'room_create',
      modeId: 'sprint',
      timeControlId: 'classic',
      visibility: 'private',
    });
    expect(a.errors()).toContain('INVALID_CONFIG');

    hub.handle(a.id, {
      type: 'room_create',
      modeId: 'custom',
      timeControlId: 'rapid',
      config: { size: 4, wallsPerPlayer: 4 },
      visibility: 'private',
    });
    expect(a.errors()).toContain('INVALID_CONFIG');

    hub.handle(a.id, {
      type: 'room_create',
      modeId: 'custom',
      timeControlId: 'rapid',
      config: { size: 11, wallsPerPlayer: 12 },
      visibility: 'private',
    });
    expect(a.last('room')?.room?.config).toMatchObject({ size: 11, wallsPerPlayer: 12 });
  });
});

describe('authoritative moves and clocks', () => {
  it('rejects wrong turns and illegal moves, applies legal moves to both players', () => {
    const now = { value: T0 };
    const hub = makeHub(now);
    const { a, b, match } = roomMatch(hub, now);
    a.clear();
    b.clear();

    hub.handle(b.id, {
      type: 'move',
      matchId: match.id,
      move: { kind: 'move', to: { r: 1, c: 4 } },
      clientMoveId: 'wrong-turn-1',
    });
    expect(b.errors()).toContain('NOT_YOUR_TURN');

    hub.handle(a.id, {
      type: 'move',
      matchId: match.id,
      move: { kind: 'move', to: { r: 5, c: 5 } },
      clientMoveId: 'illegal-1',
    });
    expect(a.errors()).toContain('ILLEGAL_MOVE');

    now.value += 200;
    hub.handle(a.id, {
      type: 'move',
      matchId: match.id,
      move: { kind: 'move', to: { r: 7, c: 4 } },
      clientMoveId: 'legal-1',
    });
    expect(a.errors()).toEqual(['ILLEGAL_MOVE']);
    const afterA = a.match();
    const afterB = b.match();
    expect(afterA?.game.ply).toBe(1);
    expect(afterA?.game.turn).toBe('red');
    expect(afterB?.game.ply).toBe(1);
    expect(afterA?.game.pawns.blue).toEqual({ r: 7, c: 4 });
  });

  it('treats a duplicate client move id as an idempotent retry', () => {
    const now = { value: T0 };
    const hub = makeHub(now);
    const { a, match } = roomMatch(hub, now);
    a.clear();
    now.value += 200;
    hub.handle(a.id, {
      type: 'move',
      matchId: match.id,
      move: { kind: 'move', to: { r: 7, c: 4 } },
      clientMoveId: 'same-id',
    });
    now.value += 500;
    a.clear();
    hub.handle(a.id, {
      type: 'move',
      matchId: match.id,
      move: { kind: 'move', to: { r: 7, c: 4 } },
      clientMoveId: 'same-id',
    });
    expect(a.errors()).toHaveLength(0);
    expect(a.match()?.game.ply).toBe(1);
  });

  it('expires the clock server-side and awards a timeout win', () => {
    const now = { value: T0 };
    const hub = makeHub(now);
    const a = new FakeClient('player_alpha', 'Alpha');
    const b = new FakeClient('player_beta', 'Beta');
    a.connect(hub);
    b.connect(hub);
    hub.handle(a.id, { type: 'room_create', modeId: 'sprint', timeControlId: 'bullet', visibility: 'private' });
    const code = a.last('room')!.room!.code;
    hub.handle(b.id, { type: 'room_join', code });
    a.clear();
    b.clear();

    now.value += 16_000;
    hub.tick();

    const end = a.last('match_end')?.match;
    expect(end?.status).toBe('finished');
    expect(end?.result).toEqual({ kind: 'win', winner: 'red', reason: 'timeout' });
    expect(end?.endReason).toBe('timeout');
    const change = end?.ratingChanges;
    expect(change?.blue).toBeLessThan(0);
    expect(change?.red).toBeGreaterThan(0);
  });

  it('does not apply a move after the clock expired', () => {
    const now = { value: T0 };
    const hub = makeHub(now);
    const a = new FakeClient('player_alpha', 'Alpha');
    const b = new FakeClient('player_beta', 'Beta');
    a.connect(hub);
    b.connect(hub);
    hub.handle(a.id, { type: 'room_create', modeId: 'sprint', timeControlId: 'bullet', visibility: 'private' });
    const code = a.last('room')!.room!.code;
    hub.handle(b.id, { type: 'room_join', code });
    const matchId = a.match()!.id;
    a.clear();
    now.value += 16_000;
    hub.handle(a.id, {
      type: 'move',
      matchId,
      move: { kind: 'move', to: { r: 5, c: 3 } },
      clientMoveId: 'late-move',
    });
    expect(a.last('match_end')?.match.result).toEqual({ kind: 'win', winner: 'red', reason: 'timeout' });
  });
});

describe('reconnection and abandonment', () => {
  it('keeps the match alive through a disconnect and resumes within the grace window', () => {
    const now = { value: T0 };
    const hub = makeHub(now);
    const { a, b, match } = roomMatch(hub, now);
    const token = a.sessionToken;
    b.clear();

    hub.disconnect(a.id, a.socket.connectionId);
    const marked = b.match();
    expect(marked?.presence.blue.connected).toBe(false);
    expect(marked?.presence.blue.reconnectDeadline).toBe(T0 + 5000 + 200);

    now.value += 1500;
    const resumed = a.connect(hub, token);
    expect(resumed).toMatchObject({ ok: true, resumed: true });
    expect(a.match()?.presence.blue.connected).toBe(true);
    expect(a.match()?.presence.blue.reconnectDeadline).toBeNull();
    expect(a.match()?.id).toBe(match.id);
    expect(b.last('notice')?.kind).toBe('success');
    expect(b.match()?.presence.blue.connected).toBe(true);
  });

  it('awards a forfeit after the grace window expires', () => {
    const now = { value: T0 };
    const hub = makeHub(now);
    const { a, b, match } = roomMatch(hub, now);
    hub.disconnect(a.id, a.socket.connectionId);
    now.value += 6000;
    hub.tick();
    const end = b.last('match_end')?.match;
    expect(end?.status).toBe('finished');
    expect(end?.result).toEqual({ kind: 'win', winner: 'red', reason: 'forfeit' });
    expect(end?.endReason).toBe('forfeit');
    expect(match.id).toBe(end?.id);
  });

  it('abandons without rating when both players are gone', () => {
    const now = { value: T0 };
    const hub = makeHub(now);
    const { a, b } = roomMatch(hub, now);
    const before = hub.leaderboard(2).map((entry) => entry.rating);
    hub.disconnect(a.id, a.socket.connectionId);
    hub.disconnect(b.id, b.socket.connectionId);
    now.value += 6000;
    hub.tick();
    const after = hub.leaderboard(2).map((entry) => entry.rating);
    expect(after).toEqual(before);
  });
});

describe('draw, resign and rematch', () => {
  it('handles draw offers and agreement without double settlement', () => {
    const now = { value: T0 };
    const hub = makeHub(now);
    const { a, b, match } = roomMatch(hub, now);
    a.clear();
    b.clear();

    hub.handle(a.id, { type: 'draw_offer', matchId: match.id });
    expect(b.last('draw_offer')?.from.name).toBe('Alpha');
    hub.handle(b.id, { type: 'draw_respond', matchId: match.id, accept: true });

    const end = a.last('match_end')?.match;
    expect(end?.result).toEqual({ kind: 'draw', reason: 'agreement' });
    expect(end?.ratingChanges).toBeTruthy();
    const ratingAfter = hub.leaderboard(2).find((entry) => entry.id === a.id)?.rating;
    hub.handle(a.id, { type: 'resign', matchId: match.id });
    expect(hub.leaderboard(2).find((entry) => entry.id === a.id)?.rating).toBe(ratingAfter);
  });

  it('settles a resignation once and allows a colours-swapped rematch', () => {
    const now = { value: T0 };
    const hub = makeHub(now);
    const { a, b, match } = roomMatch(hub, now);
    a.clear();
    b.clear();

    hub.handle(a.id, { type: 'resign', matchId: match.id });
    const end = b.last('match_end')?.match;
    expect(end?.result).toEqual({ kind: 'win', winner: 'red', reason: 'resign' });
    expect(end?.ratingChanges?.blue).toBeLessThan(0);

    now.value += 1000;
    hub.handle(a.id, { type: 'rematch_request', matchId: match.id });
    expect(b.last('rematch_state')?.requestedBy.map((player) => player.name)).toContain('Alpha');

    a.clear();
    b.clear();
    hub.handle(b.id, { type: 'rematch_respond', matchId: match.id, accept: true });
    const rematchA = a.match();
    const rematchB = b.match();
    expect(rematchA?.id).not.toBe(match.id);
    expect(rematchA?.youAre).toBe('red');
    expect(rematchB?.youAre).toBe('blue');
    expect(rematchA?.status).toBe('active');
  });
});

describe('global matchmaking', () => {
  it('pairs compatible queued players into a server-created match', () => {
    const now = { value: T0 };
    const hub = makeHub(now);
    const a = new FakeClient('player_alpha', 'Alpha');
    const b = new FakeClient('player_beta', 'Beta');
    a.connect(hub);
    b.connect(hub);
    a.clear();
    b.clear();

    hub.handle(a.id, { type: 'queue_join', modeId: 'dash', timeControlId: 'dash-tc' });
    expect(a.last('queue')?.queue.state).toBe('queued');
    expect(a.last('queue')?.queue.position).toBe(1);

    hub.handle(b.id, { type: 'queue_join', modeId: 'dash', timeControlId: 'dash-tc' });
    const matchA = a.match();
    const matchB = b.match();
    expect(matchA?.id).toBe(matchB?.id);
    expect(matchA?.roomCode).toBeNull();
    expect(matchA?.youAre).toBe('blue');
    expect(matchB?.youAre).toBe('red');
    expect(a.last('queue')?.queue.state).toBe('idle');
    expect(hub.stats().queued).toBe(0);
  });

  it('does not pair different mode or clock queues and supports cancellation', () => {
    const now = { value: T0 };
    const hub = makeHub(now);
    const a = new FakeClient('player_alpha', 'Alpha');
    const b = new FakeClient('player_beta', 'Beta');
    a.connect(hub);
    b.connect(hub);
    a.clear();
    b.clear();

    hub.handle(a.id, { type: 'queue_join', modeId: 'dash', timeControlId: 'dash-tc' });
    hub.handle(b.id, { type: 'queue_join', modeId: 'sprint', timeControlId: 'bullet' });
    expect(a.match()).toBeUndefined();
    expect(b.match()).toBeUndefined();
    expect(hub.stats().queued).toBe(2);

    hub.handle(a.id, { type: 'queue_leave' });
    expect(a.last('queue')?.queue.state).toBe('idle');
    expect(hub.stats().queued).toBe(1);
  });
});

describe('persistence and restart recovery', () => {
  it('restores players, ratings and an active match without losing clock time', () => {
    const dir = mkdtempSync(join(tmpdir(), 'barricade-hub-'));
    const file = join(dir, 'state.json');
    const now = { value: T0 };
    try {
      const hub = makeHub(now, { persistPath: file });
      const { a, b, match } = roomMatch(hub, now);
      const tokenA = a.sessionToken;
      now.value += 200;
      hub.handle(a.id, {
        type: 'move',
        matchId: match.id,
        move: { kind: 'move', to: { r: 7, c: 4 } },
        clientMoveId: 'persist-1',
      });
      expect(a.match()?.game.ply).toBe(1);
      hub.flush();

      const savedAt = now.value;
      now.value = savedAt + 30_000;
      const restored = makeHub(now, { persistPath: file });
      const a2 = new FakeClient('player_alpha', 'Alpha');
      const resumed = a2.connect(restored, tokenA);
      expect(resumed).toMatchObject({ ok: true, resumed: true });
      expect(a2.match()?.game.ply).toBe(1);
      expect(a2.last('server_restart')).toBeTruthy();
      const before = hub.leaderboard(2);
      const after = restored.leaderboard(2);
      expect(after.map((entry) => entry.rating)).toEqual(before.map((entry) => entry.rating));

      // Restored clocks should not have drained during downtime.
      const restoredClock = a2.match()?.clocks.red;
      const originalClock = b.match()?.clocks.red;
      expect(restoredClock).toBe(originalClock);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('persists rating changes after a finished match', () => {
    const dir = mkdtempSync(join(tmpdir(), 'barricade-rating-'));
    const file = join(dir, 'state.json');
    const now = { value: T0 };
    try {
      const hub = makeHub(now, { persistPath: file });
      const { a, b, match } = roomMatch(hub, now);
      hub.handle(a.id, { type: 'resign', matchId: match.id });
      const rated = hub.leaderboard(2).find((entry) => entry.id === a.id)!.rating;
      expect(rated).toBeLessThan(1000);
      hub.flush();

      const restored = makeHub(now, { persistPath: file });
      expect(restored.leaderboard(2).find((entry) => entry.id === a.id)?.rating).toBe(rated);
      expect(restored.leaderboard(2).find((entry) => entry.id === b.id)?.rating).toBeGreaterThan(1000);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
