import { expect, test, type Page } from '@playwright/test';
import { advanceTo, createRoom, joinRoom, newPhone, revealAndAck, setupTable, skipRest } from './helpers';
/** Set SHOTS_DIR to save a screenshot of every screen size. */
const D = process.env.SHOTS_DIR;
const SIZES = [[1280, 720], [1920, 1080], [960, 540], [1366, 768]] as const;
async function check(tv: Page, tag: string) {
  for (const [w, h] of SIZES) {
    await tv.setViewportSize({ width: w, height: h });
    await tv.waitForTimeout(400);
    const m = await tv.evaluate(() => {
      const wall = document.querySelector('[data-testid="tv-wall"] ul');
      const lis = [...document.querySelectorAll('[data-testid="tv-wall"] li')].map((e) => e.getBoundingClientRect());
      const r = lis.length ? { bottom: Math.max(...lis.map((x) => x.bottom)), right: Math.max(...lis.map((x) => x.right)) } : null;
      return { sh: document.documentElement.scrollHeight, ih: innerHeight, wallBottom: r ? Math.round(r.bottom) : null, wallRight: r ? Math.round(r.right) : null, iw: innerWidth };
    });
    if (D) await tv.screenshot({ path: `${D}/${tag}-${w}.png` });
    expect(m.sh, `${tag} ${w}x${h} page scrolls`).toBeLessThanOrEqual(m.ih + 1);
    if (m.wallRight !== null) expect(m.wallRight, `${tag} ${w}x${h} faces cut off right`).toBeLessThanOrEqual(m.iw);
    if (m.wallBottom !== null) expect(m.wallBottom, `${tag} ${w}x${h} faces cut off`).toBeLessThanOrEqual(m.ih);
  }
}
// The TV stays still all evening: every screen must fit one 16:9 screen — no scrolling, no face cut off.
test('TV fits one screen: a full 26-player lobby on 720p, 768p, 1080p and small 960×540 TVs', async ({ browser }) => {
  const { host, code } = await createRoom(browser, 26);
  const tv = await newPhone(browser);
  await tv.goto(`/tv/${code}`);
  for (let i = 1; i <= 26; i++) await joinRoom(browser, code, `Player ${i}`);
  await expect(tv.getByText('26 / 26 players')).toBeVisible();
  await check(tv, 'lobby26');
});
test('TV fits one screen through Night, Day and the game-over reveal (12 players, Bollywood)', async ({ browser }) => {
  const t = await setupTable(browser, 12, { mafia: 2, godfather: 1, doctor: 1, detective: 1, villager: 7 }, async (h) => { await h.getByLabel('Bollywood Mafia Night').click(); });
  const tv = await newPhone(browser);
  await tv.goto(`/tv/${t.code}`);
  for (const s of t.seats) await revealAndAck(s);
  await advanceTo(t, 'Night');
  await tv.waitForTimeout(2500);
  await check(tv, 'night12');
  await skipRest(t, new Set());
  await expect(t.host.getByTestId('host-phase')).toHaveText('Day', { timeout: 60_000 });
  await tv.waitForTimeout(2500);
  await check(tv, 'day12');
  await t.host.getByRole('button', { name: 'End game' }).click();
  const confirm = t.host.getByRole('button', { name: /End game|Yes/ }).last();
  if (await confirm.isVisible()) await confirm.click();
  await expect(tv.getByTestId('tv-reveal')).toBeVisible({ timeout: 20_000 });
  await tv.waitForTimeout(9000);
  await check(tv, 'over12');
});
