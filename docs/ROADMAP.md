# Roadmap

Execution order is **C → B → D**. Phase C is complete; the milestones below are sequenced.

## Phase C — done

- [x] Deterministic engine: movement, jumps, barriers, reachability, route preservation, win/draw,
      history, undo, replay, serialisation.
- [x] Local hotseat matches with per-player clocks and increments.
- [x] Eight deterministic bot personalities.
- [x] Five solo puzzles with budgets, hints and retry.
- [x] Ten screens: home, modes, arena config, match, result, bots, puzzles, profile, leaderboard,
      settings.
- [x] Responsive SVG/CSS board, keyboard shortcuts, touch, reduced motion, non-colour indicators.
- [x] Local persistence (refresh-safe), local Elo, XP, achievements, leaderboard.
- [x] Engine, bot and web logic tests; production build; browser smoke verification.

## M2 — Phase B: mode identity, puzzles and coaching

- Implement Survival waves and Chaos modifiers as engine-level rulesets (no forked engines).
- Solver-backed puzzle content: minimum-move and limited-barrier objectives, validated solutions,
  weekly sets, streak persistence, hints derived from search.
- Deterministic coaching: turning points, missed wins, inefficient barriers, alternative legal moves.
  Label every claim as proven or heuristic.
- Tests: mode rulesets, puzzle solvability, coaching honesty.

## M3 — Phase B: authoritative multiplayer

- Fastify modular monolith: auth, WS gateway, match service, clock service, matchmaking, rating.
- PostgreSQL schema and migrations: users, sessions, matches, match_players, match_moves,
  match_events, results, ratings, rating_history.
- Server-authoritative clocks, reconnect tokens, heartbeats, grace windows, duplicate-session
  protection, idempotent results.
- Matchmaking: casual/ranked, expanding Elo tolerance, cancellation, labelled bot fallback, private
  rooms/invite codes, rematch.
- Tests: duplicate/simultaneous moves, reconnect, timeout vs inactivity vs abandonment, server restart
  recovery, rating.

## M4 — Phase B: communication and social

- Reaction catalogue (categories A–I), custom quick messages with filtering, cooldowns and reports.
- Audio system: original voice/SFX packs, metadata, entitlements, volume channels, preloading, silence.
- Friends, requests, presence privacy, blocks, reports, recent opponents, spectators, basic tournaments.
- Tests: cooldown/rate limits, mute/block/report, invalid reaction ids, entitlement gating.

## M5 — Phase B: monetisation, progression and admin

- Central entitlement service; configurable plans (Free/Plus ₹99/Pro ₹199/Elite ₹399 hypotheses).
- Razorpay checkout + verified webhooks, idempotency, cancellation, refunds, grace periods,
  restoration, revocation; safe test-mode fallback.
- Cosmetic store (themes, pieces, barriers, frames, avatars, reaction animations, sound packs).
- Seasons, missions, achievements with server-validated, non-repeatable reward claims.
- Global/friends/weekly/seasonal leaderboards with seasonal resets that preserve history.
- Admin dashboard with RBAC, audit logs, moderation actions, feature flags and anti-cheat signals.
- Tests: verified/invalid purchases, duplicate webhooks, cancellation, expiry, restoration, claims.

## M6 — Phase D: analytics, hardening, launch

- Event outbox and schema-versioned analytics events; heartbeat-based playtime intervals; aggregate
  and retention pipelines.
- Admin Analytics Command Center (`/admin/analytics`) with Executive Overview, Registrations, User
  Directory + CSV, per-player analytics, real-time monitor, playtime, retention cohorts, game
  performance, messaging, revenue and technical health; metric dictionary.
- Player Insights (`/profile/stats`) with privacy controls and own-data-only authorisation.
- Load tests, SLOs, backups/restore drill, monitoring/alerting, staging billing verification,
  production-readiness checklist, rollback runbook.
- Native packaging (Capacitor/TWA) and store billing requirements if pursued.

## Explicit non-goals for now

- No fabricated online opponents. Bot games are always labelled.
- No simulated payments. Development billing is off until a verified provider flow exists.
- No claim of concurrency capacity without load-test evidence.
