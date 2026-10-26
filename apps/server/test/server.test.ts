import { once } from 'node:events';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import type { ServerMessage } from '@barricade/protocol';
import { createServer, type CreatedServer } from '../src/server.js';

let server: CreatedServer;
let wsUrl = '';

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  server = await createServer({ persistPath: null });
  await server.app.listen({ port: 0, host: '127.0.0.1' });
  const address = server.app.server.address();
  if (!address || typeof address === 'string') throw new Error('No server address');
  wsUrl = `ws://127.0.0.1:${address.port}/ws`;
});

afterAll(async () => {
  await server.close();
});

class TestSocket {
  private readonly waiters: {
    predicate: (message: ServerMessage) => boolean;
    resolve: (message: ServerMessage) => void;
    timer: ReturnType<typeof setTimeout>;
  }[] = [];

  messages: ServerMessage[] = [];

  private constructor(private readonly ws: WebSocket) {
    ws.on('message', (raw) => {
      let parsed: ServerMessage;
      try {
        parsed = JSON.parse(raw.toString()) as ServerMessage;
      } catch {
        return;
      }
      this.messages.push(parsed);
      for (let i = 0; i < this.waiters.length; i++) {
        const waiter = this.waiters[i];
        if (waiter?.predicate(parsed)) {
          this.waiters.splice(i, 1);
          waiter.resolve(parsed);
          return;
        }
      }
    });
  }

  static async open(origin = 'http://localhost:5173'): Promise<TestSocket> {
    const ws = new WebSocket(wsUrl, { headers: { Origin: origin } });
    await once(ws, 'open');
    return new TestSocket(ws);
  }

  send(message: unknown): void {
    this.ws.send(JSON.stringify(message));
  }

  waitFor(
    predicate: (message: ServerMessage) => boolean,
    timeoutMs = 5000,
  ): Promise<ServerMessage> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const index = this.waiters.findIndex((waiter) => waiter.timer === timer);
        if (index >= 0) this.waiters.splice(index, 1);
        reject(new Error('Timed out waiting for a server message'));
      }, timeoutMs);
      this.waiters.push({ predicate, resolve, timer });
    });
  }

  close(): void {
    this.ws.close();
  }
}

async function hello(client: TestSocket, playerId: string, name: string) {
  const welcome = client.waitFor((message) => message.type === 'welcome');
  client.send({ type: 'hello', playerId, name, version: 1 });
  return (await welcome) as Extract<ServerMessage, { type: 'welcome' }>;
}

describe('HTTP surface', () => {
  it('serves health, lobby, leaderboard and rooms; 404s unknown paths', async () => {
    const health = await server.app.inject({ method: 'GET', url: '/health' });
    expect(health.statusCode).toBe(200);
    expect(health.json()).toMatchObject({ ok: true, online: 0, activeMatches: 0, queued: 0 });

    const lobby = await server.app.inject({ method: 'GET', url: '/api/lobby' });
    expect(lobby.statusCode).toBe(200);
    expect(lobby.json()).toHaveProperty('leaderboard');
    expect(lobby.json()).toHaveProperty('rooms');

    const leaderboard = await server.app.inject({ method: 'GET', url: '/api/leaderboard?limit=5' });
    expect(leaderboard.statusCode).toBe(200);
    expect(Array.isArray(leaderboard.json().entries)).toBe(true);

    const rooms = await server.app.inject({ method: 'GET', url: '/api/rooms' });
    expect(rooms.statusCode).toBe(200);
    expect(Array.isArray(rooms.json().rooms)).toBe(true);

    const missing = await server.app.inject({ method: 'GET', url: '/nope' });
    expect(missing.statusCode).toBe(404);
  });
});

describe('WebSocket transport', () => {
  it('handshakes, creates a room, joins it, and relays an authoritative move', async () => {
    const a = await TestSocket.open();
    const b = await TestSocket.open();
    try {
      const welcomeA = await hello(a, 'socket_alpha', 'Alpha');
      const welcomeB = await hello(b, 'socket_beta', 'Beta');
      expect(welcomeA.player.name).toBe('Alpha');
      expect(welcomeB.player.rating).toBe(1000);

      const roomMessage = a.waitFor((message) => message.type === 'room' && Boolean(message.room));
      a.send({
        type: 'room_create',
        modeId: 'dash',
        timeControlId: 'dash-tc',
        visibility: 'private',
      });
      const room = (await roomMessage) as Extract<ServerMessage, { type: 'room' }>;
      const code = room.room?.code;
      expect(code).toMatch(/^[A-Z2-9]{6}$/);

      const matchA = a.waitFor((message) => message.type === 'match');
      const matchB = b.waitFor((message) => message.type === 'match');
      b.send({ type: 'room_join', code });
      const stateA = (await matchA) as Extract<ServerMessage, { type: 'match' }>;
      const stateB = (await matchB) as Extract<ServerMessage, { type: 'match' }>;
      expect(stateA.match.id).toBe(stateB.match.id);
      expect(stateA.match.youAre).toBe('blue');
      expect(stateB.match.youAre).toBe('red');

      const updateB = b.waitFor(
        (message) => message.type === 'match' && message.match.game.ply === 1,
      );
      a.send({
        type: 'move',
        matchId: stateA.match.id,
        move: { kind: 'move', to: { r: 7, c: 4 } },
        clientMoveId: 'socket-move-1',
      });
      const update = (await updateB) as Extract<ServerMessage, { type: 'match' }>;
      expect(update.match.game.turn).toBe('red');
      expect(update.match.game.pawns.blue).toEqual({ r: 7, c: 4 });

      const pong = a.waitFor((message) => message.type === 'pong');
      a.send({ type: 'ping', t: 123 });
      expect(await pong).toMatchObject({ type: 'pong', t: 123 });
    } finally {
      a.close();
      b.close();
    }
  });

  it('rejects invalid JSON, invalid identities, and disallowed origins', async () => {
    const a = await TestSocket.open();
    try {
      const badJson = a.waitFor((message) => message.type === 'error');
      a.send('not-an-object');
      expect((await badJson) as Extract<ServerMessage, { type: 'error' }>).toMatchObject({
        code: 'BAD_MESSAGE',
      });

      const badHello = a.waitFor((message) => message.type === 'error');
      a.send({ type: 'hello', playerId: 'x', name: 'Bad', version: 1 });
      expect((await badHello) as Extract<ServerMessage, { type: 'error' }>).toMatchObject({
        code: 'BAD_MESSAGE',
      });
    } finally {
      a.close();
    }

    const evil = new WebSocket(wsUrl, { headers: { Origin: 'https://evil.example' } });
    const [code] = (await once(evil, 'close')) as [number, string];
    expect(code).toBe(1008);
  });

  it('requires hello before any other message', async () => {
    const a = await TestSocket.open();
    try {
      const error = a.waitFor((message) => message.type === 'error');
      a.send({ type: 'queue_leave' });
      expect((await error) as Extract<ServerMessage, { type: 'error' }>).toMatchObject({
        code: 'AUTH_FAILED',
      });
    } finally {
      a.close();
    }
  });
});
