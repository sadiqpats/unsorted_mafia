# Game-night guide — Unsorted Plans Presents: Mafia Night

The same guide is built into the website at **`/guide`** (linked from the home page), so players can read it on their phones.

---

## 1. Before guests arrive (5 minutes)

1. Start the server (see the README) or open your deployed URL.
2. On your phone or laptop, open the site and tap **Host a Game**.
3. Enter your name and the number of players (any whole number from **5 to 22**).
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

| Players | Mafia team | Specials added |
|---|---|---|
| 5 | 1 Mafia | Detective, Doctor |
| 6–8 | Godfather + 1 Mafia | + Jester (7+), Judge (8+) |
| 9–12 | Godfather + 2 Mafia | + Priest (9+), Bodyguard (10+), Thief (12+) |
| 13–16 | Godfather + 3 Mafia | all specials |
| 17–19 | Godfather + 4 Mafia | all specials |
| 20–22 | Godfather + 5 Mafia | all specials |

Everyone else is a Villager. Red messages (e.g. “roles add up to 9, need 10”) block the start. Gold messages are only advice.

**Recommended first-game house rules:** keep the defaults. Popular tweaks:
- Big groups (15+): set discussion to 120s and voting to 40s.
- Want drama on ties: **On a tie → Runoff vote**.
- Want to narrate yourself: **Phase advance → Host presses Next**.

## 4. Read this to the table before starting

> “Never show your screen to anyone. At night **everyone** taps a choice — even if you have no power — so nobody can tell who’s who. Lock in, then put your phone face down. No screenshots. Dead and silenced players stay quiet. You can *say* anything, but your screen proves nothing.”

## 5. How a round flows

| Phase | What happens | Who acts |
|---|---|---|
| 🂠 Role reveal | Press and hold the card to see your role privately. Tap “I’ve seen my role”. | Everyone |
| 🕯 Before Nightfall | *(Only if a Thief or Imposter is in the game.)* Everyone opens their panel. The Thief picks a **power** to steal, not a person, and never learns whose it was. They take over that job from that night on; only the victim is told, privately, and plays on as a Villager. The Imposter may revive a dead player or skip. Every phone then shows **that** it happened, never who. The round keeps running even after they die. | Everyone (others tap a decoy) |
| (screens) | During Before Nightfall, Night and Voting, phones show **only the action**: no player list, feed or extra text. | |
| 🌙 Night | Open the secret panel and lock in a choice. Powers resolve in secret. | Everyone (villagers pick a suspect) |
| 🌅 Morning | Public announcement: deaths, revivals, who is silenced. Private results go to that player’s notebook. | — |
| 🗣 Discussion | Talk, accuse, defend. | Living, not-silenced players |
| 🗳 Voting | Secret ballot. Most (weighted) votes is eliminated. | Living, not-silenced players |
| ⚖ Verdict | Result revealed, then night falls again. | — |

**Win conditions:** Town wins when all Mafia are gone. Mafia wins when they equal or outnumber everyone else. The Jester wins if voted out during the day. The Thief and Priest win if they’re alive at the end.

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

## 8. Quick fixes

- **Phone locked / tab closed:** reopen the same link. The seat is remembered on that phone.
- **New phone / cleared browser:** host taps **Rejoin** next to the name. The player enters the code under “Rejoin” on the join page.
- **Someone left mid-night:** the timer resolves the night without them. Nothing freezes.
- **Wrong elimination:** host taps **Restore** (announced publicly).
