/**
 * How many imposters a Draw the Imposter round gets.
 *
 * Two ways to decide:
 * - "choose": the host picks before each round — 1 to 5, "all but one" (one lonely person knows
 *   the word), or "everyone".
 * - "auto": an escalating pattern that repeats. 1 imposter, then 2, then (on a longer run) 3 or 4,
 *   and the last round of the run is a twist — everyone is the imposter, or all but one. A run is
 *   3 or 4 rounds long, picked at random, so nobody can count on when the twist comes.
 */

export type Pick = 1 | 2 | 3 | 4 | 5 | 'allButOne' | 'all';
export const PICKS: Pick[] = [1, 2, 3, 4, 5, 'allButOne', 'all'];

export type Auto = { step: number; len: 3 | 4 };
export const freshAuto = (rand: () => number = Math.random): Auto => ({ step: 0, len: rand() < 0.5 ? 3 : 4 });

/** This round's pick in the auto pattern, and the pattern's state for the round after. */
export function autoPick(a: Auto, rand: () => number = Math.random): { pick: Pick; next: Auto } {
  const last = a.step >= a.len - 1;
  let pick: Pick;
  if (last) pick = rand() < 0.5 ? 'all' : 'allButOne';
  else if (a.step === 0) pick = 1;
  else if (a.step === 1) pick = 2;
  else pick = rand() < 0.5 ? 3 : 4;
  return { pick, next: last ? freshAuto(rand) : { step: a.step + 1, len: a.len } };
}

/** Turn a pick into a real number for this table: always at least one imposter, and a number pick never makes everyone (or nobody) an imposter. */
export function imposterCount(pick: Pick, players: number): number {
  if (pick === 'all') return players;
  if (pick === 'allButOne') return Math.max(1, players - 1);
  return Math.max(1, Math.min(pick, players - 1));
}

/** Can this pick happen at this table (a 5-imposter pick needs at least 6 players)? */
export const pickFits = (pick: Pick, players: number) => typeof pick !== 'number' || pick <= players - 1;

export const pickLabel = (pick: Pick) => (pick === 'all' ? 'Everyone' : pick === 'allButOne' ? 'All but 1' : String(pick));
