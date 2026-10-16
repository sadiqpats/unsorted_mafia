/**
 * Dev tool: checks every card in the deck against Wikidata (free, no key).
 * For each title it looks for a film whose label matches, and reports:
 *   missing   – no matching film found
 *   year      – Wikidata's release year differs from ours
 *   language  – found, but not a Hindi-language film
 * Usage: npx tsx scripts/verify-movies.ts [--json out.json]
 */
import { writeFileSync } from 'node:fs';
import { MOVIES } from '../src/server/charades/movies';
import { lookupFilm } from '../src/server/charades/wikidata';

const out: { title: string; year: number; issue: string; detail?: string }[] = [];
let done = 0;
const queue = [...MOVIES];
async function worker() {
  for (let m = queue.shift(); m; m = queue.shift()) {
    try {
      let r: Awaited<ReturnType<typeof lookupFilm>> = null;
      for (let attempt = 0; ; attempt++) {
        try {
          r = await lookupFilm(m.title, { yearHint: m.year, timeoutMs: 20000 });
          break;
        } catch (e: any) {
          if (!e?.retryAfter || attempt > 6) throw e;
          await new Promise((res) => setTimeout(res, e.retryAfter * 1000));
        }
      }
      await new Promise((res) => setTimeout(res, 250));
      if (!r) out.push({ title: m.title, year: m.year, issue: 'missing' });
      else if (!r.hindi) out.push({ title: m.title, year: m.year, issue: 'language', detail: `${r.label} (${r.year}) ${r.id}` });
      else if (r.year && Math.abs(r.year - m.year) >= 1) out.push({ title: m.title, year: m.year, issue: 'year', detail: `${r.label} → ${r.year} ${r.id}` });
    } catch (e) {
      out.push({ title: m.title, year: m.year, issue: 'error', detail: String(e) });
    }
    if (++done % 100 === 0) console.error(`${done}/${MOVIES.length}`);
  }
}
await Promise.all(Array.from({ length: 2 }, worker));
const json = process.argv.indexOf('--json');
if (json > 0) writeFileSync(process.argv[json + 1], JSON.stringify(out, null, 1));
console.log(`${MOVIES.length} checked, ${out.length} flagged`);
for (const i of ['missing', 'language', 'year', 'error']) {
  const xs = out.filter((o) => o.issue === i);
  if (xs.length) console.log(`\n${i.toUpperCase()} (${xs.length})\n` + xs.map((x) => `  ${x.title} [${x.year}] ${x.detail ?? ''}`).join('\n'));
}
