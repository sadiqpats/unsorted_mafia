# Testing — what was run, and the results

All results below were produced on 2026-10-15 (macOS, Node 22.23, Chromium headless via Playwright 1.64). Nothing here is reported as passing without having been run.

| Suite | Command | Result |
|---|---|---|
| Typecheck | `npm run typecheck` | ✅ no errors |
| Unit (engine) | `npm test` | ✅ 132 / 132 |
| Integration (real server + socket clients) | `npm test` | ✅ 26 / 26 |
| End-to-end (Playwright, one browser context per player) | `npm run test:e2e` | ✅ 13 / 13 (4.9 min) |
| Production build | `npm run build` | ✅ client + server bundles |
| Dev mode | `npm run dev` | ✅ API, room creation and Socket.IO through the Vite proxy |

## Unit tests — `tests/unit/` (123)
- **Role assignment for every player count 5–22** (18 tests): exact configured roles dealt, at least one Mafia. Default distribution valid and balanced for every count (18 tests). Odd counts work. Out-of-range counts rejected.
- **Invalid / unbalanced configs:** wrong total, duplicate unique role, no Mafia, instant Mafia win, more than 2 villager powers, unknown role, unbalanced warning.
- **Mafia:** kill, can't target own team, plurality with Godfather tie-break, leader mode, changing picks, Godfather excluded by rule, no picks means no kill.
- **Godfather silence:** blocks next-day vote, announced without naming the Godfather, expires after a day, dead Godfather can't act.
- **Detective:** private binary result, alignment mode, Godfather-appears-innocent, result delivered even if killed that night, dead Detective blocked.
- **Doctor:** save, no announcement by default, optional save announcement, self-protect rule.
- **Bodyguard:** once per game, skip doesn't consume, `onSave` mode, stacking with the Doctor.
- **Thief:** take + one-use (target loses and regains it), copy mode, nothing-to-steal, can't steal the Mafia hit, no repeat target, stealing the Judge's weight, ability returned on the Thief's death, alignment option.
- **Priest:** revive + public announcement, no revive option when nobody is dead / living targets rejected, charge limit, alternate rounds, dead Priest blocked (and the allowed variant), lose-role / sit-out-vote options.
- **Villager powers:** off by default, Hunch, Barricade, Rally.
- **Judge:** double weight changes the outcome, configurable weight, not counted when dead.
- **Jester:** wins by day vote, not by night kill, continue-game variant credits the Jester.
- **Voting:** dead / self / double-vote blocks, self-vote and vote-change options, stale-phase (replay) rejection, abstain pile, abstain disabled, tie rules (none, runoff, host), silenced reason.
- **Victory:** Town, Mafia parity, Mafia majority option, survivor neutrals co-win, draw, Mafia win at night.
- **Flow / anti-cheat:** every living player gets an action (decoy), auto-resolve only when all locked in, duplicate submissions blocked, dead players blocked, timer expiry advances, a disconnected player can't freeze the night, reveal early-advance, pause/resume/extend, manual mode, public host corrections, play-again reset.
- **Lobby:** duplicate names (case-insensitive), capacity, late-join rules, name sanitising.

## Update: photos, Before Nightfall round, Imposter, Vercel + Render
- **Unit (+9):** pre-night round appears only when a Thief or Imposter is in the setup (and keeps running after they die), with a choice for every living player. Thief takes over the stolen job permanently, usable the same night, victim plays as a Villager, and the public announcement contains no names. Imposter revives from round 2, can skip, unlimited by default or limited, dead Imposter can't act, wins with the Mafia by default. A revival that hands the Mafia parity ends the game.
- **Integration (+6):** photo upload → URL broadcast (never the image bytes in socket payloads), served image; rejects non-images, spoofed types, oversize and missing/forged tokens; self-clear, host removal (players can't), kick deletes the photo; photos survive a new game and a server restart. CORS allows only the configured website origin, including WebSockets.
- **E2E (+3):** players join with a real photo through the picker (resized to 320px on the phone); the TV wall shows every face and **cuts the eliminated player's photo**; Thief steals the Detective's job Before Nightfall and every phone sees the no-names announcement, then the Thief investigates that night; the Imposter revives a dead player before night 2.
- A real bug found by the photo E2E test and fixed: the Content-Security-Policy blocked `blob:` images, which would have broken photo picking in production.
- Not tested: the live camera (`getUserMedia`) path, because headless browsers have no camera. The phone-camera file-input path is the same code as the gallery path, which is tested.

## Integration tests — `tests/integration/server.test.ts` (20)
Real HTTP + Socket.IO server on a random port with a temporary SQLite file:
room creation and joining by code; clear errors for invalid / duplicate / full / started rooms; input validation; **forged-token sockets rejected**; **players can't run host commands**; malformed commands rejected; **TV display is read-only and receives no roles**; kicked players are disconnected and their token stops working; closing the room ends all sessions; **every payload of a whole round contains only the receiving player's role** (Mafia see only teammates); **investigation results reach only the Detective**; a playing host gets no secrets; full 5-player match over the network with synchronised clients and correct tally; **duplicate actionId replay ignored, stale phase rejected, host double-click advances once**; rate limiting; real-time lobby broadcasts; **refresh → same seat / role / phase**; **game survives a full server restart**; host-issued rejoin code moves a seat and logs out the old device (single-use); audit log records joins and forbidden attempts.

## End-to-end — `tests/e2e/` (10), every player in a separate browser context on a Pixel 7 profile
1. **5 players, complete match:** each phone reveals exactly the server-dealt role. **Mafia elimination**. **Detective investigation** (private, absent from other phones' HTML). **Refresh mid-game** keeps seat and role. Dead player can't vote. Town wins and every phone shows the result.
2. **Doctor protection** saves the Mafia target.
3. **Godfather silences** a player, who is **blocked from voting**.
4. **Judge's double vote changes the tally** (2–2 unweighted becomes 3–2).
5. **Priest revives** an eliminated player (public announcement).
6. **Jester wins** through daytime elimination.
7. **10-player** game played to a Town victory.
8. **22-player** game (all 10 characters in play) played to a Town victory.
9. **Unauthorized access:** no session → redirected to join; forged token → refused; TV display shows no roles.
10. **Network-level privacy:** raw WebSocket frames received by a villager's browser contain no other player's role.

## Verified features (definition-of-done checklist)
- [x] Host creates a room; QR + code + invite link
- [x] Multiple real players join from separate browsers/devices (up to 22 tested)
- [x] Any player count 5–22 (dropdown + validated number field)
- [x] Roles assigned securely (CSPRNG on the server) and privately
- [x] Players see only their own role and private results (tested at payload and WebSocket-frame level)
- [x] All 10 characters' abilities, incl. configurable Thief / Priest / Villager powers
- [x] Host runs and controls the game (advance, pause, timers, corrections, tie-break, end, restart, close, rejoin codes)
- [x] Night actions resolve in a documented order
- [x] Discussion and voting synchronised across devices
- [x] Silenced players can't vote; dead players can't act
- [x] Revivals restore players (with configurable role/effects)
- [x] Weighted Judge votes counted on the server
- [x] Win conditions evaluated on the server
- [x] Survives refreshes, disconnects and server restarts
- [x] Server-side authorization, validation, idempotency, rate limiting, audit log
- [x] Starts locally with the documented commands

## Remaining limitations (honest list)
- **Not deployed.** Deployment files (Dockerfile, `render.yaml`) and instructions exist, but no deployment was performed, since that needs your hosting account. The Docker image was **not built** here because Docker isn't installed on this machine.
- **Supabase was not used.** See ARCHITECTURE.md for the trade-off. The server is a single process: horizontal scaling would need sticky sessions plus a shared store.
- **Not tested on physical phones or on iOS Safari.** E2E ran in Chromium with a mobile (Pixel 7) profile. Hold-to-reveal and the privacy shield use standard pointer/visibility events, but please do one real-device run before your first event.
- **Late joining** is implemented (joiners become Villagers) and unit-tested, but not covered by E2E.
- **Runoff and host tie-break** are unit-tested but have no E2E test.
- **No React component unit tests** (React Testing Library). UI behaviour is covered by the Playwright E2E suite instead.
- **Character art** is hand-drawn SVG line emblems, not commissioned illustrations.
- **Rate limits and the 12-hour room TTL** are sensible defaults and were not load-tested beyond 22 simultaneous browsers.
- Villager optional powers are **proposed suggestions** (off by default) until you finalise them. The Thief and Priest defaults are documented and configurable.
