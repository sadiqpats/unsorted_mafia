# Testing: what was run, and the results

Latest full run: 2026-10-17 (macOS, Node 22.23, Chromium headless via Playwright 1.64), after the pre-party audit (fuzz test of 1,500 random Mafia games, visual walkthrough of every screen). Nothing below is reported as passing without having been run.

| Suite | Command | Result |
|---|---|---|
| Typecheck | `npm run typecheck` | ✅ no errors |
| Unit (Mafia engine + rules, Charades engine/deck/views) | `npm test` | ✅ 168 / 168 |
| Integration (real server + socket/HTTP clients) | `npm test` | ✅ 33 / 33 |
| End-to-end (Playwright, one browser per player) | `npm run test:e2e` | ✅ 32 / 32 |
| Production build | `npm run build` | ✅ |

## Mafia fuzz test
- **`tests/unit/fuzz.test.ts`:** plays 1,500 random games (5–22 players, random role mixes and house rules, random picks, skips, missed actions, clock timeouts, opening breaks, pauses, ±30 s, host eliminate/restore, ties). After every step it checks: no crash, no legal move refused, nobody acts during the break, the dead never act or vote, no dead player offered as a target (except to revive), nobody comes back without a revival, Dawn/Night/Vote always have a clock and the discussion never does, a paused game never moves on, a decided game always ends, the Godfather wins exactly when the Mafia do, roles never leak in the public view, and every game finishes.

## Dumb Charades
- **Unit — `tests/unit/charades.test.ts` (20):** 10 new cards per turn, flipping back to an earlier card (that one is acted and recorded), captain's ✅, the host's screen hides the movie by default; "one more round" after an early end finishes the cut-short round; the host can flip the card for a captain whose phone died; a captain's swap never bounces the host's ✅; the deck (≥ 950 films, all 2000+, ≤ 4 words, no duplicates, every card has genre and leads; difficulty counts in sync); word counting; turn order, rounds, scoring, timeout, tie → one more round; only the acting captain can flip/swap/pass; limited swaps with the clock still running; no movie dealt twice; pause/resume; host fixes a wrong call; stale taps refused; **who sees the movie** (deck mode: host + acting captain only; rival mode: the picker too; TV only after the turn); rival picks (deck title accepted, > 4 words refused, found online, too old / not Hindi refused, not found → host approves, acting team can't pick its own).
- **Integration — `tests/integration/charades.test.ts`:** host code required, one captain per team (409 `seat_taken`), room info, title suggestions.
- **End-to-end — `tests/e2e/charades.spec.ts` (3):** a full game with host, two captains and the TV in **deck** mode (flip, swap, judge, pass, fix a call, end, tie-breaker); **rival** mode (word-limit check, suggestion, rival's pick revealed only on flip, a real Wikidata lookup refusing a 1975 film, an unknown title going to the host who refuses it, random card); and a **dead captain phone** (host flips the card, frees the seat, a new captain joins mid-game).
- **Deck check — `npx tsx scripts/verify-movies.ts`:** looks up every card on Wikidata. Last run: 976 checked; the 4 real mistakes were removed. Remaining flags are Wikidata gaps (films missing a Hindi-language tag) or festival premiere dates a year before the cinema release.

## Unit — `tests/unit/`
- **distribution:** a valid default game for every player count **5–26**; Mafia stay ~¼ of the table (6 at 25–26); exact role dealing for every count; invalid/unbalanced configs; new mix (2 Mafia from 7, Godfather from 8, no Priest/Bodyguard).
- **roles (31):**
  - Mafia kill and team decision; deaths announced by name only.
  - **Godfather:** doesn't kill; silences; the Town wins once all Mafia are dead even with him alive; counts on the Mafia side for a takeover.
  - **Doctor:** self-save allowed but not two rounds in a row (alternate rounds).
  - **Thief:** Dawn from round 1 with a power list, never people; steals for one round only; never learns whose; the victim is told and gets the dummy button; no same power two rounds in a row; stealing the **Mafia Hit** means a solo kill while the robbed Mafia gets the dummy button; with two Mafia, two kills; power list unaffected by deaths; can steal the Judge vote; Dawn continues after his death.
  - **Imposter:** Neutral by default, wins by surviving; no revival in round 1; revives or skips from round 2; revival announced without naming him.
  - Judge ×2, Joker, Villager powers, and no role revealed before game over.
- **flow (31):**
  - Voting rules and ties.
  - Victory conditions.
  - Every living player gets an action.
  - **No timers by default:** nothing advances on time, only when everyone has acted; the Day ends when everyone has voted; optional timers still work.
  - Pause/resume; host can always advance; public host corrections; lobby rules.
- **announcements (8)**, regression tests for glitches seen in a live game: no public phase chatter; each phase's news shows exactly what happened since the previous phase (Day = last night, Night = the vote or Dawn, Dawn = the vote), never repeated; runoff announced once; Game Master announcements reach everyone; two attackers on one victim = one death line.
- **deploy-config (5):** Vercel → Render fallback; allowed origins.

## Integration — `tests/integration/`
- **server (20):** room create/join; errors; forged tokens; host-only commands; payload-level role privacy; private Detective results; full 5-player match over the network; replay and stale-phase protection; rate limits; refresh; full server restart; rejoin codes; audit log.
- **hostcode (5):** with `HOST_CODE` set, hosting needs the code (players never do) and 5 wrong codes lock the address out; without it, anyone can host and the Host page hides the code box.
- **photos (4)**, **cors (2)**.

## End-to-end — `tests/e2e/` (one browser context per player)
1. **5 players, no timers:** full match. Night starts as soon as everyone has seen their role, with no clock. Mafia kill, private Detective result, refresh keeps seat and role, last vote ends the Day, Town wins.
2. Doctor protection saves the target.
3. **Godfather's card lists the Mafia** (the Mafia's card doesn't list him). He silences a player, who is blocked from voting.
4. Judge's double vote decides the outcome.
5. Joker wins by being voted out.
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
- Host code is optional: until `HOST_CODE` is set in Render, anyone with the link can host.

## Thief & anonymous Mafia plan
- **Unit (`roles.test.ts`):** a Thief with the stolen Mafia Hit joins the vote (team, changeable); the plan never contains a voter's id or name; 2 Mafia + Thief = 3 anonymous votes and **one** kill; the anonymous order changes between nights; Resurrect can be stolen from round 2, cancelling the Imposter's Dawn revive, and the Thief revives at night.
- **End-to-end (`gameplay.spec.ts`):** the Thief steals the Mafia Hit, sees “you are Mafia N” and no Mafia names; each Mafia sees “Mafia N wants to kill X” and never the Thief's name; the shared target dies. The Godfather test checks the anonymous plan and the named family reminder.

## Godfather (Evil), the clock, Bollywood Mafia Night
- **Unit:** the Godfather is Evil and doesn't count for a Mafia takeover (1 Mafia + Godfather vs 2 plays on; 2 Mafia vs 2 ends it) but wins with them; the clock is always on (Dawn 30 s and Night 60 s after a break nobody can act in, an open-ended discussion, a 60 s vote; a missed action just doesn't count); Bollywood names, illustrations and announcement text.
- **End-to-end (`bollywood.spec.ts`):** Bollywood cards show “Gabbar (Mafia)” / “Munna MBBS (Doctor)”; the break shows “Night begins in…” then the panel opens. The gameplay tests open the vote from the Day discussion.

## Sound modes & the dead's updates
- **Unit (`announcements.test.ts`):** kills, quiet nights, vote-outs and the final result are tagged for sound design.
- **End-to-end (`sound.spec.ts`):** online — music starts on players' phones at Night, fades for the reveal, the tension build and kill sound play on every phone, and music returns the next night; the dead player sees the news and the announcements at Night. Offline — player phones play nothing and no music; the host's device plays the night and kill sounds.

## Connection & privacy on awake phones
- **`tests/e2e/connection.spec.ts` (2):** a phone that loses its network mid-game shows "Connection lost", reconnects on its own when the network returns, keeps its seat and role and can act; Screen Wake Lock is requested in a game room and released when leaving.
- **Host plays too (`charades.spec.ts`):** the host captains Team 1 on the same phone (face-down card, new card, ✅ They got it!) and judges Team 2 with the movie hidden.
- **Anti-peek:** the Mafia Town square never tags teammates (Godfather e2e test); the Charades captain's card hides itself when left alone (charades e2e test).
- **Integration:** both games answer the liveness probe instantly.
