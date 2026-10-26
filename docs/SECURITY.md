# Security model

## Current build (local + authoritative online server)

### Game authority

- The server loads the same deterministic engine as the client and validates every move.
- Clients submit intents only. They cannot set clocks, results, ratings or colours.
- Clocks run on the server; expiry, reconnect deadlines and forfeits are evaluated server-side.
- Duplicate move submissions are idempotent via `clientMoveId`; results settle exactly once.
- A second socket for one player replaces the first (close code 4001), preventing two devices from
  controlling the same seat.

### Identity and secrets

- Online guests are a random id plus a server-issued 32-byte token.
- Only the SHA-256 token hash is persisted. Reconnects must present the matching token.
- Lost browser storage means the guest identity/rating cannot be recovered; the lobby can create a new
  guest identity. Accounts and recovery are a later milestone.
- No passwords, emails, payment data or analytics identifiers are collected in this build.
- Browser bundle contains no server secrets. Razorpay keys live only in the git-ignored `.env.local`
  and are unused until billing is implemented.

### Input, transport and abuse controls

- Zod validation on every WebSocket frame; invalid shapes are rejected before the hub.
- WebSocket payload limit 64 KiB; 80 messages/second per connection; HTTP rate limit per IP.
- Browser origin allow-list (`ALLOWED_ORIGINS`) enforced before the WebSocket upgrade completes.
- CORS restricted on HTTP endpoints; no credentials are sent.
- Display names are length/charset validated. No chat exists, so there is no free-text moderation
  surface yet.
- Static web deployment sends CSP (scripts self-only, WebSocket `ws:`/`wss:` only), HSTS via Vercel,
  `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy` and `Permissions-Policy`.
- Server logs do not include tokens or message payloads; Fastify redacts authorisation/cookie headers.

### Persistence and retention

- Guests, ratings, rooms and matches are stored in a JSON file on the server (`DATA_FILE`). Writes are
  atomic and flushed on shutdown.
- Finished matches are retained in memory/JSON for 30 minutes for results and rematches. The JSON file
  itself retains players/rooms/matches until manually pruned; a retention job is required before
  production scale.
- Back up `/data/state.json` before deploys. Do not run multiple server replicas against it.

## Required before public scale

1. **Accounts:** audited authentication, password hashing (Argon2), session rotation, recovery,
   account export/deletion, guest linking with conflict checks.
2. **PostgreSQL/Redis:** transactional match/event storage, idempotent result writes, distributed rate
   limits and queues; no single-writer JSON in production.
3. **Moderation:** report/block/mute, name and custom-message filters, admin RBAC with audit logs,
   appeals and anti-abuse thresholds.
4. **Payments:** server-side Razorpay signature verification, idempotent webhooks, entitlement
   restoration, cancellation/refund handling, test-mode staging verification. Never trust a redirect.
5. **Operational security:** structured error monitoring, alerting, backup/restore drills, dependency
   scanning, secret rotation, load tests and DDoS/rate-limit tuning.
6. **Distributed fairness:** anti-collusion/rating-manipulation analysis, replay retention, spectator
   state isolation.
7. **Privacy:** documented retention for match and (future) chat records, cookie policy, regional
   data-protection review.

## Reporting

Add a security contact and responsible-disclosure policy before enabling accounts or payments. No
production endpoint has been claimed until the hosted server and its verification steps in
`docs/DEPLOYMENT.md` are complete.
