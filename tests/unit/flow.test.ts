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

  it('silenced players are reported with a reason', () => {
    const g = setup(['godfather', 'mafia', V, V, V, V, V]);
    g.goToNight();
    g.act(0, 'silence', 3);
    g.goToVoting();
    expect(() => g.vote(3, 0)).toThrow(/silenced/);
  });
});

describe('win conditions', () => {
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
    expect(g.room.game!.phase).toBe('voting'); // Day
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
  it('no timers by default: nothing ever advances on time, only when everyone has acted', () => {
    const g = setup(['mafia', V, V, V, V]);
    expect(g.room.game!.settings.timers).toBe(false);
    expect(g.room.game!.phaseEndsAt).toBeNull();
    expect(tick(g.room, T0 + 1e12, g.rng)).toBe(false);
    for (const p of g.room.players) acknowledgeRole(g.room, p.id);
    expect(tick(g.room, g.clock(), g.rng)).toBe(true);
    expect(g.room.game!.phase).toBe('night');
    expect(g.room.game!.phaseEndsAt).toBeNull();
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

  it('with timers on, a phase also ends when the clock runs out (a disconnected player cannot freeze it)', () => {
    const g = setup(['mafia', V, V, V, V], { timers: true });
    const ends = g.room.game!.phaseEndsAt!;
    expect(tick(g.room, ends - 1, g.rng)).toBe(false);
    expect(tick(g.room, ends + 1, g.rng)).toBe(true);
    expect(g.room.game!.phase).toBe('night');
    g.act(0, 'mafia_kill', 1);
    tick(g.room, g.room.game!.phaseEndsAt! + 1, g.rng);
    expect(g.room.game!.phase).toBe('voting');
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
    expect(g.room.game!.pausedRemainingMs).toBe(50_000);
    expect(tick(g.room, now + 999_999, g.rng)).toBe(false);
    expect(() => g.act(0, 'mafia_kill', 1)).toThrow(/paused/);
    resumeGame(g.room, now + 100_000);
    expect(g.room.game!.phaseEndsAt).toBe(now + 150_000);
    extendTimer(g.room, 30, now + 100_000);
    expect(g.room.game!.phaseEndsAt).toBe(now + 180_000);
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
