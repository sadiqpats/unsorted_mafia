import type { EventTag } from '../../shared/types';

/** Events big enough to deserve a tension build before they are revealed. */
const DRAMATIC = new Set<EventTag>(['kill', 'revive', 'voteout', 'joker', 'win-town', 'win-mafia', 'win-other', 'removed']);

/**
 * When each news line of a fresh phase appears (seconds after the phase starts).
 * The sound design uses the same times, so every reveal lands with its sound.
 */
export function revealPlan(entries: { tag?: EventTag }[]) {
  const dramatic = entries.some((e) => e.tag && DRAMATIC.has(e.tag));
  const first = dramatic ? 2.0 : 1.0;
  return { dramatic, at: (i: number) => first + i * 1.6, end: first + Math.max(0, entries.length - 1) * 1.6 + 1.4 };
}
