# Operations and cost estimate

## Current footprint (Phase C)

| Item | Cost |
| --- | --- |
| Vercel static hosting (Hobby/team) | ₹0 on the existing plan |
| Build/test compute | Local; ~1–2 minutes per verify |
| Database/Redis | None |
| Payments | None (test keys unused) |
| Domain | ₹0 until a custom domain is chosen (~₹800–1,500/yr later) |

Total incremental monthly cost for the prototype: **≈ ₹0**.

## Planned Phase B/D estimate

Assumptions: small early user base (≤5k registered, ≤100 concurrent matches), single region close to
users (Singapore/Mumbai), managed services.

| Service | Assumption | Estimated monthly |
| --- | --- | --- |
| Railway game server (Fastify + WS) | 1 small container, always-on | $5–15 |
| Railway PostgreSQL | 1 GB–10 GB, backups | $5–10 |
| Railway Redis | 256 MB–1 GB | $3–10 |
| Vercel frontend | Existing team plan | $0–20 |
| Error monitoring (e.g. Sentry) | Free tier initially | $0 |
| Object storage/CDN | Audio + cosmetics, <50 GB | $1–5 |
| Transactional email | <10k/month | $0–5 |
| Domain + TLS | Annualised | ~$1.5 |
| **Total** | | **≈ $15–65/month (₹1,300–5,500)** |

Razorpay fees are transaction-based (typically ~2% + GST for domestic cards; confirm current rates),
not a fixed platform cost. Revenue and fees must be reconciled from verified webhook records, not
client redirects.

## Monitoring and recovery (targets for Phase D)

- Structured JSON logs with request ids; no secrets or tokens.
- Error monitoring + alert thresholds for API 5xx, WS failures, matchmaking errors, webhook failures,
  DB latency and queue waits.
- Managed Postgres daily backups; restore drill before launch; documented RPO/RTO.
- Health endpoints for the game server; graceful WS shutdown and reconnect guidance.
- Rate limits and bounded queues; capacity claims only after load tests.

## Performance notes (measured so far)

- Engine reachability is BFS over ≤225 cells; wall validation is bounded by the wall lattice.
- Production client bundle is ~358 kB raw / ~110 kB gzip (Phase C, no code splitting yet).
- No load or concurrency capacity has been measured yet; do not quote player capacity before testing.
