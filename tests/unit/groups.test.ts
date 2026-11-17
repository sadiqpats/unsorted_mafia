import { describe, expect, it } from 'vitest';
import { extendTimer, startGroupTalk } from '../../src/shared/engine';
import { groupCount, makeGroups } from '../../src/shared/groups';
import { defaultSettings } from '../../src/shared/settings';
import type { Player } from '../../src/shared/types';
import { setup, testRng } from './helpers';

const V = 'villager';
const sixteen = ['mafia', 'mafia', 'godfather', 'mafia', 'detective', 'doctor', 'judge', V, V, V, V, V, V, V, V, V];

const goToDiscussion = (g: ReturnType<typeof setup>) => {
  while (g.room.game!.phase !== 'discussion') g.advance();
};

describe('group discussion', () => {
  it('group sizes: 2 to 4 groups of about 4', () => {
    expect([5, 6, 8, 10, 12, 16, 20, 32].map(groupCount)).toEqual([1, 2, 2, 3, 3, 4, 4, 4]);
  });

  it('16 players: 4 groups of 4, one Mafia member in each, special roles spread out', () => {
    const g = setup(sixteen, { groupDiscussion: 'every' });
    goToDiscussion(g);
    const groups = g.room.game!.groups!;
    expect(groups.list.map((x) => x.length)).toEqual([4, 4, 4, 4]);
    const role = (id: string) => g.room.players.find((p) => p.id === id)!.roleId!;
    for (const grp of groups.list) {
      expect(grp.filter((id) => ['mafia', 'godfather'].includes(role(id)))).toHaveLength(1);
      expect(grp.filter((id) => ['detective', 'doctor', 'judge'].includes(role(id))).length).toBeLessThanOrEqual(1);
    }
    expect(new Set(groups.list.flat()).size).toBe(16);
  });

  it('the clock waits until the host starts the talking, and Next still opens the vote', () => {
    const g = setup(sixteen, { groupDiscussion: 'every', daySeconds: 240 });
    goToDiscussion(g);
    const game = g.room.game!;
    expect(game.phaseEndsAt).toBeNull();
    expect(game.heldClockMs).toBe(240_000);
    extendTimer(g.room, 60, g.clock());
    expect(game.heldClockMs).toBe(300_000);
    const now = g.clock();
    startGroupTalk(g.room, now);
    expect(game.groups!.started).toBe(true);
    expect(game.phaseEndsAt).toBe(now + 300_000);
    g.advance();
    expect(game.phase).toBe('voting');
    expect(game.groups).toBeNull();
  });

  it('the next Day mixes people who have not met yet', () => {
    const players = Array.from({ length: 16 }, (_, i) => ({ id: `p${i}`, seat: i, roleId: i < 4 ? 'mafia' : V, alive: true }) as Player);
    const s = { ...defaultSettings(), roles: { mafia: 4, villager: 12 } };
    const met: Record<string, number> = {};
    const rng = testRng();
    makeGroups(players, s, met, rng);
    const before = Object.keys(met).length; // 4 groups × 6 pairs
    expect(before).toBe(24);
    makeGroups(players, s, met, rng);
    // Every pair in the second split is new (no pair met twice).
    expect(Object.values(met).every((n) => n === 1)).toBe(true);
    expect(Object.keys(met).length).toBe(48);
  });

  it('"every other Day" groups on Day 1 and 3, not Day 2; off means never', () => {
    const g = setup(sixteen, { groupDiscussion: 'alternate', tieRule: 'none' });
    goToDiscussion(g);
    expect(g.room.game!.round).toBe(1);
    expect(g.room.game!.groups).toBeTruthy();
    g.advance(); // vote
    g.advance(); // result → night
    goToDiscussion(g);
    expect(g.room.game!.round).toBe(2);
    expect(g.room.game!.groups).toBeNull();
    expect(g.room.game!.phaseEndsAt).not.toBeNull(); // a normal Day: the clock runs straight away

    const off = setup(sixteen);
    goToDiscussion(off);
    expect(off.room.game!.groups ?? null).toBeNull();
  });

  it('too few players for two groups of 3: a normal Day', () => {
    const g = setup(['mafia', V, V, V, V], { groupDiscussion: 'every' });
    goToDiscussion(g);
    expect(g.room.game!.groups).toBeNull();
  });
});
