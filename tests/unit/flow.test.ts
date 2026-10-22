import { describe, expect, it } from 'vitest';
import {
  acknowledgeRole,
  addPlayer,
  advancePhase,
  checkWin,
  createRoom,
  extendTimer,
  hostEliminate,
  hostRestore,
  nightComplete,
  nightOptions,
  pauseGame,
  resetToLobby,
  resolveTie,
  resumeGame,
  submitNightAction,
  tick,
} from '../../src/shared/engine';
import { T0, setup } from './helpers';

const V = 'villager';

describe('voting rules', () => {
  it('blocks dead players, self-votes and double votes', () => {
    const g = setup(['mafia', V, V, V, V]);
    g.goToNight();
    g.act(0, 'mafia_kill', 1);
    g.goToVoting();
    expect(() => g.vote(1, 2)).toThrow(/Dead/);
    expect(() => g.vote(2, 2)).toThrow(/yourself/);
    g.vote(2, 3);
    expect(() => g.vote(2, 4)).toThrow(/locked/);
  });

  it('allows self-votes and vote changes only when enabled', () => {
    const g = setup(['mafia', V, V, V, V], { allowSelfVote: true, allowVoteChange: true });
    g.goToVoting();
    g.vote(2, 2);
    g.vote(2, 0);
    expect(g.room.game!.day.votes.p2.targetId).toBe('p0');
  });

  it('rejects actions for a phase that already closed (replay protection)', () => {
    const g = setup(['mafia', V, V, V, V]);
    g.goToVoting();
    const staleSeq = g.seq() - 1;
    expect(() =>
      submitNightAction(g.room, 'p0', { abilityId: 'mafia_kill', targetId: 'p1', phaseSeq: staleSeq }, T0),
    ).toThrow();
  });

  it('abstentions can outweigh the leader', () => {
    const g = setup(['mafia', V, V, V, V]);
    g.goToVoting();
    g.vote(0, 1);
    g.vote(2, null);
    g.vote(3, null);
    g.advance();
    expect(g.room.game!.lastVerdict!.eliminatedId).toBeNull();
  });

  it('abstaining can be disabled', () => {
    const g = setup(['mafia', V, V, V, V], { allowAbstain: false });
    g.goToVoting();
    expect(() => g.vote(0, null)).toThrow(/Abstaining/);
  });

  const tieVotes = (g: ReturnType<typeof setup>) => {
    g.vote(0, 1);
    g.vote(1, 0);
    g.vote(2, 1);
    g.vote(3, 0);
    g.advance();
  };

  it('tie rule "none": nobody is eliminated', () => {
    const g = setup(['mafia', V, V, V, V]);
    g.goToVoting();
    tieVotes(g);
    expect(g.room.game!.phase).toBe('night'); // straight on to the next round
    expect(g.room.game!.lastVerdict).toMatchObject({ tie: true, eliminatedId: null });
    expect(g.room.players.every((p) => p.alive)).toBe(true);
  });

  it('tie rule "runoff": revote between the tied players, once', () => {
    const g = setup(['mafia', V, V, V, V], { tieRule: 'runoff' });
    g.goToVoting();
    tieVotes(g);
    expect(g.room.game!.phase).toBe('voting');
    expect(g.room.game!.day.runoff!.sort()).toEqual(['p0', 'p1']);
    expect(() => g.vote(2, 3)).toThrow();
    tieVotes(g);
    expect(g.room.game!.phase).toBe('night');
    expect(g.room.players.every((p) => p.alive)).toBe(true);
  });

  it('tie rule "host": waits for the Game Master and blocks auto-advance', () => {
    const g = setup(['mafia', V, V, V, V], { tieRule: 'host' });
    g.goToVoting();
    tieVotes(g);
    expect(g.room.game!.pendingTie!.sort()).toEqual(['p0', 'p1']);
    expect(tick(g.room, T0 + 10_000_000, g.rng)).toBe(false);
    expect(() => g.advance()).toThrow(/tie/);
    expect(() => resolveTie(g.room, 'p3', T0)).toThrow();
    resolveTie(g.room, 'p0', T0);
    expect(g.room.game!.winner!.faction).toBe('good');
  });

  it('silenced players stay quiet but can still vote (default)', () => {
    const g = setup(['godfather', 'mafia', V, V, V, V, V]);
    g.goToNight();
    g.act(0, 'silence', 3);
    g.goToVoting();
    expect(() => g.vote(3, 1)).not.toThrow();
    expect(g.room.game!.day.votes.p3.targetId).toBe('p1');
  });

  it('house rule: silenced players can be blocked from voting too, with a reason', () => {
    const g = setup(['godfather', 'mafia', V, V, V, V, V], { silencedCanVote: false });
    g.goToNight();
    g.act(0, 'silence', 3);
    g.goToVoting();
    expect(() => g.vote(3, 0)).toThrow(/silenced/);
  });
});

describe('win conditions', () => {
  it('Godfather takes over (house rule): with every Mafia member dead he makes the hit, and the game goes on', () => {
    const g = setup(['mafia', 'godfather', V, V, V, V, V], { godfatherTakesOver: true });
    g.goToVoting();
    hostEliminate(g.room, 'p0', T0);
    expect(g.room.game!.winner).toBeNull();
    expect(g.P(1).heir).toBe(true);
    g.goToNight();
    expect(nightOptions(g.room, 'p1').map((o) => o.abilityId)).toContain('mafia_kill');
    g.act(1, 'mafia_kill', 3);
    g.goToVoting();
    expect(g.P(3).alive).toBe(false);
    hostEliminate(g.room, 'p1', T0);
    expect(g.room.game!.winner!.faction).toBe('good');
  });

  it('Godfather does not take over by default: the Town wins once the Mafia members are dead', () => {
    const g = setup(['mafia', 'godfather', V, V, V, V, V]);
    g.goToVoting();
    hostEliminate(g.room, 'p0', T0);
    expect(g.room.game!.winner!.faction).toBe('good');
  });

  it('Good wins when all Mafia are gone', () => {
    const g = setup(['mafia', V, V, V, V]);
    g.goToVoting();
    hostEliminate(g.room, 'p0', T0);
    expect(g.room.game!.winner!.faction).toBe('good');
  });

  it('Mafia wins at parity (default)', () => {
    const g = setup(['mafia', V, V, V, V]);
    g.goToNight();
    hostEliminate(g.room, 'p1', T0);
    hostEliminate(g.room, 'p2', T0);
    expect(g.room.status).toBe('active');
    hostEliminate(g.room, 'p3', T0);
    expect(g.room.game!.winner!.faction).toBe('mafia');
  });

  it('majority rule requires Mafia to strictly outnumber', () => {
    const g = setup(['mafia', V, V, V, V], { mafiaWin: 'majority' });
    g.goToNight();
    for (const id of ['p1', 'p2', 'p3']) hostEliminate(g.room, id, T0);
    expect(g.room.status).toBe('active');
    hostEliminate(g.room, 'p4', T0);
    expect(g.room.game!.winner!.faction).toBe('mafia');
  });

  it('survivor neutrals co-win with the winning faction', () => {
    const g = setup(['mafia', 'imposter', 'thief', V, V, V]);
    g.goToVoting();
    hostEliminate(g.room, 'p0', T0);
    const w = g.room.game!.winner!;
    expect(w.faction).toBe('good');
    expect(w.winnerIds).toEqual(expect.arrayContaining(['p1', 'p2', 'p3', 'p4', 'p5']));
    expect(w.winnerIds).not.toContain('p0');
  });

  it('a draw when nobody survives', () => {
    const g = setup(['mafia', V, V, V, V]);
    for (const p of g.room.players) p.alive = false;
    expect(checkWin(g.room)!.faction).toBe('draw');
  });

  it('Mafia win when the last townsperson falls at night', () => {
    const g = setup(['mafia', V, V, V, V]);
    g.goToNight();
    hostEliminate(g.room, 'p1', T0);
    hostEliminate(g.room, 'p2', T0);
    g.act(0, 'mafia_kill', 3);
    g.advance();
    expect(g.room.game!.winner!.faction).toBe('mafia');
    expect(g.room.game!.phase).toBe('game_over');
  });
});

describe('night flow & anti-cheat', () => {
  it('every living player gets an action (decoy for those without powers)', () => {
    const g = setup(['mafia', 'doctor', 'judge', 'jester', V]);
    g.goToNight();
    const kinds = g.room.players.map((p) => nightOptions(g.room, p.id).map((o) => o.abilityId));
    expect(kinds).toEqual([['mafia_kill'], ['protect'], ['decoy'], ['decoy'], ['decoy']]);
  });

  it('auto-resolves only once everyone has locked in', () => {
    const g = setup(['mafia', 'doctor', V, V, V]);
    g.goToNight();
    g.act(0, 'mafia_kill', 2);
    g.act(1, 'protect', 3);
    g.act(2, 'decoy', 0);
    g.act(3, 'decoy', 0);
    expect(nightComplete(g.room)).toBe(false);
    expect(tick(g.room, g.clock(), g.rng)).toBe(false);
    g.act(4, 'decoy', null);
    expect(tick(g.room, g.clock(), g.rng)).toBe(true);
    expect(g.room.game!.phase).toBe('discussion'); // Day
    expect(g.room.game!.stats.suspicion.p0).toBe(2);
  });

  it('prevents duplicate submissions', () => {
    const g = setup(['mafia', 'doctor', V, V, V]);
    g.goToNight();
    g.act(1, 'protect', 2);
    expect(() => g.act(1, 'protect', 3)).toThrow(/already/);
    g.act(4, 'decoy', 1);
    expect(() => g.act(4, 'decoy', 2)).toThrow(/already/);
  });

  it('dead players have no actions and cannot submit', () => {
    const g = setup(['mafia', 'doctor', V, V, V]);
    g.goToNight();
    g.act(0, 'mafia_kill', 1);
    g.advance();
    g.goToNight();
    expect(nightOptions(g.room, 'p1')).toEqual([]);
    expect(() => g.act(1, 'protect', 2)).toThrow(/cannot use/);
  });
});

describe('timers, pause and host corrections', () => {
  it('the default clock: Dawn 30 s and Night 30 s after a 5 s break, a 4-minute discussion that opens the vote, a 30 s vote', () => {
    const g = setup(['mafia', 'thief', V, V, V], { bufferSeconds: 5 });
    expect(g.room.game!.phaseEndsAt).toBeNull(); // role reveal: until everyone has looked
    for (const p of g.room.players) acknowledgeRole(g.room, p.id);
    const t1 = g.clock();
    expect(tick(g.room, t1, g.rng)).toBe(true);
    const gm = g.room.game!;
    expect(gm.phase).toBe('prenight');
    expect(gm.phaseOpensAt).toBe(t1 + 5000);
    expect(gm.phaseEndsAt).toBe(t1 + 5000 + 30_000);
    // Nobody can act during the break.
    expect(() => submitNightAction(g.room, 'p1', { abilityId: 'steal', targetId: 'mafia_kill', phaseSeq: g.seq() }, t1 + 1000)).toThrow(/opens in a moment/);
    // Time runs out with nobody acting: Dawn simply ends, then Night (30 s after its own break).
    expect(tick(g.room, gm.phaseEndsAt! + 1, g.rng)).toBe(true);
    expect(gm.phase).toBe('night');
    const nightStart = gm.phaseStartedAt;
    expect(gm.phaseEndsAt).toBe(nightStart + 5000 + 30_000);
    expect(tick(g.room, gm.phaseEndsAt! + 1, g.rng)).toBe(true);
    // Day: a 4-minute discussion (no break); when it runs out the vote opens by itself.
    expect(gm.phase).toBe('discussion');
    const dayStart = gm.phaseStartedAt;
    expect(gm.phaseEndsAt).toBe(dayStart + 240_000);
    expect(tick(g.room, dayStart + 239_000, g.rng)).toBe(false);
    expect(tick(g.room, dayStart + 240_000, g.rng)).toBe(true);
    expect(gm.phase).toBe('voting');
    expect(gm.phaseEndsAt).toBe(dayStart + 240_000 + 30_000);
    expect(tick(g.room, gm.phaseEndsAt! + 1, g.rng)).toBe(true); // nobody voted: nobody out, the game goes on
    expect(gm.phase).toBe('prenight');
  });

  it('the host can open the vote before the discussion clock runs out; the length is a setting', () => {
    const g = setup(['mafia', V, V, V, V], { daySeconds: 210 });
    while (g.room.game!.phase !== 'discussion') g.advance();
    const gm = g.room.game!;
    expect(gm.phaseEndsAt).toBe(gm.phaseStartedAt + 210_000);
    const v = g.clock();
    advancePhase(g.room, v, g.rng, 'host');
    expect(gm.phase).toBe('voting');
    expect(gm.phaseEndsAt).toBe(v + 30_000);
  });

  it('"No timer for discussion": the discussion waits for the host; everything else stays timed', () => {
    const g = setup(['mafia', V, V, V, V], { discussionTimer: false });
    g.goToNight();
    expect(g.room.game!.phaseEndsAt).not.toBeNull();
    while (g.room.game!.phase !== 'discussion') g.advance();
    expect(g.room.game!.phaseEndsAt).toBeNull();
    expect(tick(g.room, T0 + 1e12, g.rng)).toBe(false);
    g.advance();
    expect(g.room.game!.phase).toBe('voting');
    expect(g.room.game!.phaseEndsAt).not.toBeNull();
  });

  it('"No timers at all": no clock anywhere — phases end when everyone has acted, or by the host', () => {
    const g = setup(['mafia', V, V, V, V], { timers: false });
    g.goToNight();
    const gm = g.room.game!;
    expect(gm.phaseEndsAt).toBeNull();
    expect(tick(g.room, T0 + 1e12, g.rng)).toBe(false); // nobody acted: it waits
    g.act(0, 'mafia_kill', 1);
    for (const i of [1, 2, 3, 4]) g.act(i, 'decoy', null);
    expect(tick(g.room, g.clock(), g.rng)).toBe(true); // everyone acted: on to the Day
    expect(gm.phase).toBe('discussion');
    expect(gm.phaseEndsAt).toBeNull();
    g.advance();
    expect(gm.phase).toBe('voting');
    expect(gm.phaseEndsAt).toBeNull();
    expect(tick(g.room, T0 + 1e12, g.rng)).toBe(false);
  });

  it('after the vote: an 8 s pause on the result (even with no timers), then Dawn/Night', () => {
    for (const timers of [true, false]) {
      const g = setup(['mafia', V, V, V, V, V], { verdictSeconds: 8, timers });
      g.goToVoting();
      for (const i of [0, 1, 2, 3, 4, 5]) g.vote(i, i === 1 ? 2 : 1);
      const t = g.clock();
      expect(tick(g.room, t, g.rng)).toBe(true);
      const gm = g.room.game!;
      expect(gm.phase).toBe('verdict');
      expect(g.P(1).alive).toBe(false);
      expect(gm.phaseEndsAt).toBe(gm.phaseStartedAt + 8000);
      expect(tick(g.room, gm.phaseStartedAt + 7000, g.rng)).toBe(false);
      expect(tick(g.room, gm.phaseStartedAt + 8000, g.rng)).toBe(true);
      expect(gm.phase).toBe('night');
      expect(gm.round).toBe(2);
    }
  });

  it('after an even round the town learns how many Mafia are left (a number, never who); odd rounds say nothing', () => {
    const g = setup(['mafia', 'mafia', 'godfather', V, V, V, V, V, V], { verdictSeconds: 8 });
    const voteOut = (target: number) => {
      g.goToVoting();
      for (const p of g.room.players) if (p.alive) g.vote(Number(p.id.slice(1)), Number(p.id.slice(1)) === target ? 3 + ((target + 1) % 6) : target);
      tick(g.room, g.clock(), g.rng);
    };
    voteOut(3); // round 1: a villager goes — no count
    expect(g.room.game!.mafiaLeft ?? null).toBeNull();
    expect(g.publicLog().some((l) => /still among you/.test(l))).toBe(false);
    g.advance(); // the pause ends → round 2
    expect(g.room.game!.round).toBe(2);
    voteOut(0); // round 2: a Mafia member goes → 1 Mafia left (the Godfather doesn't count)
    expect(g.room.game!.mafiaLeft).toEqual({ round: 2, count: 1 });
    expect(g.publicLog()).toContain('1 member of the Mafia is still among you.');
    expect(g.room.game!.phase).toBe('verdict');
  });

  it('the day ends as soon as every eligible player has voted', () => {
    const g = setup(['mafia', V, V, V, V]);
    g.goToVoting();
    for (const i of [0, 1, 2, 3]) g.vote(i, 4);
    expect(tick(g.room, g.clock(), g.rng)).toBe(false); // P4 hasn't voted
    g.vote(4, 0);
    expect(tick(g.room, g.clock(), g.rng)).toBe(true);
    expect(g.P(4).alive).toBe(false);
    expect(g.room.game!.phase).toBe('night');
  });

  it('a phase ends when the clock runs out, even if someone never acts (their action just doesn’t count)', () => {
    const g = setup(['mafia', V, V, V, V]);
    for (const p of g.room.players) acknowledgeRole(g.room, p.id);
    tick(g.room, g.clock(), g.rng);
    expect(g.room.game!.phase).toBe('night');
    g.act(0, 'mafia_kill', 1); // only the Mafia acts
    expect(tick(g.room, g.room.game!.phaseEndsAt! - 1, g.rng)).toBe(false);
    expect(tick(g.room, g.room.game!.phaseEndsAt! + 1, g.rng)).toBe(true);
    expect(g.room.game!.phase).toBe('discussion');
    expect(g.P(1).alive).toBe(false);
  });

  it('reveal ends early once everyone has seen their role', () => {
    const g = setup(['mafia', V, V, V, V]);
    for (const p of g.room.players) acknowledgeRole(g.room, p.id);
    expect(tick(g.room, g.clock(), g.rng)).toBe(true);
    expect(g.room.game!.phase).toBe('night');
  });

  it('pause freezes the clock and rejects actions; resume restores remaining time', () => {
    const g = setup(['mafia', V, V, V, V], { timers: true });
    g.goToNight();
    const now = g.room.game!.phaseStartedAt;
    pauseGame(g.room, now + 10_000);
    expect(g.room.game!.pausedRemainingMs).toBe(20_000);
    expect(tick(g.room, now + 999_999, g.rng)).toBe(false);
    expect(() => g.act(0, 'mafia_kill', 1)).toThrow(/paused/);
    resumeGame(g.room, now + 100_000);
    expect(g.room.game!.phaseEndsAt).toBe(now + 120_000);
    extendTimer(g.room, 30, now + 100_000);
    expect(g.room.game!.phaseEndsAt).toBe(now + 150_000);
  });

  it('the host can always move a stuck phase on', () => {
    const g = setup(['mafia', V, V, V, V]);
    advancePhase(g.room, T0, g.rng, 'host');
    expect(g.room.game!.phase).toBe('night');
  });

  it('host corrections are public and appended, never silent', () => {
    const g = setup(['mafia', V, V, V, V, V]);
    g.goToNight();
    hostEliminate(g.room, 'p2', T0);
    hostRestore(g.room, 'p2', T0);
    const log = g.publicLog().join('\n');
    expect(log).toContain('Game Master correction: P2 has been removed from play');
    expect(log).toContain('Game Master correction: P2 has been restored');
    expect(g.P(2).alive).toBe(true);
  });

  it('play again returns everyone to the lobby with roles cleared', () => {
    const g = setup(['mafia', V, V, V, V]);
    g.goToVoting();
    hostEliminate(g.room, 'p0', T0);
    resetToLobby(g.room, T0);
    expect(g.room.status).toBe('lobby');
    expect(g.room.players.every((p) => p.roleId === null && p.alive)).toBe(true);
    expect(g.room.privateResults).toEqual([]);
  });
});

describe('lobby rules', () => {
  const room = () => createRoom({ code: 'ROOM', hostName: 'Host', hostTokenHash: 'h', hostPlays: false, now: T0, playerCount: 5 });

  it('rejects duplicate names case-insensitively', () => {
    const r = room();
    addPlayer(r, { id: 'a', name: 'Sam', tokenHash: 'x', now: T0 });
    expect(() => addPlayer(r, { id: 'b', name: ' sam ', tokenHash: 'y', now: T0 })).toThrow(/taken/);
  });

  it('enforces capacity', () => {
    const r = room();
    for (let i = 0; i < 5; i++) addPlayer(r, { id: `p${i}`, name: `P${i}`, tokenHash: `t${i}`, now: T0 });
    expect(() => addPlayer(r, { id: 'z', name: 'Late', tokenHash: 'z', now: T0 })).toThrow(/full/);
  });

  it('rejects joining a started game unless late join is enabled', () => {
    const g = setup(['mafia', V, V, V, V]);
    expect(() => addPlayer(g.room, { id: 'z', name: 'Late', tokenHash: 'z', now: T0 })).toThrow(/already started/);
    const h = setup(['mafia', V, V, V, V], { allowLateJoin: true });
    const p = addPlayer(h.room, { id: 'z', name: 'Late', tokenHash: 'z', now: T0 });
    expect(p.roleId).toBe('villager');
  });

  it('sanitises names', () => {
    const r = room();
    const p = addPlayer(r, { id: 'a', name: '  <b>Al</b>  ', tokenHash: 'x', now: T0 });
    expect(p.name).toBe('bAl/b');
    expect(() => addPlayer(r, { id: 'b', name: '   ', tokenHash: 'y', now: T0 })).toThrow();
  });
});
