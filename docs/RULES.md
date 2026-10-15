# Rules, defaults & edge cases

Every rule below is a **house rule** the host can change in the lobby (Host dashboard → House rules). Settings are validated (Zod) and **frozen into the game when it starts**, so they can't change mid-match. Code: `src/shared/settings.ts` (defaults), `src/shared/engine.ts` (behaviour).

## Game lifecycle (server state machine)

```
lobby → reveal → prenight* → night → [resolve] → morning → discussion → voting → [tally] → verdict → night …
                                   ↘ game_over                      ↘ (runoff) voting
                                                                     ↘ game_over
```

- *`prenight` (“Before Nightfall”) happens before **every** night when `preNightRound` is on (default) **and** a Thief or Imposter is in the setup. It runs even after they die, so its presence reveals nothing. Every living player gets a choice (decoy for most). Order: Imposter revive (90), then Thief steal (95). Public announcement: `theft` template (no names) and/or `revived` (the revived player is named), otherwise `quietPreNight`. Victory is checked afterwards (a revival can hand the Mafia parity).
- Each phase has a server deadline (`phaseEndsAt`). Clients only display it.
- `advanceMode: auto` (default): the server advances when the timer expires. `manual`: only the host advances.
- Early completion (auto mode): reveal ends when everyone has acknowledged. Night ends when every living player has locked in (`nightAutoResolve`, works in both modes). Voting ends when every eligible voter has voted (only when vote changes are off).
- Every phase change increments `phaseSeq`. Night actions, votes and host “Next” must quote the current `phaseSeq`, or they are rejected (`phase_closed`). This blocks late, replayed and double-clicked actions.
- **Nobody can freeze the game:** missing night actions are skipped when the timer expires, and missing votes simply don't count.

## Night resolution order

| Priority | Step | Notes |
|---|---|---|
| 10 | Doctor protect, Bodyguard guard, Villager *Barricade* | Build the protection set. Multiple protectors on one target are fine. |
| 20 | Godfather silence | Target is silenced for the **next day** (discussion + vote). |
| 50 | Mafia hit decided | See *Mafia decision* below. |
| 55 | Attacks resolve | Protected → survives (one save is counted). Unprotected → dies. |
| 80 | Detective investigate, Villager *Hunch* | Results go to the actor's private notebook. |
| 90 | Priest revive | Only players who were dead **before** this night. |
| 95 | Thief steal | Stolen ability is usable from the **next** night. |

Night actions are **simultaneous**: a player killed tonight still has their action resolve (a Detective killed tonight still gets their result). The exception is the Thief's steal, which fails if the Thief dies. Players without a night ability submit a **suspicion** (“decoy”) that has no effect except the end-game “most suspected” stat. This is the anti-cheat measure described in GUIDE.md.

## Mafia decision (`mafiaDecision`)

- **plurality (default):** each living Mafia-team member picks a target, and the most picks wins. Ties go to the **leader's** pick: the Godfather if they join the hit, otherwise the lowest-seated member. If the leader's pick isn't among the tied targets, the earliest submitted tied pick wins.
- **leader:** the leader's pick is final. Others' picks are suggestions (used as a fallback only if the leader didn't pick).
- Mafia members see each other's live picks and may change their own until the night ends.
- The Mafia cannot target Mafia-team members. No picks means no kill.
- `godfatherJoinsKill` (default **on**).

## Roles — defaults and configuration

| Role | Alignment | Default | Configurable |
|---|---|---|---|
| Mafia | Mafia | Joins the nightly hit | decision mode |
| Godfather | Mafia (not a separate faction) | Silence 1 player/night (unlimited) + joins hit + tie-breaker | joins hit; appears innocent to Detective |
| Detective | Good | Investigate 1/night; result **Suspicious / Not suspicious** | `detectiveResult: alignment` shows Good/Mafia/Neutral |
| Doctor | Good | Protect 1/night, **not** self | self-protect |
| Bodyguard | Good | Protect **once per game**, not self; charge spent **when used** | charges; self; spent only `onSave` |
| Judge | Good | Vote counts **×2**, applied by the server; still one ballot | weight 1–5 |
| Villager | Good | No power; picks a suspect at night | up to 2 optional powers (below) |
| Thief | Neutral | Steals **Before Nightfall** by naming a **power** (not a player) — the server takes it from whoever holds it and the Thief **never learns whose it was**; only the victim is told (privately). **1** steal, **taken over permanently**, usable that same night; the victim keeps their team but plays as a Villager; can steal passives | power vs player targeting (`thiefTargetMode`); alignment; copy vs take; one use vs permanent; charges; passives; repeat targets |
| Priest | Neutral | **2** revivals, only while alive, not self | charges; alternate rounds only; acts when dead; self-revive; revived keep role / effects; can vote next day |
| Imposter | **Mafia** (wins with them, but doesn't know them or join the hit) | Revives any dead player **Before Nightfall** (from round 2), or skips; **unlimited** revivals; dead Imposter can't act | side (mafia/neutral/good); revival limit (`imposterCharges`, 0 = unlimited) |
| Jester | Neutral | Wins alone if **voted out by day**; ends the game | `jesterEndsGame: false` → credited, game continues |

### Thief details (fully configurable)
- **Blind steal (default `thiefTargetMode: power`):** the list shows every transferable power of every role in the *setup* (even if its holder is dead), so it reveals nothing. If several living players hold that power, one is picked at random. If nobody alive holds it, the attempt is spent and the Thief is told “Nobody could give up that power”. The public sees nothing in that case.
- Default (with the pre-night round): steal in **Before Nightfall**, take the power **permanently**, use it that same night. Setting `preNightRound: false` moves stealing back to the night (stolen power usable from the next night).
- **Transferable:** Silence, Investigate, Protect, Guard, Revive, Judge's weighted vote (if `thiefStealPassive`), and Villager powers.
- **Never transferable:** the Mafia hit, win conditions, host privileges, and abilities the target is itself holding as stolen.
- If the target has nothing transferable, the Thief is told “nothing to steal” and **the attempt is spent**.
- The Thief can't steal while already holding a stolen ability.
- **take** mode: the victim is told privately that their ability was stolen, and gets it back when the Thief's copy expires or the Thief dies.
- The Detective sees the Thief's own alignment. Stealing never changes alignment.
- A stolen ability keeps its rules (e.g. a stolen Protect uses the Doctor self-protect rule).

### Priest details
- Can't revive a living player (living players are never offered as targets). A revival of someone revived by other means (e.g. a host restore) has no effect, and **no charge is used**.
- A revived player returns with their original role and alignment (`revivedKeepRole`). Silence is cleared (`revivedKeepEffects: false`). They may vote the next day (`revivedCanActNextPhase`).
- Revivals are always announced publicly: “{name} has returned to the game!”

### Villager optional powers (all **off** by default; suggestions; max two)
- **Hunch** (information, once): learn whether a player has any night power.
- **Barricade** (defensive, once): protect yourself for one night.
- **Rally** (voting, once): one day vote counts double.

## Voting
- Eligible: alive, not silenced today, not just revived with `revivedCanActNextPhase: false`.
- One ballot per seat. Changing a vote only with `allowVoteChange`. No self-vote unless `allowSelfVote`. Abstain allowed by default.
- **Weights are computed on the server when voting closes:** Judge × `judgeWeight`, Rally ×2. A dead or ineligible Judge's vote isn't counted.
- **Abstentions** form a “nobody” pile. If it is **≥** the leading total, nobody is eliminated.
- **Ties** (`tieRule`): `none` (default, nobody eliminated), `runoff` (one revote among the tied; a second tie means nobody), or `host` (the game waits for the host to pick one of the tied or spare everyone).
- What's revealed (`voteReveal`): `outcome`, `tally` (default, weighted totals), or `full` (who voted for whom). All votes are shown at game over.

## Victory (checked after every night, every elimination and every host correction)
1. **Jester:** checked at the moment of a day elimination.
2. **Nobody alive** → draw.
3. **No Mafia-aligned players alive** → **Town** wins (all Good-aligned players win, alive or dead).
4. **Mafia ≥ everyone else** (`parity`, default) or **Mafia > everyone else** (`majority`) → **Mafia** wins.
5. Survivor neutrals (Thief, Priest) still alive **co-win** with whoever won. A Jester who won earlier (with `jesterEndsGame: false`) is also listed.

If a night produces both outcomes at once (e.g. the last Mafia and the last townsperson die together), rule 2 applies first, then 3, then 4.

## Edge cases
| Situation | Behaviour |
|---|---|
| Player targeted by several abilities | All resolve in priority order. Protection beats attacks. |
| Doctor + Bodyguard on the same target | Saved once. The Bodyguard's charge is spent (in `onUse` mode). |
| Silenced player tries to vote | Server rejects with “You are silenced today and cannot vote.” |
| Dead player tries to act | No options are offered and the server rejects it (except a dead Priest with `priestActsWhenDead`). |
| Priest targets a living player | Not offered. A forged request is rejected (`invalid_target`). |
| Thief targets a role with nothing transferable | “Nothing to steal”, attempt spent. |
| Killed and revived in the same night | Can't happen: revive targets must already be dead when the night starts. |
| Two factions win at once | Order above. |
| Player disconnects mid-phase | Their seat stays. Timers keep going and they rejoin with the same token. |
| Host disconnects | The game continues on timers. The host reopens the link to regain control. |
| Timer expires with actions pending | Pending actions are skipped. |
| Restart / cancel | Restart returns everyone to the lobby (same seats, roles cleared, log kept). Close room ends all sessions. |
| Host correction (eliminate/restore) | Always announced publicly and logged. Victory is re-checked. |
| Late join (off by default) | Joiners enter as Villagers so the secret distribution can't be inferred or gamed. |
