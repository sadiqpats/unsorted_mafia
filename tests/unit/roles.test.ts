import { describe, expect, it } from 'vitest';
import { checkWin, hostEliminate, nightOptions, submitNightAction, voteWeight } from '../../src/shared/engine';
import { ROLES } from '../../src/shared/roles';
import { buildView } from '../../src/server/views';
import { setup } from './helpers';

const V = 'villager';
const opts = (g: ReturnType<typeof setup>, i: number) => nightOptions(g.room, g.id(i)).map((o) => o.abilityId);
const toPhase = (g: ReturnType<typeof setup>, phase: string) => {
  for (let i = 0; i < 12 && g.room.game!.phase !== phase; i++) g.advance();
  expect(g.room.game!.phase).toBe(phase);
};
const news = (g: ReturnType<typeof setup>, kind: string) => g.room.log.filter((l) => l.kind === kind).map((l) => l.text);

describe('characters available', () => {
  it('Priest and Bodyguard are gone for good', () => {
    expect(ROLES.priest).toBeUndefined();
    expect(ROLES.bodyguard).toBeUndefined();
  });
});

describe('Mafia', () => {
  it('two Mafia know each other and see each other’s picks live; the Godfather knows them, they never know him', () => {
    const g = setup(['mafia', 'mafia', 'godfather', V, V, V, V, V]);
    g.goToNight();
    const view = (i: number) => buildView(g.room, { kind: 'player', playerId: g.id(i) }, new Set(), 1).me!;
    for (const i of [0, 1]) {
      expect(view(i).mafia!.team.map((t) => t.id)).toEqual(['p0', 'p1']);
      expect(view(i).knownMafia).toBeNull();
    }
    g.act(0, 'mafia_kill', 4);
    // The live plan shows the teammate's pick under an anonymous label, never a name or id.
    const plan = view(1).hitPlan!;
    expect(plan.slots).toHaveLength(2);
    expect(plan.slots.find((x) => !x.you)).toMatchObject({ pick: 'p4' });
    expect(plan.slots.map((x) => x.label).sort()).toEqual(['Mafia 1', 'Mafia 2']);
    expect(JSON.stringify(plan)).not.toContain('p0');
    expect(view(2).hitPlan).toBeNull();
    expect(view(2).mafia).toBeNull();
    expect(view(2).knownMafia!.map((m) => m.id)).toEqual(['p0', 'p1']);
    expect(view(3).mafia).toBeNull();
    expect(view(3).knownMafia).toBeNull();
  });

  it('kills at night; the death is announced by name only (no role)', () => {
    const g = setup(['mafia', V, V, V, 'doctor']);
    g.goToNight();
    g.act(0, 'mafia_kill', 1);
    g.advance();
    expect(g.P(1).alive).toBe(false);
    expect(g.room.game!.phase).toBe('discussion'); // Day (discussion) starts straight after the night
    expect(news(g, 'morning')).toEqual(['P1 was killed during the night.']);
  });

  it('cannot target its own members', () => {
    const g = setup(['mafia', 'mafia', V, V, V, V, V]);
    g.goToNight();
    expect(() => g.act(1, 'mafia_kill', 0)).toThrow(/not allowed/);
  });

  it('uses plurality; ties go to the first-seated Mafia member', () => {
    const a = setup(['mafia', 'mafia', 'mafia', V, V, V, V, V, V]);
    a.goToNight();
    a.act(0, 'mafia_kill', 3);
    a.act(1, 'mafia_kill', 4);
    a.act(2, 'mafia_kill', 4);
    a.advance();
    expect(a.P(4).alive).toBe(false);
    const b = setup(['mafia', 'mafia', V, V, V, V, V]);
    b.goToNight();
    b.act(0, 'mafia_kill', 3);
    b.act(1, 'mafia_kill', 4);
    b.advance();
    expect(b.P(3).alive).toBe(false);
  });

  it('can change the pick during the night; no picks means no kill', () => {
    const g = setup(['mafia', V, V, V, V]);
    g.goToNight();
    g.act(0, 'mafia_kill', 1);
    g.act(0, 'mafia_kill', 2);
    g.advance();
    expect(g.P(2).alive).toBe(false);
    const h = setup(['mafia', V, V, V, V]);
    h.goToNight();
    h.advance();
    expect(h.room.players.every((p) => p.alive)).toBe(true);
    expect(news(h, 'morning')).toEqual(['The town wakes. Nobody died tonight.']);
  });
});

describe('Godfather', () => {
  it('is not a Mafia member: no kill, only silence', () => {
    const g = setup(['godfather', 'mafia', V, V, V, V, V]);
    g.goToNight();
    expect(opts(g, 0)).toEqual(['silence']);
    expect(() => g.act(0, 'mafia_kill', 2)).toThrow(/cannot use/);
  });

  it('silences a player for the next day without being named', () => {
    const g = setup(['godfather', 'mafia', V, V, V, V, V]);
    g.goToNight();
    g.act(0, 'silence', 3);
    g.advance();
    expect(news(g, 'morning').join()).toContain('P3 has been silenced');
    expect(news(g, 'morning').join()).not.toContain('P0');
    g.goToVoting();
    expect(() => g.vote(3, 1)).not.toThrow(); // silenced = can't speak, but can still vote
  });

  it('the Town wins once every Mafia member is dead, even with the Godfather alive', () => {
    const g = setup(['godfather', 'mafia', 'mafia', V, V, V, V, V, V]);
    g.goToNight();
    hostEliminate(g.room, 'p1', 0);
    expect(g.room.status).toBe('active');
    hostEliminate(g.room, 'p2', 0);
    expect(g.room.game!.winner!.faction).toBe('good');
    expect(g.P(0).alive).toBe(true);
    expect(g.room.game!.winner!.winnerIds).not.toContain('p0');
  });

  it('is Evil: does NOT count for a Mafia takeover, but wins when the Mafia win', () => {
    // 1 Mafia + Godfather vs 2 Villagers: the game goes on (only Mafia members count).
    const g = setup(['godfather', 'mafia', V, V, V, V]);
    g.goToNight();
    hostEliminate(g.room, 'p2', 0);
    hostEliminate(g.room, 'p3', 0); // Mafia 1 vs Godfather + 2 Villagers
    expect(g.room.status).toBe('active');
    hostEliminate(g.room, 'p4', 0); // Mafia 1 vs Godfather + 1 Villager → still 1 vs 2
    expect(g.room.status).toBe('active');
    hostEliminate(g.room, 'p0', 0); // the Godfather gone: Mafia 1 vs Villager 1 → Mafia win
    expect(g.room.game!.winner).toMatchObject({ faction: 'mafia' });
    expect(g.room.game!.winner!.winnerIds).toEqual(expect.arrayContaining(['p0', 'p1'])); // the dead Godfather still wins with them
    expect(ROLES.godfather.alignment({} as never)).toBe('evil');
  });

  it('2 Mafia vs 2 others is an immediate Mafia win', () => {
    const g = setup(['mafia', 'mafia', V, V, V, V]);
    g.goToNight();
    hostEliminate(g.room, 'p2', 0);
    expect(g.room.status).toBe('active'); // 2 vs 3
    hostEliminate(g.room, 'p3', 0); // 2 vs 2
    expect(g.room.game!.winner).toMatchObject({ faction: 'mafia' });
  });
});

describe('Detective', () => {
  it('gets a private result; nobody else sees it', () => {
    const g = setup(['mafia', 'detective', V, V, V]);
    g.goToNight();
    g.act(1, 'investigate', 0);
    g.advance();
    expect(g.results(1).join()).toMatch(/P0 is SUSPICIOUS/);
    expect(g.results(2)).toEqual([]);
    expect(g.publicLog().join()).not.toMatch(/SUSPICIOUS/);
  });
  it('sees the Godfather as suspicious unless the house rule hides him', () => {
    const g = setup(['godfather', 'mafia', 'detective', V, V, V, V]);
    g.goToNight();
    g.act(2, 'investigate', 0);
    g.advance();
    expect(g.results(2).join()).toMatch(/SUSPICIOUS/);
    const h = setup(['godfather', 'mafia', 'detective', V, V, V, V], { godfatherAppearsInnocent: true });
    h.goToNight();
    h.act(2, 'investigate', 0);
    h.advance();
    expect(h.results(2).join()).toMatch(/NOT suspicious/);
  });
});

describe('Doctor', () => {
  it('saves the Mafia target without announcing the save', () => {
    const g = setup(['mafia', 'doctor', V, V, V]);
    g.goToNight();
    g.act(0, 'mafia_kill', 2);
    g.act(1, 'protect', 2);
    g.advance();
    expect(g.P(2).alive).toBe(true);
    expect(news(g, 'morning')).toEqual(['The town wakes. Nobody died tonight.']);
  });

  it('may save themselves — but not two rounds in a row (alternate rounds)', () => {
    const g = setup(['mafia', 'doctor', V, V, V, V, V]);
    g.goToNight();
    expect(nightOptions(g.room, 'p1')[0].targets).toContain('p1'); // round 1: allowed
    g.act(1, 'protect', 1);
    g.act(0, 'mafia_kill', 1);
    g.advance();
    expect(g.P(1).alive).toBe(true);
    g.goToNight(); // round 2
    expect(nightOptions(g.room, 'p1')[0].targets).not.toContain('p1');
    g.act(1, 'protect', 2);
    g.advance();
    g.goToNight(); // round 3: allowed again
    expect(nightOptions(g.room, 'p1')[0].targets).toContain('p1');
  });

  it('self-saving can be set to always or never', () => {
    const never = setup(['mafia', 'doctor', V, V, V], { doctorSelfProtect: 'never' });
    never.goToNight();
    expect(nightOptions(never.room, 'p1')[0].targets).not.toContain('p1');
  });
});

describe('Thief (steals at Dawn, one round at a time)', () => {
  it('Dawn comes first, from round 1; the Thief sees powers, never people', () => {
    const g = setup(['mafia', 'thief', 'detective', 'doctor', V, V]);
    g.advance();
    expect(g.room.game!.phase).toBe('prenight');
    expect(g.room.game!.round).toBe(1);
    const steal = nightOptions(g.room, 'p1')[0];
    expect(steal).toMatchObject({ abilityId: 'steal', targetKind: 'power' });
    expect(steal.targets).toEqual(['mafia_kill', 'investigate', 'protect']);
    expect([0, 2, 3, 4].map((i) => opts(g, i))).toEqual([['decoy'], ['decoy'], ['decoy'], ['decoy']]);
  });

  it('steals a power for this round only; the Thief never learns whose; the victim is told', () => {
    const g = setup(['mafia', 'thief', 'detective', V, V, V]);
    toPhase(g, 'prenight');
    submitNightAction(g.room, 'p1', { abilityId: 'steal', targetId: 'investigate', phaseSeq: g.seq() }, 1);
    g.advance();
    expect(g.room.game!.phase).toBe('night');
    expect(news(g, 'prenight')).toEqual(['At dawn, the Thief struck — someone’s power was stolen for this round.']);
    expect(g.results(1).join()).toMatch(/You stole the Investigate power for this round\. You don’t know whose it was\./);
    expect(g.results(1).join()).not.toMatch(/P2/);
    expect(g.results(2).join()).toMatch(/Your Investigate power has been stolen for this round/);
    expect(opts(g, 1)).toEqual(['investigate']);
    expect(opts(g, 2)).toEqual(['decoy']); // the robbed Detective just presses the dummy button
    g.act(1, 'investigate', 0);
    g.advance();
    expect(g.results(1).join()).toMatch(/P0 is SUSPICIOUS/);
    // Next Dawn: the power goes back to its owner.
    toPhase(g, 'prenight');
    expect(g.P(2).lostAbilities).toEqual([]);
    expect(g.P(1).stolen).toBeNull();
  });

  it('cannot take the same power two rounds in a row, but can on alternate rounds', () => {
    const g = setup(['mafia', 'thief', 'detective', 'doctor', V, V, V]);
    toPhase(g, 'prenight');
    submitNightAction(g.room, 'p1', { abilityId: 'steal', targetId: 'investigate', phaseSeq: g.seq() }, 1);
    g.advance();
    toPhase(g, 'prenight'); // round 2
    expect(nightOptions(g.room, 'p1')[0].targets).not.toContain('investigate');
    submitNightAction(g.room, 'p1', { abilityId: 'steal', targetId: 'protect', phaseSeq: g.seq() }, 1);
    g.advance();
    toPhase(g, 'prenight'); // round 3
    expect(nightOptions(g.room, 'p1')[0].targets).toContain('investigate');
    expect(nightOptions(g.room, 'p1')[0].targets).not.toContain('protect');
  });

  it('stealing the Mafia Hit: the Thief joins the Mafia vote anonymously; one kill; the robbed Mafia presses the dummy button', () => {
    const g = setup(['mafia', 'thief', V, V, V, V, V]);
    toPhase(g, 'prenight');
    submitNightAction(g.room, 'p1', { abilityId: 'steal', targetId: 'mafia_kill', phaseSeq: g.seq() }, 1);
    g.advance();
    expect(g.results(0).join()).toMatch(/Your Mafia Hit power has been stolen for this round/);
    expect(g.results(1).join()).toMatch(/vote with the Mafia/);
    expect(opts(g, 0)).toEqual(['decoy']);
    const kill = nightOptions(g.room, 'p1')[0];
    expect(kill).toMatchObject({ abilityId: 'mafia_kill', team: true, changeable: true });
    // His target list includes everyone else alive — he does not learn who the Mafia are.
    expect(kill.targets).toContain('p0');
    // The robbed Mafia still sees the (anonymous) plan; the Thief sees it too — never a name.
    const view = (i: number) => buildView(g.room, { kind: 'player', playerId: g.id(i) }, new Set(), 1).me!;
    g.act(1, 'mafia_kill', 4);
    expect(view(0).hitPlan).toMatchObject({ youVote: false, slots: [{ label: 'Mafia 1', you: false, pick: 'p4' }] });
    expect(view(1).hitPlan).toMatchObject({ youVote: true, slots: [{ label: 'Mafia 1', you: true }] });
    expect(view(1).mafia).toBeNull();
    g.advance();
    expect(g.P(4).alive).toBe(false);
    // The Mafia gets the power back next round.
    g.goToNight();
    expect(opts(g, 0)).toEqual(['mafia_kill']);
  });

  it('with two Mafia + the Thief: three anonymous votes, ONE kill (most picks wins), nobody identified', () => {
    const g = setup(['mafia', 'mafia', 'mafia', 'thief', V, V, V, V, V, V]);
    toPhase(g, 'prenight');
    submitNightAction(g.room, 'p3', { abilityId: 'steal', targetId: 'mafia_kill', phaseSeq: g.seq() }, 1);
    g.advance();
    const robbed = g.room.players.find((p) => p.lostAbilities.includes('mafia_kill'))!;
    const [m1, m2] = ['p0', 'p1', 'p2'].filter((id) => id !== robbed.id);
    submitNightAction(g.room, m1, { abilityId: 'mafia_kill', targetId: 'p5', phaseSeq: g.seq() }, 1);
    submitNightAction(g.room, m2, { abilityId: 'mafia_kill', targetId: 'p6', phaseSeq: g.seq() }, 2);
    g.act(3, 'mafia_kill', 6); // the Thief sides with p6
    for (const id of ['p0', 'p1', 'p2', 'p3']) {
      const me = buildView(g.room, { kind: 'player', playerId: id }, new Set(), 1).me!;
      expect(me.hitPlan!.slots).toHaveLength(3); // m1, m2 and the Thief
      const raw = JSON.stringify(me.hitPlan);
      for (const other of ['p0', 'p1', 'p2', 'p3']) expect(raw).not.toContain(`"${other}"`);
    }
    // Teammates still know each other by name (on the card), but never the Thief.
    const fam = buildView(g.room, { kind: 'player', playerId: m1 }, new Set(), 1).me!.mafia!;
    expect(fam.team.map((t) => t.id).sort()).toEqual(['p0', 'p1', 'p2']);
    g.advance();
    expect(g.P(6).alive).toBe(false);
    expect(g.P(5).alive).toBe(true); // one kill only
  });

  it('the anonymous order is shuffled each night', () => {
    const g = setup(['mafia', 'mafia', 'mafia', V, V, V, V, V, V, V]);
    const seen = new Set<string>();
    for (let night = 0; night < 6 && seen.size < 2; night++) {
      g.goToNight();
      const me = buildView(g.room, { kind: 'player', playerId: 'p0' }, new Set(), 1).me!;
      seen.add(me.hitPlan!.slots.findIndex((x) => x.you).toString());
      for (const i of [0, 1, 2]) g.act(i, 'mafia_kill', null);
      g.advance();
      // revive everyone so the game keeps going
      for (const p of g.room.players) p.alive = true;
      g.room.status = 'active';
      g.room.game!.winner = null as never;
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it('the Thief can steal Resurrect (from round 2): the Imposter’s Dawn revive is cancelled and the Thief revives that night', () => {
    const g = setup(['mafia', 'thief', 'imposter', V, V, V, V]);
    g.P(4).alive = false;
    toPhase(g, 'prenight'); // round 1: nothing to revive yet
    expect(nightOptions(g.room, 'p1')[0].targets).not.toContain('imposter_revive');
    for (let i = 0; i < 12 && !(g.room.game!.phase === 'prenight' && g.room.game!.round === 2); i++) g.advance();
    expect(nightOptions(g.room, 'p1')[0].targets).toContain('imposter_revive');
    submitNightAction(g.room, 'p1', { abilityId: 'steal', targetId: 'imposter_revive', phaseSeq: g.seq() }, 1);
    submitNightAction(g.room, 'p2', { abilityId: 'imposter_revive', targetId: 'p4', phaseSeq: g.seq() }, 1);
    g.advance();
    expect(g.P(4).alive).toBe(false); // the Imposter's revive was stolen first
    expect(g.results(2).join()).toMatch(/Resurrect power has been stolen/);
    expect(g.room.game!.phase).toBe('night');
    const opt = nightOptions(g.room, 'p1').find((o) => o.abilityId === 'imposter_revive')!;
    expect(opt.targets).toContain('p4');
    g.act(1, 'imposter_revive', 4);
    g.advance();
    expect(g.P(4).alive).toBe(true);
  });

  it('the power list never reveals who is alive (holder dead → attempt fails quietly)', () => {
    const g = setup(['mafia', 'thief', 'detective', V, V, V]);
    g.P(2).alive = false;
    toPhase(g, 'prenight');
    expect(nightOptions(g.room, 'p1')[0].targets).toContain('investigate');
    submitNightAction(g.room, 'p1', { abilityId: 'steal', targetId: 'investigate', phaseSeq: g.seq() }, 1);
    g.advance();
    expect(g.results(1).join()).toMatch(/Nobody could give up the Investigate power/);
    expect(news(g, 'prenight')).toEqual(['Dawn passed quietly.']);
  });

  it('can steal the Judge’s double vote for that day', () => {
    const g = setup(['mafia', 'thief', 'judge', V, V, V]);
    toPhase(g, 'prenight');
    submitNightAction(g.room, 'p1', { abilityId: 'steal', targetId: 'judge_vote', phaseSeq: g.seq() }, 1);
    g.advance();
    g.goToVoting();
    expect(voteWeight(g.room, g.P(1), false)).toBe(2);
    expect(voteWeight(g.room, g.P(2), false)).toBe(1);
  });

  it('keeps Dawn running after the Thief dies, so nobody learns it', () => {
    const g = setup(['mafia', 'thief', 'detective', V, V, V]);
    hostEliminate(g.room, 'p1', 0);
    g.advance();
    expect(g.room.game!.phase).toBe('prenight');
    expect(opts(g, 1)).toEqual([]);
    expect(opts(g, 2)).toEqual(['decoy']);
  });
});

describe('Imposter (Neutral, revives at Dawn from round 2)', () => {
  it('is Neutral by default and wins by surviving', () => {
    const g = setup(['mafia', 'imposter', V, V, V, V]);
    expect(g.room.game!.settings.imposterAlignment).toBe('neutral');
    hostEliminate(g.room, 'p0', 0);
    expect(g.room.game!.winner!.faction).toBe('good');
    expect(g.room.game!.winner!.winnerIds).toContain('p1');
  });

  it('cannot revive in round 1; can revive (or skip) from round 2; everyone sees who returned', () => {
    const g = setup(['mafia', 'imposter', V, V, V, V, V]);
    toPhase(g, 'prenight');
    expect(opts(g, 1)).toEqual(['decoy']);
    g.advance(); // night 1
    g.act(0, 'mafia_kill', 2);
    g.advance(); // day 1
    toPhase(g, 'prenight'); // round 2
    expect(opts(g, 1)).toEqual(['imposter_revive']);
    g.act(1, 'imposter_revive', 2);
    g.advance();
    expect(g.P(2).alive).toBe(true);
    expect(news(g, 'prenight')).toContain('P2 has been revived and is back in the game!');
    expect(news(g, 'prenight').join()).not.toMatch(/P1|Imposter/);
  });

  it('skipping leaves the dead player dead', () => {
    const g = setup(['mafia', 'imposter', V, V, V, V, V]);
    g.P(3).alive = false;
    toPhase(g, 'prenight');
    g.advance();
    toPhase(g, 'prenight');
    g.act(1, 'imposter_revive', null);
    g.advance();
    expect(g.P(3).alive).toBe(false);
  });
});

describe('Judge', () => {
  it('decides a 2-vs-1 split', () => {
    const g = setup(['mafia', 'judge', V, V, V]);
    g.goToVoting();
    g.vote(1, 0);
    g.vote(2, 3);
    g.advance();
    expect(g.room.game!.lastVerdict!.tally.p0).toBe(2);
    expect(g.room.game!.winner!.faction).toBe('good');
  });
});

describe('Jester', () => {
  it('wins alone when voted out', () => {
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
  });
});

describe('Villager optional powers (off by default)', () => {
  it('villagers get the dummy button by default', () => {
    const g = setup(['mafia', V, V, V, V]);
    g.goToNight();
    expect(opts(g, 1)).toEqual(['decoy']);
  });
  it('Barricade protects the villager once', () => {
    const g = setup(['mafia', V, V, V, V], { villagerPowers: { shield: true } });
    g.goToNight();
    g.act(2, 'v_shield', 2);
    g.act(0, 'mafia_kill', 2);
    g.advance();
    expect(g.P(2).alive).toBe(true);
  });
});

describe('roles stay secret until the game is over', () => {
  it('no role appears in any announcement before game over', () => {
    const g = setup(['mafia', 'doctor', 'detective', V, V, V]);
    g.goToNight();
    g.act(0, 'mafia_kill', 3);
    g.advance();
    g.goToVoting();
    for (const i of [0, 1, 2, 5]) g.vote(i, 4); // vote out P4
    g.advance();
    expect(g.P(4).alive).toBe(false);
    const text = g.publicLog().join('\n');
    expect(text).not.toMatch(/Villager|Doctor|Detective|Mafia\b|They were/);
    expect(checkWin(g.room)).toBeNull();
  });
});

describe('Bollywood Mafia Night', () => {
  it('names every character both ways and swaps names in text (but never the team name "Mafia")', async () => {
    const { roleTitle, roleShort, roleBoth, roleArt, themeText, BOLLYWOOD } = await import('../../src/shared/roles');
    expect(Object.keys(BOLLYWOOD).sort()).toEqual([...Object.keys(ROLES)].sort());
    expect(roleTitle('mafia', { bollywood: true })).toBe('Gabbar (Mafia)');
    expect(roleTitle('mafia', { bollywood: false })).toBe('Mafia');
    expect(roleShort('jester', { bollywood: true })).toBe('Baburao');
    expect(roleBoth('godfather')).toBe('Godfather / Badde Sahab');
    expect(roleArt('doctor', { bollywood: true })).toBe('bw-munna');
    expect(roleArt('doctor', {})).toBe(ROLES.doctor.art);
    expect(themeText('At dawn, the Thief struck. The Godfather knows the Mafia.', { bollywood: true })).toBe('At dawn, Bunty struck. Badde Sahab knows the Mafia.');
    expect(themeText('the Joker', { bollywood: false })).toBe('the Joker');
  });

  it('announcements and the game-over line use the Bollywood names', () => {
    const g = setup(['mafia', 'jester', V, V, V], { bollywood: true });
    g.goToVoting();
    for (const i of [0, 2, 3, 4]) g.vote(i, 1);
    g.vote(1, 0);
    g.advance();
    expect(g.publicLog().join('\n')).toContain('Baburao');
    expect(g.publicLog().join('\n')).not.toContain('the Joker');
  });
});
