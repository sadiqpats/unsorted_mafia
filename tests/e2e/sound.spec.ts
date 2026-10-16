import { expect, test, type Page } from '@playwright/test';
import { advanceTo, nightAct, revealAndAck, setupTable, skipRest } from './helpers';

const cues = (p: Page) => p.evaluate(() => [...((window as any).__unsortedSound?.log ?? [])] as string[]);
const musicOn = (p: Page) => p.evaluate(() => !!(window as any).__unsortedMusic?.playing);

test('online game: suspense music at Night on every phone, a kill sound for everyone, music stops for the Day; the dead see every update', async ({ browser }) => {
  const t = await setupTable(browser, 5, { mafia: 1, doctor: 1, villager: 3 }, async (host) => {
    await host.getByRole('radio', { name: /Online/ }).click();
    await expect(host.getByRole('radio', { name: /Online/ })).toHaveAttribute('aria-checked', 'true');
  });
  for (const s of t.seats) await revealAndAck(s);
  await expect(t.host.getByTestId('host-phase')).toHaveText('Night');
  const [victim, watcher] = t.byRole('Villager');
  await expect.poll(() => cues(watcher.page)).toContain('night');
  await expect.poll(() => musicOn(watcher.page), { timeout: 15_000 }).toBe(true);
  await nightAct(t.byRole('Mafia')[0], 'mafia_kill', victim.name);
  await skipRest(t, new Set([t.byRole('Mafia')[0].name]));
  await expect(t.host.getByTestId('host-phase')).toHaveText('Day');
  // The reveal: music fades, tension builds, the kill lands — on every phone.
  await expect.poll(() => musicOn(watcher.page)).toBe(false);
  for (const s of [watcher, victim]) await expect.poll(() => cues(s.page), { timeout: 15_000 }).toEqual(expect.arrayContaining(['riser', 'kill']));
  // Next night: the dead player still gets the news and the running commentary.
  await advanceTo(t, 'Night');
  await expect(victim.page.getByTestId('phase-news')).toContainText('could not agree');
  await expect(victim.page.getByText('The living are making their moves…')).toBeVisible();
  await expect(victim.page.locator('section', { hasText: 'Announcements' })).toContainText(`${victim.name} was killed`); // earlier news stays in the list
  await expect.poll(() => musicOn(victim.page), { timeout: 15_000 }).toBe(true);
});

test('offline game (default): player phones stay silent and play no music; the host device carries the sounds', async ({ browser }) => {
  const t = await setupTable(browser, 5, { mafia: 1, doctor: 1, villager: 3 });
  await expect(t.host.getByRole('radio', { name: /Together/ })).toHaveCount(0); // lobby is over; rules locked
  for (const s of t.seats) await revealAndAck(s);
  await expect(t.host.getByTestId('host-phase')).toHaveText('Night');
  const [victim, watcher] = t.byRole('Villager');
  await nightAct(t.byRole('Mafia')[0], 'mafia_kill', victim.name);
  await skipRest(t, new Set([t.byRole('Mafia')[0].name]));
  await expect(t.host.getByTestId('host-phase')).toHaveText('Day');
  await expect.poll(() => cues(t.host), { timeout: 15_000 }).toEqual(expect.arrayContaining(['night', 'kill']));
  await t.host.waitForTimeout(500);
  expect(await cues(watcher.page)).toEqual([]);
  expect(await musicOn(watcher.page)).toBe(false);
  expect(await musicOn(t.host)).toBe(false);
});
