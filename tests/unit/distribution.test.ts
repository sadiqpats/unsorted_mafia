import { describe, expect, it } from 'vitest';
import { analyzeDistribution, suggestDistribution } from '../../src/shared/distribution';
import { addPlayer, createRoom, resetToLobby, startGame, updateSettings } from '../../src/shared/engine';
import { ROLES, isMafiaTeam } from '../../src/shared/roles';
import { MAX_PLAYERS, MIN_PLAYERS, defaultSettings, type Settings } from '../../src/shared/settings';
import { T0, testRng } from './helpers';

const settingsWith = (n: number, roles: Record<string, number>, extra: Partial<Settings> = {}): Settings => ({
  ...defaultSettings(n),
  roles,
  ...extra,
});

describe('default role distribution', () => {
  for (let n = MIN_PLAYERS; n <= MAX_PLAYERS; n++) {
    it(`produces a valid, balanced game for ${n} players`, () => {
      const roles = suggestDistribution(n);
      const total = Object.values(roles).reduce((a, b) => a + b, 0);
      expect(total).toBe(n);
      const report = analyzeDistribution(settingsWith(n, roles));
      expect(report.errors).toEqual([]);
      expect(report.mafiaTeam).toBeGreaterThanOrEqual(1);
      for (const [id, c] of Object.entries(roles)) if (ROLES[id].unique) expect(c).toBeLessThanOrEqual(1);
      expect(report.byAlignment.mafia).toBeLessThan(n - report.byAlignment.mafia);
    });
  }

  it('rejects counts outside 5–26 and non-integers', () => {
    expect(() => suggestDistribution(4)).toThrow();
    expect(() => suggestDistribution(27)).toThrow();
    expect(() => suggestDistribution(26)).not.toThrow();
    expect(() => suggestDistribution(7.5)).toThrow();
  });

  it('supports odd player counts (e.g. 7, 13, 21)', () => {
    for (const n of [7, 13, 21]) expect(Object.values(suggestDistribution(n)).reduce((a, b) => a + b, 0)).toBe(n);
  });
});

describe('role assignment', () => {
  for (let n = MIN_PLAYERS; n <= MAX_PLAYERS; n++) {
    it(`assigns exactly the configured roles to ${n} players`, () => {
      const room = createRoom({ code: 'ABCD', hostName: 'Host', hostTokenHash: 'h', hostPlays: false, now: T0, playerCount: n });
      for (let i = 0; i < n; i++) addPlayer(room, { id: `p${i}`, name: `Player ${i}`, tokenHash: `t${i}`, now: T0 });
      startGame(room, T0, testRng(), { force: true });
      const counts: Record<string, number> = {};
      for (const p of room.players) counts[p.roleId!] = (counts[p.roleId!] ?? 0) + 1;
      const expected = Object.fromEntries(Object.entries(room.settings.roles).filter(([, c]) => c > 0));
      expect(counts).toEqual(expected);
      expect(room.players.some((p) => isMafiaTeam(p.roleId, room.game!.settings))).toBe(true);
    });
  }

  it('refuses to start when the joined count does not match', () => {
    const room = createRoom({ code: 'ABCD', hostName: 'Host', hostTokenHash: 'h', hostPlays: false, now: T0, playerCount: 6 });
    for (let i = 0; i < 5; i++) addPlayer(room, { id: `p${i}`, name: `P${i}`, tokenHash: `t${i}`, now: T0 });
    expect(() => startGame(room, T0, testRng(), { force: true })).toThrow(/6 players/);
  });

  it('requires everyone ready unless forced', () => {
    const room = createRoom({ code: 'ABCD', hostName: 'Host', hostTokenHash: 'h', hostPlays: false, now: T0, playerCount: 5 });
    for (let i = 0; i < 5; i++) addPlayer(room, { id: `p${i}`, name: `P${i}`, tokenHash: `t${i}`, now: T0 });
    expect(() => startGame(room, T0, testRng())).toThrow(/not ready/);
    startGame(room, T0, testRng(), { force: true });
    expect(room.status).toBe('active');
  });

  it('settings are frozen into the game when it starts', () => {
    const room = createRoom({ code: 'ABCD', hostName: 'Host', hostTokenHash: 'h', hostPlays: false, now: T0, playerCount: 5 });
    for (let i = 0; i < 5; i++) addPlayer(room, { id: `p${i}`, name: `P${i}`, tokenHash: `t${i}`, now: T0 });
    startGame(room, T0, testRng(), { force: true });
    expect(() => updateSettings(room, { nightSeconds: 99 })).toThrow(/locked/);
    expect(room.game!.settings.nightSeconds).toBe(30);
  });
});

describe('invalid and unbalanced configurations', () => {
  it('flags a total that does not match the player count', () => {
    const r = analyzeDistribution(settingsWith(6, { mafia: 1, villager: 4 }));
    expect(r.errors.join()).toMatch(/add up to 5/);
  });
  it('flags duplicate unique roles', () => {
    const r = analyzeDistribution(settingsWith(6, { mafia: 1, detective: 2, villager: 3 }));
    expect(r.errors.join()).toMatch(/unique/);
  });
  it('requires a Mafia-team role', () => {
    const r = analyzeDistribution(settingsWith(5, { villager: 4, jester: 1 }));
    expect(r.errors.join()).toMatch(/At least one Mafia/);
  });
  it('rejects a Mafia that would win immediately', () => {
    const r = analyzeDistribution(settingsWith(6, { mafia: 3, villager: 3 }));
    expect(r.errors.join()).toMatch(/win immediately/);
  });
  it('rejects more than two villager powers', () => {
    const r = analyzeDistribution(settingsWith(5, { mafia: 1, villager: 4 }, { villagerPowers: { hunch: true, shield: true, rally: true } }));
    expect(r.errors.join()).toMatch(/at most two/);
  });
  it('warns when a table is unbalanced', () => {
    const r = analyzeDistribution(settingsWith(12, { mafia: 1, villager: 11 }));
    expect(r.errors).toEqual([]);
    expect(r.warnings.join()).toMatch(/Town is strongly favoured/);
  });
  it('rejects unknown roles', () => {
    const r = analyzeDistribution(settingsWith(5, { mafia: 1, wizard: 1, villager: 3 }));
    expect(r.errors.join()).toMatch(/Unknown role/);
  });
});

describe('new default mix', () => {
  it('keeps the Mafia at roughly a quarter of the table from 7 to 26 players', () => {
    for (let n = 7; n <= 26; n++) {
      const ratio = suggestDistribution(n).mafia / n;
      expect(ratio).toBeGreaterThanOrEqual(0.18);
      expect(ratio).toBeLessThanOrEqual(0.29);
    }
    expect(suggestDistribution(26).mafia).toBe(6);
  });

  it('two Mafia from 7 players; Godfather from 8; no Priest or Bodyguard', () => {
    expect(suggestDistribution(6).mafia).toBe(1);
    expect(suggestDistribution(7).mafia).toBe(2);
    expect(suggestDistribution(7).godfather).toBe(0);
    expect(suggestDistribution(8).godfather).toBe(1);
    for (let n = 5; n <= 26; n++) {
      const d = suggestDistribution(n);
      expect(d.priest ?? 0).toBe(0);
      expect(d.bodyguard ?? 0).toBe(0);
    }
  });
});

describe('fair role rotation across rematches', () => {
  const play = (seed: number) => {
    let a = seed >>> 0; // mulberry32: a decent PRNG, like the server's real randomness
    const r = () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = Math.imul(a ^ (a >>> 15), a | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const rng = { int: (m: number) => Math.floor(r() * m), id: () => `r${Math.floor(r() * 1e9)}` };
    const room = createRoom({ code: 'ROT', hostName: 'Host', hostTokenHash: 'h', hostPlays: false, now: 1, playerCount: 8 });
    updateSettings(room, { roles: { mafia: 2, doctor: 1, detective: 1, villager: 4 } });
    for (let i = 0; i < 8; i++) addPlayer(room, { id: `p${i}`, name: `Player ${i}`, tokenHash: `t${i}`, now: 1 });
    const games: Record<string, string>[] = [];
    for (let g = 0; g < 4; g++) {
      for (const p of room.players) p.ready = true;
      startGame(room, 1, rng);
      games.push(Object.fromEntries(room.players.map((p) => [p.name, p.roleId!])));
      resetToLobby(room, 2);
    }
    return games;
  };
  it('over 4 games, the Mafia cards go round the table (but it stays random)', () => {
    let repeats = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const games = play(seed);
      const mafiaOnce = new Set(games.flatMap((g) => Object.entries(g).filter(([, r]) => r === 'mafia').map(([n]) => n)));
      expect(mafiaOnce.size, `seed ${seed}`).toBeGreaterThanOrEqual(6); // 8 Mafia cards spread over at least 6 people
      for (let i = 1; i < games.length; i++) for (const [n, r] of Object.entries(games[i])) if (r === 'mafia' && games[i - 1][n] === 'mafia') repeats++;
    }
    // Back-to-back Mafia is rare — but it can happen, so nobody can rule anyone out.
    expect(repeats).toBeGreaterThan(0);
    expect(repeats).toBeLessThan(40);
  });
});
