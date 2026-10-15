import { describe, expect, it } from 'vitest';
import { advancePhase, checkWin, hostEliminate, nightOptions, submitNightAction, voteWeight } from '../../src/shared/engine';
import { setup } from './helpers';

const V = 'villager';

describe('Mafia team kill', () => {
  it('eliminates the chosen target and announces it publicly', () => {
    const g = setup(['mafia', V, V, V, 'doctor']);
    g.goToNight();
    g.act(0, 'mafia_kill', 1);
    g.advance();
    expect(g.P(1).alive).toBe(false);
    expect(g.room.game!.phase).toBe('morning');
    expect(g.publicLog()).toContain('P1 was found dead at dawn.');
    expect(g.publicLog().join('\n')).not.toMatch(/They were/);
  });

  it('cannot target its own members', () => {
    const g = setup(['godfather', 'mafia', V, V, V, V]);
    g.goToNight();
    expect(() => g.act(1, 'mafia_kill', 0)).toThrow(/not allowed/);
  });

  it('uses plurality, with ties broken by the Godfather', () => {
    const a = setup(['godfather', 'mafia', 'mafia', V, V, V, V]);
    a.goToNight();
    a.act(0, 'mafia_kill', 3);
    a.act(1, 'mafia_kill', 4);
    a.act(2, 'mafia_kill', 4);
    a.advance();
    expect(a.P(4).alive).toBe(false);
    expect(a.P(3).alive).toBe(true);

    const b = setup(['godfather', 'mafia', 'mafia', V, V, V, V]);
    b.goToNight();
    b.act(0, 'mafia_kill', 3);
    b.act(1, 'mafia_kill', 4);
    b.advance();
    expect(b.P(3).alive).toBe(false);
  });

  it('supports a designated decision-maker mode', () => {
    const g = setup(['godfather', 'mafia', 'mafia', V, V, V, V], { mafiaDecision: 'leader' });
    g.goToNight();
    g.act(0, 'mafia_kill', 3);
    g.act(1, 'mafia_kill', 4);
    g.act(2, 'mafia_kill', 4);
    g.advance();
    expect(g.P(3).alive).toBe(false);
    expect(g.P(4).alive).toBe(true);
  });

  it('lets Mafia change their pick during the night (team coordination)', () => {
    const g = setup(['mafia', V, V, V, V]);
    g.goToNight();
    g.act(0, 'mafia_kill', 1);
    g.act(0, 'mafia_kill', 2);
    g.advance();
    expect(g.P(2).alive).toBe(false);
    expect(g.P(1).alive).toBe(true);
  });

  it('Godfather can be excluded from the hit by house rule', () => {
    const g = setup(['godfather', 'mafia', V, V, V, V], { godfatherJoinsKill: false });
    g.goToNight();
    expect(nightOptions(g.room, 'p0').map((o) => o.abilityId)).toEqual(['silence']);
    expect(() => g.act(0, 'mafia_kill', 2)).toThrow(/cannot use/);
  });

  it('no kill happens if the Mafia submit nothing', () => {
    const g = setup(['mafia', V, V, V, V]);
    g.goToNight();
    g.advance();
    expect(g.room.players.every((p) => p.alive)).toBe(true);
    expect(g.publicLog()).toContain('The town wakes. Nobody died tonight.');
  });
});

describe('Role reveal', () => {
  it('keeps every role secret until the game is over (default)', () => {
    const g = setup(['mafia', 'jester', V, V, V, V], { jesterEndsGame: false });
    g.goToNight();
    g.act(0, 'mafia_kill', 2);
    g.advance();
    g.goToVoting();
    for (const i of [0, 3, 4, 5]) g.vote(i, 1); // Jester voted out, game continues
    g.advance();
    expect(g.room.status).toBe('active');
    const text = g.publicLog().join('\n');
    expect(text).not.toMatch(/They were|Jester|Villager|Mafia/);
    expect(g.room.game!.lastVerdict!.jesterWin).toBe(true); // stored privately…
    hostEliminate(g.room, 'p0', 0); // …and revealed at the end
    expect(g.room.status).toBe('over');
    expect(g.publicLog().join('\n')).toMatch(/P1 was the Jester/);
  });

  it('can reveal roles on death as a house rule', () => {
    const g = setup(['mafia', V, V, V, V], { revealRoleOnDeath: true });
    g.goToNight();
    g.act(0, 'mafia_kill', 1);
    g.advance();
    expect(g.publicLog()).toContain('P1 was found dead at dawn. They were the Villager.');
  });
});

describe('Godfather silence', () => {
  it('blocks the target from voting the next day and announces without naming the Godfather', () => {
    const g = setup(['godfather', V, V, V, 'detective']);
    g.goToNight();
    g.act(0, 'silence', 1);
    g.advance();
    const morning = g.room.log.filter((l) => l.kind === 'morning').map((l) => l.text).join('\n');
    expect(morning).toContain('P1 has been silenced');
    expect(morning).not.toContain('P0');
    g.goToVoting();
    expect(() => g.vote(1, 2)).toThrow(/silenced/);
    g.vote(2, 3);
  });

  it('expires after one day', () => {
    const g = setup(['godfather', V, V, V, 'detective']);
    g.goToNight();
    g.act(0, 'silence', 1);
    g.goToVoting();
    g.advance(); // resolve votes
    g.goToNight();
    g.goToVoting();
    expect(() => g.vote(1, 2)).not.toThrow();
  });

  it('dead Godfather cannot silence', () => {
    const g = setup(['godfather', 'mafia', V, V, V, V]);
    g.P(0).alive = false;
    g.goToNight();
    expect(nightOptions(g.room, 'p0')).toEqual([]);
  });
});

describe('Detective', () => {
  it('privately receives a binary result', () => {
    const g = setup(['mafia', 'detective', V, V, V]);
    g.goToNight();
    g.act(1, 'investigate', 0);
    g.advance();
    expect(g.results(1).join()).toMatch(/P0 is SUSPICIOUS/);
    expect(g.results(2)).toEqual([]);
    expect(g.publicLog().join()).not.toMatch(/SUSPICIOUS/);
  });

  it('can report exact alignment', () => {
    const g = setup(['mafia', 'detective', 'jester', V, V], { detectiveResult: 'alignment' });
    g.goToNight();
    g.act(1, 'investigate', 2);
    g.advance();
    expect(g.results(1).join()).toMatch(/P2 appears to be NEUTRAL/);
  });

  it('Godfather can appear innocent by house rule', () => {
    const g = setup(['godfather', 'detective', V, V, V], { godfatherAppearsInnocent: true });
    g.goToNight();
    g.act(1, 'investigate', 0);
    g.advance();
    expect(g.results(1).join()).toMatch(/NOT suspicious/);
  });

  it('still gets a result when killed the same night (simultaneous resolution)', () => {
    const g = setup(['mafia', 'detective', V, V, V]);
    g.goToNight();
    g.act(0, 'mafia_kill', 1);
    g.act(1, 'investigate', 0);
    g.advance();
    expect(g.P(1).alive).toBe(false);
    expect(g.results(1).join()).toMatch(/SUSPICIOUS/);
  });

  it('dead Detective cannot investigate', () => {
    const g = setup(['mafia', 'detective', V, V, V]);
    g.P(1).alive = false;
    g.goToNight();
    expect(() => g.act(1, 'investigate', 0)).toThrow(/cannot use/);
  });
});

describe('Doctor', () => {
  it('protects the target from the Mafia hit without announcing the save', () => {
    const g = setup(['mafia', 'doctor', V, V, V]);
    g.goToNight();
    g.act(0, 'mafia_kill', 2);
    g.act(1, 'protect', 2);
    g.advance();
    expect(g.P(2).alive).toBe(true);
    expect(g.publicLog()).toContain('The town wakes. Nobody died tonight.');
    expect(g.publicLog().join()).not.toMatch(/survived/);
    expect(g.room.game!.stats.saves).toBe(1);
  });

  it('can announce saves when the house rule is on', () => {
    const g = setup(['mafia', 'doctor', V, V, V], { announceSaves: true });
    g.goToNight();
    g.act(0, 'mafia_kill', 2);
    g.act(1, 'protect', 2);
    g.advance();
    expect(g.publicLog().join()).toMatch(/survived/);
  });

  it('self-protection is configurable', () => {
    const off = setup(['mafia', 'doctor', V, V, V]);
    off.goToNight();
    expect(() => off.act(1, 'protect', 1)).toThrow(/not allowed/);
    const on = setup(['mafia', 'doctor', V, V, V], { doctorSelfProtect: true });
    on.goToNight();
    on.act(1, 'protect', 1);
    on.act(0, 'mafia_kill', 1);
    on.advance();
    expect(on.P(1).alive).toBe(true);
  });
});

describe('Bodyguard', () => {
  it('protects once per game by default', () => {
    const g = setup(['mafia', 'bodyguard', V, V, V, V]);
    g.goToNight();
    g.act(1, 'guard', 2);
    g.act(0, 'mafia_kill', 2);
    g.advance();
    expect(g.P(2).alive).toBe(true);
    expect(g.P(1).charges.guard).toBe(0);
    g.goToNight();
    expect(nightOptions(g.room, 'p1').map((o) => o.abilityId)).toEqual(['decoy']);
  });

  it('skipping does not consume the charge', () => {
    const g = setup(['mafia', 'bodyguard', V, V, V, V]);
    g.goToNight();
    g.act(1, 'guard', null);
    g.advance();
    expect(g.P(1).charges.guard).toBe(1);
  });

  it('onSave mode only consumes the charge when the guard actually saves someone', () => {
    const g = setup(['mafia', 'bodyguard', V, V, V, V], { bodyguardConsume: 'onSave' });
    g.goToNight();
    g.act(1, 'guard', 3);
    g.act(0, 'mafia_kill', 2);
    g.advance();
    expect(g.P(2).alive).toBe(false);
    expect(g.P(1).charges.guard).toBe(1);
  });

  it('stacks safely with the Doctor on the same target', () => {
    const g = setup(['mafia', 'bodyguard', 'doctor', V, V, V]);
    g.goToNight();
    g.act(0, 'mafia_kill', 3);
    g.act(1, 'guard', 3);
    g.act(2, 'protect', 3);
    g.advance();
    expect(g.P(3).alive).toBe(true);
    expect(g.room.game!.stats.saves).toBe(1);
  });
});

describe('Thief (night-time stealing mode)', () => {
  const setupT = (roles: string[], patch = {}) => setup(roles, { preNightRound: false, thiefDuration: 'oneUse', thiefCharges: 2, thiefTargetMode: 'player', ...patch });
  it('takes an ability (default) and can use it the next night, once', () => {
    const g = setupT(['mafia', 'thief', 'detective', V, V]);
    g.goToNight();
    g.act(1, 'steal', 2);
    g.advance();
    expect(g.results(1).join()).toMatch(/You stole the Investigate power\. It was P2’s\./);
    expect(g.results(2).join()).toMatch(/stole your Investigate/);
    expect(g.P(2).lostAbilities).toContain('investigate');
    g.goToNight();
    expect(nightOptions(g.room, 'p2').map((o) => o.abilityId)).toEqual(['decoy']);
    expect(nightOptions(g.room, 'p1').map((o) => o.abilityId)).toEqual(['investigate']);
    g.act(1, 'investigate', 0);
    g.advance();
    expect(g.results(1).join()).toMatch(/P0 is SUSPICIOUS/);
    expect(g.P(1).stolen).toBeNull();
    expect(g.P(2).lostAbilities).toEqual([]);
  });

  it('copy mode leaves the target with their ability', () => {
    const g = setupT(['mafia', 'thief', 'detective', V, V], { thiefMode: 'copy' });
    g.goToNight();
    g.act(1, 'steal', 2);
    g.advance();
    g.goToNight();
    expect(nightOptions(g.room, 'p2').map((o) => o.abilityId)).toEqual(['investigate']);
    expect(nightOptions(g.room, 'p1').map((o) => o.abilityId)).toEqual(['investigate']);
  });

  it('gets nothing from a role without a transferable ability, and the attempt is spent', () => {
    const g = setupT(['mafia', 'thief', 'detective', V, V]);
    g.goToNight();
    g.act(1, 'steal', 3);
    g.advance();
    expect(g.results(1).join()).toMatch(/nothing you could steal/);
    expect(g.P(1).charges.steal).toBe(1);
    expect(g.P(1).stolen).toBeNull();
  });

  it('cannot steal the Mafia hit', () => {
    const g = setupT(['mafia', 'thief', 'detective', V, V]);
    g.goToNight();
    g.act(1, 'steal', 0);
    g.advance();
    expect(g.results(1).join()).toMatch(/nothing you could steal/);
  });

  it('cannot target the same player twice by default', () => {
    const g = setupT(['mafia', 'thief', 'detective', V, V, V]);
    g.goToNight();
    g.act(1, 'steal', 3);
    g.advance();
    g.goToNight();
    const steal = nightOptions(g.room, 'p1').find((o) => o.abilityId === 'steal')!;
    expect(steal.targets).not.toContain('p3');
  });

  it('can steal the Judge’s weighted vote (passive) when enabled', () => {
    const g = setupT(['mafia', 'thief', 'judge', V, V, V]);
    g.goToNight();
    g.act(1, 'steal', 2);
    g.advance();
    g.goToVoting();
    expect(voteWeight(g.room, g.P(1), false)).toBe(2);
    expect(voteWeight(g.room, g.P(2), false)).toBe(1);
  });

  it('returns a taken ability when the Thief dies', () => {
    const g = setupT(['mafia', 'thief', 'detective', V, V, V]);
    g.goToNight();
    g.act(1, 'steal', 2);
    g.advance();
    g.goToNight();
    g.act(0, 'mafia_kill', 1);
    g.advance();
    expect(g.P(1).alive).toBe(false);
    expect(g.P(2).lostAbilities).toEqual([]);
  });

  it('alignment is configurable', () => {
    const g = setupT(['mafia', 'thief', V, V, V], { thiefAlignment: 'good', detectiveResult: 'alignment' });
    expect(g.room.game!.settings.thiefAlignment).toBe('good');
  });
});

describe('Priest', () => {
  function withDeath(patch = {}) {
    const g = setup(['mafia', 'priest', V, V, V, V, V], patch);
    g.goToNight();
    g.act(0, 'mafia_kill', 2);
    g.advance();
    expect(g.P(2).alive).toBe(false);
    return g;
  }

  it('revives a dead player and announces it publicly', () => {
    const g = withDeath();
    g.goToNight();
    g.act(1, 'revive', 2);
    g.advance();
    expect(g.P(2).alive).toBe(true);
    expect(g.P(2).roleId).toBe('villager');
    expect(g.publicLog()).toContain('P2 has returned to the game!');
    expect(g.P(1).charges.revive).toBe(1);
  });

  it('has no revive option when nobody is dead, and cannot target the living', () => {
    const g = setup(['mafia', 'priest', V, V, V, V]);
    g.goToNight();
    expect(nightOptions(g.room, 'p1').map((o) => o.abilityId)).toEqual(['decoy']);
    expect(() => g.act(1, 'revive', 3)).toThrow(/cannot use/);
  });

  it('runs out after the configured number of charges', () => {
    const g = withDeath({ priestCharges: 1 });
    g.goToNight();
    g.act(1, 'revive', 2);
    g.act(0, 'mafia_kill', 3);
    g.advance();
    g.goToNight();
    expect(nightOptions(g.room, 'p1').map((o) => o.abilityId)).toEqual(['decoy']);
  });

  it('alternate-round rule blocks back-to-back revivals', () => {
    const g = withDeath({ priestAlternateRounds: true });
    g.goToNight();
    g.act(1, 'revive', 2);
    g.act(0, 'mafia_kill', 3);
    g.advance();
    g.goToNight();
    expect(nightOptions(g.room, 'p1').some((o) => o.abilityId === 'revive')).toBe(false);
  });

  it('dead Priest cannot revive unless the house rule allows it', () => {
    const g = setup(['mafia', 'priest', V, V, V, V, V]);
    g.goToNight();
    g.act(0, 'mafia_kill', 1);
    g.advance();
    g.goToNight();
    expect(nightOptions(g.room, 'p1')).toEqual([]);

    const h = setup(['mafia', 'priest', V, V, V, V, V], { priestActsWhenDead: true, priestSelfRevive: true });
    h.goToNight();
    h.act(0, 'mafia_kill', 1);
    h.advance();
    h.goToNight();
    h.act(1, 'revive', 1);
    h.advance();
    expect(h.P(1).alive).toBe(true);
  });

  it('revived player can be configured to lose their role and sit out the next vote', () => {
    const g = setup(['mafia', 'priest', 'detective', V, V, V, V], { revivedKeepRole: false, revivedCanActNextPhase: false });
    g.goToNight();
    g.act(0, 'mafia_kill', 2);
    g.advance();
    g.goToNight();
    g.act(1, 'revive', 2);
    g.advance();
    expect(g.P(2).roleId).toBe('villager');
    g.goToVoting();
    expect(() => g.vote(2, 0)).toThrow(/revived/);
  });
});

describe('Villager optional powers', () => {
  it('are off by default — villagers get the decoy choice', () => {
    const g = setup(['mafia', V, V, V, V]);
    g.goToNight();
    expect(nightOptions(g.room, 'p1').map((o) => o.abilityId)).toEqual(['decoy']);
  });

  it('Hunch tells whether a player has a night power (once)', () => {
    const g = setup(['mafia', 'detective', V, V, V], { villagerPowers: { hunch: true } });
    g.goToNight();
    g.act(2, 'v_hunch', 1);
    g.advance();
    expect(g.results(2).join()).toMatch(/P1 HAS a night power/);
    g.goToNight();
    expect(nightOptions(g.room, 'p2').map((o) => o.abilityId)).toEqual(['decoy']);
  });

  it('Barricade protects the villager for one night', () => {
    const g = setup(['mafia', V, V, V, V], { villagerPowers: { shield: true } });
    g.goToNight();
    g.act(2, 'v_shield', 2);
    g.act(0, 'mafia_kill', 2);
    g.advance();
    expect(g.P(2).alive).toBe(true);
  });

  it('Rally doubles one vote once per game', () => {
    const g = setup(['mafia', V, V, V, V], { villagerPowers: { rally: true } });
    g.goToVoting();
    g.vote(1, 0, true);
    g.vote(2, 3);
    g.advance();
    expect(g.room.game!.lastVerdict!.tally.p0).toBe(2);
    expect(g.P(1).charges.v_rally).toBe(0);
  });
});

describe('Judge', () => {
  it('counts double and changes the outcome of a vote', () => {
    const g = setup(['mafia', 'judge', V, V, V]);
    g.goToVoting();
    g.vote(1, 0); // judge → P0 (weight 2)
    g.vote(2, 3); // weight 1
    g.advance();
    const v = g.room.game!.lastVerdict!;
    expect(v.tally.p0).toBe(2);
    expect(v.tally.p3).toBe(1);
    expect(v.eliminatedId).toBe('p0');
    expect(g.room.game!.winner!.faction).toBe('good');
  });

  it('weight is configurable and not counted when the Judge is dead', () => {
    const g = setup(['mafia', 'judge', V, V, V], { judgeWeight: 3 });
    expect(g.room.game!.settings.judgeWeight).toBe(3);
    g.goToVoting();
    expect(voteWeight(g.room, g.P(1), false)).toBe(3);
    g.P(1).alive = false;
    expect(() => g.vote(1, 0)).toThrow(/Dead/);
  });
});

describe('Jester', () => {
  it('wins alone when voted out during the day (ends the game by default)', () => {
    const g = setup(['mafia', 'jester', V, V, V]);
    g.goToVoting();
    for (const i of [0, 2, 3, 4]) g.vote(i, 1);
    g.advance();
    expect(g.room.status).toBe('over');
    expect(g.room.game!.winner).toMatchObject({ faction: 'jester', winnerIds: ['p1'] });
  });

  it('does not win when killed at night', () => {
    const g = setup(['mafia', 'jester', V, V, V]);
    g.goToNight();
    g.act(0, 'mafia_kill', 1);
    g.advance();
    expect(g.room.status).toBe('active');
    expect(g.room.game!.jesterWinners).toEqual([]);
  });

  it('can let the game continue, and is still credited at the end', () => {
    const g = setup(['mafia', 'jester', V, V, V, V], { jesterEndsGame: false });
    g.goToVoting();
    for (const i of [0, 2, 3, 4, 5]) g.vote(i, 1);
    g.advance();
    expect(g.room.status).toBe('active');
    g.goToVoting();
    for (const i of [2, 3, 4, 5]) g.vote(i, 0);
    g.advance();
    expect(g.room.game!.winner!.faction).toBe('good');
    expect(g.room.game!.winner!.winnerIds).toContain('p1');
    expect(g.room.game!.winner!.winnerIds).not.toContain('p0');
  });
});

describe('Before Nightfall (pre-night) round', () => {
  const opts = (g: ReturnType<typeof setup>, i: number) => nightOptions(g.room, g.id(i)).map((o) => o.abilityId);
  const toPreNight = (g: ReturnType<typeof setup>) => {
    while (g.room.game!.phase !== 'prenight') g.advance();
  };
  const preNightLines = (g: ReturnType<typeof setup>) => g.room.log.filter((l) => l.kind === 'prenight').map((l) => l.text);

  it('runs before every night when a Thief or Imposter is in the game, with a choice for everyone', () => {
    const g = setup(['mafia', 'thief', 'detective', V, V]);
    g.advance();
    expect(g.room.game!.phase).toBe('prenight');
    expect(g.room.game!.round).toBe(1);
    expect([0, 1, 2, 3, 4].map((i) => opts(g, i))).toEqual([['decoy'], ['steal'], ['decoy'], ['decoy'], ['decoy']]);
    // Default: the Thief chooses from POWERS in the setup, not from players.
    expect(nightOptions(g.room, 'p1')[0]).toMatchObject({ targetKind: 'power', targets: ['investigate'] });
    g.advance();
    expect(g.room.game!.phase).toBe('night');
    expect(opts(g, 1)).toEqual(['decoy']); // stealing is no longer a night action
    expect(preNightLines(g)).toEqual(['Nothing stirred before nightfall.']);
  });

  it('is skipped entirely when neither role is in the setup, or the round is switched off', () => {
    const g = setup(['mafia', 'detective', V, V, V]);
    g.advance();
    expect(g.room.game!.phase).toBe('night');
    const h = setup(['mafia', 'thief', V, V, V], { preNightRound: false });
    h.advance();
    expect(h.room.game!.phase).toBe('night');
  });

  it('Thief takes over the stolen job permanently; the victim plays as a Villager; the table learns no names', () => {
    const g = setup(['mafia', 'thief', 'detective', V, V, V], { thiefTargetMode: 'player' });
    toPreNight(g);
    g.act(1, 'steal', 2);
    g.advance();
    expect(g.room.game!.phase).toBe('night');
    const line = preNightLines(g).join();
    expect(line).toMatch(/someone’s power was stolen/);
    expect(line).not.toMatch(/P1|P2|Detective/);
    expect(g.results(2).join()).toMatch(/you play as a Villager — you are still on the same team/);
    expect(g.results(1).join()).toMatch(/starting tonight/);
    // Same night: the Thief investigates instead of the Detective.
    expect(opts(g, 1)).toEqual(['investigate']);
    expect(opts(g, 2)).toEqual(['decoy']);
    g.act(1, 'investigate', 0);
    g.advance();
    expect(g.results(1).join()).toMatch(/P0 is SUSPICIOUS/);
    // Permanent: still the Thief's job on later nights; no second steal by default.
    g.goToNight();
    expect(opts(g, 1)).toEqual(['investigate']);
    expect(g.P(2).roleId).toBe('detective'); // team/identity unchanged
  });

  it('keeps running after the Thief dies, so nobody learns they are gone', () => {
    const g = setup(['mafia', 'thief', 'detective', V, V, V]);
    hostEliminate(g.room, 'p1', 0);
    g.advance();
    expect(g.room.game!.phase).toBe('prenight');
    expect(opts(g, 1)).toEqual([]);
    expect(opts(g, 2)).toEqual(['decoy']);
  });

  it('Imposter can revive anyone dead (from round 2), or skip, and the revival is announced', () => {
    const g = setup(['mafia', 'imposter', V, V, V, V, V]);
    toPreNight(g);
    expect(opts(g, 1)).toEqual(['decoy']); // nobody is dead yet
    g.advance();
    g.act(0, 'mafia_kill', 2);
    g.advance();
    expect(g.P(2).alive).toBe(false);
    toPreNight(g);
    expect(g.room.game!.round).toBe(2);
    expect(opts(g, 1)).toEqual(['imposter_revive']);
    g.act(1, 'imposter_revive', null); // skip
    g.advance();
    expect(g.P(2).alive).toBe(false);
    g.advance(); // resolve night 2 (no kill)
    toPreNight(g);
    g.act(1, 'imposter_revive', 2);
    g.advance();
    expect(g.P(2).alive).toBe(true);
    expect(preNightLines(g)).toContain('P2 has returned to the game!');
    expect(g.room.game!.phase).toBe('night');
  });

  it('Imposter revivals are unlimited by default and limited when configured', () => {
    const g = setup(['mafia', 'imposter', V, V, V, V, V], { imposterCharges: 1 });
    expect(g.P(1).charges.imposter_revive).toBe(1);
    const h = setup(['mafia', 'imposter', V, V, V, V, V]);
    expect(h.P(1).charges.imposter_revive).toBeUndefined();
  });

  it('a dead Imposter cannot revive, but the round continues', () => {
    const g = setup(['mafia', 'imposter', V, V, V, V, V]);
    hostEliminate(g.room, 'p1', 0);
    hostEliminate(g.room, 'p2', 0);
    g.advance();
    expect(g.room.game!.phase).toBe('prenight');
    expect(opts(g, 1)).toEqual([]);
  });

  it('Imposter wins with the Mafia by default (side is configurable)', () => {
    const g = setup(['mafia', 'imposter', V, V, V, V]);
    for (const id of ['p2', 'p3']) hostEliminate(g.room, id, 0);
    expect(g.room.status).toBe('over');
    expect(g.room.game!.winner!.faction).toBe('mafia');
    expect(g.room.game!.winner!.winnerIds).toContain('p1');
    const h = setup(['mafia', 'imposter', V, V, V, V], { imposterAlignment: 'good' });
    hostEliminate(h.room, 'p0', 0);
    expect(checkWin(h.room)!.winnerIds).toContain('p1');
  });

  it('a revival that hands the Mafia parity ends the game immediately', () => {
    const g = setup(['mafia', 'mafia', 'imposter', V, V, V, V, V]);
    hostEliminate(g.room, 'p1', 0);
    for (const id of ['p3', 'p4']) hostEliminate(g.room, id, 0);
    toPreNight(g);
    g.act(2, 'imposter_revive', 1);
    advancePhase(g.room, 0, g.rng);
    expect(g.room.game!.winner!.faction).toBe('mafia');
  });
});

describe('Thief blind power steal (default)', () => {
  it('names a power; the server takes it from whoever holds it; the Thief never learns who', () => {
    const g = setup(['mafia', 'godfather', 'thief', 'detective', 'doctor', 'judge', V, V, V]);
    g.advance();
    expect(g.room.game!.phase).toBe('prenight');
    const steal = nightOptions(g.room, 'p2')[0];
    expect(steal.targets).toEqual(['silence', 'investigate', 'protect', 'judge_vote']);
    expect(() => g.act(2, 'steal', 3)).toThrow(/not allowed/); // players are not valid targets
    submitNightAction(g.room, 'p2', { abilityId: 'steal', targetId: 'protect', phaseSeq: g.seq() }, 1);
    g.advance();
    const thiefMsg = g.results(2).join();
    expect(thiefMsg).toMatch(/You stole the Protect power\. You don’t know whose it was\./);
    expect(thiefMsg).not.toMatch(/P4|Doctor/);
    expect(g.results(4).join()).toMatch(/The Thief stole your Protect power/);
    expect(nightOptions(g.room, 'p2').map((o) => o.abilityId)).toEqual(['protect']);
    expect(nightOptions(g.room, 'p4').map((o) => o.abilityId)).toEqual(['decoy']);
  });

  it('lists powers from the setup even when their holder is dead, and fails quietly', () => {
    const g = setup(['mafia', 'thief', 'detective', V, V, V]);
    g.P(2).alive = false;
    g.advance();
    expect(nightOptions(g.room, 'p1')[0].targets).toEqual(['investigate']);
    submitNightAction(g.room, 'p1', { abilityId: 'steal', targetId: 'investigate', phaseSeq: g.seq() }, 1);
    g.advance();
    expect(g.results(1).join()).toMatch(/Nobody could give up the Investigate power/);
    expect(g.room.log.filter((l) => l.kind === 'prenight').map((l) => l.text)).toEqual(['Nothing stirred before nightfall.']);
  });
});
