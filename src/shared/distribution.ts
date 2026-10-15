import { ROLES, ROLE_ORDER, roleAlignment, isMafiaTeam } from './roles';
import { MAX_PLAYERS, MIN_PLAYERS, type Settings } from './settings';
import type { Alignment } from './types';

/**
 * DEFAULT ROLE DISTRIBUTION
 * -------------------------
 * Mafia team size = round(players × MAFIA_RATIO), minimum 1.
 * When the Mafia team has 2+ members, one of them is the Godfather.
 * Special roles join once the table reaches their threshold.
 * Everyone else is a Villager. The host can edit every count before starting.
 */
export const MAFIA_RATIO = 0.28;

export const SPECIAL_THRESHOLDS: { roleId: string; minPlayers: number }[] = [
  { roleId: 'detective', minPlayers: 5 },
  { roleId: 'doctor', minPlayers: 5 },
  { roleId: 'jester', minPlayers: 7 },
  { roleId: 'judge', minPlayers: 8 },
  { roleId: 'priest', minPlayers: 9 },
  { roleId: 'bodyguard', minPlayers: 10 },
  { roleId: 'thief', minPlayers: 12 },
];

export function mafiaCountFor(n: number): number {
  return Math.max(1, Math.round(n * MAFIA_RATIO));
}

export function suggestDistribution(n: number): Record<string, number> {
  if (!Number.isInteger(n) || n < MIN_PLAYERS || n > MAX_PLAYERS) {
    throw new Error(`Player count must be an integer from ${MIN_PLAYERS} to ${MAX_PLAYERS}`);
  }
  const counts: Record<string, number> = Object.fromEntries(ROLE_ORDER.map((r) => [r, 0]));
  const mafiaTotal = mafiaCountFor(n);
  if (mafiaTotal >= 2) {
    counts.godfather = 1;
    counts.mafia = mafiaTotal - 1;
  } else {
    counts.mafia = mafiaTotal;
  }
  let used = mafiaTotal;
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
  if (mafiaTeam === 0) errors.push('At least one Mafia-team role (Mafia or Godfather) is required.');
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
    const ratio = mafiaAligned / total;
    if (ratio < 0.17) warnings.push('Very few Mafia for this table — the Town is strongly favoured.');
    if (ratio > 0.36) warnings.push('A lot of Mafia for this table — the Mafia are strongly favoured.');
    if (byAlignment.neutral > Math.ceil(total / 6)) warnings.push('Many Neutral roles — games may run long or end chaotically.');
    if (!settings.roles.detective && !settings.roles.doctor && total >= 7) {
      warnings.push('No Detective or Doctor — the Town has no information or protection.');
    }
    if (settings.roles.priest && settings.priestCharges >= 3 && total < 9) {
      warnings.push('Many Priest revivals at a small table can make games very long.');
    }
  }

  return { total, byAlignment, mafiaTeam, errors, warnings };
}
