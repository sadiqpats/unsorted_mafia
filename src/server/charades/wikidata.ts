import { normalizeTitle } from '../../shared/charades/movie';

/**
 * Wikidata lookups (free, no API key). Used to check a movie the other team
 * types in: is it a real Hindi-language film, and when was it released?
 */
const API = 'https://www.wikidata.org/w/api.php';
const UA = 'UnsortedGameNight/1.0 (https://unsortedmafia.vercel.app; party game)';

const FILM_TYPES = new Set(['Q11424', 'Q24869', 'Q202866', 'Q229390', 'Q506240', 'Q1054574', 'Q130232', 'Q157443', 'Q24862', 'Q17013749']);
const HINDI = 'Q1568';

export interface FilmHit {
  id: string;
  label: string;
  year: number | null;
  hindi: boolean;
  castIds: string[];
  genreIds: string[];
}

type Fetch = typeof fetch;
interface Opts {
  yearHint?: number;
  timeoutMs?: number;
  fetchImpl?: Fetch;
}

async function getJson(url: string, opts: Opts): Promise<any> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), opts.timeoutMs ?? 5000);
  try {
    const res = await (opts.fetchImpl ?? fetch)(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: ctl.signal });
    if (res.status === 429) throw Object.assign(new Error('wikidata busy'), { retryAfter: Number(res.headers.get('retry-after')) || 5 });
    if (!res.ok) throw new Error(`wikidata ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

const ids = (claims: any, prop: string): string[] => (claims?.[prop] ?? []).map((c: any) => c?.mainsnak?.datavalue?.value?.id).filter(Boolean);
const years = (claims: any): number[] =>
  (claims?.P577 ?? [])
    .map((c: any) => Number(String(c?.mainsnak?.datavalue?.value?.time ?? '').slice(1, 5)))
    .filter((y: number) => y > 1800);

/** Does a Wikidata label / alias name this title? ("Gadar: Ek Prem Katha" also answers to "Gadar".) */
function names(label: string, want: string): boolean {
  const l = normalizeTitle(label.replace(/\(.*?\)/g, ''));
  if (l === want) return true;
  const head = normalizeTitle(label.split(/[:–—]/)[0]);
  return head === want;
}

/** Find the Hindi film a title most likely refers to. Returns null when nothing matches. */
export async function lookupFilm(title: string, opts: Opts = {}): Promise<FilmHit | null> {
  const want = normalizeTitle(title);
  if (!want) return null;
  // Full-text search restricted to Hindi-language works finds short titles ("Black", "Gadar")
  // that a plain label search buries under people and places.
  const q = `${title.replace(/[^\p{L}\p{N}\s'.-]/gu, ' ')} haswbstatement:P364=${HINDI}`;
  const search = await getJson(`${API}?action=query&list=search&format=json&srnamespace=0&srlimit=12&srsearch=${encodeURIComponent(q)}`, opts);
  const cands: string[] = (search?.query?.search ?? []).map((s: any) => String(s.title)).filter((t: string) => /^Q\d+$/.test(t));
  if (!cands.length) return null;
  const ents = await getJson(`${API}?action=wbgetentities&format=json&props=claims|labels|aliases&languages=en&ids=${cands.join('|')}`, opts);
  const hits: FilmHit[] = [];
  for (const id of cands) {
    const e = ents?.entities?.[id];
    if (!e) continue;
    const types = ids(e.claims, 'P31');
    if (!types.some((t) => FILM_TYPES.has(t))) continue;
    const label = e.labels?.en?.value ?? '';
    const aliases: string[] = (e.aliases?.en ?? []).map((a: any) => a.value);
    if (!names(label, want) && !aliases.some((a) => names(a, want))) continue;
    const langs = [...ids(e.claims, 'P364'), ...ids(e.claims, 'P407')];
    const ys = years(e.claims);
    hits.push({ id, label: label || title, year: ys.length ? Math.min(...ys) : null, hindi: langs.includes(HINDI), castIds: ids(e.claims, 'P161').slice(0, 3), genreIds: ids(e.claims, 'P136').slice(0, 2) });
  }
  if (!hits.length) return null;
  const hint = opts.yearHint;
  hits.sort((a, b) => {
    if (hint) return Math.abs((a.year ?? 0) - hint) - Math.abs((b.year ?? 0) - hint);
    // No hint: prefer the most recent film (remakes share names with older films).
    return (b.year ?? 0) - (a.year ?? 0);
  });
  return hits[0];
}

/** English labels for a handful of Wikidata ids (cast, genres). */
export async function labels(idList: string[], opts: Opts = {}): Promise<Record<string, string>> {
  if (!idList.length) return {};
  const ents = await getJson(`${API}?action=wbgetentities&format=json&props=labels&languages=en&ids=${idList.join('|')}`, opts);
  const out: Record<string, string> = {};
  for (const id of idList) {
    const l = ents?.entities?.[id]?.labels?.en?.value;
    if (l) out[id] = l;
  }
  return out;
}
