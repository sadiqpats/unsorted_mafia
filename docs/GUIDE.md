# Game-night guide — Unsorted Plans Presents: Mafia Night

The same guide is built into the website at **`/guide`** (linked from the home page), so players can read it on their phones.

---

## 1. Before guests arrive (5 minutes)

1. Start the server (see the README) or open your deployed URL.
2. On your phone or laptop, open the site, tap **Host a Game** and enter the **host code** (only hosts have it; guests never need it).
3. Enter your name and the number of players (any whole number from **5 to 26**).
4. Choose:
   - **Game Master (default):** you don’t play. You can see every role (hidden behind a “Show roles” button) and fix mistakes.
   - **“I’m also playing”:** you get a secret role too. Your dashboard then shows **no secrets** and the app narrates everything.
5. Optional: open **TV display** and put it on a TV or projector. It shows the QR code, the timer and public announcements, and never shows secrets.

## 2. Getting everyone in

- Players scan the **QR code** or go to the site → **Join a Game** → type the **5-letter room code**.
- Each person enters a unique name, optionally adds a **photo** (📷 *Take a selfie* or 🖼 *Choose photo*), and taps **I’m ready**.
- Photos appear on the **TV display** as a wall of faces. When someone is eliminated, their photo is **cut in two** (sliced, drained of colour, red slash). The host can remove any photo from the lobby. Photos are deleted when the room expires.
- If fewer people turn up than planned, tap **“Start with the N players here”**. The app re-deals a balanced set of roles.

## 3. Choosing characters

The app proposes a balanced mix for your table size (see the table on `/guide`). Change it with **− / +**:

| Players | Mafia | Specials added |
|---|---|---|
| 5–6 | 1 | Detective, Doctor |
| 7 | 2 | + Jester |
| 8–11 | 2 | + Godfather (8+), Judge (9+), Thief (10+) |
| 12–16 | 3 | + Imposter (12+) |
| 17–21 | 4 | all specials |
| 22–24 | 5 | all specials |
| 25–26 | 6 | all specials |

Everyone else is a Villager. Red messages (e.g. “roles add up to 9, need 10”) block the start. Gold messages are only advice.

**Recommended first-game house rules:** keep the defaults. Popular tweaks:
- Big groups (15+): set discussion to 120s and voting to 40s.
- Want drama on ties: **On a tie → Runoff vote**.
- Want to narrate yourself: **Phase advance → Host presses Next**.

## 4. Read this to the table before starting

> “Never show your screen to anyone. At night **everyone** taps a choice — even if you have no power — so nobody can tell who’s who. Lock in, then put your phone face down. No screenshots. Dead and silenced players stay quiet. You can *say* anything, but your screen proves nothing.”

## 5. How a round flows

**There are no timers by default.** Each phase ends as soon as everyone has acted. The host can press **Next phase** if someone has stepped away, or switch timers on in House rules → Timers.

| Phase | What happens | Who acts |
|---|---|---|
| 🂠 Role reveal | Press and hold the card to see your role privately. Tap “I’ve seen my role”. | Everyone |
| 🕯 Dawn | *(Only if a Thief or Imposter is in the game.)* The Thief picks a **power**, never a person, and uses it for this round. The owner is told privately and gets it back next Dawn. The same power can't be taken two rounds in a row. From round 2 the Imposter may revive a dead player or skip. Every phone is told **that** something happened, never who did it. | Everyone (others press the dummy button) |
| 🌙 Night | Open the secret panel and lock in a choice. Mafia kill; Doctor protects (self too, never two rounds in a row); Detective investigates; Godfather silences. | Everyone (others press the dummy button) |
| ☀ Day | The night's news appears, then talk and vote in secret. The Day ends when everyone has voted. | Living, not-silenced players |

During Dawn, Night and Day, phones show **only the action**: no player list, feed or extra text.

**Roles stay secret until the game is over.** Deaths are announced by name only.

**Win conditions:** the Town wins when every **Mafia** member is dead (the Godfather alive or dead doesn't matter). The Mafia side (Mafia + Godfather) wins when it equals or outnumbers everyone else. The Jester wins if voted out by Day. The Thief and Imposter win if they're alive at the end.

**The Godfather** is not a Mafia member. He is privately shown who the Mafia are, they don't know him, and he silences one player each night and defends the Mafia by day.

## 6. Host controls during play

- **Next phase ⏭**: skip ahead. A double tap only advances once.
- **⏸ Pause / ▶ Resume** and **±30s**.
- **Break the tie**: appears when the tie rule is “Host decides”.
- **Eliminate / Restore**: correct a genuine mistake. It is **announced publicly** as a Game Master correction and stays in the log.
- **Rejoin**: gives a one-time code so a player can move their seat to another phone. The old phone is logged out.
- **Public announcement**: e.g. “5-minute break”.
- **End game / Restart / Close room** (each asks for confirmation).

## 7. How the app stops people sitting together from cheating

| Risk at the table | What the app does |
|---|---|
| Watching who taps their phone at night | **Everyone** must act every night. Players without a power pick a suspect on an identical screen. |
| Peeking at a neighbour’s screen | Secret panels sit behind a shield you must tap open. They auto-close after 15s, or when the phone locks or switches apps. Roles use press-and-hold. |
| Colour or sound giving roles away | Closed panels look identical for everyone. Sounds play only on public phase changes, the same on every phone. |
| Inspecting the page / network | The server sends each phone **only its own** role and results. Verified by automated tests at the network level. |
| Re-rolling a role | Roles are dealt on the server with a cryptographic shuffle, once. There is no reroll. |
| Voting twice / after the deadline / while dead or silenced | Rejected by the server (one vote per seat, phase-sequence checks, replay protection). |
| Using someone else’s seat | Each seat is bound to a secret token on one phone. Moving it needs a host-issued one-time code. |
| Dead players signalling | By default the dead **can’t** see other roles, so there’s nothing to leak. |
| Host bias | If the host plays, the dashboard carries **no secrets**. Corrections are always public. |

## 8. Sound, motion and display
- Each phase opens with a short cinematic moment and its own sound: chimes at **Dawn**, a low bell at **Night**, a warm swell by **Day**, a gavel for ties and runoffs, and a fanfare at game over. Locking in and voting play a soft “sealed” sound. Everyone does these, so they never give anything away.
- Every phone and the TV play the same cue at the same moment. On the TV, tap **🔊 Tap to enable sound** once (browsers block sound until someone taps).
- Per phone (🔊 Settings): sound on/off, **volume**, **vibration**, reduced motion, low-light mode.

## 9. Quick fixes

- **Phone locked / tab closed:** reopen the same link. The seat is remembered on that phone.
- **New phone / cleared browser:** host taps **Rejoin** next to the name. The player enters the code under “Rejoin” on the join page.
- **Someone left mid-night:** the timer resolves the night without them. Nothing freezes.
- **Wrong elimination:** host taps **Restore** (announced publicly).
