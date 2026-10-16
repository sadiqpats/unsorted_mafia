# Testing: what was run, and the results

Latest full run: 2026-10-16 (macOS, Node 22.23, Chromium headless via Playwright 1.64), after the **Dawn → Night → Day / no-timer** update. Nothing below is reported as passing without having been run.

| Suite | Command | Result |
|---|---|---|
| Typecheck | `npm run typecheck` | ✅ no errors |
| Unit (engine, rules, deploy config) | `npm test` | ✅ 125 / 125 |
| Integration (real server + socket clients) | `npm test` | ✅ 29 / 29 |
| End-to-end (Playwright, one browser per player) | `npm run test:e2e` | ✅ 12 / 12 (3.7 min) |
| Production build | `npm run build` | ✅ |

## Unit — `tests/unit/`
- **distribution:** a valid default game for every player count **5–26**; Mafia stay ~¼ of the table (6 at 25–26); exact role dealing for every count; invalid/unbalanced configs; new mix (2 Mafia from 7, Godfather from 8, no Priest/Bodyguard).
- **roles (31):**
  - Mafia kill and team decision; deaths announced by name only.
  - **Godfather:** doesn't kill; silences; the Town wins once all Mafia are dead even with him alive; counts on the Mafia side for a takeover.
  - **Doctor:** self-save allowed but not two rounds in a row (alternate rounds).
  - **Thief:** Dawn from round 1 with a power list, never people; steals for one round only; never learns whose; the victim is told and gets the dummy button; no same power two rounds in a row; stealing the **Mafia Hit** means a solo kill while the robbed Mafia gets the dummy button; with two Mafia, two kills; power list unaffected by deaths; can steal the Judge vote; Dawn continues after his death.
  - **Imposter:** Neutral by default, wins by surviving; no revival in round 1; revives or skips from round 2; revival announced without naming him.
  - Judge ×2, Jester, Villager powers, and no role revealed before game over.
- **flow (31):**
  - Voting rules and ties.
  - Victory conditions.
  - Every living player gets an action.
  - **No timers by default:** nothing advances on time, only when everyone has acted; the Day ends when everyone has voted; optional timers still work.
  - Pause/resume; host can always advance; public host corrections; lobby rules.
- **deploy-config (5):** Vercel → Render fallback; allowed origins.

## Integration — `tests/integration/`
- **server (20):** room create/join; errors; forged tokens; host-only commands; payload-level role privacy; private Detective results; full 5-player match over the network; replay and stale-phase protection; rate limits; refresh; full server restart; rejoin codes; audit log.
- **hostcode (3):** hosting needs the code (players never do); 5 wrong codes lock the address out; production without `HOST_CODE` refuses to host.
- **photos (4)**, **cors (2)**.

## End-to-end — `tests/e2e/` (one browser context per player)
1. **5 players, no timers:** full match. Night starts as soon as everyone has seen their role, with no clock. Mafia kill, private Detective result, refresh keeps seat and role, last vote ends the Day, Town wins.
2. Doctor protection saves the target.
3. **Godfather's card lists the Mafia** (the Mafia's card doesn't list him). He silences a player, who is blocked from voting.
4. Judge's double vote decides the outcome.
5. Jester wins by being voted out.
6. **Dawn:** the Thief steals *Investigate* for the round without learning whose; the robbed Detective is told; the Thief investigates that night.
7. **Dawn:** the Imposter revives a dead player in round 2 and every phone is told.
8. 10-player game to a Town victory.
9. **26-player game (the maximum, every character)** to a Town victory.
10. Players add photos; the TV wall cuts the eliminated player's photo.
11. Unauthorized access: no session, forged token, TV shows no roles.
12. Network-level privacy: WebSocket frames never carry another player's role.

## Known limitations
- The live camera path (`getUserMedia`) can't be tested headless; the file-input path is tested.
- Not yet tested on physical phones or iOS Safari.
- Render free plan: a restart (deploy or sleep) wipes rooms. See DEPLOYMENT.md.
- `HOST_CODE` must be set in Render before hosting works in production.
