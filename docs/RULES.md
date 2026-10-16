# Rules, defaults & edge cases

Every rule below can be changed by the host in the lobby (Host dashboard → House rules). Settings are checked by the server and **frozen when the game starts**, so they can't change mid-match. Code: `src/shared/settings.ts` (defaults), `src/shared/engine.ts` (behaviour).

## A round: Dawn → Night → Day

```
lobby → role reveal → [Dawn] → Night → Day → [Dawn] → Night → Day … → game over
```

- **No timers by default** (`timers: false`). Each phase ends **as soon as everyone has acted**:
  - **Role reveal** ends when every player has tapped “I’ve seen my role”.
  - **Dawn** and **Night** end when every living player has locked in a choice (players without a power press the dummy button).
  - **Day** (news + discussion + secret vote) ends when every eligible player has voted.
- The host can always press **Next phase** (for example if someone has left the table). The host can also turn **timers** on: Dawn, Night and Day then also end when their clock runs out.
- **Dawn** happens before every night when a Thief or Imposter is in the setup (`preNightRound`, on by default). It keeps happening after they die, so its presence reveals nothing.
- Each phase change increments `phaseSeq`. Actions must quote the current value, so late, replayed and double-clicked actions are rejected.
- Phones show **only the action** during Dawn, Night and Day. Each phase opens with a short news card: Dawn shows yesterday's vote result, Night shows what happened at Dawn, and Day shows what happened in the night.

## Online or offline (sound)
The host picks **Where are you playing?** in House rules:
- **🏠 Together (offline, default):** everyone is in one room. Player phones stay silent (no music, no sound effects, only a private buzz). The host's device and the TV play the sound effects, so the room hears one speaker. No music: bring your own.
- **🌐 Online:** players are apart. Every phone (and the TV) plays suspense music during **Dawn and Night**; it fades out before every reveal and stops for the **Day**. Every event has its own sound on every phone: a knife swish and gunshot for a kill, a rising choir for a revive, a hushing “shhh” for a silence, a whoosh and coins for a theft, a gavel and impact for a vote-out, a manic laugh for the Joker, and a win theme for each side. Big reveals get a tension build first, and each news line appears in time with its sound. Players can turn music off for themselves (🔊 Settings → Suspense music).

Sounds only ever follow public events, so they never reveal a role.

## Roles stay secret until the game is over
Deaths and eliminations are announced by **name only**. Eliminated players keep seeing every update (the news and the announcements) in every phase. Every role is revealed on the game-over screen. (House rule `revealRoleOnDeath` can turn reveal-on-death back on.)

## Characters (9)

| Role | Side | Default | Configurable |
|---|---|---|---|
| **Mafia** | Mafia | Each night the Mafia pick one victim (most picks wins; ties go to the first-seated member). They know each other by name and photo (on the role card and again at night), never the Godfather. At night the live plan is anonymous: “Mafia 1 wants to kill X”, numbers shuffled every night. | decision mode |
| **Godfather** | Mafia side, **not** a Mafia member | Privately shown **who the Mafia are**, with photos, on the role card and again at night (they don't know him). Silences one player each night for the next Day. Doesn't kill. Defends the Mafia in discussion. | Detective sees him as innocent |
| **Detective** | Town | Investigates one player each night; private result: suspicious / not suspicious. | exact alignment instead |
| **Doctor** | Town | Protects one player each night. **May save themselves, but never two rounds in a row.** | never / always self-save |
| **Judge** | Town | Day vote counts ×2 (applied by the server). | weight 1–5 |
| **Villager** | Town | No power; presses the dummy button at night. | up to 2 optional powers (off) |
| **Thief** | Neutral | Every **Dawn** (from round 1) steals one **power** — any power in the setup (Resurrect from round 2). He sees powers, never people, and never learns whose it was. It lasts **that round**; the owner gets it back next Dawn. He can't take the **same power two rounds in a row**. Wins by surviving. | side (neutral/town); may steal Judge vote |
| **Imposter** | **Neutral** | From **round 2**, at **Dawn**, may revive one dead player, or skip. Everyone is told who came back, never who did it. Unlimited revivals. Wins by surviving. | side; revival limit |
| **Joker** | Neutral | Wins alone if voted out by Day. | game continues instead |

Removed for good: **Priest** and **Bodyguard**.

### Thief details
- The power list shows every stealable power of every role **in the setup** (even if its holder is dead), so it reveals nothing.
- If several living players hold that power, one is chosen at random. If nobody alive holds it, the attempt fails quietly and the Thief is told “Nobody could give up that power this round”.
- The robbed player is told privately: *“Your power has been stolen for this round… just press the button on your screen.”* Their night screen shows the dummy button.
- **Stealing the Mafia Hit:** that night the Thief **joins the Mafia's vote** as an anonymous “Mafia N”. His list is everyone else alive (it doesn't hide the Mafia, so he learns nothing). Everyone voting — Mafia and Thief — appears only as “Mafia 1/2/3” in an order shuffled every night (and keyed with a server secret), so the Mafia can't tell which slot is the Thief and he can't tell who they are. The robbed Mafia member presses the dummy button but still sees the anonymous plan. There is **one** kill: most picks wins, ties go to the first-seated voter. Protection stops it.
- **Stealing Resurrect** (from round 2): the steal resolves before the Imposter's revival at Dawn, so the Imposter's revive that Dawn is cancelled and the Thief can revive someone that **night** instead.
- Stealing the Judge's vote gives the Thief the ×2 vote that Day.

## Night order (lower first)
| Priority | Step |
|---|---|
| 10 | Doctor protect, Villager *Barricade* |
| 20 | Godfather silence |
| 50 | Mafia hit (one team decision; a Thief holding the stolen hit votes in it anonymously) |
| 55 | Attacks resolve: protected targets survive, others die |
| 80 | Detective investigate, Villager *Hunch* |

Dawn order: Thief steal (85), then Imposter revive (90). A power stolen earlier in the same phase no longer works for its owner.

## Voting (Day)
- Eligible: alive, and not just revived (if that house rule is on). **Silenced players may still vote** (they just can't speak in discussion); the house rule `silencedCanVote: false` blocks their vote too. The Day ends when **all eligible players** have voted.
- One secret ballot per player; abstaining allowed; no self-vote by default.
- Weights are counted on the server when the Day closes (Judge ×2, Rally ×2).
- If “no one” (abstain) gets at least as many votes as the leader, nobody is eliminated.
- Ties: nobody eliminated (default), a runoff, or the host decides.

## Victory
1. **Joker**: voted out by Day → wins alone (ends the game by default).
2. Nobody alive → draw.
3. **Town wins when every Mafia member is dead**, even if the Godfather is still alive.
4. **Mafia side wins** when the Mafia plus the Godfather equal or outnumber everyone else alive.
5. Thief and Imposter still alive at the end **co-win** with whoever won.

## Edge cases
| Situation | Behaviour |
|---|---|
| Someone leaves mid-phase | With no timers the host presses **Next phase**. Missing actions are skipped and missing votes don't count. |
| Thief steals a power whose holder dies that night | The power still returns to nobody; next Dawn it's simply available again. |
| Thief dies holding a stolen power | It returns to its owner immediately. |
| Revival hands the Mafia side parity | The game ends immediately with a Mafia win. |
| Host correction (eliminate/restore) | Always announced publicly and logged. Victory is re-checked. |
| Late join (off by default) | Late joiners become Villagers. |
