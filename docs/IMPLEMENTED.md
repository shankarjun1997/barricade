# Implemented features — status matrix

Legend: **Done** = implemented and verified in this repository · **Online core** = implemented and
verified locally; production hosting pending · **Planned** = not implemented.

## Game core

| Requirement | Status | Notes |
| --- | --- | --- |
| Deterministic rules engine | Done | `packages/engine`, pure functions, typed errors |
| Movement, jumps, collision | Done | orthogonal + straight/diagonal jumps |
| Barrier rules | Done | overlap, crossing, bounds, stock, route preservation |
| Win/resign/timeout/draw | Done | explicit result reasons |
| History, undo, replay, serialisation | Done | local/puzzle; online uses server history |
| Server-authoritative online engine | Online core | server validates every move with the same engine |
| Engine tests | Done | 42 tests |

## Interface

| Screen | Status |
| --- | --- |
| Home dashboard | Done |
| Mode selection | Done |
| Arena configuration + preview | Done |
| Local match | Done |
| Result | Done |
| Bot selection | Done |
| Puzzles | Done |
| Profile | Done |
| Leaderboard (local) | Done |
| Settings | Partial — audio/motion/theme/data controls done; social controls arrive with accounts |
| Online lobby (identity, matchmaking, rooms, open rooms, online leaderboard) | Done |
| Online match (server clocks, presence, result, rematch) | Done |

Responsive layout, keyboard shortcuts, touch targets, focus states, reduced motion, non-colour glyphs,
screen-reader status: **Done**. No horizontal overflow at 390 px in local and online flows.

## Online multiplayer

| Feature | Status |
| --- | --- |
| Global matchmaking by mode/clock | Done (expanding Elo tolerance) |
| Public/private rooms, codes, invite links | Done |
| Server-authoritative moves and turns | Done |
| Server clocks, increment, timeout | Done |
| Reconnect window + countdown | Done (60 s default) |
| Duplicate-session protection | Done |
| Forfeit vs timeout vs abandonment | Done |
| Rematch (colours swapped), draw offers, resignation | Done |
| Idempotent duplicate move submission | Done (`clientMoveId`) |
| Server restart recovery, paused clocks | Done (JSON persistence) |
| Guest identity with hashed tokens | Done |
| Server-side Elo + online leaderboard | Done |
| Origin allow-list, Zod validation, rate limits | Done |
| Persistence in PostgreSQL/Redis | Planned |
| Accounts and guest linking | Planned |
| Spectators and tournaments | Planned |
| Multi-replica scale | Planned (single-writer JSON now) |
| Hosted production endpoint | Pending credentials |

## Clocks

| Feature | Status |
| --- | --- |
| Bullet/Blitz/Sprint/Dash/Rapid/Classic/Correspondence/Unlimited | Done |
| Local clocks + increment | Done |
| Online server-authoritative clocks | Done |
| Inactivity/disconnect/queue/server-restart distinction | Done for disconnect/clock/abandon/restart; inactivity policy beyond disconnect is Planned |

## Bots, puzzles, progression

| Feature | Status |
| --- | --- |
| Eight personalities, bounded search, seeded determinism | Done |
| Five validated puzzles, budgets, hints, retry, undo | Done |
| Daily puzzle rotation | Done (UTC) |
| Solver-backed tactical/weekly puzzles | Planned |
| Coaching | Planned |
| Local Elo, XP, levels, streaks, achievements | Done |
| Online Elo, W/L/D, leaderboard | Done |
| Local leaderboard with bot anchors | Done |
| Seasons, missions, cosmetic rewards | Planned |

## Monetisation, social, admin, analytics

All **Planned**. No placeholder purchases, fake players or simulated analytics are shown. Razorpay test
credentials exist locally but no billing code is active.

## Testing summary

| Suite | Result |
| --- | --- |
| Engine unit tests | 42 passed |
| Bot tests (incl. full self-play legality) | 15 passed |
| Web logic (clocks, settlement, puzzles, Elo) | 23 passed |
| Server hub + HTTP/WebSocket integration | 24 passed |
| **Total** | **104 passed** |
| ESLint | Passed |
| Typecheck (engine, bots, protocol, server, web) | Passed |
| Production web build / server bundle | Passed |
| Local browser smoke | Passed (`npm run smoke`) |
| Two-player online browser smoke | Passed (`npm run smoke:online`) |
