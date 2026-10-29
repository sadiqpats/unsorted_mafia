import { describe, expect, it } from 'vitest';
import { autoPick, freshAuto, imposterCount, pickFits, type Auto, type Pick } from '../../src/client/draw/imposters';
import { BOLLYWOOD, OBJECTS } from '../../src/client/draw/words';

/** Play n rounds of the auto pattern with a seeded coin. */
function run(n: number, coin: () => number): Pick[] {
  let a: Auto = freshAuto(coin);
  const out: Pick[] = [];
  for (let i = 0; i < n; i++) {
    const r = autoPick(a, coin);
    out.push(r.pick);
    a = r.next;
  }
  return out;
}

function seeded(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 2 ** 32;
    return seed / 2 ** 32;
  };
}

const STOP = new Set(['with', 'from', 'that', 'this', 'your']);

describe('Draw the Imposter: how many imposters', () => {
  it('auto pattern: 1, then 2, then maybe 3–4, then a twist (everyone / all but one), and again', () => {
    for (let seed = 1; seed < 200; seed++) {
      const picks = run(40, seeded(seed));
      let i = 0;
      while (i < picks.length) {
        expect(picks[i]).toBe(1);
        if (i + 1 >= picks.length) break;
        expect(picks[i + 1]).toBe(2);
        if (i + 2 >= picks.length) break;
        const third = picks[i + 2];
        if (third === 3 || third === 4) {
          if (i + 3 >= picks.length) break;
          expect(['all', 'allButOne']).toContain(picks[i + 3]);
          i += 4;
        } else {
          expect(['all', 'allButOne']).toContain(third);
          i += 3;
        }
      }
    }
  });

  it('auto pattern: both run lengths and both twists happen', () => {
    const picks = run(400, seeded(7));
    expect(picks).toContain(3);
    expect(picks).toContain(4);
    expect(picks).toContain('all');
    expect(picks).toContain('allButOne');
  });

  it('counts fit the table: at least one imposter, a number never makes everyone the imposter', () => {
    expect(imposterCount(1, 3)).toBe(1);
    expect(imposterCount(4, 3)).toBe(2);
    expect(imposterCount(5, 8)).toBe(5);
    expect(imposterCount('all', 6)).toBe(6);
    expect(imposterCount('allButOne', 6)).toBe(5);
    expect(imposterCount('allButOne', 3)).toBe(2);
    expect(pickFits(5, 5)).toBe(false);
    expect(pickFits(5, 6)).toBe(true);
    expect(pickFits('all', 3)).toBe(true);
  });

  it('every card has a word and a hint, no duplicates, and the hint never gives the word away', () => {
    for (const deck of [BOLLYWOOD, OBJECTS]) {
      expect(deck.length).toBeGreaterThanOrEqual(40);
      expect(new Set(deck.map((c) => c.w)).size).toBe(deck.length);
      for (const c of deck) {
        expect(c.w.trim()).not.toBe('');
        expect(c.hint.trim()).not.toBe('');
        // No meaningful word of the answer (4+ letters) appears in its hint.
        for (const part of c.w.toLowerCase().split(/[^a-z]+/).filter((x) => x.length >= 4 && !STOP.has(x))) expect(c.hint.toLowerCase()).not.toContain(part);
      }
    }
  });
});
