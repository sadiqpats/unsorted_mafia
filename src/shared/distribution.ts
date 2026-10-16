import { ROLES, ROLE_ORDER, roleAlignment, isMafiaTeam } from './roles';
import { MAX_PLAYERS, MIN_PLAYERS, type Settings } from './settings';
import type { Alignment } from './types';

/**
 * DEFAULT ROLE DISTRIBUTION
 * -------------------------
 * Mafia (the killers) stay about a quarter of the table:
 *   1 up to 6 players, 2 from 7, 3 from 12, 4 from 17, 5 from 22, 6 from 25.
 * The Godfather (knows the Mafia, silences, does not kill) joins from 8 players.
 * Special roles join once the table reaches their threshold; everyone else is a
 * Villager. The host can edit every count before starting.
 */
export function mafiaCountFor(n: number): number {
  if (n >= 25) return 6;
  if (n >= 22) return 5;
  if (n >= 17) return 4;
  if (n >= 12) return 3;
  if (n >= 7) return 2;
  return 1;
}

export const SPECIAL_THRESHOLDS: { roleId: string; minPlayers: number }[] = [
  { roleId: 'detective', minPlayers: 5 },
  { roleId: 'doctor', minPlayers: 5 },
  { roleId: 'jester', minPlayers: 7 },
  { roleId: 'godfather', minPlayers: 8 },
  { roleId: 'judge', minPlayers: 9 },
  { roleId: 'thief', minPlayers: 10 },
  { roleId: 'imposter', minPlayers: 12 },
];

export function suggestDistribution(n: number): Record<string, number> {
  if (!Number.isInteger(n) || n < MIN_PLAYERS || n > MAX_PLAYERS) {
    throw new Error(`Player count must be an integer from ${MIN_PLAYERS} to ${MAX_PLAYERS}`);
  }
  const counts: Record<string, number> = Object.fromEntries(ROLE_ORDER.map((r) => [r, 0]));
  counts.mafia = mafiaCountFor(n);
  let used = counts.mafia;
  for (const { roleId, minPlayers } of SPECIAL_THRESHOLDS) {
    if (n >= minPlayers) {
      counts[roleId] = 1;
      used++;
    }
  }
  counts.villager = n - used;
  return counts;
}

export interface DistributionReport {
  total: number;
  byAlignment: Record<Alignment, number>;
  mafiaTeam: number;
  errors: string[];
  warnings: string[];
}

export function analyzeDistribution(settings: Settings, actualPlayers?: number): DistributionReport {
  const n = actualPlayers ?? settings.playerCount;
  const errors: string[] = [];
  const warnings: string[] = [];
  const byAlignment: Record<Alignment, number> = { good: 0, mafia: 0, neutral: 0 };
  let total = 0;
  let mafiaTeam = 0;

  for (const [roleId, count] of Object.entries(settings.roles)) {
    if (!count) continue;
    const def = ROLES[roleId];
    if (!def) {
      errors.push(`Unknown role "${roleId}".`);
      continue;
    }
    if (def.unique && count > 1) errors.push(`${def.name} is unique — only one allowed.`);
    total += count;
    byAlignment[roleAlignment(roleId, settings)] += count;
    if (isMafiaTeam(roleId, settings)) mafiaTeam += count;
  }

  if (total !== n) {
    errors.push(`Roles add up to ${total}, but the game needs exactly ${n} (one per player).`);
  }
  if (mafiaTeam === 0) errors.push('At least one Mafia is required.');
  const mafiaAligned = byAlignment.mafia;
  const others = total - mafiaAligned;
  if (mafiaAligned > 0 && mafiaAligned >= others) {
    errors.push('The Mafia would win immediately — they must start outnumbered.');
  }
  if (byAlignment.good === 0) errors.push('At least one Good role is required.');

  const vp = settings.villagerPowers;
  const enabledPowers = [vp.hunch, vp.shield, vp.rally].filter(Boolean).length;
  if (enabledPowers > 2) errors.push('Villagers can have at most two optional powers enabled.');

  if (total > 0 && errors.length === 0) {
    const ratio = mafiaTeam / total; // the killers
    if (ratio < 0.12) warnings.push('Very few Mafia for this table — the Town is strongly favoured.');
    if (ratio > 0.34) warnings.push('A lot of Mafia for this table — the Mafia are strongly favoured.');
    if (byAlignment.neutral > Math.ceil(total / 6)) warnings.push('Many Neutral roles — games may run long or end chaotically.');
    if (!settings.roles.detective && !settings.roles.doctor && total >= 7) {
      warnings.push('No Detective or Doctor — the Town has no information or protection.');
    }
  }

  return { total, byAlignment, mafiaTeam, errors, warnings };
}
