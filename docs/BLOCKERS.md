# Open integrations and blockers

Nothing below is faked in the product. Items list the exact prerequisite.

## Online: live, with durability limits

1. **Render Free durability (current limitation).**
   The server and web app are live: https://barricade-w45u.onrender.com and
   https://barricade-ruby.vercel.app. Free-tier constraints remain:
   - the instance sleeps after inactivity (first connection can take 30–60 s);
   - there is **no persistent disk**; `DATA_FILE=/tmp/barricade-state.json` resets on sleep/redeploy, so
     online ratings, W/L/D and the leaderboard are demo-only and active matches are lost on spin-down.
   Fix: Render Starter + disk (~$7/mo), Railway/Fly with a volume, or the planned PostgreSQL/Redis
   migration. Do not present free-tier rankings as durable competitive records.
2. **PostgreSQL + Redis (production scale).**
   Current persistence is a single-writer JSON file. Multi-replica, durable match history, distributed
   rate limits and queues require Postgres/Redis. Do not scale replicas before this migration.
3. **Accounts and recovery.**
   Guests cannot recover a rating if browser storage is lost. Email/password (or OAuth) accounts,
   verification and recovery need an auth implementation and a transactional email provider.

## Later product integrations

4. **Razorpay production billing.**
   Test key id/secret exist in the git-ignored `.env.local`. Live needs plan ids, webhook endpoint and
   secret, verified cancellation/refund/restoration flows, and a staging test run. Billing stays off.
5. **Object storage/CDN.**
   Needed for production voice/sound packs and cosmetics; Phase C synthesizes audio locally.
6. **Moderation and admin.**
   Reports, blocks, RBAC admin dashboard, audit logs and anti-cheat tooling are not built.
7. **Analytics pipeline and dashboards.**
   Event outbox, playtime intervals, retention cohorts, revenue analytics and the admin command center
   remain Phase D.
8. **Native apps and custom domain.**
   PWA manifest exists; store packaging/billing and a custom domain are not started.

## Known limitations of the current online build

- Single server instance, single-writer JSON store; no horizontal scaling or Redis queue.
- Guest-only identity; no cross-device account recovery.
- No spectators, tournaments, chat, reactions, friends or reports yet.
- No anti-collusion detection; ratings are Elo only.
- No load/concurrency capacity has been measured; do not quote a player capacity yet.
- Server data retention is manual (JSON file); a retention job is required before scale.
