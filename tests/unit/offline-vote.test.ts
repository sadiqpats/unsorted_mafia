import { describe, expect, it } from 'vitest';
import { computeAwards } from '../../src/shared/awards';
import { hostVerdict, tick } from '../../src/shared/engine';
import { T0, setup } from './helpers';

const V = 'villager';

describe('offline voting (show of hands)', () => {
  const table = () => setup(['mafia', 'mafia', V, V, V, V, V, V], { offlineVoting: true, voteSeconds: 30, verdictSeconds: 8 });

  it('phones cannot vote, the clock only counts down, and Next is refused until the host enters a result', () => {
    const g = table();
    g.goToVoting();
    const game = g.room.game!;
    expect(() => g.vote(2, 3)).toThrow(/show of hands/);
    expect(tick(g.room, game.phaseEndsAt! + 1, g.rng)).toBe(true);
    expect(game.phase).toBe('voting'); // still waiting for the host
    expect(game.phaseEndsAt).toBeNull();
    expect(() => g.advance()).toThrow(/voted out/);
  });

  it('the host picks a player: they are out and the game pauses on the result', () => {
    const g = table();
    g.goToVoting();
    hostVerdict(g.room, 'p3', T0);
    const game = g.room.game!;
    expect(g.room.players.find((p) => p.id === 'p3')!.alive).toBe(false);
    expect(game.lastVerdict).toMatchObject({ eliminatedId: 'p3', decidedByHost: true });
    expect(game.phase).toBe('verdict');
  });

  it('the host picks no one: nobody is out; a dead or unknown player is refused', () => {
    const g = table();
    g.goToVoting();
    expect(() => hostVerdict(g.room, 'nobody-here', T0)).toThrow();
    hostVerdict(g.room, null, T0);
    expect(g.room.players.every((p) => p.alive)).toBe(true);
    expect(g.room.game!.lastVerdict!.eliminatedId).toBeNull();
    expect(g.room.game!.phase).toBe('verdict');
  });

  it('without the rule the host cannot enter a result', () => {
    const g = setup(['mafia', V, V, V, V]);
    g.goToVoting();
    expect(() => hostVerdict(g.room, 'p2', T0)).toThrow();
  });
});

describe('end-of-game awards', () => {
  it('counts votes received and votes against the Mafia', () => {
    const g = setup(['mafia', 'mafia', V, V, V, V, V, V], { verdictSeconds: 0 });
    g.goToVoting();
    g.vote(2, 0); // p3 → p1 (Mafia)
    g.vote(3, 0);
    g.vote(4, 5);
    g.advance();
    const st = g.room.game!.stats;
    expect(st.votesAgainst).toMatchObject({ p0: 2, p5: 1 });
    expect(st.mafiaVotes).toMatchObject({ p2: 1, p3: 1 });
    const a = computeAwards(g.room);
    expect(a.find((x) => x.key === 'suspect')?.playerId).toBe('p0');
  });
});
