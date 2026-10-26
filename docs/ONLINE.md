# Online architecture and protocol

## Trust boundary

The browser is a renderer and input device. It never decides move legality, clock ownership, match
results or rating changes. The Fastify server loads the same `@barricade/engine` package used locally,
validates every move, owns the canonical clocks and persists results.

```
Browser (React)  ──WS /ws──►  Fastify  ──►  Hub (authority)  ──►  JSON store
     │                            │              │
     ├─ renders MatchSnapshot     ├─ /health     ├─ players (tokens hashed)
     ├─ sends intents only        ├─ /api/lobby  ├─ rooms + codes
     └─ interpolates clocks       ├─ /api/rooms  ├─ matches + moves
                                  └─ /api/leaderboard └─ queue + ratings
```

The server is a modular monolith: transport (`server.ts`), validation (`schemas.ts`), game authority
(`hub.ts`), persistence (`store.ts`). The protocol types are shared with the client through
`@barricade/protocol`.

## Identity

Guests only in this phase:

- The client generates a random player id (`player_<uuid>`) and a display name.
- On first hello, the server issues a 32-byte session token. Only its SHA-256 hash is stored.
- Reconnects must present the same player id and token; otherwise the connection is rejected.
- A second socket for the same player receives `session_replaced` and close code `4001`; the newest
  socket wins. The old socket's late close event cannot disconnect the new one.
- The lobby offers "New guest identity", which abandons the current guest rating and starts fresh.

No passwords, emails or payment data exist in this build. Account linking is a later milestone.

## Protocol

All frames are JSON. Server messages are authoritative snapshots or notices.

**Client → server:** `hello`, `rename`, `queue_join`, `queue_leave`, `room_create`, `room_join`,
`room_leave`, `move`, `resign`, `draw_offer`, `draw_respond`, `rematch_request`, `rematch_respond`,
`match_leave`, `ping`.

**Server → client:** `welcome`, `error`, `lobby`, `queue`, `room`, `match`, `match_end`, `draw_offer`,
`rematch_state`, `notice`, `pong`, `session_replaced`, `server_restart`.

Errors carry a typed code (`AUTH_FAILED`, `INVALID_CONFIG`, `ROOM_NOT_FOUND`, `ROOM_FULL`,
`ROOM_STARTED`, `NOT_YOUR_TURN`, `ILLEGAL_MOVE`, `RATE_LIMITED`, `MATCH_NOT_FOUND`, `BAD_MESSAGE`, …).

`MatchSnapshot` contains the full deterministic `GameState`, both public player records, remaining
clocks at `serverNow`, colour assignment (`youAre`), presence/reconnect deadlines, draw offer, rematch
requests and rating changes. The client interpolates the active clock locally between snapshots for a
smooth display, but the server is the only authority on expiry.

## Matchmaking

- Queue key: `modeId + timeControlId`.
- Pairing scans oldest-first and pairs the closest rating within an expanding tolerance:
  `min(1200, 200 + waitSeconds × 50)` Elo.
- Both players are removed from the queue, a server match is created, colours are assigned (older queue
  entry is Blue) and both receive snapshots.
- Cancellation is immediate. Disconnecting removes the player from the queue.
- No bot is ever secretly substituted. A bot match is always an explicit local choice.

## Rooms

- `room_create` validates the mode/clock combination and arena bounds, then returns a six-character code
  from an unambiguous alphabet (`ABCDEFGHJKLMNPQRSTUVWXYZ23456789`).
- Public rooms appear in `/api/lobby`; private rooms are reachable only by code or invite link.
- Invite links use `/online?room=CODE`.
- Joining fills the single guest slot and immediately starts the match (host Blue, guest Red).
- Waiting rooms expire after 10 minutes or when the host disconnects.
- Room ownership is server-side; the browser cannot start a match or assign colours.

## Clocks and outcomes

- Clocks start when the match is created. Only the player to move loses time.
- On an accepted move the server deducts elapsed time from the mover, adds the increment, validates and
  applies the move, then starts the opponent's turn.
- The server sweep interval checks for expiry every 500 ms.
- Outcomes are distinct:
  - **goal** — engine detects the far row.
  - **timeout** — the authoritative clock reaches zero.
  - **resign** — explicit player action.
  - **forfeit** — the reconnect grace window expires while the opponent is connected.
  - **agreement** — draw offer accepted.
  - **repetition / move-limit** — engine draw rules.
  - **abandoned** — both players offline when deadlines expire. No rating is applied.
- A temporary browser freeze never awards a win immediately; the client must miss the grace window.
- Duplicate or retried move submissions use `clientMoveId`: the first accepted id is remembered per
  player and retries return the current snapshot without applying twice.

## Reconnection and server restart

- A disconnect in an active match sets a per-player deadline (`RECONNECT_GRACE_MS`, default 60 s);
  the opponent sees a live countdown.
- Reconnecting with the same token clears the deadline, restores the exact snapshot and notifies the
  opponent. The clock continues during the window.
- Chat, spectators and suspended-account rules do not exist yet.
- Active matches are persisted. On restart, clocks are shifted by the downtime (paused, not drained),
  both players get a fresh reconnect window and a `server_restart` notice. If neither returns, the match
  is abandoned without rating changes.
- Match records are retained for 30 minutes in memory/JSON for results and rematches.

## Ratings

- Elo with `K = 24`, starting rating 1000.
- Only completed non-abandoned wins/draws update ratings.
- Settlement runs once; later resign/draw/result messages cannot apply a second change.
- W/L/D records update with the rating and are exposed on the online leaderboard.
- Local matches and puzzles never touch online ratings. Premium status (future) cannot affect this.

## Persistence

`DATA_FILE` (default `./data/state.json`) holds:

- players: id, display name, **token hash**, rating, W/L/D, created time;
- rooms: code, host/guest ids, config, visibility, status, match id;
- matches: engine state, move history, clocks, turn timestamp, result, rating changes, last move ids.

Writes are atomic (temp file + rename), debounced by 400 ms and flushed on `SIGTERM`. In containers the
file must live on a persistent volume. **Render Free has no disk**, so the Blueprint sets
`DATA_FILE=/tmp/barricade-state.json`; ratings/records reset when the instance sleeps or redeploys, and
active matches do not survive a spin-down. Use a paid disk or PostgreSQL for durable records. This is
deliberately a single-writer store; horizontal scaling needs PostgreSQL + Redis (see roadmap).
Match/queue state is small for early use, but no capacity claim is made without load tests.

## Security controls in this phase

- Origin allow-list for WebSocket upgrades (`ALLOWED_ORIGINS`).
- Zod validation on every client frame; 64 KiB frame limit; 80 msg/s per connection; HTTP rate limit.
- Server-side engine validation; no client-supplied clocks, ratings or results are trusted.
- Constant-ish token handling: generated with `randomBytes`, compared via SHA-256 hashes.
- No secrets in the client; no PII beyond a chosen display name; no chat or microphone data.
- Rate limiting is per-process; distributed limits arrive with Redis.

## Known limitations

- Guests only; no account recovery across browser storage loss.
- JSON persistence is single-instance; no horizontal scale yet.
- No spectators, tournaments, chat, reactions, friends or moderation tools.
- No anti-collusion/anti-cheat analytics yet.
- Server capacity and latency have not been load-tested.
