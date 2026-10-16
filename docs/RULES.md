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

## Roles stay secret until the game is over
Deaths and eliminations are announced by **name only**. Every role is revealed on the game-over screen. (House rule `revealRoleOnDeath` can turn reveal-on-death back on.)

## Characters (9)

| Role | Side | Default | Configurable |
|---|---|---|---|
| **Mafia** | Mafia | Each night the Mafia pick one victim (most picks wins; ties go to the first-seated member). They know each other. | decision mode |
| **Godfather** | Mafia side, **not** a Mafia member | Privately shown **who the Mafia are** (they don't know him). Silences one player each night for the next Day. Doesn't kill. Defends the Mafia in discussion. | Detective sees him as innocent |
| **Detective** | Town | Investigates one player each night; private result: suspicious / not suspicious. | exact alignment instead |
| **Doctor** | Town | Protects one player each night. **May save themselves, but never two rounds in a row.** | never / always self-save |
| **Judge** | Town | Day vote counts ×2 (applied by the server). | weight 1–5 |
| **Villager** | Town | No power; presses the dummy button at night. | up to 2 optional powers (off) |
| **Thief** | Neutral | Every **Dawn** (from round 1) steals one **power**. He sees powers, never people, and never learns whose it was. It lasts **that round**; the owner gets it back next Dawn. He can't take the **same power two rounds in a row**. Wins by surviving. | side (neutral/town); may steal Judge vote |
| **Imposter** | **Neutral** | From **round 2**, at **Dawn**, may revive one dead player, or skip. Everyone is told who came back, never who did it. Unlimited revivals. Wins by surviving. | side; revival limit |
| **Jester** | Neutral | Wins alone if voted out by Day. | game continues instead |

Removed for good: **Priest** and **Bodyguard**.

### Thief details
- The power list shows every stealable power of every role **in the setup** (even if its holder is dead), so it reveals nothing.
- If several living players hold that power, one is chosen at random. If nobody alive holds it, the attempt fails quietly and the Thief is told “Nobody could give up that power this round”.
- The robbed player is told privately: *“Your power has been stolen for this round… just press the button on your screen.”* Their night screen shows the dummy button.
- **Stealing the Mafia Hit:** that night the Thief chooses his own victim from **everyone else alive** (the list doesn't hide the Mafia, so he learns nothing). The robbed Mafia member presses the dummy button. Any other Mafia member still makes the Mafia kill, so two deaths are possible. Protection stops either kill.
- Stealing the Judge's vote gives the Thief the ×2 vote that Day.

## Night order (lower first)
| Priority | Step |
|---|---|
| 10 | Doctor protect, Villager *Barricade* |
| 20 | Godfather silence |
| 50 | Mafia hit (team decision) and the Thief's stolen hit (solo) |
| 55 | Attacks resolve: protected targets survive, others die |
| 80 | Detective investigate, Villager *Hunch* |

Dawn order: Imposter revive (90), then Thief steal (95).

## Voting (Day)
- Eligible: alive, and not just revived (if that house rule is on). **Silenced players may still vote** (they just can't speak in discussion); the house rule `silencedCanVote: false` blocks their vote too. The Day ends when **all eligible players** have voted.
- One secret ballot per player; abstaining allowed; no self-vote by default.
- Weights are counted on the server when the Day closes (Judge ×2, Rally ×2).
- If “no one” (abstain) gets at least as many votes as the leader, nobody is eliminated.
- Ties: nobody eliminated (default), a runoff, or the host decides.

## Victory
1. **Jester**: voted out by Day → wins alone (ends the game by default).
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
