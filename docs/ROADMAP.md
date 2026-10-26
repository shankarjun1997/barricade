# Roadmap

Execution order is **C → B → D**, with the user's prioritisation of online play ahead of the original
M2 content work.

## Phase C — done

- [x] Deterministic engine: movement, jumps, barriers, reachability, route preservation, win/draw,
      history, undo, replay, serialisation.
- [x] Local hotseat with clocks; eight deterministic bots; five puzzles.
- [x] Twelve screens; responsive board; keyboard/touch/reduced-motion/non-colour indicators.
- [x] Local persistence, Elo for bot games, XP, achievements, local leaderboard.
- [x] Engine, bot and web logic tests; local browser smoke.

## Online multiplayer core — done and locally verified

- [x] Fastify + WebSocket server; shared protocol package; modular hub.
- [x] Guest identity with hashed tokens; duplicate-session protection.
- [x] Global matchmaking by mode/clock with expanding Elo tolerance; queue cancellation.
- [x] Public/private rooms, six-character codes, invite links, lobby listing.
- [x] Server-authoritative moves, turns, clocks, increments and timeout.
- [x] Resign, draw offer/agreement, rematch with swapped colours.
- [x] 60-second reconnect window, opponent countdown, forfeit vs timeout vs abandonment.
- [x] JSON persistence, restart recovery with paused clocks.
- [x] Server-side Elo (K=24), idempotent settlement, online leaderboard.
- [x] Origin allow-list, input validation, frame/HTTP rate limits, security headers.
- [x] Two-browser Playwright smoke: rooms, invite link, moves, Elo, rematch, reconnect, global queue,
      mobile layout.
- [x] **Deploy the game server and set `VITE_WS_URL`.** Live on Render Free at
      https://barricade-w45u.onrender.com; Vercel wired with WSS URL + free-tier notice.
- [ ] Replace the free-tier `/tmp` store with durable PostgreSQL (and Redis) so ratings/history survive
      restarts and redeploys.

## Next — online production hardening

- [ ] PostgreSQL schema + migrations for players, matches, moves, events, ratings; transactional result
      writes and replays.
- [ ] Redis for distributed queues, rate limits and presence; multiple server replicas.
- [ ] Accounts and guest linking (then social features can be built).
- [ ] Matchmaking/load tests with measured concurrency and latency; document limits.
- [ ] Anti-cheat/anti-collusion review; replay retention and match audit tools.
- [ ] Spectator mode (hidden-state safe) and tournament scaffolding.
- [ ] Server metrics/error monitoring, alerting, backup/restore drill.

## M2 content (deferred, still planned)

- [ ] Survival waves and Chaos modifiers as engine-level rulesets.
- [ ] Solver-backed tactics, weekly puzzle sets, puzzle streaks.
- [ ] Deterministic post-match coaching with proven/heuristic labels.

## M4 — communication and social

- [ ] Reaction catalogue (categories A–I), custom quick messages, server cooldowns and reports.
- [ ] Original voice/SFX packs, volume channels, preloading, entitlement gating.
- [ ] Friends, requests, presence privacy, blocking, reporting, recent opponents.
- [ ] Tournaments/spectating productionised.

## M5 — monetisation, progression and admin

- [ ] Central entitlement service; configurable plans (₹99/₹199/₹399 hypotheses).
- [ ] Razorpay checkout, verified/idempotent webhooks, cancellation, refund, restoration.
- [ ] Cosmetics store; seasons, missions, server-validated rewards.
- [ ] Admin dashboard with RBAC, audit logs, moderation, anti-cheat signals.

## M6 — Phase D

- [ ] Analytics event pipeline and playtime intervals.
- [ ] Admin Analytics Command Center (executive, registrations, directory, realtime, retention, game,
      messaging, revenue, technical health) with metric dictionary.
- [ ] Player insights dashboard with privacy controls.
- [ ] Load tests, SLOs, backups/restore, staging billing verification, production checklist, native
      packaging documentation.

## Non-goals for now

- No fabricated online opponents. Bot games are always labelled.
- No simulated payments. Billing remains off until verified end-to-end.
- No concurrency claims without load-test evidence.
