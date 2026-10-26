# Operations and cost estimate

## Current footprint

| Item | Cost / status |
| --- | --- |
| Vercel static web (team `builder-os`) | ₹0 on the existing plan; live at https://barricade-ruby.vercel.app |
| Game server | Runs locally / Docker-ready; production host pending |
| Persistence | JSON file; no managed database yet |
| Payments | None (test keys unused) |
| Domain | `*.vercel.app` / hosting default; custom domain later |

Incremental cost while only the web app is deployed: **≈ ₹0**.

## Planned online footprint

Assumes an early user base (≤5k registered, ≤100 concurrent matches), one region close to users
(Singapore/Mumbai), a single server instance until Postgres/Redis are introduced.

| Service | Assumption | Estimated monthly |
| --- | --- | --- |
| Railway game server | 1 small always-on container | $5–15 |
| Railway volume for JSON state | 1 GB | ~$0.25–1 |
| Railway PostgreSQL (next step) | 1–10 GB + backups | $5–10 |
| Railway Redis (next step) | 256 MB–1 GB | $3–10 |
| Vercel web | Existing team plan | $0–20 |
| Error monitoring | Free tier initially | $0 |
| Object storage/CDN (later) | <50 GB | $1–5 |
| Domain + TLS | Annualised | ~$1.5 |
| **Total (current single-instance JSON)** | | **≈ $6–18/month** |
| **Total (with Postgres + Redis)** | | **≈ $15–65/month** |

Razorpay fees are separate and transaction-based; confirm current rates. Revenue must be reconciled
from verified webhook records, never client redirects.

## Runbook (current)

### Health and logs

- `GET /health` → `{ ok, online, activeMatches, rooms, queued, uptimeSeconds }`
- `GET /api/lobby` → counts, open rooms, leaderboard
- Server logs are JSON (Fastify/pino). Do not log tokens or message payloads; authorisation/cookie
  headers are redacted.

### Restart

- Graceful `SIGTERM`: the hub flushes JSON state and closes the server.
- Restored active matches pause clocks by downtime and grant a fresh reconnect window.
- Finished matches remain queryable for 30 minutes.

### Backup / restore

- Before deploys, copy the volume's `state.json` (e.g. `railway volume` snapshot or `cat` via shell).
- If the JSON file is corrupt, the server starts with an empty store instead of crashing. Restore the
  backup to keep ratings/records.
- Do not run multiple replicas against the same file.

### Incident notes

- WebSocket clients reconnect with exponential backoff; the opponent sees the grace countdown.
- Server restart does not award wins; matches resume or abandon without rating changes.
- If the server is unreachable, the web app remains playable locally and shows an online-offline state.

## Performance and limits

- Engine reachability is BFS over ≤225 cells; wall validation is bounded by the wall lattice.
- Web bundle ~394 kB raw / ~119 kB gzip (no route splitting yet).
- Server is a single Node process; the matchmaking queue and rooms are in memory. No load test has been
  run, so no concurrent-player claim is made.

## Before production scale

1. Postgres schema + migrations and transactional result writes.
2. Redis queues/rate limits and multiple replicas.
3. Backups + restore drill, monitoring/alerting, retention jobs.
4. Load tests with measured p95 latency and concurrency.
5. Staging billing verification (when monetisation starts).
