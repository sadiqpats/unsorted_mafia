import { expect, test, type Page } from '@playwright/test';
import { advanceTo, closeMoment, newPhone, nightAct, revealAndAck, setupTable, skipRest, vote } from './helpers';

/** Set SHOTS_DIR to keep a screenshot of each screen. */
const D = process.env.SHOTS_DIR;
const shot = async (p: Page, n: string) => {
  if (D) await p.screenshot({ path: `${D}/${n}.png` });
};
/** Everything on the big moment is inside the screen (nothing cut off at the top or bottom). */
async function fits(p: Page, tag: string) {
  const m = await p.evaluate(() => {
    const ids = ['.moments-title', '[data-testid="vote-count"]', '[data-testid="moment-card"]', '[data-testid="mafia-count"]'];
    return ids.map((s) => {
      const el = document.querySelector(s);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { s, top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right) };
    }).filter(Boolean) as { s: string; top: number; bottom: number; left: number; right: number }[];
  });
  const { width: w, height: h } = p.viewportSize()!;
  for (const r of m) {
    expect(r.top, `${tag}: ${r.s} cut off at the top`).toBeGreaterThanOrEqual(-1);
    expect(r.bottom, `${tag}: ${r.s} cut off at the bottom`).toBeLessThanOrEqual(h + 1);
    expect(r.left, `${tag}: ${r.s} cut off on the left`).toBeGreaterThanOrEqual(-1);
    expect(r.right, `${tag}: ${r.s} cut off on the right`).toBeLessThanOrEqual(w + 1);
  }
}

test('TV: after an even round the vote count, the voted-out card and the Mafia count all fit one screen', async ({ browser }) => {
  test.setTimeout(600_000);
  const t = await setupTable(browser, 8, { mafia: 2, godfather: 1, doctor: 1, detective: 1, villager: 3 }, async (h) => {
    const pause = h.getByLabel('Pause after the vote (seconds)');
    await pause.fill('15');
    await pause.press('Enter');
    await expect(pause).toHaveValue('15');
  });
  const tv = await newPhone(browser);
  await tv.setViewportSize({ width: 1280, height: 720 });
  await tv.goto(`/tv/${t.code}`);
  for (const s of t.seats) await revealAndAck(s);
  const [m1, m2] = t.byRole('Mafia');
  const vills = t.byRole('Villager');
  const det = t.byRole('Detective')[0];
  // Round 1: a quiet night, nobody voted out.
  await advanceTo(t, 'Night');
  await skipRest(t, new Set());
  await expect(t.host.getByTestId('host-phase')).toHaveText('Day', { timeout: 60_000 });
  for (const s of t.seats) await closeMoment(s.page);
  await advanceTo(t, 'Vote');
  for (const s of await t.alive()) await vote(s, null);
  // Round 2: the Mafia kill a villager, then the town votes out a Mafia member → count + card.
  await expect(t.host.getByTestId('host-phase')).toHaveText('Night', { timeout: 60_000 });
  await nightAct(m1, 'mafia_kill', vills[0].name);
  await nightAct(m2, 'mafia_kill', vills[0].name);
  await skipRest(t, new Set([m1.name, m2.name]));
  await expect(t.host.getByTestId('host-phase')).toHaveText('Day', { timeout: 60_000 });
  await tv.waitForTimeout(4000);
  await shot(tv, 'tv-1280-morning');
  await fits(tv, 'morning');
  for (const s of t.seats) await closeMoment(s.page);
  await advanceTo(t, 'Vote');
  const alive = await t.alive();
  for (const [i, s] of alive.entries()) await vote(s, s === m1 ? det.name : i % 3 === 2 ? vills[1].name : m1.name);
  await expect(tv.getByTestId('mafia-count')).toBeVisible({ timeout: 30_000 });
  await tv.waitForTimeout(5500); // every part has landed
  for (const [w, h] of [[1280, 720], [1920, 1080], [1366, 768], [960, 540]] as const) {
    await tv.setViewportSize({ width: w, height: h });
    await tv.waitForTimeout(400);
    await shot(tv, `tv-${w}-count`);
    await fits(tv, `${w}x${h}`);
  }
  await shot(det.page, 'phone-count');
});
