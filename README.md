# Barricade

A competitive grid-duel game — race your piece to the far side while placing barriers to bend your
rival's route.

**Web app:** https://barricade-ruby.vercel.app
**Game server:** live at https://barricade-w45u.onrender.com (Render Free — it sleeps when idle and its
`/tmp` state resets on restart, so online ratings are demo-only for now). The web app is wired to it with
`VITE_WS_URL`.

This is an original product: original name, branding, interface, implementation and synthesized audio.
The rules are a public abstract duel; no third-party assets or code are used.

## Play right now

- **Online global matchmaking** — queue by mode and clock, paired with a real opponent by expanding
  Elo tolerance. No bots disguised as humans.
- **Private and public rooms** — create a six-character code, share an invite link
  (`/online?room=CODE`), or join an open room from the lobby.
- **Server-authoritative duels** — the server validates every move with the shared engine, owns clocks
  and increments, enforces turns, records results and computes Elo. Clients never decide their own win.
- **Reconnection** — 60-second reconnect window, duplicate-session protection, server restart recovery
  with paused clocks. Timeout, forfeit, abandonment and matchmaking cancellation stay distinct.
- **Rematch, draw offers, resign** — colours swap on rematch; ratings settle exactly once.
- **Local hotseat** — two players, one device, per-player clocks.
- **Bots** — eight personalities powered by a local legal-move search engine. No external AI API.
- **Puzzles** — five validated solo drills with cast budgets, hints, retries and undo.
- **Modes** — Sprint, Dash, Tempo, Marathon, Survival, Chaos, Fortress, Tactical and Custom.
- **Time controls** — Bullet, Blitz, Sprint, Dash, Rapid, Classic, Correspondence, Unlimited.
- **Progression** — local Elo for bot matches, XP/levels, streaks, achievements, local history and
  leaderboard. Online rating and record live on the server.
- **Accessibility** — keyboard shortcuts, touch targets, focus states, reduced motion, non-colour pawn
  glyphs, labelled board controls and screen-reader status updates.

## Quick start

Node 20+ and npm 10+ are required (npm 9 has a known workspace/arborist bug with the current Vitest tree).

```bash
npm install

# Terminal 1 — authoritative game server on :8787
npm run server:dev

# Terminal 2 — web client on :5173
npm run dev
```

Open http://localhost:5173. Locally the client defaults to `ws://localhost:8787/ws`; two browser
profiles/windows can play each other through the real server.

Production-style run:

```bash
npm run build
npm run server:build
DATA_FILE=./data/state.json npm run server:start   # :8787
npm run preview                                    # :4173
```

## Monorepo layout

```
packages/engine    Pure, deterministic, zero-dependency rules engine
packages/bots      Deterministic bot engine (heuristics, bounded alpha-beta, seeded PRNG)
packages/protocol  Shared WebSocket message, room and match-snapshot types
apps/server        Fastify + WebSocket authoritative game server (rooms, matchmaking, clocks, Elo)
apps/web           React 19 + TypeScript + Vite client; SVG/CSS board; local + online play
docs/              Environment, online architecture, deployment, security, roadmap, status, operations
scripts/           Browser smoke tests (local and two-player online)
```

The engine is the single source of truth. It is used unchanged by the browser, bots, puzzle validation
and the authoritative server, so clients cannot invent a legal move or a different result.

## Online architecture in one minute

```
Web client ── WebSocket /ws ──► Fastify server ──► Hub (authoritative state)
   │                                │                 ├─ rooms / invite codes
   └─ renders snapshots only        │                 ├─ global matchmaking queue
                                    │                 ├─ server clocks + reconnect windows
                                    └─ /health, /api/lobby, /api/rooms, /api/leaderboard
                                                                  └─ JSON store (players, rooms, matches)
```

- Messages are typed and validated with Zod; invalid shapes are rejected before reaching the game hub.
- Guest identity = random player id + server-issued token. The server stores only a SHA-256 hash.
- One live socket per player; a second connection replaces the first (prevents two devices controlling
  one player).
- HTTP is rate-limited, WebSocket frames are size-limited and rate-limited, and browser origins are
  allow-listed.
- Full protocol and rules are in [docs/ONLINE.md](docs/ONLINE.md).

## Rules

- Board is `N × N`. Blue starts bottom-centre and races to the top row; Red starts top-centre and
  races to the bottom row.
- On your turn, either move one square orthogonally, or place one barrier.
- Adjacent rival: jump straight over them; if the landing is off-board or behind a barrier, jump
  diagonally to either side instead.
- Barriers span two cells. They cannot overlap, cross, sit off the board, exceed your stock, or remove
  every route to a goal for either player.
- Reaching the far row wins. Threefold repetition or the ply limit is a draw. Resign, draw agreement and
  clock timeout are explicit, separate outcomes.

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

Online ranked-ready modes are Sprint, Dash, Tempo, Marathon, Fortress and Tactical. Survival/Chaos
special modifiers remain Phase B and are labelled as such in the UI.

## Bots

Nova (Beginner), Pip (Casual), Kestrel (Intermediate), Vale (Advanced), Obsidian (Expert), Bastion
(Defensive), Ember (Aggressive), Jinx (Unpredictable).

The bot engine evaluates shortest-path distance, wall inventory, mobility and centre control, then runs
a bounded alpha-beta search (depth 0–3 by personality) with seeded randomness. Identical state + seed +
personality always produces the same move.

## Testing

```bash
npm run lint
npm run typecheck
npm test              # engine, bots, web logic, server
npm run build
npm run verify        # lint + typecheck + tests + build
npm run smoke         # local Chrome flow against the production web build
npm run smoke:online  # two real browser contexts against the authoritative server
```

Current suites:

| Suite | Tests |
| --- | --- |
| Engine rules | 42 |
| Bots (incl. full self-play legality) | 15 |
| Web logic (clocks, settlement, puzzles, Elo) | 23 |
| Server hub + WebSocket/HTTP integration | 24 |
| **Total** | **104** |

Browser smoke coverage: local match → barriers → undo → resign → result → rematch → refresh restore →
bot match → puzzle solve → settings → mobile; and online rooms → invite link → server moves → resignation
→ Elo → colour-swapped rematch → disconnect/reconnect → global matchmaking → mobile. Both run with zero
console errors and no horizontal overflow at 390 px.

**Production online verification (2026-10-27):** two isolated Chrome contexts completed the full flow
against `wss://barricade-w45u.onrender.com/ws` from https://barricade-ruby.vercel.app — room creation,
invite-link join, server-relayed moves, Elo update, colour-swapped rematch, reconnect inside the grace
window, global matchmaking, and a 390 px lobby with no overflow. Zero console errors.

## Data and privacy

- Local profile, settings, active local match and results live in `localStorage`.
- Online guests get a random id and token; the server stores the token **hash**, display name, rating and
  W/L/D record. No email, password, payment data or analytics are collected in this build.
- Online state is stored in a JSON file (`DATA_FILE`, default `./data/state.json`). It survives normal
  restarts and pauses clocks during downtime. **On Render Free it lives in `/tmp` and resets when the
  free instance sleeps or redeploys**, so ratings/leaderboard are demo-only until a paid disk or
  PostgreSQL is introduced. A single writer is assumed; horizontal scaling needs PostgreSQL/Redis.
- Settings includes local data export/reset. The online lobby includes a new-guest-identity action.

## Deployment

| Piece | Host | Status |
| --- | --- | --- |
| Web client | Vercel, team `builder-os` | Live at https://barricade-ruby.vercel.app |
| Game server | Render Free (`render.yaml` + Dockerfile) | **Live:** https://barricade-w45u.onrender.com |
| Persistence | JSON file | **Render Free:** `/tmp` (resets on sleep/redeploy); paid disk/Postgres needed for durable ratings |
| Payments | Razorpay test keys in git-ignored `.env.local` | Not wired yet; billing stays off |

This deployment is wired: Vercel has `VITE_WS_URL=wss://barricade-w45u.onrender.com/ws` and an honest
`VITE_SERVER_NOTICE`. Render Free sleeps when idle and has no persistent disk, so ratings/leaderboard
reset after a restart or redeploy; active matches do not survive a spin-down. Durable play needs a paid
disk or PostgreSQL. Full steps and alternatives: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Documentation

- [Online architecture and protocol](docs/ONLINE.md)
- [Environment variables](docs/ENVIRONMENT.md)
- [Deployment](docs/DEPLOYMENT.md)
- [Security model](docs/SECURITY.md)
- [Roadmap](docs/ROADMAP.md)
- [Implemented feature matrix](docs/IMPLEMENTED.md)
- [Open integrations / blockers](docs/BLOCKERS.md)
- [Operations and cost estimate](docs/OPERATIONS.md)

## Roadmap in one line

Phase C (local/bots/puzzles) **done** → authoritative online multiplayer + rooms **implemented and
locally verified** → next: hosted game server, PostgreSQL/Redis, accounts, reactions/social,
monetisation, admin, analytics command center, load tests and production hardening.
