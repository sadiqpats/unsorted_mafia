# Architecture & security

## Stack (and why it differs from the suggested Supabase stack)

| Layer | Choice |
|---|---|
| Client | React 19 + TypeScript + Vite, Tailwind CSS v4, react-router |
| Realtime | Socket.IO (WebSocket with HTTP long-polling fallback, auto-reconnect) |
| Server | Node.js 22 + Express 5, one authoritative process |
| Database | SQLite via Node's built-in `node:sqlite` (WAL mode) |
| Validation | Zod on every HTTP body, every socket command and all settings |
| Tests | Vitest (unit + integration against a real server) and Playwright (multi-browser E2E) |

**Trade-off vs Supabase.** The brief preferred Supabase (Postgres + RLS + Realtime + Edge Functions). I chose a single authoritative Node server for three reasons:

1. **Privacy is easier to prove.** With Supabase Realtime, every secret table needs row-level-security policies that cover both queries *and* subscriptions, and one mistake leaks roles. Here the full game state never leaves the server. Each socket gets a projection built for that viewer (`src/server/views.ts`), so there is no database a client can query at all.
2. **Real transactions without stored procedures.** Node runs each command synchronously: validate → mutate → persist → broadcast. Two commands for one room can never interleave, and a failed command is rolled back from a snapshot.
3. **It runs and is tested anywhere.** There are no external accounts or credentials, and `npm install && npm run dev` gives a working multiplayer game. Supabase would need a cloud project or Docker, which this build environment didn't have, so it could not have been tested end to end.

**What you give up:** horizontal scaling. One process holds the rooms. That is plenty for a party brand (hundreds of concurrent rooms), but scaling to multiple instances needs sticky sessions plus moving room state to Postgres/Redis (the `Store` class is the only place to change). SQLite also needs a persistent disk in production.

## Code map

```
src/shared/           ← used by server, tests and (data-only parts) client
  roles.ts            character + ability registry (data-driven)
  settings.ts         every house rule, defaults, Zod schema
  distribution.ts     default role table for 5–26 players + validation/warnings
  engine.ts           the authoritative state machine (server-only at runtime)
  protocol.ts         Zod schemas for every client command
  types.ts            Room / Player / Game types
  view-types.ts       what clients receive
src/server/
  app.ts              Express routes, Socket.IO auth + fan-out, tick loop
  rooms.ts            RoomService: sessions, command dispatch, idempotency, rollback
  views.ts            PRIVACY BOUNDARY: public / player / host projections
  store.ts            SQLite persistence + append-only audit log
  security.ts         secure RNG, tokens, hashing, rate limiter
src/client/           React app (pages/, components/, lib/)
tests/unit            engine tests (every role, rule and edge case, 5–26 players)
tests/integration     real server + socket clients (auth, privacy, persistence…)
tests/e2e             Playwright, one browser context per player
```

The client bundle contains no engine code (checked during the build review: `resolveNight` / `NIGHT_RESOLVERS` don't appear in `dist/client`). The client imports only role descriptions, settings defaults and types.

## Data model (persisted per room as one JSON document + audit rows)

| Concept | Where |
|---|---|
| Rooms, room settings | `Room`, `Room.settings` (`rooms` table) |
| Players & sessions | `Room.players[]`: `tokenHash` (SHA-256, never the raw token), `sessionVersion`, `rejoinCodeHash` |
| Game instance | `Room.game`, including a **frozen copy of settings** |
| Secret role assignments | `Player.roleId`, `originalRoleId` |
| Character definitions | `src/shared/roles.ts` (code, versioned with the app) |
| Private actions | `Game.night.actions` |
| Votes | `Game.day.votes` |
| Public events | `Room.log[]` with `visibility: 'public'` |
| Host-only events | `Room.log[]` with `visibility: 'host'` |
| Private results | `Room.privateResults[]` (keyed by `playerId`) |
| Status effects, charges, cooldowns | `Player.silencedRound`, `noVoteRound`, `charges`, `stolen`, `lostAbilities`, `lastReviveRound` |
| History / audit | `audit_log` table: every command, actor, ok/fail, reason |
| Host permissions | `Room.hostTokenHash` (separate from player tokens) |

## Access control

There is no client-side database access, so there are no RLS policies. Instead every request passes these checks:

1. **Room-scoped sessions.** Creating a room returns a 256-bit random host token. Joining returns a player token. Only SHA-256 hashes are stored, and they are compared in constant time.
2. **Socket auth.** The handshake must present `{code, token}`. Unknown tokens are refused (`unauthorized`). The read-only TV display connects with `{display:true}` and gets the **public** projection only.
3. **Re-validated on every command.** If a player was kicked, their seat moved by a rejoin code, or the room closed, the command is refused and the socket disconnected.
4. **Host commands** (`start`, `advance`, `eliminate`, `kick`, …) require the host token. A player token never grants host rights, and the attempt is audited as `forbidden`.
5. **Engine checks** for every action: room status, phase, `phaseSeq`, paused state, actor alive/eligible, ability held with charges left, target in the server-computed list, not already submitted.
6. **Idempotency.** Each command carries an `actionId`. Retries with the same id are acknowledged without being applied again (the last 50 ids per actor are kept).
7. **Rate limits.** 25-command burst per socket (refills 4/s). Per-IP HTTP limit (150 burst, 3/s, configurable) that is generous because venue guests often share one NAT IP.
8. **Input hygiene.** Zod validation, 8 KB JSON bodies, 32 KB socket messages, names stripped of control characters and `<>`, CSP and security headers.
9. **Secure randomness.** Roles are shuffled with Fisher–Yates using `crypto.randomInt`.

### What each viewer receives (`src/server/views.ts`)

| Data | TV / spectator | Player | Host (not playing) | Host (playing) |
|---|---|---|---|---|
| Phase, timer, alive/dead, public feed | ✓ | ✓ | ✓ | ✓ |
| Role of a dead player | if “reveal on death” | same | ✓ | same as public |
| Own role, own charges, own results | — | ✓ | — | ✓ (own seat) |
| Mafia teammates + live team picks | — | Mafia only (alive) | ✓ | own seat only |
| All roles, all night actions, all votes, host log | — | — | ✓ | **—** |
| Who has acted / voted (not what) | counts only | counts only | ✓ | ✓ |

Integration and E2E tests inspect **every payload** a player receives (including raw WebSocket frames in the browser) and fail if another player's role appears.

## Realtime & timing

- After every accepted command or timer tick, the server pushes a fresh projection to each socket in the room.
- Deadlines are absolute server timestamps. Each payload carries `serverNow`, and clients correct for clock skew and only display the countdown.
- A 250 ms server loop advances expired phases. Pauses store the remaining time.
- Clients reconnect automatically (socket.io backoff, plus on `online` / `visibilitychange`), and the server re-sends state on connect.
- Persistence: room state is written to SQLite after every change, so the game survives refreshes **and full server restarts** (tested).
- Inactivity policy: rooms idle for `ROOM_TTL_HOURS` (default 12) are deleted. Closed rooms are deleted after 1 hour.
