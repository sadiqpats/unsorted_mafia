import { MAX_WORDS, MIN_YEAR, normalizeTitle, slug, wordCount, type Movie } from '../../shared/charades/movie';
import d2000 from './data/2000s';
import d2008 from './data/2008s';
import d2014 from './data/2014s';
import d2020 from './data/2020s';
import extras from './data/extras';
import extras2 from './data/extras2';

/**
 * The Bollywood deck: famous Hindi films released in 2000 or later whose titles
 * are at most four words. It lives only on the server, so a phone never holds
 * the deck (or the next card).
 */
function parse(...sources: string[]): Movie[] {
  const seen = new Set<string>();
  const out: Movie[] = [];
  for (const src of sources) {
    for (const raw of src.split('\n')) {
      const line = raw.trim();
      if (!line || line.startsWith('//')) continue;
      const [title, year, genre, leads, tier] = line.split('|');
      const y = Number(year);
      const key = normalizeTitle(title);
      if (!title || !y || y < MIN_YEAR || wordCount(title) > MAX_WORDS || seen.has(key)) continue;
      seen.add(key);
      out.push({ id: slug(title), title: title.trim(), year: y, genre: genre.trim(), leads: leads.split(';').map((s) => s.trim()).filter(Boolean), tier: (Number(tier) || 2) as Movie['tier'] });
    }
  }
  return out;
}

export const MOVIES: Movie[] = parse(d2000, d2008, d2014, d2020, extras, extras2);
export const MOVIE_BY_ID = new Map(MOVIES.map((m) => [m.id, m]));
export const MOVIE_BY_TITLE = new Map(MOVIES.map((m) => [normalizeTitle(m.title), m]));
