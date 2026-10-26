# Implemented features — status matrix

Legend: **Done** = implemented and verified in this repository · **Partial** = working subset, clearly
labelled · **Planned** = not implemented.

## Game core

| Requirement | Status | Notes |
| --- | --- | --- |
| Deterministic rules engine | Done | `packages/engine`, pure functions, typed errors |
| Grid movement, jumps, collision | Done | orthogonal moves, straight + diagonal jumps |
| Barriers, overlap, crossing, bounds | Done | H/V walls on the lattice |
| Route preservation | Done | BFS check for both players on every wall |
| Win, resign, timeout, draw | Done | goal, resign, timeout, forfeit, agreement, repetition, move limit |
| Move history, undo, replay | Done | deterministic rebuild from move list |
| Reconnect-safe local state | Done | localStorage, validated on load, refresh verified |
| Unit tests | Done | 42 engine tests |

## Interface

| Screen | Status |
| --- | --- |
| Home dashboard | Done |
| Mode selection | Done |
| Arena configuration + preview | Done |
| Active match | Done |
| Match result | Done |
| Bot selection | Done |
| Puzzle selection | Done |
| Player profile | Done |
| Leaderboard (local) | Done |
| Settings / social preferences | Partial — audio, motion, theme, data controls done; communication toggles documented, activated in Phase B |

Responsive layout, keyboard shortcuts, touch targets, focus states, reduced motion, non-colour pawn
glyphs and screen-reader status: **Done**. No horizontal overflow at 390 px (verified).

## Modes and configuration

| Feature | Status |
| --- | --- |
| 5–15 board sizes, custom dimensions | Done |
| Presets 7/9/11/13 | Done |
| 0–24 barriers, rule-validated | Done |
| Nine mode configurations | Done |
| Survival waves / Chaos modifiers | Planned (UI labels this) |
| Rules preview before match | Done |

## Clocks

| Feature | Status |
| --- | --- |
| Bullet/Blitz/Sprint/Dash/Rapid/Classic/Correspondence/Unlimited | Done (local) |
| Increment handling | Done |
| Local timeout and result | Done |
| Server-authoritative clocks | Planned (Phase B) |
| Inactivity vs disconnect vs queue timeout | Planned (Phase B) |

## Bots and puzzles

| Feature | Status |
| --- | --- |
| Eight personalities | Done |
| Legal-move search, heuristics, bounded alpha-beta | Done |
| Seeded determinism | Done |
| Five validated puzzles with budgets/hints/retry/undo | Done |
| Daily puzzle rotation | Done (UTC) |
| Solver-backed tactical puzzles / weekly sets | Planned |
| Post-match coaching | Planned |

## Progression and competitive

| Feature | Status |
| --- | --- |
| Local Elo (bot matches only) | Done |
| XP, levels, streaks, achievements | Done (local) |
| Match history, favourite mode, playtime | Done (local) |
| Local leaderboard with bot anchors + records | Done |
| Accounts, global/seasonal leaderboards | Planned |
| Missions, seasons, cosmetic rewards | Planned |

## Multiplayer, social, messaging, monetisation, admin, analytics

All **Planned** for Phase B/D. No placeholder purchases, fake humans or simulated analytics are shown.
Razorpay test credentials are available locally, but no billing code is active.

## Testing summary

| Suite | Result |
| --- | --- |
| Engine unit tests | 42 passed |
| Bot tests (incl. full self-play legality) | 15 passed |
| Web logic tests (clocks, settlement, puzzles, Elo) | 23 passed |
| Typecheck (engine, bots, web) | Passed |
| Production build | Passed |
| Browser smoke flow + mobile overflow check | Passed (Playwright, system Chrome) |
