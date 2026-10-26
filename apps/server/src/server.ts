import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
import { randomUUID } from 'node:crypto';
import type { ServerMessage } from '@barricade/protocol';
import { ClientMessageSchema } from './schemas.js';
import { Hub, type HubOptions, type SocketHandle } from './hub.js';

export interface ServerOptions {
  readonly persistPath?: string | null;
  readonly graceMs?: number;
  readonly now?: () => number;
}

export interface CreatedServer {
  readonly app: FastifyInstance;
  readonly hub: Hub;
  close(): Promise<void>;
}

const DEFAULT_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:4173',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:4173',
  'https://barricade-ruby.vercel.app',
  'https://barricade-builder-os.vercel.app',
];

function allowedOrigins(): string[] {
  const configured = process.env.ALLOWED_ORIGINS;
  if (!configured) return DEFAULT_ORIGINS;
  return configured
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function originAllowed(origin: string | undefined, origins: string[]): boolean {
  if (!origin) return true; // Non-browser clients (CLI/native) have no Origin header.
  return origins.includes('*') || origins.includes(origin);
}

export async function createServer(options: ServerOptions = {}): Promise<CreatedServer> {
  const app = Fastify({
    logger:
      process.env.NODE_ENV === 'test'
        ? false
        : {
            level: process.env.LOG_LEVEL ?? 'info',
            redact: ['req.headers.authorization', 'req.headers.cookie'],
          },
    trustProxy: true,
    bodyLimit: 32 * 1024,
  });

  const origins = allowedOrigins();

  await app.register(cors, {
    origin: (origin, callback) => {
      callback(null, originAllowed(origin, origins));
    },
    credentials: false,
  });

  await app.register(rateLimit, {
    max: 240,
    timeWindow: '1 minute',
    allowList: ['127.0.0.1', '::1'],
    errorResponseBuilder: () => ({ error: 'Too many requests. Slow down.' }),
  });

  await app.register(websocket, {
    options: {
      maxPayload: 64 * 1024,
    },
  });

  const hubOptions: HubOptions = {
    ...(options.persistPath !== undefined ? { persistPath: options.persistPath } : {}),
    ...(options.graceMs !== undefined ? { graceMs: options.graceMs } : {}),
    ...(options.now ? { now: options.now } : {}),
    log: (event, data) => app.log.info({ event, ...data }, `hub:${event}`),
  };
  const hub = new Hub(hubOptions);

  app.get('/', async () => ({
    name: 'Barricade game server',
    ok: true,
    version: 1,
    protocol: 'ws://<host>/ws',
  }));

  app.get('/health', { config: { rateLimit: false } }, async () => ({
    ok: true,
    version: 1,
    uptimeSeconds: Math.round(process.uptime()),
    ...hub.stats(),
  }));

  app.get('/api/lobby', async () => hub.lobby());

  app.get('/api/leaderboard', async (request) => {
    const query = request.query as { limit?: string };
    const limit = Math.max(1, Math.min(Number(query.limit ?? 20) || 20, 100));
    return { entries: hub.leaderboard(limit) };
  });

  app.get('/api/rooms', async () => {
    const lobby = hub.lobby();
    return { rooms: lobby.rooms, serverNow: lobby.serverNow };
  });

  app.setNotFoundHandler(async (_request, reply) => {
    reply.code(404);
    return { error: 'Not found' };
  });

  app.get('/ws', { websocket: true, config: { rateLimit: false } }, (socket, request) => {
    const origin = request.headers.origin;
    if (!originAllowed(origin, origins)) {
      socket.close(1008, 'Origin not allowed');
      return;
    }

    const connectionId = randomUUID();
    let playerId: string | null = null;
    let alive = true;
    let rateWindowStart = Date.now();
    let rateCount = 0;

    const send = (message: ServerMessage): void => {
      if (socket.readyState === 1) {
        socket.send(JSON.stringify(message));
      }
    };

    const handle: SocketHandle = {
      connectionId,
      send,
      close: (code, reason) => socket.close(code, reason),
    };

    const helloTimer = setTimeout(() => {
      if (!playerId) socket.close(4008, 'Hello required');
    }, 8000);

    const heartbeat = setInterval(() => {
      if (!alive) {
        socket.terminate();
        return;
      }
      alive = false;
      socket.ping();
    }, 30_000);

    socket.on('pong', () => {
      alive = true;
    });

    socket.on('message', (raw) => {
      const now = Date.now();
      if (now - rateWindowStart > 1000) {
        rateWindowStart = now;
        rateCount = 0;
      }
      rateCount += 1;
      if (rateCount > 80) {
        send({ type: 'error', code: 'RATE_LIMITED', message: 'Too many messages. Slow down.' });
        socket.close(4029, 'Rate limit');
        return;
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(raw.toString());
      } catch {
        send({ type: 'error', code: 'BAD_MESSAGE', message: 'Invalid JSON.' });
        return;
      }

      const result = ClientMessageSchema.safeParse(parsed);
      if (!result.success) {
        send({ type: 'error', code: 'BAD_MESSAGE', message: 'Invalid message shape.' });
        return;
      }

      if (!playerId) {
        if (result.data.type !== 'hello') {
          send({ type: 'error', code: 'AUTH_FAILED', message: 'Handshake required.' });
          socket.close(4008, 'Handshake required');
          return;
        }
        const hello = result.data;
        const connection = hub.connect({
          playerId: hello.playerId,
          name: hello.name,
          ...(hello.token ? { token: hello.token } : {}),
          socket: handle,
        });
        if (!connection.ok) {
          send({ type: 'error', code: connection.code, message: connection.message });
          socket.close(4003, connection.message);
          return;
        }
        playerId = hello.playerId;
        clearTimeout(helloTimer);
        app.log.info({ event: 'ws_connected', playerId, resumed: connection.resumed }, 'ws');
        return;
      }

      hub.handle(playerId, result.data);
    });

    socket.on('close', () => {
      clearInterval(heartbeat);
      clearTimeout(helloTimer);
      if (playerId) {
        hub.disconnect(playerId, connectionId);
        app.log.info({ event: 'ws_disconnected', playerId }, 'ws');
      }
    });

    socket.on('error', () => {
      clearInterval(heartbeat);
      clearTimeout(helloTimer);
    });
  });

  const ticker = setInterval(() => hub.tick(), 500);
  ticker.unref();

  const close = async (): Promise<void> => {
    clearInterval(ticker);
    hub.flush();
    await app.close();
  };

  return { app, hub, close };
}
