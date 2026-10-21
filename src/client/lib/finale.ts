import { roleAlignment } from '../../shared/roles';
import type { Settings } from '../../shared/settings';
import type { PublicPlayer } from '../../shared/view-types';

/**
 * The game-over reveal, in the same order on the TV, every phone and the home lights:
 * a suspense beat ("And the Mafia were…"), then the Mafia side one by one, then the special
 * characters, then the villagers — and only then the winner. Times are seconds after the
 * game ends (the "The End" curtain takes the first 2.2 s).
 */
export type FinaleGroupKey = 'mafia' | 'special' | 'villager';
export type FinaleGroup = { key: FinaleGroupKey; title: string; players: PublicPlayer[]; start: number };
export type Finale = { suspenseAt: number; groups: FinaleGroup[]; cardAt: Map<string, number>; end: number };

export const FINALE = { suspenseAt: 2.4, suspenseFor: 3.0, mafiaStep: 0.9, specialStep: 0.45, villagerStep: 0.25, groupGap: 0.9, tail: 0.8 };

export function finale(players: PublicPlayer[], settings: Settings): Finale {
  const side = (p: PublicPlayer) => (p.revealedRoleId ? roleAlignment(p.revealedRoleId, settings) : 'good');
  const mafia = players.filter((p) => side(p) === 'mafia' || side(p) === 'evil');
  const villagers = players.filter((p) => !mafia.includes(p) && p.revealedRoleId === 'villager');
  const special = players.filter((p) => !mafia.includes(p) && !villagers.includes(p));
  const cardAt = new Map<string, number>();
  const groups: FinaleGroup[] = [];
  let t = FINALE.suspenseAt + FINALE.suspenseFor;
  const add = (key: FinaleGroupKey, title: string, list: PublicPlayer[], step: number) => {
    if (!list.length) return;
    groups.push({ key, title, players: list, start: t });
    list.forEach((p, i) => cardAt.set(p.id, t + 0.35 + i * step));
    t += 0.35 + list.length * step + FINALE.groupGap;
  };
  add('mafia', 'The Mafia', mafia, FINALE.mafiaStep);
  add('special', 'Special characters', special, FINALE.specialStep);
  add('villager', 'The villagers', villagers, FINALE.villagerStep);
  return { suspenseAt: FINALE.suspenseAt, groups, cardAt, end: t + FINALE.tail };
}
