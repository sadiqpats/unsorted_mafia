import { describe, expect, it } from 'vitest';
import * as C from '../../src/shared/charades/engine';
import { addPlayer, extendTimer, hostEliminate, nightOptions, pauseGame, resolveTie, resumeGame, submitVote, tick } from '../../src/shared/engine';
import { MOVIES } from '../../src/server/charades/movies';
import { steadyOffset } from '../../src/client/lib/server';
import { T0, setup } from './helpers';

const V = 'villager';
const table = (patch = {}) => setup(['mafia', 'mafia', V, V, V, V, V, V], { tieRule: 'host', ...patch });
/** A 2–2 tie between P3 and P4. */
function tie(g: ReturnType<typeof table>) {
  g.goToVoting();
  g.vote(0, 3);
  g.vote(1, 3);
  g.vote(2, 4);
  g.vote(5, 4);
  g.advance();
  expect(g.room.game!.pendingTie!.sort()).toEqual(['p3', 'p4']);
}

describe('audit: ties the Game Master breaks', () => {
  it('sparing everyone still pauses on the result and gives the even-round Mafia count', () => {
    const g = table({ verdictSeconds: 8 });
    g.goToVoting();
    g.advance(); // nobody voted in round 1
    while (g.room.game!.phase !== 'voting') g.advance();
    expect(g.room.game!.round).toBe(2);
    g.vote(0, 3);
    g.vote(1, 3);
    g.vote(2, 4);
    g.vote(5, 4);
    g.advance();
    resolveTie(g.room, null, T0);
    expect(g.room.game!.phase).toBe('verdict');
    expect(g.room.game!.phaseEndsAt).not.toBeNull();
    expect(g.room.game!.mafiaLeft).toEqual({ round: 2, count: 2 });
  });

  it('a tied player removed by the host can no longer be picked, and an empty tie moves on', () => {
    const g = table({ verdictSeconds: 8 });
    tie(g);
    hostEliminate(g.room, 'p3', T0);
    expect(g.room.game!.pendingTie).toEqual(['p4']);
    expect(() => resolveTie(g.room, 'p3', T0)).toThrow();
    hostEliminate(g.room, 'p4', T0);
    expect(g.room.game!.pendingTie).toBeNull();
    expect(g.room.game!.phaseEndsAt).not.toBeNull(); // the game isn't stuck waiting for a tie that's gone
  });
});

describe('audit: the host’s clock buttons', () => {
  it('-30s during the opening break never closes the phase before anyone can act', () => {
    const g = setup(['mafia', V, V, V, V], { bufferSeconds: 5, nightSeconds: 30 });
    g.goToNight();
    const game = g.room.game!;
    const now = game.phaseStartedAt + 1000;
    extendTimer(g.room, -30, now);
    expect(game.phaseEndsAt!).toBe(game.phaseOpensAt! + 5000);
    expect(tick(g.room, game.phaseOpensAt!, g.rng)).toBe(false);
    expect(game.phase).toBe('night');
  });

  it('-30s on a phase with no clock does nothing; +30s during a pause on one does not break the resume', () => {
    const g = setup(['mafia', V, V, V, V], { discussionTimer: false });
    while (g.room.game!.phase !== 'discussion') g.advance();
    const seq = g.seq();
    extendTimer(g.room, -30, T0 + 9_000_000);
    expect(g.room.game!.phaseEndsAt).toBeNull();
    expect(tick(g.room, T0 + 9_000_000, g.rng)).toBe(false);
    expect(g.seq()).toBe(seq);
    pauseGame(g.room, T0 + 9_000_000);
    extendTimer(g.room, 30, T0 + 9_000_000);
    resumeGame(g.room, T0 + 9_001_000);
    expect(g.room.game!.phaseEndsAt).toBeNull();
  });
});

describe('audit: limited powers', () => {
  const powers = { villagerPowers: { hunch: true, shield: true, rally: false } };
  it('a late joiner’s Villager powers are limited like everyone else’s, not unlimited', () => {
    const g = setup(['mafia', V, V, V, V], { ...powers, allowLateJoin: true });
    const late = addPlayer(g.room, { id: 'late', name: 'Late', tokenHash: 'x', now: T0 });
    expect(late.charges).toEqual(g.P(1).charges);
    expect(Object.keys(late.charges).length).toBeGreaterThan(0);
  });
});

describe('audit: the Thief with the Dawn round switched off', () => {
  it('a stolen power lasts until the next night, so he can actually use it', () => {
    const g = setup(['thief', 'doctor', 'mafia', V, V, V], { preNightRound: false });
    g.goToNight();
    g.act(0, 'steal', null);
    g.room.game!.night.actions['p0:steal'].targetId = 'protect';
    g.advance(); // night resolves: the steal lands last
    expect(g.P(0).stolen?.abilityId).toBe('protect');
    g.goToNight();
    expect(g.P(0).stolen?.abilityId).toBe('protect');
    expect(nightOptions(g.room, 'p0').map((o) => o.abilityId)).toContain('protect');
    expect(g.results(0).join(' ')).toContain('next night');
  });
});

describe('audit: votes', () => {
  it('tapping "abstain" after a name forgets the name', () => {
    const g = table();
    g.goToVoting();
    const seq = g.seq();
    submitVote(g.room, 'p2', { targetId: 'p3', phaseSeq: seq, draft: true }, T0);
    submitVote(g.room, 'p2', { targetId: null, phaseSeq: seq, draft: true }, T0 + 1);
    expect(g.room.game!.day.drafts?.p2).toBeUndefined();
  });
});

describe('audit: the countdown', () => {
  it('ignores messages that arrived late, but follows a real change of the device clock', () => {
    expect(steadyOffset(null, -300)).toBe(-300);
    expect(steadyOffset(-300, -800)).toBe(-300); // a slow message: the clock must not jump
    expect(steadyOffset(-300, -100)).toBe(-100); // a faster one: a better reading
    expect(steadyOffset(-300, -9000)).toBe(-9000); // the phone's own clock moved
  });
});

describe('audit: Dumb Charades', () => {
  let n = 1_000_000;
  const ctx = (): C.Ctx => ({ now: n, rng: { int: () => 0 }, deck: MOVIES });
  function game() {
    const r = C.createCRoom({ code: 'ABCDE', hostName: 'Host', hostTokenHash: 'h', now: n });
    C.joinCaptain(r, 0, { id: 'a', name: 'A', tokenHash: 'a' }, n);
    C.joinCaptain(r, 1, { id: 'b', name: 'B', tokenHash: 'b' }, n);
    C.updateSettings(r, { firstTeam: '0', rounds: 3 }, n);
    C.start(r, ctx());
    C.reveal(r, 0, ctx());
    return r;
  }
  it('a ✅ that was on its way when the buzzer went still scores; a late one does not', () => {
    const r = game();
    const end = r.turn!.endsAt!;
    C.tick(r, end);
    expect(r.turn!.result).toBe('timeout');
    C.judge(r, 'correct', end + 800);
    expect(r.turn!.result).toBe('correct');
    expect(r.teams[0].score).toBe(1);
    const r2 = game();
    const end2 = r2.turn!.endsAt!;
    C.tick(r2, end2);
    expect(() => C.judge(r2, 'correct', end2 + 5000)).toThrow();
    expect(r2.teams[0].score).toBe(0);
  });
  it('the extra round of a tie-breaker does not stick to the next game', () => {
    const r = game();
    C.endGame(r, n);
    C.oneMoreRound(r, n);
    C.endGame(r, n);
    C.playAgain(r, n);
    expect(r.settings.rounds).toBe(3);
  });
});
