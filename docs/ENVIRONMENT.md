# Environment variables

## Web client (Vite)

| Variable | Required | Purpose |
| --- | --- | --- |
| `VITE_WS_URL` | For online play | WebSocket URL of the game server, e.g. `wss://barricade-server.up.railway.app/ws`. If empty in local development, the client falls back to `ws://localhost:8787/ws`. In production an empty value disables online play with an explicit setup screen. |
| `VITE_API_URL` | No | Reserved for future HTTP APIs. |
| `VITE_RAZORPAY_KEY_ID` | No | Future public Razorpay key id. Never place a key secret in a `VITE_*` variable. |

`VITE_*` values are baked into the build. After changing them on Vercel, redeploy.

## Game server

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `8787` (`8080` in Docker) | HTTP/WebSocket listen port |
| `HOST` | `0.0.0.0` | Listen address |
| `NODE_ENV` | `development` | Set `production` on the server |
| `ALLOWED_ORIGINS` | localhost + production Vercel origins | Comma-separated browser origins allowed to open a WebSocket |
| `DATA_FILE` | `./data/state.json` (`/data/state.json` in Docker) | JSON persistence path; use a persistent volume |
| `RECONNECT_GRACE_MS` | `60000` | Disconnect grace window before forfeit |
| `LOG_LEVEL` | `info` | Fastify/pino log level |

The server does not need a database or Redis for the current single-instance build. Those are planned.

## Local development

```bash
# Terminal 1
npm run server:dev        # ws://localhost:8787/ws, writes apps/server/data/state.json

# Terminal 2
npm run dev               # http://localhost:5173, online defaults to localhost server
```

No environment variables are required for local play. To use a custom server, create `.env.local`:

```bash
VITE_WS_URL=ws://localhost:8787/ws
```

## Reserved for accounts and billing (not active)

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL (future replacement for the JSON store) |
| `REDIS_URL` | Distributed queues, rate limits, presence |
| `SESSION_SECRET` | Session signing for accounts |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | Server-only Razorpay credentials |
| `RAZORPAY_WEBHOOK_SECRET` | Webhook signature verification |
| `RAZORPAY_PLAN_ID_*` | Subscription plan ids |
| `BILLING_MODE` | `test` (default) or `live` |

## Local secrets

This workspace has a git-ignored `.env.local` containing the Razorpay **test-mode** key id and secret
from the user's existing global configuration. They are not used by the online server or the web build.
Billing stays disabled until the payment lifecycle is implemented and verified.

Never commit `.env`, `.env.local` or real secrets. Only `.env.example` is tracked. Production secrets
belong in the hosting provider (Vercel/Railway), not in the repository.
