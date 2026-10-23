import { roleAlignment } from '../../shared/roles';
import type { Settings } from '../../shared/settings';
import type { PublicPlayer } from '../../shared/view-types';

/**
 * The game-over reveal, in the same order on the TV, every phone and the home lights:
 * a suspense beat ("And the Mafia were…"), then the Mafia (with the Godfather), then the
 * neutral characters, then the Town — first the special characters, then the villagers — and
 * only then the winner. Times are seconds after the game ends (the "The End" curtain takes the
 * first 2.2 s).
 */
export type FinaleGroupKey = 'mafia' | 'neutral' | 'special' | 'villager';
export type FinaleGroup = { key: FinaleGroupKey; title: string; players: PublicPlayer[]; start: number };
export type Finale = { suspenseAt: number; groups: FinaleGroup[]; cardAt: Map<string, number>; end: number };

/** Keep in step with FIN in scripts/lights.mjs. */
export const FINALE = { suspenseAt: 2.2, suspenseFor: 2.0, head: 0.3, mafiaStep: 0.9, neutralStep: 0.5, specialStep: 0.35, villagerStep: 0.15, groupGap: 0.6, tail: 1.0 };

export function finaleGroupOf(p: PublicPlayer, settings: Settings): FinaleGroupKey {
  const a = p.revealedRoleId ? roleAlignment(p.revealedRoleId, settings) : 'good';
  if (a === 'mafia' || a === 'evil') return 'mafia';
  if (a === 'neutral') return 'neutral';
  return p.revealedRoleId === 'villager' || !p.revealedRoleId ? 'villager' : 'special';
}

export function finale(players: PublicPlayer[], settings: Settings): Finale {
  const by = (k: FinaleGroupKey) => players.filter((p) => finaleGroupOf(p, settings) === k);
  // The Godfather last in the Mafia line, so the members come first.
  const mafia = by('mafia').sort((a, b) => Number(a.revealedRoleId === 'godfather') - Number(b.revealedRoleId === 'godfather'));
  const cardAt = new Map<string, number>();
  const groups: FinaleGroup[] = [];
  let t = FINALE.suspenseAt + FINALE.suspenseFor;
  const add = (key: FinaleGroupKey, title: string, list: PublicPlayer[], step: number) => {
    if (!list.length) return;
    groups.push({ key, title, players: list, start: t });
    list.forEach((p, i) => cardAt.set(p.id, t + FINALE.head + i * step));
    t += FINALE.head + list.length * step + FINALE.groupGap;
  };
  add('mafia', 'The Mafia', mafia, FINALE.mafiaStep);
  add('neutral', 'Neutral', by('neutral'), FINALE.neutralStep);
  add('special', 'Special powers', by('special'), FINALE.specialStep);
  add('villager', 'Villagers', by('villager'), FINALE.villagerStep);
  return { suspenseAt: FINALE.suspenseAt, groups, cardAt, end: t + FINALE.tail };
}
