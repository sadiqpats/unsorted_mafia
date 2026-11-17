import type { Rng } from './engine';
import { isMafiaTeam } from './roles';
import type { Settings } from './settings';
import type { Player } from './types';

/**
 * Group discussion: at the start of a Day the living players split into small groups that talk apart
 * (Group 1 at place 1, and so on), then come back together for the vote.
 *
 * - 2 to 4 groups, about 4 people each (16 players = 4 groups of 4; 32 = 4 groups of 8).
 * - The Mafia are spread out (one per group where possible), and so are the other special roles.
 * - Each new Day mixes people who have not been in a group together yet.
 * Cheap: at most a few thousand small steps, once per Day.
 */

export const MAX_GROUPS = 4;
const TRIES = 40;

/** Is this Day a group-discussion Day? "alternate" = Day 1, 3, 5… */
export function groupsThisDay(s: Settings, round: number): boolean {
  const mode = s.groupDiscussion ?? 'off';
  if (mode === 'off') return false;
  return mode === 'every' || round % 2 === 1;
}

export function groupCount(n: number): number {
  return Math.min(MAX_GROUPS, Math.max(2, Math.round(n / 4)), Math.floor(n / 3));
}

const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

function shuffle<T>(arr: T[], rng: Rng): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Split the living players into groups. Returns null when there are too few for two groups of 3.
 * `met` counts how often each pair has already shared a group; it is updated with the new groups.
 */
export function makeGroups(players: Player[], s: Settings, met: Record<string, number>, rng: Rng): string[][] | null {
  const n = players.length;
  const k = groupCount(n);
  if (k < 2) return null;
  // The roles to spread out, most important first: Mafia, then every other special role, then Villagers.
  const tier = (p: Player) => (isMafiaTeam(p.roleId, s) ? 0 : p.roleId && p.roleId !== 'villager' ? 1 : 2);
  const tiers = [0, 1, 2].map((t) => players.filter((p) => tier(p) === t));

  let best: { groups: Player[][]; cost: number } | null = null;
  for (let attempt = 0; attempt < TRIES; attempt++) {
    // Sizes as even as possible; which groups get the extra person is random.
    const extra = shuffle([...Array(k).keys()], rng).slice(0, n % k);
    const cap = [...Array(k).keys()].map((i) => Math.floor(n / k) + (extra.includes(i) ? 1 : 0));
    const groups: Player[][] = Array.from({ length: k }, () => []);
    let cost = 0;
    for (const [t, list] of tiers.entries()) {
      for (const p of shuffle(list, rng)) {
        const score = (i: number) => {
          const same = groups[i].filter((q) => tier(q) === t).length;
          const repeat = groups[i].reduce((sum, q) => sum + (met[pairKey(p.id, q.id)] ?? 0), 0);
          // Spreading the tier comes first (one Mafia per group), then meeting new people.
          return t < 2 ? same * 1000 + repeat : repeat;
        };
        const open = shuffle([...Array(k).keys()].filter((i) => groups[i].length < cap[i]), rng);
        const i = open.reduce((a, b) => (score(b) < score(a) ? b : a));
        cost += groups[i].reduce((sum, q) => sum + (met[pairKey(p.id, q.id)] ?? 0), 0);
        groups[i].push(p);
      }
    }
    if (!best || cost < best.cost) best = { groups, cost };
    if (cost === 0) break;
  }
  const seat = (p: Player) => p.seat;
  const out = best!.groups.map((g) => [...g].sort((a, b) => seat(a) - seat(b)).map((p) => p.id));
  for (const g of out) for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) met[pairKey(g[i], g[j])] = (met[pairKey(g[i], g[j])] ?? 0) + 1;
  return out;
}
