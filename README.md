# Barricade

A competitive grid-duel game — race your piece to the far side while placing barriers to bend your
rival's route.

**Live:** https://barricade-ruby.vercel.app

**Status: Phase C prototype — playable.** Local duels, eight bots, five puzzles, full clocks and
persistence. Online multiplayer, reactions and subscriptions are Phase B (see the roadmap).

This is an original product: original name, branding, interface, implementation and synthesized
audio. The rules are a public abstract duel; no third-party assets or code are used.

## Play right now

- **Local hotseat** — two players, one board, per-player clocks.
- **Bots** — eight personalities powered by a local legal-move search engine. No external AI API.
- **Puzzles** — five validated solo drills with cast budgets, hints, retries and undo.
- **Modes** — Sprint, Dash, Tempo, Marathon, Survival, Chaos, Fortress, Tactical and Custom, each with
  its own arena and barrier stock.
- **Time controls** — Bullet, Blitz, Sprint, Dash, Rapid, Classic, Correspondence, Unlimited.
- **Progression** — local Elo, XP/levels, streaks, achievements, match history and a local leaderboard.
- **Accessibility** — keyboard shortcuts, touch targets, focus states, reduced-motion support, non-colour
  pawn glyphs, labelled board controls and screen-reader status updates.

Try it locally (Node 20+, npm 10+):

```bash
npm install
npm run dev          # http://localhost:5173
```

> npm 9 has a known workspace/arborist bug with the current vitest tree. Use npm 10+, or
> `npx npm@11 install` if your Node install still ships npm 9.

Or use the production build:

```bash
npm run build
npm run preview      # http://localhost:4173
```

## Monorepo layout

```
packages/engine   Pure, deterministic, zero-dependency rules engine (shared by web, bots, puzzles)
packages/bots     Deterministic bot engine: heuristics, bounded alpha-beta, seeded PRNG
apps/web          React 19 + TypeScript + Vite client; SVG/CSS board; local persistence
docs/             Environment, deployment, security, roadmap, implementation status, operations
```

The engine is the single source of truth. Its state transitions are pure functions; the UI never
decides whether a move is legal, and the same package is ready for the future authoritative server,
replays, puzzle validation and analytics.

## Rules

- Board is `N × N`. Blue starts on the bottom centre and races to the top row; Red starts on the top
  centre and races to the bottom row.
- On your turn, either move one square orthogonally, or place one barrier.
- Adjacent rival: jump straight over them to the next square. If that landing is off-board or behind a
  barrier, jump diagonally to either side of them instead.
- Barriers span two cells. They cannot overlap, cross, sit off the board, exceed your stock, or remove
  every route to a goal for either player.
- Reaching the far row wins. Threefold repetition (configurable) or the ply limit is a draw.
- Resign, draw agreement and clock timeout are explicit, separate outcomes.

Every illegal move returns a typed error (`OCCUPIED`, `WALL_CROSSING`, `ROUTE_BLOCKED`, `GAME_OVER`, …)
and never mutates state.

## Modes

| Mode | Arena | Barriers each | Default clock |
| --- | --- | --- | --- |
| Sprint | 7×7 | 5 | Sprint 1:00 |
| Dash | 9×9 | 10 | Dash 3:00 +1s |
| Tempo | 11×11 | 12 | Rapid 5:00 +3s |
| Marathon | 13×13 | 16 | Classic 10:00 |
| Survival | 9×9 | 8 | Unlimited |
| Chaos | 9×9 | 8 | Dash 3:00 +1s |
| Fortress | 9×9 | 16 | Rapid 5:00 +3s |
| Tactical | 9×9 | 4 | Classic 10:00 |
| Custom | 5–15 | 0–24 | Any preset |

Custom board dimensions are validated. Survival/Chaos special modifiers are explicitly labelled as
Phase B in the UI — this build applies the core ruleset with the selected arena and clock.

## Time controls

Bullet 0:15 · Blitz 0:30 · Sprint 1:00 · Dash 3:00 +1s · Rapid 5:00 +3s · Classic 10:00 ·
Correspondence 24h · Unlimited. Increment is applied to the mover after a legal move. The clock only
runs for the player to move. In Phase C the clock is local and uses real elapsed time; online matches
will be server-authoritative.

## Bots

Nova (Beginner), Pip (Casual), Kestrel (Intermediate), Vale (Advanced), Obsidian (Expert), Bastion
(Defensive), Ember (Aggressive), Jinx (Unpredictable).

The bot engine evaluates shortest-path distance, wall inventory, mobility and centre control, then runs
a bounded alpha-beta search over legal moves (depth 0–3 by personality) with seeded randomness.
Identical state + seed + personality always produces the same move, so bugs are reproducible.

## Testing

```bash
npm test        # engine + bots + web logic
npm run typecheck
npm run build
npm run lint
npm run verify  # lint + typecheck + tests + build
```

Current suite: **42 engine tests, 15 bot tests, 23 web logic tests** — all passing.

```bash
npm run smoke   # real Chrome drives the production build (requires Chrome; builds screenshots in artifacts/)
```

The smoke flow covers: home → local match → barrier placement with a real pointer → undo → resign →
result → rematch → refresh restore → bot match → puzzle solve → settings → mobile layout. It checks for
console errors and horizontal overflow at 390 px.

## Data and privacy

Phase C is local-only. Profile, settings, active match and results live in `localStorage` on the
device. Nothing is uploaded. No account, analytics SDK, payment SDK or external AI service is used.
There is an export/reset control in Settings. See `docs/SECURITY.md` for the future server model.

## Documentation

- [Environment variables](docs/ENVIRONMENT.md)
- [Deployment](docs/DEPLOYMENT.md)
- [Security model](docs/SECURITY.md)
- [Roadmap](docs/ROADMAP.md)
- [Implemented feature matrix](docs/IMPLEMENTED.md)
- [Open integrations / blockers](docs/BLOCKERS.md)
- [Operations and cost estimate](docs/OPERATIONS.md)

## Roadmap in one line

Phase C (done) → Phase B: modes modifiers, solver-validated puzzles, authoritative online multiplayer,
reactions, social, monetisation, admin → Phase D: analytics command center, hardening, load tests,
staging and production readiness.
