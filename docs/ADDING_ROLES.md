# Adding a new character

Roles are data. The engine looks abilities up by id and runs them in priority order, and the UI reads names, art and text from the same registry. Most new roles need **no engine changes**.

## A. A role that reuses existing abilities (no engine code)

Example: a *Nurse* who protects like the Doctor.

1. `src/shared/roles.ts` → add to `ROLES`:
   ```ts
   nurse: {
     id: 'nurse',
     name: 'Nurse',
     alignment: () => 'good',
     mafiaTeam: () => false,
     unique: true,
     tagline: 'Bedside manner, bulletproof.',
     description: '…',
     abilityText: 'Each night, protect one player.',
     howTo: '…',
     winCondition: 'Win when every Mafia member is eliminated.',
     abilities: [{ id: 'protect' }],
     art: 'cross',
   },
   ```
2. Add `'nurse'` to `ROLE_ORDER` (this controls display order).
3. Optional: add it to `SPECIAL_THRESHOLDS` in `src/shared/distribution.ts` to include it in the default mix.
4. Optional: add an emblem to `ART` in `src/client/components/RoleArt.tsx`.
5. Add a unit test in `tests/unit/roles.test.ts` using the `setup([...roles])` helper.

## B. A role with a new night ability

Example: a *Lookout* who learns who visited their target.

1. Add the ability to `ABILITIES` in `roles.ts`: `kind: 'night'`, a `priority` (see the order in docs/RULES.md), `target`, `charges`, `transferable`, `prompt`.
2. Add a resolver to `NIGHT_RESOLVERS` in `src/shared/engine.ts`:
   ```ts
   lookout(room, ctx, a, now, rng) {
     const visitors = Object.values(room.game!.night.actions)
       .filter((x) => x.targetId === a.targetId && x.actorId !== a.actorId && x.abilityId !== 'decoy')
       .map((x) => getPlayer(room, x.actorId).name);
     addPrivate(room, rng, now, a.actorId, 'lookout', visitors.length ? `Visitors: ${visitors.join(', ')}` : 'Nobody visited.');
   },
   ```
   Use `ctx` (protections, attacks, deaths, revived, silenced) to interact with other effects. Call `useCharge` if the ability has limited uses.
3. Add the role as in section A. The night panel, charges display, Thief interactions and host view all pick it up automatically.
4. Add unit tests (normal case, dead actor, interaction with protection/Thief).

## C. New voting or win behaviour

- Vote modifiers: extend `voteWeight()` in `engine.ts` (see `judge_vote` and `v_rally`).
- Personal win conditions: `winsBySurviving: true` for survivors. For anything else, add a check in `checkWin()` (and, for day-elimination triggers, in `eliminateByVote()` the way the Jester works).
- New house rules: add the field to `SettingsSchema` and `defaultSettings()` in `settings.ts`, read it from `room.game.settings` in the engine, and add a control in `HostDashboard.tsx → HouseRules`.

## Checklist
- [ ] Role and ability data, `ROLE_ORDER`, art
- [ ] Resolver (if new ability) with charge handling
- [ ] Privacy: results go through `addPrivate` (never the public log); public text goes through `addLog(..., 'public')`
- [ ] Unit tests and `npm test`
- [ ] Mention it in `docs/RULES.md`
