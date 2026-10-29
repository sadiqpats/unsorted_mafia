# Draw the Imposter

A one-phone, pass-and-play drawing game at `/draw` (host code needed to start). Everything runs in the browser; nothing is sent to the server except the host-code check.

## Setup
1. **Who's playing:** 3–30 players, optional names. **I'm playing too** decides the default for imposters: a playing host gets *Surprise me*, a host who only runs the game gets *I choose*. Either can be switched.
2. **What do you draw:** 🎬 Filmy (50 Bollywood films), 🤪 Quirky (50 silly scenes), or 🎲 Mix.
3. **Imposters:**
   - **Surprise me (auto):** 1 imposter, then 2, then (on a longer run) 3 or 4, and the last round of the run is a twist — **everyone** is the imposter, or **all but one** (one lonely person knows the word). A run is 3 or 4 rounds long, picked at random, then it starts again.
   - **I choose:** 1, 2, 3, 4, 5, All but 1, or Everyone, changeable before every round on the reveal screen. Numbers that would make everyone the imposter at this table are greyed out.
   - **Secret hint** (on by default): imposters see a vague clue such as "comedy · money trouble". Hints are shared between cards so they don't give the word away.

## A round
Pass the phone → each player peeks (word on a sketchbook page, or the red imposter card with the hint) → everyone draws (optional 60/90 s timer) → reveal → next round. Players can be added between rounds.

Code: `src/client/draw/` — `imposters.ts` (the count logic, unit-tested in `tests/unit/draw.test.ts`), `words.ts` (cards + hints), `DrawImposter.tsx` (screens).
