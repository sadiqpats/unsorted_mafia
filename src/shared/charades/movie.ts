/** A card in the Dumb Charades deck. */
export interface Movie {
  id: string;
  title: string;
  year: number;
  genre: string;
  leads: string[];
  /** 1 = everyone knows it, 2 = well known, 3 = for film buffs. */
  tier: 1 | 2 | 3;
}

export const MIN_YEAR = 2000;
export const MAX_WORDS = 4;

/** Lower-case, no punctuation or extra spaces: "Jab We Met!" → "jab we met". */
export function normalizeTitle(t: string): string {
  return t
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Words as the actor would count them on their fingers ("Munna Bhai M.B.B.S." = 3). */
export function wordCount(t: string): number {
  return t
    .replace(/[–—:!?,]/g, ' ')
    .replace(/\.{2,}|…/g, ' ')
    .split(/\s+/)
    .filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

export const slug = (t: string) => normalizeTitle(t).replace(/ /g, '-');
