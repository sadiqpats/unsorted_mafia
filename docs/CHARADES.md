# Bollywood Dumb Charades

Two teams act out famous Hindi films. Only the two **team captains** and the **host** use phones; a TV shows the scoreboard.

## Who uses what
| Device | Route | What it shows |
|---|---|---|
| Host (the judge) | `/charades/host` → `/c/CODE` | Settings, invite QR codes, the movie being acted, ✅ Guessed it / ❌ Pass, pause, fix a wrong call |
| Team captain ×2 | `/charades/join/CODE?team=1` → `/c/CODE` | Their team's card (flip to reveal, swap, pass), or the movie picker when the rival team acts |
| TV | `/ctv/CODE` | Scores, round, the clock, word blanks, the answer after each turn, movies played, the winner |

Hosting needs the same **host code** as Mafia Night (`HOST_CODE` on Render). Captains never need it.

## A turn
1. **Picking.** *Deck mode:* the acting captain sees a face-down card. *Rival mode:* the other captain types a movie or sends a random card.
2. **Flip = clock starts.** The acting captain taps the card; the movie (title, year, genre, leads, word count) appears on their phone only. They show it to their actor.
3. **Acting.** The TV shows the clock and (optionally) word blanks. The captain may **swap** the card (limited per turn; the clock keeps running; deck cards only) or **pass**.
4. **Judging.** The host taps ✅ (+1 point) or ❌. When time runs out the turn ends on its own.
5. **Reveal.** Every screen shows the movie with a "Sahi Jawab!" or "Arre Yaar!" moment. The host taps **Next**.

Each round = one turn per team. After the last round the higher score wins; on a tie the host can add a tie-breaker round. "New game" goes back to the lobby with the same captains (movies already played stay out of the deck).

## Settings (host, in the lobby)
| Setting | Options | Default |
|---|---|---|
| Rounds | 3, 5, 7, 10, 15 | 5 |
| Time per turn | 1:00, 1:30, 2:00, 2:30, 3:00 | 2:00 |
| Who picks the movie | random card from the deck / the rival captain | deck |
| Card difficulty | Easy (210 blockbusters) / Mixed (474) / Film buff (972) | Mixed |
| Swaps per turn | 0–3 | 1 |
| Word blanks on the TV | on / off | on |
| Who goes first | coin toss / Team 1 / Team 2 | coin toss |

Team names are editable. Mid-game the host can add a round or end the game.

## The deck
`src/server/charades/data/*.ts`: one line per film, `Title|Year|Genre|Lead;Lead|Tier`. The loader (`movies.ts`) drops anything before 2000, longer than four words, or duplicated. Tier 1 = everyone knows it, 2 = well known, 3 = film buffs. The deck lives only on the server, so phones never hold upcoming cards.

To add films, add lines and run `npx tsx scripts/verify-movies.ts` to check them against Wikidata; then update `src/shared/charades/counts.ts` (a unit test tells you the right numbers).

## Rival picks are checked
A typed title must be **at most four words**. If it's in the deck it's accepted instantly. Otherwise the server searches **Wikidata** (free, no key) for a Hindi-language film with that name: released before 2000 or not Hindi → refused with a reason; found → becomes the card (year, genre and cast from Wikidata); not found or Wikidata unreachable → the host decides (✅ Allow / ❌ Refuse). A movie can't be played twice in one session.

## Code map
- `src/shared/charades/`: types and protocol (`types.ts`), the rules (`engine.ts`, pure), title helpers (`movie.ts`).
- `src/server/charades/`: the room service (`service.ts`), per-viewer projections (`views.ts` — who may see the movie), HTTP routes and the `/charades` Socket.IO namespace (`http.ts`), Wikidata lookups (`wikidata.ts`), the deck.
- `src/client/charades/`: pages (`pages/`), shared UI (`ui.tsx`), connection hook (`lib.ts`), theme (`charades.css`). Bollywood sounds are in `src/client/lib/sound.ts` (`action`, `filmyWin`, `filmySad`, `gong`, `whoosh`, `tabla`, `filmyFanfare`).
