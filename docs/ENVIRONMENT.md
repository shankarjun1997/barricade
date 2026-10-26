# Environment variables

Phase C (the current build) requires **no environment variables** to run locally or as a static
deployment. The game is fully local.

## Web client

| Variable | Required | Purpose |
| --- | --- | --- |
| `VITE_API_URL` | No | Future game API base URL. Empty in Phase C. |
| `VITE_RAZORPAY_KEY_ID` | No | Future public Razorpay key id. Never put a key secret in a `VITE_` variable. |

Copy `.env.example` to `.env.local` for local overrides. `.env.local` is git-ignored.

## Game server (Phase B, not built yet)

These are reserved. They are documented now so secrets never leak into the client and so deployment
configuration is ready.

| Variable | Purpose |
| --- | --- |
| `PORT`, `HOST` | Fastify listen address |
| `DATABASE_URL` | PostgreSQL connection (Railway/Neon/Supabase) |
| `REDIS_URL` | Matchmaking queues, rate limits, presence |
| `SESSION_SECRET` | 32-byte random hex for session signing |
| `CORS_ORIGIN` | Allowed web origin |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | Server-only Razorpay credentials |
| `RAZORPAY_WEBHOOK_SECRET` | Webhook HMAC verification |
| `RAZORPAY_PLAN_ID_PLUS` / `_PRO` / `_ELITE` | Subscription plan ids |
| `BILLING_MODE` | `test` (default) or `live`; payments are disabled unless fully configured |

## Local development credentials

This workspace already has a `.env.local` (git-ignored) containing the Razorpay **test-mode** key id and
secret copied from the user's existing global configuration. They are not used by Phase C and must
never be exposed to the browser or committed. Billing stays off until the server, webhook verification
and cancellation/refund flows are implemented and tested in Phase B.

## Rules

- Never commit `.env`, `.env.local` or real secrets. Only `.env.example` is tracked.
- Server secrets never appear in `VITE_*` variables.
- Rotate any credential that is accidentally exposed.
- Production secrets are set in the hosting provider (Vercel/Railway), not in the repository.
